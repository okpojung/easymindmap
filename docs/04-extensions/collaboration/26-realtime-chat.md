# 26. Realtime Chat
## REALTIME_CHAT

* 문서 버전: v1.0
* 작성일: 2026-04-16
* 참조: `docs/01-product/functional-spec.md § COLLAB`, `docs/04-extensions/collaboration/25-map-collaboration.md`

---

### 1. 기능 목적

* 협업 중 맵 내에서 **실시간 채팅으로 소통**하는 기능
* 맵 채널 채팅과 노드 스레드 댓글로 맥락에 맞는 소통 지원
* 채팅 메시지 자동 번역으로 다국어 협업자 간 소통 장벽 제거

---

### 2. 기능 범위

* 포함:
  * 맵 채널 채팅 (CHAT-01)
  * 메시지 전송/수신 (CHAT-02)
  * 채팅 이력 로딩 (CHAT-03)
  * 파일/이미지 첨부 (CHAT-04, 후순위)
  * @멘션 (CHAT-05)
  * 채팅 메시지 번역 연동 (→ `24-chat-translation.md`)

* 제외:
  * Node Thread (→ `25-map-collaboration.md` COLLAB-10~13)
  * 1:1 DM
  * 채팅 검색

---

### 3. 세부 기능 목록

| 기능ID    | 기능명          | 설명                          | 주요 동작           |
| ------- | ------------ | --------------------------- | --------------- |
| CHAT-01 | 맵 채팅 패널      | 우측 사이드바 채팅 패널 표시            | 패널 열기/닫기        |
| CHAT-02 | 메시지 전송       | 텍스트 메시지 전송                  | Enter 전송        |
| CHAT-03 | 이전 메시지 로딩    | 스크롤 업 시 이전 메시지 페이징 로딩       | Cursor pagination |
| CHAT-04 | 파일 첨부        | 이미지/파일 첨부 전송 (후순위)          | 파일 선택           |
| CHAT-05 | @멘션          | @이름으로 특정 협업자 알림             | 알림 전송           |

---

### 4. 기능 정의 (What)

#### 4.1 chat_messages 테이블

```sql
CREATE TABLE public.chat_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  map_id      UUID NOT NULL REFERENCES public.maps(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES public.users(id),
  content     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_chat_messages_map_id
  ON public.chat_messages(map_id, created_at DESC);
```

#### 4.2 채팅 패널 UI

```text
┌──────────────────────────────────┐
│  💬 채팅                          │
├──────────────────────────────────┤
│  [Alice] 12:34                   │
│  DB 스키마 검토 완료했어요           │
│    번역: DB schema review done    │
│                                  │
│  [Bob] 12:35                     │
│  @Alice 감사합니다!                │
│                                  │
│  [Charlie] 12:36                 │
│  다음 단계 진행할게요               │
├──────────────────────────────────┤
│  메시지 입력...         [ 전송 ]   │
└──────────────────────────────────┘
```

#### 4.3 메시지 구조

```typescript
interface ChatMessage {
  id: string;
  mapId: string;
  userId: string;
  displayName: string;
  avatarUrl?: string;
  content: string;
  createdAt: string;       // ISO 8601
  translation?: string;    // 수신자 언어 번역 (클라이언트 측, 저장 안 됨)
}
```

---

### 5. 동작 방식 (How)

#### 5.1 사용자 동작

* 우측 채팅 아이콘 클릭 → 채팅 패널 열기
* 텍스트 입력 후 Enter 또는 `[전송]` 버튼
* 타 협업자 메시지 수신 → 알림 뱃지 (패널 닫혀 있을 때)
* @이름 입력 → 자동완성 → 해당 협업자에게 알림

#### 5.2 메시지 전송/수신 흐름

```
메시지 입력 → Enter
    │
    ▼
POST /maps/{mapId}/chat/messages
  { content: "텍스트" }
    │
    ▼
chat_messages INSERT
    │
    ▼
Supabase Realtime Broadcast
  channel: `chat:map:{mapId}`
    │
    ▼
모든 접속 협업자 수신 → 채팅 패널 렌더링
    │
    ▼ (번역 처리)
CHAT_TRANSLATION 모듈 → 수신자 언어로 번역 후 표시
```

#### 5.3 이전 메시지 로딩 (페이지네이션)

```
GET /maps/{mapId}/chat/messages?before={cursor}&limit=50
    │
    ▼
chat_messages 조회 (created_at DESC, cursor 기준)
    │
    ▼
50개 단위 반환 → 스크롤 상단에 추가
```

---

### 6. 규칙 (Rule)

* 메시지 최대 길이: 2000자
* 이전 메시지 로딩: 50개/요청 (Cursor pagination)
* 채팅 이력: 맵 삭제 시 CASCADE 삭제
* @멘션: `@displayName` 형식, 알림 전송
* 패널 닫힌 상태에서 새 메시지 → 아이콘에 미읽음 뱃지 표시

---

### 7. 예외 / 경계 (Edge Case)

* **빈 메시지**: 전송 버튼/Enter 비활성화
* **메시지 길이 초과**: 2000자 입력 제한 (textarea maxLength)
* **네트워크 단절 중 전송**: 재연결 후 큐에서 전송 재시도
* **협업자 아닌 viewer**: 채팅 읽기만 가능, 전송 불가

---

### 8. 권한 규칙

| 역할      | 채팅 전송 | 채팅 읽기 |
| ------- | ----- | ----- |
| creator | ✅     | ✅     |
| editor  | ✅     | ✅     |
| viewer  | ❌     | ✅     |

---

### 9. DB 영향

* `chat_messages` — 채팅 메시지 영구 저장

---

### 10. API 영향

* `GET /maps/{mapId}/chat/messages` — 메시지 이력 조회
* `POST /maps/{mapId}/chat/messages` — 메시지 전송
* Supabase Realtime Channel: `chat:map:{mapId}`

---

### 11. 연관 기능

* COLLABORATION (`25-map-collaboration.md`)
* CHAT_TRANSLATION (`24-chat-translation.md`)

---

### 12. 구현 우선순위

#### MVP (V2)
* CHAT-01 채팅 패널
* CHAT-02 메시지 전송/수신
* CHAT-03 이전 메시지 로딩

#### 2단계 (V2)
* CHAT-05 @멘션
* 번역 연동 (TRANS-08~11)

#### 3단계
* CHAT-04 파일/이미지 첨부
