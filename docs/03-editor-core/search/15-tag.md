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

---

### 13. Bulk Tagging (일괄 태깅)

여러 노드에 동시에 태그를 추가하거나 제거하는 기능이다.

#### 13.1 지원 대상

| 대상              | 설명                               |
| --------------- | -------------------------------- |
| 다중 선택 노드        | 캔버스에서 복수 노드를 선택한 상태에서 태그 일괄 추가/제거 |
| 선택 Subtree 전체   | 특정 노드를 루트로 하는 하위 트리 전체에 일괄 태깅   |
| 태그 필터 결과 전체     | 현재 태그 필터로 표시된 노드 전체에 일괄 태깅      |

#### 13.2 동작 흐름

```
사용자: 다중 노드 선택 (Shift+클릭 또는 드래그 선택)
    │
    ▼
컨텍스트 메뉴 또는 Right Panel > "선택 노드에 태그 추가"
    │
    ▼
태그 팝업 → 태그 선택 또는 신규 입력
    │
    ▼
POST /maps/{mapId}/bulk-tag
  {
    "nodeIds": ["node_001", "node_002", "node_003"],
    "tagId": "tag_ai",
    "op": "add"   // "add" | "remove"
  }
    │
    ▼
node_tags 대상 노드 수만큼 INSERT (ON CONFLICT DO NOTHING)
```

#### 13.3 Subtree 일괄 태깅

```typescript
// 서버: subtree 노드 ID 재귀 조회 후 일괄 태깅
POST /nodes/{rootNodeId}/subtree-tag
{
  "tagId": "tag_research",
  "op": "add"
}
```

* 루트 노드 포함, 재귀적으로 모든 하위 노드에 태그 적용
* 이미 태그가 있는 노드는 중복 추가 없이 스킵 (`ON CONFLICT DO NOTHING`)

#### 13.4 필터 결과 일괄 태깅

```typescript
// 현재 필터 조건을 서버에 전달하여 매칭 노드 전체 태깅
POST /maps/{mapId}/filter-tag
{
  "filterQuery": "tag:AI -tag:done",
  "tagId": "tag_important",
  "op": "add"
}
```

#### 13.5 Undo/Redo 연동

* Bulk tagging 작업은 **단일 Transaction**으로 History에 기록
* Undo 시 전체 대상 노드의 태그가 일괄 취소됨

```typescript
beginTransaction('일괄 태깅')
nodeIds.forEach(nodeId => addToTransaction({ op: 'addTag', nodeId, tagId }))
commitTransaction()
```

#### 13.6 구현 우선순위

* MVP: 제외 (단일 노드 태깅 우선)
* Phase 3: 다중 노드, Subtree, 필터 결과 순으로 구현

---

### 14. Tag Merge (태그 병합)

유사하거나 중복된 태그를 하나의 태그로 통합하는 기능이다.

#### 14.1 목적

사용자가 `ai`, `AI`, `A.I.` 등 같은 개념을 다양한 표기로 입력한 경우, 하나의 정규 태그(`AI`)로 병합하여 일관성을 확보한다.

#### 14.2 UI 진입 경로

* 태그 탐색기(Tag Explorer) > 태그 우클릭 > `병합(Merge)`
* 태그 관리 페이지 > 태그 선택 > `병합`

#### 14.3 병합 흐름

```
1. 사용자: 병합할 소스 태그 선택 (ai, A.I.)
2. 사용자: 대상(타깃) 태그 선택 (AI)
3. 확인 다이얼로그: "N개 노드의 태그가 AI로 통합됩니다."
4. POST /tags/merge
   {
     "sourceTagIds": ["tag_ai_lower", "tag_ai_dot"],
     "targetTagId": "tag_ai"
   }
5. 서버 처리:
   a. node_tags에서 sourceTagId → targetTagId로 교체 (중복 제거)
   b. source tags 레코드 삭제
6. Tag Explorer 즉시 갱신
```

#### 14.4 API

```
POST /tags/merge

Request:
{
  "sourceTagIds": ["tag_ai_old", "tag_ai_legacy"],
  "targetTagId": "tag_ai"
}

Response:
{
  "mergedCount": 2,          // 병합된 소스 태그 수
  "affectedNodes": 17        // 태그가 교체된 노드 수
}
```

#### 14.5 규칙

* 소스 태그와 타깃 태그가 동일하면 오류 반환
* 병합 후 소스 태그 레코드는 완전 삭제
* 노드에 소스·타깃이 모두 있는 경우: 타깃 태그 유지, 소스만 제거 (중복 없음)
* 병합은 **Undo 불가** (데이터 변환 작업이므로 History 제외) — 사전 확인 다이얼로그 필수

#### 14.6 구현 우선순위

* MVP: 제외
* Phase 3: Tag Explorer Merge UI + API 구현

---

### 15. 태그 자동완성 UX

태그 입력 팝업에서 사용자가 텍스트를 입력할 때 후보 태그를 추천하는 기능이다.

#### 15.1 추천 순서

| 우선순위 | 조건                | 설명                     |
| ---- | ----------------- | ---------------------- |
| 1    | 정확 일치             | 입력값과 정확히 동일한 태그를 최상단 배치 |
| 2    | Prefix 일치 (최근 사용) | 입력값으로 시작하는 태그 중 최근 사용 태그 우선 |
| 3    | Prefix 일치 (사용 빈도) | 나머지 prefix 일치 태그를 사용 빈도 내림차순 |
| 4    | 신규 태그 생성 옵션      | 입력값으로 신규 태그 생성 선택지 표시  |

```
사용자 입력: "Res"

자동완성 후보 (순서):
  1. Research   ← prefix 일치, 최근 사용
  2. Resources  ← prefix 일치, 빈도 2위
  3. + "Res" 태그 신규 생성
```

#### 15.2 자동완성 트리거 조건

* 태그 입력창 포커스 시 최근 사용 태그 즉시 표시 (입력 없어도)
* 1자 이상 입력 시 prefix 검색 활성화
* 입력값이 없으면: 최근 사용 태그 최대 5개 표시

#### 15.3 최근 사용 태그 정의

* 현재 편집 세션에서 가장 최근에 추가한 태그
* 없으면: 워크스페이스 내 가장 많이 사용된 태그 순

#### 15.4 대소문자 처리

* 자동완성 검색은 대소문자 무시 (case-insensitive prefix match)
* 표시는 원본 `name` 그대로 표시 (예: `AI`, `Research`)
* 내부 검색 키: `normalizedName` (소문자 변환 필드)

```sql
-- tags 테이블에 normalizedName 필드 필요
ALTER TABLE public.tags ADD COLUMN normalized_name VARCHAR(50) NOT NULL;
-- 인덱스: (workspace_id, normalized_name)
```

#### 15.5 클라이언트 구현 참고

```typescript
function getAutocompleteSuggestions(
  input: string,
  allTags: Tag[],
  recentTagIds: string[]
): Tag[] {
  const normalized = input.toLowerCase();

  const exactMatch = allTags.filter(t => t.normalizedName === normalized);
  const prefixMatch = allTags.filter(
    t => t.normalizedName.startsWith(normalized) && t.normalizedName !== normalized
  );

  // 최근 사용 태그 우선 정렬
  const sortByRecent = (tags: Tag[]) =>
    [...tags].sort((a, b) => {
      const aIdx = recentTagIds.indexOf(a.id);
      const bIdx = recentTagIds.indexOf(b.id);
      if (aIdx === -1 && bIdx === -1) return b.usageCount - a.usageCount;
      if (aIdx === -1) return 1;
      if (bIdx === -1) return -1;
      return aIdx - bIdx;
    });

  return [...exactMatch, ...sortByRecent(prefixMatch)];
}
```

#### 15.6 구현 우선순위

* MVP: 기본 prefix 자동완성 (사용 빈도 정렬)
* Phase 2: 최근 사용 태그 우선 + 정확 일치 최상단 배치

---

### 16. tags 테이블 normalizedName 필드

`tag-system.md`에서 정의된 태그 엔터티는 `normalizedName` 필드를 포함한다. 이 필드는 대소문자 구분 없는 중복 방지 및 자동완성 검색에 사용된다.

```sql
CREATE TABLE public.tags (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id        UUID REFERENCES public.users(id) ON DELETE CASCADE,
  workspace_id    UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name            VARCHAR(50) NOT NULL,
  normalized_name VARCHAR(50) NOT NULL,   -- 소문자 변환 (중복 방지·검색용)
  color           VARCHAR(7) NOT NULL DEFAULT '#6B7280',
  description     TEXT,
  created_by      UUID REFERENCES public.users(id),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (owner_id, normalized_name),
  UNIQUE (workspace_id, normalized_name)
);

-- 자동완성 검색용 인덱스
CREATE INDEX ON public.tags (workspace_id, normalized_name);
CREATE INDEX ON public.node_tags (tag_id);
CREATE INDEX ON public.node_tags (node_id);
```

중복 규칙:
* `AI`, `ai`, `Ai` 는 모두 `normalized_name = 'ai'` → 동일 태그로 간주
* 워크스페이스 내에서 `normalized_name` 기준 UNIQUE 제약
* 태그 생성 시 `normalized_name = name.toLowerCase()` 자동 설정
