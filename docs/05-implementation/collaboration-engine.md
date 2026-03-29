# easymindmap — Collaboration Engine 개발 명세

> Supabase Self-hosted 결정(2026-03-27) 반영:
> Phase 1에서 **Supabase Realtime**을 활용하면 WebSocket 서버 구현 공수를 절감 가능.
> 단, cursor/presence 등 세밀한 제어가 필요하므로 WS Gateway는 유지.

---

easymindmap — Collaboration Engine 개발 명세

문서 위치: docs/dev/collaboration-engine.md


1. 협업 단계
Phase 1 (V1): Lightweight Realtime
  - presence (누가 이 맵에 있는가)
  - cursor (커서 위치)
  - selection (선택 노드)
  - map patch broadcast (변경 내용 전파)

Phase 2 (V2+): Advanced Collaboration
  - optimistic merge
  - remote patch ordering
  - Yjs / CRDT adapter


2. WebSocket 이벤트 전체 목록
클라이언트 → 서버
room:join           { mapId }
room:leave          { mapId }
presence:update     { status: 'active' | 'idle' }
cursor:update       { x, y, nodeId? }
selection:update    { nodeIds: string[] }
node:editing:start  { nodeId }
node:editing:end    { nodeId }

서버 → 클라이언트
room:members        [{ userId, displayName, avatarUrl, cursor, selection }]
presence:changed    { userId, status }
cursor:changed      { userId, x, y, nodeId? }
selection:changed   { userId, nodeIds }
map:patch           { patches, version, actorId }
map:version         { version }   (버전 동기화)
node:editing:started { nodeId, userId }
node:editing:ended   { nodeId, userId }
translation:ready   { nodeId, targetLang, translatedText, textHash }
dashboard:refresh   { changedNodes: [{id, text, updatedAt}] }  (V3)
export:completed    { jobId, downloadUrl }
publish:completed   { mapId, publishUrl }


3. 아키텍처
클라이언트 A                클라이언트 B
    │                           │
    │ WSS                       │ WSS
    ▼                           ▼
WS Gateway (room 관리)
    │
    ├── presence_sessions 갱신
    ├── Redis Pub/Sub 구독
    │   channel: map:{mapId}
    │   channel: dashboard:{mapId}
    │
    ▼
API Server (patch 저장)
    │
    ▼
PostgreSQL
    │
    ├── Redis PUBLISH map:{mapId} {patch, version, actorId}
    │
    ▼
WS Gateway subscribe
    → 같은 맵의 다른 클라이언트에게 map:patch 이벤트 broadcast


4. Presence 구조
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
Presence 색상 자동 배정:
const PRESENCE_COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4',
  '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F'
];

function assignColor(userId: string, existingColors: string[]): string {
  // 사용 중이지 않은 색상 중 userId hash 기반 선택
}

5. 편집 중 노드 잠금
협업 시 같은 노드를 두 명이 동시에 편집하는 것을 막기 위한 소프트 잠금:
User A: node:editing:start { nodeId: "n1" }
    → WS Gateway broadcast: node:editing:started { nodeId: "n1", userId: "A" }
    → User B의 클라이언트: "n1" 노드 편집 UI 비활성화 (잠금 표시)

User A: node:editing:end { nodeId: "n1" }
    → WS Gateway broadcast: node:editing:ended { nodeId: "n1", userId: "A" }
    → User B: 잠금 해제

소프트 잠금 (강제 잠금 X): 타임아웃 5초 후 자동 해제.

6. 대시보드 모드 Redis Pub/Sub (V3)
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
