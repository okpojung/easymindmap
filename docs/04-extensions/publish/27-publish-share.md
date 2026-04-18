# 27. Publish / Share
## PUBLISH_SHARE

* 문서 버전: v1.0
* 작성일: 2026-04-16
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
GET /p/{publishId}  (비인증 접근)
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
PATCH /maps/{mapId}/publish { action: 'unpublish' }
    │
    ▼
published_maps.unpublished_at = NOW()
    │
    ▼
이후 /p/{publishId} 접근 → 404 반환
```

---

### 6. 규칙 (Rule)

* `publish_id`: 랜덤 영숫자 8~12자 (URL-safe)
* 공개 뷰: 인증 불필요 (Anonymous 접근)
* 공개 뷰: 읽기 전용 — 편집, 노드 추가/수정/삭제 불가
* 게시 취소 즉시 URL 무효화 (CDN 캐시 고려 시 최대 5분)
* 동일 맵에 다수의 publish_id 생성 가능 (이전 링크 유지 목적)

> **MVP 정책**: MVP 단계에서는 맵 1개당 활성(active) 공개 링크를 **1개**로 제한한다. 새 링크를 생성하면 기존 활성 링크는 자동으로 `unpublished_at = NOW()`로 무효화된다. 다중 활성 링크 지원(이전 링크 유지)은 V2 이후 기능으로 분리한다.

---

### 7. 예외 / 경계 (Edge Case)

* **게시 취소된 URL 접근**: 404 "페이지를 찾을 수 없습니다" 안내
* **맵 삭제 시**: `published_maps` CASCADE 삭제 → URL 자동 무효화
* **대형 맵 공개 뷰**: 공개 뷰도 동일한 lazy loading 적용

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

* `POST /maps/{mapId}/publish` — 게시 (publish_id 생성)
* `PATCH /maps/{mapId}/publish` — 게시 취소
* `GET /p/{publishId}` — 공개 맵 뷰 (비인증)
* `GET /maps/{mapId}/publish-status` — 게시 상태 조회

---

### 11. 연관 기능

* COLLABORATION (`25-map-collaboration.md`)
* DASHBOARD (`22-dashboard.md`)

---

### 12. 구현 우선순위

#### MVP
* PUBL-01 맵 게시 (publish_id 생성)
* PUBL-02 게시 취소
* PUBL-03 공개 뷰 렌더링
* PUBL-04 링크 복사

#### 2단계
* 비밀번호 보호 게시
* 임베드 코드 생성 (`<iframe>` 지원)
