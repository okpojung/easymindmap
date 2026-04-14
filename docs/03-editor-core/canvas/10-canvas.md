# 10. Canvas
## CANVAS

* 문서 버전: v1.0
* 작성일: 2026-04-14
* 참조: `docs/01-product/functional-spec.md § 5. CANVAS`, `docs/03-editor-core/state-architecture.md § 5.3`

---

### 1. 기능 목적

* 마인드맵 노드가 배치되는 **무한 캔버스(Infinite Canvas)** 를 제공하는 핵심 기능
* Pan / Zoom / Fit / Focus 등 캔버스 뷰포트(Viewport) 조작 기능 일체를 담당
* World 좌표계 ↔ Screen 좌표계 변환을 통해 줌/팬 상태를 일관되게 관리
* Viewport Store를 별도 분리하여 줌/팬 변경 시 Document 전체 재렌더링 방지

---

### 2. 기능 범위

* 포함:

  * 무한 캔버스 (SVG 기반 렌더링)
  * Zoom In / Zoom Out / 100% View
  * Fit Screen (전체 맵을 화면에 맞춤)
  * Pan Canvas (캔버스 이동)
  * Center Node (선택 노드를 화면 중앙으로)
  * Focus Node View (선택 노드+하위만 표시)
  * Fullscreen Mode
  * Minimap (탐색 보조)
  * World ↔ Screen 좌표 변환
  * Bottom Status Bar (zoom % / autosave 상태 / layout type 표시)

* 제외:

  * 노드 렌더링 (→ NODE_RENDERING)
  * 노드 선택 (→ SELECTION, `11-selection.md`)
  * 레이아웃 계산 (→ LAYOUT, `08-layout.md`)
  * 히스토리/Undo (→ HISTORY)
  * 저장 (→ SAVE)

---

### 3. 세부 기능 목록

| 기능ID     | 기능명           | 설명                        | 키보드 단축키                    | 마우스/터치               |
| --------- | -------------- | ------------------------- | -------------------------- | --------------------- |
| CANVAS-01 | Zoom In        | 캔버스 확대                   | `Ctrl + =`                 | `Ctrl + 휠 위`          |
| CANVAS-02 | Zoom Out       | 캔버스 축소                   | `Ctrl + -`                 | `Ctrl + 휠 아래`         |
| CANVAS-03 | Fit Screen     | 전체 맵을 화면에 맞춤             | `Ctrl + Shift + F`         | —                     |
| CANVAS-04 | Pan Canvas     | 손바닥 모드로 캔버스 이동           | `Space + 드래그` / `H`       | `우클릭+드래그` / `미들버튼+드래그` |
| CANVAS-05 | Center Node    | 선택 노드를 화면 중앙으로 이동 (줌 유지) | `Ctrl + Enter`             | 노드 우클릭 → 컨텍스트 메뉴     |
| CANVAS-06 | 100% View      | 줌 배율을 100%로 초기화          | `Ctrl + 0`                 | —                     |
| CANVAS-07 | Fullscreen Mode | 브라우저 전체화면 전환             | `F11` / `ESC`로 종료          | —                     |
| CANVAS-08 | Focus Node View | 선택 노드+하위만 표시, 상위 숨김      | `Alt + F`                  | 노드 우클릭 → 컨텍스트 메뉴     |
| CANVAS-09 | Minimap        | 전체 맵 축소 탐색 뷰             | —                          | minimap 클릭/drag       |
| CANVAS-10 | Status Bar     | zoom % / autosave / layout type 표시 | —                | —                     |

---

### 4. 기능 정의 (What)

#### 4.1 좌표계 정의

캔버스는 두 가지 좌표계를 사용한다:

| 좌표계            | 설명                           | 저장 여부     |
| -------------- | ---------------------------- | --------- |
| World 좌표 (worldX/Y) | 레이아웃 엔진 기준 좌표. 루트 노드 중심이 (0,0) | Layout Engine 저장 |
| Screen 좌표 (screenX/Y) | 브라우저 뷰포트 기준 픽셀 좌표 (렌더링용) | ❌ 매 프레임 계산 |

```text
World 원점 (0, 0):
  - 루트 노드의 중심
  - Y축: 아래 방향이 양수 (+Y)

Screen 원점 (0, 0):
  - 브라우저 뷰포트 좌상단
  - Y축: 아래 방향이 양수 (+Y)
```

#### 4.2 좌표 변환 공식

```text
World → Screen (렌더링):
  screenX = worldX × zoom + panX
  screenY = worldY × zoom + panY

Screen → World (마우스 클릭 위치 변환):
  worldX = (screenX - panX) / zoom
  worldY = (screenY - panY) / zoom
```

```typescript
interface ViewportState {
  zoom: number;   // 기본값: 1.0, 범위: 0.1 ~ 4.0
  panX: number;   // 뷰포트 X 이동량 (픽셀)
  panY: number;   // 뷰포트 Y 이동량 (픽셀)
  width: number;  // 캔버스 요소의 실제 픽셀 너비
  height: number; // 캔버스 요소의 실제 픽셀 높이
}

function worldToScreen(worldX: number, worldY: number, vp: ViewportState) {
  return { x: worldX * vp.zoom + vp.panX, y: worldY * vp.zoom + vp.panY };
}

function screenToWorld(screenX: number, screenY: number, vp: ViewportState) {
  return { x: (screenX - vp.panX) / vp.zoom, y: (screenY - vp.panY) / vp.zoom };
}
```

#### 4.3 ViewportState 구조

```typescript
type ViewportState = {
  zoom: number;                        // 현재 줌 배율 (기본: 1.0)
  pan: { x: number; y: number };       // 현재 팬 오프셋 (픽셀)
  canvasSize: { width: number; height: number }; // 캔버스 DOM 크기
  worldBounds: {
    minX: number; minY: number;
    maxX: number; maxY: number;
  } | null;                            // 전체 노드 영역 (Fit Screen 계산용)
  isPanning: boolean;                  // 팬 중 여부 (cursor 변경용)
  lastCenterNodeId: string | null;     // 마지막 Center Node ID
};
```

#### 4.4 Zoom to Point 알고리즘

휠 줌 시 커서 위치를 기준점으로 유지하는 공식:

```typescript
function zoomToPoint(
  viewport: ViewportState,
  cursorScreenX: number,
  cursorScreenY: number,
  newZoom: number
) {
  const zoomRatio = newZoom / viewport.zoom;
  return {
    zoom: newZoom,
    panX: cursorScreenX - zoomRatio * (cursorScreenX - viewport.pan.x),
    panY: cursorScreenY - zoomRatio * (cursorScreenY - viewport.pan.y),
  };
}
```

---

### 5. 동작 방식 (How)

#### 5.1 사용자 동작

| 동작                  | 입력                                | 결과                    |
| ------------------- | --------------------------------- | --------------------- |
| 확대                  | `Ctrl + =` / `Ctrl + 휠 위`         | zoom 증가               |
| 축소                  | `Ctrl + -` / `Ctrl + 휠 아래`        | zoom 감소               |
| 100% 보기             | `Ctrl + 0`                        | zoom = 1.0            |
| 전체 화면 맞춤            | `Ctrl + Shift + F`                | 전체 노드 영역에 맞게 zoom/pan |
| 팬 (이동)              | `Space + 드래그` 또는 `우클릭 + 드래그`      | pan 이동                |
| 선택 노드 중앙 이동         | `Ctrl + Enter`                    | 줌 유지, 선택 노드 화면 중앙     |
| 포커스 뷰               | `Alt + F`                         | 선택 노드+하위만 표시          |
| 전체화면                | `F11`                             | 브라우저 전체화면             |
| 전체화면 종료             | `ESC`                             | 일반 화면 복귀              |
| 빈 영역 클릭             | 마우스 클릭                           | 노드 선택 해제              |
| 노드 싱글 클릭            | 마우스 클릭                           | 노드 선택 + 추가 인디케이터 표시   |
| 노드 더블클릭             | 마우스 더블클릭                         | 텍스트 편집 모드 진입          |
| Minimap 클릭/drag     | minimap 클릭                        | 해당 영역으로 pan 이동        |
| 터치 핀치               | 2손가락 핀치                           | zoom 변경               |

---

#### 5.2 시스템 처리

* `Viewport Store`가 zoom / pan 상태를 독립 관리
* zoom/pan 변경 → Viewport Store만 업데이트 → Document 재렌더링 없음
* 휠 이벤트 → `zoomToPoint()` 계산 → panX/Y 보정으로 커서 기준 확대
* Fit Screen → `worldBounds` 기준으로 zoom/pan 계산 (노드 영역 + 여백 padding)
* Center Node → 선택 노드의 worldX/Y → screen 중앙 기준 pan 계산 (zoom 불변)
* Focus Node View → 선택 노드 이외 상위 노드를 UI에서 숨김 처리 (DOM visibility)
* Minimap → `worldBounds` 기준 축소 뷰, 현재 viewport 영역을 rect로 표시

---

#### 5.3 표시 방식

* 무한 캔버스: SVG 기반 렌더링
* zoom 범위: 10% ~ 400% (0.1 ~ 4.0)
* 팬 중: 커서 `grab` → `grabbing` 전환
* Minimap: 우하단 고정 패널, 현재 보이는 영역 표시
* Status Bar (하단): zoom % / autosave 상태 / layout type / 커서 좌표

---

### 6. 규칙 (Rule)

---

#### 6.1 Zoom 범위 규칙

* 최솟값: `0.1` (10%)
* 최댓값: `4.0` (400%)
* 기본값: `1.0` (100%)
* 범위 초과 시 클램핑(clamping) 처리

---

#### 6.2 Center Node 규칙

* zoom 배율을 변경하지 않는다
* pan만 수행하여 선택 노드를 화면 중앙으로 이동
* 노드 미선택 상태에서 호출 시 동작 없음

---

#### 6.3 Fit Screen 규칙

* 전체 노드의 worldBounds (minX/Y ~ maxX/Y) 계산
* 캔버스 크기 대비 비율로 zoom 결정
* 여백(padding) 40px 적용
* 노드가 없는 빈 맵: 기본 zoom/pan으로 초기화

---

#### 6.4 Focus Node View 규칙

* 선택 노드와 그 하위 Subtree 노드만 표시
* 상위 노드 및 다른 Subtree 노드는 UI에서 숨김
* Focus 해제: `ESC` 또는 Focus 버튼 재클릭 → 전체 노드 복원
* Focus 상태에서도 편집 기능은 정상 동작

---

#### 6.5 Pan 규칙

* `Space + 드래그`, `우클릭 + 드래그`, `미들버튼 + 드래그` 세 가지 방식 지원
* Pan 중 `isPanning = true` → cursor 변경 (`grab` → `grabbing`)
* Pan 범위 제한 없음 (무한 캔버스)

---

#### 6.6 좌표계 분리 규칙

* World 좌표 ↔ Screen 좌표를 혼용 금지
* 레이아웃 엔진 및 노드 저장은 항상 World 좌표 기준
* 렌더링 및 마우스 이벤트 처리는 Screen 좌표 기준
* `worldToScreen()` / `screenToWorld()` 변환 함수 필수 사용

---

#### 6.7 Viewport Store 분리 규칙

* Viewport Store는 Document Store와 완전히 분리
* zoom/pan 변경은 Viewport Store만 업데이트
* Document 전체 재렌더링 없이 뷰포트 변경 가능
* 이유: zoom 변경 → document rerender → drag 성능 저하 방지

---

#### 6.8 Minimap 규칙

* 전체 `worldBounds` 기준으로 축소 뷰 렌더링
* 현재 viewport 영역을 반투명 rect로 표시
* minimap 클릭 → 해당 world 좌표로 pan 이동
* minimap drag → 실시간 pan 이동
* 노드 수가 많을 때도 minimap은 별도 저해상도 렌더링

---

### 7. 무한 캔버스 구조

```text
┌─────────────────────────────────────────────────────────────────┐
│ Toolbar / MenuBar                                               │
├────────────┬────────────────────────────────────────┬──────────┤
│            │                                        │          │
│ Left       │      Infinite Canvas (SVG)             │  Right   │
│ Sidebar    │    ┌─────────────────────────┐         │  Panel   │
│            │    │  Node Tree (World)       │         │          │
│            │    │    ○ Root               │         │          │
│            │    │   / \                   │         │          │
│            │    │  ○   ○                  │         │          │
│            │    └─────────────────────────┘         │          │
│            │                          [Minimap]     │          │
├────────────┴────────────────────────────────────────┴──────────┤
│ Status Bar: 75% | Saved | radial-bidirectional | (124, -32)    │
└─────────────────────────────────────────────────────────────────┘
```

---

### 8. Status Bar 표시 항목

| 항목            | 설명                         | 단계     |
| ------------- | -------------------------- | ------ |
| zoom %        | 현재 줌 배율 (예: 75%)           | MVP    |
| autosave 상태   | Saved / Saving... / Error  | MVP    |
| layout type   | 현재 레이아웃 명칭 (예: 방사형-양쪽)     | MVP    |
| 커서 좌표         | World 좌표 기준 (예: 124, -32)  | MVP    |
| collaborator 수 | 현재 접속 중인 협업자 수             | V1~    |
| 새 메시지 dot     | 미확인 협업 메시지 표시              | V2~    |

---

### 9. 예외 / 경계 (Edge Case)

* **노드 없는 빈 맵**: Fit Screen → 기본 zoom(1.0) + 캔버스 중앙 pan으로 초기화
* **단일 노드 맵**: Fit Screen → 루트 노드 중앙 배치
* **zoom 범위 초과**: 0.1 미만 / 4.0 초과 입력 → 클램핑 처리
* **Focus Node View + 루트 노드 선택**: 전체 맵 표시와 동일
* **pan 무한 이동 후 맵 분실**: `Fit Screen`으로 복구
* **터치 핀치 + 마우스 휠 동시**: 이벤트 우선순위 정책 필요 (터치 우선)
* **Fullscreen + Minimap**: Fullscreen 상태에서도 Minimap 표시 유지
* **매우 큰 맵 (노드 1000+)**: viewport culling으로 화면 밖 노드 렌더링 제외

---

### 10. 권한 규칙

| 역할      | 권한                                  |
| ------- | ----------------------------------- |
| creator | 전체 캔버스 조작 (zoom/pan/fit/focus 등)  |
| editor  | 전체 캔버스 조작 가능                       |
| viewer  | 읽기 전용 (zoom/pan은 가능, 편집 불가)        |

---

### 11. DB 영향

* 캔버스 뷰포트 상태(zoom/pan)는 **DB에 저장하지 않는다**
* 클라이언트 세션 메모리(Viewport Store)에서만 관리
* 맵 재접속 시 초기 뷰포트: Fit Screen 상태로 복원

> 선택적 확장: `maps.last_viewport` JSONB 컬럼에 마지막 뷰포트 저장 (사용자 편의 기능, 후순위)

---

### 12. API 영향

* 캔버스 조작(zoom/pan)은 서버 API 호출 없음 (순수 클라이언트 동작)
* Focus Node View: 로컬 상태 변경만 (API 없음)
* Minimap: 로컬 렌더링 (API 없음)

---

### 13. 연관 기능

* LAYOUT (`08-layout.md` — world 좌표 계산)
* SELECTION (`11-selection.md` — 선택 노드 기반 Center/Focus)
* NODE_RENDERING (노드 SVG 렌더링)
* HISTORY (Undo/Redo — viewport 상태 제외)
* SAVE (`14-save.md` — autosave 상태 표시)
* COLLABORATION (협업자 커서 표시, V2~)

---

### 14. 예시 시나리오

#### 시나리오 1 — Fit Screen으로 전체 맵 복원

1. 사용자: 팬 조작 후 맵 분실
2. `Ctrl + Shift + F` 입력
3. 시스템: `worldBounds` 계산 → zoom/pan 재설정
4. 전체 노드가 화면에 맞게 표시

#### 시나리오 2 — 휠 줌 (커서 기준)

1. 사용자: 특정 노드 위에서 `Ctrl + 휠 위`
2. 시스템: `zoomToPoint()` 계산 → panX/Y 보정
3. 커서 위치의 노드가 제자리에 유지된 채 확대

#### 시나리오 3 — Center Node

1. 사용자: 노드 선택 후 `Ctrl + Enter`
2. 시스템: 선택 노드의 worldX/Y → screen 중앙 기준 panX/Y 계산
3. zoom 불변, pan만 조정하여 해당 노드 화면 중앙 배치

#### 시나리오 4 — Focus Node View

1. 사용자: `## 기능 정의` 노드 선택 후 `Alt + F`
2. 시스템: 해당 노드 및 하위 Subtree만 표시, 상위 숨김
3. 집중 편집 모드로 전환
4. `ESC` 입력 → 전체 노드 복원

#### 시나리오 5 — Minimap으로 빠른 탐색

1. 사용자: 대형 맵에서 특정 영역 탐색
2. Minimap의 원하는 위치 클릭
3. 시스템: 클릭 위치의 world 좌표로 pan 이동

---

### 15. 구현 우선순위

#### MVP

* Zoom In / Out / 100% View
* Fit Screen
* Pan Canvas (Space + 드래그, 우클릭 + 드래그)
* Center Node (Ctrl + Enter)
* World ↔ Screen 좌표 변환
* Viewport Store 분리 구현
* Status Bar (zoom % / autosave / layout type)

#### 2단계

* Focus Node View (Alt + F)
* Fullscreen Mode (F11)
* Minimap
* 터치 핀치 줌 지원
* 커서 좌표 Status Bar 표시

#### 3단계

* 협업자 커서 위치 Canvas 표시 (V2~)
* 마지막 뷰포트 서버 저장 (`maps.last_viewport`)
* 대형 맵 viewport culling 성능 최적화

---
