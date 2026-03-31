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
| `dashboard:refresh` | `{ changedNodes: [{id, text, updatedAt}] }` (V3) | Redis Pub/Sub |
| `export:completed` | `{ jobId, downloadUrl }` | Redis Pub/Sub |
| `publish:completed` | `{ mapId, publishUrl }` | Redis Pub/Sub |

---

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
