# 25. Map Collaboration
## COLLABORATION

* 문서 버전: v1.0
* 작성일: 2026-04-16
* 참조: `docs/01-product/functional-spec.md § COLLAB`, `docs/04-extensions/collaboration-and-concurrency-strategy.md`

---

### 1. 기능 목적

* 1명 이상의 사용자를 **editor로 초대하여 동시 편집**하는 협업 기능
* Supabase Realtime 기반 실시간 동기화로 편집 결과를 모든 협업자에게 즉시 반영
* LWW (Last-Write-Wins) 충돌 정책과 Soft Lock으로 동시 편집 안정성 확보

---

### 2. 기능 범위

* 포함:
  * 맵 초대/권한 관리 (COLLAB-01~03)
  * 실시간 동기화 (COLLAB-04~06)
  * 커서 공유 (COLLAB-07)
  * Soft Lock (COLLAB-08~09)
  * Node Thread (COLLAB-10~13)
  * AI 협업 요약 (COLLAB-14~15, V3)
  * 접속자 목록 (COLLAB-16~17)

* 제외:
  * 채팅 기능 (→ `26-realtime-chat.md`)
  * 번역 기능 (→ `23-node-translation.md`, `24-chat-translation.md`)
  * AI 기능 (협업 중 비활성, → `18-ai.md`)

---

### 3. 세부 기능 목록

| 기능ID      | 기능명                  | 설명                                  | 주요 동작              |
| --------- | -------------------- | ----------------------------------- | ------------------ |
| COLLAB-01 | 맵 초대                 | 이메일/링크로 editor 초대                   | 초대 링크 생성           |
| COLLAB-02 | 권한 변경                | editor ↔ viewer 역할 변경               | 권한 설정 UI           |
| COLLAB-03 | 협업자 제거               | 맵에서 특정 협업자 삭제                       | 멤버 관리              |
| COLLAB-04 | 실시간 편집 동기화           | 편집 내용 즉시 전파 (Supabase Realtime)     | WebSocket           |
| COLLAB-05 | LWW 충돌 정책            | 마지막 쓰기 우선 (Last-Write-Wins)         | timestamp 비교       |
| COLLAB-06 | 변경 수신 및 반영           | 원격 편집 수신 → Document Store 반영        | CRDT-like 병합       |
| COLLAB-07 | 커서 공유                | 협업자 커서 위치 실시간 표시 (이름 + 색상)          | Presence           |
| COLLAB-08 | Soft Lock            | 노드 편집 시 Soft Lock 설정 (다른 사람 편집 경고) | Lock 표시            |
| COLLAB-09 | Lock 해제              | 편집 완료 또는 timeout(30s) 후 자동 해제       | 자동 해제              |
| COLLAB-10 | Node Thread          | 노드에 댓글 스레드 추가                       | 스레드 패널 열기          |
| COLLAB-11 | Thread Reply         | 스레드 답글 작성                           | 답글 입력              |
| COLLAB-12 | Thread Resolve       | 스레드 해결 처리                           | 해결 표시              |
| COLLAB-13 | Thread Mention       | @멘션으로 협업자 알림                        | 알림 전송              |
| COLLAB-14 | AI Thread Summary    | Thread 핵심 논점 AI 요약 (V3)             | AI 요약 버튼           |
| COLLAB-15 | AI Task Extraction   | Thread에서 Action Item 추출 (V3)        | 태스크 후보 목록          |
| COLLAB-16 | 접속자 목록               | 현재 맵 접속 중인 협업자 목록                   | Presence 표시        |
| COLLAB-17 | 접속자 수 표시             | 헤더에 접속자 아바타 표시                      | Presence 아바타       |

---

### 4. 기능 정의 (What)

#### 4.1 협업맵 정의

* 맵 생성자(creator)가 1명 이상 사용자를 **editor로 초대**한 맵
* viewer 초대 = 협업맵 아님 (퍼블리싱으로 처리)

#### 4.2 map_members 테이블

```sql
CREATE TABLE public.map_members (
  map_id      UUID NOT NULL REFERENCES public.maps(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role        VARCHAR(20) NOT NULL DEFAULT 'editor',
              -- 'editor' | 'viewer'
  invited_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (map_id, user_id)
);
```

#### 4.3 node_threads / thread_messages 테이블

```sql
CREATE TABLE public.node_threads (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id     UUID NOT NULL REFERENCES public.nodes(id) ON DELETE CASCADE,
  created_by  UUID NOT NULL REFERENCES public.users(id),
  resolved    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.thread_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id   UUID NOT NULL REFERENCES public.node_threads(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES public.users(id),
  content     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

#### 4.4 Soft Lock 구조 (Redis)

```typescript
// Redis Key: `lock:node:{nodeId}`
// TTL: 30초
type SoftLock = {
  nodeId: string;
  lockedBy: string;     // userId
  lockedAt: string;     // ISO 8601
  displayName: string;  // 표시명
};
```

#### 4.5 Presence (커서 공유)

* Supabase Realtime Presence Channel 활용
* 각 클라이언트가 `{ userId, cursor: WorldPoint, color }` broadcast
* 화면에 다른 협업자 커서를 이름 레이블 + 고유 색상으로 표시

---

### 5. 동작 방식 (How)

#### 5.1 사용자 동작

* 맵 공유 > 이메일 입력 → 초대 링크 발송
* 초대 수락 → editor로 맵 접근
* 편집 동시 진행 → 변경 즉시 다른 협업자 화면에 반영
* 노드 클릭 → Soft Lock 활성 → 다른 협업자 편집 시 경고
* 노드 우클릭 > `댓글 추가` → Node Thread 생성

#### 5.2 실시간 동기화 흐름

```
사용자 A 편집 (노드 이동)
    │
    ▼
Document Store 즉시 반영 (낙관적 업데이트)
    │
    ▼
PATCH /maps/{mapId}/document
  { patches: [{ op: 'moveNode', ... }] }
    │
    ▼
서버 처리 → maps.current_version + 1
    │
    ▼
Supabase Realtime 브로드캐스트
    │
    ▼
사용자 B, C 수신 → Document Store 병합 반영
```

#### 5.3 LWW 충돌 해소

* 동일 노드를 A·B가 동시 편집 시: `timestamp` 최신 값 채택
* `clientId` + `patchId` 기반 중복 적용 방지
* baseVersion 불일치 시: Autosave 충돌 해소 3단계 적용 (`14-save.md` 참조)

---

### 6. 규칙 (Rule)

* AI 기능: 협업 중(접속자 2명 이상) 비활성화
* Soft Lock TTL: 30초 (비활동 시 자동 해제)
* 협업자 최대 수: 20명/맵
* Thread 메시지 최대 길이: 2000자
* @멘션: `@displayName` 형식, 알림 전송

---

### 7. 예외 / 경계 (Edge Case)

* **네트워크 단절**: 로컬 편집 유지 → 재연결 시 병합 동기화
* **Soft Lock 충돌**: 다른 사람 편집 중인 노드 편집 시 "OOO이 편집 중입니다" 경고
* **역할 변경 중 편집**: 변경 완료 전 편집 내용 보존 후 권한 재적용
* **초대 만료**: 24시간 후 초대 링크 만료

---

### 8. 권한 규칙

| 역할      | 편집 | 초대 | Thread | AI 사용 |
| ------- | -- | -- | ------ | ------ |
| creator | ✅  | ✅  | ✅      | solo만  |
| editor  | ✅  | ❌  | ✅      | solo만  |
| viewer  | ❌  | ❌  | 읽기만   | ❌      |

---

### 9. DB 영향

* `map_members` — 협업자 초대 및 역할
* `node_threads` — 노드 댓글 스레드
* `thread_messages` — 스레드 메시지
* Redis — Soft Lock, Presence 상태

---

### 10. API 영향

* `POST /maps/{mapId}/members` — 협업자 초대
* `PATCH /maps/{mapId}/members/{userId}` — 역할 변경
* `DELETE /maps/{mapId}/members/{userId}` — 협업자 제거
* `POST /nodes/{nodeId}/threads` — Thread 생성
* `POST /threads/{threadId}/messages` — 답글 작성
* `PATCH /threads/{threadId}/resolve` — Thread 해결

---

### 11. 연관 기능

* REALTIME_CHAT (`26-realtime-chat.md`)
* NODE_TRANSLATION (`23-node-translation.md`)
* AI (`18-ai.md`)
* SAVE (`docs/03-editor-core/save/14-save.md`)

---

### 12. 구현 우선순위

#### MVP (V1 확장)
* COLLAB-01~03: 초대/권한 관리
* COLLAB-04~06: 실시간 동기화
* COLLAB-16~17: 접속자 표시

#### 2단계 (V2)
* COLLAB-07: 커서 공유
* COLLAB-08~09: Soft Lock
* COLLAB-10~13: Node Thread

#### 3단계 (V3)
* COLLAB-14~15: AI 협업 요약/태스크 추출
