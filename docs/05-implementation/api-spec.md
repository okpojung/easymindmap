# easymindmap — API Specification

문서 버전: v2.4
결정일: 2026-03-29
최종 업데이트: 2026-08-04 — 실물 API(`apps/api`) 대조 현행화. 실제
엔드포인트 26종 표·인증/에러 실물 방식은 아래 "현재 구현" 절 참조.

> ### ⚠️ 현행화 안내 (2026-08-04)
>
> 이 문서는 **구현 전 설계본**이다. V1~V3 확장(Export·태그·Publish·AI·
> 번역·협업·Redmine·대시보드·채팅 등)까지 미리 그린 명세이며, 본문
> 엔드포인트의 상당수는 아직 구현되지 않았다.
>
> - **실물 기준**: `apps/api` 코드 (컨트롤러가 곧 계약) 및
>   `apps/api/database/schema.sql`.
> - **아래 "현재 구현 (2026-08-04 기준)" 절을 먼저 보라** — 실제
>   엔드포인트 전체 표(26개)·인증 방식·에러 형식이 정리되어 있다.
> - 각 섹션 제목에 `[구현됨]` / `[미구현]` 배지를 부기했다. 본문 설계는
>   향후 구현 참고용으로 유지한다.

---

## 현재 구현 (2026-08-04 기준)

### 전역 규칙 (실물)

- 모든 라우트는 **`/v1` 프리픽스** (NestJS `setGlobalPrefix`).
- JSON 바디 한도 **25MB** (문서 스냅샷의 임베드 이미지 data URL 대비).
- 첨부 업로드는 multipart, 1개당 기본 **200MB** (`ATTACHMENT_MAX_MB`, 2026-08-06 20→200).
  **1GB 로 더 올리려면 스트리밍 업로드가 먼저다** — 지금은 multer 메모리
  버퍼(`file.buffer`)라 큰 파일이 그대로 힙에 올라간다(diskStorage 전환 필요).
  계정 무료 쿼터가 1GB 라 실질 상한은 쿼터가 먼저 걸린다.
- CORS: `CORS_ORIGIN` 콤마 다중 출처 허용, `credentials: true`.
- DTO 검증: 전역 ValidationPipe(`whitelist` + `forbidNonWhitelisted`) —
  정의되지 않은 필드는 400.

### 인증 (실물)

- `GET /v1/health` 를 제외한 전 엔드포인트가 `AuthGuard` 를 통과한다.
- `AUTH_MODE=supabase`: `Authorization: Bearer <GoTrue JWT>` 를 서버가
  `SUPABASE_JWT_SECRET` 으로 **로컬 HS256 검증**(`jsonwebtoken`,
  `aud='authenticated'`·exp) + **JIT 사용자 생성**. GoTrue 호출 없음.
- 헤더를 실을 수 없는 다운로드 링크용 **`?access_token=<JWT>` 쿼리
  폴백** 허용 (첨부 다운로드 등 — 검증은 동일).
- `AUTH_MODE=dev`: 헤더 `x-user-id` 또는 `DEV_USER_ID` (개발 전용).
- 회원가입/로그인/갱신/로그아웃 API 는 **서버에 없다** — 프런트가 GoTrue
  REST 4종을 직접 호출하고, 세션은 **localStorage 에 영속**(§0.1 정정
  참조)한다. 쿠키는 사용하지 않는다.
- 격리: 모든 쿼리가 `owner_id = 현재 사용자` 조건 (RLS 는 2차 방어선 —
  API 는 pg 직결이라 RLS 를 타지 않는다).

### 실제 엔드포인트 전체 표 — 31개 (maps 11 · folders 4 · attachments 4 · account 4 · health 2 · nodes 6)

| # | 메서드 | 경로 | 설명 |
|---|---|---|---|
| 1 | POST | `/v1/maps` | 맵 생성 `{title?,workspaceId?,defaultLayoutType?,folderId?,kind?}` → `{mapId,title,folderId,kind,currentVersion,createdAt}`. 같은 폴더 안 제목 중복 409 |
| 2 | GET | `/v1/maps` | 목록 `?deleted=&page=&limit=&folder=root\|<uuid>&sort=title\|updatedAt&order=asc\|desc&q=` → `{maps:[{mapId,title,folderId,kind,deletedAt,createdAt,updatedAt,nodeCount,docBytes,attachCount,attachBytes,matchCount?,lastPlatform,lastBrowser,lastIp,lastSavedAt}],total}` · last* = **마지막 저장 자리**(2026-08-09) |
| 3 | GET | `/v1/maps/:id` | 단건 + 정규화 `nodes[]` (depth·orderIndex 순) |
| 4 | PATCH | `/v1/maps/:id` | 메타 수정 `{title?,viewMode?,refreshIntervalSeconds?,defaultLayoutType?,folderId?,kind?}` |
| 5 | DELETE | `/v1/maps/:id` | 소프트 삭제(`deleted_at`) → 204 |
| 6 | PUT | `/v1/maps/:id/document` | **문서 스냅샷 저장(upsert)** `{doc,title?,keepVersion?,editSession?,allowEmpty?,client?:{platform?,browser?}}` — 무변경이면 `{unchanged:true}`, 다른 세션 잠금이면 409, 쿼터 초과 413. `keepVersion` 시 히스토리 버전 적재(B8). `client` = 저장한 기기·브라우저(2026-08-09) — **IP 는 받지 않는다**(서버가 요청에서 읽는다. 보내면 400) |
| 7 | GET | `/v1/maps/:id/document` | 스냅샷 조회 `?editSession=` → `{mapId,title,folderId,kind,doc,updatedAt,editLock?:'acquired'\|'busy'}` |
| 8 | POST | `/v1/maps/:id/edit-heartbeat` | 편집 잠금 연장 `{sessionKey}` → `{held}` (TTL 60초, 25초 주기) |
| 9 | POST | `/v1/maps/:id/edit-release` | 편집 잠금 해제 `{sessionKey}` → `{ok}` |
| 10 | GET | `/v1/maps/:id/versions` | 히스토리 버전 목록(B8) — `{version,title,createdAt,bytes,layoutType,nodeCount,attachBytes,attachCount,platform,browser,ip}[]` · platform/browser/ip = **저장한 자리**(2026-08-09, 그 이전 버전은 null) |
| 11 | GET | `/v1/maps/:id/versions/:version` | 특정 버전의 문서 스냅샷 |
| 12 | GET | `/v1/folders` | 내 폴더 전부(평면) + `mapCount` |
| 13 | POST | `/v1/folders` | `{name,parentId?}` — 같은 부모에 같은 이름 409 |
| 14 | PATCH | `/v1/folders/:id` | `{name?,parentId?}` — 자기 자신/자손으로 이동 400 |
| 15 | DELETE | `/v1/folders/:id` | 비어 있을 때만 204, 아니면 409 |
| 16 | POST | `/v1/attachments?mapId=` | 첨부 업로드(multipart `file`) → 메타 + `url`. 크기 초과 400, 쿼터 초과 413 |
| 17 | GET | `/v1/attachments/quota` | 쿼터 사용량 조회 → `{dbBytes,fileBytes,usedBytes,quotaBytes,plan}`. 합산 = 문서 DB + 첨부. `plan` 은 `free`\|`basic`\|`pro`\|`team` — **용량 숫자는 DB 가 정하고 API 는 이름만 전달한다** |
| 18 | GET | `/v1/attachments/:id` | 다운로드(스트림, `?access_token=` 허용) |
| 19 | DELETE | `/v1/attachments/:id` | 삭제 → 204 |
| 19b | POST | `/v1/account/email-code` | **무인증.** 가입 이메일 인증번호 발송 `{email}` → `{sent,expiresInMin,devCode?}` — devCode 는 AUTH_MODE=dev + 메일 미설정일 때만 (2026-08-09) |
| 19c | POST | `/v1/account/email-code/verify` | **무인증.** `{email,code}` → `{verified,emailToken}` (인증표, 유효 30분) |
| 19d | GET/PUT | `/v1/account/profile` | 회원 프로필 조회·저장 `{fullName,phoneCountry?,phoneNumber?,emailToken?}` → `{fullName,phoneCountry,phoneNumber,plan,emailVerifiedAt,phoneVerifiedAt,complete}` |
| 19j | GET | `/v1/account/logins` | **내 로그인 기록** — 경로에 id 를 받지 않는다(토큰 주인 것만). 응답은 22h 와 같다 (2026-08-13) |
| 19g | POST | `/v1/account/password-reset/start` | **무인증.** `{email}` → `{sent,expiresInMin,devCode?}`. **계정이 없어도 같은 모양으로 답하고 메일은 보내지 않는다**(계정 열거 방지) (2026-08-13) |
| 19h | POST | `/v1/account/password-reset/verify` | **무인증.** `{email,code}` → `{verified,resetToken}` (30분) |
| 19i | POST | `/v1/account/password-reset/confirm` | **무인증.** `{resetToken,password}` → GoTrue 관리자 API 로 교체. **표는 한 번만 쓰인다** — 호출 전에 인증번호 줄을 지워 회수한다 |
| 19e | GET | `/v1/account/delete-preview` | 탈퇴하면 무엇이 사라지는지 → `{maps,attachments,fileBytes,docBytes,usedBytes,confirmPhrase}` (2026-08-11) |
| 19f | DELETE | `/v1/account` | **회원탈퇴 — 되돌릴 수 없다.** 본문 `{confirm}` 이 `confirmPhrase`(=`회원탈퇴`)와 정확히 같아야 한다 → `{deleted,maps,attachments,usedBytes,loginAccountRemoved}`. 맵·히스토리·첨부(파일 원본 포함)·계정이 모두 삭제되고, 탈퇴한 id 는 `deleted_accounts` 에 남아 **만료 전 토큰으로 되살아나지 않는다**. 로그인 계정은 **GoTrue 관리자 API + 앱 DB 양쪽**에서 지운다 — `loginAccountRemoved: false` 면 **같은 이메일로 재가입이 막힌다**(2026-08-11) |
| 22a | POST | `/v1/admin/login/start` | **관리자 콘솔 2단계 로그인 ①.** GoTrue 토큰 필요 — 관리자(`ADMIN_EMAILS`)면 인증번호 발송, 아니면 **403**(인증번호도 보내지 않는다) (2026-08-13) |
| 22b | POST | `/v1/admin/login/verify` | ② `{code}` → `{adminToken, email, expiresAt}` — 표는 헤더 `X-Admin-Token` 으로 싣는다(유효 8시간) |
| 22c | GET | `/v1/admin/me` | 표가 살아 있는지 → `{email}` |
| 22d | GET | `/v1/admin/summary` | 요금제별 인원·최근 7/30일 가입 |
| 22e | GET | `/v1/admin/users?q=` | 회원 목록 — 요금제·사용량·맵/첨부 수·최근 30일 **저장** 횟수·마지막 활동(플랫폼·브라우저·IP) + **마지막 로그인**(GoTrue). 응답에 `loginHistoryAvailable` — false 면 GoTrue 를 못 불러 그 칸만 비었다는 뜻 (2026-08-13) |
| 22f | PATCH | `/v1/admin/users/:id/plan` | `{plan}` → 요금제 변경. `quota_bytes` 는 DB 트리거가 따라온다 |
| 22h | GET | `/v1/admin/users/:id/logins` | 그 회원의 **로그인 이력** — `{available,events[],logins30d,loginsTotal,lastLoginAt}`. GoTrue 감사 로그(`GOTRUE_DATABASE_URL`)를 읽는다. 설정이 없으면 `available:false` (2026-08-13) |
| 22g | GET | `/v1/admin/settings` | 서버가 **지금 들고 있는** 설정값(env·DB). 화면 상수는 프런트가 자기 것을 합친다 |
| 20 | GET | `/v1/health` | **무인증.** DB 연결 + 필수 테이블·컬럼 검사 → `{status,db,schema,missingTables?,missingColumns?,time}` |
| 20b | GET | `/v1/health/ip` | **무인증.** 서버가 이 요청의 IP 를 무엇으로 보는지 → `{ip,ips,xForwardedFor,xRealIp,remoteAddress,trustProxy,userAgent,hint}` — 프록시 단계 진단용(2026-08-09). **자기 요청의 헤더만** 되돌려 준다 |
| 21 | POST | `/v1/maps/:mapId/nodes` | 정규화 노드 생성 (ltree path·depth 자동) |
| 22 | PATCH | `/v1/maps/:mapId/nodes` | **autosave** — 배치 patch(add/update/delete/move), `baseVersion` 충돌 409 `VERSION_CONFLICT`, 중복 `patchId` 409 `DUPLICATE_PATCH` |
| 23 | PATCH | `/v1/nodes/:id` | 노드 속성 수정 (text·style→style_json·collapsed·shape·layout·manualPosition) |
| 24 | DELETE | `/v1/nodes/:id` | subtree cascade 삭제 → 204 |
| 25 | PATCH | `/v1/nodes/:id/move` | `move_node_subtree` — 부모 변경 + subtree path 재작성, 순환 차단 |
| 26 | PATCH | `/v1/nodes/:id/layout` | layout_type 변경 |

#### 대용량 첨부 — 청크 업로드 5개 (2026-08-06, **구현 완료**)

16번(`POST /v1/attachments`)은 파일 **전체를 한 요청에** 받아 메모리에
올린다. 그래서 상한이 200MB 로 묶여 있다. 그보다 큰 멀티미디어는 아래
5개가 받는다 — 조각을 **스트림 그대로** 디스크에 흘리므로 서버 메모리가
파일 크기와 무관하고, 상한이 **1GB**(`ATTACHMENT_CHUNK_MAX_MB`)다.
**전체 설계·근거는
[`../04-extensions/attachment-storage.md` §12](../04-extensions/attachment-storage.md)** 에 있다.

| # | 메서드 | 경로 | 설명 |
|---|---|---|---|
| 27 | POST | `/v1/attachments/uploads` | 세션 시작 `{mapId,filename,mime,size}` → `{uploadId,partSize,partCount,received:[]}`. 쿼터 **사전 예약**, 상한 초과 413 |
| 28 | PUT | `/v1/attachments/uploads/:id/parts/:index` | 조각 본문(raw). **멱등** — 같은 index 재전송은 덮어쓰기 → `{received:n}` |
| 29 | GET | `/v1/attachments/uploads/:id` | 이어받기용 상태 → `{partSize,partCount,received:[0,1,4]}` |
| 30 | POST | `/v1/attachments/uploads/:id/complete` | 조각 이어붙여 확정 → 16번과 **같은 모양**의 첨부 메타 + `url`. 빠진 조각 있으면 409 |
| 31 | DELETE | `/v1/attachments/uploads/:id` | 취소 — 조각·예약 정리 → 204 |

> 조각 크기는 **서버가 정한다**(27번 응답의 `partSize`, 기본 8MB —
> `ATTACHMENT_PART_KB`) — 클라이언트가 고르게 두면 프록시 한도·메모리
> 상한을 서버가 통제할 수 없다. 임시 조각은
> `STORAGE_LOCAL_DIR/tmp/<userId>/<uploadId>/` 에 쌓이므로 **남의
> `uploadId` 는 조회 자체가 안 되어 404**(존재 여부를 흘리지 않는다).
> 미완성 세션은 24시간 뒤 GC 가 지운다.
>
> 28번은 **raw body** 다 — `Content-Type: application/octet-stream` 으로
> 보낸다. multer 를 타지 않고 `pipeline(req, createWriteStream(...))` 로
> 바로 흘린다. 크기가 기대와 다른 조각은 **400 이고 저장되지 않는다**
> (마지막 조각만 `partSize` 보다 작을 수 있다).

> **nodes 계열(21~26)은 실존·가동 중**이다 — 문서 스냅샷 경로(6·7)와
> 병행하며, 현재 프런트는 스냅샷 경로만 사용한다(정규화 경로는 협업·세밀
> 동기화용).

### 에러 형식 (실물 — NestJS 기본)

```json
{ "statusCode": 404, "message": "맵을 찾을 수 없거나 권한이 없습니다.", "error": "Not Found" }
```

- 본문 설계의 `{"error":"ERROR_CODE","message",…}` 커스텀 형식이 아니라
  **NestJS 기본 HttpException 형식**이다. `message` 는 한국어 문장(또는
  ValidationPipe 의 배열)이고, autosave 충돌 등 일부는 409 응답 body 에
  `VERSION_CONFLICT`/`DUPLICATE_PATCH` 식별자를 담는다.
- 주요 상태코드: 400(검증), 401(인증), 404(없음/남의 것 — 403 대신 404 로
  숨김), 409(제목 중복·편집 잠금·버전 충돌·중복 패치·폴더 비우기),
  413(쿼터 초과), 503(첨부 저장소 접근 불가).

### 미구현 섹션 목록

§0.3 Rate Limit · §0.4 권한 모델(owner 외 역할) · §1 Auth · §4 Export ·
§4-1 Import · §5 노드 배경 이미지 · §6 태그 · §7 Node Indicator ·
§8 Publish · §9 AI Generation · §10 Users · §11 Translation ·
§12 AI Workflow · §13 Collaboration(실물은 map_edit_locks 단일 세션 잠금만)
· §14 Chat/Thread/AI Assist · §15 Redmine · §16 Dashboard · §17 Chat ·
§18 Layout 변경 API · §19 Bulk Node Update — 전부 서버에 없다.

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
>
> **[v2.2 주요 추가 — 2026-04-16]**
> - Chat v1.1: `recipientId` (DM 전송 대상 지정), `recipientFilter` 파라미터 추가 (섹션 14, 17)
> - Chat 오프라인 확인: GET /maps/:id/chat/mentions/unread, PATCH /maps/:id/chat/mentions/read (섹션 17 신규)
> - WebSocket 이벤트 추가: `chat:mention:new`, `chat:mention:read` (섹션 14)
> - `text` → `content` 필드명 통일 (chat_messages)
>
> **[v2.3 주요 추가 — 2026-04-16]**
> - Export 엔드포인트 통합: `POST /maps/:id/export/markdown` + `POST /maps/:id/export/html` → `POST /maps/:id/export { format }` 로 통합 (섹션 4)
> - Import 엔드포인트 추가: `POST /maps/:id/import`, `POST /maps` 의 `nodes` 파라미터 (섹션 4-1 신규)
> - Autosave 엔드포인트 경로 변경: `PATCH /maps/:id/document` → `PATCH /maps/:id/nodes`, 패치 op 타입 명확화 (`add`/`update`/`delete`/`move`), 응답에 `conflicts[]` 추가 (섹션 2)
> - Dashboard 외부 업데이트: `PATCH /maps/:id/data` (X-API-Key 인증) 추가 (섹션 16)
> - Chat 섹션 14: GET /maps/:id/chat/messages 응답에 `hasMore` 명시, `before={cursor}` 파라미터 명확화, POST 에 `mentionedUserIds` 추가
> - Chat 섹션 17: 멘션 unread 응답 스키마 정규화 (`mentionedAt`, `content`, `isRead`), 단건 읽음 처리 `PATCH /maps/:id/chat/mentions/:messageId/read` 추가

---

## Base URL

```
https://api.example.com/v1
```

---

## 0. 보안 및 인증 정책

### 0.1 JWT 토큰 구조

모든 API는 Supabase Auth가 발급하는 JWT Bearer Token을 사용한다.

```
Authorization: Bearer {accessToken}
```

> **⚠️ 실물 정정 (2026-08-04)** — 아래 표·보안 원칙은 설계 시점 계획이며
> 실제 구현과 다르다:
> - **세션(access/refresh 토큰)은 localStorage 에 영속**한다
>   (`stores/authStore.ts` — 새로고침 유지, 만료 60초 전 자동 refresh).
> - **쿠키는 사용하지 않는다** (httpOnly Cookie refresh 없음).
> - 헤더를 실을 수 없는 다운로드 링크용으로 **`?access_token=<JWT>` 쿼리
>   폴백**을 서버가 허용한다 (AuthGuard — 첨부 다운로드 등).
> - 서버는 토큰을 `SUPABASE_JWT_SECRET` 으로 로컬 검증(HS256)만 한다.

| 토큰 종류 | 수명 | 저장 위치 (설계 → **실물**) | 용도 |
|-----------|------|-----------|------|
| Access Token | **1시간** | ~~메모리 (변수)~~ → **localStorage** | API 요청 인증 |
| Refresh Token | **7일** | ~~httpOnly Cookie~~ → **localStorage** | Access Token 재발급 (프런트→GoTrue 직접) |

> ~~**보안 원칙**: Access Token은 localStorage에 저장하지 않는다. XSS 공격 방어를 위해 메모리(Zustand store)에만 보관한다.~~
> (설계 원칙이었으나 실물은 localStorage 영속 — 새로고침 세션 유지 우선. XSS 방어 강화는 backlog.)

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

### 0.3 Rate Limit 정책 `[미구현]`

> 실물 API 에는 rate limit 이 없다 (설계안).

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

### 0.4 권한 모델 요약 `[미구현 — 실물은 owner 단독]`

> 실물은 **소유자(owner) 단독 모델**이다 — 모든 쿼리가 `owner_id = 현재
> 사용자`. workspace editor/viewer·publish 공개 읽기·협업 역할은 설계안.

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

## 1. Auth `[미구현 — 프런트가 GoTrue 직접 호출]`

> 서버에 /auth 엔드포인트는 없다. 가입/로그인/갱신/로그아웃은 프런트가
> **GoTrue REST 를 직접 호출**하고(`services/cloud/supabaseAuth.ts`),
> API 서버는 Bearer JWT 를 로컬 검증만 한다 ("현재 구현" 절 참조).

### POST /auth/signup `[미구현 — 프런트가 GoTrue 직접 호출]`
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

### POST /auth/login `[미구현 — 프런트가 GoTrue 직접 호출]`
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

### POST /auth/refresh `[미구현 — 프런트가 GoTrue 직접 호출]`
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

### POST /auth/logout `[미구현 — 프런트가 GoTrue 직접 호출]`
로그아웃 (refreshToken 무효화)

**Response** `204 No Content`
> `Set-Cookie: refreshToken=; Max-Age=0` 로 쿠키 삭제

---

## 2. Maps `[구현됨]`

> 이 섹션 + 문서 스냅샷·히스토리·편집 잠금 엔드포인트(설계본에 없던
> PUT/GET `/maps/:id/document`, `/versions`, `/edit-heartbeat`,
> `/edit-release`)는 "현재 구현" 절의 표 1~11 참조.

### POST /maps
새 맵 생성

**Request Body**
```json
{
  "title": "New Mindmap",
  "workspaceId": "uuid-...",
  "defaultLayoutType": "radial-bidirectional",
  "folderId": "uuid-... | null",
  "kind": "solo | collab"
}
```

**Response** `201 Created`
```json
{
  "mapId": "uuid-...",
  "title": "New Mindmap",
  "folderId": null,
  "kind": "solo",
  "currentVersion": 0,
  "createdAt": "2026-03-29T00:00:00Z"
}
```

`409 Conflict` — **같은 폴더에 같은 이름의 맵**이 이미 있을 때
(대소문자·앞뒤 공백 무시). 메시지에 다른 이름/다른 폴더 안내가 들어 있다.
`PATCH /maps/:id` 의 이름 변경·폴더 이동도 같은 검사를 거친다.
설계: [document-library.md](../04-extensions/document-library.md)

---

### /folders — 문서함 (2026-08-02)

| 메서드 | 경로 | 비고 |
|---|---|---|
| GET | `/folders` | 내 폴더 전부(평면) + `mapCount`. 트리 구성은 클라이언트 |
| POST | `/folders` | `{name, parentId}` — 같은 부모에 같은 이름이면 409 |
| PATCH | `/folders/:id` | `{name?, parentId?}` — 자기 자신/자손으로 이동은 400 |
| DELETE | `/folders/:id` | **비어 있을 때만** 204, 아니면 409 |

---

### GET /maps
내 맵 목록 조회 (소유 기준 — 워크스페이스 공유는 미구현)

**Query** `?deleted=false&page=1&limit=20`
`&folder=root|<folderId>` — 폴더별 조회 (`root` = 최상위만)
`&sort=title|updatedAt&order=asc|desc` — 문서함 정렬 (기본 `updatedAt desc`)
`&q=<검색어>` — **내용 검색** (2026-08-08). 맵 **제목 + 맵 안(노드 텍스트·
노트·태그·링크 이름/주소·첨부 파일명)** 을 찾는다. 대상은 저장 시 DB
트리거가 만드는 `map_documents.search_text` — 조회 때 doc 을 파싱하지
않는다. 부분 문자열 검색이며 `%`·`_`·`\` 는 이스케이프된다. 200자에서 자른다.

> ⚠️ `workspaceId` 쿼리는 **미지원** (실물은 소유 맵만 조회).

**Response** `200 OK`
```json
{
  "maps": [
    {
      "mapId": "uuid-...",
      "title": "My Map",
      "folderId": null,
      "kind": "solo",
      "deletedAt": null,
      "updatedAt": "2026-03-29T00:00:00Z"
    }
  ],
  "total": 1
}
```

`q` 를 준 경우에만 각 맵에 한 필드가 더 실린다:

| 필드 | 뜻 |
|---|---|
| `matchCount` | **맵 내용에서 맞은 건수**. 1건 = 조각 하나(노드 텍스트/노트/태그/링크/첨부명). `0` = 이름만 맞음 |

```json
{ "mapId": "uuid-...", "title": "회의록 2026", "matchCount": 12 }
```

이름이 어디서 맞았는지는 서버가 말하지 않는다 — 검색어를 아는 **프런트가
글자를 강조**하면 되기 때문이다. 맵 내용은 여러 노드·노트가 걸릴 수 있어
대표 문장을 고르는 대신 **건수만** 준다(`맵(12건)`).

설계 근거(왜 trigram 인지, 왜 MATERIALIZED CTE 인지, CTE 안의 소유자
조건이 왜 필요한지)는 [document-library.md §8](../04-extensions/document-library.md).

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

**Request Body** (변경 필드만 — 실물 `UpdateMapDto` 기준)
```json
{
  "title": "Updated Title",
  "viewMode": "dashboard",
  "refreshIntervalSeconds": 30,
  "defaultLayoutType": "radial-bidirectional",
  "folderId": "uuid-... | null",
  "kind": "solo | collab"
}
```

> `defaultLayoutType`·`folderId`(폴더 이동, null = 최상위)·`kind` 는 실물
> DTO 에 추가된 필드다. 이름 변경·폴더 이동 시 같은 폴더 안 제목 중복
> 검사(409)를 거친다.

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

### PATCH /maps/{mapId}/nodes
Autosave — 맵 변경 patch 저장

> 클라이언트가 편집 작업을 debounce 후 전송하는 autosave 엔드포인트.  
> `baseVersion`은 클라이언트가 인지한 마지막 버전이며, 서버의 `currentVersion`과 불일치 시 409를 반환한다.  
> `patchId`는 멱등성 키로 동일 patchId의 중복 처리를 방지한다.

**Request Body**
```json
{
  "clientId": "cli_abc123",
  "patchId": "p_1710598325_001",
  "baseVersion": 128,
  "timestamp": "2026-03-29T14:32:05.123Z",
  "patches": [
    {
      "op": "add",
      "nodeId": "uuid-new",
      "data": { "parentId": "uuid-parent", "text": "New Node", "orderIndex": 1.5 }
    },
    {
      "op": "update",
      "nodeId": "uuid-...",
      "data": { "text": "Updated Text" }
    },
    {
      "op": "delete",
      "nodeId": "uuid-..."
    },
    {
      "op": "move",
      "nodeId": "uuid-...",
      "data": { "parentId": "uuid-...", "orderIndex": 2.0 }
    }
  ]
}
```

| 필드 | 타입 | 필수 | 설명 |
|------|------|:---:|------|
| `clientId` | string | ✅ | 클라이언트 식별자 |
| `patchId` | string | ✅ | 멱등성 키 (중복 처리 방지) |
| `baseVersion` | number | ✅ | 클라이언트가 인지한 마지막 버전 |
| `timestamp` | string (ISO 8601) | ❌ (optional) | 패치 생성 시각 — 실물 DTO 에서 선택 필드 |
| `patches` | Array | ✅ | 변경 작업 목록 |
| `patches[].op` | `"add"` \| `"update"` \| `"delete"` \| `"move"` | ✅ | 작업 종류 |
| `patches[].nodeId` | string | ✅ | 대상 노드 UUID |
| `patches[].data` | Partial\<NodeObject\> | ❌ | `"delete"` 시 생략, 나머지는 변경 필드만 포함 |

**Response** `200 OK`
```json
{
  "newVersion": 129,
  "conflicts": []
}
```

| 필드 | 타입 | 설명 |
|------|------|------|
| `newVersion` | number | 서버 반영 후의 새 버전 번호 |
| `conflicts` | string[] | 충돌 발생 nodeId 목록 (LWW 적용 후 패배한 항목) |

**버전 충돌 시** `409 Conflict`
```json
{ "error": "VERSION_CONFLICT", "currentVersion": 130 }
```

**중복 패치 시** `409 Conflict`
```json
{ "error": "DUPLICATE_PATCH", "patchId": "p_1710598325_001" }
```

---

## 3. Nodes `[구현됨]`

> 정규화 노드 경로는 **실존·가동 중**이다 (스냅샷 경로와 병행 — 프런트는
> 현재 스냅샷 경로만 사용). "현재 구현" 절의 표 21~26 참조.

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

**Edge 자동 결정 정책**

`layoutType` 변경 시 서버/클라이언트는 별도 파라미터 없이 아래 규칙으로 연결선(Edge) 타입을 **자동 전환**한다.

| layoutType 계열 | Edge 타입 (자동) | 연결선 형태 |
|---|---|---|
| `radial-*` | `curve-line` | Cubic Bezier 곡선 |
| `tree-*` / `hierarchy-*` / `process-tree-*` / `freeform` / `kanban` | `tree-line` | 직각선 (Orthogonal) |

> - `line_type` / `connector_style` 파라미터는 불필요 — 레이아웃값으로 자동 결정  
> - `straight`(대각선) 타입은 사용하지 않음  
> - 참조: `docs/03-editor-core/edge-policy.md §3`

---

## 4. Export `[미구현]`

> 상세 동작 정의: `docs/04-extensions/import-export/20-export.md`

### POST /maps/{mapId}/export
Export 작업 요청 (Markdown 또는 HTML)

**Request Body**
```json
{
  "format": "markdown",
  "exportMode": "basic",
  "includeCollapsed": true,
  "includeTags": true,
  "includeNotes": true,
  "includeLinks": true,
  "imageHandling": "omit",
  "scope": "full",
  "rootNodeId": null
}
```

> 상세 동작 정의는 `docs/04-extensions/import-export/20-export.md` 참조
| 필드 | 타입 | 필수 | 설명 |
|------|------|:---:|------|
| `format` | `"markdown"` \| `"html"` | ✅ | 내보내기 포맷 |
| `exportMode` | `"basic"` \| `"extended"` | ❌ | Markdown 전용. `"extended"` 시 YAML Front Matter 포함 (기본: `"basic"`) |
| `includeCollapsed` | boolean | ❌ | 접힌 노드 포함 여부 (기본: true) |
| `includeTags` | boolean | ❌ | 태그 포함 여부 (기본: true) |
| `includeNotes` | boolean | ❌ | 노드 메모 포함 여부 (기본: true) |
| `includeLinks` | boolean | ❌ | 링크 포함 여부 (기본: true) |
| `imageHandling` | `"omit"` \| `"alt-text"` \| `"link"` \| `"embed"` | ❌ | 배경 이미지 처리 (Markdown 기본: `"omit"`, HTML 기본: `"embed"`) |
| `scope` | `"full"` \| `"subtree"` | ❌ | 내보내기 범위 (기본: `"full"`) |
| `rootNodeId` | string \| null | ❌ | `scope="subtree"` 시 기준 노드 UUID |

**Response** `202 Accepted` (비동기 Job)
```json
{
  "jobId": "uuid-...",
  "status": "pending"
}
```

> 소형 맵(≤ 200 nodes)은 즉시 변환하여 `200 OK`로 반환 (`Content-Disposition: attachment`).

---

### GET /maps/{mapId}/export/{jobId}
Export 작업 상태 조회

**Response** `200 OK`
```json
{
  "jobId": "uuid-...",
  "status": "done",
  "downloadUrl": "https://storage.../exports/map.md",
  "expiresAt": "2026-03-30T00:00:00Z"
}
```

> 상세 동작 정의는 `docs/04-extensions/import-export/20-export.md` 참조
`status`: `pending` | `processing` | `done` | `error`

---

## 4-1. Import `[미구현]`

> 상세 동작 정의: `docs/04-extensions/import-export/21-import.md`

### POST /maps/{mapId}/import
현재 맵에 노드 추가 (Markdown 가져오기)

**Request Body**
```json
{
  "nodes": { }
}
```

| 필드 | 타입 | 필수 | 설명 |
|------|------|:---:|------|
| `nodes` | NodeTree | ✅ | 클라이언트에서 파싱한 노드 트리 (Markdown → AST → NodeTree 변환 결과) |

**Response** `200 OK`
```json
{
  "importedCount": 24
}
```

> `POST /maps` 에 `nodes` 파라미터를 추가하면 새 맵 생성과 동시에 가져오기가 가능하다 (아래 참조).

---

> **`POST /maps` 업데이트 — `nodes` 파라미터 추가**
>
> 새 맵 생성과 동시에 Markdown 가져오기를 처리하는 경우, 기존 `POST /maps` 요청 Body에 `nodes` 필드를 포함한다.
>
> ```json
> {
>   "title": "가져온 맵 제목",
>   "workspaceId": "uuid-...",
>   "defaultLayoutType": "radial-bidirectional",
>   "nodes": { }
> }
> ```
>
> `nodes` 가 포함된 경우 서버는 맵 생성 후 `POST /maps/{mapId}/import` 와 동일한 방식으로 노드 트리를 삽입한다.

---

## 5. 노드 배경 이미지 (Node Background Image) `[미구현]`

### PATCH /nodes/{nodeId}/background-image
노드 배경 이미지 설정 (preset 또는 업로드된 이미지 적용)

**Request Body — preset 타입**
```json
{
  "type": "preset",
  "assetId": "preset_img_102",
  "url": "https://cdn.example.com/assets/preset/102.png",
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
  "url": "https://storage.example.com/uploads/node/bg.png",
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
    "url": "https://storage.example.com/uploads/node/bg.png",
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
  "url": "https://storage.example.com/uploads/nodes/{nodeId}/bg.png",
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
      "thumbnailUrl": "https://cdn.example.com/assets/preset/101_thumb.png",
      "url": "https://cdn.example.com/assets/preset/101.png"
    }
  ]
}
```

---

## 6. 태그 (Tags) `[미구현]`

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

## 7. Node Indicator `[미구현]`

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
      "url": "https://storage.example.com/attachments/..."
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

## 8. Publish `[미구현]`

### POST /maps/{mapId}/publish
맵을 공개 URL로 퍼블리싱

**Response** `200 OK`
```json
{
  "publishId": "abcd1234efgh5678",
  "publishUrl": "https://app.example.com/published/abcd1234efgh5678",
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

## 9. AI Generation `[미구현]`

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

## 10. Users (사용자 프로필 & UI 환경설정) `[미구현]`

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
> - 참조: `docs/03-editor-core/node/03-node-indicator.md` §23 (NODE-15)

---

## 11. Translation (다국어 번역, V2) `[미구현]`

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
> - 참조: `docs/03-editor-core/node/03-node-indicator.md` §16 (편집자 override 아이콘 ⛔/🔁)

---

## 12. AI Workflow `[미구현]`

> 관련 PRD: `docs/04-extensions/ai/19-ai-workflow.md`

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


## 13. Collaboration — 협업맵 `[미구현]`

> ⚠️ 협업 API(초대·scope·Soft Lock 등)는 전부 미구현이다. **실제 잠금은
> `map_edit_locks` 기반 단일 세션 편집 잠금 모델**로 구현되어 있다 —
> `GET /maps/:id/document?editSession=`(`editLock: 'acquired'|'busy'`) +
> `POST /maps/:id/edit-heartbeat`(TTL 60초) + `edit-release`, 저장 시 다른
> 세션 잠금이면 409. 노드 단위 Soft Lock(§13-9/13-10)과는 다른 모델이다.

> **Base URL**: `https://api.example.com/v1`  
> **인증**: 모든 엔드포인트 `Authorization: Bearer {accessToken}` 필수  
> 전체 WS 이벤트 및 상세 정책: 본 문서 §13 Collaboration / `docs/04-extensions/collaboration/25-map-collaboration.md`

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
  "redirect_url": "https://example.com/maps/map-uuid"
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

## 14. Collaboration Chat / Node Thread / AI Assist (V2~V3) `[미구현]`

> 상세 엔드포인트는 본 문서 §14를 기준으로 한다.

### GET /maps/{mapId}/chat/messages
최근 map-room chat 메시지 조회

**Query**
- `before={cursor}` — 커서 페이징: 해당 messageId 이전 메시지 조회
- `limit=50` (기본 30, 최대 100)
- `includeTranslations=true`
- `recipientFilter=all|mine` (v1.1) — `all`: 전체 공개 메시지만 / `mine`: 전체 공개 + 나의 DM 포함 (기본: `mine`)

**Response** `200 OK`
```json
{
  "messages": [ ...ChatMessage[] ],
  "hasMore": false
}
```

### POST /maps/{mapId}/chat/messages
REST fallback 또는 초기 송신용 메시지 저장

**Request Body**
```json
{
  "clientMsgId": "cmsg_1712300000000_001",
  "content": "이 노드 구조 다시 봐주세요",
  "nodeId": "uuid-node-optional",
  "recipientId": null,
  "mentionedUserIds": ["uuid-user-1"]
}
```

| 필드 | 타입 | 필수 | 설명 |
|------|------|:---:|------|
| `clientMsgId` | string | ✅ | 멱등성 키 (중복 전송 방지) |
| `content` | string | ✅ | 메시지 본문 |
| `nodeId` | string \| null | ❌ | null = map-room, UUID = node thread |
| `recipientId` | string \| null | ❌ | null = 전체 공개, UUID = DM 수신자 (v1.1) |
| `mentionedUserIds` | string[] | ❌ | @멘션 대상 userId 목록 (`chat_mentions` INSERT 트리거) |

**Response** `201 Created` → ChatMessage

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
| C→S | `chat:message:send` | map-room / node thread 메시지 송신 (`recipientId` 포함 가능, v1.1) |
| S→C | `chat:message` | 원문 메시지 수신 (`recipientId`, `isDm` 필드 포함, v1.1) |
| S→C | `chat:translation:ready` | targetLang 번역 결과 수신 |
| S→C | `chat:mention:new` | 본인에게 온 멘션/DM 알림 (`unreadCount` 포함, v1.1) |
| C→S | `chat:mention:read` | 멘션/DM 읽음 처리 (`mentionIds[]`, v1.1) |
| S→C | `node:thread:updated` | 댓글 수 / 최신 시각 갱신 |
| C→S | `node:thread:ai:run` | AI preview 요청 |
| S→C | `node:thread:ai:preview` | AI 요약 / 작업 후보 preview |

---

## 15. Redmine 연동 (V1 WBS) `[미구현]`

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

## 16. Dashboard (V3) `[미구현]`

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

### PATCH /maps/{mapId}/data
외부 시스템에서 노드 값 일괄 업데이트 (DASH-05)

> Dashboard 외부 업데이트 전용 엔드포인트.  
> `Authorization: Bearer` 대신 **`X-API-Key`** 헤더로 인증한다 (API Key는 `SETT-07`에서 발급).  
> Redis 캐시를 무효화하여 다음 polling 시 즉시 반영된다.

**Headers**
```
X-API-Key: {apiKey}
```

**Request Body**
```json
{
  "nodes": [
    {
      "nodeId": "uuid-...",
      "value": "98.5%",
      "label": "가용성"
    },
    {
      "nodeId": "uuid-...",
      "value": 42,
      "label": null
    }
  ]
}
```

| 필드 | 타입 | 필수 | 설명 |
|------|------|:---:|------|
| `nodes` | Array | ✅ | 업데이트할 노드 목록 |
| `nodes[].nodeId` | string | ✅ | 대상 노드 UUID |
| `nodes[].value` | string \| number \| null | ✅ | 노드에 표시할 값 (`nodes.text` 업데이트) |
| `nodes[].label` | string | ❌ | 노드 레이블 변경 (생략 시 기존 유지) |

**Response** `200 OK`
```json
{
  "updatedCount": 2,
  "refreshedAt": "2026-04-16T10:00:00Z"
}
```

**Error**
```json
// 401 — API Key 인증 실패
{ "error": "UNAUTHORIZED", "message": "Invalid or missing API Key." }
// 403 — API Key가 해당 맵에 대한 권한 없음
{ "error": "FORBIDDEN" }
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

## 17. Chat (V2) — 채팅 REST 인터페이스 `[미구현]`

> 협업 맵 내 map-room 채팅 REST 인터페이스.  
> WebSocket(`chat:message:send`) 미지원 환경용 REST fallback.  
> **v1.1**: `recipientId` (DM), 오프라인 멘션/DM 확인 API 추가.

### POST /maps/{mapId}/chat
채팅 메시지 전송 (REST fallback)

> WebSocket 연결이 없는 환경에서 메시지를 전송하거나 초기 메시지를 저장할 때 사용한다.

**Request Body**
```json
{
  "clientMsgId": "cmsg_1712300000000_001",
  "content": "이 부분을 더 상세하게 다듬어봅시다.",
  "nodeId": null,
  "recipientId": null
}
```

| 필드 | 타입 | 필수 | 설명 |
|------|------|:---:|------|
| `clientMsgId` | string | ✅ | 클라이언트 생성 멱등성 키 (중복 전송 방지) |
| `content` | string | ✅ | 메시지 본문 |
| `nodeId` | string \| null | ❌ | null = map-room, UUID = 특정 node thread 연결 |
| `recipientId` | string \| null | ❌ | null = 전체 공개, UUID = DM 수신자 (v1.1) |

**Response** `201 Created`
```json
{
  "id": "uuid-...",
  "mapId": "uuid-...",
  "nodeId": null,
  "userId": "uuid-...",
  "clientMsgId": "cmsg_1712300000000_001",
  "content": "이 부분을 더 상세하게 다듬어봅시다.",
  "recipientId": null,
  "isDm": false,
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
| `recipientFilter` | ❌ | `all` = 전체 공개만 / `mine` = DM 포함 (기본: `mine`, v1.1) |

**Response** `200 OK`
```json
{
  "messages": [
    {
      "id": "uuid-...",
      "userId": "uuid-...",
      "displayName": "홍길동",
      "content": "이 부분을 더 상세하게 다듬어봅시다.",
      "recipientId": null,
      "isDm": false,
      "sourceLang": "ko",
      "createdAt": "2026-04-16T10:00:00Z",
      "translations": []
    }
  ],
  "hasMore": false
}
```

---

### GET /maps/{mapId}/chat/mentions/unread
미읽음 멘션/DM 목록 조회 (v1.1 신규)

> 재접속 시 미읽음 멘션·DM 수를 뱃지로 표시하기 위해 호출.  
> 최근 50건 우선 반환.

**Response** `200 OK`
```json
{
  "unreadCount": 3,
  "mentions": [
    {
      "id": "mention-uuid",
      "messageId": "msg-uuid",
      "mentionedAt": "2026-04-16T10:00:00Z",
      "content": "@홍길동 이 부분 확인 부탁드립니다...",
      "senderName": "Alice",
      "isRead": false
    }
  ]
}
```

| 필드 | 타입 | 설명 |
|------|------|------|
| `messageId` | string | 멘션이 포함된 메시지의 ID |
| `mentionedAt` | string (ISO 8601) | 멘션 발생 시각 (`chat_mentions.created_at`) |
| `content` | string | 메시지 본문 미리보기 |
| `senderName` | string | 발신자 표시 이름 |
| `isRead` | boolean | 읽음 여부 (`chat_mentions.is_read`) |

---

### PATCH /maps/{mapId}/chat/mentions/{messageId}/read
단일 메시지의 멘션/DM 읽음 처리 (v1.1 신규)

> `messageId`에 해당하는 `chat_mentions` row를 읽음 처리한다 (`is_read = true`, `read_at = NOW()`).  
> 멱등 처리: 이미 읽음 상태이면 변경 없이 `{ ok: true }` 반환.

**Response** `200 OK`
```json
{ "ok": true }
```

---

### PATCH /maps/{mapId}/chat/mentions/read
멘션/DM 일괄 읽음 처리 (v1.1 신규)

**Request Body**
```json
{
  "mentionIds": ["mention-uuid-1", "mention-uuid-2"],
  "readAll": false
}
```

| 필드 | 타입 | 설명 |
|------|------|------|
| `mentionIds` | string[] | 읽음 처리할 chat_mentions.id 목록 |
| `readAll` | boolean | true 시 해당 맵의 본인 미읽음 전체 읽음 처리 |

**Response** `200 OK`
```json
{ "updatedCount": 2, "remainingUnread": 1 }
```

---

## 18. Layout 변경 API `[미구현]`

> **[v2.4 신규]** Layout 변경 및 Bulk Node Update Atomic 처리

### PATCH /maps/{mapId}/layout

맵 또는 루트 노드의 layoutType을 변경하고, 재배치 결과를 반영한다.

**Request Body**
```json
{
  "layoutType": "tree-right",
  "scope": "entire-map"
}
```

| 필드 | 타입 | 설명 |
|------|------|------|
| `layoutType` | string | 변경할 layoutType (허용 값: `08-layout.md §4.1` 참조) |
| `scope` | `"entire-map"` \| `"subtree"` | 적용 범위. `"subtree"` 시 `nodeId` 필드 필요 |
| `nodeId` | string? | `scope="subtree"` 시 Subtree root 노드 ID |

**Response** `200 OK`
```json
{
  "mapId": "uuid",
  "layoutType": "tree-right",
  "affectedNodeCount": 42,
  "revisionId": "uuid"
}
```

**Rule**

* Edge Style은 layoutType에서 자동 결정된다.
  * `radial-*` → `curve-line`
  * 그 외 → `orthogonal-line`
* MVP에서는 edge style 수동 변경을 지원하지 않는다.
* layoutType 변경은 즉시 autosave 대상이 된다.

---

## 19. Bulk Node Update API `[미구현]`

### PATCH /nodes/bulk

여러 노드의 `parent_id`, `order_index`, `path`, `depth`, `manual_position` 등을 한 번에 갱신한다.  
레이아웃 변경, subtree 이동 등 다수 노드의 구조 정보를 동시에 업데이트해야 할 때 사용한다.

**Request Body**
```json
{
  "mapId": "uuid",
  "transactionId": "client-generated-id",
  "nodes": [
    {
      "id": "node-1",
      "parentId": "node-root",
      "orderIndex": 10,
      "path": "root.n_node1",
      "depth": 1,
      "manualPosition": null
    }
  ]
}
```

| 필드 | 타입 | 설명 |
|------|------|------|
| `mapId` | string | 대상 맵 ID |
| `transactionId` | string | 클라이언트 생성 멱등성 키 |
| `nodes` | object[] | 업데이트할 노드 목록 |
| `nodes[].id` | string | 노드 ID |
| `nodes[].parentId` | string? | 변경할 부모 노드 ID (null = 루트) |
| `nodes[].orderIndex` | number? | 형제 간 정렬 순서 |
| `nodes[].path` | string? | ltree 경로 |
| `nodes[].depth` | number? | 계층 깊이 |
| `nodes[].manualPosition` | object? | `{ x, y }` Freeform 좌표, null 시 초기화 |

**Response** `200 OK`
```json
{
  "status": "success",
  "updatedNodeCount": 1,
  "revisionId": "uuid"
}
```

**Atomic Rule**

Bulk Node Update는 반드시 atomic transaction으로 처리한다.

* 모든 노드 업데이트 성공 → commit
* 하나라도 실패 → rollback, `409 BULK_UPDATE_PARTIAL_FAILURE` 반환
* rollback 시 클라이언트는 이전 상태를 유지하거나 `GET /maps/{mapId}` 재조회한다

> **이유**: 레이아웃 변경이나 subtree 이동은 여러 노드의 `path`, `depth`, `order_index`를 동시에 변경한다.  
> 일부만 저장되면 맵 구조(ltree 경로, depth 계층)가 깨지므로 atomic 처리가 필수다.

---

## 공통 에러 응답

> **⚠️ 실물 정정 (2026-08-04)** — 실물 API 는 아래 커스텀 형식이 아니라
> **NestJS 기본 HttpException 형식**을 쓴다:
>
> ```json
> { "statusCode": 404, "message": "맵을 찾을 수 없거나 권한이 없습니다.", "error": "Not Found" }
> ```
>
> - `message` 는 한국어 문장 (ValidationPipe 검증 실패 시 문자열 배열).
> - `error` 는 NestJS 표준 상태 문구(`"Not Found"`, `"Conflict"` 등)이며
>   아래 표의 커스텀 코드가 아니다. autosave 충돌만 409 body 에
>   `VERSION_CONFLICT`/`DUPLICATE_PATCH` 식별자를 담는다.
> - 남의 리소스 접근은 403 대신 **404 로 숨긴다**.
> - 실물 추가 상태코드: **413**(저장 쿼터 초과 — B9),
>   **503**(첨부 저장소 접근 불가), 409(제목 중복·편집 잠금·폴더 비우기).
> - 429 Rate Limit 은 미구현.

(설계본 형식 — 참고용)

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
| 403 | `FORBIDDEN` | 권한 없음 (실물은 404 로 숨김) |
| 404 | `NOT_FOUND` | 리소스 없음 |
| 409 | `VERSION_CONFLICT` | Autosave 버전 충돌 (baseVersion != currentVersion) |
| 409 | `DUPLICATE_PATCH` | 동일 patchId 중복 처리 |
| 409 | `DUPLICATE_TAG_NAME` | 같은 이름의 태그 이미 존재 (태그 API 미구현) |
| 413 | (쿼터 초과) | 저장 용량 쿼터 초과 — 실물 구현됨 (B9) |
| 429 | `RATE_LIMIT_EXCEEDED` | 요청 한도 초과 (미구현) |
| 500 | `INTERNAL_SERVER_ERROR` | 서버 내부 오류 |
