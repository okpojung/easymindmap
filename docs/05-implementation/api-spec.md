# easymindmap — API Specification

문서 버전: v2.1
결정일: 2026-03-29
최종 업데이트: 2026-04-16

> **[v2.0 주요 추가]**
> - 이미지(배경 이미지) 엔드포인트 추가 (섹션 5)
> - 태그 CRUD 엔드포인트 추가 (섹션 6)
> - Node Indicator 엔드포인트 추가 (섹션 7)
> - 보안/인증 정책 상세화: JWT 수명, refresh 전략, rate limit (섹션 0)
>
> **[v2.1 주요 추가 — 2026-04-16]**
> - Collaboration 추가 엔드포인트: Soft Lock (섹션 13-9, 13-10)
> - Translation V2 추가 엔드포인트: 노드별 번역 조회/저장/삭제, 맵 번역 정책 PUT, AI 일괄 번역 (섹션 11)
> - Redmine V1 WBS: config PATCH 엔드포인트 추가 (섹션 15)
> - Dashboard V3: GET /maps/:id/dashboard/data, GET /api/dashboard/schema/node-fields (섹션 16)
> - AI Chat V1: POST /maps/:id/chat, GET /maps/:id/chat/history (섹션 17 신규)

---

## Base URL

```
https://api.mindmap.ai.kr/v1
```

---

## 0. 보안 및 인증 정책

### 0.1 JWT 토큰 구조

모든 API는 Supabase Auth가 발급하는 JWT Bearer Token을 사용한다.

```
Authorization: Bearer {accessToken}
```

| 토큰 종류 | 수명 | 저장 위치 | 용도 |
|-----------|------|-----------|------|
| Access Token | **1시간** | 메모리 (변수) | API 요청 인증 |
| Refresh Token | **7일** | httpOnly Cookie | Access Token 재발급 |

> **보안 원칙**: Access Token은 localStorage에 저장하지 않는다. XSS 공격 방어를 위해 메모리(Zustand store)에만 보관한다.

### 0.2 토큰 갱신 전략 (Silent Refresh)

```
1. API 요청 → 401 Unauthorized 응답
2. 클라이언트: POST /auth/refresh (httpOnly Cookie의 refreshToken 자동 전송)
3. 서버: 새 accessToken + 새 refreshToken 발급
4. 클라이언트: 새 accessToken으로 원래 요청 재시도
5. refreshToken도 만료된 경우: 로그인 페이지로 리다이렉트
```

```typescript
// axios interceptor 예시
axiosInstance.interceptors.response.use(
  res => res,
  async (error) => {
    if (error.response?.status === 401 && !error.config._retry) {
      error.config._retry = true;
      await authClient.refresh();            // POST /auth/refresh
      return axiosInstance(error.config);    // 원래 요청 재시도
    }
    return Promise.reject(error);
  }
);
```

### 0.3 Rate Limit 정책

| 엔드포인트 그룹 | 제한 | 초과 시 |
|----------------|------|---------|
| 인증 (`/auth/*`) | **10 req/min/IP** | 429 Too Many Requests |
| 일반 API (`/maps/*`, `/nodes/*`) | **300 req/min/user** | 429 Too Many Requests |
| AI 생성 (`/ai/*`) | **20 req/hour/user** | 429 Too Many Requests |
| Export (`/export/*`) | **10 req/hour/user** | 429 Too Many Requests |
| 공개 API (`/p/*`) | **100 req/min/IP** | 429 Too Many Requests |

429 응답 형식:
```json
{
  "error": "RATE_LIMIT_EXCEEDED",
  "message": "Too many requests. Please wait before retrying.",
  "retryAfter": 60,
  "statusCode": 429
}
```

헤더:
```
X-RateLimit-Limit: 300
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1711200000
Retry-After: 60
```

### 0.4 권한 모델 요약

| 역할 | maps READ | maps WRITE | nodes READ | nodes WRITE |
|------|-----------|------------|------------|-------------|
| `owner` | ✅ | ✅ | ✅ | ✅ |
| `editor` (workspace member) | ✅ | ✅ | ✅ | ✅ |
| `viewer` (workspace member) | ✅ | ❌ | ✅ | ❌ |
| `public_read` (publish URL) | ✅ | ❌ | ✅ | ❌ |
| `collab_creator` | ✅ | ✅ (full scope) | ✅ | ✅ (full scope) |
| `collab_editor` | ✅ (scope 내) | ✅ (scope 내 본인 노드) | ✅ | ✅ (scope 내) |
| 비인증 (일반) | ❌ | ❌ | ❌ | ❌ |

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
  "userId": "uuid-...",
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
  "expiresIn": 3600
}
```
> refreshToken은 `Set-Cookie: refreshToken=...; HttpOnly; Secure; SameSite=Strict` 로 전송

---

### POST /auth/refresh
Access Token 갱신

> **처리 주체 확정 (2026-03-31)**
>
> | 항목 | 결정 | 근거 |
> |------|------|------|
> | **토큰 갱신 실행자** | **NestJS API 서버** (`/auth/refresh` 엔드포인트) | httpOnly Cookie를 서버에서 직접 파싱해 보안 강화 |
> | Supabase JS SDK 역할 | 클라이언트-사이드 세션 상태 관리 전용 (로그인/로그아웃 UI 흐름) | Supabase `auth.refreshSession()` 는 **직접 호출하지 않는다** |
> | 이중 갱신 방지 | axios interceptor에서 `_retry` 플래그로 중복 호출 차단 | 동시 401 응답 시 하나만 갱신 요청, 나머지는 Promise 대기 |
> | refreshToken 저장 | `Set-Cookie: HttpOnly; Secure; SameSite=Strict` | JavaScript에서 읽기 불가 — XSS 방어 |
>
> **결론**: 프론트엔드는 Supabase JS SDK의 자동 갱신(`autoRefreshToken: false` 설정)을 비활성화하고,
> 모든 토큰 갱신을 `POST /auth/refresh` NestJS 엔드포인트로 위임한다.
> Supabase SDK는 로그인·로그아웃 UI 흐름 및 세션 상태 구독(`onAuthStateChange`)에만 사용한다.

**Cookie** (자동 전송): `refreshToken=eyJ...`

**Response** `200 OK`
```json
{
  "accessToken": "eyJ...",
  "expiresIn": 3600
}
```

**실패 시** `401 Unauthorized` → 재로그인 필요

---

### POST /auth/logout
로그아웃 (refreshToken 무효화)

**Response** `204 No Content`
> `Set-Cookie: refreshToken=; Max-Age=0` 로 쿠키 삭제

---

## 2. Maps

### POST /maps
새 맵 생성

**Request Body**
```json
{
  "title": "New Mindmap",
  "workspaceId": "uuid-...",
  "defaultLayoutType": "radial-bidirectional"
}
```

**Response** `201 Created`
```json
{
  "mapId": "uuid-...",
  "title": "New Mindmap",
  "currentVersion": 0,
  "createdAt": "2026-03-29T00:00:00Z"
}
```

---

### GET /maps
내 맵 목록 조회 (소유 + 워크스페이스 공유)

**Query** `?workspaceId=uuid&deleted=false&page=1&limit=20`

**Response** `200 OK`
```json
{
  "maps": [
    {
      "mapId": "uuid-...",
      "title": "My Map",
      "deletedAt": null,
      "updatedAt": "2026-03-29T00:00:00Z"
    }
  ],
  "total": 1
}
```

---

### GET /maps/{mapId}
맵 전체 데이터 조회 (노드 포함)

**Response** `200 OK`
```json
{
  "mapId": "uuid-...",
  "title": "My Map",
  "currentVersion": 42,
  "nodes": [ ...NodeObject[] ],
  "updatedAt": "2026-03-29T00:00:00Z"
}
```

---

### PATCH /maps/{mapId}
맵 메타 업데이트

**Request Body** (변경 필드만)
```json
{
  "title": "Updated Title",
  "viewMode": "dashboard",
  "refreshIntervalSeconds": 30
}
```

> **`viewMode` 허용값**
> | 값 | 설명 |
> |----|----|
> | `"edit"` | 기본 편집 모드 |
> | `"dashboard"` | 읽기 전용 대시보드, 자동 갱신 활성화 가능 |
> | `"kanban"` | 칸반 레이아웃 보기 (depth 0=board / 1=column / 2=card 규칙 적용) |

---

### DELETE /maps/{mapId}
맵 삭제 (soft-delete, 30일 후 영구 삭제)

**Response** `204 No Content`

---

### PATCH /maps/{mapId}/document
Autosave — 맵 변경 patch 저장

**Request Body**
```json
{
  "clientId": "cli_abc123",
  "patchId": "p_1710598325_001",
  "baseVersion": 128,
  "timestamp": "2026-03-29T14:32:05.123Z",
  "patches": [
    { "op": "updateNodeText", "nodeId": "uuid-...", "text": "Updated" },
    { "op": "moveNode", "nodeId": "uuid-...", "parentId": "uuid-...", "orderIndex": 1.5 }
  ]
}
```

**Response** `200 OK`
```json
{ "newVersion": 129 }
```

**충돌 시** `409 Conflict`
```json
{ "error": "VERSION_CONFLICT", "currentVersion": 130 }
```

---

## 3. Nodes

### POST /maps/{mapId}/nodes
노드 생성

**Request Body**
```json
{
  "parentId": "uuid-...",
  "text": "New Node",
  "layoutType": "tree-right",
  "orderIndex": 1.5
}
```

**Response** `201 Created` → NodeObject

---

### PATCH /nodes/{nodeId}
노드 속성 업데이트

**Request Body** (변경 필드만)
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

> API: `style` 키 사용 / DB 컬럼: `style_json` — 서비스 레이어에서 변환

---

### DELETE /nodes/{nodeId}
노드 삭제 (하위 subtree cascade)

**Response** `204 No Content`

---

### PATCH /nodes/{nodeId}/move
노드 이동 (부모 변경)

**Request Body**
```json
{
  "newParentId": "uuid-...",
  "orderIndex": 2.0
}
```

---

### PATCH /nodes/{nodeId}/layout
노드 레이아웃 변경

**Request Body**
```json
{ "layoutType": "tree-down" }
```

---

## 4. Export

### POST /maps/{mapId}/export/markdown
Markdown Export

**Request Body**
```json
{
  "includeCollapsed": true,
  "includeTags": true,
  "imageHandling": "omit"
}
```

> 상세 동작 정의는 `docs/04-extensions/markdown-export.md` 참조

**Response** `202 Accepted` (비동기 Job)
```json
{
  "exportId": "uuid-...",
  "status": "pending"
}
```

---

### POST /maps/{mapId}/export/html
Standalone HTML Export

**Request Body**
```json
{
  "includeCollapsed": false,
  "includeTags": true,
  "imageHandling": "embed"
}
```

> 상세 동작 정의는 `docs/04-extensions/html-export.md` 참조

**Response** `202 Accepted` (비동기 Job)
```json
{
  "exportId": "uuid-...",
  "status": "pending"
}
```

---

### GET /maps/{mapId}/export/{exportId}
Export 작업 상태 조회

**Response** `200 OK`
```json
{
  "exportId": "uuid-...",
  "status": "done",
  "downloadUrl": "https://storage.../exports/map.md",
  "expiresAt": "2026-03-30T00:00:00Z"
}
```

`status`: `pending` | `processing` | `done` | `error`

---

## 5. 노드 배경 이미지 (Node Background Image)

### PATCH /nodes/{nodeId}/background-image
노드 배경 이미지 설정 (preset 또는 업로드된 이미지 적용)

**Request Body — preset 타입**
```json
{
  "type": "preset",
  "assetId": "preset_img_102",
  "url": "https://cdn.mindmap.ai.kr/assets/preset/102.png",
  "fit": "cover",
  "position": "center",
  "overlayOpacity": 0.28,
  "overlayColor": "#000000"
}
```

**Request Body — upload 타입**
```json
{
  "type": "upload",
  "fileId": "file_abc123",
  "url": "https://storage.mindmap.ai.kr/uploads/node/bg.png",
  "fit": "cover",
  "position": "center",
  "overlayOpacity": 0.2,
  "overlayColor": "#000000"
}
```

**Response** `200 OK`
```json
{
  "nodeId": "uuid-...",
  "backgroundImage": {
    "type": "upload",
    "fileId": "file_abc123",
    "url": "https://storage.mindmap.ai.kr/uploads/node/bg.png",
    "fit": "cover",
    "position": "center",
    "overlayOpacity": 0.2,
    "overlayColor": "#000000"
  }
}
```

> 저장 위치: `nodes.style_json` 내 `backgroundImage` 키 (MVP)

---

### DELETE /nodes/{nodeId}/background-image
노드 배경 이미지 제거

**Response** `204 No Content`

> `nodes.style_json` 에서 `backgroundImage` 키 삭제

---

### POST /nodes/{nodeId}/background-image/upload
배경 이미지 파일 직접 업로드

**Request** `multipart/form-data`
```
file: (binary)
```

**Response** `201 Created`
```json
{
  "fileId": "file_abc123",
  "url": "https://storage.mindmap.ai.kr/uploads/nodes/{nodeId}/bg.png",
  "width": 1280,
  "height": 720,
  "mimeType": "image/png",
  "fileSizeBytes": 204800
}
```

> Supabase Storage `uploads` 버킷에 저장

---

### GET /assets/presets/background-images
배경 이미지 프리셋 목록 조회 (인증 불필요)

**Response** `200 OK`
```json
{
  "presets": [
    {
      "assetId": "preset_img_101",
      "name": "Blue Sky",
      "thumbnailUrl": "https://cdn.mindmap.ai.kr/assets/preset/101_thumb.png",
      "url": "https://cdn.mindmap.ai.kr/assets/preset/101.png"
    }
  ]
}
```

---

## 6. 태그 (Tags)

### GET /tags
내 태그 목록 조회 (개인 태그 + 멤버인 워크스페이스 공유 태그 포함)

**Query Parameters**

| 파라미터 | 필수 | 설명 |
|---------|:---:|------|
| `workspaceId` | ❌ | 특정 워크스페이스의 공유 태그만 조회 |

**Response** `200 OK`
```json
{
  "tags": [
    { "tagId": "uuid-...", "name": "중요", "color": "#FF5733", "workspaceId": null },
    { "tagId": "uuid-...", "name": "팀공유태그", "color": "#3399FF", "workspaceId": "uuid-..." }
  ]
}
```

---

### POST /tags
태그 생성

> - `workspaceId` 생략 시: 개인 태그 생성 (`tags.workspace_id = NULL`)
> - `workspaceId` 지정 시: 워크스페이스 공유 태그 생성 (멤버 전원 사용 가능)

**Request Body**
```json
{
  "name": "중요",
  "color": "#FF5733",
  "workspaceId": "uuid-..."  // optional — 생략 시 개인 태그
}
```

**Response** `201 Created`
```json
{
  "tagId": "uuid-...",
  "name": "중요",
  "color": "#FF5733",
  "workspaceId": "uuid-..."  // null if 개인 태그
}
```
```

---

### PATCH /tags/{tagId}
태그 수정 (이름/색상)

**Request Body** (변경 필드만)
```json
{ "color": "#33A1FF" }
```

---

### DELETE /tags/{tagId}
태그 삭제 (node_tags cascade 포함)

**Response** `204 No Content`

---

### POST /nodes/{nodeId}/tags
노드에 태그 추가

**Request Body**
```json
{ "tagId": "uuid-..." }
```

**Response** `201 Created`
```json
{
  "nodeId": "uuid-...",
  "tagId": "uuid-...",
  "createdAt": "2026-03-29T00:00:00Z"
}
```

---

### DELETE /nodes/{nodeId}/tags/{tagId}
노드에서 태그 제거

**Response** `204 No Content`

---

### GET /nodes/{nodeId}/tags
노드에 붙은 태그 목록 조회

**Response** `200 OK`
```json
{
  "tags": [
    { "tagId": "uuid-...", "name": "중요", "color": "#FF5733" }
  ]
}
```

---

### GET /maps/{mapId}/tags
맵에 사용된 태그 전체 조회 (필터링용)

**Response** `200 OK`
```json
{
  "tags": [ ...Tag[] ],
  "usageCount": { "uuid-...": 5, "uuid-...": 2 }
}
```

---

## 7. Node Indicator

Indicator = 노드 하단에 표시되는 요약 배지 (메모/링크/첨부/미디어/태그 수)

### GET /nodes/{nodeId}/indicator
노드 Indicator 데이터 조회

**Response** `200 OK`
```json
{
  "nodeId": "uuid-...",
  "hasNote": true,
  "notePreview": "첫 줄 미리보기...",
  "linkCount": 2,
  "attachmentCount": 1,
  "hasMedia": false,
  "tagCount": 3,
  "tags": [
    { "tagId": "uuid-...", "name": "중요", "color": "#FF5733" }
  ]
}
```

---

### GET /nodes/{nodeId}/note
노드 메모 조회

**Response** `200 OK`
```json
{
  "nodeId": "uuid-...",
  "content": "메모 내용...",
  "updatedAt": "2026-03-29T00:00:00Z"
}
```

---

### PUT /nodes/{nodeId}/note
노드 메모 저장 (upsert)

**Request Body**
```json
{ "content": "메모 내용..." }
```

**Response** `200 OK`

---

### DELETE /nodes/{nodeId}/note
노드 메모 삭제

**Response** `204 No Content`

---

### GET /nodes/{nodeId}/links
노드 링크 목록 조회

**Response** `200 OK`
```json
{
  "links": [
    { "linkId": "uuid-...", "url": "https://example.com", "label": "참고 자료" }
  ]
}
```

---

### POST /nodes/{nodeId}/links
링크 추가

**Request Body**
```json
{ "url": "https://example.com", "label": "참고 자료" }
```

**Response** `201 Created`

---

### DELETE /nodes/{nodeId}/links/{linkId}
링크 삭제

**Response** `204 No Content`

---

### GET /nodes/{nodeId}/attachments
첨부파일 목록 조회

**Response** `200 OK`
```json
{
  "attachments": [
    {
      "attachmentId": "uuid-...",
      "filename": "report.pdf",
      "mimeType": "application/pdf",
      "fileSizeBytes": 1048576,
      "url": "https://storage.mindmap.ai.kr/attachments/..."
    }
  ]
}
```

---

### POST /nodes/{nodeId}/attachments
첨부파일 업로드

**Request** `multipart/form-data`
```
file: (binary)
```

**Response** `201 Created`

---

### DELETE /nodes/{nodeId}/attachments/{attachmentId}
첨부파일 삭제

**Response** `204 No Content`

---

## 8. Publish

### POST /maps/{mapId}/publish
맵을 공개 URL로 퍼블리싱

**Response** `200 OK`
```json
{
  "publishId": "abcd1234efgh5678",
  "publishUrl": "https://app.mindmap.ai.kr/published/abcd1234efgh5678",
  "publishedAt": "2026-03-29T00:00:00Z"
}
```

---

### DELETE /maps/{mapId}/publish
퍼블리싱 취소 (unpublished_at 설정)

**Response** `204 No Content`

---

### GET /published/{publishId}
공개 맵 데이터 조회 (인증 불필요)

**Response** `200 OK`
```json
{
  "mapId": "uuid-...",
  "title": "My Map",
  "nodes": [ ...NodeObject[] ],
  "publishedAt": "2026-03-29T00:00:00Z"
}
```

---

## 9. AI Generation

### POST /ai/generate
AI 마인드맵 자동 생성

**Request Body**
```json
{
  "prompt": "Explain Kubernetes architecture",
  "maxDepth": 3,
  "maxChildrenPerNode": 5,
  "targetMapId": "uuid-..."
}
```

**Response** `200 OK` (MVP: 즉시 응답)
```json
{
  "nodes": [ ...NodeObject[] ],
  "tokensUsed": 1200
}
```

확장 시 비동기 Job:
```
POST /ai/generate → 202 { jobId }
GET  /ai/jobs/{jobId} → { status, nodes }
```

---

### POST /ai/expand
선택 노드 하위 AI 확장

**Request Body**
```json
{
  "nodeId": "uuid-...",
  "prompt": "더 자세하게",
  "maxChildren": 5
}
```

---

### POST /ai/summarize
맵 요약 텍스트 생성

**Request Body**
```json
{ "mapId": "uuid-..." }
```

**Response** `200 OK`
```json
{ "summary": "이 맵은 Kubernetes 아키텍처를 설명합니다..." }
```

---

## 10. Users (사용자 프로필 & UI 환경설정)

### GET /users/me
현재 로그인 사용자 프로필 조회

**Response** `200 OK`
```json
{
  "id": "uuid-...",
  "email": "user@example.com",
  "displayName": "홍길동",
  "preferredLanguage": "ko",
  "secondaryLanguages": ["ja"],
  "skipEnglishTranslation": true,
  "defaultLayoutType": "radial-bidirectional",
  "uiPreferences": {
    "showTranslationIndicator": true,
    "showTranslationOverrideIcon": true,
    "showTagBadge": true
  },
  "createdAt": "2026-01-01T00:00:00Z"
}
```

---

### PATCH /users/me/ui-preferences
UI 표시 환경설정 업데이트 (인디케이터 ON/OFF 등)

**Request Body** (부분 업데이트 가능)
```json
{
  "showTranslationIndicator": false,
  "showTranslationOverrideIcon": true,
  "showTagBadge": true
}
```

**Response** `200 OK`
```json
{
  "showTranslationIndicator": false,
  "showTranslationOverrideIcon": true,
  "showTagBadge": true
}
```

> - `users.ui_preferences_json` JSONB 컬럼에 저장
> - 참조: `docs/03-editor-core/node-indicator.md` §23 (NODE-15)

---

## 11. Translation (다국어 번역, V2)

### GET /maps/{mapId}/translations
맵 전체 노드의 번역 캐시 일괄 조회 (맵 오픈 시 배치 번역 TRANS-06)

**Query Parameters**
| 파라미터 | 필수 | 설명 |
|---------|:---:|------|
| `lang` | ✅ | 대상 언어 코드 (예: `ko`, `ja`, `en`) |

**Response** `200 OK`
```json
{
  "translations": [
    {
      "nodeId": "uuid-...",
      "targetLang": "ko",
      "translatedText": "AI 전략",
      "sourceTextHash": "a1b2c3d4",
      "modelVersion": "deepl-v2"
    }
  ]
}
```

---

### GET /maps/{mapId}/nodes/{nodeId}/translations
특정 노드의 모든 언어 번역 캐시 조회

**Response** `200 OK`
```json
{
  "nodeId": "uuid-...",
  "translations": [
    {
      "targetLang": "ko",
      "translatedText": "AI 전략",
      "sourceTextHash": "a1b2c3d4",
      "modelVersion": "deepl-v2",
      "updatedAt": "2026-04-16T00:00:00Z"
    }
  ]
}
```

---

### PUT /maps/{mapId}/nodes/{nodeId}/translations/{lang}
특정 노드의 특정 언어 번역 저장 (upsert)

> 편집자/owner 전용. 수동 번역 교정 또는 강제 번역 저장 용도.

**Request Body**
```json
{
  "translatedText": "AI 전략 수정본",
  "sourceTextHash": "a1b2c3d4"
}
```

**Response** `200 OK`
```json
{
  "nodeId": "uuid-...",
  "targetLang": "ko",
  "translatedText": "AI 전략 수정본",
  "sourceTextHash": "a1b2c3d4",
  "updatedAt": "2026-04-16T00:00:00Z"
}
```

---

### DELETE /maps/{mapId}/nodes/{nodeId}/translations/{lang}
특정 노드의 특정 언어 번역 캐시 삭제

> 삭제 후 다음 열람 시 재번역 트리거됨.

**Response** `204 No Content`

---

### POST /maps/{mapId}/translate
맵 전체 AI 일괄 번역 요청 (BullMQ 'translation' 큐)

> 번역 엔진 업그레이드 또는 맵 전체 재번역 시 사용. owner 전용.

**Request Body**
```json
{
  "targetLang": "ko",
  "forceRetranslate": false
}
```

| 필드 | 타입 | 필수 | 설명 |
|------|------|:---:|------|
| `targetLang` | string | ✅ | 대상 언어 코드 |
| `forceRetranslate` | boolean | ❌ | true 시 기존 캐시 무시 후 전체 재번역 (기본: false) |

**Response** `202 Accepted`
```json
{
  "jobId": "uuid-...",
  "nodeCount": 42,
  "targetLang": "ko",
  "status": "pending"
}
```

---

### POST /maps/{mapId}/translations/batch
미번역 노드 배치 번역 요청 (TRANS-06)

**Request Body**
```json
{
  "targetLang": "ko",
  "nodeIds": ["uuid-1", "uuid-2"]
}
```

**Response** `202 Accepted`
```json
{ "jobId": "uuid-...", "nodeCount": 2 }
```

> 번역 완료 시 WebSocket `translation:ready` 이벤트로 클라이언트에 푸시 (TRANS-07)

---

### GET /maps/{mapId}/translation-policy
맵 번역 정책 조회

**Response** `200 OK`
```json
{
  "mapId": "uuid-...",
  "translationPolicy": {
    "skipLanguages": ["en"],
    "skipEnglish": true
  }
}
```

> `translationPolicy` 가 `null` 이면 사용자 기본 설정을 따름 (3단계 계층 레벨 2).

---

### PUT /maps/{mapId}/translation-policy
맵 번역 정책 저장 (전체 교체)

> owner/collab_creator 전용. `null` 전송 시 맵 정책 제거 → 사용자 기본값 복원.

**Request Body**
```json
{
  "skipLanguages": ["en", "fr"],
  "skipEnglish": null
}
```

| 필드 | 타입 | 설명 |
|------|------|------|
| `skipLanguages` | string[] | 이 맵에서 번역 생략할 언어 목록 |
| `skipEnglish` | boolean \| null | null = 사용자 기본 설정 따름 |

**Response** `200 OK`
```json
{
  "mapId": "uuid-...",
  "translationPolicy": {
    "skipLanguages": ["en", "fr"],
    "skipEnglish": null
  }
}
```

---

### PATCH /nodes/{nodeId}/translation-override
편집자 전용 — 노드 번역 강제 설정 (NODE-14, 번역 상태 인디케이터)

**Request Body**
```json
{
  "translationOverride": "force_on"
}
```

| 값 | 의미 |
|---|---|
| `"force_on"` | 강제 번역 ON (⛔ 설정도 무시) |
| `"force_off"` | 강제 번역 OFF (모든 열람자 원문) |
| `null` | 자동 정책으로 복원 |

**Response** `200 OK`
```json
{
  "nodeId": "uuid-...",
  "translationOverride": "force_on"
}
```

> - 권한: 해당 맵의 `editor` 또는 `owner`만 가능
> - 즉시 autosave 트리거
> - 참조: `docs/03-editor-core/node-indicator.md` §16 (편집자 override 아이콘 ⛔/🔁)

---

## 12. AI Workflow

> 관련 PRD: `docs/01-product/AI-Executable-Workflow-PRD.md`

**정책**: 동시 접속자가 2명 이상인 협업 상태에서는 모든 AI Workflow API 호출을 차단한다 (`403 FORBIDDEN`).

### POST /ai/workflow/generate
step 기반 workflow 생성

**Request Body**
```json
{
  "prompt": "Ubuntu 22.04에 Apache 설치 및 Let's Encrypt SSL 발급 절차를 초보자 수준으로 설명해줘",
  "mapId": "uuid-...",
  "language": "ko"
}
```

**Response** `200 OK`
```json
{
  "nodes": [
    {
      "id": "uuid-...",
      "text": "Step 1: 패키지 업데이트",
      "workflowType": "executable",
      "stepState": "not_started",
      "note": "```bash\nsudo apt update && sudo apt upgrade -y\n```"
    }
  ],
  "tokensUsed": 1500
}
```

---

### POST /ai/workflow/resolve
특정 step node의 오류 해결

**Request Body**
```json
{
  "nodeId": "uuid-...",
  "errorMessage": "E: Package 'apache2' has no installation candidate",
  "context": "step 문맥 요약 (선택)"
}
```

**Response** `200 OK`
```json
{
  "resolution": "sudo add-apt-repository universe && sudo apt update 후 재시도",
  "updatedNote": "```bash\nsudo add-apt-repository universe\nsudo apt update\nsudo apt install apache2 -y\n```",
  "tokensUsed": 400
}
```

---

### POST /ai/workflow/cleanup
중간 실패 이력 제거 및 최종 절차 정제

**Request Body**
```json
{
  "mapId": "uuid-...",
  "nodeIds": ["uuid-1", "uuid-2"]
}
```

**Response** `200 OK`
```json
{
  "cleanedNodes": [
    { "nodeId": "uuid-1", "finalNote": "최종 성공 절차..." }
  ],
  "removedNodeIds": ["uuid-temp-1", "uuid-temp-2"]
}
```

---

### PATCH /nodes/{nodeId}/step-status
step 상태 변경

**Request Body**
```json
{
  "stepState": "in_progress"
}
```

| stepState 값 | 의미 |
|---|---|
| `not_started` | 아직 실행 안 함 |
| `in_progress` | 현재 실행 중 |
| `blocked` | 오류 등으로 진행 막힘 |
| `resolved` | blocking 해결됨 |
| `done` | 완료 |

**Response** `200 OK`
```json
{
  "nodeId": "uuid-...",
  "stepState": "in_progress",
  "updatedAt": "2026-03-31T00:00:00Z"
}
```

---


## 13. Collaboration — 협업맵

> **Base URL**: `https://api.mindmap.ai.kr/v1`  
> **인증**: 모든 엔드포인트 `Authorization: Bearer {accessToken}` 필수  
> 전체 WS 이벤트 및 상세 정책: `docs/05-implementation/collaboration-api.md`

### 권한 모델

| 역할 | 설명 |
|------|------|
| `collab_creator` | full scope — 맵 내 모든 노드 수정/삭제, 협업자 초대/탈퇴, 소유권 이양 가능 |
| `collab_editor` | level/node scope 내 **본인 작성 노드**만 수정/삭제 |

---

### 13-1. 협업자 초대

```
POST /maps/:mapId/collaborators
```

> `collab_creator` 권한 필요

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
| `scope_type` | `"level"` \| `"node"` | ✅ | `"full"` 선택 불가 (editor 전용 제한) |
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
// 403 — creator 아닌 경우
{ "error": "FORBIDDEN", "message": "협업자 초대는 creator만 가능합니다." }
// 409 — 이미 초대된 사용자
{ "error": "ALREADY_INVITED", "message": "이미 초대된 사용자입니다." }
```

---

### 13-2. 협업자 목록 조회

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

### 13-3. 편집 범위(scope) 변경

```
PATCH /maps/:mapId/collaborators/:collaboratorId
```

> `collab_creator` 권한 필요

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

### 13-4. 협업자 강제 탈퇴

```
DELETE /maps/:mapId/collaborators/:collaboratorId
```

> `collab_creator` 권한 필요

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

### 13-5. 초대 수락

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
// 401 — 미로그인 시
{ "error": "LOGIN_REQUIRED", "redirectAfterLogin": "/invite/accept?token=..." }
// 410 — 만료된 토큰
{ "error": "INVITE_EXPIRED", "message": "초대 링크가 만료되었습니다. 다시 초대를 요청하세요." }
// 404 — 유효하지 않은 토큰
{ "error": "INVITE_NOT_FOUND" }
```

---

### 13-6. 소유권 이양

```
PATCH /maps/:mapId/transfer-ownership
```

> 현재 `collab_creator`만 호출 가능

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

**WS 이벤트**: `collab:ownership_transferred { newCreatorId }` — 전체 참여자에게 전송

---

### 13-7. 소유권 이양 이력 조회

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

### 13-8. 내 편집 권한 조회

```
GET /maps/:mapId/my-permissions
```

> 클라이언트는 이 응답을 캐시하여 편집 가능 노드에만 편집 UI를 표시한다.

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

---

### 13-9. Soft Lock 획득

```
POST /maps/:mapId/soft-lock
```

> 노드 편집 시작 시 Soft Lock을 획득한다. Redis Key: `lock:node:{nodeId}`, TTL: 5초.

**Request Body**
```json
{
  "nodeId": "node-uuid"
}
```

**Response `200 OK`**
```json
{
  "nodeId": "node-uuid",
  "lockedBy": "user-uuid",
  "lockedAt": "2026-04-16T10:00:00.000Z",
  "expiresAt": "2026-04-16T10:00:05.000Z"
}
```

**Error**
```json
// 409 — 다른 사용자가 이미 Lock 보유 중
{
  "error": "LOCK_CONFLICT",
  "lockedBy": "other-user-uuid",
  "displayName": "홍길동",
  "lockedAt": "2026-04-16T10:00:00.000Z",
  "expiresAt": "2026-04-16T10:00:05.000Z"
}
```

> WS 이벤트: `collab:soft_lock { nodeId, lockedBy, displayName }` — 동일 맵 참여자에게 브로드캐스트

---

### 13-10. Soft Lock 해제

```
DELETE /maps/:mapId/soft-lock
```

> 편집 완료 후 즉시 Lock을 해제한다. TTL 만료(5초) 전 명시적 해제.

**Request Body**
```json
{
  "nodeId": "node-uuid"
}
```

**Response `200 OK`**
```json
{
  "nodeId": "node-uuid",
  "released": true
}
```

> WS 이벤트: `collab:soft_lock_released { nodeId }` — 동일 맵 참여자에게 브로드캐스트

---

## 14. Collaboration Chat / Node Thread / AI Assist (V2~V3)

> 상세 엔드포인트는 `docs/05-implementation/collaboration-api.md`를 기준으로 한다.

### GET /maps/{mapId}/chat/messages
최근 map-room chat 메시지 조회

**Query**
- `limit=50` (기본 30, 최대 100)
- `beforeMessageId=uuid` (페이징)
- `includeTranslations=true`

### POST /maps/{mapId}/chat/messages
REST fallback 또는 초기 송신용 메시지 저장

**Request Body**
```json
{
  "clientMsgId": "cmsg_1712300000000_001",
  "text": "이 노드 구조 다시 봐주세요",
  "nodeId": "uuid-node-optional"
}
```

### GET /nodes/{nodeId}/threads/messages
특정 node thread 메시지 조회

### POST /nodes/{nodeId}/threads/messages
특정 node에 연결된 댓글/대화 생성

### POST /nodes/{nodeId}/threads/ai/summarize
thread 요약 preview 생성

### POST /nodes/{nodeId}/threads/ai/tasks
thread action item 추출 preview 생성

### POST /nodes/{nodeId}/threads/ai/task-nodes
승인된 action item을 child node 생성 preview 또는 apply

**Request Body**
```json
{
  "mode": "preview",
  "messageIds": ["uuid-1", "uuid-2"],
  "approvedTaskIndexes": [0, 2]
}
```

> `mode=preview`가 기본이며, 실제 문서 반영은 명시적 승인 요청에서만 수행한다.

### WebSocket 추가 이벤트

| 방향 | 이벤트 | 설명 |
|------|--------|------|
| C→S | `chat:message:send` | map-room / node thread 메시지 송신 |
| S→C | `chat:message` | 원문 메시지 수신 |
| S→C | `chat:translation:ready` | targetLang 번역 결과 수신 |
| S→C | `node:thread:updated` | 댓글 수 / 최신 시각 갱신 |
| C→S | `node:thread:ai:run` | AI preview 요청 |
| S→C | `node:thread:ai:preview` | AI 요약 / 작업 후보 preview |

---

## 15. Redmine 연동 (V1 WBS)

> 참조: `docs/04-extensions/integrations/31-redmine-integration.md`  
> BullMQ 'redmine-sync' 큐, Exponential Backoff 재시도 (1s → 2s → 4s, 최대 3회)  
> Redmine API Key는 AES-256-GCM 암호화 후 `redmine_project_maps.api_key_encrypted` 에 저장

### POST /maps/{mapId}/redmine/connect
Redmine 연동 설정 (URL / API Key / 프로젝트 ID)

**Request Body**
```json
{
  "redmineBaseUrl": "https://redmine.example.com",
  "redmineProjectId": 42,
  "apiKey": "plain-text-api-key",
  "syncDirection": "bidirectional",
  "autoCreateIssues": true,
  "defaultTrackerId": 1,
  "defaultStatusId": 1
}
```

| 필드 | 타입 | 필수 | 설명 |
|------|------|:---:|------|
| `redmineBaseUrl` | string | ✅ | Redmine 서버 URL |
| `redmineProjectId` | number | ✅ | Redmine project.id |
| `apiKey` | string | ✅ | 평문 API Key (서버에서 AES-256-GCM 암호화 저장) |
| `syncDirection` | `pull_only` \| `push_only` \| `bidirectional` | ❌ | 기본: `bidirectional` |
| `autoCreateIssues` | boolean | ❌ | 노드 생성 시 Issue 자동 생성 여부 (기본: true) |
| `defaultTrackerId` | number | ❌ | 기본 Tracker ID |
| `defaultStatusId` | number | ❌ | 기본 Status ID |

**Response** `201 Created`
```json
{
  "mapId": "uuid-...",
  "redmineBaseUrl": "https://redmine.example.com",
  "redmineProjectId": 42,
  "syncDirection": "bidirectional",
  "autoCreateIssues": true,
  "createdAt": "2026-04-16T00:00:00Z"
}
```

---

### PATCH /maps/{mapId}/redmine/config
Redmine 연동 설정 부분 수정

**Request Body** (변경 필드만)
```json
{
  "syncDirection": "pull_only",
  "autoCreateIssues": false
}
```

**Response** `200 OK`
```json
{
  "mapId": "uuid-...",
  "syncDirection": "pull_only",
  "autoCreateIssues": false,
  "updatedAt": "2026-04-16T00:00:00Z"
}
```

---

### POST /maps/{mapId}/redmine/sync
수동 동기화 요청 (BullMQ 큐에 즉시 추가)

**Request Body**
```json
{
  "direction": "pull"
}
```

| `direction` 값 | 의미 |
|---|---|
| `"pull"` | Redmine Issues → 맵 노드 가져오기 |
| `"push"` | 맵 노드 → Redmine Issues 반영 |

**Response** `202 Accepted`
```json
{
  "jobId": "bullmq-job-id",
  "direction": "pull",
  "status": "pending"
}
```

---

### GET /maps/{mapId}/redmine/status
Redmine 연동 상태 조회

**Response** `200 OK`
```json
{
  "connected": true,
  "redmineBaseUrl": "https://redmine.example.com",
  "redmineProjectId": 42,
  "syncDirection": "bidirectional",
  "lastSyncedAt": "2026-04-16T09:00:00Z",
  "pendingNodes": 3
}
```

---

### GET /maps/{mapId}/redmine/logs
Redmine 동기화 이력 조회 (`redmine_sync_log`)

**Query Parameters**
| 파라미터 | 필수 | 설명 |
|---------|:---:|------|
| `limit` | ❌ | 최대 반환 건수 (기본: 20, 최대: 100) |
| `direction` | ❌ | `pull` 또는 `push` 필터 |

**Response** `200 OK`
```json
{
  "logs": [
    {
      "id": "uuid-...",
      "direction": "pull",
      "action": "full_sync",
      "status": "success",
      "redmineIssueId": 101,
      "nodeId": "uuid-...",
      "httpStatus": 200,
      "createdAt": "2026-04-16T09:00:00Z"
    }
  ],
  "total": 10
}
```

---

## 16. Dashboard (V3)

> 참조: `docs/04-extensions/dashboard/22-dashboard.md`

### GET /maps/{mapId}/dashboard/data
대시보드 모드에서 최신 노드 데이터 조회 (Redis 캐시 적용)

> `refresh_interval_seconds` 기반 polling 용도. 캐시 TTL = `refresh_interval_seconds × 0.8` (최소 30초).

**Response** `200 OK`
```json
{
  "mapVersion": 42,
  "refreshIntervalSeconds": 30,
  "nodes": [
    {
      "id": "uuid-...",
      "text": "98.5%",
      "text_lang": "ko",
      "text_hash": "a1b2c3d4",
      "updatedAt": "2026-04-16T09:00:00Z"
    }
  ]
}
```

---

### PATCH /maps/{mapId}/view-mode
대시보드 모드 전환

**Request Body**
```json
{
  "viewMode": "dashboard"
}
```

| `viewMode` 값 | 의미 |
|---|---|
| `"edit"` | 기본 편집 모드 |
| `"dashboard"` | Read-only 대시보드, 자동 갱신 활성화 가능 |
| `"kanban"` | Kanban 레이아웃 보기 |
| `"wbs"` | WBS 모드 (node_schedule / node_resources 인디케이터 활성화) |

**Response** `200 OK`
```json
{
  "mapId": "uuid-...",
  "viewMode": "dashboard"
}
```

---

### PATCH /maps/{mapId}/refresh-interval
대시보드 갱신 주기 설정

**Request Body**
```json
{
  "refreshIntervalSeconds": 30
}
```

허용값: `0`(off) | `10` | `30` | `60` | `300` | `600`

**Response** `200 OK`
```json
{
  "mapId": "uuid-...",
  "refreshIntervalSeconds": 30
}
```

---

### GET /api/dashboard/schema/node-fields
편집 가능 필드 메타 목록 (`field_registry` 테이블 조회, 인증 불필요)

**Response** `200 OK`
```json
{
  "fields": [
    {
      "id": "uuid-...",
      "entityType": "node",
      "fieldKey": "text",
      "labelKo": "노드 텍스트",
      "tableName": "nodes",
      "columnName": "text",
      "dataType": "text",
      "isEditable": true,
      "isJsonPath": false,
      "displayOrder": 1
    }
  ]
}
```

---

## 17. AI Chat (V1)

> 협업 맵 내 map-room 채팅 REST 인터페이스.  
> WebSocket(`chat:message:send`) 미지원 환경용 REST fallback.

### POST /maps/{mapId}/chat
채팅 메시지 전송 (REST fallback)

> WebSocket 연결이 없는 환경에서 메시지를 전송하거나 초기 메시지를 저장할 때 사용한다.

**Request Body**
```json
{
  "clientMsgId": "cmsg_1712300000000_001",
  "text": "이 부분을 더 상세하게 다듬어봅시다.",
  "nodeId": null
}
```

| 필드 | 타입 | 필수 | 설명 |
|------|------|:---:|------|
| `clientMsgId` | string | ✅ | 클라이언트 생성 멱등성 키 (중복 전송 방지) |
| `text` | string | ✅ | 메시지 본문 |
| `nodeId` | string \| null | ❌ | null = map-room, UUID = 특정 node thread 연결 |

**Response** `201 Created`
```json
{
  "id": "uuid-...",
  "mapId": "uuid-...",
  "nodeId": null,
  "userId": "uuid-...",
  "clientMsgId": "cmsg_1712300000000_001",
  "text": "이 부분을 더 상세하게 다듬어봅시다.",
  "sourceLang": "ko",
  "createdAt": "2026-04-16T10:00:00Z"
}
```

---

### GET /maps/{mapId}/chat/history
채팅 메시지 히스토리 조회

**Query Parameters**
| 파라미터 | 필수 | 설명 |
|---------|:---:|------|
| `limit` | ❌ | 반환 건수 (기본: 30, 최대: 100) |
| `beforeMessageId` | ❌ | 페이징: 해당 messageId 이전 메시지 조회 |
| `nodeId` | ❌ | null 생략 시 map-room, UUID 지정 시 node thread |
| `includeTranslations` | ❌ | true 시 번역 캐시 포함 (기본: false) |

**Response** `200 OK`
```json
{
  "messages": [
    {
      "id": "uuid-...",
      "userId": "uuid-...",
      "displayName": "홍길동",
      "text": "이 부분을 더 상세하게 다듬어봅시다.",
      "sourceLang": "ko",
      "createdAt": "2026-04-16T10:00:00Z",
      "translations": []
    }
  ],
  "hasMore": false
}
```

---

## 공통 에러 응답

```json
{
  "error": "ERROR_CODE",
  "message": "Human-readable message",
  "statusCode": 400
}
```

| Code | 에러 코드 | 의미 |
|------|-----------|------|
| 400 | `BAD_REQUEST` | 입력값 오류 |
| 401 | `UNAUTHORIZED` | 인증 필요 또는 토큰 만료 |
| 403 | `FORBIDDEN` | 권한 없음 |
| 404 | `NOT_FOUND` | 리소스 없음 |
| 409 | `VERSION_CONFLICT` | Autosave 버전 충돌 (baseVersion != currentVersion) |
| 409 | `DUPLICATE_PATCH` | 동일 patchId 중복 처리 |
| 409 | `DUPLICATE_TAG_NAME` | 같은 이름의 태그 이미 존재 |
| 429 | `RATE_LIMIT_EXCEEDED` | 요청 한도 초과 (Retry-After 헤더 참조) |
| 500 | `INTERNAL_SERVER_ERROR` | 서버 내부 오류 |
