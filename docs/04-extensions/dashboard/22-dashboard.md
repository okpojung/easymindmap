# 22. 대시보드맵 (DASHBOARD) — v2 설계안

* 문서 버전: **v2.0 — 설계안, 사용자 검토 대기** (2026-09-29)
* 이전 판: v1.0 (2026-04-16) — 부록 B 에 요약과 폐기 이유
* 상태: **승인 전에는 구현하지 않는다.** 승인되면 §11 1단계부터 착수한다.
* 경계: **유료(pro) 기능** — `open-core-boundary.md` §3 표 "대시보드 맵 ❌ 공개 / ✅ 유료".
  이 설계 문서는 공개로 둔다(같은 표 "유료 기능의 설계 문서 ✅ 그대로").
* 참조: `publish/27-publish-share.md`(읽기 전용 잠금의 선례),
  `ai/mcp-connector.md` §9.12(`check_items` — 서버가 문서 노드를 고치는 선례),
  `open-core-boundary.md` §3.1 ③ · §4(코어 자리 / pro 알맹이)

---

## 0. 한 장 요약

> **맵의 모양(노드 이름·구조)은 얼리고, 노드에 붙은 값만 흐르게 한다.**

| | 무엇 |
|---|---|
| 전환 | 문서함·에디터 맵 메뉴에서 **[대시보드맵으로 전환]**. 퍼블리싱처럼 **편집이 막힌다** |
| 문서함 | 유형 칸에 **📊 대시보드맵** |
| 값의 자리 | 새 표 `dashboard_values` — 키는 **(맵 ID, 노드 ID)**. 맵 문서(`map_documents.doc`)는 건드리지 않는다 |
| 화면 | 노드 옆에 **값 칩**(예: `33,500,000 원`). 10초마다 새로 읽고, 바뀐 값은 2초 깜빡인다 |
| DB 정보 보기 | 노드를 누르면 오른쪽 **[데이터 연결]** 패널 — 맵 ID·노드 ID·현재 값·DB 주소와 **복사해 쓰는 명령**(curl·CLI·SQL) |
| 값 넣기 | ① 패널에서 직접 ② **시험 프로그램** `emm-dash` (맵별 열쇠 `emd_…`) ③ API 를 부르는 어떤 프로그램이든 |
| 되돌리기 | **[일반맵으로 되돌리기]** — 편집이 다시 된다. 값은 지우지 않는다 |

---

## 1. 요청 (2026-09-29 사용자 원문)

> 대시보드맵을 개발하자. 일반맵을 대시보드맵으로 지정하면 퍼블리싱처럼 수정이
> 안 된다. 내 문서함에 대시보드 맵 구분을 추가한다.
> 대시보드 맵으로 전환된 맵을 열어서 맵 노드의 해당 노드 값을 DB 에 넣기 위한
> 정보를 어떻게 보여주고, 이 정보를 이용하여 간단하게 해당 DB 필드에 값을 넣거나
> 업데이트하는 프로그램을 작성하여 테스트해 보자.
> 대시보드맵 개발을 위한 설계안부터 작성해 줘. 검토해 보고 승인하면 개발에 착수해.

요청을 넷으로 나눈다 — **R1** 전환하면 편집 잠금, **R2** 문서함 구분,
**R3** 노드마다 "DB 에 값을 넣는 데 필요한 정보"를 보여 주기,
**R4** 그 정보로 값을 넣고 고치는 프로그램 + 시험.

---

## 2. v1 에서 바뀐 것 — 그리고 왜

v1(2026-04)은 **`nodes` 표의 `text` 칸을 외부 API 가 고친다**는 전제였다.
지금 앱은 그렇게 저장하지 않는다.

| | v1 이 가정한 것 | 실제 (2026-09-29 코드 확인) |
|---|---|---|
| 맵 내용의 원본 | 정규화된 `nodes` 표 | **`map_documents.doc`** — 맵 하나가 JSONB **한 덩어리**. `nodes` 표는 읽기용으로만 남았다 |
| 노드 값 바꾸기 | `UPDATE nodes SET text=…` | 문서 전체를 다시 저장해야 한다(`saveDocument`) |

그래서 **값을 맵 문서 안(노드 글자)에 쓰는 길은 버린다.** 그렇게 하면:

1. 값 하나 바꿀 때마다 **문서 전체**를 다시 쓴다 — 큰 맵(이미지 포함)이면 수 MB.
2. 저장마다 **히스토리 버전**이 쌓이거나(쌓지 않으면 되돌리기와 섞이고),
   편집 잠금·`STALE` 충돌 규칙과 부딪힌다 — 문서는 "사람이 편집하는 것"을
   전제로 만든 경로다.
3. 외부 프로그램이 **JSON 트리 수술**을 해야 한다. "이 노드의 값" 이 DB 에서
   한 칸이 아니다.

대신 **값만 따로 둔다**(§3). 문서는 대시보드가 되는 순간 얼어 있으므로, 노드
ID 는 변하지 않고 값의 **주소**로 쓸 수 있다.

v1 의 `field_registry`(노드 텍스트·색 같은 **일반 필드를 편집하는 웹앱**)는
요청 범위 밖이고 같은 이유(원본이 `nodes` 가 아니다)로 성립하지 않는다 —
**보류**한다(부록 B).

---

## 3. 개념 — 모양은 얼고, 값만 흐른다

```
┌─ map_documents.doc (JSONB) ───────────┐     ┌─ dashboard_values ──────────────────┐
│ 매출 현황                              │     │ map_id   node_id      value   unit  │
│ ├─ 오늘        (id: node-k3f9a2) ──────┼──┐  │ 3036…   node-k3f9a2   33500000  원  │
│ ├─ 이번 달     (id: node-8d01ce) ──────┼─┐└─▶│ 3036…   node-8d01ce   812000000 원  │
│ └─ 목표 달성률 (id: node-a77b10) ──────┼┐└──▶│ 3036…   node-a77b10   78        %   │
└───────────── 대시보드면 편집 불가 ──────┘└───▶└──────────── 여기만 바뀐다 ────────────┘
                     │                                      ▲
                     ▼                                      │ PUT /values
              화면 = 문서 + 값 칩                  패널 · emm-dash · 외부 프로그램
```

- **노드 = 값의 이름표.** 노드 글자("오늘")는 사람이 읽는 이름이고, 값은
  노드 옆 칩으로 붙는다.
- **어느 노드에나 값이 붙을 수 있다.** "데이터 노드"를 따로 지정하지 않는다 —
  값을 넣은 노드에만 칩이 뜬다(1단계). 지정 방식은 2단계에서 필요하면 더한다.
- **키 = 노드 ID** (`node-…`, 앱이 만드는 고유값). 대시보드인 동안 문서가
  얼어 있으니 ID 도 바뀌지 않는다.

---

## 4. 사용자 흐름

### 4.1 전환 — R1

- 자리 두 곳: **문서함 행 메뉴**와 **에디터 상단 맵 메뉴** →
  **[📊 대시보드맵으로 전환]**.
- 확인창:

  ```
  대시보드맵으로 바꿀까요?
  · 맵의 노드·글자·구조를 고칠 수 없게 됩니다 (퍼블리싱과 같습니다)
  · 노드에 값을 넣어 보여 줄 수 있습니다 — 프로그램으로 넣을 수도 있습니다
  · 언제든 [일반맵으로 되돌리기] 로 다시 편집할 수 있습니다
                                         [취소] [대시보드맵으로 전환]
  ```

- **전환할 수 없는 경우**(단추를 흐리게 + 이유 툴팁):

  | 경우 | 이유 문구 |
  |---|---|
  | 공개 중인 퍼블리싱맵 | "공개 중인 맵입니다 — 비공개(보관)로 바꾼 뒤 전환하세요" |
  | 협업맵 | "협업맵은 아직 대시보드로 바꿀 수 없습니다" (§12 결정 5) |
  | 내 맵이 아님 | 단추를 그리지 않는다 |
  | pro 가 꺼진 서버 | "대시보드맵은 유료 기능입니다" (`/v1/features` 의 이유 그대로) |

- 전환할 때 서버는 문서의 **노드 ID 중복을 먼저 검사**한다. 중복이 있으면
  전환을 거절한다("같은 ID 의 노드가 있어 값의 주소가 겹칩니다 — 맵을 한 번
  열어 저장한 뒤 다시 시도하세요"). 앱은 불러올 때 중복 ID 를 새 ID 로 고치는데
  (`documentStore` 의 dedupe), 읽기 전용 맵은 저장하지 않으므로 그 고침이
  서버에 가지 않는다 — 화면과 서버의 노드 ID 가 어긋나는 것을 입구에서 막는다.

### 4.2 문서함 유형 — R2

`MapBrowser.tsx` 의 `mapType()` 이 이미 이 자리를 예약해 두었다("`kind ===
'dashboard'` 가 생기면 ③ 옆에 한 줄"). 판정은 `kind` 가 아니라 **`view_mode`**
로 한다(§6 — 칸이 이미 있다).

| 우선순위 | 유형 | 배지 |
|---|---|---|
| ① | 공유받은 맵 | 👁 읽기 전용 / 🤝 함께 편집 (그대로) |
| ② | 퍼블리싱맵 | 🌐 / 🔒 (그대로) |
| **③** | **대시보드맵** | **📊 대시보드맵** — 툴팁 "편집이 잠긴 맵 — 노드 값만 바뀝니다" |
| ④ | 협업맵 / 단독맵 | 그대로 |

②와 ③은 동시에 될 수 없다(§4.1) — 순서는 안전장치다.

### 4.3 대시보드맵 열기

- 에디터는 **읽기 전용**으로 연다(퍼블리싱과 같은 길 — `getDocument` 가
  `dashboard: true` 를 주고, `mapSession` 이 `readOnlyInfo` 로 연다).
- 상단 배너: `📊 대시보드맵 — 노드 값만 바뀝니다 · 마지막 갱신 14:32:05 · [⟳] · [일반맵으로 되돌리기]`
- **값 칩** — 값이 있는 노드의 오른쪽 아래에 작은 칩:

  ```
  ┌──────────┐
  │   오늘    │
  └──────────┘33,500,000 원
  ```

  ★ **칩은 레이아웃 밖에 그린다**(노드 크기를 바꾸지 않는 겹침 층). 값이
  바뀔 때마다 노드 폭이 달라져 맵 전체가 들썩이면 대시보드로 쓸 수 없고,
  레이아웃 불변식(`layoutInvariants.test.ts`)도 건드리지 않는다.
- 숫자 유형은 천 단위 쉼표, 단위를 뒤에 붙인다. 값은 **글자로만** 그린다
  (HTML·마크다운 해석 없음 — 외부 프로그램이 넣은 값이 화면에서 실행될 길을
  막는다).
- **자동 갱신**: 기본 10초(끄기 · 10초 · 30초 · 1분 · 5분 — `maps.refresh_interval_seconds`
  칸이 이미 있다). 바뀐 값의 칩은 **2초 노란 깜빡임**(v1 DASH-03).
  탭이 안 보이면 멈추고, 돌아오면 바로 한 번 읽는다.

### 4.4 노드 클릭 → [데이터 연결] 패널 — R3

오른쪽 인스펙터에 탭 하나를 더한다(대시보드맵일 때만).

```
┌ 📊 데이터 연결 ─────────────────────────────────────────┐
│ 노드      매출 현황 > 오늘                              │
│ 노드 ID   node-k3f9a2                          [복사]   │
│ 맵 ID     303638b5-0374-4ca2-b0ac-4d5be2e3f0bc  [복사]  │
│ 현재 값   33,500,000 원   (숫자)                        │
│ 갱신      2026-09-29 14:32:05 · 열쇠 emd_a1b2 (ERP 연동) │
│                                                          │
│ ── 값 넣기 ─────────────────────────────────────────── │
│ [ 33500000        ] [숫자 ▾] [원  ]           [저장]    │
│                                                          │
│ ── 프로그램에서 넣기 ───────────────────────────────── │
│ curl -X PUT $EMM_API/v1/maps/3036…/dashboard/values \   │
│   -H "Authorization: Bearer $EMM_DASH_KEY" \             │
│   -d '{"values":[{"nodeId":"node-k3f9a2",               │
│        "value":"33500000","type":"number","unit":"원"}]}' │
│                                                 [복사]   │
│ emm-dash set 3036… node-k3f9a2 33500000 --type number   │
│   --unit 원                                     [복사]   │
│                                                          │
│ ── DB 에서 보면 (서버 관리자 참고) ─────────────────── │
│ 표   dashboard_values                                    │
│ 행   map_id = '3036…' AND node_id = 'node-k3f9a2'        │
│ 칸   value · value_type · unit · updated_at · updated_by │
│                                                 [SQL 복사] │
│                                                          │
│ [맵 전체 노드 ID 목록 내려받기 (JSON)]                    │
│ [이 맵의 열쇠 관리…]                                     │
└──────────────────────────────────────────────────────────┘
```

- **"DB 에 넣기 위한 정보"는 세 층으로 보여 준다** — 사람(노드 경로), 프로그램
  (맵 ID·노드 ID·API 명령), DB(표·행·칸). 요청의 "DB 필드"는 셋째 층이다.
- ★ **프로그램은 DB 에 직접 붙지 않고 API 로 넣는다**(권장이자 기본). DB 접속
  정보를 외부 프로그램에 주면 그 프로그램이 **모든 맵·모든 사용자 데이터**에
  닿는다. SQL 은 서버 관리자가 확인·긴급 수정할 때 쓰라고 보여 주는 참고다.
- **[노드 ID 목록 내려받기]** — `[{nodeId, path, value, type, unit}]` JSON.
  프로그램을 짤 때 이 파일 하나로 매핑을 만든다.

### 4.5 값 넣기 — R4

| 길 | 누가 | 인증 |
|---|---|---|
| ① 패널의 [저장] | 맵 주인 | 로그인 세션 |
| ② `emm-dash` 시험 프로그램 | 누구든 열쇠를 가진 사람·서버 | **맵별 열쇠** `emd_…` |
| ③ 임의 프로그램 (ERP·모니터링·스프레드시트 매크로) | 〃 | 〃 |

**맵별 열쇠** — [이 맵의 열쇠 관리…] 에서 이름을 붙여 만든다("ERP 연동").
원문은 **만들 때 한 번만** 보여 주고 서버는 해시만 둔다(MCP 토큰
`api_tokens` 와 같은 규칙). 이 열쇠로는 **그 맵의 값 읽기·쓰기만** 된다 — 맵
문서를 읽거나 다른 맵에 닿지 못한다. 폐기하면 바로 막힌다.

### 4.6 되돌리기

[일반맵으로 되돌리기] → 편집이 다시 된다. **값은 지우지 않는다**(다시 대시보드로
바꾸면 그대로 보인다). 편집 중에 노드를 지우면 그 노드의 값은 "맵에 없는 키"가
된다 — 다시 대시보드로 바꿀 때 패널이 "맵에 없는 값 N건 [지우기]" 로 알린다(1단계는
목록만, 정리 단추는 2단계).

---

## 5. 규칙

| 규칙 | 내용 | 근거 |
|---|---|---|
| **편집 잠금은 서버가 한다** | `view_mode='dashboard'` 면 `saveDocument` 가 403. 자동저장·옛 탭·MCP(`append_to_map`·`check_items`)·직접 호출 모두 같은 문에서 막힌다 | 퍼블리싱 잠금과 같은 자리·같은 이유("막을 거면 문이 있는 모든 곳") |
| 전환·되돌리기 | **맵 주인만.** 되돌리기는 pro 가 꺼져도 된다(사용자가 갇히지 않게) | |
| 값 쓰기 대상 | **대시보드맵만.** 일반맵에 쓰면 409 `NOT_DASHBOARD` | 편집 중인 맵의 노드는 사라질 수 있다 |
| 노드 확인 | 문서에 없는 노드 ID 는 404 `NODE_NOT_FOUND`(여럿 넣을 때는 넣을 수 있는 것만 넣고 모르는 ID 를 돌려준다) | 오타가 조용히 성공하면 화면에 영영 안 뜬다 |
| 값 | 글자 500자까지. 유형 `text`·`number`(숫자 검사)·단위 20자까지 | |
| 쓰기 빈도 | 열쇠당 분당 120회(기존 `@nestjs/throttler`) | 폭주하는 스크립트가 서버를 잡지 않게 |
| 읽기 | 맵을 볼 수 있는 사람(주인·공유받은 사람) + 그 맵의 열쇠 | |

---

## 6. 데이터 — **표를 더하기만 한다** (파괴 없음 · 멱등 델타)

`maps.view_mode`('edit' | 'dashboard')와 `maps.refresh_interval_seconds` 는
**이미 있다**(지금은 아무도 쓰지 않는다 — 코드 확인). 새로 더하는 것은 표 둘:

```sql
-- 값: (맵, 노드) 한 칸에 현재 값 하나
CREATE TABLE IF NOT EXISTS public.dashboard_values (
    map_id      UUID NOT NULL REFERENCES public.maps(id) ON DELETE CASCADE,
    node_id     VARCHAR(100) NOT NULL,
    value       TEXT NOT NULL CHECK (char_length(value) <= 500),
    value_type  VARCHAR(10) NOT NULL DEFAULT 'text',  -- 'text' | 'number'
    unit        VARCHAR(20),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by  VARCHAR(60) NOT NULL,                 -- 'user:<uuid>' | 'key:<prefix>'
    PRIMARY KEY (map_id, node_id)
);
CREATE INDEX IF NOT EXISTS dashboard_values_recent_idx
    ON public.dashboard_values (map_id, updated_at DESC);

-- 맵별 열쇠: 원문은 두지 않는다 (api_tokens 와 같은 규칙)
CREATE TABLE IF NOT EXISTS public.dashboard_keys (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    map_id       UUID NOT NULL REFERENCES public.maps(id) ON DELETE CASCADE,
    name         VARCHAR(60) NOT NULL,
    token_hash   CHAR(64) NOT NULL UNIQUE,     -- sha256(원문)
    prefix       VARCHAR(20) NOT NULL,         -- 'emd_a1b2c3d4'
    created_by   UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at TIMESTAMPTZ,                  -- 하루 한 번만 갱신
    revoked_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS dashboard_keys_map_idx ON public.dashboard_keys (map_id);
```

- 두 표는 **pro 의 델타**로 둔다(유료 기능의 표 — "자기 경로·자기 표까지",
  `pro.module.ts`). 코어의 `schema.sql` 은 손대지 않는다.
- 맵을 지우면 값·열쇠도 함께 지워진다(CASCADE) — 휴지통(soft-delete)에서는 남는다.
- 코드는 `tableReady('public.dashboard_values')` 로 표 유무를 먼저 본다 —
  델타를 적용하기 전에 배포돼도 **앱이 죽지 않고** 대시보드 기능만 "준비 중"이
  된다(이 저장소의 기존 규칙).

---

## 7. API

코어가 갖는 것(규칙 — 공개):

| 메서드 · 경로 | 무엇 |
|---|---|
| `PATCH /v1/maps/:id` `{viewMode:'dashboard'\|'edit'}` | **이미 있다.** 가드를 더한다 — 주인만, `dashboard` 로는 pro 의 `dashboard` 기능이 켜져 있을 때만, 공개 중 퍼블리싱·협업맵·중복 노드 ID 거절(409 + `code`) |
| `GET /v1/maps/:id/document` | 응답에 `dashboard: boolean` 을 더한다 |
| `GET /v1/maps` (문서함) | 행에 `viewMode` 를 더한다 |
| `saveDocument` | `view_mode='dashboard'` 면 403 `DASHBOARD_LOCKED` |

pro 가 갖는 것(알맹이 — 비공개, pro 모듈이 자기 경로로 등록):

| 메서드 · 경로 | 인증 | 무엇 |
|---|---|---|
| `GET /v1/maps/:id/dashboard/values?since=<iso>` | 로그인(읽기 권한) · 그 맵의 열쇠 | `{values:[{nodeId,value,type,unit,updatedAt,updatedBy}], serverTime}` — `since` 가 있으면 그 뒤에 바뀐 것만 |
| `GET /v1/maps/:id/dashboard/nodes` | 〃 | 노드 ID·경로·현재 값 목록(= [노드 ID 목록 내려받기]) |
| `PUT /v1/maps/:id/dashboard/values` | 로그인(주인) · 그 맵의 열쇠 | `{values:[{nodeId,value,type?,unit?}]}` → `{updated, unknown:[nodeId…]}`. **있으면 고치고 없으면 넣는다**(UPSERT) |
| `DELETE /v1/maps/:id/dashboard/values/:nodeId` | 〃 | 값 지우기 |
| `POST /v1/maps/:id/dashboard/keys` `{name}` | 로그인(주인) | `{id, key, prefix}` — `key` 는 이때 한 번만 |
| `GET /v1/maps/:id/dashboard/keys` | 〃 | 목록(원문 없음) |
| `DELETE /v1/maps/:id/dashboard/keys/:keyId` | 〃 | 폐기(`revoked_at`) |

열쇠 인증: `Authorization: Bearer emd_…`. `emd_`(dashboard)는 MCP 의 `emm_` 과
머리가 달라 **한눈에 구분**되고, 서버도 머리로 갈라 다른 표에서 찾는다.

---

## 8. 화면 구성

**코어(공개) — 자리만** (`open-core-boundary.md` §3.1 ③):

| 자리 | 파일 | pro 가 없으면 |
|---|---|---|
| 문서함 유형 `📊 대시보드맵` | `MapBrowser.tsx` `mapType()` | 그대로 그린다(사실이므로) |
| 읽기 전용으로 열기 + 배너 문구 | `mapSession.ts` | 그대로(잠금은 규칙이다) |
| 전환 단추 | 문서함 행 메뉴 · `MapActions.tsx` → `@pro` 의 `ProDashboardToggle` | 스텁 — "준비 중" 자리 |
| 값 칩 층 | `Canvas.tsx` → `@pro` 의 `ProDashboardOverlay` | 스텁 — 아무것도 그리지 않음 |
| [데이터 연결] 탭 | 인스펙터 → `@pro` 의 `ProDashboardPanel` | 스텁 — 탭 없음 |

**pro(비공개) — 알맹이**: 위 세 컴포넌트, 10초 폴링·깜빡임, 열쇠 관리 창,
`dashboardStore`(값 캐시 `nodeId → value`).

---

## 9. 시험 프로그램 `emm-dash` — R4

Node 18+ 하나로 도는 명령줄 도구, 의존성 없음(`fetch` 만). pro 저장소
`scripts/emm-dash.mjs`.

```bash
export EMM_API=https://api-dev.mindmap.ai.kr
export EMM_DASH_KEY=emd_xxxxxxxxxxxxxxxx          # [이 맵의 열쇠 관리…] 에서 만든 것

node emm-dash.mjs nodes <mapId>                     # 노드 ID · 경로 · 현재 값 표
node emm-dash.mjs set   <mapId> <nodeId> 33500000 --type number --unit 원
node emm-dash.mjs set   <mapId> --file values.json  # [{nodeId,value,type,unit}] 여러 개
node emm-dash.mjs get   <mapId>                     # 현재 값 전부
node emm-dash.mjs demo  <mapId> --every 5           # 숫자 값이 있는 노드를 5초마다 흔든다 — 깜빡임 시험용
```

`set` 은 성공하면 `✅ 1건 갱신 (node-k3f9a2 = 33,500,000 원)`, 모르는 노드면
`❌ 맵에 없는 노드: node-xxxx` 와 종료코드 1 — 스크립트·cron 이 실패를 알 수 있게.

---

## 10. 검증 계획

| 층 | 무엇을 | 어떻게 |
|---|---|---|
| 코어 단위 | `mapType` 우선순위 · 전환 가드(주인·퍼블리싱·협업·중복 ID·pro 꺼짐) · `saveDocument` 403 | 기존 단위 러너 |
| pro 단위 | 값 검증(길이·숫자·단위) · UPSERT · `unknown` 목록 · 열쇠 해시·폐기·다른 맵 거절 | pro 러너 |
| e2e (pro) | **진짜 PostgreSQL + 빌드본 API + 빌드본 화면 + 크로미움**: 전환 → 문서함 배지 → 노드 글자 입력이 안 먹고 저장 403 → 열쇠 발급 → `emm-dash set` → 10초 안에 칩이 바뀌고 깜빡임 → 패널에서 값 저장 → 되돌리기 뒤 편집·값 유지 → 폐기한 열쇠 401 | 기존 e2e 방식. **되돌려 깨지는 것**: 서버 잠금 한 줄을 빼면 저장이 통과하는 것까지 |
| dev 실물 | 사용자와 함께 — 실제 맵을 전환하고 `emm-dash` 로 값 넣기 | 단계별 붙여넣기(복원 리허설 때와 같은 방식) |

유료 기능의 e2e 카탈로그는 pro 저장소에 둔다(`open-core-boundary.md` §3 표).

---

## 11. 단계

**1단계 (이번 개발 — 요청 R1~R4)**

1. 코어: `view_mode` 전환 가드 · `saveDocument` 잠금 · 문서함 유형 · 읽기 전용
   배너 · `@pro` 자리 셋 + 스텁 · 단위 시험
2. pro: 델타(표 둘) · 값·열쇠 API · 값 칩 층 + 10초 폴링 + 깜빡임 ·
   [데이터 연결] 패널 · 열쇠 관리 창 · `emm-dash` · e2e
3. dev 배포(`CORE_SHA`) → 사용자와 실물 시험 → 사용자 가이드 한 장(스크린샷 포함)

**2단계 (필요해지면)**

- 읽기 쉬운 **별칭 키**(`sales.today`) — 노드 ID 대신
- **값 이력**(`dashboard_value_history`) · 칩에 작은 추이선
- **임계값 색**(예: 90% 넘으면 빨강)
- **Push**(WebSocket — v1 부록 A 의 진화 경로) · 폴링 대체
- MCP 도구 `set_dashboard_value` — AI 대화로 값 넣기
- 협업맵·공개(퍼블리싱) 대시보드 · 맵에 없는 값 정리 단추

---

## 12. 결정해 주실 것 — 추천안에 표시(★)

| # | 질문 | 선택지 | 추천 이유 |
|---|---|---|---|
| 1 | 값을 어디에 두나 | ★ 별도 표 `dashboard_values` / 맵 문서 안 노드 글자 | §2 — 문서 통째 재저장·히스토리·잠금 충돌·JSON 수술을 피한다 |
| 2 | 외부 프로그램 인증 | ★ **맵별 열쇠** `emd_…` / MCP 개인 토큰 `emm_…` 재사용 | 센서·ERP 스크립트에 주는 열쇠가 **그 맵의 값만** 만지게. `emm_` 은 내 모든 맵에 닿는다 |
| 3 | 값의 키 | ★ 노드 ID(1단계) + 별칭(2단계) / 처음부터 별칭 | 노드 ID 는 이미 있고 얼어 있으면 안 바뀐다. 별칭은 입력 UI 가 필요하다 |
| 4 | 값 표시 | ★ 노드 옆 칩(레이아웃 밖) / 노드 글자 안 한 줄 | 값이 바뀔 때 맵이 들썩이지 않는다 |
| 5 | 전환 대상 | ★ **단독맵만**(협업맵·공개 중 퍼블리싱 불가) / 모두 | 협업맵은 협업 서버(pro)의 방이 문서를 되돌려 쓴다 — 잠금을 그쪽까지 넓히는 일은 2단계 |
| 6 | 값 이력 | ★ 1단계는 현재 값만 / 처음부터 이력 | 요청은 "넣기·고치기" 다. 이력은 표 하나로 나중에 더할 수 있다 |
| 7 | 자동 갱신 기본값 | ★ 10초 / 30초 / 끄기 | 시험할 때 바로 보인다. 맵마다 바꿀 수 있다 |
| 8 | 코어/pro 경계 | ★ 규칙·자리는 코어, 값·열쇠·화면 알맹이는 pro / 전부 코어 | 2026-08-16 결정("대시보드 맵은 유료") 그대로 |

**승인은 "이대로 진행" 한 마디면 된다.** 다르게 정할 번호만 알려 주시면 그
부분만 고쳐 다시 올린다.

---

## 부록 A. v1 에서 그대로 이어 가는 것

- 갱신 주기 선택지(끄기 · 10초 · 30초 · 1분 · 5분 · 10분)와 `refresh_interval_seconds` 칸
- 바뀐 값 깜빡임(DASH-03) — 2초, 노란 배경
- 폴링 → Redis Pub/Sub + WebSocket Push 진화 경로(채널 `dashboard:{mapId}`) — 2단계
- 권한: 전환·열쇠는 주인만(v1 §8 의 creator)

## 부록 B. v1 원문 요약과 처리

| v1 항목 | 처리 | 이유 |
|---|---|---|
| `PATCH /maps/:id/data` 로 `nodes.text` UPDATE | **폐기** | 원본이 `nodes` 가 아니다(§2) |
| `maps.dashboard_api_key_encrypted`(맵당 열쇠 하나, 암호화 보관) | **바뀜** → `dashboard_keys` 표(여럿, 해시 보관) | 원문을 다시 보여 줄 필요가 없으면 암호화보다 해시가 안전하다. 연동마다 따로 폐기할 수 있어야 한다 |
| `node_type = 'data-live'` | **보류** | 1단계는 "값이 있으면 칩"으로 충분하다 |
| `field_registry` · 대시보드 웹앱(노드 텍스트·색 편집) | **보류** | 요청 범위 밖이고 `nodes` 전제다. 표는 코어 `schema.sql` 에 남아 있으나 아무도 쓰지 않는다 |
| DASH-01~05 기능 번호 | 유지 | 01 전환 · 02 자동 갱신 · 03 깜빡임 · 04 주기 · 05 외부 API(= 이번 §7 pro 경로) |

v1 전문은 git 이력에 있다(이 파일의 2026-04-16 판).
