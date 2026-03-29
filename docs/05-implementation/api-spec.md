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

### [변경 주석]
- 위 설명은 "Bearer Token 사용" 관점에서는 그대로 유효하다.
- 다만 현재 최신 아키텍처 기준으로 이 토큰은 **Supabase Auth가 발급하는 JWT**로 이해하는 것이 맞다.
- 즉, API 사용 방식은 비슷하지만 토큰 발급/검증 책임은 자체 JWT 서버가 아니라 Supabase Auth에 있다.

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

### [변경 주석]
- 최신 설계 기준으로는 title 외에도 아래 필드까지 PATCH 대상이 될 수 있다.
  - viewMode
  - refreshIntervalSeconds
- 즉, dashboard 기능(V3)까지 고려하면 map 메타 PATCH 범위를 더 넓게 잡는 편이 좋다.

---

### DELETE /maps/{mapId}
맵 삭제 (soft delete)

**Response** `204 No Content`

---

### PATCH /maps/{mapId}/document
맵 변경 patch 저장 (Autosave용)

**Request Body**
```json
{
  "nodes": [ ...NodeObject[] ],
  "snapshotAt": "2025-01-01T00:00:00Z"
}
```

**Response** `200 OK`

### [변경 주석 - 매우 중요]
- 위 `/snapshot` 설명은 초기 autosave 설계 단계의 흔적이다.
- 최신 autosave-engine / backend-architecture / system-architecture 문맥 기준으로는
  autosave API가 **snapshot 방식이 아니라 patch 방식**으로 변경되었다.
- 따라서 실제 구현 기준의 최신 권장 엔드포인트는 아래와 같다.

```http
PATCH /maps/{mapId}/document
```

#### 최신 권장 Request Body (patch 기반)
```json
{
  "clientId": "cli_abc123",
  "patchId": "p_1710598325_001",
  "baseVersion": 128,
  "timestamp": "2026-03-16T14:32:05.123Z",
  "patches": [
    { "op": "updateNodeText", "nodeId": "node_1", "text": "Updated Text" },
    { "op": "moveNode", "nodeId": "node_2", "parentId": "node_root", "orderIndex": 3 }
  ]
}
```

#### 최신 권장 Response
```json
{
  "newVersion": 129
}
```

#### 정리
- 기존 문서의 `/snapshot` 설명은 참고용 legacy 흐름으로 남겨둘 수 있다.
- 그러나 **실제 개발 착수 기준 문서**로는 `/maps/{mapId}/document` patch API를 우선 사용해야 한다.

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

### [변경 주석]
- 실제 생성 로직에서는 text 외에도 아래 기본값 상속이 함께 고려되어야 한다.
  - shapeType
  - style.fillColor
  - 기타 style 기본값
- 즉, 단순 CRUD 문서로는 위 Request가 최소 예시이고,
  실제 Command/Service 계층에서는 "기준 노드 스타일 상속" 로직이 추가된다.

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

### [변경 주석]
- 최신 DB 컬럼명은 `style_json`이지만,
  API 요청/응답에서는 프론트엔드 친화적으로 `style` 이름을 유지하는 것이 자연스럽다.
- 즉:
  - API 모델: style
  - DB 컬럼: style_json
- 이 변환은 repository/service 계층에서 처리한다.

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

### [변경 주석]
- 초기 문서에서는 동기 다운로드형처럼 보이지만,
  최신 schema.sql에는 `exports` 테이블이 존재한다.
- 따라서 구현이 커지면 아래처럼 job 기반으로 확장될 수 있다.
  - export 요청
  - exports 테이블에 status=pending 기록
  - worker 처리
  - 완료 후 storage_path 반환
- MVP에서는 즉시 응답형으로 시작하고,
  파일 크기/복잡도가 커지면 job 방식으로 전환하는 전략이 적절하다.

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

### [변경 주석]
- 최신 worker / ai_jobs 구조까지 반영하면,
  AI 생성도 즉시 응답형과 비동기 job형 둘 다 가능하다.
- 초기 MVP는 즉시 응답형으로 충분하지만,
  긴 응답/고비용 모델 사용 시 아래 확장도 고려할 수 있다.
  - POST /ai/generate → job 생성
  - GET /ai/jobs/{jobId} → 상태 조회

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

### [변경 주석]
- patch 기반 autosave로 전환되면 409 Conflict 의미가 특히 중요해진다.
- 예:
  - baseVersion != currentVersion
  - 이미 처리된 patchId와 충돌
- 따라서 autosave 관련 에러 문서에서는 409를 좀 더 자세히 별도 설명하는 것이 좋다.
