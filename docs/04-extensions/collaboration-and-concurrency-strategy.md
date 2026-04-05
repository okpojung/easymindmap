# Collaboration & Concurrency Strategy

> **문서 위치**: `docs/04-extensions/collaboration-and-concurrency-strategy.md`
> **버전**: v2.0
> **최종 업데이트**: 2026-04-05
> **변경 이력**: v2.0 — 협업맵 정의·역할·scope·권한 규칙 전면 확정 반영

---

## 1. 협업맵 정의

### 1-1. 협업맵이란

맵 생성자(creator)가 **1명 이상의 다른 사용자를 editor로 초대**한 맵이다.

| 조건 | 협업맵 여부 |
|---|:---:|
| 생성자 혼자 사용 | ❌ |
| 생성자 + editor 1명 이상 초대 | ✅ |
| 읽기 전용(viewer)만 공유 | ❌ → 퍼블리싱 기능으로 처리 |

> **핵심 원칙**: 단순 조회(읽기) 권한 부여는 협업맵이 아니다.
> 읽기 전용 공유는 `published_maps`(퍼블리싱) 기능으로 별도 처리한다.

---

## 2. 역할 체계

### 2-1. 역할 종류 (2종만 존재)

| 역할 코드 | 명칭 | 설명 |
|---|---|---|
| `creator` | 맵 생성자 | 맵을 처음 만든 사람. 맵 전체(full scope) 권한. 동시에 1명만 존재. |
| `editor` | 편집 참여자 | 초대받은 협업자. 지정된 scope 내 편집 권한. |

> **viewer 역할 없음**: 협업맵 역할 체계에 viewer를 두지 않는다.

### 2-2. 역할별 권한 매트릭스

| 기능 | creator | editor |
|---|:---:|:---:|
| 협업자 초대 | ✅ | ❌ |
| 협업자 강제 탈퇴 | ✅ | ❌ |
| 편집 범위(scope) 설정 | ✅ | ❌ |
| 맵 제목 수정 / 맵 삭제 | ✅ | ❌ |
| 소유권 이양 | ✅ | ❌ (수신 가능) |
| scope 내 노드 추가 | ✅ | ✅ |
| scope 내 **본인 작성** 노드 수정/삭제 | ✅ | ✅ |
| scope 내 **타인 작성** 노드 수정/삭제 | ✅ | ❌ |
| scope 밖 노드 모든 작업 | ✅ (full scope) | ❌ |

---

## 3. 편집 범위(Scope) 시스템

### 3-1. Scope 종류

| scope_type | 배정 가능 역할 | 설명 |
|---|---|---|
| `full` | **creator 전용** | 맵 전체 편집. creator 자동 배정, 변경 불가. |
| `level` | editor만 | `scope_level` 이상의 depth 노드 편집 가능 (depth ≥ scope_level) |
| `node` | editor만 | `scope_node_id` 지정 노드 및 모든 하위 노드 편집 가능 |

> **규칙**: editor에게 `full` scope 배정 불가. 초대 시 반드시 `level` 또는 `node`를 지정해야 한다.

### 3-2. Scope 적용 규칙

**`level` scope:**
- `scope_level = 3` → depth ≥ 3 인 노드만 편집 가능
- depth 1(root), 2 노드는 읽기 전용

**`node` scope:**
- `scope_node_id` 로 지정된 노드 + 해당 노드의 모든 하위 노드 편집 가능
- 지정 노드의 부모/형제는 읽기 전용

### 3-3. 수정/삭제 권한 2단계 확인

```
수정/삭제 가능 = (1단계: scope 내 노드?) AND (2단계: 본인 작성 OR creator?)

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

### 3-4. 최종 권한 매트릭스

```
                    creator          editor(level)      editor(node)
                    (full scope)     (depth >= N)       (nodeX + 하위)
────────────────────────────────────────────────────────────────────
노드 추가           맵 전체 OK       depth>=N 범위만    nodeX 하위만
본인 노드 수정/삭제 맵 전체 OK       depth>=N 범위만    nodeX 하위만
타인 노드 수정/삭제 맵 전체 OK       ❌ 불가            ❌ 불가
scope 밖 모든 작업  없음(full)        ❌ 불가            ❌ 불가
────────────────────────────────────────────────────────────────────
```

---

## 4. 협업맵 생명주기

### 4-1. 협업맵 생성 플로우

```
[일반 맵]
    │  creator가 editor 초대 (scope 지정)
    ▼
[map_collaborators INSERT, status: pending]
    │  초대 이메일 발송 (7일 만료 링크)
    ▼
[editor 수락]
    │  status: active, maps.is_collaborative = true
    ▼
[협업맵 활성]
```

### 4-2. 협업자 상태 전이

```
pending → (수락) → active
pending → (거절/만료) → rejected
active  → (creator 강제 제거) → removed
```

### 4-3. 협업맵 해제

- 모든 editor가 removed 상태가 되면 `maps.is_collaborative = false` 로 전환

---

## 5. 소유권 이양 (Creator Transfer)

### 5-1. 정책

- creator는 현재 `active` 상태인 editor 1명에게 creator 권한을 이양할 수 있다
- 이양 후 기존 creator는 `editor` 역할로 변경
- creator는 동시에 1명만 존재 (DB 부분 유니크 인덱스로 강제)
- 이양 이력은 `map_ownership_history`에 영구 보관 (감사용)

### 5-2. 이양 트랜잭션

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

## 6. 실시간 동시/개별 편집 정책

### 6-1. 접속 유형

- 협업 멤버 **전원 동시 접속** 편집 가능
- 멤버 **일부만 접속** 편집 가능 (혼자 편집도 허용)
- 미접속 멤버는 다음 접속 시 최신 상태 로드

### 6-2. 충돌 처리 단계

| Phase | 방식 | 설명 |
|---|---|---|
| Phase 1 (V1) | Last Write Wins | 단순, 초기 MVP에 적합 |
| Phase 2 (V2) | Node Lock (soft) | 같은 노드 동시 편집 시 편집 중 표시, 5초 타임아웃 |
| Phase 3 (V3+) | CRDT (Yjs) | 완전한 동시 편집 지원 |

### 6-3. Optimistic UI

```
UI 먼저 반영 → 서버 요청 → 실패 시 rollback
```

### 6-4. 동기화 흐름

```
UI → Local Store → PATCH /nodes/:id → Redis Pub/Sub → WS Gateway → 협업자 브로드캐스트
```

---

## 7. WebSocket 이벤트 (협업 관련 추가)

| 방향 | 이벤트명 | Payload | 설명 |
|---|---|---|---|
| S→C | `collab:permission_changed` | `{ userId, newScope }` | creator가 scope 변경 시 |
| S→C | `collab:member_removed` | `{ userId }` | 강제 탈퇴 시 해당 유저 연결 종료 |
| S→C | `collab:member_joined` | `{ userId, displayName }` | 새 editor 수락 시 |
| S→C | `collab:ownership_transferred` | `{ newCreatorId }` | 소유권 이양 발생 시 |
| C→S | `node:editing_start` | `{ nodeId }` | 노드 편집 시작 (soft lock) |
| C→S | `node:editing_end` | `{ nodeId }` | 노드 편집 종료 |
| S→C | `node:editing_lock` | `{ nodeId, userId, color }` | 다른 사람이 편집 중 알림 |
| S→C | `node:editing_unlock` | `{ nodeId }` | 편집 잠금 해제 |

---

## 8. AI Usage Restriction in Collaboration

> 관련 PRD: `docs/01-product/AI-Executable-Workflow-PRD.md` §10.8

### Rule

동시 접속자 수 ≥ 2인 협업 상태에서는 AI 기능을 사용할 수 없다.

```
접속자 수 = 1  →  AI 기능 사용 가능
접속자 수 ≥ 2  →  AI 기능 비활성화
```

### 적용 대상

| 기능 | 제한 여부 |
|---|:---:|
| AI Generate (POST /ai/generate) | ✅ 제한 |
| AI Expand (POST /ai/expand) | ✅ 제한 |
| AI Workflow Generate (POST /ai/workflow/generate) | ✅ 제한 |
| AI Workflow Resolve (POST /ai/workflow/resolve) | ✅ 제한 |
| AI Workflow Cleanup (POST /ai/workflow/cleanup) | ✅ 제한 |
| 일반 편집 (노드 추가/수정/삭제) | ❌ 제한 없음 |

### 서버 정책

협업 상태에서 AI API 호출 시:
```json
HTTP 403 Forbidden
{
  "error": "AI_UNAVAILABLE_IN_COLLABORATION",
  "message": "협업 중에는 AI 자동 생성/확장 기능을 사용할 수 없습니다.",
  "statusCode": 403
}
```

### UI 정책

- 협업 상태에서는 AI 버튼 disabled 처리
- 안내 메시지: "협업 중에는 AI 자동 생성/확장 기능을 사용할 수 없습니다."
- 접속자가 1명으로 줄어들면 AI 버튼 자동 활성화
