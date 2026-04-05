# easymindmap — Collaboration Engine 개발 명세

> **문서 위치**: `docs/05-implementation/collaboration-engine.md`  
> **최종 업데이트**: 2026-03-31  
> **관련 문서**: `docs/05-implementation/system-architecture.md`, `docs/03-editor-core/autosave-engine.md`

> **Supabase Self-hosted 결정 (2026-03-27) 반영**:  
> Phase 1에서 **Supabase Realtime**을 활용하면 WebSocket 서버 구현 공수를 절감 가능.  
> 단, cursor/presence 등 세밀한 제어가 필요하므로 WS Gateway는 유지.

---

## 0. 실시간 전송 계층 역할 분리

> **핵심 결정**: Supabase Realtime과 Redis Pub/Sub을 **목적별로 분리**한다.  
> Map patch(문서 변경 전파)는 **Redis Pub/Sub**이 1차 채널이며, Supabase Realtime은 보조 용도이다.

### 역할 분리 비교표

| 항목 | Supabase Realtime | Redis Pub/Sub |
|------|-------------------|---------------|
| **주 용도** | Presence / Cursor / Selection 실시간 공유 | **Map patch broadcast** (문서 변경 전파) |
| **채널 예시** | `realtime:presence:{mapId}` | `map:{mapId}`, `dashboard:{mapId}` |
| **데이터 흐름** | 클라이언트 ↔ Supabase (직접 연결) | API Server → Redis PUBLISH → WS Gateway → 클라이언트 |
| **영속성** | 없음 (메모리 상태) | 없음 (in-memory), 결과는 PostgreSQL에 저장 |
| **지연 허용치** | ~100ms (UI 표시용) | <50ms (문서 무결성 우선) |
| **서버 개입** | 최소 (Supabase가 처리) | 필수 (WS Gateway가 subscribe) |
| **확장 방식** | Supabase Realtime 클러스터 | Redis Cluster / Sentinel |
| **V1 사용 여부** | ✅ (presence, cursor) | ✅ (map patch, dashboard) |
| **V2+ 확장** | Yjs/CRDT awareness channel 후보 | Remote patch ordering, OT 처리 |

### 이벤트별 전송 채널 결정표

| WS 이벤트 | 전송 채널 | 이유 |
|-----------|-----------|------|
| `presence:changed` | Supabase Realtime | 일시적 상태, DB 저장 불필요 |
| `cursor:changed` | Supabase Realtime | 고빈도(mousemove), 손실 허용 |
| `selection:changed` | Supabase Realtime | 일시적 상태 |
| `map:patch` | **Redis Pub/Sub** | 문서 변경 — 순서 보장 및 API 서버 경유 필요 |
| `node:editing:started/ended` | **Redis Pub/Sub** | 소프트 잠금 — 모든 인스턴스에 전파 필요 |
| `translation:ready` | **Redis Pub/Sub** | BullMQ worker 완료 알림 |
| `dashboard:refresh` | **Redis Pub/Sub** | 외부 시스템 변경 전파 (V3) |
| `export:completed` | **Redis Pub/Sub** | BullMQ export worker 완료 알림 |

---

## 1. 협업 단계

**Phase 1 (V1): Lightweight Realtime**
- presence (누가 이 맵에 있는가)
- cursor (커서 위치)
- selection (선택 노드)
- map patch broadcast (변경 내용 전파)

**Phase 2 (V2+): Advanced Collaboration**
- optimistic merge
- remote patch ordering
- Yjs / CRDT adapter


**Phase 2.5 (V2): Live Collaboration Chat**
- map-room chat (현재 접속 협업자 간 라이브 대화)
- light notification (dot only, unread 없음)
- chat translation with language-group cache
- reconnect 시 최근 메시지 복구

**Phase 3 (V3): Node Thread + AI Assist**
- node-linked thread (`nodeId` 기반)
- 메시지 클릭 시 node focus / zoom
- AI thread summary / task extraction preview
- 승인 기반 task node 생성

> **중요 원칙**
> - 채팅/댓글/AI preview 결과는 문서 편집 파이프라인과 분리한다.
> - Undo/Redo 및 autosave revision history에는 포함하지 않는다.


---

## 2. WebSocket 이벤트 전체 목록

### 클라이언트 → 서버

| 이벤트 | 페이로드 |
|--------|---------|
| `room:join` | `{ mapId }` |
| `room:leave` | `{ mapId }` |
| `presence:update` | `{ status: 'active' \| 'idle' }` |
| `cursor:update` | `{ x, y, nodeId? }` |
| `selection:update` | `{ nodeIds: string[] }` |
| `node:editing:start` | `{ nodeId }` |
| `node:editing:end` | `{ nodeId }` |
| `chat:message:send` | `{ mapId, clientMsgId, text, nodeId? }` |
| `chat:panel:open` | `{ mapId, lastSeenMessageId? }` |
| `node:thread:ai:run` | `{ mapId, nodeId, action: 'summarize' | 'extract_tasks' | 'generate_task_nodes_preview' }` |

### 서버 → 클라이언트

| 이벤트 | 페이로드 | 전송 채널 |
|--------|---------|-----------|
| `room:members` | `[{ userId, displayName, avatarUrl, cursor, selection }]` | WS 직접 |
| `presence:changed` | `{ userId, status }` | Supabase Realtime |
| `cursor:changed` | `{ userId, x, y, nodeId? }` | Supabase Realtime |
| `selection:changed` | `{ userId, nodeIds }` | Supabase Realtime |
| `map:patch` | `{ patches, version, actorId }` | Redis Pub/Sub |
| `map:version` | `{ version }` (버전 동기화) | Redis Pub/Sub |
| `node:editing:started` | `{ nodeId, userId }` | Redis Pub/Sub |
| `node:editing:ended` | `{ nodeId, userId }` | Redis Pub/Sub |
| `translation:ready` | `{ nodeId, targetLang, translatedText, textHash }` | Redis Pub/Sub |
| `chat:message` | `{ messageId, mapId, userId, text, nodeId?, createdAt }` | Redis Pub/Sub |
| `chat:translation:ready` | `{ messageId, targetLang, translatedText, sourceTextHash }` | Redis Pub/Sub |
| `node:thread:updated` | `{ nodeId, messageCount, lastMessageAt }` | Redis Pub/Sub |
| `node:thread:ai:preview` | `{ nodeId, action, summary?, tasks? }` | Redis Pub/Sub |
| `dashboard:refresh` | `{ changedNodes: [{id, text, updatedAt}] }` (V3) | Redis Pub/Sub |
| `export:completed` | `{ jobId, downloadUrl }` | Redis Pub/Sub |
| `publish:completed` | `{ mapId, publishUrl }` | Redis Pub/Sub |

---


## 2-1. 실시간 협업 채팅 / Node Thread 확장

### 채널 설계

| 채널 | 용도 |
|------|------|
| `chat:{mapId}` | 맵 전체 채팅 메시지 브로드캐스트 |
| `thread:{mapId}:{nodeId}` | 특정 node thread 갱신 이벤트 |
| `chat-translation:{mapId}` | 채팅 번역 완료 이벤트 |
| `thread-ai:{mapId}:{nodeId}` | AI preview 결과 전달 |

### 이벤트 경계

- `map:patch` 는 문서 구조 변경 이벤트다.
- `chat:*` 는 협업 대화 이벤트다.
- `node:thread:*` 는 문맥형 토론 이벤트다.
- `node:thread:ai:*` 는 AI preview 결과 이벤트다.

이 네 계층은 같은 WS Gateway를 쓰더라도 **이벤트 버스와 저장소, Undo/Redo 처리 경계가 다르다**.

### 채팅 메시지 처리 원칙

1. 원문 메시지는 무조건 1회 저장
2. 번역은 targetLang 단위로 파생 레코드/캐시 생성
3. 채팅 패널이 닫혀 있으면 dot 표시만 갱신
4. 재접속 시 최근 30~50개 메시지 재조회
5. nodeId가 있는 메시지는 node thread와 map chat 양쪽 컨텍스트에서 조회 가능

## 3. 아키텍처

```
클라이언트 A                클라이언트 B
    │                           │
    │ WSS                       │ WSS
    ▼                           ▼
WS Gateway (room 관리)
    │
    ├── [Supabase Realtime] presence_sessions 갱신
    │   → cursor / presence / selection 이벤트 구독
    │
    ├── [Redis Pub/Sub] 구독
    │   channel: map:{mapId}
    │   channel: chat:{mapId}
    │   channel: thread:{mapId}:{nodeId}
    │   channel: dashboard:{mapId}
    │
    ▼
API Server (patch 저장)
    │
    ▼
PostgreSQL (map_revisions 저장)
    │
    ├── Redis PUBLISH map:{mapId} {patch, version, actorId}
    │
    ▼
WS Gateway subscribe
    → 같은 맵의 다른 클라이언트에게 map:patch 이벤트 broadcast
```

---

## 4. Presence 구조

```typescript
interface PresenceState {
  userId: string;
  displayName: string;
  avatarUrl: string;
  color: string;        // 사용자별 고유 색상 (커서/선택 표시용)
  cursor: { x: number; y: number; nodeId?: string } | null;
  selection: string[];  // 선택 중인 nodeId[]
  status: 'active' | 'idle';
  lastSeenAt: Date;
}
```

**Presence 색상 자동 배정:**
```typescript
const PRESENCE_COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4',
  '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F'
];

function assignColor(userId: string, existingColors: string[]): string {
  // 사용 중이지 않은 색상 중 userId hash 기반 선택
}
```

---

## 5. 편집 중 노드 잠금

협업 시 같은 노드를 두 명이 동시에 편집하는 것을 막기 위한 소프트 잠금:

```
User A: node:editing:start { nodeId: "n1" }
    → WS Gateway broadcast: node:editing:started { nodeId: "n1", userId: "A" }
    → User B의 클라이언트: "n1" 노드 편집 UI 비활성화 (잠금 표시)

User A: node:editing:end { nodeId: "n1" }
    → WS Gateway broadcast: node:editing:ended { nodeId: "n1", userId: "A" }
    → User B: 잠금 해제
```

> **소프트 잠금** (강제 잠금 X): 타임아웃 5초 후 자동 해제.

---

## 6. 대시보드 모드 Redis Pub/Sub (V3)

```
외부 시스템: PATCH /nodes/:id
        │
        ▼
nodes.text UPDATE
        │
        ▼
Redis PUBLISH dashboard:{mapId}
  payload: {
    changedNodes: [{ id, text, updatedAt }]
  }
        │
        ▼
WS Gateway SUBSCRIBE dashboard:{mapId}
        │
        ▼
dashboard:refresh 이벤트 → 해당 맵 모든 클라이언트 Push
```

---

## 7. Presence 색상 정책

협업 중 각 참여자의 cursor / 선택 노드 표시에 사용할 색상을 할당한다.

### 색상 할당 규칙

| 항목 | 정책 |
|------|------|
| 색상 풀 | 최대 8색 (HSL 기반 분산 배치) |
| 할당 시점 | 참여자가 맵 세션에 입장 시 서버에서 `map_collaborators.session_color` 임시 할당 |
| 재입장 시 | 동일한 userId면 기존 색상 재사용 (다른 참여자가 사용 중이면 차순위 색상) |
| 표시 대상 | cursor 테두리, 선택 노드 하이라이트, 이름 배지 배경 |

### 기본 색상 팔레트 (8색)

```
#FF6B6B (빨강)  #4ECDC4 (청록)  #45B7D1 (하늘)  #96CEB4 (민트)
#FFEAA7 (노랑)  #DDA0DD (보라)  #98D8C8 (연초록) #F7DC6F (연노랑)
```

### Supabase Realtime Presence payload 예시

```typescript
type PresencePayload = {
  userId: string;
  displayName: string;
  color: string;          // 할당된 hex 색상
  cursor?: { x: number; y: number };
  selectedNodeId?: string | null;
  lastActiveAt: string;   // ISO 8601
};
```

---

## 8. 초대 플로우 다이어그램

```
Creator                   Server                    Invitee
  │                         │                         │
  │ POST /maps/:id/         │                         │
  │ collaborators           │                         │
  │ { email, role, scope }  │                         │
  │ ─────────────────────►  │                         │
  │                         │ INSERT map_collaborators│
  │                         │ status = 'pending'      │
  │                         │ 초대 토큰 생성           │
  │                         │ 이메일 발송 ──────────► │
  │ 201 Created             │                         │
  │ ◄─────────────────────  │                         │
  │                         │                         │
  │                         │ POST /invite/accept     │
  │                         │ { token }     ◄──────── │
  │                         │                         │
  │                         │ 토큰 검증               │
  │                         │ status = 'active'       │
  │                         │ maps.is_collaborative   │
  │                         │ = true                  │
  │                         │ 200 OK ──────────────► │
  │                         │                         │
```

### 초대 만료 정책

| 항목 | 값 |
|------|-----|
| 초대 토큰 유효 기간 | 7일 |
| 만료 후 수락 시 | `410 Gone` (재초대 필요) |
| 토큰 저장 위치 | Redis (TTL 7일) or `map_collaborators.invite_token` 컬럼 |
| 중복 초대 방지 | 동일 `(map_id, user_id)` 존재 시 `409 Conflict` |

---

## 9. 협업 권한 레이어 (Permission Guard Pipeline)

모든 노드 CRUD API에 아래 순서로 권한을 검사한다.

```
요청 (PATCH /nodes/:id)
    │
    ▼ ① JWT 인증 → userId 추출
    ▼ ② map_collaborators 참여자 확인 (없으면 403)
    ▼ ③ scope 검사 (creator: 통과 / level: depth 확인 / node: ltree 확인)
    ▼ ④ 수정/삭제 권한 검사 — scope 내 + (creator OR 본인 작성)
    ▼ ⑤ 실제 처리 → Redis Pub/Sub 브로드캐스트
```

### NestJS Guard 파일 위치

```
src/collaboration/guards/
  collab-member.guard.ts   ← ② 참여자 확인
  collab-scope.guard.ts    ← ③ scope 검사
  node-owner.guard.ts      ← ④ 노드 소유권 검사
src/collaboration/services/
  permission.service.ts    ← canEdit() / canModifyOrDelete()
```

### permission.service.ts 핵심 로직

```typescript
async canEdit(userId: string, nodeId: string, mapId: string): Promise<boolean> {
  const collab = await this.getCollaborator(mapId, userId);
  if (!collab) return false;
  if (collab.role === 'creator') return true; // full scope

  const node = await this.nodeRepo.findOne(nodeId);
  if (collab.scope_type === 'level') return node.depth >= collab.scope_level;
  if (collab.scope_type === 'node')
    return await this.isNodeOrDescendant(nodeId, collab.scope_node_id);
  return false;
}

async canModifyOrDelete(userId: string, nodeId: string, mapId: string): Promise<boolean> {
  if (!(await this.canEdit(userId, nodeId, mapId))) return false; // 1단계
  const collab = await this.getCollaborator(mapId, userId);
  if (collab.role === 'creator') return true;                     // 2단계-a
  const node = await this.nodeRepo.findOne(nodeId);
  return node.created_by === userId;                              // 2단계-b
}

// ltree 기반 하위 노드 여부 확인
async isNodeOrDescendant(nodeId: string, ancestorId: string): Promise<boolean> {
  const result = await this.db.query(
    `SELECT 1 FROM nodes WHERE id = $1
     AND path <@ (SELECT path FROM nodes WHERE id = $2)`,
    [nodeId, ancestorId]
  );
  return result.rowCount > 0;
}
```

---

## 10. 초대 이메일 정책

```
제목: [easymindmap] {inviterName}님이 "{mapTitle}" 맵에 초대했습니다

편집 권한: {scopeDescription}
[초대 수락하기] → https://mindmap.ai.kr/invite/accept?token={token}
(7일 후 만료)
```

### invite_token 생성

```typescript
const token = crypto.randomBytes(64).toString('hex');
const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
```
