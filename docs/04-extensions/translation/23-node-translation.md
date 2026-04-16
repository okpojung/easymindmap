# 23. Node Translation
## NODE_TRANSLATION

* 문서 버전: v1.0
* 작성일: 2026-04-16
* 참조: `docs/01-product/functional-spec.md § TRANSLATION`, `docs/02-domain/db-schema.md § node_translations`

---

### 1. 기능 목적

* 협업·공유 맵을 열 때 **각 노드 텍스트를 열람자 언어로 자동 번역** 표시하는 기능 (V2)
* 번역 결과를 캐시하여 API 비용 절감 및 응답 속도 향상
* 원문 변경 시 자동 재번역, 원문 ↔ 번역본 토글로 신뢰성 확보

---

### 2. 기능 범위

* 포함:
  * 자동 번역 (TRANS-01)
  * 번역 캐시 (TRANS-02)
  * 캐시 무효화 (TRANS-03)
  * Skeleton UI (TRANS-04)
  * 원문 토글 (TRANS-05)
  * 맵 오픈 시 배치 번역 (TRANS-06)
  * 번역 완료 Broadcast (TRANS-07)

* 제외:
  * 채팅 메시지 번역 (→ `24-chat-translation.md`)
  * Note 필드 번역 (후순위)
  * 정규식 기반 번역 제외 규칙

---

### 3. 세부 기능 목록

| 기능ID     | 기능명                   | 설명                            | 주요 동작              |
| -------- | --------------------- | ----------------------------- | ------------------ |
| TRANS-01 | Auto Translate        | 노드 텍스트를 열람자 언어로 자동 번역         | 맵 로딩 시 트리거         |
| TRANS-02 | Translation Cache     | 번역 결과 DB 캐시 저장 및 재사용          | DB 조회 우선           |
| TRANS-03 | Cache Invalidation    | 원문 변경 시 text_hash 비교 → 재번역   | text_hash 검증       |
| TRANS-04 | Skeleton UI           | 번역 대기 중 Skeleton 표시           | 로딩 상태 표시           |
| TRANS-05 | Original Toggle       | 번역본 ↔ 원문 토글 버튼               | 노드 클릭 또는 설정        |
| TRANS-06 | Batch Translate       | 맵 오픈 시 미캐시 노드 배치 번역           | POST /translate/batch |
| TRANS-07 | Translation Broadcast | 번역 완료 시 WebSocket으로 열람자 업데이트  | Supabase Realtime  |

---

### 4. 기능 정의 (What)

#### 4.1 node_translations 테이블

```sql
CREATE TABLE public.node_translations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id           UUID NOT NULL REFERENCES public.nodes(id) ON DELETE CASCADE,
  target_lang       VARCHAR(20) NOT NULL,
  translated_text   TEXT NOT NULL,
  source_text_hash  VARCHAR(128) NOT NULL,
  model_version     VARCHAR(60),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (node_id, target_lang)
);
```

#### 4.2 nodes 번역 관련 컬럼

```sql
-- nodes 테이블 번역 컬럼
text_lang                 VARCHAR(20),   -- 원문 언어 코드 (ISO 639-1)
text_hash                 VARCHAR(128),  -- 원문 해시 (캐시 유효성 검증)
translation_mode          VARCHAR(20)  NOT NULL DEFAULT 'auto',
  -- 'auto': 시스템 자동 번역
  -- 'manual': 사용자 직접 지정
translation_override      VARCHAR(20),
  -- null: 정책 따름
  -- 'force_on': 강제 번역 표시
  -- 'force_off': 번역 비활성화
author_preferred_language VARCHAR(10),   -- 작성자 선호 언어
```

#### 4.3 번역 정책 3단계 (우선순위 순)

```
1. node.translation_override (force_on | force_off)
2. map.translation_policy_json
   예: {"mode":"off"} | {"allowedTargetLanguages":["ko","ja"]}
3. user.preferred_language + user.secondary_languages
```

#### 4.4 번역 엔진

| 우선순위 | 엔진             | 용도                         |
| :--: | -------------- | -------------------------- |
| 1차   | DeepL API      | 주요 언어 번역 (품질 우수, 비용 저렴)     |
| 2차   | LLM (GPT 등)   | DeepL 미지원 언어, 전문 용어 처리     |

#### 4.5 번역 트리거 시점

| 시점           | 트리거 | 이유          |
| ------------ | :--: | ----------- |
| 타이핑 중        | ❌    | API 비용 방지   |
| Enter / blur | ✅    | 최종 텍스트 확정 시 |
| 맵 오픈 시       | ✅    | 배치 번역       |

---

### 5. 동작 방식 (How)

#### 5.1 사용자 동작

* 맵 오픈 → 열람자 언어로 노드 텍스트 자동 표시
* 번역 중: Skeleton UI (흐린 회색 블록)
* 번역 완료: 노드 텍스트 교체 (부드러운 fade-in)
* 노드 우하단 `[원문]` 버튼 → 원문 텍스트 토글
* 번역 인디케이터 아이콘으로 번역 상태 확인

#### 5.2 배치 번역 흐름 (맵 오픈)

```
맵 오픈 (GET /maps/{mapId}/document)
    │
    ▼
미캐시 노드 목록 추출 (text_hash 비교)
    │
    ▼
POST /translate/batch
  { nodes: [{ nodeId, text, targetLang }] }
    │
    ▼
DeepL API 호출 (청크 단위, 50개씩)
    │
    ▼
node_translations UPSERT
    │
    ▼
WebSocket Broadcast → 모든 열람자 갱신
```

#### 5.3 캐시 유효성 검증

```typescript
// 원문 변경 감지
const hash = SHA256(node.text).substring(0, 128);
if (hash !== node.text_hash) {
  // 캐시 무효화 → 재번역 트리거
  await invalidateTranslationCache(nodeId);
  await triggerRetranslation(nodeId);
}
```

---

### 6. 규칙 (Rule)

* 영어 원문 + 사용자가 영어권(`skip_english_translation = true`) → 번역 건너뜀
* 번역 언어: `users.secondary_languages` 최대 3개
* 배치 번역 청크 크기: 50 nodes/request
* text_hash 알고리즘: SHA-256 (128자 substring)
* 번역 결과는 `node_translations` 테이블에 영구 캐시
* `translation_mode = 'manual'` 노드: 자동 번역 생략

---

### 7. 예외 / 경계 (Edge Case)

* **DeepL API 실패**: LLM Fallback 시도 → 모두 실패 시 원문 표시
* **지원 언어 외 요청**: 원문 그대로 표시
* **빈 텍스트 노드**: 번역 생략
* **초단문(1~2자)**: 번역 생략, 원문 우선 (`Short Message Guard`)

---

### 8. 권한 규칙

| 역할      | 번역 조회 | 번역 강제 on/off |
| ------- | ----- | ------------ |
| creator | ✅     | ✅            |
| editor  | ✅     | ✅            |
| viewer  | ✅     | ❌            |

---

### 9. DB 영향

* `node_translations` — 번역 결과 캐시
* `nodes.text_hash` — 원문 변경 감지
* `nodes.translation_mode`, `translation_override` — 노드별 번역 정책
* `users.secondary_languages`, `skip_english_translation` — 사용자 번역 설정

---

### 10. API 영향

* `POST /translate/batch` — 배치 번역 요청
* `POST /nodes/{nodeId}/translate` — 단일 노드 번역
* `DELETE /nodes/{nodeId}/translations/{lang}` — 번역 캐시 무효화
* `PATCH /nodes/{nodeId}/translation-mode` — 번역 모드 변경

---

### 11. 연관 기능

* CHAT_TRANSLATION (`24-chat-translation.md`)
* COLLABORATION (`25-map-collaboration.md`)
* NODE_EDITING (`docs/03-editor-core/node/02-node-editing.md`)

---

### 12. 구현 우선순위

#### MVP (V2)
* TRANS-01 자동 번역
* TRANS-02 번역 캐시
* TRANS-03 캐시 무효화
* TRANS-04 Skeleton UI
* TRANS-06 배치 번역

#### 2단계 (V2)
* TRANS-05 원문 토글
* TRANS-07 번역 Broadcast
* translation_override 설정 UI
