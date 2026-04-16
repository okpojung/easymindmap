# 24. Chat Translation
## CHAT_TRANSLATION

* 문서 버전: v1.0
* 작성일: 2026-04-16
* 참조: `docs/01-product/functional-spec.md § TRANSLATION TRANS-08~11`, `docs/04-extensions/collaboration/26-realtime-chat.md`

---

### 1. 기능 목적

* 협업 중 실시간 채팅 메시지를 **수신자 언어로 자동 번역하여 표시**하는 기능 (V2)
* 언어가 다른 협업자 간 소통 장벽 제거
* Language-group 캐시로 동일 메시지를 언어별 1회만 번역하여 비용 최적화

---

### 2. 기능 범위

* 포함:
  * 채팅 메시지 자동 번역 (TRANS-08)
  * Language-group 캐시 (TRANS-09)
  * Short Message Guard (TRANS-10)
  * 원문 + 번역문 동시 표시 (TRANS-11)

* 제외:
  * 노드 텍스트 번역 (→ `23-node-translation.md`)
  * 번역 결과 영구 저장 (채팅 번역은 세션 캐시만)

---

### 3. 세부 기능 목록

| 기능ID     | 기능명                     | 설명                                    | 주요 동작           |
| -------- | ----------------------- | --------------------------------------- | --------------- |
| TRANS-08 | Live Chat Translate     | 채팅 메시지를 수신자 언어로 실시간 번역                  | 수신 시 자동 번역      |
| TRANS-09 | Language-group Cache    | 동일 메시지를 targetLang별 1회만 번역 후 fan-out    | 번역 결과 공유        |
| TRANS-10 | Short Message Guard     | 매우 짧은 메시지는 번역 생략 또는 원문 우선 표시            | 5자 미만 생략        |
| TRANS-11 | Original + Translation  | 채팅에서 원문 + 번역문 동시 표시                    | 메시지 하단에 번역문 표시  |

---

### 4. 기능 정의 (What)

#### 4.1 chat_message_translations 캐시 구조

```typescript
// Redis 캐시 (세션 단위, 24시간 TTL)
type ChatTranslationCache = {
  messageId: string;
  originalText: string;
  translations: {
    [targetLang: string]: string;  // { 'ko': '안녕하세요', 'ja': 'こんにちは' }
  };
};
```

#### 4.2 채팅 메시지 표시 형태

```text
[Alice] 12:34
"Let's start with the database schema"
  번역: "데이터베이스 스키마부터 시작합시다"    ← 수신자 언어 번역문
```

#### 4.3 원문 + 번역문 토글

```text
[Alice] 12:34
"データベースのスキーマから始めましょう"
  번역: "데이터베이스 스키마부터 시작합시다"  [원문 숨기기]
```

#### 4.4 Language-group Fan-out 전략

```
수신된 채팅 메시지: "Let's discuss the timeline"
    │
    ▼
접속 협업자 언어 그룹 확인:
  ko: [User A, User C]
  ja: [User B]
    │
    ▼
번역 요청: ko 1회 + ja 1회 (중복 번역 방지)
    │
    ▼
번역 완료 → fan-out
  ko 번역 → User A, User C 전송
  ja 번역 → User B 전송
```

---

### 5. 동작 방식 (How)

#### 5.1 사용자 동작

* 채팅 창에서 메시지 수신
* 자신의 언어와 다른 언어의 메시지 → 자동 번역 표시 (메시지 하단 번역문)
* `[원문 보기]` 버튼 → 원문 표시
* `[번역 끄기]` → 전체 채팅 번역 비활성화

#### 5.2 채팅 메시지 번역 처리 흐름

```
채팅 메시지 수신 (WebSocket)
    │
    ▼
Short Message Guard 확인 (5자 미만 → 번역 생략)
    │
    ▼
캐시 조회 (Redis: messageId + targetLang)
  ├─ 캐시 HIT → 즉시 번역문 렌더링
  └─ 캐시 MISS
         │
         ▼
    번역 API 호출 (DeepL / LLM Fallback)
         │
         ▼
    Redis 캐시 저장 (TTL: 24h)
         │
         ▼
    같은 언어 그룹 협업자에게 fan-out
```

#### 5.3 언어 자동 감지

* 메시지 발신자의 `users.preferred_language` 참조
* 감지 실패 시 DeepL Language Detection API 사용
* 수신자 언어와 동일 → 번역 생략

---

### 6. 규칙 (Rule)

* Short Message Guard: 5자 미만 메시지 번역 생략
* Language-group Cache TTL: 24시간 (Redis)
* 번역 표시: 원문 + 번역문 동시 표시 (TRANS-11)
* 자신이 작성한 메시지: 번역 표시하지 않음 (본인 언어 기준)
* `users.preferred_language`가 메시지 언어와 동일: 번역 생략

---

### 7. 예외 / 경계 (Edge Case)

* **번역 API 실패**: 원문 그대로 표시 (번역 없음 표시 아이콘)
* **언어 감지 실패**: 원문 그대로 표시
* **초단문 (emoji, OK, ㅋ 등)**: Short Message Guard로 번역 생략
* **오프라인 수신자**: 재접속 시 최근 메시지 캐시 번역 제공

---

### 8. 권한 규칙

| 역할      | 채팅 번역 사용 |
| ------- | --------- |
| creator | ✅         |
| editor  | ✅         |
| viewer  | ✅ (읽기 한정) |

---

### 9. DB 영향

* `chat_messages` — 원문 저장 (번역문 미저장)
* Redis — 번역 캐시 (세션, 24시간 TTL)

---

### 10. API 영향

* `POST /translate/chat` — 채팅 메시지 번역 (내부 서버 간 호출)
* `GET /translate/chat/{messageId}/{targetLang}` — 캐시 조회

---

### 11. 연관 기능

* NODE_TRANSLATION (`23-node-translation.md`)
* REALTIME_CHAT (`26-realtime-chat.md`)
* COLLABORATION (`25-map-collaboration.md`)

---

### 12. 구현 우선순위

#### MVP (V2)
* TRANS-08 Live Chat Translate
* TRANS-10 Short Message Guard
* TRANS-11 원문 + 번역문 동시 표시

#### 2단계 (V2)
* TRANS-09 Language-group Cache (fan-out 최적화)
* 채팅 번역 on/off 설정
