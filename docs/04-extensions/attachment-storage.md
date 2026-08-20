# 첨부 저장소 설계 (B9) — 서버 저장 + 내 드라이브 저장

> **이 문서의 역할**: 이미지·첨부파일을 **어디에 어떻게 저장하고 다시
> 불러올지**의 확정 설계다. 요금제 용량 정책, 사용자 개인 드라이브
> (구글 드라이브·OneDrive·NAS·로컬 대용량 디스크) 활용, 브라우저의
> 실제 제약과 그 우회 방법, 단계별 구현 계획을 담는다.
>
> 작성: 2026-08-02 (사용자 요구사항 기반 설계) · 최종 업데이트: 2026-08-06
> · 상태: **P1 구현 완료(2026-08-02, B9) · P2~P4 설계 · §12 청크 업로드 구현 완료(2026-08-06) · §8 요금제 4단 확정(가격 미정)**
> · 관련: `content-permanence.md`(현재의 내장 방식),
> `../02-domain/db-schema.md`, `../05-implementation/api-spec.md`

---

> 📍 **사용량 표시는 이미 아바타 메뉴에 구현**되어 있다 — 📊 저장 용량
> 막대(문서+첨부 합산, 90% 경고) + **현재 요금제 배지**. **요금제 변경만**
> 💳 구독 상태(현재 "준비 중")로 남아 있다 — DB 는 이미 `users.plan`
> 한 컬럼으로 준비돼 있어 결제가 붙으면 그것만 바꾸면 된다(§8.1).
> [auth-session-ui.md](auth-session-ui.md) §2 참조.

## 1. 배경 — 왜 필요한가

### 1.1 현재 방식의 한계

지금은 이미지·작은 첨부(≤2MB)를 **data URL 로 맵 문서 안에 내장**한다
(`content-permanence.md`). 원본이 사라져도 보존되는 큰 장점이 있지만,
서버 저장이 시작되면서 세 가지 부담이 드러났다:

| 부담 | 설명 |
|---|---|
| 스냅샷 비대 | 문서 스냅샷(JSONB) 하나에 이미지가 전부 들어간다. 사진 20장이면 수십 MB |
| 히스토리 증폭 | B8 버전 이력이 **저장 시점마다 스냅샷 전체를 복제**한다 — 이미지가 버전 수만큼 중복 |
| 요금제 계산 곤란 | 사용자별 사용량을 "문서 크기"로만 재게 되어, 어떤 파일이 얼마를 쓰는지 설명할 수 없다 |

### 1.2 사용자 요구 (2026-08-02 확정)

* 상용 서비스는 **요금제별 저장 용량**을 준다 (예: 기본 구독 10GB).
  맵의 노드 텍스트는 DB에 들어가 용량이 작고, **용량을 차지하는 것은
  대부분 첨부파일**이다.
* 많은 사용자가 이미 **자기 저장소**를 쓰고 있다 — 구글 드라이브,
  OneDrive, NAS(Synology·QNAP WebDAV), 로컬 대용량 디스크.
* 따라서 **개인 설정에서 첨부 저장 위치를 고를 수 있어야 한다**:
  기본은 EasyMindMap 서버, 옵션으로 **내 드라이브 폴더**.
* 맵을 열 때 첨부 경로가 **서버면 서버에서** 가져오고, **내 드라이브면
  그 폴더에서** 읽고, **없으면 메시지만** 보여준다.

---

## 2. ⚠️ 먼저 짚어야 할 브라우저 제약 (설계의 전제)

> **웹 브라우저는 `G:\내 드라이브\02.InfoMap` 같은 경로 문자열로 파일을
> 직접 읽을 수 없다.** 사용자가 경로를 입력해도 웹앱은 그 위치에 접근할
> 권한이 없다 (모든 브라우저의 기본 보안 정책). `file://` 링크를 웹
> 페이지에서 여는 것도 차단된다.

실현 가능한 방법은 다음과 같다:

| 방법 | 동작 | 지원 | 평가 |
|---|---|---|---|
| **File System Access API** (`showDirectoryPicker`) | 사용자가 **폴더를 한 번 선택** → 그 접근 권한(핸들)을 브라우저에 보관 → 다음부터 그 폴더에 읽기·쓰기 | **Chrome/Edge 86+** (Firefox·Safari ✗) | ✅ **채택** — 요구사항을 사실상 그대로 실현 |
| 클라우드 API (Google Drive / MS Graph) | OAuth 로그인 후 API 로 업로드·다운로드 | 전 브라우저 | ✅ 향후(P4) — "구글 드라이브에 저장"의 정석 |
| WebDAV 직접 호출 (NAS) | 브라우저 → NAS 직접 | CORS 설정 필요, 대개 실패 | ⚠️ 서버 프록시 경유로만 현실적(P4) |
| 데스크톱 앱(Tauri/Electron) | **진짜 경로**(`N:\dev`) 사용 가능 | 설치 필요 | 향후 데스크톱판에서 |

**결론**: "경로를 입력한다"가 아니라 **"폴더를 고른다"** 로 UX를 설계한다.
사용자가 `G:\내 드라이브\02.InfoMap` 를 고르면 그 폴더가 등록되고,
이후에는 자동으로(권한 유지 시) 또는 클릭 한 번(권한 재확인)으로 쓴다.
사용자가 기억하기 쉽도록 **표시용 별칭**(예: "구글드라이브 InfoMap")을
함께 저장한다 — 브라우저는 전체 경로를 알려주지 않으므로 별칭이 곧
사람이 읽는 경로 표시다.

> Firefox·Safari 사용자에게는 로컬 폴더 옵션을 **비활성 + 안내**로
> 표시한다("이 브라우저는 폴더 저장을 지원하지 않습니다 — 서버 저장을
> 쓰거나 Chrome/Edge 로 열어 주세요"). 조용히 실패하지 않는다.

---

## 3. 저장소 제공자(provider) 추상화

첨부 1건은 **바이트를 문서에 넣지 않고**, "어디에 있는지"만 참조한다.

| provider | 뜻 | 용량 차감 | 다른 기기에서 | 단계 |
|---|---|---|---|---|
| `server` | EasyMindMap 서버 (기본값) | ✅ 요금제 쿼터 차감 | ✅ 보인다 | **P1** |
| `folder` | 내가 고른 로컬/네트워크 드라이브 폴더 | ❌ 차감 없음 | ⚠️ 그 기기에서만 | **P2** |
| `embed` | 문서에 data URL 내장 (현재 방식) | 문서 크기에 포함 | ✅ 보인다 | 유지(하위호환) |
| `gdrive` / `onedrive` | 클라우드 API | ❌ | ✅ (로그인하면) | P4 |
| `webdav` | NAS (서버 프록시 경유) | ❌ | ✅ | P4 |

**기본값은 `server`** 다. 사용자가 개인 설정에서 바꾸면 그때부터 새로
추가하는 첨부가 그 위치로 간다(**기존 첨부는 그대로** — 이전 위치에서
계속 읽는다).

---

## 4. 데이터 모델

### 4.1 첨부 참조 (프런트 · EMM 모델)

> **[P2 이후 — 미구현]** `provider`/`locator` 확장은 P2 이후 설계다.
> 현행(P1)은 `url` 단일 필드: **≤2MB 는 문서 내장(data URL)**, 2MB
> 초과·맵 내장 합계 10MB 초과분은 **서버 URL** 을 담는다.

```ts
export type AttachmentProvider = 'server' | 'folder' | 'embed' | 'gdrive' | 'onedrive' | 'webdav';

export interface NodeAttachment {
  id: string;
  name: string;              // 표시 이름 = 파일명
  kind: AttachmentKind;      // 'file' | 'audio' | 'video'
  size?: number;             // 바이트 (표시·쿼터 계산용)
  mime?: string;

  /** 어디에 있는가 (없으면 'embed' 하위호환) */
  provider?: AttachmentProvider;
  /**
   * 위치 지정자 — provider 마다 의미가 다르다.
   *   server : 서버 파일 id (UUID)
   *   folder : 폴더 안 상대 경로 (예: 'emm/2026/견적서.xlsx')
   *   embed  : data URL (기존 url 필드와 동일)
   *   gdrive : 파일 id
   */
  locator?: string;
  /** folder 전용 — 어느 등록 폴더인지 (사용자 설정의 folderId) */
  folderId?: string;

  /** @deprecated 하위호환: 기존 문서의 data URL / blob URL */
  url?: string;
}
```

**하위호환 규칙**: `provider` 가 없으면 `url` 을 그대로 쓴다(현재 동작).
새로 만드는 첨부만 `provider`/`locator` 를 채운다. 기존 맵은 손대지 않는다.

### 4.2 서버 스키마 (초안)

> **(초안)** — `sha256`·`deleted_at` 은 실제 P1 스키마에 없다. 현행
> DDL 은 `document-library.md` §1 참조. `user_storage` 테이블은
> **[미구현 — 초안]** — 현행은 `users.plan` + `users.quota_bytes` 두 컬럼이다(§8.1).

```sql
-- 서버에 저장된 첨부 파일 실물 메타
CREATE TABLE public.attachments (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    map_id      UUID REFERENCES public.maps(id) ON DELETE SET NULL,  -- 어느 맵에서 올렸는지(참고)
    name        VARCHAR(255) NOT NULL,
    mime        VARCHAR(120),
    size_bytes  BIGINT NOT NULL,
    sha256      CHAR(64),            -- 중복 업로드 dedupe(같은 사용자 안에서)
    storage_key TEXT NOT NULL,       -- 실제 저장 위치 키 (로컬 볼륨 경로 또는 S3 키)
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at  TIMESTAMPTZ          -- soft-delete: 맵에서 지워도 유예 후 정리
);
CREATE INDEX ON public.attachments(owner_id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX ON public.attachments(owner_id, sha256) WHERE deleted_at IS NULL;

-- 사용자별 저장 설정 + 사용량 (요금제)
CREATE TABLE public.user_storage (
    user_id            UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
    plan               VARCHAR(30)  NOT NULL DEFAULT 'free',
    quota_bytes        BIGINT       NOT NULL DEFAULT 1073741824,   -- 1GB (free)
    -- 첨부 사용량 — server provider 파일 합계 (업로드/삭제 시 증감)
    attachment_bytes   BIGINT       NOT NULL DEFAULT 0,
    default_provider   VARCHAR(20)  NOT NULL DEFAULT 'server',
    updated_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
```

> **첨부 사용량은 `server` provider 파일만** 합산한다. 사용자가 자기
> 드라이브(`folder`·`gdrive`)에 둔 파일은 **쿼터를 쓰지 않는다** — 이것이
> "용량이 모자라면 내 드라이브를 쓰세요"라는 제품 메시지의 근거다.
> 단, **문서에 내장(embed)된 첨부는 DB(문서) 용량으로 합산**되므로
> 같은 쿼터를 소모한다.

### 4.3 DB 용량(문서·히스토리)은 따로 집계한다 ★

> **사용자 요구 (2026-08-02)**: 할당 용량과 현재 사용량을 보여주되
> **DB 용량과 첨부파일 용량을 각각 따로** 표시한다.

용량은 성격이 다른 두 갈래이고, 사용자가 스스로 줄일 수 있는 방법도
서로 다르므로 **합산해 한 덩어리로 보여주지 않는다**:

| 갈래 | 무엇이 들어가나 | 사용자가 줄이는 방법 |
|---|---|---|
| **문서(DB)** | `map_documents`(현재 스냅샷) + `map_document_versions`(히스토리 버전) + 노드/맵 메타 | 오래된 **히스토리 버전 삭제**, 안 쓰는 맵 삭제 |
| **첨부(파일)** | `attachments` 의 `server` 파일 실물 | 첨부 삭제, **내 드라이브로 옮기기** |

DB 용량은 별도 컬럼에 캐시하지 않고 **조회 시 집계**한다(쓰기 경로마다
갱신하면 부정확해지기 쉽다). **현행(P1) 집계는 `octet_length(doc::text)`
합산(현재 스냅샷 + 히스토리 버전), 캐시 없음** — 아래 `pg_column_size`
쿼리는 초안 기록이다:

```sql
-- 문서(DB) 사용량 — 현재 스냅샷 + 히스토리 버전, 맵별 내역까지
SELECT
  COALESCE(SUM(pg_column_size(d.doc)), 0)                     AS document_bytes,
  COALESCE(SUM(v.bytes), 0)                                   AS version_bytes,
  COALESCE(SUM(pg_column_size(d.doc)), 0) + COALESCE(SUM(v.bytes), 0) AS db_bytes
FROM public.maps m
LEFT JOIN public.map_documents d ON d.map_id = m.id
LEFT JOIN LATERAL (
  SELECT SUM(pg_column_size(doc)) AS bytes
    FROM public.map_document_versions WHERE map_id = m.id
) v ON TRUE
WHERE m.owner_id = $1 AND m.deleted_at IS NULL;
```

> 사용자 수가 늘면 이 집계가 무거워질 수 있다 — **60초 캐시**(또는
> 저장 시점에만 재계산)로 충분하다. 실시간 정확도가 요구되는 값이 아니다.

**쿼터 적용 범위(설계 결정)**: 요금제 쿼터는 **첨부 + 문서(DB) 합계**에
건다. 다만 화면에는 둘을 나눠 보여주고, 초과 시에는 **어느 쪽이 큰지와
줄이는 방법**을 함께 안내한다. (문서만으로 10GB 를 넘기는 것은 현실적
으로 어렵지만, 히스토리 버전이 이미지 내장 스냅샷을 복제하던 구조에서는
가능했다 — P3 스냅샷 경량화가 끝나면 문서 쪽은 매우 작아진다.)

**폴더 등록 정보는 서버에 두지 않는다.** 브라우저 폴더 핸들은 그 기기·그
브라우저에만 유효하므로 **로컬(IndexedDB)** 에 보관한다:

```ts
// IndexedDB: emm-folders
interface RegisteredFolder {
  folderId: string;          // 맵 첨부가 참조하는 id
  label: string;             // 사용자가 붙인 별칭 ("구글드라이브 InfoMap")
  hint?: string;             // 사용자가 적어 둔 경로 메모 ('G:\내 드라이브\02.InfoMap')
  handle: FileSystemDirectoryHandle;  // 실제 접근 수단
  addedAt: string;
}
```

---

## 5. API 설계

| 메서드 | 경로 | 설명 |
|---|---|---|
| `POST` | `/v1/attachments` | 업로드(multipart). **쿼터 초과 시 413** + 남은 용량 안내. 응답 `{ id, name, size, mime }` |
| `GET` | `/v1/attachments/:id` | 다운로드(스트리밍). 소유자만 |
| `DELETE` | `/v1/attachments/:id` | **즉시 삭제·차감** (soft-delete 유예는 미구현·후속) |
| `GET` | `/v1/attachments/quota` | **현행 P1** — `{ dbBytes, fileBytes, usedBytes, quotaBytes }` |
| `GET` | `/v1/storage` | **[P2]** 할당·사용량 **분리 응답**(아래) |
| `PATCH` | `/v1/storage` | **[P2]** `defaultProvider` 변경 (개인 설정) |

```jsonc
// [P2] GET /v1/storage — DB 용량과 첨부 용량을 따로 돌려준다
{
  "plan": "basic",
  "quotaBytes": 10737418240,          // 10GB (첨부 + 문서 합계 기준)
  "usedBytes":  4509715660,           // 아래 둘의 합
  "attachment": {
    "bytes": 4294967296,              // 4GB — server provider 파일
    "count": 137
  },
  "database": {
    "bytes": 214748364,               // 205MB
    "documentBytes": 104857600,       // 현재 스냅샷
    "versionBytes":  109890764,       // 히스토리 버전 (B8)
    "mapCount": 42,
    "versionCount": 310
  },
  "defaultProvider": "server"
}
```

에러 규약:

```jsonc
// 413 — 쿼터 초과 (현행 응답은 {statusCode, message} 두 필드 —
// 수치는 메시지 문자열 안에 담긴다)
{ "statusCode": 413, "message": "저장 용량이 부족합니다 (남은 용량 120MB)." }
```

---

## 6. 읽기 흐름 (맵을 열 때)

사용자 요구 "서버면 서버에서, 로컬이면 그 경로에서, 없으면 메시지"를
그대로 구현한다:

```
첨부 인디케이터(📎) 클릭
  ├─ provider 'server'  → GET /v1/attachments/:id → 새 탭/다운로드
  ├─ provider 'embed'   → data URL 그대로 (기존 동작)
  ├─ provider 'folder'  → 등록 폴더 조회
  │     ├─ 폴더 미등록(다른 기기)   → ⚠ "이 첨부는 '구글드라이브 InfoMap'
  │     │                              폴더에 있습니다. 이 기기에서는
  │     │                              폴더를 등록해야 열 수 있습니다."
  │     ├─ 권한 만료                 → [폴더 접근 허용] 버튼 (클릭 1회)
  │     ├─ 폴더는 있는데 파일 없음   → ⚠ "파일을 찾을 수 없습니다:
  │     │                              emm/견적서.xlsx"
  │     └─ 정상                      → File → objectURL → 열기
  └─ 그 외(gdrive 등)  → P4
```

**핵심 원칙**: 어떤 실패든 **조용히 넘어가지 않고 무엇이 왜 안 되는지**
알려준다. 첨부 인디케이터에는 상태 배지(⚠)를 띄워, 열기 전에도 "이
첨부는 지금 이 기기에서 못 연다"를 알 수 있게 한다.

---

## 7. UI/UX

### 7.1 개인 설정 — "첨부 저장 위치"

```
저장 용량 (기본 구독 · 10GB)
 전체 [■■■■■□□□□□] 4.5GB / 10GB   남은 용량 5.5GB

   📎 첨부파일   4.2GB  (137개)          [첨부 정리]
   🗄 문서(DB)   205MB                    [히스토리 정리]
        · 현재 문서  100MB (맵 42개)
        · 저장 이력  105MB (버전 310개)

 ⓘ 첨부를 '내 드라이브 폴더'에 저장하면 이 용량을 쓰지 않습니다.

첨부파일 저장 위치
 ◉ EasyMindMap 서버 (기본)
     어느 기기·어느 브라우저에서도 열립니다.

 ○ 내 드라이브 폴더
     [+ 폴더 선택]   ← showDirectoryPicker()
     등록된 폴더:
       · 구글드라이브 InfoMap   (메모: G:\내 드라이브\02.InfoMap)  [권한 확인] [해제]
       · NAS 업로드            (메모: H:\home\upload)             [권한 확인] [해제]
     ⓘ 서버 용량을 쓰지 않습니다. 다만 **이 기기에서만** 열립니다 —
       다른 PC에서 같은 맵을 열면 첨부는 "폴더 등록 필요"로 표시됩니다.
       (Chrome·Edge 지원 / Firefox·Safari 미지원)
```

* 별칭과 **경로 메모**를 사용자가 직접 적을 수 있게 한다 — 브라우저는
  전체 경로를 알려주지 않지만, 사용자는 자기 폴더를 그렇게 기억한다.
* 저장 위치는 **새 첨부부터** 적용된다(기존 첨부 이동은 P3의 "옮기기").

### 7.2 첨부 추가

현행(P1) 실제 흐름은 3분기다:

```
파일 선택
  ├─ ≤2MB 이고 맵 내장 합계 10MB 이내 → data URL 로 문서에 내장
  ├─ 로그인 상태 (2MB 초과 또는 합계 초과) → POST /v1/attachments 서버 업로드
  │     (쿼터 검사 → 초과 시 413 안내)
  └─ 비로그인 → blob URL (세션 한정 — 새로고침하면 깨짐, 안내 표시)
```

[P2] provider 별 저장으로 확장 예정:

```
파일 선택
  → 기본 provider 확인
      server : POST /v1/attachments  (쿼터 검사 → 초과 시 안내 + 폴더 저장 제안)
      folder : 등록 폴더에 쓰기 (createWritable) → locator = 'emm/<파일명>'
  → 노드에 참조만 저장 (바이트는 문서에 넣지 않는다)
```

### 7.3 내보내기와의 관계

* **HTML/MD/ZIP 내보내기**는 지금처럼 **자기완결형**을 유지한다 —
  내보낼 때 provider 와 무관하게 실제 바이트를 가져와 ZIP `files/` 에
  담는다(`folder` 는 그 기기에서 내보낼 때만 가능, 아니면 경고 목록).
* 이것이 `content-permanence.md` 의 "파일 하나로 온전히" 약속을 지키는
  방법이다. **저장 위치는 서버 운영의 문제, 내보내기는 사용자 소유의
  문제** 로 분리한다.

---

## 8. 요금제·용량 정책 (2026-08-06 확정 — 가격 미정)

| 요금제 | 저장 용량(문서+첨부 합산) | 바이트 | 상태 |
|---|---|---|---|
| **Free** | **10 MB** | `10485760` | ✅ 컬럼 기본값 |
| **Basic** | **10 GB** | `10737418240` | ✅ |
| **Pro** | **30 GB** | `32212254720` | ✅ |
| **Team** | **20 GB / 사용자** | `21474836480` | ✅ 값은 적용 · **워크스페이스 합산은 미구현**(아래) |
| 내 드라이브 사용 시 | **무제한(과금 대상 아님)** | — | 초안 — 미구현(P4) |

**가격은 아직 정하지 않았다.** 여기 있는 것은 용량 정의뿐이고, 결제가
붙으면 그쪽에서 `users.plan` 만 바꾸면 된다.

### 8.1 어떻게 정해지나 — `plan` 이 단일 기준이다

```
users.plan  ──(트리거 users_sync_quota)──▶  users.quota_bytes  ──▶  API 가 읽는 한도
   ▲                                              ▲
   │ 결제가 여기만 바꾼다                            │ 특별 계약이면 여기를 직접 (escape hatch)
```

* **용량 숫자는 DB 표 `public.plan_quotas` 한 곳**에만 있다
  (2026-08-14: 함수 본문에 박혀 있던 것을 표로 옮겼다 — 관리자 콘솔에서
  바꾸려면 배포가 필요했기 때문이다). 함수 `plan_quota_bytes()` 는 그 표를
  읽기만 한다. API·프런트에는 **요금제 이름만** 있고 숫자는 없다 —
  두 곳에 적으면 반드시 어긋난다.
* **바꾸는 곳은 관리자 콘솔 → 설정관리**다
  ([admin-console.md](admin-console.md) §3.3). SQL 로 직접 고쳐도 되지만,
  그때는 **기존 회원의 `quota_bytes` 가 따라오지 않는다** — 트리거는
  `plan` 이 바뀔 때만 돈다. 콘솔은 그 뒷정리까지 한다.
* `users.plan` 이 바뀌면 트리거가 `quota_bytes` 를 맞춘다. 그래서 결제
  연동은 **`UPDATE users SET plan='pro'` 한 줄**이면 끝난다.
* `quota_bytes` 를 직접 UPDATE 하면 그 값이 남는다(트리거는 plan 이 바뀔
  때만 돈다) — **특별 계약용 탈출구**다. 단 그 계정의 plan 을 나중에
  바꾸면 그때 덮어써진다.
* `plan` 에는 CHECK 제약이 걸려 있어 오타(`'Basic'`, `'premium'` 등)는
  INSERT/UPDATE 단계에서 막힌다.

| 대상 | 요금제 | 어떻게 |
|---|---|---|
| **신규 가입** | Free 10MB | 컬럼 기본값 `'free'`. 코드가 `INSERT INTO public.users (id)` 만 하므로 항상 기본값이 붙는다 |
| **2026-08-06 12:00 UTC 이전 가입** | **Basic 10GB** | `schema.sql` 의 일회성 UPDATE |

```sql
-- schema.sql §15 — 기존 계정 Basic 승격 (딱 한 번만 돈다)
UPDATE public.users
   SET plan = 'basic'
 WHERE created_at < TIMESTAMPTZ '2026-08-06 12:00:00+00'
   AND plan = 'free'
   AND NOT EXISTS (SELECT 1 FROM public.users WHERE plan <> 'free');
```

`schema.sql` 은 배포마다 다시 적용되므로 **두 겹으로 막았다**.

1. **고정 시각** — 조건이 `NOW()` 거나 없으면 재적용할 때마다 그 사이에
   가입한 무료 사용자까지 올라간다. **그리고 그 시각은 반드시 "이미 지난"
   때여야 한다** — 처음에 미래 시각을 적었다가 e2e119 [4] 가 잡아냈다.
2. **`NOT EXISTS (… plan <> 'free')`** — 한 명이라도 유료 요금제가 되고
   나면 이 승격은 다시 돌지 않는다. 나중에 어떤 계정을 **일부러 Free 로
   내려도 되살아나지 않는다.**

요금제 변경·확인은 이렇게 한다.

```sql
-- 이메일로 찾아서 Pro 로 (용량은 트리거가 따라온다)
UPDATE public.users u SET plan = 'pro'
  FROM auth.users a WHERE a.id = u.id AND a.email = '<이메일>';

-- 특별 계약 — plan 을 먼저 정한 뒤 용량만 따로
UPDATE public.users u SET quota_bytes = 107374182400   -- 100GB
  FROM auth.users a WHERE a.id = u.id AND a.email = '<이메일>';

-- 현재 상태
SELECT a.email, u.plan, pg_size_pretty(u.quota_bytes) AS 한도, u.created_at
  FROM public.users u JOIN auth.users a ON a.id = u.id
 ORDER BY u.created_at;
```

### 8.1-1 특정 계정만 요금제를 올리려면 (2026-08-11)

결제가 붙기 전까지는 **손으로 `plan` 을 바꾼다.** 용량은 트리거가
따라오므로 `quota_bytes` 는 건드리지 않는다.

```sql
UPDATE public.users u
   SET plan = 'basic', updated_at = NOW()
  FROM auth.users a
 WHERE a.id = u.id AND lower(a.email) = lower('id@example.com');
```

> ⚠️ **오타는 조용히 성공한다.** 없는 이메일이면 0행이 바뀌고 오류도
> 나지 않는다 — 바꿨다고 여기는데 사용자 화면은 그대로다. 그래서
> **계정을 먼저 세고, 없으면 실제 주소 목록을 보여 주는** 실행 스크립트를
> 쓴다: `dev-server-runbook.md` **§1.5-0-C** (VM SSH·Coolify Terminal
> 어디서든 붙여넣기 한 번).

사용자 화면(아바타 메뉴)은 메뉴를 열 때마다 `/v1/attachments/quota` 를
다시 부르므로 **재로그인도 재배포도 필요 없다.**

### 8.2 아직 안 한 것 (결제 단계로 넘김)

| 항목 | 지금 | 결제 단계에서 |
|---|---|---|
| **가격** | 정하지 않음 | 요금제별 금액·주기 |
| **요금제 변경 UI** | 없음 — **DB 에서 손으로 바꾼다**(§8.1-1). 아바타 메뉴 💳 구독 상태는 "준비 중" | 관리자 화면 + 실제 변경·결제 |
| **Team 워크스페이스 합산** | **1인당 20GB 로만 적용** | 워크스페이스 전체 합산 + 좌석 수 과금 |
| 결제 실패 시 강등 | 없음 | 유예 기간 → Free 강등 정책 |

> **Free 10MB 는 아주 작다** — 문서(맵 JSON)와 히스토리 버전까지 합산하는
> 값이라, 사진 몇 장을 내장한 맵 하나를 몇 번 저장하면 곧 찬다. 체험용
> 이라면 의도한 크기지만, 초과하면 **저장 자체가 막히므로**(413) Free 로
> 오래 쓰게 할 생각이라면 히스토리 정리 안내가 함께 필요하다.
>
> 참고로 맵당 **내장 첨부 합계 상한이 10MB**(§4.3 · `EMBED_TOTAL_LIMIT`)로
> Free 한도와 같다 — 즉 Free 계정은 그 상한에 닿기 전에 쿼터가 먼저 걸린다.

> **파일 1개 상한**은 플랜과 무관하게 환경변수 두 개로 적용된다 —
> 단일 요청 경로는 `ATTACHMENT_MAX_MB`(기본 **200MB**), **청크 경로는
> `ATTACHMENT_CHUNK_MAX_MB`(기본 1GB)** (§12). 실질 상한은 대개 계정
> 쿼터가 먼저 건다 — Free 계정은 1GB 파일 하나로 계정 전체가 찬다.

* 쿼터 기준: **첨부 + 문서(DB) 합계**. 화면에는 §7.1처럼 **둘을 나눠**
  보여주고, 초과 시 **어느 쪽이 큰지와 줄이는 방법**을 함께 안내한다.
* 초과 시: 업로드·저장만 차단(기존 파일 열람·다운로드, 맵 열기는 계속
  가능). 안내에 **"내 드라이브 폴더로 저장하기"** 와 **"오래된 저장
  이력 정리"** 를 함께 제시한다.
* 용량 회수:
  * 첨부 — 현행은 **즉시 삭제·차감** (30일 soft-delete 유예는
    미구현·후속 — 맵 휴지통 정책과 동일 리듬으로 예정)
  * 문서(DB) — 히스토리 버전 삭제(맵별 "오래된 버전 정리" 또는 보관
    개수 제한), 맵 삭제
* 표시: 사용량 막대(전체) + 첨부/문서 내역 + 90% 초과 시 경고 배너.

---

## 9. 이식성·공유 시 주의 (반드시 UI에 드러낼 것)

| 상황 | server | folder |
|---|---|---|
| 다른 PC에서 내 맵 열기 | ✅ 열림 | ⚠️ 폴더 등록 필요 |
| 다른 사람과 공유 | ✅ (권한 범위 내) | ❌ 상대는 못 봄 |
| 맵을 HTML/ZIP 로 내보내기 | ✅ 포함 | ✅ 단, 폴더가 연결된 기기에서 내보낼 때만 |
| 서버 장애 | ❌ 일시 불가 | ✅ 영향 없음 |

→ 맵 안에 `folder` 첨부가 있으면 **공유·내보내기 직전에 요약 경고**를
띄운다("이 맵의 첨부 3건은 내 드라이브 폴더에 있습니다").

---

## 10. 단계별 구현 계획

| 단계 | 범위 | 산출물 |
|---|---|---|
| **P1** | 서버 저장소 + 쿼터 — `attachments`·`user_storage` 테이블, 업로드/다운로드/삭제 API, 쿼터 검사, `GET /v1/storage`(**첨부·문서 용량 분리 집계**), 개인 설정의 사용량 화면(§7.1). 프런트: 첨부 추가 시 서버 업로드(blob URL 제거) | 첨부가 새로고침·다른 기기에서도 열리고, 내 용량이 어디에 쓰였는지 보인다 |
| **P2** | 내 드라이브 폴더 — File System Access 폴더 등록(IndexedDB), 폴더에 쓰기/읽기, 미지원 브라우저 안내, 실패 시 메시지·배지 | 요구사항의 "내 드라이브" 실현 |
| **P3** | 마이그레이션·정리 — 기존 `embed`(data URL) 첨부를 서버로 옮기는 도구, 첨부 위치 변경(옮기기), 미사용 파일 GC, 스냅샷 경량화(문서에서 이미지 분리) | 히스토리 증폭·스냅샷 비대 해소 |
| **P4** | 클라우드 API — Google Drive·OneDrive OAuth, NAS WebDAV(서버 프록시) | 기기 무관 + 사용자 자기 저장소 |

**권장 착수 순서**: P1 → P3(스냅샷 경량화) → P2 → P4.
P3 를 P2 보다 먼저 두는 이유: 이미지 내장이 히스토리(B8)까지 증폭시키는
구조적 부담이라 **서버 저장이 열리는 즉시 해소하는 것이 이득**이다.

---

## 11. 확인이 필요한 사항 (사장님 결정 대기)

1. **플랜별 용량 수치** — §8 표의 1GB/10GB/20GB 가 적절한지, 파일 1개
   최대 크기(20/100/200MB)는 어떤지.
2. **로컬 폴더 옵션의 노출 범위** — Chrome/Edge 전용 기능인데,
   ① 지원 브라우저에서만 노출 ② 항상 노출하되 미지원이면 안내
   (현재 설계는 ②).
3. **P4 우선순위** — 구글 드라이브 API 연동을 정식 오픈 전에 넣을지,
   오픈 후 수요를 보고 정할지.
4. **쿼터 기준** — §8의 "첨부+문서 합계에 쿼터"가 맞는지, 아니면 **첨부에만** 쿼터를 걸고 문서는 무제한(대신 히스토리 보관 개수 제한)으로 갈지. 후자가 사용자에게 더 단순하다.
5. **히스토리 보관 정책** — 맵당 최대 버전 수(예: 50) 또는 보관 기간(예: 90일) 제한을 둘지. 두면 문서 용량이 자동으로 안정된다.
6. **서버 저장 실체** — 개발 서버는 컨테이너 볼륨으로 충분하지만,
   프로덕션은 ① VM 디스크 ② S3 호환 오브젝트 스토리지(MinIO 등)
   중 어느 쪽인지. 백업·용량 증설 정책과 직결된다.

---

## 12. 대용량 첨부 — 청크 업로드 (2026-08-06 결정)

> **결정**: 대용량 멀티미디어를 **청크(분할) 업로드**로 올린다.
> 사용자 제안이던 FTP·WebDAV 전용 경로는 채택하지 않는다(§12.2).
> 사용자 UX 는 **경로를 나누지 않는다** — 20MB 이하든 1GB 든 **같은
> 드롭·같은 메뉴**로 올라가고, 큰 파일에만 진행률이 붙는다(§12.7).
>
> 이 절은 **다른 개발자가 그대로 구현할 수 있도록** API·자료구조·
> 실패 규칙·검증 항목까지 적는다.
>
> **상태: C1~C4 구현 완료 (2026-08-06). C5 는 하지 않는다 (2026-08-15
> 사용자 결정 — 아래 상자).** 설계에서 **바뀐 점 두 가지**는 §12.5-1 에
> 적어 두었다.
>
> > **왜 C5 를 접었나.** 브라우저는 새로고침 뒤 **그 파일을 다시 읽을 수
> > 없다** — 드롭·선택으로 받은 `File` 핸들은 새로고침을 넘기지 못한다.
> > 그래서 실제 동작은 "자동 이어받기"가 아니라 **사용자가 같은 파일을
> > 다시 골라 주면 남은 조각만 올리는** 것이 된다. 파일 자체를 IndexedDB
> > 에 넣어 두면 자동이 되지만 1GB 를 한 벌 더 저장하는 셈이라 맞지 않다.
> > 이미 조각 재시도가 붙어 있어 실효가 좁다.
> >
> > **서버 쪽은 이미 다 되어 있다** — 상태 조회가 빠진 조각을 알려 주고,
> > 조각 PUT 은 멱등이며, 세션은 24시간 산다. 필요해지면 **프런트만**
> > 붙이면 된다.

### 12.1 왜 지금은 큰 파일이 안 올라가나

업로드가 **한 번의 multipart 요청 + 메모리 버퍼**다.

```ts
// attachments.controller.ts
@UseInterceptors(FileInterceptor('file'))          // multer 기본 = memoryStorage
async upload(@UploadedFile() file: Express.Multer.File) { … }

// attachments.service.ts
await this.storage.put(key, file.buffer);          // ← 파일 전체가 힙에 올라간다
```

1GB 파일이면 **1GB 가 그대로 Node 힙에 올라간다.** 동시에 두 명만 올려도
컨테이너가 OOM 으로 죽는다. 그래서 상한을 20MB → 200MB 까지만 올리고
(2026-08-06), 그 이상은 이 절의 구조가 들어간 뒤에 연다.

부수 문제도 있다.

| 문제 | 단일 요청 방식 | 청크 방식 |
| --- | --- | --- |
| 서버 메모리 | 파일 크기만큼 | **조각 크기만큼**(고정) |
| 진행률 | 알 수 없음(요청 하나) | 조각 단위로 정확 |
| 네트워크 끊김 | **처음부터 다시** | 끊긴 조각부터 이어받기 |
| 리버스 프록시 제한 | `client_max_body_size` 를 1GB 로 열어야 함 | **조각(8MB)만 통과하면 된다** |
| 타임아웃 | 업로드 전체가 한 요청 → 게이트웨이 타임아웃 | 조각마다 짧은 요청 |

마지막 두 줄이 특히 중요하다 — 프록시/게이트웨이(Coolify·nginx)의 본문
크기·타임아웃을 건드리지 않아도 된다.

### 12.2 왜 FTP·WebDAV 가 아닌가

| 방식 | 문제 |
| --- | --- |
| **FTP** | **브라우저가 FTP 를 지원하지 않는다**(Chrome 95 에서 제거). 웹앱에서 직접 못 쓰므로 결국 "브라우저 → 우리 서버 → FTP" 프록시가 되고, **브라우저 → 우리 서버 구간의 문제(=지금 문제)가 그대로 남는다.** 자격증명 보관·평문 전송 위험은 덤 |
| **WebDAV** | 브라우저에서 `PUT` 자체는 가능하지만 ① **CORS·인증을 별도로** 열어야 하고 ② 우리 `attachments` 테이블·쿼터·소유권 모델과 **이중 관리**가 된다 ③ 사용자별 권한 격리를 WebDAV 서버 쪽에서 또 만들어야 한다 |
| **청크 업로드(채택)** | 이미 쓰는 **HTTP + 기존 인증(AuthGuard)** 그대로. 쿼터·소유권·GC 가 지금 모델에 그대로 붙는다 |

> WebDAV 는 **P4(사용자 자기 NAS 연결)** 에서 "서버 프록시" 형태로 여전히
> 유효하다(§10). 그건 *우리 저장소를 대체*하는 것이 아니라 *사용자
> 저장소를 추가*하는 이야기라 이 절과 목적이 다르다.

### 12.3 전체 흐름

```
브라우저                                   서버                    디스크
   │                                        │                        │
   │ ① POST /attachments/uploads            │                        │
   │    {name, mime, size, mapId}           │                        │
   │───────────────────────────────────────>│ 쿼터 예약·세션 생성      │
   │                          {uploadId,    │                        │
   │<─────────────────────── partSize, …}   │  tmp/<uploadId>/ 생성   │──▶ mkdir
   │                                        │                        │
   │ ② PUT /attachments/uploads/{id}/parts/0│                        │
   │    (octet-stream, 8MB)                 │─ 스트림 그대로 파일로 ──▶│──▶ part-0
   │<────────────── {received: 1, next: 1}  │                        │
   │ ② PUT … /parts/1  …                    │                        │──▶ part-1
   │        (반복 — 진행률은 여기서 계산)      │                        │
   │                                        │                        │
   │ ③ POST /attachments/uploads/{id}/complete                       │
   │    {checksum?}                         │─ 조각 이어붙이기 ──────▶│──▶ u/<uid>/<id>
   │<──────────── {id, url, sizeBytes}      │  attachments INSERT     │
   │                                        │  tmp 삭제               │
```

* **②는 메모리에 안 담는다** — `req` 를 `createWriteStream(part-N)` 으로
  바로 흘린다(`pipeline`). 서버 메모리 사용은 조각 크기와 무관하게 상수다.
* **③의 이어붙이기도 스트림**이다 — `part-0..N` 을 순서대로 읽어
  최종 파일에 append 한다.

### 12.4 API 설계

기존 `POST /v1/attachments`(단일 업로드)는 **그대로 둔다** — 작은 파일은
왕복이 하나뿐이라 더 빠르다. 청크는 **큰 파일 전용 경로**로 추가한다.

| 메서드 | 경로 | 용도 |
| --- | --- | --- |
| `POST` | `/v1/attachments/uploads` | 업로드 세션 시작 |
| `PUT` | `/v1/attachments/uploads/:uploadId/parts/:index` | 조각 1개 전송 |
| `GET` | `/v1/attachments/uploads/:uploadId` | 진행 상태 조회(이어받기용) |
| `POST` | `/v1/attachments/uploads/:uploadId/complete` | 이어붙여 첨부로 확정 |
| `DELETE` | `/v1/attachments/uploads/:uploadId` | 취소·정리 |

#### ① 세션 시작

```http
POST /v1/attachments/uploads
{ "name": "발표영상.mp4", "mime": "video/mp4", "size": 734003200, "mapId": "…" }

201 { "uploadId": "…uuid…", "partSize": 8388608, "parts": 88, "received": [] }
```

* 서버가 **`size` 로 쿼터를 미리 검사·예약**한다. 다 올린 뒤에 거절하면
  사용자가 10분을 버린다.
* `partSize` 는 **서버가 정한다**(클라이언트가 고르지 않는다) — 프록시
  본문 제한과 맞물리므로 서버가 단일 진실이다.

#### ② 조각 전송

```http
PUT /v1/attachments/uploads/{uploadId}/parts/3
Content-Type: application/octet-stream
Content-Length: 8388608
<binary>

200 { "received": 4, "next": 4 }
```

* **멱등**이다 — 같은 index 를 다시 보내면 덮어쓴다. 재시도가 안전하다.
* 마지막 조각만 `partSize` 보다 작을 수 있다. 그 밖의 조각이 작으면 거절.

#### ③ 완료

```http
POST /v1/attachments/uploads/{uploadId}/complete
{ "checksum": "sha256:…" }        // 선택

200 { "id": "…", "url": "/v1/attachments/…", "name": "…", "sizeBytes": 734003200 }
```

* 조각이 **하나라도 비면 409** + 빠진 index 목록을 돌려준다.
* 합친 크기가 `size` 와 다르면 **거절하고 tmp 를 지운다.**
* `checksum` 을 주면 검증한다(권장 — 조각 순서 사고를 잡는다).

#### ④ 상태 조회 (이어받기)

```http
GET /v1/attachments/uploads/{uploadId}
200 { "received": [0,1,2,5], "partSize": 8388608, "parts": 88, "expiresAt": "…" }
```

브라우저를 껐다 켜도 `uploadId` 만 알면 **빠진 조각부터** 다시 올린다.

### 12.5 서버 구현 메모

```
STORAGE_LOCAL_DIR/
  u/<userId>/<attachmentId>          ← 완성된 파일 (지금과 동일)
  tmp/<uploadId>/
    meta.json                        ← {userId, name, mime, size, partSize, parts, mapId, createdAt}
    part-0, part-1, …
```

* **경로는 서버가 UUID 로만 조립한다** — 사용자 입력(파일명)은 경로에
  절대 쓰지 않는다. 지금 `upload()` 와 같은 규칙(§경로 주입 불가).
* **`uploadId` 소유자 검사**를 모든 호출에서 한다. `meta.json` 의
  `userId` 와 토큰 사용자가 다르면 404(존재를 알리지 않는다).
* **쿼터 예약**: `attachments` 와 별도로 `pending_bytes` 를 잡아 두고
  complete/abort/만료 때 푼다. 예약이 없으면 여러 업로드가 동시에 쿼터를
  넘길 수 있다.
* **만료 정리**: `createdAt` 기준 24시간 지난 `tmp/*` 를 주기적으로 지운다
  (기동 시 1회 + 하루 1회면 충분).
* **DB**: 완료 시점에만 `attachments` 에 INSERT 한다 — 미완성 업로드가
  목록·쿼터에 보이지 않게. 진행 상태는 `meta.json` 으로 충분하다(테이블을
  더 만들 필요 없다).
* **multer 를 쓰지 않는다** — `PUT` 은 raw body 스트림을 직접 받는다.
  Nest 에서는 `@Req()` 로 `Request` 를 받아 `pipeline(req, createWriteStream(...))`.
  전역 `bodyParser` 가 이 경로를 삼키지 않도록 **rawBody 예외**를 둔다.

### 12.5-1 구현하면서 설계에서 바꾼 것 (2026-08-06)

**① tmp 경로에 `userId` 를 넣었다** — `tmp/<uploadId>/` → **`tmp/<userId>/<uploadId>/`**

설계는 `meta.json` 의 `userId` 를 읽어 토큰 사용자와 비교하는 방식이었다.
경로에 사용자를 넣으면 **조회 자체가 그 사용자의 디렉터리 안으로 좁혀져서**,
남의 `uploadId` 를 넣어도 파일이 없어 자연히 404 가 된다. 비교를 깜빡할
여지가 없다(그래도 `meta.userId` 재확인은 남겨 두었다 — 방어선은 겹친다).
덤으로 **사용자별 예약 용량**을 셀 때 그 디렉터리만 훑으면 된다.

**② 조각 크기를 환경변수로 뺐다** — `ATTACHMENT_PART_KB`(기본 8192 = 8MB)

§12.9 의 "테스트에서 1GB 를 만들지 않는다"를 실제로 하려면 조각 크기를
낮출 수 있어야 한다. e2e117·e2e118 은 **API 를 `ATTACHMENT_PART_KB=64`
로 띄워** 9MB 파일이 144조각으로 쪼개지게 만들고, 그 상태로 다중 조각·
순서 뒤바뀜·409·재시도·이어붙이기를 전부 검증한다.

그 밖에 **설계에 없던 안전장치 두 개**를 넣었다.

* **크기가 안 맞는 조각은 저장하지 않는다** — 잘린 전송이 조용히 쌓이면
  `complete` 가 "다 왔다"고 착각한다. 400 으로 되돌리고 그 조각을 지운다
  (마지막 조각만 `partSize` 보다 작을 수 있다).
* **완료 직전에 쿼터를 한 번 더 본다** — 올리는 동안 다른 곳에서 용량을
  썼을 수 있다. 이 세션의 예약분은 빼고 계산한다.

### 12.6 프런트 구현 메모

```ts
const CHUNK_ROUTE_MIN = 8 * 1024 * 1024;   // 이보다 크면 청크 경로

export async function attachmentUrlForFile(f: File, onProgress?: (r: number) => void) {
  if (f.size <= INLINE_ATTACHMENT_LIMIT && withinMapTotal) return dataUrl(f);   // 지금과 동일
  if (f.size < CHUNK_ROUTE_MIN) return serverAttachmentUrl((await cloudApi.uploadAttachment(f)).id);
  return serverAttachmentUrl(await uploadInChunks(f, onProgress));              // ← 새 경로
}
```

* **조각 자르기는 `File.slice()`** — 파일 전체를 메모리에 읽지 않는다.
  `f.slice(i * partSize, (i + 1) * partSize)` 를 그대로 `body` 에 넘긴다.
* **동시 전송은 2~3개**로 제한한다. 많이 띄우면 브라우저 연결 한도(6)를
  다 먹어 다른 요청(자동저장!)이 굶는다.
* **재시도**: 조각 단위로 3회, 1·3·10초 backoff. 조각 PUT 은 멱등이라 안전.
* **진행률** = **보낸 바이트 / 전체 바이트** (2026-08-06 실사용에서 정정).
  처음에는 `보낸 조각 수 / 전체 조각 수` 였는데, 885MB 를 올리며
  **"16%·23%에서 한참 멈춘 것처럼 보인다 — 장애인 줄 안다"** 는 보고를
  받았다. 조각이 8MB 라 느린 회선에서는 몇십 초씩 숫자가 그대로다.
  * `fetch` 에는 **업로드 진행률이 없다** — 그래서 조각 PUT 을
    **`XMLHttpRequest`** 로 바꿔 `upload.onprogress` 를 쓴다.
  * 끝난 조각의 바이트 + **전송 중인 조각들이 보낸 바이트**를 합친다.
  * 화면에는 **속도와 남은 시간**도 함께 적는다 — 느린 것과 멈춘 것을
    구분해 주는 것이 핵심이다.
  * 그래도 4초 넘게 바이트가 안 늘면 **"전송이 느립니다 — 계속 시도
    중입니다"** 로 바꾸고 막대에 **흐르는 줄무늬**를 켠다. 재시도
    중이면 그 사실을 그대로 적는다(`전송이 끊겨 다시 시도합니다 2/3`).
  * ⚠ **loopback(로컬)에서는 이 개선을 눈으로 확인할 수 없다** —
    브라우저가 조각을 한 번에 다 밀어 넣어 `onprogress` 가 조각당 한
    번만 뜬다. e2e120 은 그래서 **진행률 채널이 연결됐는지**만 확인하고,
    촘촘한 중간 값은 실제 회선의 몫으로 남겼다.
* **취소**: `AbortController` 로 진행 중 조각을 끊고 `DELETE …/uploads/{id}`.
* **이어받기**: `uploadId` 를 IndexedDB 에 남겨 두면 새로고침 후에도
  `GET …/uploads/{id}` 로 재개할 수 있다. **P2 로 미룬다**(첫 판에는
  세션 안에서만 재시도).

### 12.7 UX — 경로를 나누지 않는다

사용자 제안은 *"20MB 이하는 드롭, 초과는 전용 메뉴"* 였지만 **나누지
않기로 한다.**

| | 나누는 안 | 채택안 |
| --- | --- | --- |
| 20MB 이하 | 드롭 | 드롭·메뉴 둘 다 |
| 20MB 초과 | **전용 메뉴에서만** | **드롭·메뉴 둘 다** |
| 사용자가 알아야 할 것 | **파일 크기** | 없음 |
| 실패 모드 | "왜 이건 드롭이 안 되지?" | 없음 |

대신 **큰 파일에는 반드시 진행률**을 붙인다. 1GB 는 회선에 따라 수 분이
걸리므로, 진행 표시가 없으면 **또 "무반응"으로 보인다**(2026-08-06 보고와
같은 종류의 문제).

```
🎬 발표영상.mp4   ▓▓▓▓▓▓▓░░░░░░  52%  (382MB / 734MB)   [취소]
```

* 첨부 행(`AttachmentRow`)에 진행률 상태를 얹는다.
* 업로드 중에는 그 첨부를 **"올리는 중"** 으로 표시하고, 완료돼야 노드에
  확정한다(실패 시 유령 첨부가 남지 않게).
* 실패하면 **그 자리에 사유를 그대로** 보여 준다 — 노드 드롭 경로도
  마찬가지다(2026-08-06 수정: 빈 catch 로 삼키던 것을 캔버스 안내로).

### 12.8 상수 (초안 — 구현 시 확정)

| 값 | 제안 | 근거 |
| --- | --- | --- |
| `partSize` | **8MB** | 프록시 기본 본문 제한(대개 1~10MB)을 크게 넘지 않으면서 1GB 를 88조각으로 — 왕복 오버헤드와 진행률 해상도의 절충 |
| 청크 경로 전환 기준 | **8MB 초과** | 조각 하나로 끝날 크기면 단일 업로드가 더 빠르다 |
| 동시 조각 수 | **3** | 브라우저 연결 한도(6)의 절반 — 자동저장·문서함 요청이 굶지 않게 |
| 조각 재시도 | **3회 (1·3·10초)** | 자동저장 재시도(§14-save §5.4)와 같은 감각 |
| 세션 만료 | **24시간** | 하루 안에 안 끝나면 이어받기보다 새로 올리는 게 빠르다 |
| 파일 1개 상한 | **1GB** (플랜별 조정) | 사용자 요청. **계정 쿼터가 먼저 걸린다** — Free 10MB 는 물론 Basic 10GB 도 1GB 파일 하나가 10%다 |

### 12.9 구현 순서와 검증 항목

| 단계 | 내용 | 상태 | 검증 |
| --- | --- | --- | --- |
| **C1** | 서버 — 세션/조각/완료/취소 + 스트림 저장 + 쿼터 예약 | ✅ | **e2e117**(12항목) |
| **C2** | 프런트 — `uploadInChunks` + 재시도 + 취소 | ✅ | **e2e118** [3][4] |
| **C3** | UI — 진행률 표시, 드롭/메뉴 공통 | ✅ | **e2e118** [1][2] |
| **C4** | 정리 — 만료 tmp GC, 상한 1GB, 문서 갱신 | ✅ | GC 수동 확인(아래) |
| **C5** *(선택)* | 새로고침 후 이어받기(`uploadId` 보관) | ❌ **하지 않는다** (2026-08-15 사용자 결정) | — |

**e2e117 — 서버**(브라우저 없이 API 만): 세션 시작 시 서버가 `partSize`·
`parts` 를 정한다 / 조각을 **거꾸로 보내도** 이어붙인 바이트가 원본과
같다 / 조각이 비면 **409 + 빠진 번호** / 상태 조회로 빠진 조각을 안다 /
조각 PUT 은 **멱등**(재전송해도 개수가 안 는다) / 크기가 안 맞는 조각은
400 이고 **저장되지 않는다** / 완료는 단일 업로드와 **같은 모양**의 메타 /
완료·취소 후 세션 404 / 모르는 `uploadId` 404 / 상한 초과는 **시작할 때**
413.

**e2e118 — 브라우저**: 9MB 파일을 **평소처럼 노드에 드롭**하면 144조각으로
올라가고 서버 첨부 URL 이 붙는다(경로를 나누지 않는다는 §12.7 확인) /
진행률이 0에서 1로 오른다 / 조각 하나를 500 으로 떨궈도 **멱등 재시도로
완료** / [취소] → 진행률이 사라지고 첨부도 안 붙고 **오류 줄도 안 뜬다**
(취소는 오류가 아니다).

**GC 확인 방법**: `tmp/<userId>/` 에 `createdAt` 이 24시간 넘은 `meta.json`
을 심고 API 를 재기동하면 그 세션만 지워지고 로그에
`만료된 업로드 세션 N건 정리` 가 남는다. 최근 세션은 남는다.

> **테스트에서 1GB 를 만들지 않는다.** API 를 **`ATTACHMENT_PART_KB=64`**
> 로 띄우면 작은 파일도 조각 여러 개로 쪼개져 같은 코드 경로를 전부
> 지난다. e2e117·e2e118 이 이 방식으로 돈다 — **이 환경변수 없이 돌리면
> 9MB 가 조각 2개라 다중 조각 경로를 거의 검증하지 못한다.**

### 12.10 이 설계가 건드리지 않는 것

* **작은 첨부의 맵 내장(≤2MB)** — 그대로다(`content-permanence.md`).
* **다운로드 경로** — 완료되면 지금과 똑같은 `/v1/attachments/:id` 다.
* **쿼터 정책·요금제** — §8 그대로. 청크는 *전송 방식*만 바꾼다.

---

관련: `content-permanence.md`(현재 내장 방식·보존 약속),
`../00-project-overview/backlog.md` B9,
`../03-editor-core/history/13-version-history.md`(스냅샷 증폭 이슈),
`../user-guide/05-노트-링크-첨부-태그.md`(사용자 안내).


## 12-A. 원격 사진 대리 다운로드 — `POST /v1/attachments/from-url` (2026-08-20)

웹에서 복사한 사진을 우리 저장소에 넣으려면 **서버가 받아야 한다** —
브라우저 `fetch` 는 CORS 로 막히는 사이트가 많다 (B16 ② 슬라이스 3,
`collaboration/28-sync-prework-plan.md` §3.4).

```
POST /v1/attachments/from-url   { url, mapId?, store? }
  → { id, name, mime, sizeBytes, reused, url }        (store 생략/true)
  → { dataUrl, mime, sizeBytes }                      (store:false — 바이트만)
```

- 저장은 **`upload()` 를 그대로 쓴다** — 쿼터 검사와 고아 파일 방지가 거기
  들어 있다. 저장 경로를 새로 만들면 그 둘이 빠진다.
- 이름은 **내용 해시**(`img-<해시16>.<확장자>`)라, 같은 맵에 같은 사진을
  두 번 붙여도 **다시 올리지 않는다**(`reused: true`).
- `store:false` 는 **리치 노트 HTML** 용이다 — 노트 HTML 은 내보내기의 사진
  되돌리기(`export/serverImages.ts`)와 화면의 토큰 붙이기가 훑지 않으므로,
  거기에 서버 주소를 넣으면 **내보낸 파일이 서버 없이 안 열린다.**
  받아오는 일만 서버가 대신하고 결과는 data URL 로 둔다.

### ★ 이 기능의 본체는 SSRF 방어다

"임의의 주소를 우리 서버가 대신 부른다"는 기능이다. 이 배포는 Coolify ·
GoTrue · PostgreSQL 이 같은 도커 네트워크에 있고 NAS 마운트도 붙어 있다 —
막지 않으면 `http://<컨테이너이름>:5432` 한 줄로 내부망이 열린다.
`apps/api/src/attachments/remote-image.ts` 가 전부 건다.

| # | 방어 | 왜 |
|---|---|---|
| ① | `http`/`https` 만 | `file:`·`gopher:`·`data:` 로 로컬 자원을 읽지 못하게 |
| ② | **DNS 해석 결과(IP)로** 사설·루프백·링크로컬·멀티캐스트 차단 | 호스트 이름만 보면 공격자가 자기 도메인의 A 레코드를 `127.0.0.1` 로 걸어 우회한다. 해석 결과가 **하나라도** 막힌 대역이면 거절 |
| ③ | 검사한 **그 IP 로 직접 붙는다**(`lookup` 을 갈아끼운다) | 검사 뒤 다시 해석하면 그 사이에 답이 바뀐다(DNS 리바인딩) |
| ④ | 리다이렉트 3회 상한 + **매 홉마다 ①②③ 재실행** | 첫 응답이 302 로 내부 주소를 가리키는 것이 전형적인 우회다 |
| ⑤ | `Content-Type` 이 image/* 이고 **담을 수 있는 형식**인지(png·jpg·gif·webp) | 내보내기가 알아보지 못하는 형식이 문서에 들어가면 조용한 유실이 된다 |
| ⑥ | 바이트 상한 2.5MB — **스트림을 읽으면서** 넘는 순간 끊는다 | `Content-Length` 는 거짓말할 수 있다. 프런트 폴백(`MAX_EMBED_BYTES`)과 **같은 값**이라 "서버로는 안 되고 브라우저로는 되는" 구간이 없다 |
| ⑦ | 헤더 8초 · 전체 20초, 시간이 되면 **열려 있는 요청을 부순다** | 플래그만 세우면 slow loris 에 소켓이 잡힌 채 남는다 |

### ★ 막는 쪽만 시험하면 받는 쪽이 죽은 것을 못 본다 (2026-08-20)

병합 직후 **모든 다운로드가 조용히 실패하고 있었다** —
`pinnedLookup` 이 Node 의 규약을 어겼다. `net` 은 `lookup` 을
`{ all: true }` 로 부르고 **배열**을 기대하는데 문자열 하나를 돌려주어,
`addresses[0].address` 가 `undefined` 가 되고
`Invalid IP address: undefined` 로 죽었다.

**차단 시험 9항목은 전부 통과했다.** 막는 길은 연결 **전에** 끝나기
때문이다. 그래서 CI 스모크에 **"연결까지 가는가"** 를 함께 둔다 — 공인 IP
를 직접 적어(DNS 없이) 검사를 통과시킨 뒤, 실패 문구가
`Invalid IP address` 가 **아닌지**만 본다.

### 검증

CI 스모크(`apps/api/test/smoke.mjs`) 10항목 — 차단 9 + 연결 1. 실제
다운로드는 바깥 인터넷이 필요해 CI 에서 재지 않는다(수동 e2e:
`05-implementation/test-catalog.md` e2e173·174).

---

## 13. 내려받기 — HTTP Range (2026-08-07)

`GET /v1/attachments/:id` 는 **부분 요청을 지원한다.**

왜 필요했나 — 브라우저는 `<video>`/`<audio>` 를 재생할 때 파일 전체를
받지 않는다. `Range: bytes=0-...` 로 앞부분만 먼저 받아 재생을 시작하고,
구간을 옮기면 그 지점부터 다시 받는다. 서버가 전체를 200 으로만 주면
**구간 이동이 안 되고**, 큰 파일은 재생이 시작조차 안 되는 것처럼 보인다.
2026-08-07 보고가 정확히 이것이었다 — 884MB 동영상을 첨부하고 Play 를
눌렀더니 빈 창만 떴다.

| 요청 | 응답 |
| --- | --- |
| (Range 없음) | `200` + `Content-Length: 크기` + `Accept-Ranges: bytes` |
| `Range: bytes=0-1023` | `206` + `Content-Range: bytes 0-1023/크기` + 그 1024바이트 |
| `Range: bytes=N-` | `206` — N 부터 끝까지 |
| `Range: bytes=-N` | `206` — 마지막 N 바이트 |
| 파일 밖 범위 | `416` + `Content-Range: bytes */크기` |
| 다중 구간(`0-10,20-30`)·다른 단위 | 전체(200) — 허용된 동작이다 |

- 헤더는 `Accept-Ranges: bytes` 를 **항상** 보낸다. 이게 있어야 브라우저가
  구간 이동을 시도한다.
- `Content-Type` 은 업로드 때 받은 MIME, `Content-Disposition` 은
  `inline`(다운로드 강제가 아니다) — 그래야 브라우저가 재생한다.
- 구간 읽기는 `storage.stream(key, { start, end })` → 로컬 드라이버는
  `fs.createReadStream(path, { start, end })`. **end 는 포함**이다
  (HTTP Range 와 Node 가 둘 다 그렇다).
- 범위 계산에 크기가 필요해 메타를 먼저 연다. 그때 열린 전체 스트림은
  `destroy()` 로 버리고 구간 스트림을 다시 연다 — 안 버리면 파일 핸들이
  샌다.
- 파서는 `parseByteRange()` (attachments.controller). 검증: **e2e125 [3]~[3e]**.

프런트는 이 응답을 그대로 쓴다 — 브라우저가 열 수 있는 형식이면 **URL을
넘기고**(스트리밍), 오피스처럼 못 여는 형식만 받아서 다운로드한다
(04-node-content.md §14.5).
