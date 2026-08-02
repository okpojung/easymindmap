# 문서함 — 폴더 · 저장 규칙 · 문서 브라우저 · 맵 유형

> 2026-08-02 확정·구현 (사용자 요청 7건). 맵이 늘어나면서 "어디에
> 저장했는지"가 문제가 되기 시작한 시점의 정리다.
> 관련: [auth-session-ui.md](auth-session-ui.md)(로그인·탭 모델),
> [13-version-history.md](../03-editor-core/history/13-version-history.md)(히스토리)

## 0. 한눈에

| # | 규칙 | 어디에 |
|---|---|---|
| 1 | 사용자가 **폴더를 만들고 폴더별로 맵을 저장**한다 | `map_folders` + 문서함 |
| 2 | 서버 맵을 열어 편집한 뒤 저장하면 **열었던 이름 그대로** | `cloudStore.cloudTitle` |
| 3 | 새 맵은 제목을 묻지 않고 **'새 맵'**으로 시작, **첫 저장 때 폴더·이름**을 묻는다(유형은 묻지 않음). 같은 폴더 같은 이름이면 거절하고 안내 | `SaveMapDialog` + API 409 |
| 4 | **저장하지 않은 맵을 닫으면 경고** 후 닫는다 | `MapActions` 경고 대화상자 |
| 5 | 서버 맵 목록은 팝업이 아니라 **편집 영역의 문서함** | `MapBrowser` |
| 6 | 목록은 **이름·수정일 오름/내림 정렬** | `GET /maps?sort=&order=` |
| 7 | 맵 유형은 **단독맵 / 협업맵** | `maps.kind` |

## 1. 데이터 (schema.sql)

```sql
CREATE TABLE public.map_folders (
    id UUID PK, owner_id UUID → users, parent_id UUID → map_folders,
    name VARCHAR(255), created_at, updated_at);

ALTER TABLE public.maps
    ADD COLUMN folder_id UUID REFERENCES map_folders(id) ON DELETE SET NULL,  -- NULL = 홈
    ADD COLUMN kind VARCHAR(20) NOT NULL DEFAULT 'solo';                      -- solo | collab
```

- 모든 DDL 이 `IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS` 라 **재적용해도
  안전**하다 (`npm run db:apply`).
- RLS: `map_folders` 는 소유자만 (`auth.uid() = owner_id`).
- **헬스체크가 컬럼까지 본다** — 테이블만 검사하면 "테이블은 있는데 컬럼이
  없는" 배포를 놓친다. `health.controller.ts` 의 `REQUIRED_COLUMNS` 에
  `maps.folder_id`·`maps.kind` 를 넣었다. 응답:
  `{"schema":"outdated","missingColumns":["maps.kind"]}`

### dev 서버에 적용한 델타 SQL (2026-08-02, 실측 검증)

저장소가 없는 서버에서 붙여넣기 한 번으로 끝내는 형태. 두 번 실행해도
안전한 것과, 적용 후 헬스체크가 `outdated → ok` 로 바뀌는 것을 확인했다.
절차는 [dev-server-runbook §0-2-A](../90-architecture/dev-server-runbook.md).

```bash
docker exec -i <DB> psql -U postgres -d postgres <<'SQL'
CREATE TABLE IF NOT EXISTS public.map_folders (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    parent_id   UUID REFERENCES public.map_folders(id) ON DELETE CASCADE,
    name        VARCHAR(255) NOT NULL,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_map_folders_owner
    ON public.map_folders(owner_id, parent_id);

ALTER TABLE public.maps
    ADD COLUMN IF NOT EXISTS folder_id UUID REFERENCES public.map_folders(id) ON DELETE SET NULL;
ALTER TABLE public.maps
    ADD COLUMN IF NOT EXISTS kind VARCHAR(20) NOT NULL DEFAULT 'solo';
CREATE INDEX IF NOT EXISTS idx_maps_folder
    ON public.maps(owner_id, folder_id) WHERE deleted_at IS NULL;

ALTER TABLE public.map_folders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users can manage own folders" ON public.map_folders;
CREATE POLICY "users can manage own folders"
    ON public.map_folders FOR ALL
    USING (auth.uid() = owner_id);
SQL
```

### 첨부 저장소 + 쿼터 델타 SQL (B9 — 2026-08-02)

> DB 컨테이너 이름을 몰라도 되는 **자동 적용 스크립트**(탐색+적용+검증
> 일괄)가 [dev-server-runbook §1.5-0](../90-architecture/dev-server-runbook.md)
> 에 있다 — 아래 수동 SQL 과 같은 내용이다.

```bash
docker exec -i <DB> psql -U postgres -d postgres <<'SQL'
ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS quota_bytes BIGINT NOT NULL DEFAULT 1073741824;

CREATE TABLE IF NOT EXISTS public.attachments (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    map_id       UUID REFERENCES public.maps(id) ON DELETE SET NULL,
    name         VARCHAR(255) NOT NULL,
    mime         VARCHAR(127) NOT NULL DEFAULT 'application/octet-stream',
    size_bytes   BIGINT NOT NULL,
    storage_key  TEXT NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_attachments_owner
    ON public.attachments(owner_id);
ALTER TABLE public.attachments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users can manage own attachments" ON public.attachments;
CREATE POLICY "users can manage own attachments"
    ON public.attachments FOR ALL
    USING (auth.uid() = owner_id);
SQL
```

쿼터 정책(2026-08-02 결정): **DB(문서+히스토리 버전) + 첨부 합산**이
`users.quota_bytes` 이하 — 기본(무료) 1GB, 유료는 10GB 로 상향
(`UPDATE public.users SET quota_bytes = 10737418240 WHERE id = ...`).
파일 원본은 API 의 저장소 드라이버(STORAGE_LOCAL_DIR — dev 는 NFS 마운트)
에 저장된다. 서버 설정은 [dev-server-runbook §첨부 저장소]
(../90-architecture/dev-server-runbook.md) 참조.

### 스키마를 적용하지 않고 배포하면 (2026-08-02 실제 발생)

문서함이 **"Internal server error"** 만 띄웠다. 코드는 새 것인데 DB 에
`map_folders`·`maps.folder_id/kind` 가 없어 쿼리가 깨진 것인데, 화면에는
아무 단서가 없었다. 그래서 두 겹으로 고쳤다:

1. **API** — `DatabaseService` 가 PostgreSQL 의 `42P01`(테이블 없음)·
   `42703`(컬럼 없음)·`42883`(함수 없음)을 잡아 **503 + 조치 안내**로
   바꾼다: *"서버 데이터베이스 스키마가 최신이 아닙니다 … `npm run
   db:apply` … 자세한 누락 항목은 /v1/health"*.
2. **화면** — 문서함 위쪽에 그 메시지를 **빨간 배너**로 그대로 보여 준다.

즉 배포 순서를 빠뜨려도 **무엇을 해야 하는지 화면이 말해 준다**.
헬스체크(`/v1/health`)는 그대로 `missingTables`·`missingColumns` 로
정확한 누락 목록을 준다.

> ⚠️ **제목 중복 금지는 유니크 인덱스가 아니라 API 검사다.** 이미 운영
> 중인 DB 에 중복 제목이 남아 있으면 유니크 인덱스 생성이 실패해 스키마
> 적용 전체가 멈춘다. 데이터를 정리한 뒤 인덱스로 승격하는 것이 다음
> 단계다(backlog B13).

## 2. API

| 메서드 | 경로 | 하는 일 |
|---|---|---|
| GET | `/v1/folders` | 내 폴더 전부(평면) + 폴더별 맵 수. 트리 구성은 클라이언트 |
| POST | `/v1/folders` | 생성 — 같은 부모에 같은 이름이면 **409** |
| PATCH | `/v1/folders/:id` | 이름 변경 · 이동(자기 자신/자손으로는 **400**) |
| DELETE | `/v1/folders/:id` | **비어 있을 때만** — 아니면 409(몇 개 남았는지 알려 준다) |
| GET | `/v1/maps?folder=root\|<id>&sort=title\|updatedAt&order=asc\|desc` | 폴더별 목록 + 정렬 |
| POST | `/v1/maps` | `{title, folderId, kind}` — 같은 폴더 같은 이름이면 **409** |
| PATCH | `/v1/maps/:id` | 이름 변경 · 폴더 이동 · 유형 변경 (중복이면 409) |

정렬 컬럼은 화이트리스트로만 매핑한다(`title` → `lower(btrim(title))`,
그 외 → `updated_at`) — 사용자 입력이 SQL 문자열에 들어가지 않는다.

## 3. 저장 규칙 (규칙 2·3)

```
☁ 저장
 ├─ 열려 있는 맵 없음('문서 없음') → "열려 있는 맵이 없습니다" (아무것도 안 함)
 ├─ 서버 맵과 연결됨(cloudMapId 있음)
 │    → 묻지 않고 저장. 이름은 cloudStore.cloudTitle (= 열었던 그 이름)
 └─ 아직 저장 안 함
      → SaveMapDialog: 폴더 · 이름 (유형은 묻지 않음 — §6)
         └─ 409 이면 "같은 폴더에 … 맵이 이미 있습니다" 그대로 표시
```

### 스냅샷 v2 — 레이아웃도 저장된다 (2026-08-02 사용자 보고로 수정)

v1 스냅샷은 `{v, map, kanban}` 뿐이라 **전역 레이아웃(진행트리 등)과
간격이 저장되지 않았다** — 진행트리로 편집해 저장한 맵이 서버에서 다시
열면 다른 레이아웃으로 나왔다. 레이아웃은 documentStore 가 아니라
editorUiStore 소관이라 스냅샷에 명시적으로 실어야 한다.

```jsonc
{ "v": 2, "map": …, "kanban": …,
  "editor": { "layoutType": "tree-down", "spacingX": 1, "spacingY": 1 } }
```

열 때 `applySnapshotEditor()` 가 복원한다. **v1 스냅샷(editor 없음)은
현재 레이아웃을 그대로 둔다** — 저장 당시 값을 알 수 없기 때문. 자동
저장도 같은 v2 형태를 보낸다(useCloudAutosave — mapSession 이 이 파일을
import 하므로 순환을 피해 스냅샷 함수는 각자 둔다).

- **왜 문서의 map.title 을 쓰지 않나**: 중심 주제를 바꿔도 파일 이름은
  바뀌면 안 된다. 자동저장도 같은 이유로 `cloudTitle` 을 보낸다 —
  자동저장이 이름을 바꿔 버리면 규칙 2가 깨진다.
- **새 맵 만들기·Local 파일 불러오기는 서버 연결을 끊는다**
  (`detachFromServer()`). 끊지 않으면 새 문서의 자동저장이 **조금 전까지
  편집하던 서버 맵을 덮어쓴다** — 2026-08-02 e2e82 에서 실측한 사고다.

## 4. 닫기 규칙 (규칙 4)

| 상태 | 동작 |
|---|---|
| 서버에 저장된 맵 | 마지막 내용을 저장하고 닫는다. **저장 실패 시 닫지 않는다** |
| 아직 저장 안 한 맵 | **"⚠ 맵이 저장되지 않았습니다"** → 저장하고 닫기 / 저장 없이 닫기 / 취소 |

닫은 뒤에는 편집 영역에 문서함이 열린다. 실수로 닫아도 **Ctrl+Z**.
열려 있는 맵이 없으면 "열려 있는 맵이 없습니다"만 알린다(저장과 동일).

## 5. 문서 브라우저 (규칙 5·6)

`components/cloud/MapBrowser.tsx` — 팝업 모달(`MapListModal`)을 **대체**했다.
편집 영역을 그대로 쓰므로 목록이 길어도 화면이 넉넉하고, 폴더 이동·정렬이
편하다.

- 홈 > 폴더 **breadcrumb**, 폴더 먼저 그다음 맵
- 열 머리글 **이름 / 수정일** 클릭 → 오름·내림 전환(같은 열 다시 누르면 반대)
- 행 도구: 폴더(✏ 이름 · 🗑 삭제) / 맵(✏ 이름 · 📂 이동 · 🗑 삭제)
- **폴더 이동(📂)은 폴더를 눌러서 고른다** (`FolderPickerDialog`).
  처음에는 `window.prompt` 로 폴더 **번호**를 입력받았는데, 브라우저
  기본 대화상자라 목록을 보면서 고를 수가 없었다(2026-08-02 사용자 지적).
- 여는 방식은 탭 모델을 따른다 — 편집 중이면 **브라우저 새 탭**,
  잃을 것이 없으면 이 탭. **이미 이 탭에서 편집 중인 맵을 클릭하면
  문서함을 닫고 편집 화면으로 돌아간다** (2026-08-02 수정 — 전에는
  "이미 편집 중"이라며 거부만 해서, 재로그인 뒤 링크가 낡아 있으면
  맵으로 돌아갈 길이 없었다)

## 5-0. 로그인/로그아웃 전환 리셋 (2026-08-02 사용자 보고 #4)

세션이 바뀔 때마다(EditorPage, `[session]` 효과) **문서·서버 링크·undo
히스토리를 전부 비운다**:

- **로그아웃**: 이전 계정의 문서가 화면과 Ctrl+Z 에 남으면 안 된다.
  특히 `cloudMapId` 가 남으면 재로그인 후 문서함이 그 맵을 "편집 중"
  으로 표시하고 열기를 거부했다 — 실사용에서 맵이 잠긴 것처럼 보였다.
- **로그인**: 빈 화면 + 문서함으로 시작한다(§5-1).
- undo 는 `clearHistory()` 로 비운다 — 계정 경계 너머로 문서가
  되돌아오면 안 된다. (같은 이유로, 빈 문서 상태에서는 새 맵 만들기의
  "현재 맵을 닫고 진행할까요?" 확인도 뜨지 않는다 — undo 이력이 남아
  있어도 화면에 닫을 맵이 없다.)

## 5-1. 로그인 직후 화면 — 아무 맵도 열지 않는다

**인증이 켜진 배포에서는 부팅 시 샘플 맵을 넣지 않는다** (2026-08-02
사용자 지시). 로그인하자마자 남의 문서처럼 보이는 샘플 맵이 떠 있으면
"내 문서"인지 헷갈리고, 거기서 편집을 시작하면 저장할 곳이 애매해진다.
대신 **문서함을 열어** 다음 행동(열기 / 새 맵)을 바로 고르게 한다.

- 판단 기준은 `authEnabled` — **개발 모드(로컬·E2E)에서는 샘플 맵을
  그대로 주입한다**. 샘플은 테스트 픽스처로 계속 필요하기 때문이다.
  이 차이는 "부팅 시 화면에 무엇이 있는가"에만 있고 저장·닫기·열기
  로직은 두 모드가 동일하다.
- 문서함이 열린 상태에서 **새 맵 만들기**를 누르면 문서함이 닫히고
  편집 화면으로 넘어간다(`setBrowserOpen(false)`).
- backlog B7 이 예고했던 "첫 실행 샘플 맵을 정식 버전에서는 문서 목록/
  빈 시작으로 대체"가 이 단계에서 이뤄졌다.

## 6. 맵 유형 (규칙 7)

`maps.kind` = `'solo'`(👤 단독맵, 기본) / `'collab'`(👥 협업맵).

- **사용자가 고르는 값이 아니다** (2026-08-02 확정): 모든 맵은 단독맵
  으로 만들어지고, **협업자를 초대해 승인·참여하는 순간** 협업맵으로
  전환된다 — 초대 흐름은 협업 단계(25-map-collaboration, V1~V2)에서
  붙고, 그 흐름이 이 값을 'collab' 으로 바꾼다.
- 그래서 저장 대화상자에 유형 선택이 없고, 문서함의 배지도 **표시
  전용**이다(처음에는 저장 시 선택 + 배지 토글이었다가 이날 정리).

## 7. 검증

풀스택 E2E **e2e82** + **e2e84** + **e2e85** 9단언(빈 상태 저장 차단 ·
유형 선택 없음 · 빈 문서 새 맵 확인 없음 · 레이아웃 왕복 · 로그아웃/
재로그인 리셋 · 편집 중 맵 복귀 · 배지 표시 전용) ALL PASS + 회귀
e2e79·e2e80·e2e81·e2e-cloud2 ALL PASS. API 스모크(폴더 중복 409 · 맵
중복 409 · 다른 폴더 같은 이름 허용 · 비어 있지 않은 폴더 삭제 409) 확인.
