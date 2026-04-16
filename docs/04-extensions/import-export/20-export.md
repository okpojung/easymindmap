# 20. Export
## EXPORT

* 문서 버전: v1.0
* 작성일: 2026-04-16
* 참조: `docs/01-product/functional-spec.md § EXPORT`, `docs/02-domain/db-schema.md § exports`

---

### 1. 기능 목적

* 마인드맵을 **Markdown 또는 Standalone HTML 파일로 내보내는** 기능
* 외부 도구(Obsidian, Notion, VS Code 등)와의 연동 및 공유 용이성 제공
* Background Job 패턴으로 대형 맵도 안정적으로 내보내기 처리

---

### 2. 기능 범위

* 포함:
  * Markdown 내보내기 (EXPORT-01)
  * Standalone HTML 내보내기 (EXPORT-02)
  * 내보내기 진행 상태 표시
  * 완료 후 파일 다운로드

* 제외:
  * PDF 내보내기 (후순위)
  * PNG/SVG 이미지 내보내기 (후순위)
  * 가져오기 (→ `21-import.md`)

---

### 3. 세부 기능 목록

| 기능ID      | 기능명              | 설명                         | 주요 동작           |
| --------- | ---------------- | -------------------------- | --------------- |
| EXPORT-01 | Export Markdown  | 노드 트리를 Markdown 아웃라인으로 변환  | 파일 다운로드         |
| EXPORT-02 | Export HTML      | 맵 구조를 Standalone HTML로 내보내기 | 파일 다운로드         |

---

### 4. 기능 정의 (What)

#### 4.1 exports 테이블

```sql
CREATE TABLE public.exports (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  map_id        UUID NOT NULL REFERENCES public.maps(id) ON DELETE CASCADE,
  user_id       UUID REFERENCES public.users(id),
  format        VARCHAR(20) NOT NULL,  -- 'markdown' | 'html'
  status        VARCHAR(20) NOT NULL DEFAULT 'pending',
                -- 'pending' | 'processing' | 'done' | 'error'
  storage_path  VARCHAR(500),          -- Supabase Storage 경로
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

#### 4.2 Markdown 변환 규칙

```text
Root 노드 → # 제목
  Depth 1  → ## 제목
    Depth 2  → ### 제목
      Depth 3  → #### 제목 (이하 동일)
  노드 note → 해당 헤딩 아래 paragraph로 포함
  태그     → 헤딩 옆 `[tag]` 형태로 inline 표기
```

예시 출력:

```markdown
# Linux 서버 구축

## 패키지 관리
### APT 업데이트
### Nginx 설치

## 보안 설정
### 방화벽 설정
### SSH 설정
```

#### 4.3 Standalone HTML 구조

* 외부 CDN 의존 없이 단일 HTML 파일로 동작
* 인라인 CSS + 인라인 JS 포함
* 노드 트리를 접을 수 있는 아코디언 형태로 렌더링
* 태그·메모 등 부가 정보 포함

---

### 5. 동작 방식 (How)

#### 5.1 사용자 동작

* 상단 메뉴 > `내보내기` > `Markdown` 또는 `HTML` 선택
* 내보내기 옵션 선택 (포함 범위: 전체 맵 / 선택 서브트리)
* `[내보내기]` 버튼 클릭 → 진행 상태 표시 (`Preparing...`)
* 완료 후 `[다운로드]` 버튼 표시 → 클릭하여 파일 저장

#### 5.2 시스템 처리 흐름

```
POST /maps/{mapId}/export { format: 'markdown' | 'html' }
    │
    ▼
exports INSERT (status: pending)
    │
    ▼
BullMQ Worker
  ├─ 노드 트리 로딩 (map_id 기준 전체 nodes 조회)
  ├─ Markdown/HTML 변환 처리
  └─ Supabase Storage 업로드
    │
    ▼
exports UPDATE (status: done, storage_path)
    │
    ▼
클라이언트 Polling 또는 WebSocket 알림
    │
    ▼
GET /exports/{exportId}/download → Signed URL 반환 → 파일 다운로드
```

#### 5.3 소형 맵 즉시 내보내기 (≤ 200 nodes)

* 노드 수가 200 이하인 경우 Background Job 없이 즉시 변환하여 반환
* Response Body에 파일 내용 직접 포함 (Content-Disposition: attachment)

---

### 6. 규칙 (Rule)

* 내보내기 파일은 Supabase Storage에 24시간 보관 후 자동 삭제
* Kanban 레이아웃 내보내기: 컬럼/카드 구조를 2단계 Markdown으로 변환
* 태그: Markdown에서 `[tagName]` 인라인 표기
* Node Note: 해당 헤딩 아래 들여쓰기 paragraph로 포함
* 빈 노드(text = '')는 `(빈 노드)` 로 표시

---

### 7. 예외 / 경계 (Edge Case)

* **1000+ 노드 대형 맵**: Background Job으로 처리, 완료 시 알림
* **내보내기 실패**: `status = 'error'` + 오류 메시지 표시 + 재시도 버튼
* **Storage 업로드 실패**: 재시도 3회 후 오류 처리
* **서브트리 내보내기**: 선택 노드 기준 하위 전체 포함

---

### 8. 권한 규칙

| 역할      | 내보내기 |
| ------- | ----- |
| creator | ✅     |
| editor  | ✅     |
| viewer  | ✅     |

---

### 9. DB 영향

* `exports` — 내보내기 작업 이력 관리

---

### 10. API 영향

* `POST /maps/{mapId}/export` — 내보내기 요청
* `GET /exports/{exportId}` — 작업 상태 조회
* `GET /exports/{exportId}/download` — Signed URL 발급

---

### 11. 연관 기능

* IMPORT (`21-import.md`)
* OBSIDIAN_INTEGRATION (`30-obsidian-integration.md`)

---

### 12. 구현 우선순위

#### MVP
* EXPORT-01 Markdown 내보내기 (즉시 방식, ≤ 200 nodes)
* EXPORT-02 HTML 내보내기 (즉시 방식)

#### 2단계
* Background Job 패턴 (대형 맵 지원)
* 서브트리 내보내기
* Supabase Storage 보관 + Signed URL 다운로드
