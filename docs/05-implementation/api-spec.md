# easymindmap — API Specification

## Base URL

```
https://api.mindmap.ai.kr/v1
```

## 인증 방식

모든 API는 JWT Bearer Token 필요 (공개 API 제외)

```
Authorization: Bearer {token}
```

---

## 1. Auth

### POST /auth/signup
회원가입

**Request Body**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response** `201 Created`
```json
{
  "userId": "u_abc123",
  "email": "user@example.com"
}
```

---

### POST /auth/login
로그인

**Request Body**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response** `200 OK`
```json
{
  "accessToken": "eyJ...",
  "refreshToken": "eyJ..."
}
```

---

### POST /auth/refresh
토큰 갱신

**Request Body**
```json
{ "refreshToken": "eyJ..." }
```

---

## 2. Maps

### POST /maps
새 맵 생성

**Request Body**
```json
{
  "title": "New Mindmap"
}
```

**Response** `201 Created`
```json
{
  "mapId": "map_xyz",
  "title": "New Mindmap",
  "createdAt": "2025-01-01T00:00:00Z"
}
```

---

### GET /maps
내 맵 목록 조회

**Response** `200 OK`
```json
{
  "maps": [
    {
      "mapId": "map_xyz",
      "title": "New Mindmap",
      "updatedAt": "2025-01-01T00:00:00Z"
    }
  ]
}
```

---

### GET /maps/{mapId}
맵 전체 데이터 조회 (노드 포함)

**Response** `200 OK`
```json
{
  "mapId": "map_xyz",
  "title": "My Map",
  "nodes": [ ...NodeObject[] ],
  "updatedAt": "2025-01-01T00:00:00Z"
}
```

---

### PATCH /maps/{mapId}
맵 메타 업데이트 (제목 등)

**Request Body**
```json
{ "title": "Updated Title" }
```

---

### DELETE /maps/{mapId}
맵 삭제 (soft delete)

**Response** `204 No Content`

---

### PATCH /maps/{mapId}/snapshot
전체 맵 스냅샷 저장 (Autosave용)

**Request Body**
```json
{
  "nodes": [ ...NodeObject[] ],
  "snapshotAt": "2025-01-01T00:00:00Z"
}
```

**Response** `200 OK`

---

## 3. Nodes

### POST /maps/{mapId}/nodes
노드 생성

**Request Body**
```json
{
  "parentId": "node_root",
  "text": "New Node",
  "layoutType": "tree-right",
  "orderIndex": 0
}
```

**Response** `201 Created`
```json
{
  "nodeId": "node_abc",
  "mapId": "map_xyz",
  "parentId": "node_root",
  "text": "New Node"
}
```

---

### PATCH /nodes/{nodeId}
노드 속성 업데이트

**Request Body** (변경 필드만 포함)
```json
{
  "text": "Updated Text",
  "layoutType": "radial-bidirectional",
  "collapsed": false,
  "style": {
    "fillColor": "#FFE08A",
    "fontSize": 16
  }
}
```

---

### DELETE /nodes/{nodeId}
노드 삭제 (하위 subtree 포함)

**Response** `204 No Content`

---

### PATCH /nodes/{nodeId}/move
노드 이동 (부모 변경)

**Request Body**
```json
{
  "newParentId": "node_xyz",
  "orderIndex": 1
}
```

---

### PATCH /nodes/{nodeId}/layout
노드 레이아웃 변경

**Request Body**
```json
{
  "layoutType": "tree-down"
}
```

---

## 4. Export

### POST /maps/{mapId}/export/markdown
Markdown 파일 Export

**Response** `200 OK`
```
Content-Type: text/markdown
Content-Disposition: attachment; filename="map.md"
```

---

### POST /maps/{mapId}/export/html
Standalone HTML Export

**Response** `200 OK`
```
Content-Type: text/html
Content-Disposition: attachment; filename="map.html"
```

---

## 5. Publish

### POST /maps/{mapId}/publish
맵을 공개 URL로 퍼블리싱

**Response** `200 OK`
```json
{
  "publishUrl": "https://mindmap.ai.kr/p/abcd1234",
  "publishedAt": "2025-01-01T00:00:00Z"
}
```

---

### DELETE /maps/{mapId}/publish
퍼블리싱 취소

**Response** `204 No Content`

---

## 6. AI Generation

### POST /ai/generate
AI 마인드맵 자동 생성

**Request Body**
```json
{
  "prompt": "Explain Kubernetes architecture",
  "maxDepth": 3,
  "maxChildrenPerNode": 5
}
```

**Response** `200 OK`
```json
{
  "markdown": "# Kubernetes\n## Node\n## Pod\n## Scheduler\n## API Server",
  "nodes": [ ...NodeObject[] ]
}
```

---

## 7. 공개 API (인증 불필요)

### GET /p/{publishId}
퍼블리시된 맵 뷰어 페이지 (HTML)

---

## 공통 에러 응답

```json
{
  "error": "UNAUTHORIZED",
  "message": "Invalid or expired token",
  "statusCode": 401
}
```

| Code | 의미 |
|------|------|
| 400 | Bad Request — 입력값 오류 |
| 401 | Unauthorized — 인증 필요 |
| 403 | Forbidden — 권한 없음 |
| 404 | Not Found |
| 409 | Conflict — 중복 데이터 |
| 500 | Internal Server Error |
