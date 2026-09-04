# 27. Publish / Share

> ✅ **1단계 구현됨** (2026-09-04, PUBL-01~04). 무료 게시 — 링크를 가진 사람이 로그인 없이 **읽기 전용**으로 본다.
> 서버는 `apps/api/src/publish/`, 화면은 `apps/frontend/src/pages/PublicMapPage.tsx` 와 `components/cloud/PublishPanel.tsx` 다.
> 비밀번호 보호·임베드는 여전히 2단계다(§12).

> **유료 게시**(수수료·정산·미리보기)는 [`27a-paid-publish.md`](27a-paid-publish.md) 다. 이 문서의 `published_maps` 와 공개 URL 을 그대로 쓰고 그 위에 값을 매긴다.

## PUBLISH_SHARE

* 문서 버전: v2.0
* 작성일: 2026-04-16
* 최종 업데이트: 2026-09-04
* 변경 이력:
  * v2.0 — **1단계 구현**. 게시는 멱등(§6), 공개 사진 경로 추가(§10), 게시 취소 흐름을 `DELETE` 로 현행화(§5.3), 구현 위치·제약(§13) 추가
  * v1.1 — API 경로를 `api-spec.md` v2.3 기준으로 통일: `GET /p/{publishId}` → `GET /published/{publishId}`, `PATCH` → `DELETE` (IMP-002 정합성 보정)
* 참조: `docs/01-product/functional-spec.md`, `docs/02-domain/db-schema.md § published_maps`

---

### 1. 기능 목적

* 맵을 **공개 URL로 게시하여 로그인 없이 읽기 전용 접근**을 허용하는 기능
* 외부 공유, 프레젠테이션, 포트폴리오 게시 등에 활용
* 언제든 게시 취소 가능 (URL 즉시 무효화)

---

### 2. 기능 범위

* 포함:
  * 공개 URL 게시 (PUBL-01)
  * 게시 취소 (PUBL-02)
  * 공개 맵 읽기 전용 뷰 (PUBL-03)
  * 공유 링크 복사 (PUBL-04)

* 제외:
  * 비밀번호 보호 게시 (후순위)
  * 도메인 커스텀 (후순위)
  * 임베드 코드 생성 (후순위)
  * 협업자 초대 (→ `25-map-collaboration.md`)

---

### 3. 세부 기능 목록

| 기능ID    | 기능명           | 설명                              | 주요 동작           |
| ------- | ------------- | ------------------------------- | --------------- |
| PUBL-01 | 맵 게시          | 공개 URL 생성 및 게시                   | publish_id 생성   |
| PUBL-02 | 게시 취소         | 공개 URL 무효화 (unpublished_at 설정)  | 접근 차단           |
| PUBL-03 | 공개 뷰 렌더링      | 비인증 사용자 읽기 전용 맵 표시               | 공개 뷰 로딩         |
| PUBL-04 | 공유 링크 복사      | 클립보드에 공개 URL 복사                  | Copy 버튼         |

---

### 4. 기능 정의 (What)

#### 4.1 published_maps 테이블

```sql
CREATE TABLE public.published_maps (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  map_id          UUID NOT NULL REFERENCES public.maps(id) ON DELETE CASCADE,
  publish_id      VARCHAR(20) UNIQUE NOT NULL,   -- URL slug (랜덤 8~12자)
  storage_path    VARCHAR(500),                  -- Supabase Storage 경로 (선택)
  published_at    TIMESTAMPTZ DEFAULT NOW(),
  unpublished_at  TIMESTAMPTZ                    -- NULL = 현재 게시 중
);

CREATE INDEX idx_published_maps_publish_id
  ON public.published_maps(publish_id);
```

#### 4.2 공개 URL 구조

```
https://easymindmap.com/p/{publish_id}

예시: https://easymindmap.com/p/xK9mR3qT
```

#### 4.3 게시 상태 확인 로직

```typescript
// 유효한 게시 여부
const isPublished = (pm: PublishedMap): boolean =>
  pm.unpublished_at === null;
```

#### 4.4 공개 뷰 UI

```text
┌──────────────────────────────────────────────────────┐
│  easymindmap                               [로그인]   │
├──────────────────────────────────────────────────────┤
│                                                      │
│       [맵 타이틀]               [공유하기 🔗]          │
│                                                      │
│            (읽기 전용 마인드맵 렌더링)                   │
│                                                      │
│       Zoom: Ctrl+휠  |  Pan: Space+드래그              │
│                                                      │
└──────────────────────────────────────────────────────┘
```

---

### 5. 동작 방식 (How)

#### 5.1 사용자 동작

* 맵 공유 > `공개 링크 생성` 클릭
* `publish_id` 생성 → 공개 URL 표시
* `[링크 복사]` 버튼으로 클립보드 복사
* 게시 취소: 공유 설정 > `게시 취소` → `unpublished_at` 설정 → URL 즉시 차단

#### 5.2 공개 맵 로딩 흐름

```
GET /published/{publishId}  (비인증 접근)
    │
    ▼
published_maps 조회 (publish_id = publishId, unpublished_at IS NULL)
  ├─ NOT FOUND / unpublished → 404 페이지
  └─ FOUND
         │
         ▼
    map + nodes 조회 (RLS: published 맵은 anonymous 읽기 허용)
         │
         ▼
    읽기 전용 뷰 렌더링 (편집 UI 비활성)
```

#### 5.3 게시 취소 흐름

```
DELETE /maps/{mapId}/publish
    │
    ▼
published_maps.unpublished_at = NOW()   (활성 행 전부)
    │
    ▼
이후 /published/{publishId} 접근 → 404
       그 맵의 공개 사진 주소도 함께 404
```

이미 취소돼 있어도 **성공(204)** 이다. 취소는 상태를 맞추는 일이지 한 번만
할 수 있는 일이 아니다.

#### 5.4 공개 화면이 그리는 방식 — **내보내기 뷰어를 그대로 쓴다**

```
GET /published/{publishId}  →  { title, doc, publishedAt }
    │                           doc = 저장 스냅샷 { v, map, editor }
    ▼
map 안의 서버 첨부 주소를 **공개 주소로 바꾼다**
    /v1/attachments/{id}  →  /v1/published/{publishId}/attachments/{id}
    ▼
buildStandaloneHtml(map, …)  — Standalone HTML 내보내기와 **같은 함수**
    ▼
<iframe srcDoc sandbox="allow-scripts allow-popups …">
```

**에디터(`Canvas`)를 읽기 전용 모드로 재사용하지 않았다.** Canvas 는 문서
스토어와 깊게 얽혀 있어 "읽기 전용" 이 플래그 하나로 지켜지는 성질이
아니다 — 저장·자동저장·잠금 경로가 하나라도 남으면 남의 맵을 고칠 수 있게
된다. 뷰어에는 **애초에 그 코드가 실려 있지 않다.**

`sandbox` 에 `allow-same-origin` 을 주지 않는다. 남이 쓴 글이 데이터로
박히는 화면이므로, 무슨 일이 있어도 우리 오리진에 닿지 못하게 한다.

---

### 6. 규칙 (Rule)

* `publish_id`: 랜덤 영숫자 8~12자 (URL-safe)
* 공개 뷰: 인증 불필요 (Anonymous 접근)
* 공개 뷰: 읽기 전용 — 편집, 노드 추가/수정/삭제 불가
* 게시 취소 즉시 URL 무효화 (CDN 캐시 고려 시 최대 5분)
* 동일 맵에 다수의 publish_id 생성 가능 (이전 링크 유지 목적 — V2)

> **1단계 정책**: 맵 1개당 활성(active) 공개 링크는 **1개**다. 다중 활성
> 링크(이전 링크 유지)는 V2 이후로 분리한다.
>
> ★ **`POST /publish` 는 멱등이다** (2026-09-04 구현 시 결정). 이미 게시
> 중이면 **그 링크를 그대로 돌려준다.** 부를 때마다 새 링크를 뽑으면
> 버튼을 두 번 누른 것만으로 **이미 남에게 보낸 링크가 조용히 죽는다.**
> 링크를 새로 뽑는 것은 "지금 링크를 죽이겠다"는 별개의 결정이라, 필요해질
> 때 별도 요청으로 만든다. (게시 취소 후 다시 게시하면 새 링크가 나온다 —
> 그때는 사용자가 죽이는 것을 이미 선택했다.)

---

### 7. 예외 / 경계 (Edge Case)

* **게시 취소된 URL 접근**: 404 "페이지를 찾을 수 없습니다" 안내
* **없는 링크 / 취소된 링크 / 지워진 맵**: 셋을 **구분하지 않는다.**
  구분하면 "그런 링크가 있었다"는 사실을 알려 주는 셈이다.
* **슬러그 모양이 아닌 요청**: DB 에 묻지도 않고 400. 공개 경로라 아무나
  두드릴 수 있다.
* **맵 삭제 시**: 우리 삭제는 **soft-delete**(`deleted_at`)라 CASCADE 가
  돌지 않는다 — 조회에서 `m.deleted_at IS NULL` 로 **직접 막는다.**
  이걸 빠뜨리면 휴지통에 있는 맵이 계속 공개된다.
* **게시 표가 없는 서버**(델타 미적용): 게시 기능만 꺼진다.
  상태 조회는 **오류가 아니라 값**(`available:false`)으로 답하고, 화면은
  그 값을 보고 버튼 대신 안내를 보여 준다 — 눌러 보고 나서야 실패를
  만나지 않게. 맵 열기·저장은 그대로 동작한다.
* **대형 맵 공개 뷰**: 스냅샷 하나를 통째로 준다(뷰어가 그린다).

---

### 8. 권한 규칙

| 역할          | 게시 | 게시 취소 | 공개 뷰 접근 |
| ----------- | -- | ----- | -------- |
| creator     | ✅  | ✅     | ✅        |
| editor      | ❌  | ❌     | ✅        |
| viewer      | ❌  | ❌     | ✅        |
| anonymous   | ❌  | ❌     | ✅ (게시 중) |

---

### 9. DB 영향

* `published_maps` — 게시 링크 관리

---

### 10. API 영향

* `POST /maps/{mapId}/publish` — 게시 (**멱등** — 이미 게시 중이면 그 링크)
* `DELETE /maps/{mapId}/publish` — 게시 취소 (unpublished_at 설정, 멱등)
* `GET /maps/{mapId}/publish-status` — 게시 상태 조회
* `GET /published/{publishId}` — 공개 맵 데이터 조회 (**비인증**)
* `PUT /maps/{mapId}/publish/preview` — 미리보기 실루엣 올리기 (맵 주인만).
  그림은 **저자의 브라우저가 만든다** — `27a-paid-publish.md` §2
* `GET /published/{publishId}/preview.png` — 미리보기 실루엣 (**비인증**).
  링크 카드·목록 썸네일이 이 주소를 쓴다
* `GET /published/{publishId}/attachments/{attachmentId}` — 공개된 맵의
  사진·첨부 (**비인증**). 이 문이 없으면 공개된 맵은 **사진 자리마다 깨진
  채로** 열린다 — 사진은 대부분 서버 저장소에 있고 원래 주소는 인증을
  요구한다. 여는 조건은 좁다: 그 첨부가 **그 맵의 것**이고, 그 맵이
  **지금 그 링크로 공개 중**이며, 휴지통에 있지 않아야 한다.

> **경로 정리**: 라우팅 레벨에서는 `/p/{publishId}` 단축 형태를 사용할 수 있으나, **API 엔드포인트 기준은 `GET /published/{publishId}`로 통일**한다. (`api-spec.md` v2.3 §8 기준)

---

### 11. 연관 기능

* COLLABORATION (`25-map-collaboration.md`)
* DASHBOARD (`22-dashboard.md`)

---

### 12. 구현 우선순위

#### 1단계 (V1)
* PUBL-01 맵 게시 (publish_id 생성)
* PUBL-02 게시 취소
* PUBL-03 공개 뷰 렌더링
* PUBL-04 링크 복사

#### 2단계
* 비밀번호 보호 게시
* 임베드 코드 생성 (`<iframe>` 지원)
* 다중 활성 링크(이전 링크 유지)

---

### 13. 구현 위치와 남은 제약 (2026-09-04)

| | 자리 |
|---|---|
| 서버 | `apps/api/src/publish/` (`publish.service.ts` · `publish.controller.ts`) |
| 공개 첨부 | `attachments.service.ts` `openPublished()` |
| 표 유무 판정 | `apps/api/src/common/table-ready.ts` (`map-access.ts` 와 **같은 자리**) |
| 공유 대화상자 | `apps/frontend/src/components/cloud/PublishPanel.tsx` |
| 공개 화면 | `apps/frontend/src/pages/PublicMapPage.tsx` · 라우팅은 `main.tsx` |
| 미리보기 실루엣 | `apps/frontend/src/export/silhouette.ts` (27a §2) |
| 문서함의 공개 표시 | `components/cloud/MapBrowser.tsx` — `🌐 공개 중` 배지 |

남은 제약 — **지금은 이렇게 동작한다**는 사실이지 버그가 아니다.

* **검색엔진 대비가 없다.** `<meta>` · Open Graph · `robots.txt` 를 넣지
  않았다. 링크를 붙여넣어도 미리보기 카드가 뜨지 않고, 크롤러가 본문을
  읽지도 못한다(내용은 브라우저가 그린다).
  **카드에 넣을 이미지는 준비됐다**(`preview.png`, 2026-09-05) — 남은 것은
  `/p/*` 에 맵마다 다른 `<head>` 를 내주는 자리다. 지금은 nginx 가 모든
  주소에 `index.html` 하나를 준다(실측: 크롤러가 받는 `<title>` 이 모든
  맵에서 `EasyMindMap · Editor` 다). 네이버는 자바스크립트를 실행해 제목을
  읽어 가지만, 카카오톡·슬랙 등 대부분은 원본 HTML 만 읽는다.
* **조회수·방문자 통계가 없다.**
* **유효기간이 없다.** 링크는 저자가 [공개 중단] 을 누를 때까지 산다.
  기간을 두는 대신 **문서함이 공개 중인 맵을 늘 보여 주는 쪽**을 골랐다
  (PUBL-05) — "잊고 공개해 둔다" 는 문제는 만료가 아니라 **보이지 않음**
  에서 왔기 때문이다. 필요해지면 `expires_at` 한 칸을 더하고 조회에
  조건 하나를 붙이면 된다(워커 없이 된다).
* **공개 화면에 "이 맵 복제하기" 가 없다.** 보는 것뿐이다.
* **CDN 캐시를 쓰지 않는다** — 게시 취소가 곧바로 반영된다(§6 의 "최대
  5분" 은 CDN 을 끼웠을 때의 이야기다).
