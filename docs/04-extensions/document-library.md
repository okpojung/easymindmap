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
| 3 | 새 맵은 제목을 묻지 않고 **'새 맵'**으로 시작, **첫 저장 때 폴더·이름**을 묻는다. 같은 폴더 같은 이름이면 거절하고 안내 | `SaveMapDialog` + API 409 |
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
 ├─ 서버 맵과 연결됨(cloudMapId 있음)
 │    → 묻지 않고 저장. 이름은 cloudStore.cloudTitle (= 열었던 그 이름)
 └─ 아직 저장 안 함
      → SaveMapDialog: 폴더 · 이름 · 유형
         └─ 409 이면 "같은 폴더에 … 맵이 이미 있습니다" 그대로 표시
```

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

## 5. 문서 브라우저 (규칙 5·6)

`components/cloud/MapBrowser.tsx` — 팝업 모달(`MapListModal`)을 **대체**했다.
편집 영역을 그대로 쓰므로 목록이 길어도 화면이 넉넉하고, 폴더 이동·정렬이
편하다.

- 홈 > 폴더 **breadcrumb**, 폴더 먼저 그다음 맵
- 열 머리글 **이름 / 수정일** 클릭 → 오름·내림 전환(같은 열 다시 누르면 반대)
- 행 도구: 폴더(✏ 이름 · 🗑 삭제) / 맵(✏ 이름 · 📂 이동 · 🗑 삭제)
- 여는 방식은 탭 모델을 따른다 — 편집 중이면 **브라우저 새 탭**,
  잃을 것이 없으면 이 탭, **이미 이 탭에서 편집 중인 맵은 열지 않는다**
  (두 탭이 같은 맵을 자동저장하며 서로 덮어쓰는 것을 막는다)

## 6. 맵 유형 (규칙 7)

`maps.kind` = `'solo'`(👤 단독맵, 기본) / `'collab'`(👥 협업맵).

- 저장할 때 고르고, 문서함의 배지를 눌러 언제든 바꿀 수 있다.
- **지금은 분류 표식이다** — 실제 동시 편집·초대·커서 공유는 협업 단계
  (25-map-collaboration, V1~V2)에서 붙는다. 그때 이 값이 "협업으로 열
  맵"의 기준이 된다.

## 7. 검증

풀스택 E2E **e2e82** 12단언 ALL PASS + 회귀 e2e79·e2e80·e2e81·e2e-cloud2
ALL PASS (모두 문서함 셀렉터로 갱신). API 스모크(폴더 중복 409 · 맵 중복
409 · 다른 폴더 같은 이름 허용 · 비어 있지 않은 폴더 삭제 409) 확인.
