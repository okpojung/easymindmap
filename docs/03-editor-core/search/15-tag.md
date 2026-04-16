# 15. Tag
## TAG

* 문서 버전: v1.0
* 작성일: 2026-04-16
* 참조: `docs/01-product/functional-spec.md § TAG`, `docs/02-domain/db-schema.md`

---

### 1. 기능 목적

* 노드에 **색상 태그**를 부착하여 분류·필터·탐색을 용이하게 하는 기능
* 태그 탐색기(Tag Explorer)로 특정 태그가 붙은 노드 즉시 확인
* 사용자 개인 태그 및 워크스페이스 공유 태그 관리

---

### 2. 기능 범위

* 포함:
  * 태그 생성 / 수정 / 삭제
  * 노드에 태그 추가 / 제거
  * 태그 탐색기 (Tag Explorer) — 태그별 노드 목록
  * 태그 필터 — 특정 태그 노드만 표시
  * 태그 색상 지정

* 제외:
  * 태그 기반 검색 (→ SEARCH, `16-search.md`)

---

### 3. 세부 기능 목록

| 기능ID  | 기능명     | 설명                    | 주요 동작        |
| ------ | -------- | --------------------- | ------------ |
| TAG-01 | 태그 추가    | 노드에 태그 부착             | 컨텍스트 메뉴 / 패널 |
| TAG-02 | 태그 제거    | 노드에서 태그 제거            | 배지 × 클릭      |
| TAG-03 | 태그 탐색기   | 태그별 노드 목록 조회          | 사이드바 패널      |
| TAG-04 | 태그 필터    | 특정 태그 노드만 캔버스 표시      | 필터 토글        |
| TAG-05 | 태그 생성    | 이름 + 색상으로 태그 신규 생성    | 태그 관리 UI     |
| TAG-06 | 태그 수정    | 태그 이름 / 색상 변경         | 태그 관리 UI     |
| TAG-07 | 태그 삭제    | 태그 삭제 (노드에서도 일괄 제거)   | 확인 다이얼로그     |
| TAG-08 | 태그 색상    | 태그에 색상 지정             | 색상 피커        |

---

### 4. 기능 정의 (What)

#### 4.1 tags / node_tags 테이블

```sql
CREATE TABLE public.tags (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id     UUID REFERENCES public.users(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name         VARCHAR(50) NOT NULL,
  color        VARCHAR(7) NOT NULL DEFAULT '#6B7280',
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (owner_id, name),
  UNIQUE (workspace_id, name)
);

CREATE TABLE public.node_tags (
  node_id UUID REFERENCES public.nodes(id) ON DELETE CASCADE,
  tag_id  UUID REFERENCES public.tags(id)  ON DELETE CASCADE,
  PRIMARY KEY (node_id, tag_id)
);
```

#### 4.2 태그 표시 예시

```text
노드: "Apache 설치"
태그: [🔴 긴급] [🟢 완료] [🔵 기술]
```

---

### 5. 동작 방식 (How)

#### 5.1 사용자 동작

* 노드 우클릭 > `태그 추가` → 태그 팝업에서 선택 또는 신규 입력
* Right Panel > `태그` 탭 → 태그 추가/제거
* 태그 배지 `×` 클릭 → 태그 제거
* 좌측 사이드바 > `태그 탐색기` → 태그 클릭 시 해당 노드 목록 표시
* 태그 클릭 후 `필터` → 해당 태그 노드만 캔버스에 표시

---

#### 5.2 시스템 처리

* 태그 추가: `POST /nodes/{nodeId}/tags` → `node_tags` INSERT
* 태그 제거: `DELETE /nodes/{nodeId}/tags/{tagId}`
* 태그 탐색기: `GET /maps/{mapId}/tags` → 태그별 노드 집계
* 태그 필터: 클라이언트 사이드 필터링

---

#### 5.3 표시 방식

* 노드 아래 / 우측에 색상 배지로 태그 표시
* 태그 필터 활성 시: 필터 노드 100% 불투명, 나머지 30% 투명도
* `ui_preferences_json.showTagBadge`로 표시/숨김 제어

---

### 6. 규칙 (Rule)

* 태그 이름 최대 50자, owner/workspace 내 중복 불가
* 태그 색상: 7자리 HEX (`#RRGGBB`), 기본값 `#6B7280`
* 태그 삭제 시 연결된 모든 노드에서 CASCADE 제거
* 노드당 태그 최대 20개

---

### 7. 예외 / 경계 (Edge Case)

* **동일 태그 중복 추가**: PRIMARY KEY 제약으로 차단
* **태그 이름 중복**: UNIQUE 제약 위반 → 오류 메시지
* **태그 삭제 시 사용 중**: 확인 다이얼로그 (`N개 노드에 사용 중`) 표시 후 삭제

---

### 8. 권한 규칙

| 역할      | 태그 생성/수정/삭제 | 노드에 추가/제거 | 태그 조회 |
| ------- | ---------- | --------- | ----- |
| creator | ✅          | ✅         | ✅     |
| editor  | ✅ (개인 태그)  | ✅         | ✅     |
| viewer  | ❌          | ❌         | ✅     |

---

### 9. DB 영향

* `tags` — 태그 정의
* `node_tags` — 노드-태그 연결

---

### 10. API 영향

* `GET /tags`, `POST /tags`, `PATCH /tags/{tagId}`, `DELETE /tags/{tagId}`
* `POST /nodes/{nodeId}/tags`, `DELETE /nodes/{nodeId}/tags/{tagId}`
* `GET /maps/{mapId}/tags`

---

### 11. 연관 기능

* SEARCH (`16-search.md`), NODE_EDITING, HISTORY

---

### 12. 구현 우선순위

#### MVP
* 태그 생성/수정/삭제, 노드에 추가/제거, 색상 지정, 배지 표시

#### 2단계
* 태그 탐색기, 태그 필터, 워크스페이스 공유 태그
