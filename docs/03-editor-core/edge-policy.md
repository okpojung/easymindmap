# easymindmap — Edge / Layout / Node Inheritance Policy

문서 버전: v3.1  
상태: Final Draft  
대상 파일: `docs/03-editor-core/edge-policy.md`  
관련 문서:
- `docs/01-product/functional-spec.md`
- `docs/02-domain/domain-models.md` ← LayoutType 정의 정본 (kebab-case DB 저장값), 스타일 상속 규칙 §6
- `docs/03-editor-core/layout/08-layout.md` ← Layout Engine 정책 §18 (에지 타입 결정 로직), Kanban depth 규칙 §6.6
- `docs/03-editor-core/state-architecture.md`
- `docs/03-editor-core/node/02-node-editing.md`
- `docs/02-domain/db-schema.md` ← nodes 테이블 DDL, chk_nodes_kanban_depth CHECK 제약

---

# 1. 문서 목적

본 문서는 easymindmap에서 부모-자식 연결선(Edge)과 하위 전개 방식(Layout), 그리고 Node 생성 시 상속 규칙을 하나의 정책 문서로 통합 정의한다.

이 문서의 목적은 다음과 같다.

1. Layout 유형별 Edge 스타일을 최종 확정한다.
2. Layout Engine이 어떤 기준으로 Edge를 선택하고 경로를 생성하는지 정의한다.
3. Node가 부모로부터 어떤 Layout과 Style을 상속받는지 규칙을 명확히 한다.
4. 자유배치형과 Kanban 같은 특수 Layout을 기존 구조와 충돌 없이 확장 가능하도록 설계한다.
5. 실제 프론트엔드/렌더링/AI 코드 생성 기준 문서로 사용한다.

즉, 이 문서는 단순한 “선 모양 정하기” 문서가 아니라  
**Layout Engine 전체 정책의 핵심 축**을 정의하는 문서이다.

---

# 2. 배경과 문제 정의

마인드맵 편집기에서 Node의 위치만 잘 계산한다고 끝나지 않는다.  
부모-자식 관계를 어떤 선으로 연결하느냐에 따라 전체 UX가 크게 달라진다.

같은 데이터라도 다음처럼 보일 수 있다.

- 곡선 중심의 전통적 마인드맵
- 직각 꺾임 중심의 구조도
- 타임라인 느낌의 프로세스 흐름
- 자유 위치 기반 다이어그램형 구성
- 보드형(Kanban) 컬럼 구성

따라서 easymindmap은 Edge 정책을 단순한 시각 옵션이 아니라  
**Layout의 일부**로 정의해야 한다.

문제는 다음과 같다.

1. Layout 종류가 많다.
2. 자유배치형은 직선이 좋아 보일 수 있지만 관계 표현이 약해질 수 있다.
3. Node 생성 시 부모의 style/layout 상속 규칙이 없으면 사용자 경험이 끊긴다.
4. AI 자동 생성이나 다중 가지 생성 시도 동일한 규칙을 따라야 한다.
5. 향후 Kanban, Timeline, OrgChart 같은 확장 Layout도 수용해야 한다.

이 문서는 위 문제를 해결하기 위한 최종 정책 문서이다.

---

# 3. 핵심 결론 요약

easymindmap의 최종 Edge 정책은 아래 한 줄로 정리된다.

```text
방사형(Radial)만 curve-line
그 외 모든 Layout은 tree-line
```

즉,

- Radial-Bidirectional → curve-line
- Radial-Right → curve-line
- Radial-Left → curve-line
- Tree 계열 → tree-line
- Hierarchy 계열 → tree-line
- ProcessTree 계열 → tree-line
- Freeform → tree-line
- Kanban → tree-line

이 정책은 UX, 구현 단순성, 확장성 측면에서 가장 균형이 좋다.

---

# 4. 설계 원칙

## 4.1 Layout이 Edge를 결정한다

Edge는 독립 1차 속성이 아니라 **Layout 해석 결과**로 결정된다.

즉 사용자가 일반적으로 “선 스타일”을 먼저 고르는 구조보다,

```text
Layout 선택
→ Edge 타입 자동 결정
```

흐름이 기본이다.

향후 고급 옵션에서 override는 허용할 수 있지만, 기본 정책은 Layout 기준 자동 결정으로 한다.

---

## 4.2 Edge는 2종을 기본으로 한다

초기 설계에서 straight-line(legacy)까지 3종을 고려했지만,  
easymindmap의 제품 방향에서는 기본값으로는 2종만 두는 것이 낫다.

- `curve-line`
- `tree-line`

legacy straight-line은 향후 고급 사용자용 override 옵션으로만 남길 수 있지만,  
기본 정책에서는 제외한다.

---

## 4.3 Node는 부모의 Layout을 기본 상속한다

Node는 단독으로 존재하는 UI 박스가 아니라 트리 구조 안의 일부이다.  
따라서 생성 직후에는 기본적으로 부모의 Layout 규칙을 따른다.

---

## 4.4 Node는 부모의 시각 스타일을 기본 상속한다

형제/자식 노드를 계속 추가할 때 사용자가 매번 shape, fillColor, border를 다시 지정하게 하면 UX가 매우 나빠진다.  
따라서 생성 시점의 기본값은 부모 스타일을 상속하는 방식으로 한다.

---

## 4.5 Subtree 단위 Layout Override를 허용한다

easymindmap의 중요한 특성은 하나의 맵 안에서 subtree별로 다른 Layout을 허용하는 것이다.

예:

- 루트는 Radial-Bidirectional
- 특정 절차 영역은 ProcessTree-Right
- 어떤 설명 영역은 Tree-Right
- 대시보드나 상태 영역은 Kanban

이 구조를 허용해야 실제 제품이 강력해진다.

---

# 5. Layout 그룹 정의

easymindmap은 아래 6개 Layout 그룹을 사용한다.

| Layout Group | 설명 |
|---|---|
| Radial | 중심 또는 부모 기준으로 방사형으로 퍼지는 마인드맵 |
| Tree | 일반적인 트리 구조 |
| Hierarchy | 조직도/계층 구조 |
| ProcessTree | 절차/흐름 중심의 진행형 구조 |
| Freeform | 위치는 사용자가 직접 배치하는 자유배치형 |
| Kanban | 컬럼과 카드 중심의 보드형 구조 |

---

# 6. Layout Type 정의

> **LayoutType DB 저장값**: 모두 kebab-case 영문 소문자 (예: `'radial-bidirectional'`).  
> 전체 15개 LayoutType의 정본 정의는 `docs/02-domain/domain-models.md § 2.2` 참조.  
> Layout Engine에서의 처리 방식은 `docs/03-editor-core/layout/08-layout.md § 4.1` 참조.

## 6.1 Radial 계열

| 코드 | 영문명 | DB 저장값 | 한글명 | 설명 |
|---|---|---|---|---|
| BL-RD-BI | Radial-Bidirectional | `radial-bidirectional` | 방사형-양쪽 | 중심 기준 좌우 균형 방사형 |
| BL-RD-R | Radial-Right | `radial-right` | 방사형-오른쪽 | 오른쪽 중심 방사형 |
| BL-RD-L | Radial-Left | `radial-left` | 방사형-왼쪽 | 왼쪽 중심 방사형 |

---

## 6.2 Tree 계열

| 코드 | 영문명 | DB 저장값 | 한글명 | 설명 |
|---|---|---|---|---|
| BL-TR-U | Tree-Up | `tree-up` | 트리형-위쪽 | 위 방향 전개 |
| BL-TR-D | Tree-Down | `tree-down` | 트리형-아래쪽 | 아래 방향 전개 |
| BL-TR-R | Tree-Right | `tree-right` | 트리형-오른쪽 | 오른쪽 방향 수평 트리 |
| BL-TR-L | Tree-Left | `tree-left` | 트리형-왼쪽 | 왼쪽 방향 수평 트리 |

---

## 6.3 Hierarchy 계열

| 코드 | 영문명 | DB 저장값 | 한글명 | 설명 |
|---|---|---|---|---|
| BL-HR-R | Hierarchy-Right | `hierarchy-right` | 계층형-오른쪽 | 좌→우 계층 구조 |
| BL-HR-L | Hierarchy-Left | `hierarchy-left` | 계층형-왼쪽 | 우→좌 계층 구조 |

---

## 6.4 ProcessTree 계열

| 코드 | 영문명 | DB 저장값 | 한글명 | 설명 |
|---|---|---|---|---|
| BL-PR-R | ProcessTree-Right | `process-tree-right` | 진행트리-오른쪽 | 좌→우 절차형 |
| BL-PR-L | ProcessTree-Left | `process-tree-left` | 진행트리-왼쪽 | 우→좌 절차형 |
| BL-PR-RA | ProcessTree-Right-A | `process-tree-right-a` | 진행트리-오른쪽A | 상단 기준선 중심 분기형 |
| BL-PR-RB | ProcessTree-Right-B | `process-tree-right-b` | 진행트리-오른쪽B | 타임라인/로드맵형 |

---

## 6.5 Freeform

| 코드 | 영문명 | DB 저장값 | 한글명 | 설명 |
|---|---|---|---|---|
| BL-FR | Freeform | `freeform` | 자유배치형 | 수동 좌표 기반 배치 |

---

## 6.6 Kanban

| 코드 | 영문명 | DB 저장값 | 한글명 | 설명 |
|---|---|---|---|---|
| BL-KB | Kanban | `kanban` | 칸반형 | 컬럼/카드 중심 보드형 구조 |

---

# 7. Edge 정책 최종 확정안

## 7.1 정책표

| Layout Group | Layout Type | Edge Style |
|---|---|---|
| Radial | Radial-Bidirectional | curve-line |
| Radial | Radial-Right | curve-line |
| Radial | Radial-Left | curve-line |
| Tree | Tree-Up | tree-line |
| Tree | Tree-Down | tree-line |
| Tree | Tree-Right | tree-line |
| Tree | Tree-Left | tree-line |
| Hierarchy | Hierarchy-Right | tree-line |
| Hierarchy | Hierarchy-Left | tree-line |
| ProcessTree | ProcessTree-Right | tree-line |
| ProcessTree | ProcessTree-Left | tree-line |
| ProcessTree | ProcessTree-Right-A | tree-line |
| ProcessTree | ProcessTree-Right-B | tree-line |
| Freeform | Freeform | tree-line |
| Kanban | Kanban | tree-line |

---

## 7.2 한 줄 정리

```text
Radial = curve-line
Others = tree-line
```

---

## 7.3 왜 Freeform도 tree-line인가

초기에는 Freeform에서 straight-line을 고려할 수 있으나, 현재 정책 기본값은 orthogonal(tree-line)이다.  
그러나 easymindmap의 Freeform은 완전한 다이어그램 툴이 아니라  
“부모-자식 관계를 유지한 채 위치만 자유로운 구조”에 더 가깝다.

따라서 다음 이유로 tree-line이 더 적합하다.

### 1. 관계가 더 잘 보인다
직선 연결은 노드가 자유롭게 움직일수록 대각선이 많아져 산만해질 수 있다.  
반면 tree-line은 방향성과 부모-자식 관계를 더 분명히 드러낸다.

### 2. 전체 제품 정책이 단순해진다
정책이 아래처럼 매우 단순해진다.

```ts
if (layoutGroup === "radial") return "curve-line"
return "tree-line"
```

### 3. Freeform의 본질을 해치지 않는다
Freeform의 자유는 “노드 위치”에 있고,  
관계선까지 완전 자유 직선으로 가는 것이 필수는 아니다.

### 4. orthogonal-line(직각선) 외 별도 straight-line은 기본 정책에서 제외
향후 고급 설정에서 아래처럼 override를 둘 수 있다.

- Default
- Curve
- Tree
- Straight

하지만 기본 정책은 tree-line이 더 안정적이다.

---

## 7.4 왜 Kanban도 tree-line인가 (그리고 실제 UI에서는 미표시)

> **`docs/03-editor-core/layout/08-layout.md § 18` 에지 렌더링 정책 표**에서  
> Kanban의 에지 타입을 "없음 (엣지 미사용)"으로 정의한다.  
> 이 문서의 정책은 다음처럼 정합적으로 이해한다:  
> - **정책(policy) 레벨**: `kanban` layoutType의 기본 Edge 타입 = `tree-line`  
> - **렌더링(display) 레벨**: Kanban Renderer가 board/column/card 관계를 컬럼 배치로 표현하므로 엣지 선을 기본적으로 **미표시**  
> - 즉, "엣지 타입 = tree-line"은 데이터 구조 일관성을 위한 정책이며, 실제 화면에서는 `opacity: 0` 또는 렌더 스킵으로 처리 가능

Kanban은 컬럼 중심 구조이기 때문에 선 사용 자체를 최소화할 수는 있다.  
그러나 데이터 모델은 여전히 parent-child를 유지하고, 특정 상황에서는 선이 필요하다.

예:

- column ↔ card 관계 시각화
- outline/tree 전환 시 관계 유지
- export HTML/Markdown에서 계층 일관성 유지
- AI 자동 생성 후 Kanban 변환 시 구조 보존

따라서 Kanban도 기본 Edge 스타일은 tree-line으로 정의한다.

단, 렌더링 단계에서 Kanban 화면에서는 edge를 축약/약화/비표시 처리할 수는 있다.  
즉:

```text
정책상 Edge = tree-line
UI 표시 여부 = Kanban Renderer 옵션
```

이렇게 이해하는 것이 정확하다.

---

# 8. Edge 타입 정의

## 8.1 기본 Edge 타입

```ts
export type EdgeType =
  | "curve-line"
  | "tree-line"
```

---

## 8.2 향후 확장 가능 타입

향후 고급 옵션 또는 특수 모드 확장 시 아래를 추가할 수 있다.

```ts
export type ExtendedEdgeType =
  | "curve-line"
  | "tree-line"
  | "orthogonal-line"
  | "timeline-line"
```

하지만 v1 기준 기본 정책은 2종만 공식 지원한다.

---

# 9. Layout → Edge 자동 매핑 규칙

## 9.1 기본 함수 예시

```ts
// LayoutType 값은 domain-models.md § 2.2의 kebab-case 정의를 따른다
// (DB 저장값 기준: 예: 'radial-bidirectional', 'tree-right' 등)
function resolveEdgeType(layoutType: LayoutType): EdgeType {
  switch (layoutType) {
    case "radial-bidirectional":
    case "radial-right":
    case "radial-left":
      return "curve-line"

    default:
      return "tree-line"
  }
}
```

---

## 9.2 layoutGroup 기준 매핑 예시

실무 구현에서는 layoutType을 직접 switch하는 것보다  
내부적으로 group/direction/variant로 나누는 것이 더 좋다.

```ts
type LayoutGroup =
  | "radial"
  | "tree"
  | "hierarchy"
  | "process"
  | "freeform"
  | "kanban"

function resolveEdgeTypeByGroup(group: LayoutGroup): EdgeType {
  return group === "radial" ? "curve-line" : "tree-line"
}
```

---

## 9.3 override 고려 예시

향후 사용자가 edge를 강제 선택할 수 있도록 하려면 다음 구조를 둘 수 있다.

```ts
type EdgeOverride = "default" | "curve-line" | "tree-line" | "orthogonal-line"

function resolveEffectiveEdgeType(
  layoutType: string,
  override: EdgeOverride
): string {
  if (override !== "default") return override
  return resolveEdgeType(layoutType)
}
```

---

# 10. 각 Edge 타입의 실제 형태

## 10.1 curve-line

### 적용 대상
- Radial-Bidirectional
- Radial-Right
- Radial-Left

### 의도
- 마인드맵다운 자연스러운 흐름
- 중앙 주제에서 가지가 퍼지는 느낌 강화

### SVG 예시
```text
M x1 y1
C cx1 cy1, cx2 cy2, x2 y2
```

### 특징
- 곡선이 부드럽다
- 전통적 마인드맵 UX와 유사
- root 중심 구조에 자연스럽다

### 적합한 사례
- 아이디어 발산
- 브레인스토밍
- 중심 주제 기반 정리

---

## 10.2 tree-line

### 적용 대상
- Tree 계열 전체
- Hierarchy 계열 전체
- ProcessTree 계열 전체
- Freeform
- Kanban

### 의도
- 구조/흐름/계층 관계 명확화
- 절차/조직/작업 분류에 적합

### SVG 예시
```text
M x1 y1
L x1 midY
L x2 midY
L x2 y2
```

또는 수평/수직 방향에 따라 다음처럼 변형될 수 있다.

```text
M x1 y1
L midX y1
L midX y2
L x2 y2
```

### 특징
- 부모-자식 관계가 명확하다
- 트리형/조직도/프로세스형에 적합
- 구현이 단순하고 안정적이다

### 적합한 사례
- 문서 구조
- 프로젝트 업무 분해
- 프로세스 단계
- 보드형 카드 관계

---

# 11. Edge Style 세부 옵션

초기 MVP에서 필수는 아니지만, 구조상 아래 옵션을 고려해두는 것이 좋다.

```ts
type EdgeStyle = {
  width: number
  color: string
  dash?: boolean
  arrow?: boolean
  curvature?: number
  opacity?: number
}
```

예:

```ts
const defaultEdgeStyle: EdgeStyle = {
  width: 2,
  color: "#666666",
  dash: false,
  arrow: false,
  curvature: 0.4,
  opacity: 1
}
```

---

## 11.1 width
- 선 두께
- 기본 2px 권장

## 11.2 color
- 기본 선 색상
- theme와 연동 가능

## 11.3 dash
- 점선/파선 여부
- 특수 관계선 확장 시 유용

## 11.4 arrow
- 화살표 여부
- ProcessTree/Timeline/Dependency line 확장 시 유용

## 11.5 curvature
- curve-line의 굽힘 정도
- Radial의 느낌 조정에 유용

## 11.6 opacity
- Kanban/Freeform에서 edge를 약하게 표현할 때 유용

---

# 12. Edge 정책이 좋은 이유

## 12.1 UX가 자연스럽다

- 방사형 = 곡선
- 구조형 = 직각 꺾임

이 규칙은 사용자가 쉽게 이해한다.

---

## 12.2 코드가 단순해진다

기본 resolver가 매우 단순하다.

```text
radial → curve
others → tree
```

---

## 12.3 렌더링이 안정적이다

Edge path 생성이 예측 가능해진다.

- CurveRouter
- TreeRouter

2종만 관리하면 된다.

---

## 12.4 Layout별 시각 언어가 일관된다

레이아웃이 바뀌면 선 스타일도 자연스럽게 따라간다.  
사용자가 “왜 이 선이 이렇게 나왔지?”라고 혼란스러워할 가능성이 줄어든다.

---

## 12.5 확장성이 좋다

나중에 다음 기능을 붙이기 쉽다.

- Edge override
- 관계선 추가
- orthogonal-line 옵션
- timeline 전용 edge
- dependency arrow

---

# 13. Node Layout 상속 규칙

## 13.1 기본 규칙

Node는 기본적으로 부모의 Layout을 상속한다.

```text
child.layoutType = parent.layoutType
```

즉:

- 부모가 Radial이면 자식도 기본적으로 Radial
- 부모가 Tree-Right면 자식도 Tree-Right
- 부모가 Kanban이면 하위 노드도 Kanban 해석 규칙을 따른다

---

## 13.2 Layout 결정 우선순위

실제 계산 시 우선순위는 아래와 같다.

```text
1. node.layoutType 명시값
2. parent.layoutType 상속값
3. map.defaultLayout
```

즉:

```text
node.layoutType 존재 → 사용
없으면 parent.layoutType
없으면 map.defaultLayout
```

---

## 13.3 Subtree Layout Override

Node는 특정 시점에서 subtree 전체의 Layout을 바꿀 수 있다.

예:

```text
Root (Radial-Bidirectional)
 ├ A (inherit → Radial)
 ├ B (inherit → Radial)
 └ C (Tree-Right 지정)
     ├ C-1 (inherit → Tree-Right)
     └ C-2 (inherit → Tree-Right)
```

이 방식은 easymindmap의 핵심 차별점 중 하나이다.

---

## 13.4 Override 시 동작

특정 node의 layoutType이 변경되면 다음이 수행되어야 한다.

1. 해당 node를 root로 하는 subtree 범위 식별
2. subtree 내부의 effective layout 재해석
3. 좌표 재계산
4. edge 경로 재계산
5. 화면 재렌더링
6. autosave patch 생성

---

## 13.5 노드 이동 시 Edge 재라우팅 보강 규칙 (MVP)

직각 연결선(`tree-line`)에서 노드 이동 시 경로가 끊기거나 겹쳐 보이지 않도록 아래 규칙을 적용한다.

1. **재계산 트리거**: drag 중 1프레임 단위 미리보기 + drop 시 최종 경로 확정
2. **꺾임 지점(inflection) 기준**: 부모-자식의 주축 거리 50% 지점을 기본 꺾임 축으로 사용
3. **연결점 offset**: 노드 박스 경계에서 최소 8px 바깥 지점부터 선 시작/종료
4. **겹침 완화**: 동일 축 중복 시 lane offset(4~8px)으로 시각적 분리

> 구현 메모: Jump/Bridge(교차선 브릿지)는 V2 후보, MVP에서는 lane offset 우선 적용.

### 13.5.1 Curve 제어점 보정 (Radial)

`curve-line`은 부모→자식 방향각(θ)에 비례해 제어점을 계산한다.

- `P1 = source + k * dir(θ)`
- `P2 = target - k * dir(θ)`
- `k`는 거리 기반 감쇠값(`min(80, distance * 0.35)`) 권장

### 13.5.2 Layout 전환 애니메이션 정책

- `radial-* ↔ non-radial` 전환 시 edge path는 120~180ms 보간 애니메이션 적용
- 저사양/대용량 맵에서는 즉시 교체(fallback) 허용

---

# 14. Node Style 상속 규칙

Node 생성 시 아래 속성을 부모 기준으로 상속한다.

| 속성 | 상속 여부 |
|---|---|
| layoutType | O |
| shapeType | O |
| fillColor | O |
| borderColor | O |
| borderStyle | O |
| borderWidth | O |
| textColor | O |
| fontFamily | O |
| fontWeight | O |
| fontSize | Level Rule 우선, 필요 시 부모 반영 |
| backgroundImage 정책 | 옵션 |
| edgeStyle | layout 기반 자동 |

---

## 14.1 핵심 규칙

생성 시 기본값:

```ts
newNode.layoutType = parent.layoutType
newNode.shapeType = parent.shapeType
newNode.style.fillColor = parent.style.fillColor
newNode.style.borderColor = parent.style.borderColor
newNode.style.textColor = parent.style.textColor
```

---

## 14.2 왜 상속이 중요한가

형제/자식 노드를 연속 생성할 때 사용자가 기대하는 UX는 “같은 계열 노드가 자연스럽게 이어지는 것”이다.

예:

- 둥근 사각형 노드 아래에 자식 추가
- 같은 색 계열 유지
- 같은 layout 흐름 유지

이 규칙이 없으면 노드 생성 후 매번 스타일을 다시 맞춰야 한다.

---

## 14.3 적용 대상 기능

아래 기능에서 동일하게 적용한다.

- 형제 노드 생성 (앞/뒤)
- 자식 노드 생성
- 다중 자식 노드 생성
- 다중 가지 추가
- AI 자동 확장 결과 삽입
- 붙여넣기/복제 시 기본 style 유지

---

## 14.4 다중 가지 추가와의 관계

다중 가지 추가 시 생성되는 subtree 전체도 기본적으로 기준 노드의 shape/style/layout을 상속한다.

예:

```text
기준 노드 = 노란색 rounded rectangle + Tree-Right
Ctrl + Space 입력으로 8개 노드 생성
→ 생성된 8개 노드도 기본적으로 같은 계열로 생성
```

---

# 15. Font Size 정책

폰트는 단순 부모 상속만으로 가기보다,  
Level 기반 기본 규칙을 두는 것이 더 안정적이다.

> **스타일 상속 규칙 정본**: `docs/02-domain/domain-models.md § 6` (스타일 상속 규칙)  
> 아래 폰트 크기 규칙은 `domain-models.md § 6` 확정값(2026-03-31)과 일치한다.

단위는 **px**, 4단계 적용.

| depth | Font Size |
|---|---|
| 0 (Root) | 20px |
| 1 | 16px |
| 2 | 14px |
| 3+ | 12px |

즉:

- 색상/shape는 부모 상속
- font size는 기본적으로 depth 기준 level rule 적용
- 사용자가 custom 지정하면 override
- 단위는 **px** 통일 (pt 혼용 금지)

---

## 15.1 실제 우선순위 예시

```text
Node custom fontSize
→ Level Rule
→ Theme default
```

---

# 16. Layout Engine 구조와의 연결

Edge 정책은 Layout Engine 내부에서 아래 구조와 연결된다.

```text
LayoutEngine
 ├ LayoutResolver
 ├ NodeLayout
 ├ EdgeRouter
 ├ EdgeStyleResolver
 ├ SubtreeCalculator
 └ CollisionResolver
```

---

## 16.1 LayoutResolver

역할:
- node의 effective layout 계산
- parent 상속 반영
- subtree override 반영
- map default fallback 처리

---

## 16.2 NodeLayout

역할:
- subtree 크기 계산
- node position 계산
- layout group별 strategy 선택

---

## 16.3 EdgeRouter

역할:
- curve-line / tree-line path 계산
- parent-child anchor 계산
- 방향별 routing 처리

---

## 16.4 EdgeStyleResolver

역할:
- layoutType → edgeType 결정
- override 적용
- theme/style 매핑

---

## 16.5 CollisionResolver

역할:
- subtree 간 겹침 보정
- 간격 유지
- Freeform/Kanban 특수 배치 조정

---

# 17. Layout 계산 흐름

전체 계산 흐름은 아래와 같다.

```text
Map Load
   ↓
Node Tree Build
   ↓
Effective Layout Resolve
   ↓
Subtree Measure
   ↓
Node Position Compute
   ↓
Edge Type Resolve
   ↓
Edge Path Compute
   ↓
Collision Resolve
   ↓
SVG Render
```

---

# 18. Layout별 배치 정책 요약

## 18.1 Radial

특징:
- 중심 노드 기반
- angle, radius 계산
- 양쪽/오른쪽/왼쪽 변형 지원

좌표 예시:

```text
x = centerX + radius * cos(angle)
y = centerY + radius * sin(angle)
```

Edge:
- curve-line

---

## 18.2 Tree

특징:
- level 기반
- 부모 기준 자식 정렬
- 위/아래/좌/우 변형 지원

Edge:
- tree-line

---

## 18.3 Hierarchy

특징:
- 레벨 중심 정렬
- 조직도 느낌
- 같은 레벨 노드 정렬 강조

Edge:
- tree-line

---

## 18.4 ProcessTree

특징:
- 흐름/단계/절차 강조
- Right / Left / A / B 변형
- line과 step 느낌 강화

Edge:
- tree-line

---

## 18.5 Freeform

특징:
- node 위치는 manualPosition 우선
- layout engine은 관계 유지 + 충돌 보조
- 수동 이동이 주요 인터랙션

Edge:
- tree-line

---

## 18.6 Kanban

특징:
- 컬럼과 카드 중심 구조
- parent-child를 column/card 관계로 해석 가능
- 카드 reorder와 column 이동 지원

Edge:
- 기본 정책상 tree-line
- 실제 화면에서는 약화/비표시 가능

---

# 19. Kanban 정책 상세

Kanban은 기존 edge-policy 원본에는 직접 포함되지 않았지만,  
현재 easymindmap 설계에서는 반드시 포함해야 하는 확장 Layout이다.

## 19.1 Kanban의 목적

Kanban Layout은 전통적 마인드맵 구조와 달리  
“컬럼 + 카드” 흐름을 강조하는 보드형 구조이다.

예:

```text
[TODO]   [DOING]   [DONE]

 Task1     Task3     Task5
 Task2     Task4
```

---

## 19.2 Kanban Node 역할

권장 역할 구분:

```ts
type KanbanNodeRole =
  | "board"
  | "column"
  | "card"
```

---

## 19.3 Kanban depth 규칙

권장 규칙:

- depth 0 = board
- depth 1 = column
- depth 2 = card
- depth 3 이상 = 금지 또는 별도 확장 모드

즉 Kanban은 일반 트리보다 더 제한된 계층 구조를 가진다.

---

## 19.4 Kanban 배치 규칙

### 컬럼
- 가로 배치
- 동일 폭 또는 최소 폭 보장
- column orderIndex 기준 좌→우 정렬

### 카드
- 컬럼 내부 세로 정렬
- card orderIndex 기준 상→하 정렬

---

## 19.5 Kanban 좌표 예시

컬럼:

```text
x = boardLeft + columnIndex * (columnWidth + columnGap)
y = fixedTop
```

카드:

```text
x = columnX
y = columnTop + orderIndex * (cardHeight + cardGap)
```

---

## 19.6 Kanban Edge 정책

Kanban도 데이터 구조상 parent-child 관계를 유지하므로 기본 정책상 tree-line을 따른다.

다만 UI 렌더링에서는 다음 중 하나를 선택할 수 있다.

1. edge 표시
2. edge 약하게 표시
3. edge 완전 숨김

즉:

```text
정책 = tree-line
표시 = renderer 옵션
```

---

## 19.7 Kanban Interaction 특징

- 카드 드래그로 같은 컬럼 내 reorder
- 카드 드래그로 다른 컬럼 이동
- 이동 시 parentId 변경 + orderIndex 재계산
- autosave patch 발생
- undo/redo 한 번의 transaction으로 처리

---

## 19.8 Kanban과 기존 Layout 관계

| 항목 | 일반 Layout | Kanban |
|---|---|---|
| 중심 구조 | 트리/방사형 | 컬럼+카드 |
| 배치 방식 | subtree 계산 | 컬럼 기준 |
| edge | curve/tree | 기본 tree |
| 이동 | subtree 이동 | card/column 이동 |
| 계층 제한 | 일반적으로 자유 | depth 제한 있음 |

---

# 20. Edge Routing 정책

## 20.1 EdgeRouter 구조

```text
EdgeRouter
 ├ CurveEdgeRouter
 └ TreeEdgeRouter
```

---

## 20.2 Curve Router

적용:
- Radial

입력:
- parent anchor
- child anchor
- curvature

출력:
- bezier path string

예:

```ts
function curvePath(x1, y1, x2, y2, c1x, c1y, c2x, c2y) {
  return `M ${x1} ${y1} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${x2} ${y2}`
}
```

---

## 20.3 Tree Router

적용:
- Tree
- Hierarchy
- ProcessTree
- Freeform
- Kanban

출력 예시:

```ts
function treePath(x1, y1, x2, y2) {
  const midX = (x1 + x2) / 2
  return `M ${x1} ${y1} L ${midX} ${y1} L ${midX} ${y2} L ${x2} ${y2}`
}
```

또는 수직 기반 라우팅일 경우:

```ts
function treePathVertical(x1, y1, x2, y2) {
  const midY = (y1 + y2) / 2
  return `M ${x1} ${y1} L ${x1} ${midY} L ${x2} ${midY} L ${x2} ${y2}`
}
```

---

## 20.4 Anchor 계산

Edge는 단순히 node center를 연결하는 것이 아니라  
node box의 적절한 anchor point를 사용해야 한다.

예:

- Tree-Right → parent right edge, child left edge
- Tree-Left → parent left edge, child right edge
- Tree-Down → parent bottom edge, child top edge
- Radial → angle 기준 tangent/normal anchor

---

# 21. Node 생성 시 동작 규칙

Node 생성 시 내부적으로 아래 순서를 따른다.

```text
1. 새 Node ID 생성
2. parentId 결정
3. orderIndex 결정
4. layoutType 상속
5. shapeType/style 상속
6. depth 계산
7. subtree / layout 재계산
8. edge 생성
9. autosave dirty
10. history entry 기록
```

---

## 21.1 형제 노드 생성

기준 노드의 다음/이전 위치에 생성  
기준 노드의 shape/style/layout을 기본 상속

---

## 21.2 자식 노드 생성

부모가 되는 현재 선택 노드의 shape/style/layout을 기본 상속

---

## 21.3 다중 가지 생성

기준 노드 아래 subtree 전체를 일괄 생성  
생성된 subtree 전체는 기본적으로 기준 노드의 계열을 상속

---

# 22. Layout 변경 시 동작 규칙

사용자는 아래 2가지 변경을 할 수 있다.

## 22.1 Map 전체 Layout 변경
- map.defaultLayout 변경
- layoutType 미지정 subtree 전체에 영향
- 전체 맵 relayout

## 22.2 Subtree Layout 변경
- 특정 node.layoutType 변경
- 해당 subtree만 relayout
- edge path 재생성

---

# 23. Layout Reset 정책

Reset 수행 시:

```text
manualPosition 초기화
layout override 재검토
position 재계산
edge 재생성
collision 재보정
```

특히 Freeform/Kanban에서는 reset의 범위를 어떻게 잡을지 옵션화할 수 있다.

예:

- 전체 reset
- subtree reset
- manual offset만 reset

---

# 24. 성능 기준

초기 목표 성능은 다음과 같다.

| Node 수 | 반응 속도 목표 |
|---|---|
| 100 | 즉시 |
| 500 | 50ms 이하 |
| 1000 | 100ms 이하 |
| 3000 | 300ms 이하 |

이 목표를 위해 다음 전략을 사용한다.

- 2-pass layout
- subtree partial relayout
- viewport culling
- derived path 계산 최적화
- freeform/kanban 수동 영역 국소 업데이트

---

# 25. 향후 확장 고려

향후 아래 Layout 또는 Edge 정책이 추가될 수 있다.

- Fishbone Layout
- Timeline Layout
- OrgChart Layout
- Dependency Edge
- Reference Edge
- Edge arrow mode
- Straight-line override
- AI auto-layout recommendation

현재 문서는 이러한 확장을 막지 않도록 최소한의 공통 구조를 유지한다.

---

# 26. 구현 시 권장 TypeScript 구조

```ts
type LayoutGroup =
  | "radial"
  | "tree"
  | "hierarchy"
  | "process"
  | "freeform"
  | "kanban"

type LayoutDirection =
  | "left"
  | "right"
  | "up"
  | "down"
  | "bi"

type LayoutVariant =
  | "default"
  | "a"
  | "b"

type EdgeType =
  | "curve-line"
  | "tree-line"
```

예:

```ts
type ResolvedLayout = {
  layoutType: string
  group: LayoutGroup
  direction: LayoutDirection
  variant: LayoutVariant
  edgeType: EdgeType
}
```

---

# 27. 최종 요약

## 27.1 Layout 정책

```text
Radial
Tree
Hierarchy
ProcessTree
Freeform
Kanban
```

---

## 27.2 Edge 정책

```text
Radial → curve-line
Others → tree-line
```

---

## 27.3 Node 상속 정책

```text
child inherits parent layout
child inherits parent shape/style
font size uses level rule by default
subtree override allowed
```

---

## 27.4 Kanban 정책

```text
Kanban = board/column/card 구조
정책상 edge = tree-line
표시는 renderer에서 조절 가능
```

---

# 28. 관련 문서 (Cross-Reference)

| 문서 | 관련 내용 |
|------|---------|
| `docs/02-domain/domain-models.md § 2.2` | LayoutType 전체 15종 정의 (kebab-case DB 저장값 정본) |
| `docs/02-domain/domain-models.md § 6` | 스타일 상속 규칙, depth별 fontSize 확정값 |
| `docs/03-editor-core/layout/08-layout.md § 4.1` | LayoutType 목록, Layout Engine 기능 정의 |
| `docs/03-editor-core/layout/08-layout.md § 6.6` | Kanban depth 규칙 (board/column/card, `chk_nodes_kanban_depth`) |
| `docs/03-editor-core/layout/08-layout.md § 18` | 에지 렌더링 정책 (Kanban = 엣지 미표시) |
| `docs/02-domain/db-schema.md § 3` | nodes 테이블 DDL, `chk_nodes_layout_type` CHECK 제약 |
| `docs/03-editor-core/state-architecture.md` | MindmapDocument, Document Store, 5-Store 구조 |
| `docs/03-editor-core/node/02-node-editing.md` | 노드 생성/이동 시 layoutType 상속 적용 |

---

# 29. 한 줄 최종 결론

> easymindmap의 부모-자식 연결선은  
> **방사형 계열만 curve-line, 나머지 모든 Layout은 tree-line** 을 사용하며,  
> Node는 기본적으로 부모의 Layout과 Style을 상속하고,  
> 필요 시 subtree 단위로 Layout을 override 할 수 있다.
