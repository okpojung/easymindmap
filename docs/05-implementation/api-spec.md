# easymindmap — API Specification

문서 버전: v2.0
결정일: 2026-03-29

> **[v2.0 주요 추가]**
> - 이미지(배경 이미지) 엔드포인트 추가 (섹션 5)
> - 태그 CRUD 엔드포인트 추가 (섹션 6)
> - Node Indicator 엔드포인트 추가 (섹션 7)
> - 보안/인증 정책 상세화: JWT 수명, refresh 전략, rate limit (섹션 0)

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
