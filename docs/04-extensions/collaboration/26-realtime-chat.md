# 26. Realtime Chat
## REALTIME_CHAT

* 문서 버전: v1.1
* 작성일: 2026-04-16
* 최종 업데이트: 2026-04-16
* 변경 이력:
  * v1.1 — 미확인 @멘션 표시(CHAT-06), 1:1 DM(CHAT-07, V3) 추가; 기능 목적 및 범위 업데이트
  * v1.0 — 최초 작성
* 참조: `docs/01-product/functional-spec.md § COLLAB`, `docs/04-extensions/collaboration/25-map-collaboration.md`

---

### 1. 기능 목적

* 협업 참여자 간 **맵 채널 채팅과 1:1 DM으로 소통**하는 기능
* 맵 채널 채팅과 노드 스레드 댓글로 맥락에 맞는 소통 지원
* **협업 비접속 중에도** 본인에게 수신된 멘션/DM 메시지를 재접속 시 확인 가능
* 메시지 전송 대상을 **전체 협업자** 또는 **특정 사용자** 로 지정 가능
* 채팅 메시지 자동 번역으로 다국어 협업자 간 소통 장벽 제거

---

### 2. 기능 범위

* 포함:
  * 맵 채널 채팅 (CHAT-01)
  * 메시지 전송/수신 (CHAT-02)
  * 채팅 이력 로딩 (CHAT-03)
  * **전송 대상 지정 — 전체/특정 사용자** (CHAT-04) ← v1.1 격상
  * @멘션 (CHAT-05)
  * **미확인 @멘션 표시** (CHAT-06)
  * **1:1 DM** (CHAT-07, V3)
  * 채팅 메시지 번역 연동 (→ `24-chat-translation.md`)

* 제외:
  * Node Thread (→ `25-map-collaboration.md` COLLAB-10~13)
  * 채팅 검색
  * 파일/이미지 첨부 (후순위)

---

### 3. 세부 기능 목록

| 기능ID    | 기능명              | 설명                                          | 주요 동작              |
| ------- | ---------------- | ------------------------------------------- | ------------------ |
| CHAT-01 | 맵 채팅 패널         | 우측 사이드바 채팅 패널 표시                             | 패널 열기/닫기           |
| CHAT-02 | 메시지 전송          | 텍스트 메시지 전송                                  | Enter 전송           |
| CHAT-03 | 이전 메시지 로딩       | 스크롤 업 시 이전 메시지 페이징 로딩                        | Cursor pagination  |
| CHAT-04 | **전송 대상 지정**    | 전체 협업자 또는 특정 1명에게 메시지 전송 (DM)               | 수신자 드롭다운 선택        |
| CHAT-05 | @멘션             | @이름으로 특정 협업자 알림                              | 알림 전송              |
| CHAT-06 | 미확인 @멘션 표시      | 나중에 맵 참여 시 본인에게 온 @멘션 강조 표시                   | 채팅 패널 열기 시 자동 표시   |
| CHAT-07 | 1:1 DM          | 협업자와 1:1 비공개 대화 채널 (V3)                        | DM 패널 열기           |

---

### 4. 기능 정의 (What)

#### 4.1 chat_messages 테이블 (v1.1 변경)

```sql
CREATE TABLE public.chat_messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  map_id          UUID NOT NULL REFERENCES public.maps(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES public.users(id),

  -- v1.1: 전송 대상 지정
  -- NULL     = 전체 협업자에게 공개 (브로드캐스트)
  -- UUID     = 특정 사용자에게만 보이는 DM 메시지
  recipient_id    UUID REFERENCES public.users(id),

  content         TEXT NOT NULL,
  client_msg_id   VARCHAR(80) NOT NULL,     -- 멱등성 키 (중복 전송 방지)
  source_lang     VARCHAR(20),              -- 원문 언어 코드
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (map_id, user_id, client_msg_id)
);

CREATE INDEX idx_chat_messages_map_id
  ON public.chat_messages(map_id, created_at DESC);

-- v1.1: DM 수신자 조회 인덱스
CREATE INDEX idx_chat_messages_recipient
  ON public.chat_messages(recipient_id, map_id, created_at DESC)
  WHERE recipient_id IS NOT NULL;
```

> **recipient_id 규칙**
> - `NULL` → 전체 공개 메시지. 모든 협업자가 조회 가능.
> - `UUID` → DM 메시지. 발신자(`user_id`)와 수신자(`recipient_id`)만 조회 가능. RLS 적용.

#### 4.2 chat_mentions 테이블 (v1.1 신규)

```sql
-- @멘션 또는 DM 수신 추적 테이블
-- 오프라인 재접속 시 미읽음 메시지 확인의 핵심
CREATE TABLE public.chat_mentions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  map_id      UUID NOT NULL REFERENCES public.maps(id) ON DELETE CASCADE,
  message_id  UUID NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  sender_id   UUID NOT NULL REFERENCES public.users(id),
  receiver_id UUID NOT NULL REFERENCES public.users(id),  -- 멘션 수신자 or DM 수신자
  mention_type VARCHAR(10) NOT NULL DEFAULT 'mention',
              -- 'mention' : @멘션 메시지
              -- 'dm'      : recipient_id 지정 DM 메시지
  is_read     BOOLEAN NOT NULL DEFAULT FALSE,
  read_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (message_id, receiver_id)              -- 동일 메시지 중복 알림 방지
);

CREATE INDEX idx_chat_mentions_receiver
  ON public.chat_mentions(receiver_id, map_id, is_read, created_at DESC);

CREATE INDEX idx_chat_mentions_map_unread
  ON public.chat_mentions(map_id, receiver_id, is_read)
  WHERE is_read = FALSE;
```

#### 4.3 채팅 패널 UI (v1.1 변경)

```text
┌─────────────────────────────────────────┐
│  💬 채팅                    [ 전체 ▼ ]   │  ← 수신자 필터 (전체/나에게 온 메시지)
├─────────────────────────────────────────┤
│  [Alice] 12:34                          │
│  DB 스키마 검토 완료했어요               │
│    번역: DB schema review done          │
│                                         │
│  [Bob → Alice] 12:35  🔒DM             │  ← DM 메시지 표시 (발신자+수신자만 보임)
│  @Alice 수고하셨습니다!                  │
│                                         │
│  [Charlie] 12:36                        │
│  다음 단계 진행할게요                    │
├─────────────────────────────────────────┤
│  받는 사람: [전체 협업자   ▼]            │  ← 전송 대상 선택 드롭다운
│  메시지 입력...            [ 전송 ]      │
└─────────────────────────────────────────┘
```

> **미읽음 뱃지**: 채팅 아이콘에 `🔴 N` 뱃지 — 본인에게 온 멘션/DM 미읽음 수 표시  
> **DM 표시**: `[발신자 → 수신자]` 형식으로 당사자에게만 렌더링

#### 4.4 CHAT-06 미확인 @멘션 처리

> **테이블 정의**: `chat_mentions` 스키마는 **§4.2**에 단일 정의되어 있다.  
> `mention_type = 'mention'`인 row가 @멘션 수신 추적에 해당한다.

- 맵 채팅 패널 열기 시 `is_read = false`, `mention_type = 'mention'`인 행을 강조 표시
- 채팅 패널에서 해당 메시지를 본 시점에 `is_read = true`, `read_at = NOW()`로 업데이트
- 나중에 협업에 참여한 사람도 본인 @멘션 이력 확인 가능 (오프라인 추적)
- 조회: `GET /maps/{mapId}/chat/mentions/unread` — `receiver_id = 나`, `is_read = false` 필터

#### 4.5 CHAT-07 1:1 DM (V3)

1:1 DM은 그룹 채팅 채널과 독립된 별도 채널로 동작한다.

```sql
CREATE TABLE public.dm_messages (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  map_id       UUID NOT NULL REFERENCES public.maps(id) ON DELETE CASCADE,
  sender_id    UUID NOT NULL REFERENCES public.users(id),
  recipient_id UUID NOT NULL REFERENCES public.users(id),
  content      TEXT NOT NULL,
  is_read      BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_dm_messages_pair
  ON public.dm_messages(map_id, sender_id, recipient_id, created_at DESC);
```

- Supabase Realtime Channel: `dm:map:{mapId}:pair:{minUid}:{maxUid}` (두 UID 오름차순 정렬)
- 그룹 채팅 패널과 별도의 DM 패널/탭으로 표시
- viewer는 DM 전송 불가

#### 4.6 메시지 구조 (v1.1 변경)

```typescript
interface ChatMessage {
  id: string;
  mapId: string;
  userId: string;
  displayName: string;
  avatarUrl?: string;
  content: string;

  // v1.1 추가
  recipientId: string | null;     // null = 전체 공개 / UUID = DM
  recipientName?: string;         // DM 수신자 이름 (렌더링용)
  isDm: boolean;                  // true = DM 메시지

  createdAt: string;              // ISO 8601
  translation?: string;           // 수신자 언어 번역 (클라이언트 측, 저장 안 됨)
}

// v1.1 신규: 미읽음 멘션/DM 정보
interface UnreadMentionSummary {
  mapId: string;
  unreadCount: number;            // 미읽음 멘션+DM 총 수
  mentions: {
    id: string;                   // chat_mentions.id
    messageId: string;
    senderId: string;
    senderName: string;
    mentionType: 'mention' | 'dm';
    content: string;              // 메시지 내용 미리보기 (50자)
    createdAt: string;
  }[];
}
```

---

### 5. 동작 방식 (How)

#### 5.1 사용자 동작

* 우측 채팅 아이콘 클릭 → 채팅 패널 열기
* **전송 대상 드롭다운**: `전체 협업자` 또는 특정 사용자 이름 선택
* 텍스트 입력 후 Enter 또는 `[전송]` 버튼
* 타 협업자 메시지 수신 → 알림 뱃지 (패널 닫혀 있을 때)
* @이름 입력 → 자동완성 → 해당 협업자에게 알림
* **재접속 시** → 채팅 아이콘에 미읽음 멘션/DM 뱃지 자동 표시
* **미읽음 뱃지 클릭** → 채팅 패널 열림 + "나에게 온 메시지" 필터 자동 적용

#### 5.2 메시지 전송/수신 흐름

```
메시지 입력 → 전송 대상 선택(전체 or 특정 사용자) → Enter
    │
    ▼
POST /maps/{mapId}/chat/messages
  { content: "텍스트", recipientId: null | "uuid", clientMsgId: "..." }
    │
    ▼
chat_messages INSERT (recipient_id 포함)
    │
    ├── @멘션 파싱 또는 DM 감지 시
    │       chat_mentions INSERT (is_read = false)
    │
    ▼
Supabase Realtime Broadcast
  channel: `chat:map:{mapId}`
  payload: { message, recipientId }
    │
    ├── recipientId = null   → 전체 접속 협업자 수신 → 채팅 패널 렌더링
    └── recipientId = UUID   → 발신자 + 수신자만 수신 → DM 렌더링
    │
    ▼ (번역 처리)
CHAT_TRANSLATION 모듈 → 수신자 언어로 번역 후 표시
```

#### 5.3 이전 메시지 로딩 (페이지네이션)

```
GET /maps/{mapId}/chat/messages?before={cursor}&limit=50&recipientFilter={all|mine}
    │
    ▼
chat_messages 조회 (created_at DESC, cursor 기준)
  - recipientFilter=all  : recipient_id IS NULL (전체 공개 메시지만)
  - recipientFilter=mine : recipient_id IS NULL OR recipient_id = {나} OR user_id = {나} (DM 포함)
    │
    ▼
50개 단위 반환 → 스크롤 상단에 추가
```

#### 5.4 오프라인 메시지 확인 흐름 (v1.1 신규)

```
협업 맵 입장 (재접속)
    │
    ▼
GET /maps/{mapId}/chat/mentions/unread
  → chat_mentions 조회 (receiver_id = 나, is_read = false)
    │
    ▼
미읽음 수 > 0
    ├── 채팅 아이콘 뱃지 표시 (count)
    └── 패널 열기 시 → "나에게 온 메시지" 탭/필터 자동 적용
    │
    ▼
사용자가 메시지 확인 (패널 스크롤 또는 목록 클릭)
    │
    ▼
PATCH /maps/{mapId}/chat/mentions/read
  { mentionIds: ["uuid", ...] }  또는  { readAll: true }
    │
    ▼
chat_mentions UPDATE (is_read = true, read_at = NOW())
    │
    ▼
뱃지 수 감소 / 클리어
```

---

### 6. 규칙 (Rule)

* 메시지 최대 길이: 2000자
* 이전 메시지 로딩: 50개/요청 (Cursor pagination)
* 채팅 이력: 맵 삭제 시 CASCADE 삭제
* @멘션: `@displayName` 형식, 알림 전송 + `chat_mentions` row INSERT
* DM 메시지: `recipient_id = UUID` — 발신자와 수신자만 조회/수신 가능 (RLS 필수)
* **오프라인 멘션/DM**: 재접속 시 `chat_mentions.is_read = false` 건수를 뱃지로 표시
* **미읽음 만료**: 맵 삭제 시 CASCADE, 별도 만료 정책 없음 (영구 보관)
* 패널 닫힌 상태에서 새 메시지 → 아이콘에 미읽음 뱃지 표시
* **전체 공개 메시지 미읽음**: 접속 중 패널 닫혀 있을 때만 뱃지 표시 (재접속 추적 없음)
  * 오프라인 추적은 **멘션/DM 한정** (chat_mentions)

---

### 7. 예외 / 경계 (Edge Case)

* **빈 메시지**: 전송 버튼/Enter 비활성화
* **메시지 길이 초과**: 2000자 입력 제한 (textarea maxLength)
* **네트워크 단절 중 전송**: 재연결 후 큐에서 전송 재시도
* **협업자 아닌 viewer**: 채팅 읽기만 가능, 전송 불가
* **본인에게 DM**: 자기 자신을 수신자로 지정 불가 (UI + API 레벨 방지)
* **DM 수신자가 맵에서 제거됨**: DM 메시지는 발신자만 조회 가능, 수신자 row는 유지
* **재접속 시 대량 미읽음**: 최대 99+ 뱃지 표시, 상세 목록은 최근 50건 우선 표시
* **동시 읽음 처리**: `read_at` 최초 SET 이후 중복 PATCH 시 무시 (idempotent)

---

### 8. 권한 규칙

| 역할      | 채팅 전송 (전체) | DM 전송 | 채팅 읽기 | 멘션/DM 수신 확인 |
| ------- | ---------- | ----- | ----- | ----------- |
| creator | ✅          | ✅     | ✅     | ✅           |
| editor  | ✅          | ✅     | ✅     | ✅           |
| viewer  | ❌          | ❌     | ✅     | ✅ (수신만)    |

> **RLS 정책 (DM)**  
> `chat_messages` SELECT: `recipient_id IS NULL` (전체 공개) OR `user_id = auth.uid()` (내가 보낸 DM) OR `recipient_id = auth.uid()` (내가 받은 DM)

---

### 9. DB 영향

* `chat_messages` — 채팅 메시지 영구 저장 (`recipient_id` 컬럼 추가)
* `chat_mentions` — @멘션 / DM 수신 추적, 읽음 상태 관리 **(v1.1 신규)**

---

### 10. API 영향

* `GET /maps/{mapId}/chat/messages` — 메시지 이력 조회 (`recipientFilter` 파라미터 추가)
* `POST /maps/{mapId}/chat/messages` — 메시지 전송 (`recipientId` 필드 추가)
* `GET /maps/{mapId}/chat/mentions/unread` — 미읽음 멘션/DM 목록 조회 **(v1.1 신규)**
* `PATCH /maps/{mapId}/chat/mentions/read` — 멘션/DM 읽음 처리 **(v1.1 신규)**
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
* CHAT-06 미확인 @멘션 표시

#### 2단계 (V2)
* CHAT-05 @멘션
* 번역 연동 (TRANS-08~11)

#### 3단계 (V3)
* CHAT-07 1:1 DM

#### 4단계 (후순위)
* CHAT-04 파일/이미지 첨부
