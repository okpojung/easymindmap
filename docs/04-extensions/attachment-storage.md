# 첨부 저장소 설계 (B9) — 서버 저장 + 내 드라이브 저장

> **이 문서의 역할**: 이미지·첨부파일을 **어디에 어떻게 저장하고 다시
> 불러올지**의 확정 설계다. 요금제 용량 정책, 사용자 개인 드라이브
> (구글 드라이브·OneDrive·NAS·로컬 대용량 디스크) 활용, 브라우저의
> 실제 제약과 그 우회 방법, 단계별 구현 계획을 담는다.
>
> 작성: 2026-08-02 (사용자 요구사항 기반 설계) · 최종 업데이트: 2026-08-04
> · 상태: **P1 구현 완료(2026-08-02, B9) · P2~P4 설계**
> · 관련: `content-permanence.md`(현재의 내장 방식),
> `../02-domain/db-schema.md`, `../05-implementation/api-spec.md`

---

> 📍 **사용량 표시는 이미 아바타 메뉴에 구현**되어 있다 — 📊 저장 용량
> 막대(문서+첨부 합산, 90% 경고). **요금제 변경만** 💳 구독 상태
> (현재 "준비 중")로 남아 있다.
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
> **[미구현 — 초안]** — P1 은 `users.quota_bytes`(기본 1GB) 한 컬럼이다.

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

## 8. 요금제·용량 정책 (초안 — 확정 필요)

| 플랜 | 서버 첨부 용량 | 파일 1개 최대 | 비고 |
|---|---|---|---|
| Free | 1 GB | 20 MB | 개인 체험 |
| Basic(기본 구독) | **10 GB** | 100 MB | ThinkWise 기본 구독 수준 참고 |
| Team | 사용자당 20 GB (워크스페이스 합산) | 200 MB | |
| 내 드라이브 사용 시 | **무제한(과금 대상 아님)** | 브라우저 한계 | 서버 용량을 쓰지 않음 |

> **현행(P1)**: 파일 1개 상한은 플랜과 무관하게 환경변수
> `ATTACHMENT_MAX_MB`(기본 **20MB**) 하나로 적용된다 — 플랜별 차등은 초안.

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

관련: `content-permanence.md`(현재 내장 방식·보존 약속),
`../00-project-overview/backlog.md` B9,
`../03-editor-core/history/13-version-history.md`(스냅샷 증폭 이슈),
`../user-guide/05-노트-링크-첨부-태그.md`(사용자 안내).
