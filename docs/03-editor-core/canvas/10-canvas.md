# 10. Canvas
## CANVAS

* 문서 버전: v1.1
* 작성일: 2026-04-14
* 최종 갱신: 2026-05-28 (§ 21~27 추가 — UI 디자인 시안 v1.1 반영)
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

#### 6.5 Pan 규칙 (MVS 구현 — 2026-07 갱신)

* Pan은 **Pan 모드(H 키/✋ 버튼)의 빈 캔버스 드래그, 또는 미들버튼
  드래그**에서만 동작한다. 일반 모드의 빈 캔버스 드래그는 **러버밴드
  다중 선택**(§6.5.1)이다.
* **노드 위에서 시작한 드래그는 Pan 모드 여부와 무관하게 항상 "노드
  이동(드래그&드롭)"** 이다 — Pan 모드가 노드 드래그를 막으면 좌/우
  이동 등 노드 조작이 전부 안 되는 것처럼 보인다 (2026-07 수정).
* Pan 모드 시인성: 상단 중앙 배지(✋ Pan 모드 — 드래그로 화면 이동 · H 키로
  해제) + 캔버스 테두리 하이라이트 + 커서 `grab`(드래그 중 `grabbing`).
* Pan 범위 제한 없음 (무한 캔버스)

#### 6.5.1 러버밴드 다중 선택 (MVS 구현 — 2026-07)

* 일반 모드에서 빈 캔버스를 드래그하면 선택 사각형이 그려지고, 사각형에
  걸친 모든 노드가 다중 선택된다 (`interactionStore.multiSelectedIds`).
* 다중 선택 상태에서 스타일 탭(도형·색·테두리·강조·정렬)은 선택 노드
  전체에 **일괄 적용**되며 undo 한 단계로 기록된다
  (`updateNodesStyle` / `updateNodesTextAlign`).
* 사이드바 헤더에 "N개 노드 선택 · 일괄 편집" 표시. 단일 클릭·Esc로 해제.

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

> 참고 — UI 디자인 시안 v1.1에서는 좌·우 패널을 **하나의 좌측 통합 사이드바**로 합쳤다. 자세한 내용은 § 21 참조.

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

## v1.1 추가 — UI 디자인 시안 반영 (2026-05-28)

> 시안 파일: `apps/frontend/EasyMindMap Editor.html` (디자인 초안 v1.1)
> 디자인 방향: 따뜻한 크림 + 앰버 액센트 (MindManager 계열) + 다크 옵션
> 아래 § 21~27 절은 v1.0 명세를 시각/구조 측면에서 보강한다.

---

### 21. 캔버스 영역 레이아웃 (시안 확정)

좌·우 두 개 패널 대신 **좌측 통합 사이드바** 하나로 단순화한다. 우측 패널은 폐지하고, 그 기능(Style/Layout/Content/Note·Tag/AI Inspector)은 좌측 사이드바의 "속성" 그룹에 통합한다.

```text
┌─────────────────────────────────────────────────────────────────┐
│ Top Toolbar                                                     │
├──────┬───────┬──────────────────────────────────────────────────┤
│ Rail │ Group │                                                  │
│ 44px │ Panel │     Canvas (SVG, flex:1)                         │
│      │ 300px │     점 그리드 배경 · 24px × zoom                  │
│ 탐색 │       │                                                  │
│  🌲  │ 아웃  │     ┌─ 좌상단: 레이아웃 힌트 뱃지                 │
│  🔍  │ 라인  │     ├─ 우상단: 플로팅 액션 툴바                   │
│  📑  │       │     │   · 노드 그룹: [+다중자식] [🗑삭제]         │
│  ⏱  │       │     │   · 보기 그룹: [✋Pan][🎯Focus][⊙Fit][⛶FS] │
│ ──── │       │     │                                            │
│ 속성 │       │     └─ 우하단(향후): Minimap                     │
│  🎨  │       │                                                  │
│  ▦   │       │                                                  │
│  🔗  │       │                                                  │
│  📝  │       │                                                  │
│  ✨  │       │                                                  │
├──────┴───────┴──────────────────────────────────────────────────┤
│ Bottom Status Bar (zoom 컨트롤 + 저장상태 + 협업 + 좌표)         │
└─────────────────────────────────────────────────────────────────┘
```

#### 21.1 좌상단 캔버스 힌트 뱃지

선택된 레이아웃과 자동 배치 상태를 작은 pill 형태로 알린다.

| 요소 | 값 |
|---|---|
| 위치 | `top: 14, left: 14`, `zIndex: 5` |
| 형태 | pill (`border-radius: 20`) |
| 내용 | `● {레이아웃명} ({엣지스타일}) · 자동 배치 · {n} 노드 · {zoom}%` |
| 예시 | `● 방사형 · 양쪽 (곡선) · 자동 배치 · 20 노드 · 100%` |

#### 21.2 우상단 플로팅 액션 툴바

좌클릭 기반 컨텍스트 메뉴는 별도로 제공하지 않는다 (우클릭 메뉴는 향후 단계). 대신 노드 선택 시 사용 가능한 액션을 우상단 플로팅 툴바에 **두 그룹**으로 노출한다.

| 그룹 | 라벨 | 버튼 | 활성 조건 | 단축키 |
|---|---|---|---|---|
| 노드 | **노드** | `+` 다중 자식 추가 | 선택 노드 있을 때 | `Ctrl+Space` |
| 노드 | | 🗑 노드 삭제 | 선택 노드 있을 때 | `Del` |
| 보기 | **보기** | ✋ Pan 모드 | 항상 | `H` |
| 보기 | | 🎯 선택 Focus | 선택 노드 있을 때 | `Alt+F` |
| 보기 | | ⊙ Fit Screen | 항상 | `Ctrl+Shift+F` |
| 보기 | | ⛶ Fullscreen | 항상 | `F11` |

> 시각 처리: 그룹 사이에 1px divider, 그룹 시작에 9.5px 700 weight `letter-spacing: 0.4` 의 uppercase 라벨.

#### 21.3 점 그리드 배경

캔버스 배경은 단일 `background` shorthand로 페인트한다 (React가 shorthand/longhand 충돌 경고를 발생시키지 않도록).

```ts
style={{
  background: `${tokens.canvas} radial-gradient(circle at center, ${tokens.border}aa 1px, transparent 1px) 0 0 / ${24 * scale}px ${24 * scale}px repeat`,
}}
```

- 그리드 간격 = `24 * zoomScale` → 줌과 함께 자연스럽게 늘어남
- 다크 테마에서는 `tokens.canvas`가 어두워지면서 그리드 점도 자동으로 약하게 보임

---

### 22. 4방향 노드 추가 인디케이터 시각 명세 (NODE-IND-01~04)

선택 노드가 있을 때 SVG 내부에 인디케이터를 함께 그린다. `02-node-editing.md § NODE-IND` 의 4종 기능 정의를 시각화한다.

```text
                  [+]   ⬆ NODE-IND-01 — 부모 노드 중간 삽입
                   :    : (점선)
                   :
   NODE-IND-03 [+]:::::[ 선택 노드 ]:::::[+]  NODE-IND-04
   형제(이전)              :              형제(다음)
                           :
                          [+]   ⬇ NODE-IND-02 — 자식 노드 추가
```

| 속성 | 값 |
|---|---|
| 원 반지름 | 11px |
| 원 테두리 | 1.8px (앰버 primary) |
| 원 배경 | surface (라이트: 흰색 / 다크: 어두운 회색) |
| 십자(+) | 5px × 5px, 1.8px stroke, 둥근 끝 |
| 연결자 | 점선 `2 3`, primary 색, 1.3px |
| Root에서 disabled | ⬆ ⬅ ➡ 모두 opacity 0.25 (자식 추가만 활성) |
| 단축키 안내 | 인디케이터 옆 텍스트 라벨 **표시하지 않음** (시각 노이즈 방지). 안내는 캔버스 위 별도 placement 또는 우상단 툴바의 `+` 버튼 hover tooltip으로 제공 |

---

### 23. 노드 자동 크기 & 자동 줄바꿈 (NR-03, NR-04 시각 구현)

노드 폭은 텍스트 길이에 따라 자동 결정되며, max-width 초과 시 자동 줄바꿈한다. **수동 줄바꿈(`\n`)은 항상 우선**한다.

#### 23.1 depth별 폭/높이 토큰

| depth | 역할 | minW | maxW | fontSize | fontWeight | lineHeight | padX | padY |
|---|---|---|---|---|---|---|---|---|
| 0 | Root | 170 | 260 | 18 | 700 | 24 | 22 | 14 |
| 1 | Branch | 150 | 240 | 14 | 600 | 18 | 14 | 9 |
| 2 | Leaf | 130 | 320 | 13 | 500 | 18 | 14 | 9 |

> Branch에 아이콘(NS-05)이 있는 경우 `padX + 22px` 만큼 텍스트 공간을 좌측에 추가 확보한다.

#### 23.2 글자 폭 측정 (Pretendard 기준 경험치)

| 문자 종류 | 폭 |
|---|---|
| CJK (한/중/일) | `fontSize × 1.00` |
| 공백 | `fontSize × 0.34` |
| 숫자 | `fontSize × 0.58` |
| 기타 (영문/기호) | `fontSize × 0.55` |

#### 23.3 줄바꿈 알고리즘 (의사 코드)

```text
1. text를 \n 기준으로 segments 분리 (수동 줄바꿈 보존)
2. 각 segment에 대해:
   a. 공백 단위로 토큰화
   b. innerMaxW = maxW - padX*2 - iconReserve
   c. 토큰을 한 줄에 누적, 누적 폭 > innerMaxW 이면 줄 분리
   d. 단일 토큰이 innerMaxW 보다 길면 글자 단위로 break
3. 최종 폭 = clamp(min, ceil(widest_line + padX*2 + iconReserve), max)
4. 최종 높이 = line_count * lineHeight + padY*2
```

#### 23.4 텍스트 렌더링

- SVG `<text>` 다중 줄: 각 줄을 별도 `<text>` 요소로, `y`는 `(i - (n-1)/2) * lineHeight + fontSize * 0.34` 로 수직 중앙 정렬
- 텍스트는 항상 `text-anchor="middle"` (수평 중앙)
- Branch 아이콘이 있으면 텍스트 `x` 를 `+10px` 시프트하여 아이콘과 겹치지 않게

---

### 24. 태그 칩 시각 명세 (TAG-04, `docs/assets/태그2.png` 형식)

태그는 노드 **하단 외부**에 깃발(리본) 모양 칩으로 표시한다. 노드 우상단에 떠 있는 채움 뱃지는 액션 버튼처럼 보이므로 사용하지 않는다.

#### 24.1 형태

```text
┌─ 노드 ─────────────────┐
│  에디터 코어 — 노드 CRUD  │
└────────────────────────┘
  ◢ MVP  | ✕   ◢ Core | ✕    ← 노드 하단, 좌측에서부터 정렬
   ↑
   화살표 꼬리 (좌측)
```

#### 24.2 측정값

| 속성 | 값 |
|---|---|
| 위치 | 노드 bottom + 6px gap |
| 정렬 | 노드 좌측 edge + 8px 들여쓰기부터 좌→우 |
| 칩 높이 | 16px |
| 화살표 꼬리 폭 | 6px |
| 내부 padding X | 8px |
| ✕ 핸들 폭 | 14px |
| 칩 사이 gap | 4px |
| 라벨 폰트 | 10px / 600 / letter-spacing 0.2 |
| 우측 라운드 | radius 3px |
| 테두리 | 0.8px (칩 색상 family border) |

#### 24.3 색상 family 매핑

태그 명칭별 의미색을 고정 매핑한다. 사용자가 직접 색을 선택하지 않아도 일관된 색 분류가 가능하다.

| 태그명 | family | light bg | light text | dark bg | dark text |
|---|---|---|---|---|---|
| `MVP` `Core` | amber | `#FEF3C7` | `#92400E` | `#3B2A0A` | `#FBBF24` |
| `AI` | violet | `#EDE9FE` | `#5B21B6` | `#2E1B4C` | `#C4B5FD` |
| `Export` | teal | `#CCFBF1` | `#115E59` | `#134E4A` | `#5EEAD4` |
| `V1` `V2` `V3` | blue | `#DBEAFE` | `#1E40AF` | `#172554` | `#93C5FD` |
| `Q1`~`Q4` | green | `#DCFCE7` | `#166534` | `#14532D` | `#86EFAC` |
| `Auth` `UI` `UX` | rose | `#FFE4E6` | `#9F1239` | `#4C0519` | `#FDA4AF` |
| 그 외 | slate | `#F1F5F9` | `#475569` | `#1E293B` | `#94A3B8` |

> 노드 데이터 모델: `node.tags: string[]` (다중 태그). 단일 `node.tag: string` 도 호환.

#### 24.3.1 ✕ 핸들 동작 (MVS 구현 — 2026-07)

캔버스 태그 칩의 **✕ 클릭 = 해당 태그 삭제** (`documentStore.removeNodeTag`).
✕ 핸들은 투명 히트 원(r=7)으로 클릭 판정을 넓히고, `pointerdown`/`click`을
`stopPropagation` 해 노드 선택·드래그로 번지지 않는다. 호버 시 "태그 삭제"
네이티브 툴팁 표시. (노트·태그 탭의 칩 ✕와 동일한 동작으로 통일)

#### 24.4 SVG path 정의

```text
M  x0,        ymid       — 화살표 꼬리 끝
L  x1,        ytop        — 좌상단 (x1 = x0 + arrowW)
L  x2 - 3,    ytop        — 우상단 직전
Q  x2,  ytop, x2, ytop+3  — 우상단 라운드
L  x2,        ybot - 3    — 우측 수직
Q  x2,  ybot, x2-3, ybot  — 우하단 라운드
L  x1,        ybot        — 좌하단
Z
```

#### 24.5 ✕ 삭제 핸들

- 라벨과 ✕ 사이 1px 세로 divider (`opacity 0.25`)
- ✕ 자체는 두 개의 line으로 그려 1.2px stroke (`opacity 0.65`)
- 호버 시 opacity 1.0로 진해짐 (구현 시 `<g pointer-events="auto" style="cursor:pointer">`)

---

### 25. 줌 적용 범위 — 확정 (6.7 규칙 시각 구현)

Viewport Store 분리 규칙(§ 6.7)을 시각적으로 명확히 한다.

| 영역 | 줌 적용 |
|---|---|
| Top Toolbar | ❌ 고정 |
| Left Unified Sidebar | ❌ 고정 |
| Bottom Status Bar | ❌ 고정 |
| Canvas SVG `<g>` 내부 (노드/엣지/인디케이터/태그/Soft Lock) | ✅ |
| 점 그리드 배경 | ✅ (`backgroundSize × scale`) |
| 캔버스 좌상단 힌트 뱃지, 우상단 플로팅 툴바 | ❌ 고정 |
| 협업 커서 화살표 | ✅ (scale로 좌표 보정) |

#### 25.1 SVG 구현

```html
<svg viewBox="0 0 W H">
  <g transform="translate(CX,CY) scale(scale) translate(-CX,-CY)">
    <!-- edges, nodes, indicators, tags, soft-lock -->
  </g>
</svg>
```

- `translate-scale-translate` 패턴으로 캔버스 중앙 기준 확대
- React 리렌더링 없이 `transform` 속성만 갱신하므로 60fps 유지

---

### 26. Soft Lock 시각 표현 (V1 — `25-map-collaboration.md` 참조)

다른 사용자가 편집 중인 노드는 다음 두 가지로 표시한다.

| 요소 | 사양 |
|---|---|
| 외곽 테두리 | 노드 외곽 2.5px 편집자 색 실선 (1px stroke + 3px outer padding) |
| 편집자 라벨 | 노드 하단 외부 (태그 칩과는 별도 라인) — `✏ {이름} 편집 중` 둥근 pill |
| 라벨 색 | 편집자 협업 색상 채움 + 흰색 글자 |
| 라벨 크기 | 92 × 18, radius 9, fontSize 10 / 600 |
| 협업 커서 | 화살표 + 이름 태그가 노드 우상단 외부에 떠 있음 |

> Soft Lock 노드는 다른 사용자가 클릭해도 편집 진입이 차단된다 (`shake` 애니메이션 + 토스트 안내).

---

### 27. 레이아웃별 엣지 스타일 (시안 확정)

레이아웃마다 시각적 구분이 명확하도록 엣지 그리기 방식을 분리한다. 사용자 지정 엣지 스타일은 V1+ 기능이며, MVP에서는 레이아웃 종류에 따라 자동 결정된다.

| 레이아웃 | 엣지 스타일 | 굵기 |
|---|---|---|
| `radial-bidirectional` | cubic bezier (S-curve), 부드러운 곡선 | 2.2px (root→branch), 1.6px (branch→leaf) |
| `radial-right` / `radial-left` | cubic bezier | 동일 |
| `tree-right` / `tree-left` | orthogonal **H-V-H** (직각 가로→세로→가로) | 2.2 / 1.6 |
| `tree-up` / `tree-down` | orthogonal **V-H-V** | 2.2 / 1.6 |
| `hierarchy-right` / `hierarchy-left` | **L-shape** (들여쓰기 가이드 라인 — 부모 좌측 12px 위치에서 수직선 + 자식 좌단으로 짧은 수평선) | 1.4 |
| `process-tree-*` | (V1) 화살표 마커 부착 직선 | 1.8 |
| `freeform` | 곡선 (radial과 동일) | 동일 |
| `kanban` | 엣지 비표시 (보드 컬럼/카드 시각 그룹화로 대체) | — |

#### 27.1 직각 엣지 — Tree-right 예시

```text
parent right edge  ──┐                ┌── child left edge
                     │                │
                     └────────────────┘
                          mid X
```

```ts
const fx = parent.x + parent.w/2;
const tx = child.x - child.w/2;
const mx = fx + (tx - fx) * 0.5;
d = `M ${fx} ${fy} H ${mx} V ${ty} H ${tx}`;
```

#### 27.2 들여쓰기 L-shape — Hierarchy-right 예시

```text
└─ Q1 기반 구축          ← 부모 하단 좌측에서 수직선
   ├─ 인증 시스템         ← 짧은 수평선으로 자식 좌단 연결
   ├─ 에디터 코어
   └─ 자동저장 엔진
```

```ts
const px = parent.x - parent.w/2 + 14;  // 부모 좌측 인덴트 가이드
const py = parent.y + parent.h/2;
const tx = child.x - child.w/2;
const ty = child.y;
d = `M ${px} ${py} V ${ty} H ${tx}`;
```

---

### 28. 디자인 토큰 (요약)

> 자세한 토큰은 `apps/frontend/src/components/design-tokens/theme.ts` 참조.

#### 28.1 라이트 테마 — "Warm Productivity"

| 토큰 | 값 |
|---|---|
| `bg` | `#FAF7F2` (크림) |
| `canvas` | `#F5F0E8` |
| `surface` | `#FFFFFF` |
| `border` | `#E8E0D2` |
| `text` | `#1F1B16` |
| `primary` | `#D97706` (앰버) |
| `primarySoft` | `#FEF3C7` |
| `accent` | `#0284C7` (스카이) |
| `success` | `#15803D` |
| `danger` | `#DC2626` |

#### 28.2 다크 테마 — "Modern Dark"

| 토큰 | 값 |
|---|---|
| `bg` | `#0F1115` |
| `canvas` | `#14171D` |
| `surface` | `#181A20` |
| `border` | `#2A2E38` |
| `text` | `#E8E6E3` |
| `primary` | `#F59E0B` (앰버) |
| `primarySoft` | `#3B2A0A` |
| `accent` | `#38BDF8` |
| `success` | `#4ADE80` |
| `danger` | `#F87171` |

#### 28.3 노드 색상 family

브랜치 노드(depth 1)는 5종 의미색 중 하나를 가진다. 각 family는 `{fill, text, border}` 3-색 세트로 정의된다.

| family | 의미 | light fill | light text | light border |
|---|---|---|---|---|
| amber | 기본 / 강조 | `#FEF3C7` | `#78350F` | `#F59E0B` |
| blue | 전략 / 시스템 | `#DBEAFE` | `#1E3A8A` | `#3B82F6` |
| green | 결과 / 지표 | `#DCFCE7` | `#14532D` | `#22C55E` |
| red | 리스크 / 경고 | `#FEE2E2` | `#7F1D1D` | `#EF4444` |
| violet | 협업 / 사람 | `#EDE9FE` | `#4C1D95` | `#8B5CF6` |

다크 테마는 위 값에 대응되는 어두운 톤을 사용한다.

---

### 29. Tweaks 패널 (시안 전용 — 프로덕션 제외)

디자인 시안 검토용으로만 제공되는 우하단 플로팅 패널이다. 최종 빌드에서는 제거된다.

| 컨트롤 | 옵션 |
|---|---|
| 테마 | `라이트` / `다크` |
| 레이아웃 | `radial-bidirectional` / `radial-right` / `tree-right` / `tree-down` / `hierarchy-right` / `kanban` |
| Inspector 탭 | `style` / `layout` / `content` / `note` / `ai` |
| 샘플 주제 | `2026 제품 로드맵` / `easymindmap MVP 설계` |

패널 헤더에는 `시안 전용` 황색 배지로 명시한다.

---

### 30. 참고 — 시안 파일

- 데모: `apps/frontend/EasyMindMap Editor.html` (브라우저 직접 열람 가능)
- 컴포넌트 구조: `apps/frontend/src/editor/canvas/`, `apps/frontend/src/editor/node-renderer/`, `apps/frontend/src/editor/edge-renderer/`, `apps/frontend/src/components/`
- 적용 가이드: 패치 zip의 `README_적용방법.md`

#### 24.5 라벨 폭 측정 (2026-07 수정)

라벨 폭은 `글자 수 × 6.2px` 고정 계산이 아니라 **문자 종류별 근사 폭**
(`measureTextApprox` — 한글·CJK ≈ 폰트크기 1.0배, 숫자 0.58, 라틴 0.55,
공백 0.34)으로 잰다. 한글 태그에서 라벨이 ✕ 핸들과 겹치던 문제 수정.

---

### 아웃라인 분할 화면 (MVS 구현 — 2026-07)

좌측 레일의 아웃라인 아이콘(분할 화면 모양)을 켜면 사이드 패널이 아니라
**메인 편집 영역이 좌(아웃라인 편집)/우(맵)로 분할**된다. 가운데 세로
스플리터로 비율(20~75%)을 조절한다. 맵과 실시간 양방향 동기화.

아웃라인에서 허용되는 편집 (의도적 제한 — 그 외는 맵/속성 탭에서):
- 텍스트 수정: 더블클릭(또는 Enter/F2)
- 레벨 변경: Tab 들여쓰기 / Shift+Tab 내어쓰기 (들여쓰기 = 맵 레벨)
- 노드 추가/삭제: 행 호버 시 ＋형제/＋자식/🗑 버튼, Delete 키

행에 콘텐츠 인디케이터(노트 종류 배지·링크·첨부·멀티미디어)를 표시하고,
클릭 시 맵과 동일하게 동작한다 — 링크 열기(여럿이면 목록), 노트 뷰어
팝업, 첨부는 새 탭.

### 검색 (MVS 구현 — 2026-07)

검색 패널이 실제 맵을 검색한다 — 노드 텍스트·태그·노트 본문·링크
(라벨/URL) 대소문자 무시 부분 일치, 결과에 경로·일치 위치 표시,
클릭 시 캔버스 노드 선택. (최대 50건)

### 노드 텍스트 기본 정렬 = 중앙 (2026-07 변경)

노드 텍스트 기본 정렬을 왼쪽 → **중앙**으로 변경 (스타일 탭에서
왼쪽/오른쪽 선택 가능). 내보내기 뷰어 동일.

#### 아웃라인 분할 — 노드 전체 내용 표시 (2026-07 보강)

아웃라인 행은 한 줄 요약이 아니라 **노드 내용 전체**를 보여준다:
여러 줄 텍스트(줄바꿈 유지, 인라인 마커는 제거해 표시), 노드에 붙인
사진(축소 썸네일). 편집도 여러 줄 — 더블클릭 후 Enter 저장,
Shift+Enter 줄바꿈 (캔버스 노드 편집과 동일).
