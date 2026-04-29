# 25. Map Collaboration
## COLLABORATION

* 문서 버전: v1.1
* 작성일: 2026-04-16
* 참조: `docs/01-product/functional-spec.md § COLLAB`, `docs/05-implementation/backend-architecture.md`
* 변경: Soft Lock TTL(5초) 및 creator/editor + scope 정책 정합화

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
| COLLAB-02 | 권한 변경                | creator가 editor의 scope(level/node) 수정 | 권한 설정 UI           |
| COLLAB-03 | 협업자 제거               | 맵에서 특정 협업자 삭제                       | 멤버 관리              |
| COLLAB-04 | 실시간 편집 동기화           | 편집 내용 즉시 전파 (Supabase Realtime)     | WebSocket           |
| COLLAB-05 | LWW 충돌 정책            | 마지막 쓰기 우선 (Last-Write-Wins)         | timestamp 비교       |
| COLLAB-06 | 변경 수신 및 반영           | 원격 편집 수신 → Document Store 반영        | CRDT-like 병합       |
| COLLAB-07 | 커서 공유                | 협업자 커서 위치 실시간 표시 (이름 + 색상)          | Presence           |
| COLLAB-08 | Soft Lock            | 노드 편집 시 Soft Lock 설정 (다른 사람 편집 경고) | Lock 표시            |
| COLLAB-09 | Lock 해제              | 편집 완료 또는 timeout(5s) 후 자동 해제        | 자동 해제              |
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

#### 4.2 map_collaborators 테이블 (물리 스키마 기준)

```sql
CREATE TABLE public.map_collaborators (
  map_id      UUID NOT NULL REFERENCES public.maps(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role        VARCHAR(20) NOT NULL,
              -- 'creator' | 'editor'
  scope_type  VARCHAR(20) NOT NULL,
              -- 'full' (creator 전용) | 'level' | 'node'
  scope_level INT NULL,
  scope_node_id UUID NULL REFERENCES public.nodes(id) ON DELETE CASCADE,
  invited_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (map_id, user_id)
);
```

> 구현 기준: `docs/02-domain/collaboration-schema.sql`의 `map_collaborators` 테이블을 사용한다.

#### 4.2.1 권한 모델 분리 원칙

**workspace_members**
- 워크스페이스 단위 접근 제어
- `owner / editor / viewer` 역할 사용
- 워크스페이스 소속 맵 접근 권한의 상위 기반

**map_collaborators**
- 협업맵 전용 편집 참여자
- `creator / editor` 역할만 사용
- `viewer`는 퍼블리시/공유 모델로 처리
- 소유권 이양, 협업 편집 범위, creator 권한 추적은 `map_collaborators` 기준으로 처리

**정리 (3가지 핵심 차이)**
1. `workspace_members`는 워크스페이스 단위 접근(읽기) 권한을 관리하고, `map_collaborators`는 특정 맵 단위 편집(쓰기) 권한을 관리한다.
2. `workspace_members`에 속한다고 해서 해당 워크스페이스의 모든 맵을 편집할 수 있는 것은 아니다 — 편집하려면 해당 맵의 `map_collaborators`에 등록되어야 한다.
3. `map_collaborators`의 `editor` 역할은 `scope` 설정(`level` 또는 `node`)으로 편집 가능 노드 범위를 제한할 수 있어, `workspace_members` 역할보다 세밀한 권한 제어가 가능하다.

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
// TTL: 5초
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
PATCH /maps/{mapId}/nodes
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
* Soft Lock TTL: 5초 (비활동 시 자동 해제)
* 협업자 최대 수: 20명/맵
* Thread 메시지 최대 길이: 2000자
* @멘션: `@displayName` 형식, 알림 전송

---

### 7. 예외 / 경계 (Edge Case)

* **네트워크 단절**: 로컬 편집 유지 → 재연결 시 병합 동기화
* **Soft Lock 충돌**: 다른 사람 편집 중인 노드 편집 시 "OOO이 편집 중입니다" 경고
* **역할 변경 중 편집**: 변경 완료 전 편집 내용 보존 후 권한 재적용
* **초대 만료**: 7일 후 초대 링크 만료 (API 응답 `invite_expires_at` 기준)

---

### 8. 권한 규칙

| 역할      | 편집 | 초대 | Thread | AI 사용 |
| ------- | -- | -- | ------ | ------ |
| creator | ✅  | ✅  | ✅      | solo만  |
| editor  | ✅  | ❌  | ✅      | solo만  |

---

### 9. DB 영향

* `map_collaborators` — 협업자 초대 및 역할
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

---

## 13. 권한 정책 상세

### 13.1 역할 종류 (2종만 존재)

| 역할 코드 | DB 역할명 | 명칭 | 설명 |
|---|---|---|---|
| `creator` | `collab_creator` | 맵 생성자 | 맵을 처음 만든 사람. 맵 전체(full scope) 권한. 동시에 1명만 존재. |
| `editor` | `collab_editor` | 편집 참여자 | 초대받은 협업자. 지정된 scope 내 편집 권한. |

> **viewer 역할 없음**: 협업맵 역할 체계에 viewer를 두지 않는다. 단순 조회(읽기) 권한 부여는 협업맵이 아니며, `published_maps`(퍼블리싱) 기능으로 별도 처리한다.

### 13.2 Scope 종류 (3가지)

| scope_type | 배정 가능 역할 | 설명 |
|---|---|---|
| `full` | **creator 전용** | 맵 전체 편집. creator 자동 배정, 변경 불가. |
| `level` | editor만 | `scope_level` 이상의 depth 노드 편집 가능 (depth ≥ scope_level) |
| `node` | editor만 | `scope_node_id` 지정 노드 및 모든 하위 노드 편집 가능 |

> **규칙**: editor에게 `full` scope 배정 불가. 초대 시 반드시 `level` 또는 `node`를 지정해야 한다.

**`level` scope 상세 규칙:**
- `scope_level = 3` → depth ≥ 3 인 노드만 편집 가능
- depth 1(root), 2 노드는 읽기 전용

**`node` scope 상세 규칙:**
- `scope_node_id` 로 지정된 노드 + 해당 노드의 모든 하위 노드 편집 가능
- 지정 노드의 부모/형제는 읽기 전용

### 13.3 2-stage 권한 검사 알고리즘

```
수정/삭제 가능 = (1단계: scope 내 노드?) AND (2단계: 본인 작성 OR creator?)

function canEdit(userId, nodeId, mapId):
  collab = getCollaborator(mapId, userId)
  if not collab: return false
  if collab.role == 'creator': return true  // full scope
  if collab.scope_type == 'level': return node.depth >= collab.scope_level
  if collab.scope_type == 'node': return isNodeOrDescendant(nodeId, collab.scope_node_id)
  return false

function canModifyOrDelete(userId, nodeId, mapId):
  // 1단계: scope 내인지 먼저 확인
  if not canEdit(userId, nodeId, mapId):
    return false
  // 2단계: creator는 scope 내 모든 노드 가능
  if collab.role == 'creator':
    return true
  // 3단계: editor는 본인 작성 노드만
  return node.created_by == userId
```

### 13.4 Creator 양도 트랜잭션 (atomic SQL)

creator는 현재 `active` 상태인 editor 1명에게 creator 권한을 이양할 수 있다. 이양 후 기존 creator는 `editor` 역할로 변경되며, 이양 이력은 `map_ownership_history`에 영구 보관된다.

```sql
BEGIN;
  UPDATE map_collaborators SET role = 'editor'
  WHERE map_id = :mapId AND user_id = :fromUserId AND role = 'creator';

  UPDATE map_collaborators SET role = 'creator'
  WHERE map_id = :mapId AND user_id = :toUserId;

  UPDATE maps SET owner_id = :toUserId WHERE id = :mapId;

  INSERT INTO map_ownership_history (map_id, from_user_id, to_user_id, note)
  VALUES (:mapId, :fromUserId, :toUserId, :note);
COMMIT;
```

---

## 14. 실시간 통신 아키텍처

### 14.1 Supabase Realtime vs Redis Pub/Sub 역할 분리

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

### 14.2 채널 라우팅 테이블

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

### 14.3 WebSocket 이벤트 페이로드 정의

**서버 → 클라이언트**

| 이벤트 | 페이로드 | 전송 채널 |
|--------|---------|-----------|
| `map:patch` | `{ patches, version, actorId }` | Redis Pub/Sub |
| `node:editing:started` | `{ nodeId, userId }` | Redis Pub/Sub |
| `node:editing:ended` | `{ nodeId, userId }` | Redis Pub/Sub |
| `translation:ready` | `{ nodeId, targetLang, translatedText, textHash }` | Redis Pub/Sub |
| `presence:changed` | `{ userId, status }` | Supabase Realtime |
| `cursor:changed` | `{ userId, x, y, nodeId? }` | Supabase Realtime |
| `selection:changed` | `{ userId, nodeIds }` | Supabase Realtime |

**클라이언트 → 서버**

| 이벤트 | 페이로드 |
|--------|---------|
| `node:editing:start` | `{ nodeId }` |
| `node:editing:end` | `{ nodeId }` |
| `presence:update` | `{ status: 'active' \| 'idle' }` |
| `cursor:update` | `{ x, y, nodeId? }` |
| `selection:update` | `{ nodeIds: string[] }` |

### 14.4 Presence 상태 구조 TypeScript 인터페이스

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

// Supabase Realtime Presence payload
type PresencePayload = {
  userId: string;
  displayName: string;
  color: string;          // 할당된 hex 색상
  cursor?: { x: number; y: number };
  selectedNodeId?: string | null;
  lastActiveAt: string;   // ISO 8601
};
```

### 14.5 Presence 색상 할당 알고리즘 (8색 팔레트)

```typescript
const PRESENCE_COLORS = [
  '#FF6B6B', // 빨강
  '#4ECDC4', // 청록
  '#45B7D1', // 하늘
  '#96CEB4', // 민트
  '#FFEAA7', // 노랑
  '#DDA0DD', // 보라
  '#98D8C8', // 연초록
  '#F7DC6F', // 연노랑
];

function assignColor(userId: string, existingColors: string[]): string {
  // 사용 중이지 않은 색상 중 userId hash 기반 선택
  // 재입장 시 동일한 userId면 기존 색상 재사용
  // (다른 참여자가 사용 중이면 차순위 색상 배정)
}
```

| 항목 | 정책 |
|------|------|
| 색상 풀 | 최대 8색 (HSL 기반 분산 배치) |
| 할당 시점 | 참여자가 맵 세션에 입장 시 서버에서 `map_collaborators.session_color` 임시 할당 |
| 재입장 시 | 동일한 userId면 기존 색상 재사용 (다른 참여자가 사용 중이면 차순위 색상) |
| 표시 대상 | cursor 테두리, 선택 노드 하이라이트, 이름 배지 배경 |

### 14.6 Soft Lock TTL

> **소스 기준 TTL: 5초** (기존 §6 COLLAB-09의 30초와 다름 — 소스 명세 우선 적용)

소프트 잠금(Soft Lock)은 강제 잠금이 아니다. 사용자가 `node:editing:start` 이벤트를 보내면 해당 노드가 잠금 상태로 표시되며, **타임아웃 5초 후 자동 해제**된다.

```
User A: node:editing:start { nodeId: "n1" }
    → WS Gateway broadcast: node:editing:started { nodeId: "n1", userId: "A" }
    → User B의 클라이언트: "n1" 노드 편집 UI 비활성화 (잠금 표시)

User A: node:editing:end { nodeId: "n1" }  // 또는 5초 TTL 만료
    → WS Gateway broadcast: node:editing:ended { nodeId: "n1", userId: "A" }
    → User B: 잠금 해제
```

---

## 15. 권한 Guard 파이프라인

모든 노드 CRUD API에 아래 5단계 순서로 인가(authorization)를 검사한다.

```
요청 (예: PATCH /nodes/:id)
    │
    ▼ ① JWT 인증 → userId 추출
    ▼ ② map_collaborators 참여자 확인 (없으면 403 Forbidden)
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

### permission.service.ts 핵심 구현

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

## 16. API 엔드포인트 상세

> **Base URL**: `https://api.mindmap.ai.kr/v1`
> **인증**: 모든 엔드포인트 `Authorization: Bearer {accessToken}` 필수

### 16.1 협업자 초대 API

```
POST /maps/:mapId/collaborators
```

> creator 권한 필요. 초대 토큰 유효 기간: **7일**

**Request Body**

```json
{
  "email": "b@example.com",
  "scope_type": "level",
  "scope_level": 3,
  "scope_node_id": null
}
```

| 필드 | 타입 | 필수 | 설명 |
|---|---|:---:|---|
| `email` | string | ✅ | 초대할 사용자 이메일 |
| `scope_type` | `"level"` \| `"node"` | ✅ | **`"full"` 선택 불가** (editor 전용 제한) |
| `scope_level` | number | scope_type=level 시 | depth ≥ scope_level 편집 가능 |
| `scope_node_id` | string(UUID) | scope_type=node 시 | 해당 노드+하위 편집 가능 |

**Response `201 Created`**

```json
{
  "id": "collab-uuid",
  "map_id": "map-uuid",
  "email": "b@example.com",
  "role": "editor",
  "scope_type": "level",
  "scope_level": 3,
  "scope_node_id": null,
  "status": "pending",
  "invite_expires_at": "2026-04-12T00:00:00Z"
}
```

**에러 코드**

| HTTP | 에러 코드 | 설명 |
|---|---|---|
| 400 | `INVALID_SCOPE` | editor에게 full scope를 배정할 수 없습니다. |
| 400 | `SCOPE_PARAM_REQUIRED` | scope_type=level 시 scope_level이 필요합니다. |
| 403 | `FORBIDDEN` | 협업자 초대는 creator만 가능합니다. |
| 409 | `ALREADY_INVITED` | 이미 초대된 사용자입니다. |

### 16.2 권한 변경 API

```
PATCH /maps/:mapId/collaborators/:collaboratorId
```

> creator 권한 필요. `scope_type: "full"` 지정 시 `400 INVALID_SCOPE` 반환.

**Request Body**

```json
{
  "scope_type": "node",
  "scope_node_id": "node-uuid"
}
```

**Response `200 OK`**: 업데이트된 collaborator 객체 반환

### 16.3 소유권 양도 API

```
PATCH /maps/:mapId/transfer-ownership
```

> 현재 creator만 호출 가능

**Request Body**

```json
{
  "to_user_id": "editor-uuid",
  "note": "장기 출장으로 인해 이양합니다."
}
```

**Response `200 OK`**

```json
{
  "map_id": "map-uuid",
  "previous_creator_id": "a-uuid",
  "new_creator_id": "b-uuid",
  "transferred_at": "2026-04-05T12:00:00Z"
}
```

**에러 코드**

| HTTP | 에러 코드 | 설명 |
|---|---|---|
| 400 | `INVALID_TARGET` | 대상 사용자가 이 맵의 active editor가 아닙니다. |
| 403 | `FORBIDDEN` | creator 권한이 없습니다. |

**WS 이벤트**: 양도 완료 시 `collab:ownership_transferred { newCreatorId }` 전체 참여자에게 전송

### 16.4 내 권한 조회 API

```
GET /maps/:mapId/my-permissions
```

클라이언트가 이 응답을 캐시하여 편집 가능 노드에만 편집 UI를 표시한다.

**Response `200 OK`**

```json
{
  "role": "editor",
  "scope_type": "level",
  "scope_level": 3,
  "scope_node_id": null,
  "can_invite": false,
  "can_transfer_ownership": false,
  "can_modify_others_nodes": false
}
```

### 16.5 에러 코드 전체 목록

| 에러 코드 | HTTP | 발생 조건 |
|---|---|---|
| `INVALID_SCOPE` | 400 | editor에게 full scope 배정 시도 |
| `SCOPE_PARAM_REQUIRED` | 400 | scope_type=level 인데 scope_level 누락 |
| `FORBIDDEN` | 403 | creator 전용 API를 editor가 호출 |
| `ALREADY_INVITED` | 409 | 동일 (map_id, user_id) 조합이 이미 존재 |
| `INVITE_EXPIRED` | 410 | 7일 만료된 초대 토큰으로 수락 시도 |
| `INVITE_NOT_FOUND` | 404 | 유효하지 않은 초대 토큰 |
| `LOGIN_REQUIRED` | 401 | 초대 수락 시 미로그인 상태 |
| `INVALID_TARGET` | 400 | 소유권 양도 대상이 active editor가 아님 |
