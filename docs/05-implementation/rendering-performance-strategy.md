# Rendering Performance Strategy

문서 버전: v2.0  
상태: Final  
최종 결정: 2026-03-29  
관련 문서: `layout-coordinate-algorithm.md`, `state-architecture.md`, `edge-policy.md`

---

## 목적

대규모 노드 렌더링 최적화 및 뷰포트 좌표계 동기화 규약 정의.  
1,000개 노드 기준 60fps 유지, 뷰포트 상호작용(줌/팬) 시 좌표 변환의 일관성을 보장한다.

---

## 핵심 전략 개요

| 전략 | 목적 | 효과 |
|------|------|------|
| Viewport Culling | 화면 밖 노드 렌더링 제외 | DOM/SVG 요소 수 최소화 |
| Partial Relayout | 변경된 subtree만 재계산 | CPU 연산 절감 |
| Dirty Rendering | 변경된 노드만 재렌더링 | 불필요한 React 리렌더 방지 |
| Debounced Autosave | 입력 빈도 기반 저장 지연 | 네트워크 요청 최소화 |
| Coordinate Synchronization | 줌/팬 시 좌표 변환 일관성 | 렌더 좌표 오차 방지 |

---

## 1. Viewport Culling

현재 화면(viewport)에 포함된 노드만 렌더링한다.

```typescript
// 뷰포트 영역 내 노드만 필터링
function isNodeVisible(node: LayoutNode, viewport: ViewportState): boolean {
  const { zoom, panX, panY, width, height } = viewport;

  // world 좌표 → screen 좌표 변환
  const screenX = node.computedX * zoom + panX;
  const screenY = node.computedY * zoom + panY;
  const screenW = node.width * zoom;
  const screenH = node.height * zoom;

  // 뷰포트 경계와 AABB 교차 검사
  return (
    screenX + screenW >= 0 &&
    screenY + screenH >= 0 &&
    screenX <= width &&
    screenY <= height
  );
}
```

- 마진 버퍼(예: 200px)를 추가해 스크롤 시 깜빡임 방지
- Viewport Store의 `worldBounds`를 기준으로 필터링

---

## 2. Partial Relayout

변경된 subtree만 재계산한다.

- 노드 텍스트 변경 → 해당 노드 크기 재측정 → 부모 방향으로 bounding-box 전파
- 자식 추가/삭제 → 해당 subtree root부터 재계산
- 전체 맵 relayout은 최초 로드 및 레이아웃 타입 변경 시에만 실행

---

## 3. Dirty Rendering

변경된 노드만 렌더링한다.

- Zustand selector + `React.memo`로 변경 노드만 리렌더
- 노드 ID 기반 `Record<string, NodeRenderState>` 구조 활용 (→ `state-architecture.md`)
- SVG edge는 연결된 노드가 변경될 때만 업데이트

---

## 4. Debounced Autosave

| 트리거 유형 | debounce 시간 | 이유 |
|-------------|---------------|------|
| 텍스트 입력 | 500–1,000ms | 타이핑 중 과도한 저장 방지 |
| 노드 drag 종료 | 즉시 (0ms) | 위치 확정 시 저장 |
| 구조 변경 (create/delete) | 즉시 (0ms) | 데이터 유실 방지 |
| 레이아웃 변경 | 즉시 (0ms) | 설정 변경 즉시 반영 |

---

## 5. 좌표계 동기화 (Viewport Coordinate Synchronization)

### 5.1 좌표계 구분

easymindmap은 세 가지 좌표계를 명확히 구분한다.

| 좌표계 | 이름 | 설명 | 저장 여부 |
|--------|------|------|-----------|
| World 좌표 | `computedX / computedY` | Layout Engine이 계산한 노드의 논리적 위치 | ❌ (런타임만) |
| Manual 좌표 | `manualPosition.x / .y` | freeform 레이아웃 전용, 사용자가 drag한 위치 | ✅ DB 저장 |
| Screen 좌표 | `screenX / screenY` | 브라우저 픽셀 좌표 (렌더링에 사용) | ❌ (매 프레임 계산) |

### 5.2 좌표계 원점 정의

```
World 원점 (0, 0):
  - 루트 노드의 중심이 (0, 0)에 위치
  - 캔버스 중앙이 기본 표시 기준점
  - Y축: 아래 방향이 양수 (+Y)

Screen 원점 (0, 0):
  - 브라우저 뷰포트의 좌상단
  - Y축: 아래 방향이 양수 (+Y)
```

### 5.3 줌/팬 변환 공식

**World → Screen 변환** (렌더링 시 사용):

```
screenX = worldX × zoom + panX
screenY = worldY × zoom + panY
```

**Screen → World 변환** (마우스 클릭 위치를 노드 좌표로 변환 시):

```
worldX = (screenX - panX) / zoom
worldY = (screenY - panY) / zoom
```

TypeScript 구현:

```typescript
// Viewport Store의 상태 (state-architecture.md ViewportStore 참조)
interface ViewportState {
  zoom: number;   // 기본값: 1.0, 범위: 0.1 ~ 4.0
  panX: number;   // 뷰포트 X 이동량 (픽셀)
  panY: number;   // 뷰포트 Y 이동량 (픽셀)
  width: number;  // 캔버스 요소의 실제 픽셀 너비
  height: number; // 캔버스 요소의 실제 픽셀 높이
}

// World → Screen
function worldToScreen(
  worldX: number,
  worldY: number,
  viewport: ViewportState
): { x: number; y: number } {
  return {
    x: worldX * viewport.zoom + viewport.panX,
    y: worldY * viewport.zoom + viewport.panY,
  };
}

// Screen → World
function screenToWorld(
  screenX: number,
  screenY: number,
  viewport: ViewportState
): { x: number; y: number } {
  return {
    x: (screenX - viewport.panX) / viewport.zoom,
    y: (screenY - viewport.panY) / viewport.zoom,
  };
}
```

### 5.4 줌 중심점 유지 (Zoom-to-Point)

마우스 휠 줌 시, 마우스 커서 위치를 기준으로 줌해야 뷰포트가 자연스럽게 유지된다.

```typescript
// 마우스 위치(cursorScreenX, cursorScreenY)를 중심으로 줌 적용
function zoomToPoint(
  viewport: ViewportState,
  newZoom: number,
  cursorScreenX: number,
  cursorScreenY: number
): Pick<ViewportState, 'zoom' | 'panX' | 'panY'> {
  const zoomRatio = newZoom / viewport.zoom;

  return {
    zoom: newZoom,
    // 커서 위치가 변하지 않도록 pan 보정
    panX: cursorScreenX - zoomRatio * (cursorScreenX - viewport.panX),
    panY: cursorScreenY - zoomRatio * (cursorScreenY - viewport.panY),
  };
}
```

수학적 도출:
```
// 줌 전 커서의 world 좌표 (불변이어야 함)
worldCursorX = (cursorScreenX - panX) / zoom

// 줌 후 같은 world 좌표가 같은 screen 위치에 있으려면:
cursorScreenX = worldCursorX * newZoom + newPanX

// 풀면:
newPanX = cursorScreenX - worldCursorX * newZoom
        = cursorScreenX - ((cursorScreenX - panX) / zoom) * newZoom
        = cursorScreenX - (newZoom / zoom) * (cursorScreenX - panX)
```

### 5.5 Fit-to-Screen (전체 맵 화면 맞춤)

```typescript
function fitToScreen(
  worldBounds: BoundingBox,  // 전체 노드의 world 좌표 bounding box
  viewport: ViewportState,
  padding: number = 60
): Pick<ViewportState, 'zoom' | 'panX' | 'panY'> {
  const scaleX = (viewport.width  - padding * 2) / worldBounds.width;
  const scaleY = (viewport.height - padding * 2) / worldBounds.height;
  const newZoom = Math.min(scaleX, scaleY, 4.0);  // 최대 4배로 제한

  // 맵 중심이 뷰포트 중앙에 오도록 pan 계산
  const worldCenterX = worldBounds.x + worldBounds.width  / 2;
  const worldCenterY = worldBounds.y + worldBounds.height / 2;

  return {
    zoom: newZoom,
    panX: viewport.width  / 2 - worldCenterX * newZoom,
    panY: viewport.height / 2 - worldCenterY * newZoom,
  };
}
```

### 5.6 CSS Transform 적용

캔버스 컨테이너에 단일 `transform`을 적용하여 모든 자식 요소가 동일한 변환을 받는다.

```typescript
// React 컴포넌트에서 적용
const canvasStyle: React.CSSProperties = {
  transform: `translate(${panX}px, ${panY}px) scale(${zoom})`,
  transformOrigin: '0 0',  // 원점 고정: 좌상단
};
```

> `transformOrigin: '0 0'`으로 설정하면 위 공식의 `panX`, `panY`가 정확히 적용된다.  
> `transformOrigin: '50% 50%'`(기본값)은 공식과 다른 offset이 필요하므로 사용하지 않는다.

### 5.7 좌표 동기화 체크리스트

| 상황 | 처리 방법 |
|------|-----------|
| 노드 클릭 감지 | `screenToWorld`로 변환 후 노드 hit-test |
| 드래그 중 노드 이동 | mousemove delta를 `/ zoom`으로 world delta로 변환 |
| 노드 추가 위치 지정 | 빈 영역 클릭 시 `screenToWorld` 변환값 사용 |
| 줌 인/아웃 | `zoomToPoint` 함수로 pan 보정 |
| 전체 보기 | `fitToScreen` 함수로 zoom/pan 재계산 |
| 창 크기 변경 | `viewport.width/height` 갱신 후 `fitToScreen` 재실행 |

---

## 6. 렌더링 방식

| 단계 | 방식 | 이유 |
|------|------|------|
| MVP | SVG (edges) + HTML (node content) | 구현 단순, CSS 스타일링 용이 |
| V2 이후 | Canvas (선택적 확장) | 10,000+ 노드 시 SVG 성능 한계 |

현재 목표: SVG + HTML 방식으로 1,000 노드 / 60fps 달성.

---

## 7. 성능 목표

| 지표 | 목표 |
|------|------|
| 초기 로딩 | ≤ 3초 (1,000 노드 기준) |
| 렌더링 프레임 | 60fps (1,000 노드) |
| 텍스트 편집 반응 | ≤ 16ms (1 프레임 이내) |
| 줌/팬 반응 | ≤ 16ms (CSS transform 기반) |
| Partial Relayout | ≤ 50ms (subtree 100노드 기준) |

---

## 결론

```
Viewport Culling    → 화면 밖 노드 DOM 제외
Partial Relayout    → 변경 subtree만 재계산
Dirty Rendering     → React.memo + Zustand selector
Debounced Autosave  → 입력 유형별 debounce 차등 적용
좌표계 동기화       → World/Screen 이중 좌표계, zoom-to-point 공식으로 pan 보정
CSS Transform       → transformOrigin: '0 0', translate + scale 단일 적용
```
