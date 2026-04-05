# 협업맵 API 명세 (추가)

> **파일**: `docs/05-implementation/collaboration-api.md` (신규)
> **버전**: v1.0 (2026-04-05)
> **기존 API 명세 파일**: `docs/05-implementation/api-spec.md`에 아래 섹션을 추가한다.

---

## 8. Collaboration (협업맵)

> **Base URL**: `https://api.mindmap.ai.kr/v1`
> **인증**: 모든 엔드포인트 `Authorization: Bearer {accessToken}` 필수

---

### 8-1. 협업자 초대

```
POST /maps/:mapId/collaborators
```

> creator 권한 필요

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

**Error**
```json
// 400 — full scope 요청 시
{ "error": "INVALID_SCOPE", "message": "editor에게 full scope를 배정할 수 없습니다." }

// 400 — scope 파라미터 누락
{ "error": "SCOPE_PARAM_REQUIRED", "message": "scope_type=level 시 scope_level이 필요합니다." }

// 403 — creator 아닌 경우
{ "error": "FORBIDDEN", "message": "협업자 초대는 creator만 가능합니다." }

// 409 — 이미 초대된 사용자
{ "error": "ALREADY_INVITED", "message": "이미 초대된 사용자입니다." }
```

---

### 8-2. 협업자 목록 조회

```
GET /maps/:mapId/collaborators
```

> 해당 맵 참여자 누구나 조회 가능

**Response `200 OK`**
```json
{
  "collaborators": [
    {
      "id": "collab-uuid",
      "user_id": "user-uuid",
      "display_name": "홍길동",
      "email": "b@example.com",
      "avatar_url": "https://...",
      "role": "editor",
      "scope_type": "level",
      "scope_level": 3,
      "scope_node_id": null,
      "status": "active",
      "invited_at": "2026-04-05T10:00:00Z",
      "accepted_at": "2026-04-05T11:00:00Z"
    }
  ]
}
```

---

### 8-3. 편집 범위(scope) 변경

```
PATCH /maps/:mapId/collaborators/:collaboratorId
```

> creator 권한 필요

**Request Body**
```json
{
  "scope_type": "node",
  "scope_node_id": "node-uuid"
}
```

> `scope_type: "full"` 불가. 에러: `400 INVALID_SCOPE`

**Response `200 OK`**: 업데이트된 collaborator 객체

---

### 8-4. 협업자 강제 탈퇴

```
DELETE /maps/:mapId/collaborators/:collaboratorId
```

> creator 권한 필요

**Response `200 OK`**
```json
{
  "removed_user_id": "user-uuid",
  "map_is_collaborative": false
}
```

**처리 내역**:
- `map_collaborators.status = 'removed'`, `removed_at = now()`
- WS 이벤트: `collab:member_removed { userId }` → 해당 유저 소켓 강제 퇴장
- 잔류 노드 삭제하지 않음 (`nodes.created_by` 기록 유지)
- 모든 editor가 removed 되면 `maps.is_collaborative = false`

---

### 8-5. 초대 수락

```
POST /invite/accept
```

> 인증 불필요 (토큰 기반), 단 로그인 상태 확인 후 처리

**Request Body**
```json
{
  "token": "invite-token-string"
}
```

**Response `200 OK`**
```json
{
  "map_id": "map-uuid",
  "map_title": "우리 팀 기획서",
  "role": "editor",
  "scope_type": "level",
  "scope_level": 3,
  "redirect_url": "https://mindmap.ai.kr/maps/map-uuid"
}
```

**Error**
```json
// 401 — 미로그인 시 (로그인 후 리다이렉트)
{ "error": "LOGIN_REQUIRED", "redirectAfterLogin": "/invite/accept?token=..." }

// 410 — 만료된 토큰
{ "error": "INVITE_EXPIRED", "message": "초대 링크가 만료되었습니다. 다시 초대를 요청하세요." }

// 404 — 유효하지 않은 토큰
{ "error": "INVITE_NOT_FOUND" }
```

---

### 8-6. 소유권 이양

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

**Error**
```json
// 400 — to_user_id가 active editor가 아닌 경우
{ "error": "INVALID_TARGET", "message": "대상 사용자가 이 맵의 active editor가 아닙니다." }

// 403 — creator 아닌 경우
{ "error": "FORBIDDEN" }
```

**WS 이벤트**: `collab:ownership_transferred { newCreatorId }` 전체 참여자에게 전송

---

### 8-7. 소유권 이양 이력 조회

```
GET /maps/:mapId/ownership-history
```

**Response `200 OK`**
```json
{
  "history": [
    {
      "from_user": { "id": "a-uuid", "display_name": "김철수" },
      "to_user":   { "id": "b-uuid", "display_name": "이영희" },
      "transferred_at": "2026-04-05T12:00:00Z",
      "note": "장기 출장으로 인해 이양합니다."
    }
  ]
}
```

---

### 8-8. 내 편집 권한 조회 (클라이언트 캐시용)

```
GET /maps/:mapId/my-permissions
```

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

> 클라이언트는 이 응답을 캐시하여 편집 가능 노드에만 편집 UI를 표시한다.

---


### 8-9. 맵 채팅 메시지 조회

```
GET /maps/:mapId/chat/messages
```

**Query**: `limit=50&beforeMessageId=uuid&includeTranslations=true`

**Response `200 OK`**
```json
{
  "messages": [
    {
      "id": "msg-uuid",
      "map_id": "map-uuid",
      "node_id": null,
      "user": { "id": "user-uuid", "display_name": "홍길동" },
      "text": "이 구조 다시 봐주세요",
      "source_lang": "ko",
      "translations": {
        "en": "Please review this structure again."
      },
      "created_at": "2026-04-05T12:10:00Z"
    }
  ]
}
```

---

### 8-10. 맵 채팅 메시지 생성

```
POST /maps/:mapId/chat/messages
```

**Request Body**
```json
{
  "clientMsgId": "cmsg_1712300000000_001",
  "text": "이 구조 다시 봐주세요",
  "nodeId": "node-uuid-optional"
}
```

**정책**
- `nodeId`가 있으면 map chat에도 보이지만 node thread로도 연결된다.
- unread count / read receipt는 생성하지 않는다.
- 서버는 원문 저장 후 targetLang별 번역 worker만 enqueue 한다.

---

### 8-11. Node Thread 메시지 조회

```
GET /nodes/:nodeId/threads/messages
```

특정 node에 연결된 문맥형 대화만 조회한다.

---

### 8-12. Node Thread 메시지 생성

```
POST /nodes/:nodeId/threads/messages
```

**Request Body**
```json
{
  "clientMsgId": "cmsg_1712300000000_002",
  "text": "DTO 분리 필요해 보여요"
}
```

---

### 8-13. Node Thread AI 요약 Preview

```
POST /nodes/:nodeId/threads/ai/summarize
```

**Response `202 Accepted`**
```json
{
  "job_id": "ai-job-uuid",
  "mode": "preview",
  "status": "queued"
}
```

---

### 8-14. Node Thread AI 작업 추출 Preview

```
POST /nodes/:nodeId/threads/ai/tasks
```

AI가 action item / 담당자 후보 / 기한 후보를 추출한다.

---

### 8-15. Node Thread AI 작업 노드 생성

```
POST /nodes/:nodeId/threads/ai/task-nodes
```

**Request Body**
```json
{
  "mode": "apply",
  "approved_tasks": [
    {
      "title": "DTO 분리 설계 문서 작성",
      "assignee_user_id": "user-uuid",
      "due_date": "2026-04-06"
    }
  ]
}
```

> `mode=preview`에서는 생성될 노드 구조만 반환하고, `mode=apply`에서만 실제 node 생성 patch를 발생시킨다.

---

### 8-16. Collaboration WS 이벤트 추가

| 방향 | 이벤트명 | Payload | 설명 |
|---|---|---|---|
| C→S | `chat:message:send` | `{ mapId, clientMsgId, text, nodeId? }` | map chat / node thread 메시지 송신 |
| S→C | `chat:message` | `{ messageId, mapId, nodeId?, userId, text, createdAt }` | 원문 메시지 수신 |
| S→C | `chat:translation:ready` | `{ messageId, targetLang, translatedText }` | 채팅 번역 결과 |
| S→C | `node:thread:updated` | `{ nodeId, messageCount, lastMessageAt }` | node 댓글 수 갱신 |
| C→S | `node:thread:ai:run` | `{ nodeId, action }` | AI preview 실행 |
| S→C | `node:thread:ai:preview` | `{ nodeId, action, summary?, tasks? }` | AI 결과 preview |

---

## 9. api-spec.md 섹션 0.4 권한 모델 수정 내용

기존 `api-spec.md` 섹션 0.4의 권한 모델 테이블에 아래 행 추가:

```markdown
| `collab_creator` | ✅ | ✅ (full scope) | ✅ | ✅ (full scope) |
| `collab_editor`  | ✅ (scope 내) | ✅ (scope 내 본인 노드) | ✅ | ✅ (scope 내) |
```

> 기존 `editor` (workspace member) 역할과 협업맵 `collab_editor`는 별개임을 명시.
