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

### 16. Zoom 스냅 포인트 정책

휠로 줌을 조작할 때 자주 쓰이는 배율에서 짧게 멈추는 스냅 동작을 제공한다.

#### 스냅 포인트 목록

```text
25% → 50% → 75% → 100% → 125% → 150% → 200% → 300% → 400%
```

#### 동작 규칙

* 휠로 줌 조작 시 위 배율에 도달하면 **약 50ms 스냅 딜레이**를 적용한다
* 스냅 딜레이 동안 추가 휠 입력이 없으면 해당 배율에 정지한다
* 추가 휠 입력이 있으면 딜레이 없이 다음 배율로 이동한다
* 스냅은 정밀 조작 보조 목적이며, 강제 고정이 아니다 (휠을 빠르게 돌리면 통과 가능)

#### 스냅 포인트 의미

| 배율   | 용도                          |
| ----- | ----------------------------- |
| 25%   | 대형 맵 전체 조망                  |
| 50%   | 절반 축소 — 구조 파악               |
| 75%   | 약간 축소 — 맥락 유지               |
| 100%  | 기본 배율 (실제 크기)              |
| 125%  | 약간 확대 — 편집 보조               |
| 150%  | 중간 확대 — Fit Screen 상한 기준   |
| 200%  | 2배 확대 — 세부 편집               |
| 300%  | 3배 확대                        |
| 400%  | 최대 배율                        |

---

### 17. Zoom 단계 크기 규칙

줌 조작 방식에 따라 단계 크기를 다르게 적용한다.

| 조작 방식               | 단계 크기 | 기준점                     |
| ------------------- | ------ | ------------------------ |
| 툴바 버튼 (`+` / `-`)   | 10% 단위 | 화면 중앙 기준                |
| 단축키 (`Ctrl + =` / `Ctrl + -`) | 10% 단위 | 화면 중앙 기준 |
| 마우스 휠 (`Ctrl + 휠`)  | 5% 단위  | 마우스 커서 위치 기준 (`zoomToPoint`) |
| 트랙패드 핀치             | 5% 단위  | 핀치 중심점 기준               |

#### 설계 근거

* 버튼/단축키는 **의도적 단계 이동**이므로 10% 단위로 빠른 배율 전환을 제공한다
* 휠/핀치는 **연속적 정밀 조작**이므로 5% 단위로 세밀한 제어를 제공한다
* 두 방식의 단계 크기 차이는 스냅 포인트 도달 빈도와도 연동된다

---

### 18. Fullscreen 툴바 Auto-hide

전체화면(Fullscreen) 모드에서 툴바 표시 방식을 별도 정의한다.

#### 동작 규칙

* 전체화면 진입 시 상단 툴바는 **기본 숨김** 상태로 전환한다
* 마우스 커서를 화면 상단으로 이동하면 툴바가 **자동으로 나타난다** (Auto-hide 방식)
* 마우스가 툴바 영역에서 벗어나면 일정 시간(권장: 1.5초) 후 다시 숨김 처리한다
* 키보드 단축키는 툴바 표시 여부와 무관하게 항상 동작한다

#### 이유

* 전체화면 모드의 목적은 캔버스 최대 활용이다 — 툴바가 상시 표시되면 목적에 반한다
* 필요할 때만 툴바를 노출하여 몰입 편집 환경을 제공한다

#### 구현 참고

```typescript
// 마우스 Y 위치가 툴바 높이(px) 이내일 때 툴바 표시
const handleMouseMove = (e: MouseEvent) => {
  if (isFullscreen) {
    setToolbarVisible(e.clientY <= TOOLBAR_HEIGHT);
  }
};
```

---

### 19. Focus Node View — Breadcrumb (상위 경로 표시)

Focus Node View 활성 시 현재 포커스 위치의 상위 경로를 화면 상단에 표시한다.

#### 동작 규칙

* Focus Node View 진입 시 화면 상단에 **Breadcrumb 배너**를 표시한다
* Breadcrumb 형식: `Root > 상위노드명 > ... > 현재Focus노드명 (이 노드부터 보기)`
* 각 Breadcrumb 항목은 클릭 가능하며, 클릭 시 해당 노드로 Focus를 이동한다
* Focus 해제(`ESC` 또는 버튼 재클릭) 시 Breadcrumb도 함께 사라진다
* Focus 중첩 시 Breadcrumb도 중첩 경로를 반영하여 업데이트된다

#### 예시

```text
[전체 맵 구조]
Root
├── 전략        ← 숨김
│   ├── AI전략  ← Focus 진입점 (선택 노드)
│   │   ├── 모델 선택         ← 표시
│   │   └── 데이터 파이프라인  ← 표시
│   └── 비용절감 ← 숨김
└── 운영         ← 숨김

[Focus Node View 적용 결과]
AI전략
├── 모델 선택
└── 데이터 파이프라인

[Breadcrumb 표시]
Root > 전략 > AI전략 (이 노드부터 보기)
```

#### UI 위치

* 화면 상단 — 툴바 하단 또는 캔버스 최상단에 고정 배너로 표시
* 배너는 반투명 배경으로 캔버스 위에 오버레이
* 활성 상태에서 툴바 Focus 버튼도 하이라이트 표시

---

### 20. Freeform 보조 배치 정책

Grid Snapping과 Collision Detection은 **freeform layout에서만** 선택적으로 적용한다.

Auto Layout 계열에서는 Layout Engine이 좌표를 결정하므로 사용자의 grid snapping을 적용하지 않는다.

| 항목 | MVP 정책 |
|---|---|
| Grid Snapping | 선택 옵션, 기본 **OFF** |
| Collision Detection | 기본 경고 또는 약한 보정 (강제 이동 없음) |
| Auto Layout 충돌 방지 | Layout Engine의 Measure / Arrange / CollisionResolver에서 처리 |
| Freeform 충돌 방지 | 사용자가 수동 위치 조정 가능하므로 강제 이동하지 않음 |

#### Grid Snapping 동작

* `freeform` layoutType에서 노드 drag 종료 시 가장 가까운 grid 격자에 snap
* Grid 크기: 기본 20px (사용자 설정 가능)
* Auto Layout 모드에서는 grid snapping 비활성 (Layout Engine이 좌표 결정)

#### Collision Detection 동작

* 두 노드의 bounding box가 겹칠 경우 경고 표시 또는 약한 보정(soft push)
* 강제로 노드를 이동시키지 않으며, 사용자가 직접 해소
* Auto Layout 계열의 충돌은 CollisionResolver가 Measure/Arrange 단계에서 자동 처리

---
