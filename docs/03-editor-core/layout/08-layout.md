# 08. Layout
## LAYOUT

* 문서 버전: v1.0
* 작성일: 2026-04-14

> **최종 업데이트:** 2026-08-04 — 코드 대조 감사 반영: 실사용 레이아웃 9종(엔진 8종 + Kanban 보드 렌더러) 기준으로 교정, timeline 추가, Freeform·애니메이션·DB CHECK 등 미구현/폐기 항목 배지, 엣지 규칙을 실구현(부모 layoutType 기준)에 일치

---

### 1. 기능 목적

* 마인드맵의 **노드 배치 방식(레이아웃)**을 정의하고 제어하는 핵심 기능
* **실사용 9종(엔진 8종 + Kanban 보드 렌더러)** 을 지원하며 — 타입 유니언은 정식명+레거시명을 포함 — 루트 노드 또는 Subtree 단위로 독립 적용 가능
* 자동 배치(Auto Layout)와 수동 배치(Freeform — V1+ 예정)를 혼용할 수 있는 구조 제공
* Kanban 보드형 레이아웃은 depth 제한 없이 전환 가능하며, depth 3+ 노드는
  카드 아래 트리(트리·오른쪽 아웃라인)로 표시한다

---

### 2. 기능 범위

* 포함:

  * 실사용 9종 레이아웃 타입 선택 및 전환 (엔진 8종 + Kanban 보드 렌더러)
  * 루트 레이아웃 / Subtree 레이아웃 독립 적용
  * Auto Layout 엔진에 의한 좌표 자동 계산
  * Freeform 수동 배치 (drag & drop) (미구현 — V1+ 예정)
  * Auto ↔ Freeform 전환 정책 (미구현 — V1+ 예정)
  * Kanban 보드형 레이아웃 (depth 제한 없음)
  * 레이아웃 전환 시 애니메이션 (미구현 — 즉시 재배치)

* 제외:

  * 노드 스타일 (→ NODE_STYLE)
  * 노드 콘텐츠 (→ NODE_CONTENT)
  * 캔버스 뷰포트 (→ CANVAS)
  * 히스토리/Undo (→ HISTORY)

---

### 3. 세부 기능 목록

| 기능ID  | 기능명                | 설명                          | 주요 동작              |
| ----- | ------------------ | --------------------------- | ------------------ |
| LT-01 | 레이아웃 타입 선택         | 실사용 9종 레이아웃 선택                 | 좌측 인스펙터 레이아웃 탭            |
| LT-02 | Subtree 레이아웃 override | 특정 노드 이하 독립 레이아웃 지정         | 좌측 인스펙터 레이아웃 탭 — 선택 노드 depth≥1이면 서브트리 적용         |
| LT-03 | Auto Layout 엔진     | 좌표 자동 계산 및 렌더링              | 노드 추가/삭제/이동 시 재계산  |
| LT-04 | Freeform 수동 배치 (V1+ 예정)     | drag & drop으로 노드 위치 수동 지정   | manualPosition 저장 (미구현 — freeform은 radial-right 폴백)  |
| LT-05 | Auto ↔ Freeform 전환 (V1+ 예정) | 두 모드 간 전환 정책 및 좌표 보존        | layoutType 변경      |
| LT-06 | Kanban 레이아웃        | 보드형 구조 (depth 제한 없음, depth 3+는 카드 내 트리) | column/card 관리     |
| LT-07 | 레이아웃 전환 애니메이션 (미구현 — 즉시 재배치)      | 전환 시 부드러운 위치 이동             | CSS transition      |
| LT-08 | 레이아웃 상속            | 하위 노드가 부모 layoutType 상속     | 노드 생성 시 자동 적용      |
| LT-09 | 루트 노드 레이아웃 결정      | 루트의 layoutType이 전체 기본 레이아웃  | 맵 전체 레이아웃 기준       |
| LT-10 | 레이아웃 간격/방향 설정      | 노드 간격(gap), 방향(direction) 설정 | layout_config JSONB |

---

### 4. 기능 정의 (What)

#### 4.1 LayoutType 목록

> 타입 유니언은 정식명+레거시명을 모두 포함하지만, **실사용은 9종**
> (엔진 8종: 방사형 양쪽/오른쪽/왼쪽, 트리 아래/오른쪽, 계층 오른쪽,
> 진행트리 오른쪽, timeline + Kanban 보드 렌더러)이다.

```typescript
type LayoutType =
  | 'radial-bidirectional'   // BL-RD-BI  방사형 양쪽 (기본값)
  | 'radial-right'           // BL-RD-R   방사형 오른쪽
  | 'radial-left'            // BL-RD-L   방사형 왼쪽
  | 'tree-up'                // BL-TR-U   트리형 위 (미구현)
  | 'tree-down'              // BL-TR-D   트리형 아래
  | 'tree-right'             // BL-TR-R   트리형 오른쪽
  | 'tree-left'              // BL-TR-L   트리형 왼쪽 (미구현)
  | 'hierarchy-right'        // BL-HR-R   계층형 오른쪽
  | 'hierarchy-left'         // BL-HR-L   계층형 왼쪽 (미구현)
  | 'process-tree-right'     // BL-PR-R   진행트리 오른쪽
  | 'process-tree-left'      // BL-PR-L   진행트리 왼쪽 (미구현)
  | 'process-tree-right-a'   // BL-PR-RA  (레거시 — process-tree-right로 정규화)
  | 'process-tree-right-b'   // BL-PR-RB  (레거시 — process-tree-right로 정규화)
  | 'timeline'               // BL-TL     시간배치 (타임라인) — §22
  | 'timeline-center'        // BL-TL-C   시간배치 (중앙노드) — §22.1
  | 'freeform'               // BL-FR     자유배치 (V1+ 예정 — 현재 radial-right 폴백)
  | 'kanban';                // BL-KB     Kanban 보드형 (별도 보드 렌더러)
```

#### 4.2 LayoutType ↔ BL 코드 매핑표

| BL 코드   | DB 저장값 (layoutType)    | 한국어 명칭             | 기본값 | 구현 상태 |
| ------- | ---------------------- | ------------------ | --- | --- |
| BL-RD-BI | `radial-bidirectional` | 방사형 양쪽             | ✅   | 구현 |
| BL-RD-R  | `radial-right`         | 방사형 오른쪽            |     | 구현 |
| BL-RD-L  | `radial-left`          | 방사형 왼쪽             |     | 구현 |
| BL-TR-U  | `tree-up`              | 트리형 위              |     | 미구현 |
| BL-TR-D  | `tree-down`            | 트리형 아래             |     | 구현 |
| BL-TR-R  | `tree-right`           | 트리형 오른쪽            |     | 구현 |
| BL-TR-L  | `tree-left`            | 트리형 왼쪽             |     | 미구현 |
| BL-HR-R  | `hierarchy-right`      | 계층형 오른쪽            |     | 구현 |
| BL-HR-L  | `hierarchy-left`       | 계층형 왼쪽             |     | 미구현 |
| BL-PR-R  | `process-tree-right`   | 진행트리 오른쪽           |     | 구현 |
| BL-PR-L  | `process-tree-left`    | 진행트리 왼쪽            |     | 미구현 |
| BL-PR-RA | `process-tree-right-a` | (레거시)              |     | `process-tree-right`로 정규화 |
| BL-PR-RB | `process-tree-right-b` | (레거시)              |     | `process-tree-right`로 정규화 |
| BL-TL    | `timeline`             | 시간배치 (타임라인)        |     | 구현 (§22) |
| BL-TL-C  | `timeline-center`      | 시간배치 (중앙노드)        |     | 구현 (§22.1) |
| BL-FR    | `freeform`             | 자유배치               |     | V1+ 예정 (radial-right 폴백) |
| BL-KB    | `kanban`               | Kanban 보드형         |     | 구현 (보드 렌더러) |

#### 4.3 NodeObject 레이아웃 관련 필드

```typescript
type NodeObject = {
  id: string;
  parentId: string | null;
  depth: number;

  // 레이아웃 타입 — 이 노드 이하 Subtree 전체의 전개 방식 결정
  layoutType: LayoutType;

  // Freeform 전용 수동 좌표 (auto layout에서는 null)
  manualPosition: { x: number; y: number } | null;

  // 접힘 상태 (자식 노드 숨김 여부)
  collapsed: boolean;

  // 클라이언트 전용 계산 좌표 (DB 저장 안 함)
  computedX?: number;
  computedY?: number;
};
```

#### 4.4 맵 레이아웃 설정 (maps 테이블)

```json
{
  "default_layout_type": "radial-bidirectional",
  "layout_config": {
    "nodeSpacing": 40,
    "levelSpacing": 120,
    "direction": "auto"
  }
}
```

---

### 5. 동작 방식 (How)

#### 5.1 사용자 동작

* 좌측 인스펙터 레이아웃 탭에서 실사용 9종 중 선택
* 선택 노드 depth≥1이면 해당 Subtree에 적용 (Subtree override) — 우클릭 메뉴 없음
* Freeform 모드 노드 drag & drop 좌표 수동 저장 (미구현 — V1+ 예정)
* 레이아웃 전환 시 즉시 재배치 (애니메이션 미구현)

---

#### 5.2 시스템 처리

* 루트 노드의 `layoutType`이 전체 맵의 기본 레이아웃 기준
* 하위 노드에서 다른 `layoutType` 지정 시 해당 Subtree만 독립 적용
* 새 노드는 `layoutType` **미지정** 상태로 생성 — 렌더링 시 상위(부모→루트) 상속으로 해석한다 (값 복사 아님)
* 레이아웃 변경 시 Layout Engine이 전체 좌표 재계산 → `computedX/Y` 업데이트
* (V1+ 예정) `freeform` 전환 시: 현재 `computedX/Y` → `manualPosition`에 복사 저장
* (V1+ 예정) auto layout으로 전환 시: `manualPosition = null` → Layout Engine 재계산

---

#### 5.3 표시 방식

* Auto Layout: Layout Engine이 계산한 `computedX/Y` 기준으로 렌더링
* Freeform: `manualPosition` 기준으로 렌더링 (V1+ 예정)
* 레이아웃 전환 시 애니메이션 미구현 — 즉시 재배치

---

### 6. 규칙 (Rule)

---

#### 6.1 레이아웃 타입 규칙

* **DB CHECK 미적용 — 값 검증은 앱에서 수행한다** (`chk_nodes_layout_type` 제약은 스키마에 없음)
* 기본값은 `'radial-bidirectional'`이다

---

#### 6.2 상속 규칙

* 새 노드는 `layoutType` **미지정** 상태로 생성한다 — 값 복사 저장이 아니다
* 렌더링/계산 시 상위(부모→루트) 상속으로 해석한다; 명시적 override가 있는 노드부터 해당 Subtree에 적용된다

---

#### 6.3 Subtree override 규칙

* 특정 노드에 다른 `layoutType`을 지정하면 해당 노드 이하 Subtree 전체에 적용된다
* 상위 노드의 레이아웃 변경이 있어도 override된 Subtree는 유지된다

##### 6.3.1 선택 노드별 허용 레이아웃 (LayoutTab 규칙)

| 선택 상태 | 동작 |
| --- | --- |
| 메인(루트) 노드 선택 또는 선택 없음 | 모든 레이아웃 선택 가능 · 맵 전체에 적용 |
| depth ≥ 1 노드 선택 | 해당 Subtree에 적용 · **메인노드 전용 레이아웃은 비활성 표시** |
| 맵 레이아웃이 `kanban`일 때 (어떤 노드를 선택해도) | 모든 레이아웃 선택 가능 · **항상 맵 전체에 적용** (Kanban에는 Subtree 레이아웃이 없음 — Kanban 탈출 경로) |

* **메인노드 전용 레이아웃**: `radial-bidirectional`(방사형·양쪽),
  `tree-down`(트리·아래), `kanban`, `freeform`.
  (**시간배치 2종은 2026-08-07 에 제한을 풀었다** — 사용자 요청. 고른
  노드가 축의 시작점이 되고 그 자식들이 오른쪽으로 늘어선다.
  `SubtreeStrategy` 의 `timeline`/`timeline-center` case 참조.)
  루트 양쪽/사방으로 가지를 전개하거나(방사형·양쪽, 트리·아래),
  보드 뷰(kanban)·수동 배치(freeform)라서 한쪽에 매달린 Subtree에는
  적용할 수 없다.
* Subtree에 허용되는 레이아웃: `radial-right`, `tree-right`,
  `hierarchy-right`, `process-tree-right`,
  **`timeline`·`timeline-center`**(2026-08-07 추가).
* 별도의 "적용 범위(맵 전체)" 토글은 두지 않는다 — 메인노드 선택이 곧
  맵 전체 적용이다.

#### 방사형·양쪽의 좌/우 배분 규칙 (MVS 수정 — 2026-07)

`radial-bidirectional`은 각 1레벨 가지에 저장된 `side`('left'/'right')로
좌우를 나눈다 (드래그 좌우 이동 지원의 근거 데이터).

- **버그였던 것**: MD 불러오기·새 맵 골격이 모든 가지에 `side:'right'`를
  일괄 기록 → 왼쪽에 배치할 가지가 0개 → 방사형·양쪽을 선택해도
  방사형·오른쪽과 똑같이 보였다. 트리·계층형 등 다른 레이아웃은 side를
  무시하므로 드러나지 않다가 "불러오기 → 양쪽" 조합에서만 나타났다.
- **수정 3중**:
  1. MD 불러오기: 1레벨 가지를 문서 순서대로 **앞 절반 오른쪽 · 뒤
     절반 왼쪽**으로 배분해 저장.
  2. 새 맵 골격(주제 1~3): 앞 절반 오른쪽 · 나머지 왼쪽.
  3. 레이아웃 안전장치(`layoutRadial`): 가지가 2개 이상인데 전부
     한쪽이면(side 일괄 지정된 옛 문서 등) 자동으로 절반씩 배분.
     좌우가 **섞여 있으면 저장된 side를 그대로 존중**한다 — 사용자가
     드래그로 옮긴 배치는 뒤엎지 않는다. side 미지정 가지는 오른쪽
     취급(노드가 사라지지 않게).
- 검증: E2E e2e42 — MD 불러오기 후 양쪽 선택 시 좌·우 모두 배치,
  오른쪽 선택 시 전부 오른쪽, 혼합 side 맵은 기존 배치 유지.

---

#### 6.4 루트 노드 레이아웃 규칙

* 루트 노드의 `layoutType`이 전체 맵의 기본 레이아웃을 결정한다
* 루트 노드의 `layoutType` 변경 시 즉시 전체 relayout이 트리거된다

---

#### 6.5 Freeform 규칙 (V1+ 예정 — 현재 freeform은 radial-right 폴백 렌더링, `neverApplies`)

* `layoutType = 'freeform'`일 때만 `manualPosition`이 유효하다
* auto layout 모드에서는 `manualPosition = null`이어야 한다
* auto layout 중 노드 drag 발생 시: 해당 노드만 `freeform`으로 전환 + `manualPosition` 저장
* 부모 노드의 `layoutType` 변경 시 자식 노드의 `manualPosition`은 유지된다 (수동 좌표 보존)

---

#### 6.6 Kanban 레이아웃 규칙

* `layoutType = 'kanban'`일 경우 depth 의미:

  | depth | 역할     |
  | ----- | ------ |
  | 0     | board  |
  | 1     | column |
  | 2     | card   |
  | 3+    | 카드 하위 트리 — 컬럼 안에서 카드 아래에 들여쓰기 + 엘보 연결선(트리·오른쪽 아웃라인)으로 표시 |

* **depth 제한 없음**: 어떤 깊이의 맵이든 Kanban으로 전환할 수 있다
  (기존 3-depth 제한 및 `chk_nodes_kanban_depth` CHECK 제약은 폐기)
* Kanban일 때는 **하위 노드별 Subtree 레이아웃이 존재하지 않는다** —
  어떤 노드를 선택해도 레이아웃 선택은 맵 전체에 적용된다 (§6.3.1)
* Kanban 노드는 `KanbanNodeRole` (`'board' | 'column' | 'card'`) metadata를 가질 수 있다

---

#### 6.7 Auto ↔ Freeform 전환 정책 (V1+ 예정)

| 상황               | 처리                                                |
| ---------------- | ------------------------------------------------- |
| auto → freeform  | 전환 시점의 `computedX/Y`를 `manualPosition`에 복사하여 저장  |
| freeform → auto  | `manualPosition = null` 초기화, Layout Engine 재계산   |
| auto 중 drag      | 해당 노드만 `freeform`으로 전환 + `manualPosition` 저장     |
| 부모 layoutType 변경 | 자식 노드 `manualPosition` 유지 (수동 지정 좌표 보존)          |

---

#### 6.8 레이아웃 간격 설정 규칙

* **간격은 클라이언트 배율로 관리한다** (`editorUiStore`의 spacingX/Y, 90~200%) — `maps.layout_config` DB 저장은 미구현
* 기본 간격:

  | 항목           | 기본값  | 설명      |
  | ------------ | ---- | ------- |
  | nodeSpacing  | 40px | 형제 노드 간격 |
  | levelSpacing | 120px | 계층 간격   |

##### 6.8.1 MVP 구현 — 간격 배율 슬라이더

* 레이아웃 탭 "간격 · 정렬" 섹션에서 **가로 간격 / 세로 간격** 슬라이더로
  조정한다 (90% ~ 200%, 기본 100%, 초기화 버튼 제공).
* 적용 방식: 레이아웃(서브트리 오버라이드 포함) 계산이 끝난 최종 좌표에
  **루트 위치 기준 축별 배율**을 곱한다. 노드 박스 크기는 유지되고 노드
  사이 거리만 변하며, 모든 레이아웃 타입에 동일하게 동작한다.
* 하한 90%: 그 아래로 줄이면 촘촘한 레이아웃(트리·아래, 진행트리)에서
  노드 겹침이 발생하는 것을 측정으로 확인해 제한한다.
* 자유배치와 구분: 레이아웃 규칙은 그대로 유지된 채 밀도만 조정한다.
  노드별 개별 간격 드래그 조정(manualPosition 보정)은 V1+.

---

#### 6.9 collapsed 규칙

* `collapsed = true`이면 자식 노드는 렌더링하지 않는다
* 루트 노드는 `collapsed` 불가 (비활성화)
* collapsed된 노드는 자식 존재 여부를 indicator로 표시한다

---

### 7. 레이아웃 타입별 특성

#### 7.1 Radial 계열 (방사형)

| 타입                    | 방향            | 특징              |
| --------------------- | ------------- | --------------- |
| `radial-bidirectional` | 루트 중심 양방향     | 기본값, 균형 배치      |
| `radial-right`         | 루트 중심 오른쪽만    | 좌측 여백 활용        |
| `radial-left`          | 루트 중심 왼쪽만     | 우측 여백 활용        |

* 루트 노드를 중심으로 자식 노드가 방사형으로 배치된다
* depth가 깊어질수록 반지름이 증가한다

---

#### 7.2 Tree 계열 (트리형)

| 타입           | 방향   | 특징              |
| ------------ | ---- | --------------- |
| `tree-up`    | 위 방향 | 루트가 아래, 자식이 위   |
| `tree-down`  | 아래 방향 | 루트가 위, 자식이 아래 (일반 트리) |
| `tree-right` | 오른쪽  | 루트가 왼쪽, 자식이 오른쪽 |
| `tree-left`  | 왼쪽   | 루트가 오른쪽, 자식이 왼쪽 |

* 단방향 전개 구조
* 형제 노드는 수직(좌우 방향) 또는 수평(상하 방향) 나열

---

#### 7.3 Hierarchy 계열 (계층형)

| 타입                | 방향    | 특징                |
| ----------------- | ----- | ----------------- |
| `hierarchy-right` | 오른쪽   | 들여쓰기 계층 강조, org-chart 유사 |
| `hierarchy-left`  | 왼쪽    | 들여쓰기 계층 강조        |

* Tree와 유사하나 형제 노드 정렬 방식이 다르다
* 부모-자식 관계를 시각적으로 강조하는 들여쓰기 구조

---

#### 7.4 Process Tree 계열 (진행트리형)

| 타입                      | 방향          | 특징            |
| ----------------------- | ----------- | ------------- |
| `process-tree-right`    | 오른쪽         | 프로세스 흐름 강조    |
| `process-tree-left`     | 왼쪽          | 프로세스 흐름 강조    |
| `process-tree-right-a`  | 오른쪽 (버블형)   | 노드를 버블 형태로 표시 |
| `process-tree-right-b`  | 오른쪽 (타임라인형) | 시간 흐름 강조      |

* 순차적 프로세스, 업무 흐름 표현에 적합
* 노드 간 연결선이 화살표 형태로 표시될 수 있다

---

#### 7.5 Freeform (자유배치) — V1+ 예정

> 현재는 미구현 — `freeform` 선택 시 radial-right 폴백으로 렌더링되며
> LayoutTab에서 `neverApplies`(선택해도 맵 레이아웃 미변경) 처리된다.

* (예정) 노드 위치를 drag & drop으로 자유롭게 지정
* (예정) `manualPosition: { x, y }`에 좌표 저장
* (예정) Layout Engine이 개입하지 않음
* **메인(루트) 노드에서만 선택 가능** — Subtree 단위 적용 불가
* **선택해도 맵 레이아웃을 변경하지 않는다** — 자유배치는 마인드맵 외에
  순서도·플로차트 등 자유형 문서 작성을 위한 모드로 향후(V1+) 제공 예정

---

#### 7.6 Kanban (칸반 보드형)

```
board (depth 0)
 ├─ column A (depth 1)
 │   ├─ card 1 (depth 2)
 │   └─ card 2 (depth 2)
 └─ column B (depth 1)
     ├─ card 3 (depth 2)
     └─ card 4 (depth 2)
```

* depth 0: 보드 (하나의 맵에 1개)
* depth 1: 칸반 컬럼 (TO DO, IN PROGRESS, DONE 등)
* depth 2: 카드 (업무 항목)
* depth 3 이상: 카드 아래 트리 — 컬럼 안에서 카드 아래에 들여쓰기 +
  엘보 연결선(트리·오른쪽 아웃라인)으로 표시 (제한 없음)

**카드 폭 규칙 (2026-07)**: 컬럼 폭 300px 고정(리치 노드 블록 수용을
위해 260에서 확대). 카드 내용은 컬럼 폭을 절대 넘지 않는다 —
넓은 표/코드 블록은 카드 안 **가로 스크롤**(NodeRichText의 표 래퍼·
`pre overflow-x`), 긴 URL·경로는 `overflow-wrap: anywhere`로 줄바꿈,
카드 컨테이너는 `overflow: hidden`으로 최종 방어. (큰 MD를 불러와
칸반 전환 시 표가 옆 컬럼을 침범하던 문제의 수정 — e2e66)

**스크롤 영역과 카드 드래그 (2026-07)**: 코드/표 스크롤 영역
(`data-html-scroll`)에서는 카드 드래그를 시작하지 않는다 — 스크롤바
조작이 카드 이동으로 오인되던 문제. 보드 전체에 `onDragStart`
preventDefault — 코드 텍스트를 드래그로 선택한 뒤 그 위에서 카드를
끌면 브라우저 **네이티브 텍스트 드래그가 포인터 이벤트를 가로채**
카드 드래그가 먹통이 되는 것을 막는다 (e2e67).

**맵과의 조작 파리티 (2026-07, e2e68)**:
* `Delete` = 선택 카드(서브트리) 삭제, Kanban에서도 동작 — Canvas의
  키 핸들러가 칸반에서는 언마운트되므로 KanbanBoard가 자체 keydown을
  단다. 다중 선택이면 `deleteNodesBulk`(set 1회 = undo 1단계). Esc =
  선택 해제.
* **러버밴드 다중 선택**: 빈 영역(보드/컬럼 배경) 드래그 = 걸친 카드
  전체 다중 선택 (`multiSelectedIds` — 맵과 같은 상태 공유, 스타일
  일괄 적용·일괄 삭제 대상). 카드 클릭 = 단일 선택(다중 해제).
* **노드 지정 색 반영**: 카드/컬럼에 `style.fillColor·borderColor·
  textColor` 적용 — 글자색은 맵과 같은 `styledText`(textColor 지정 →
  그대로, fillColor만 → `readableTextOn`, 없으면 테마색).

---

### 8. 예외 / 경계 (Edge Case)

* **Kanban에서 depth 3+ 노드**: 생성 허용 — 컬럼 안에서 해당 카드 아래
  트리(트리·오른쪽 아웃라인)로 표시
* **레이아웃 전환 중 노드 추가**: 전환 완료 후 신규 노드 배치 계산
* **Freeform에서 노드 삭제 후 재배치**: 삭제된 노드 좌표는 무관, 나머지 노드 위치 유지
* **Subtree override + 부모 레이아웃 변경**: override된 Subtree의 `layoutType`은 유지
* **매우 많은 노드 (1000+)**: Auto Layout 성능 최적화 필요 (가상화, 지연 계산)
* **루트 노드 collapsed 시도**: 무시 (루트는 collapse 불가)
* **단일 노드 맵 (자식 없음)**: 레이아웃 방향 무관, 루트 노드만 중앙 표시
* **circular 참조**: DB `parent_id` 제약으로 방지

---

### 9. 권한 규칙

| 역할      | 권한                  |
| ------- | ------------------- |
| creator | 전체 (레이아웃 타입 변경, 저장) |
| editor  | 레이아웃 변경 가능          |
| viewer  | 읽기 전용               |

---

### 10. DB 영향

* `nodes.layout_type` — VARCHAR(50), **DB CHECK 미적용 — 값 검증은 앱**
* `nodes.manual_position` — JSONB NULL, Freeform 또는 수동 위치 보정 전용 `{ x, y }` (Auto Layout의 computedX/Y는 DB 저장 안 함)
* `nodes.collapsed` — BOOLEAN DEFAULT FALSE
* `maps.default_layout_type` — VARCHAR(50) NOT NULL DEFAULT 'radial-bidirectional'
* `maps.layout_config` — JSONB NULL (nodeSpacing, levelSpacing 등)
* `users.default_layout_type` — VARCHAR(50) DEFAULT 'radial-bidirectional' (사용자 기본값)

DB 제약:

```sql
-- chk_nodes_layout_type: DB CHECK 미적용 — 값 검증은 앱에서 수행
-- chk_nodes_kanban_depth: 해당 제약은 스키마에 없음 (폐기 — v1.1)
```

---

### 11. API 영향

* `PATCH /nodes/{id}/layout` — 특정 노드의 layoutType 변경
* `PATCH /nodes/{id}/position` — freeform 좌표 저장 (manualPosition)
* `PATCH /maps/{id}/layout` — 맵 기본 레이아웃 및 layout_config 변경
* `GET /maps/{id}` — 전체 노드 layoutType 및 manualPosition 포함 반환

---

### 12. 연관 기능

* NODE_CONTENT
* NODE_STYLE
* CANVAS
* HISTORY
* SAVE
* KANBAN (→ kanban 레이아웃 상세)
* WBS (→ wbs 레이아웃 연계)

---

### 13. 예시 시나리오

#### 시나리오 1 — 레이아웃 전체 변경

1. 사용자: 툴바 > 레이아웃 드롭다운 > `tree-down` 선택
2. 시스템: 루트 노드의 `layoutType = 'tree-down'`으로 업데이트
3. Layout Engine: 전체 노드 좌표 재계산
4. 렌더링: 애니메이션으로 노드 위치 이동

#### 시나리오 2 — Subtree override

1. 사용자: 특정 노드 우클릭 > "이 노드부터 레이아웃: hierarchy-right"
2. 시스템: 해당 노드의 `layoutType = 'hierarchy-right'`으로 저장
3. Layout Engine: 해당 Subtree만 `hierarchy-right` 기준으로 재계산
4. 나머지 Subtree: 기존 레이아웃 유지

#### 시나리오 3 — Freeform 전환 후 drag

1. 사용자: `radial-bidirectional` → `freeform` 전환
2. 시스템: 현재 `computedX/Y` → `manualPosition`에 복사
3. 사용자: 노드 drag → 새 위치로 이동
4. 시스템: `manualPosition` 업데이트, autosave

#### 시나리오 4 — Kanban 구성

1. 사용자: 루트 노드 레이아웃 > `kanban` 선택
2. 시스템: 루트 = board (depth 0), 자식 = column (depth 1), 손자 = card (depth 2)
3. depth 3+ 노드: 해당 카드 아래에 들여쓰기 트리로 함께 표시 (생성 제한 없음)
4. 사용자: Kanban 상태에서 하위 노드를 선택하고 다른 레이아웃 클릭
5. 시스템: 맵 전체 레이아웃을 해당 레이아웃으로 변경 (Kanban 탈출)

#### 시나리오 5 — auto layout 중 단일 노드 drag

1. 사용자: `tree-right` 모드에서 특정 노드 drag
2. 시스템: 해당 노드만 `layoutType = 'freeform'`으로 전환
3. `manualPosition` 저장
4. 나머지 노드: `tree-right` auto layout 유지

---

### 14. 구현 우선순위

#### MVP

* `radial-bidirectional` Auto Layout 구현
* Freeform drag & drop 및 `manualPosition` 저장 (V1+로 이월)
* 레이아웃 타입 전환 (전체 맵)
* Kanban 기본 구현 (depth 제한 없음)

#### 2단계

* 나머지 레이아웃 타입 구현
* Subtree override
* 레이아웃 전환 애니메이션
* layout_config (간격/방향) 설정 UI

#### 3단계

* 대용량 노드 성능 최적화 (가상화)
* process-tree-right-a/b 버블형/타임라인형 특수 렌더링
* WBS 연계 레이아웃

---

## 15. 레이아웃 엔진 아키텍처

### 15.1 엔진 구성 요소

> **현재는 `computeLayout()` 단일 전체 계산 — 아래는 목표 설계다.**

Layout Engine은 다음 컴포넌트로 분리된다:

```
LayoutEngine
 ├── StrategyResolver      layoutType → Strategy 선택
 ├── MeasureEngine         노드/subtree 크기 측정 (바텀업)
 ├── ArrangeEngine         strategy 기반 실제 좌표 배치 (탑다운)
 ├── CollisionResolver     bounding box 겹침 해소
 ├── EdgeAnchorResolver    부모/자식 box에서 edge 시작·끝점 계산
 └── BoundsCalculator      전체/부분 bounds 계산 (fit screen, minimap, export)
```

진입점:

```ts
layoutDocument(document, options)   // 전체 맵 레이아웃
layoutSubtree(nodeId, document, options)  // 특정 subtree만 재계산
```

### 15.2 2-Pass 알고리즘

레이아웃 계산은 반드시 2단계를 순서대로 실행한다.

**Pass 1: Measure Pass (바텀업)**

리프 노드부터 루트 방향으로 bounding box를 계산한다. 아직 좌표를 결정하지 않는다.

```ts
type LayoutBox = {
  selfWidth: number
  selfHeight: number
  subtreeWidth: number
  subtreeHeight: number
}

measureNode(node):
  if node.isLeaf:
    node.box = { selfWidth: node.width, selfHeight: node.height,
                 subtreeWidth: node.width, subtreeHeight: node.height }
    return node.box

  childrenBounds = node.children.map(measureNode)
  node.box = calculateSubtreeBounds(childrenBounds, layoutType)
  return node.box
```

Tree-Right 기준 Measure 공식:

```
subtreeWidth  = selfWidth + horizontalGap + max(child.subtreeWidth)
subtreeHeight = max(selfHeight, sum(child.subtreeHeight) + (n-1) * verticalGap)
```

**Pass 2: Arrange Pass (탑다운)**

루트에서 리프 방향으로 실제 좌표를 배정한다.

```ts
arrangeNode(node, parentPos, depth):
  node.computedX = calculateX(node, parentPos, depth)
  node.computedY = calculateY(node, parentPos, depth)
  childOffset = calculateChildStartOffset(node)
  node.children.forEach((child, i) => {
    arrangeNode(child, { x: node.computedX, y: node.computedY }, depth + 1)
  })
```

### 15.3 Layout 옵션 (gap 값)

```ts
type LayoutOptions = {
  horizontalGap: number      // Tree 계열 좌우 간격
  verticalGap: number        // Tree 계열 상하 간격
  radialLevelGap: number     // Radial 계열 레벨당 반지름 증가량
  levelGap: number           // Hierarchy 계층 간격
  siblingGap: number         // Radial 형제 간격
  subtreePadding: number     // subtree bounding box 여백
  minNodeGap: number         // 노드 간 최소 거리 (Hard Constraint)
  processStepGap: number     // ProcessTree step 간격
  kanbanColumnGap: number    // Kanban 컬럼 간격
  kanbanCardGap: number      // Kanban 카드 간격
}
```

권장 기본값 매핑:

| 레이아웃 계열    | 주요 gap 항목                             |
| ---------- | ------------------------------------- |
| Tree       | `horizontalGap`, `verticalGap`        |
| Radial     | `radialLevelGap`, `siblingGap`        |
| Hierarchy  | `levelGap`                            |
| Process    | `processStepGap`                      |
| Kanban     | `kanbanColumnGap`, `kanbanCardGap`    |

---

## 16. 레이아웃별 좌표 계산

### 16.1 Radial — weight 기반 angle allocation

단순 균등 각도 분배가 아니라 **subtree 크기(weight)** 에 비례하여 각도를 할당한다. 큰 subtree에 더 넓은 각도가 주어지므로 겹침이 줄고 가독성이 높아진다.

weight 계산 (두 방식 중 선택):

```ts
// 방식 A: subtree 박스 크기 기준
childWeight = max(child.box.subtreeWidth, child.box.subtreeHeight)

// 방식 B: 자손 수 기준
childWeight = 1 + descendantCount
```

angle 할당:

```ts
totalWeight = sum(children.map(getSubtreeWeight))
allocatedAngle = totalAngleRange * (childWeight / totalWeight)
```

각도 범위 정책:

| 타입                    | startAngle | endAngle         |
| --------------------- | ---------- | ---------------- |
| `radial-right`        | -60°       | +60°             |
| `radial-left`         | 120°       | 240°             |
| `radial-bidirectional` | 좌/우 그룹 분리  | 각 그룹 내 weight 분배 |

Radial 의사코드:

```ts
function arrangeRadial(node, x, y, startAngle, endAngle, radius, options) {
  node.computedX = x
  node.computedY = y

  const children = getVisibleChildren(node)
  if (children.length === 0) return

  const totalWeight = children.reduce((sum, c) => sum + getSubtreeWeight(c), 0)
  let cursorAngle = startAngle

  for (const child of children) {
    const ratio = getSubtreeWeight(child) / totalWeight
    const childAngleRange = (endAngle - startAngle) * ratio
    const childMidAngle = cursorAngle + childAngleRange / 2

    // radius = baseRadius + depth * radialLevelGap
    const childRadius = radius + options.radialLevelGap
    const childX = x + Math.cos(childMidAngle) * childRadius
    const childY = y + Math.sin(childMidAngle) * childRadius

    arrangeRadial(child, childX, childY,
      childMidAngle - childAngleRange / 2,
      childMidAngle + childAngleRange / 2,
      childRadius, options)

    cursorAngle += childAngleRange
  }
}
```

### 16.2 Hierarchy — level 기반 그룹화

Tree와 달리 같은 depth의 노드를 같은 축에 정렬하여 조직도 느낌을 강조한다.

```
1단계: BFS/DFS로 level 계산
  root.level = 0
  child.level = parent.level + 1

2단계: 레벨별 그룹화
  levelMap[0] = [root]
  levelMap[1] = [A, B, C]
  levelMap[2] = [A1, A2, B1]

3단계: 레벨 위치 고정 (hierarchy-right 기준)
  x = level * levelGap
  y = levelMap[level] 내에서 orderIndex 순서대로 분산
```

특징: subtree 균형보다 level 기준 시각 정렬이 우선이므로, 부모·자식 간 수직 연결이 들여쓰기처럼 보인다.

### 16.3 ProcessTree — main path + secondary branch

흐름(flow)이 핵심이므로 `orderIndex`의 중요도가 매우 높다.

구조:

```
메인 path: Step1 → Step2 → Step3  (x축 방향 순차 배치)
부가 branch: 각 Step의 자식 상세 → 위/아래 보조 subtree로 배치
```

구현 방식:

```
1. 최상위 자식(depth 1)을 main path로 선정 → x 방향 순차 좌표 부여
2. 각 main path 노드의 자식 = secondary branch → 별도 subtree 계산
3. process-tree-right-b (타임라인형): 같은 y축 선상에 step 나열
4. process-tree-right-a (버블형): main path 유지, 세부 단계 아래로 확장
```

### 16.4 Freeform — suggested position + manual priority

Freeform은 "완전 자동배치"가 아니라 **자동 추천 + 수동 우선** 구조이다.

```
computed position (자동 추천)
  └─ manualPosition 없으면 사용
manual position (사용자 지정)
  └─ manualPosition 있으면 항상 최우선
```

신규 자식 추가 시 추천 위치 산출:

```
1. 부모 노드 오른쪽 아래로 기본 offset 적용
2. 기존 형제의 bounding box와 겹치지 않는 근처 위치 선택
3. manualPosition 없으면 auto suggested position 유지
```

Layout Engine의 역할:

* `manualPosition` 존재 시 그대로 사용, 계산 개입 없음
* edge 연결성(부모↔자식 선) 유지
* 충돌이 심각한 경우 약한 보정(soft push) 가능
* layout reset 시 `manualPosition = null` → 자동 재계산

---

## 17. Partial Relayout

> **현재는 `computeLayout()` 단일 전체 계산 — 아래는 목표 설계다.**

전체 맵을 매번 풀 리레이아웃하면 비효율적이다. 변경이 발생한 subtree만 재계산하는 partial relayout 흐름을 사용한다.

**흐름:**

```
local update → upward propagate → limited arrange
```

단계별 처리:

```ts
function relayout(changedNodeId: string): void {
  // 1. 변경된 노드의 subtree root 탐색
  const subtreeRoot = findSubtreeRoot(changedNodeId)

  // 2. 해당 subtree만 Measure (바텀업)
  measureNode(subtreeRoot)

  // 3. 해당 subtree만 Arrange (탑다운)
  arrangeNode(subtreeRoot, getParentPos(subtreeRoot), getDepth(subtreeRoot))

  // 4. 조상 방향으로 bounding box 업데이트 (upward propagate)
  propagateBoundsUpward(subtreeRoot)
}
```

**Partial relayout가 트리거되는 상황:**

* 노드 텍스트 수정 (크기 변화)
* 자식 추가 / 삭제
* 접기 / 펼치기 (collapsed 토글)
* 다중 가지 추가 (bulk branch insert)
* Subtree layoutType 변경
* Freeform drag
* Kanban 카드 이동 (source column + target column만 재계산)

**다중 가지 추가 시 흐름:**

```
1. 텍스트 파싱 → 임시 subtree 생성
2. parent 노드 아래에 삽입
3. parent subtree만 measure + arrange
4. 필요 시 조상까지 upward propagate
```

---

## 18. 에지 렌더링 정책 (실구현 기준)

**에지는 부모 노드의 layoutType 기준**으로 결정된다 (루트가 아니라
Subtree override를 반영한 부모 기준 — 10-canvas.md §27과 일치).

레이아웃별 에지 경로 정리:

| 레이아웃            | 에지 경로       | 비고                     |
| ------------------ | ----------- | ---------------------- |
| `radial-*`         | 곡선 (markmap 식 curveBumpX) | 방사형 배치에 자연스러운 곡선    |
| `tree-right`       | 부모 좌하단 12px 스파인 (`M (x-w/2+12) (y+h/2) V toY H toX`) | 들여쓰기 아웃라인    |
| `tree-down`        | 직각 V-H-V | 세로 전개    |
| `hierarchy-right`  | 중앙 elbow (`M fromX fromY H midX V toY H toX`)  | 직각 가로→세로→가로   |
| `process-tree-*`   | 왼쪽 14px 스파인 직각선 (화살표 없음) | 흐름·단계 강조 |
| `timeline`         | 전용 경로 — 루트→주제는 시간축 꺾임, 주제 이하 왼쪽 스파인 (§22) | createTimelinePath |
| `freeform`         | **곡선 (방사형과 동일)** | 자유배치 V1+ 예정 — 현재 곡선 렌더링   |
| `kanban`           | edge 미표시 (별도 보드 렌더러)    | — |

EdgeAnchorResolver는 각 node box의 시작점(source)과 끝점(target)을 계산하여 EdgeRouter에 전달한다.

---

## 19. Edge Style 결정 규칙 (실구현 기준)

Edge Style은 **부모 노드의 layoutType**에 의해 자동 결정된다.

| layoutType | Edge Style |
|---|---|
| `radial-*` | 곡선 (curveBumpX) |
| `tree-right` | 좌하단 스파인 직각선 |
| `tree-down` | V-H-V 직각선 |
| `hierarchy-right` | 중앙 elbow 직각선 |
| `process-tree-*` | 왼쪽 14px 스파인 직각선 |
| `timeline` | timeline 전용 경로 |
| `freeform` | **곡선 (방사형과 동일)** — tree-line 아님 |
| `kanban` | UI 미표시 (보드 렌더러) |

MVP에서는 사용자가 Edge Style을 수동으로 변경할 수 없다.

따라서 MVP 범위에서는 다음 기능을 제공하지 않는다.

* 선 스타일 선택 버튼
* 노드별 선 스타일 override
* `edge_style` 컬럼 저장
* 사용자 지정 straight / curve / orthogonal 선택

---

## 20. Freeform 보조 배치 정책 (V1+ 예정)

Grid Snapping과 Collision Detection은 freeform layout에서만 선택적으로 적용한다.

Auto Layout 계열에서는 Layout Engine이 좌표를 결정하므로 사용자의 grid snapping을 적용하지 않는다.

| 항목 | MVP 정책 |
|---|---|
| Grid Snapping | 선택 옵션, 기본 OFF |
| Collision Detection | 기본 경고 또는 약한 보정 |
| Auto Layout 충돌 방지 | Layout Engine의 Measure / Arrange / CollisionResolver에서 처리 |
| Freeform 충돌 방지 | 사용자가 수동 위치 조정 가능하므로 강제 이동하지 않음 |

---

## 21. 좌표 저장 정책 (manualPosition 저장은 V1+ 예정)

좌표는 자동 배치 좌표와 수동 배치 좌표를 분리한다.

| 좌표 유형 | 저장 위치 | 설명 |
|---|---|---|
| `computedX / computedY` | 클라이언트 계산값 | Auto Layout 결과. DB 저장 대상 아님 |
| `manualPosition` | `nodes.manual_position` JSONB | Freeform 또는 수동 위치 보정 좌표 |
| edge path | 저장하지 않음 | 노드 위치와 layoutType 기준으로 렌더링 시 계산 |

Auto Layout에서는 `computedX/Y`를 사용한다.  
Freeform에서는 `manualPosition`을 사용한다.  
Edge 꺾임점 또는 Bezier control point는 DB에 저장하지 않는다.

## 22. 시간배치 (타임라인) 레이아웃 (MVS 구현 — 2026-07)

중심 주제(1레벨)에서 오른쪽으로 **수평 시간축 화살표**가 뻗고, 2레벨
주제들이 축 위/아래에 **번갈아** 배치된다. 각 주제의 하위(3레벨+)는
축에서 멀어지는 방향(위쪽 주제는 위로, 아래쪽 주제는 아래로)으로
들여쓰기 세로 스택으로 쌓인다 (왼쪽 스파인 직각 연결).

- **중심 주제 전용(rootOnly)** — 트리·아래와 동일한 제약 (LayoutTab).
- `side`: 위쪽 서브트리 = `'up'`, 아래쪽 = `'down'` — +버튼 방향
  (03-node-indicator.md)과 드롭존이 이 방향을 따른다 (up이면 위 = 자식).
- 태그 칩은 항상 노드 아래에 그려지므로, 위 방향 스택에서는 칩 공간을
  노드 아래(축쪽)에 예약해 겹침을 막는다 (TimelineStrategy).
- 시간축 화살표는 Canvas가 레이아웃 위에 그린다 (루트 오른쪽 가장자리 →
  마지막 주제 너머 +46px, 화살촉 polygon).
- 엣지: 루트→주제는 축을 따라가다 주제 x에서 꺾여 내려/올라감
  (`M rootRight rootY H topicX V topicEdge`), 주제 이하는 왼쪽 스파인
  세로 아웃라인 (EdgeRenderer.createTimelinePath).
- **HTML 내보내기 파리티**: 내보내기는 에디터 계산 좌표(pos)를 그대로
  쓰므로 배치는 자동 일치 — 뷰어에는 timeline 엣지 스타일과 시간축
  화살표만 추가했다 (exportHtml VIEWER_JS).

### 22.1 시간배치 (중앙노드) — `timeline-center` (2026-08-07)

**노드가 시간축 위에 얹히는** 배치다. 사용자 정의 그대로: *"중심 주제가
축 위의 제일 왼쪽에 있고, 오른쪽 방향으로 2레벨 노드들이 축 위에
배치되는 레이아웃"*.

`timeline` 과의 차이는 **주제가 축에 놓이는 방식** 하나뿐이다.

| | `timeline` | `timeline-center` |
| --- | --- | --- |
| 중심 주제 | 축 왼쪽 끝 | 축 왼쪽 끝 (같다) |
| 2레벨 주제 | 축에서 **위/아래로 떨어져 매달림** (BRANCH_GAP 연결선) | 축이 **노드 한가운데를 관통** — 일렬로 |
| 3레벨+ | 축에서 멀어지는 방향 세로 스택 | 같다 (위/아래 번갈아) |

그래서 축 한 줄만 훑으면 "무엇이 언제"가 바로 읽히고, 세부는 위아래로
빠진다.

- `layoutTimelineCenter` 는 `timeline` 과 **같은 `placeSubtree`** 를
  쓰되, 주제 노드의 **중심**이 축(CY)에 오도록 `edgeY` 를 노드 높이
  절반만큼 민다 (`dir==='down'` → `CY - h/2`, `'up'` → `CY + h/2 + over`).
- **시간축은 한 줄로 긋지 않는다** — 축 위에 노드가 있어 선이 글자를
  가로지르기 때문이다. `depth <= 1` 노드를 x 순으로 정렬해 **노드 사이
  빈 칸에만 토막**으로 긋고, 마지막 노드 뒤 +46px 에 화살촉을 둔다
  (Canvas · 뷰어 `drawNode` 둘 다).
- **루트→주제 엣지는 그리지 않는다** — 시간축 토막이 곧 연결선이다.
  그리면 축과 완전히 겹치고, 먼 주제로 가는 선은 앞 주제들을 관통한다.
  (Canvas 는 `depth === 1` 엣지를 건너뛰고, 뷰어 `edgePath` 는 빈 문자열을
  돌려주며 호출부가 그때 `<path>` 자체를 만들지 않는다.)
- 접기 앵커·`side`(up/down)는 `timeline` 과 같은 규칙.

### 22.1-1 `_timelineRole` — 축 위인가, 그 아래 스택인가 (2026-08-07)

시간배치는 두 가지 자리를 갖는다 — **축 위에 놓인 노드**와 **그 아래로
세로로 쌓이는 노드**. 엣지 모양, 시간축·화살표를 그릴 위치, ＋버튼 방향이
전부 이 구분에 걸려 있다.

예전에는 **깊이로 판정**했다(`depth === 0` 이 축의 시작점, `depth === 1`
이 축 노드). 맵 전체에 걸 때는 맞지만 **서브트리에 걸면 전부 어긋난다** —
축의 시작점이 중심 주제가 아니라 고른 노드라 깊이가 다르기 때문이다.
2026-08-07 보고 5건이 모두 이 하나에서 나왔다.

- 연결선이 노드 오른쪽이 아니라 위/아래에서 나갔다 (보고 1·3·4)
- 시간축도 끝 화살표도 **아예 없었다** (보고 1·2·3)
- 축 노드의 ＋버튼이 그 노드 방향을 안 따랐다 (보고 5)

이제 **배치가 역할을 심고**(`LaidOutNode._timelineRole`) 모두 그것을 본다.

| 값 | 뜻 | 엣지 | ＋버튼 |
| --- | --- | --- | --- |
| `'axis'` | 축 위에 놓인 노드 | 시작점 **오른쪽 변** → 축 따라 → 그 노드 (중앙노드는 축이 곧 연결선이라 **안 그림**) | 자식=축 바깥, 부모=축 쪽, 형제=좌우 |
| `'stack'` | 그 아래 세로 스택 | 부모 왼쪽 스파인 세로 아웃라인 | 자식=➡(들여쓰기), 형제=축 방향 |

- **시간축·화살표는 축의 시작점마다** 그린다 — `_timelineRole === 'axis'`
  인 노드를 부모별로 묶어 무리마다 한 줄 + 화살촉(Canvas).
- **축 끝은 남의 노드 앞에서 멈춘다** (2026-08-07). 축 끝은 원래 "이
  무리의 최대 x + 46" 인데, 서브트리에 걸면 그 오른쪽에 **다른 가지의
  노드**가 서 있어 화살촉이 그 위에 얹혔다. 축 높이와 세로로 겹치면서
  축 끝 방향에 있는 **가장 가까운 남의 노드** 왼쪽 변 앞(-18px)까지만
  긋는다. 자리가 없으면(마지막 노드 바로 옆) **축도 화살촉도 그리지
  않는다** — 억지로 그리면 노드를 뚫고 나간다. 검증: e2e127 [2].
- 엣지 판정도 `to._timelineRole` 이 먼저다. 축 노드의 **자식**은
  `from.layoutType` 이 비어 있어 맵 레이아웃(예: 진행트리)이 잡혔고,
  그래서 선이 엉뚱한 데서 나갔다.
- **서브트리 보정 예외**: `SubtreeStrategy` 는 서브트리가 위로 넘치면
  아래로 밀어 내리는데, 시간배치는 축 기준으로 위·아래로 뻗는 것이 제
  모양이라 **그 보정에서 뺀다**. 안 그러면 축 위에 얹혀야 할 노드가
  시작점보다 아래로 밀린다(보고 2번).
- 뷰어(exportHtml)도 같은 규칙을 쓴다 — `_tlRole` 을 `measure` /
  `assignFixed` / `reflowFixed` 세 경로에서 똑같이 심는다.

검증: **e2e126**.

### 22.2 ＋버튼(NodeIndicators) 방향 — 시간배치는 예외 (2026-08-07)

보고: *"시간배치 3레벨 노드에서 하위 노드 추가와 상위 노드 추가가
설명과 실제 생성 위치가 반대다."*

원인은 방향 규칙이 `side` 만 봤기 때문이다. 시간배치의 **3레벨+** 는
아웃라인처럼 **세로로 쌓이고 자식만 오른쪽으로 들여쓴다** — 자식과 형제가
같은 세로축에 있다. 그런데 `side='up'` 규칙은 자식을 세로(⬆), 형제를
가로(⬅➡)에 두어서

  · `[하위 노드 추가]`(⬆) 와 `[형제 뒤에 추가]`(➡) 가 **같은 자리**에
    노드를 만들고,
  · 세로로 쌓이는 형제는 엉뚱하게 가로 버튼에서 나왔다.

지금은 **역할(`_timelineRole`)로 가른다** (§22.1-1). 처음에는 depth 로
갈랐는데 서브트리에서 또 어긋나, 배치가 심은 역할로 옮겼다:

| | 자식 | 부모 | 형제 앞 | 형제 뒤 |
| --- | --- | --- | --- | --- |
| **`'axis'`**(축 위) | 축 바깥 | 축 쪽 | ⬅ | ➡ |
| **`'stack'`**(세로) | ➡ (들여쓰기) | ⬅ | 축 쪽 | 축 바깥 |

'축 바깥/축 쪽'은 **그 노드의 `side`** 로 매번 계산한다 — 축 위 노드는
첫째가 'up', 둘째가 'down' 으로 번갈아 붙기 때문이다. 고정해 두면 "1번째
2레벨은 하위가 위로, 2번째는 아래로 붙는데 ＋버튼은 그대로"가 된다
(보고 5번).

트리·오른쪽에서 이미 쓰던 관례("들여쓰기 방향 = 자식")를 그대로 옮긴
것이다. 검증: e2e125 [1]·[1b] — ＋버튼이 가리키는 쪽과 새 노드가 실제로
생기는 쪽의 **부호가 같은지**, 그리고 하위와 형제가 **다른 자리**에
생기는지 실측한다.
- **레이아웃 아이콘**(LayoutGlyph)도 이 차이를 그대로 그린다 — 두 아이콘
  모두 **왼쪽 끝이 중심 주제 상자**이고, 중앙노드 쪽은 주제 상자도 축
  위에 놓인다 (2026-08-07 요청: "아이콘을 실제 레이아웃에 맞게").
