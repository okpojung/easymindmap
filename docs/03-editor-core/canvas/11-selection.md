# 11. Selection
## SELECTION

* 문서 버전: v1.0
* 작성일: 2026-04-14
* 참조: `docs/01-product/functional-spec.md § 6. SELECTION`, `docs/03-editor-core/state-architecture.md § 5.4`

> **최종 업데이트:** 2026-08-04 — 코드 대조 감사 반영: 현재 구현은 단일 선택 + 러버밴드 다중 선택뿐 (Shift/Ctrl 클릭·Ctrl+A·서브트리·방향키 이동은 미구현 — 2단계), 실제 interactionStore 구조로 교정

---

### 1. 기능 목적

* 캔버스에서 **하나 또는 여러 노드를 선택**하는 기능
* 선택된 노드에 대한 편집(삭제, 복사, 이동, 스타일 변경 등) 작업의 전제 조건
* 단일 선택 + 러버밴드 영역 다중 선택 지원 (Subtree·Shift/Ctrl 다중 선택은 미구현 — 2단계)
* 선택 상태는 Interaction Store에서 관리하며 DB에 저장하지 않음

---

### 2. 기능 범위

* 포함 (구현 기준: **단일 선택 + 러버밴드 영역 다중 선택**):

  * 단일 노드 선택 (클릭)
  * 러버밴드 영역 드래그 다중 선택 (Marquee)
  * 선택 해제 (ESC, 빈 영역 클릭)
  * 선택 시 노드 추가 인디케이터 표시
  * 다중 선택 상태에서 일괄 동작 (삭제, 스타일)
  * 좌측 Inspector 연동 (선택 기반 속성 표시)
  * (미구현 — 2단계) Shift/Ctrl 클릭 다중 선택, Ctrl+A 전체 선택,
    Subtree 전체 선택, 방향키 선택 이동

* 제외:

  * 노드 편집 동작 (→ NODE_EDITING)
  * 캔버스 뷰포트 조작 (→ CANVAS)
  * 노드 drag & drop 이동 (→ NODE_EDITING)
  * 스타일 변경 (→ NODE_STYLE)
  * 히스토리 (→ HISTORY)

---

### 3. 세부 기능 목록

| 기능ID  | 기능명             | 설명                         | 키보드 단축키               | 마우스               | 상태 |
| ----- | --------------- | -------------------------- | ---------------------- | ----------------- | ---- |
| SEL-01 | Single Select  | 노드 단일 선택                   | —         | 노드 클릭             | 구현 (방향키 이동은 미구현) |
| SEL-02 | Multi Select   | 여러 노드 선택                   | `Shift+Click` / `Ctrl+Click` | Shift+Click       | 미구현 (2단계) |
| SEL-03 | Subtree Select | 노드 및 하위 전체 선택              | `Ctrl+Shift+A` (선택 노드 기준) | 컨텍스트 메뉴 > 하위 전체 선택 | 미구현 (2단계) |
| SEL-04 | Area Select    | 드래그 영역 내 노드 전체 선택 (러버밴드) | —                      | 빈 캔버스 드래그         | **구현** |
| SEL-05 | Select All     | 맵 내 전체 노드 선택               | `Ctrl+A`               | —                 | 미구현 (2단계) |
| SEL-06 | Deselect All   | 선택 전체 해제                   | `ESC`                  | 빈 영역 클릭           | **구현** |
| SEL-07 | Range Select   | 기준 노드부터 클릭 노드까지 범위 선택      | `Shift+Click`          | —                 | 미구현 (2단계) |
| SEL-08 | Toggle Select  | 개별 노드 선택 토글 (추가/제거)        | `Ctrl+Click`           | —                 | 미구현 (2단계) |

---

### 4. 기능 정의 (What)

#### 4.1 선택 상태 타입 (실제 interactionStore)

```typescript
// 실제 구현 (interactionStore)
type InteractionState = {
  selectedId: string | null;        // 단일 선택 노드
  multiSelectedIds: string[];       // 러버밴드 다중 선택 결과
  searchHitId: string | null;       // 검색/아웃라인 이동 강조 노드
  editingNodeId: string | null;     // 인라인 편집 중 노드
};
// anchor / hover / marquee(드래그 사각형) 상태는 스토어가 아니라
// 캔버스 컴포넌트 로컬 상태로 관리한다.
```

#### 4.2 선택 모드 정의 (구현 기준)

| 모드             | 조건                       | 상태 변화      |
| -------------- | ------------------------ | ----------------------- |
| Single Select  | 노드 클릭                    | `selectedId = clickedId` (다중 선택 해제)       |
| Area Select    | 빈 캔버스 drag (러버밴드)        | `multiSelectedIds` = 영역 내 노드 ID 목록     |
| Deselect       | `ESC` / 빈 영역 클릭           | `selectedId = null`, `multiSelectedIds = []`             |

#### 4.3 선택 상태에 따른 UI 변화

```text
미선택 상태:
  - 노드: 기본 스타일
  - 노드 추가 인디케이터: 미표시

단일 선택 상태:
  - 노드: 선택 하이라이트 (border 강조)
  - 노드 추가 인디케이터: 표시 (자식/형제 추가 버튼)
  - Right Panel: 선택 노드 속성 표시

다중 선택 상태:
  - 노드들: 선택 하이라이트
  - Right Panel: 공통 속성만 표시 (일괄 편집)
  - 노드 추가 인디케이터: 미표시

러버밴드 드래그 중:
  - 반투명 직사각형만 표시 (선택 영역 시각화)
  - 선택 확정은 mouseup 시 일괄 (실시간 미리 하이라이트 없음)
```

#### 4.4 선택 후 가능한 동작 (구현 기준)

| 동작       | 단축키          | 설명                     |
| -------- | ------------ | ---------------------- |
| 삭제       | `Delete`     | 선택된 노드 전체 삭제 (다중 선택은 일괄, undo 1단계)  |
| 복사       | `mod+C`      | 선택 노드 서브트리를 클립보드에 `EMM-NODES::` 토큰으로 복사 |
| 붙여넣기     | `mod+V`      | 클립보드의 `EMM-NODES::` 토큰을 선택 노드 하위에 삽입 |
| 복제       | `Ctrl+D`     | **미구현**           |
| 이동       | drag         | 드래그로 부모·순서 변경 (freeform 위치 이동 아님) |
| 스타일 일괄 적용 | 좌측 스타일 탭 | 도형/색/테두리/강조/정렬 일괄 변경 (undo 1단계)  |

---

### 5. 동작 방식 (How)

#### 5.1 사용자 동작

| 입력                    | 결과                                         |
| --------------------- | ------------------------------------------ |
| 노드 클릭                 | 단일 선택 (기존 선택·다중 선택 해제)                           |
| 빈 캔버스 drag           | 러버밴드 드래그 → mouseup 시 영역 내 노드 다중 선택                   |
| 빈 캔버스 클릭 / `ESC`      | 선택 전체 해제 (`ESC`는 텍스트 편집 중이면 편집 종료)                                   |
| 노드 더블클릭              | 텍스트 편집 모드 진입 (선택 유지)                       |
| (미구현 — 2단계) `Shift/Ctrl + 클릭` · `Ctrl+A` · 방향키 이동 · 우클릭 하위 전체 선택 | — |

---

#### 5.2 시스템 처리 (구현 기준)

* 클릭 이벤트 → 노드 hitTest → `selectedId` 업데이트 (다중 선택 해제)
* 러버밴드 drag: Screen 좌표 rect → World 좌표 변환 → mouseup 시 범위 내 노드 hitTest → `multiSelectedIds` 일괄 업데이트
* 선택 변경 시 좌측 Inspector 즉시 업데이트
* (미구현 — 2단계) Shift/Ctrl 클릭 범위·토글, Ctrl+A, Subtree Select

---

#### 5.3 표시 방식

* **선택된 노드**: border 색상 강조 + 그림자 효과
* **hover 노드**: 연한 하이라이트 (선택 전 미리보기)
* **러버밴드 드래그 중**: 반투명 파란 직사각형 오버레이 (사각형만 — 선택은 mouseup 시 일괄)
* **다중 선택**: 모든 선택 노드에 동일한 선택 하이라이트
* **노드 추가 인디케이터**: 단일 선택 시에만 표시

---

### 6. 규칙 (Rule)

---

#### 6.1 단일 선택 규칙

* 노드 클릭 시 기존 선택 전체 해제 후 해당 노드만 선택
* 이미 선택된 노드 재클릭: 선택 유지 (해제 안 함)
* `Ctrl+Click`으로 이미 선택된 노드 클릭: 선택 해제 (toggle)

---

#### 6.2 다중 선택 규칙

* `Shift+Click`: anchor 노드 기준 범위 선택 (Tree 순서 기준)
* `Ctrl+Click`: 개별 토글 — 선택 추가/제거
* 다중 선택 중 단순 클릭 → 해당 노드 단일 선택으로 교체 (기존 다중 선택 해제)

---

#### 6.3 Subtree Select 규칙

* 선택 노드와 재귀적 하위 노드 전체를 `selectedNodeIds`에 추가
* 루트 노드 Subtree Select → 전체 맵 선택과 동일
* `collapsed` 노드의 숨겨진 자식 노드도 포함

---

#### 6.4 러버밴드 (Area Select) 규칙

* 빈 캔버스 영역에서만 drag 시작 가능 (노드 위 drag는 노드 이동)
* **drag 중에는 선택 사각형만 표시**하고, **mouseup 시 일괄 선택**한다
  (실시간 미리 하이라이트 없음)
* 기존 선택 교체 방식 (기존 선택 해제 후 새 선택)
* `Shift + drag` 확장 선택: 미구현 (3단계)

---

#### 6.5 선택 해제 규칙

* `ESC` 또는 빈 캔버스 클릭 → 전체 선택 해제
* 텍스트 편집 중 `ESC` → 편집 종료 후 선택 유지 (선택 해제 X)
* 다른 노드 클릭 → 기존 선택 해제 + 새 노드 선택

---

#### 6.6 루트 노드 선택 규칙

* 루트 노드는 선택 가능
* 루트 노드를 `selectedNodeIds`에서 제외하는 강제 규칙 없음
* 단, 루트 노드 삭제는 CANVAS 정책에 의해 차단

---

#### 6.7 Kanban 레이아웃 선택 규칙

* `layoutType = 'kanban'` 모드에서도 동일 선택 규칙 적용
* **컬럼·카드 노드 선택 가능** — 보드 제목(root)은 보드에서 선택 불가
* 러버밴드 drag: Kanban 카드 영역에서도 동작

---

#### 6.8 선택 상태와 Interaction Store

* 선택 상태는 Interaction Store에서 관리
* DB에 저장하지 않음 (클라이언트 전용 ephemeral state)
* undo/redo 대상이 아님
* zoom/pan 변경 시 선택 상태 유지

---

### 7. Marquee 선택 알고리즘

```typescript
// Marquee drag: Screen 좌표 rect → World 좌표 변환 후 노드 hitTest
function getNodesInMarquee(
  marquee: { start: ScreenPoint; current: ScreenPoint },
  nodes: NodeObject[],
  viewport: ViewportState
): string[] {
  // 1. Screen rect 정규화 (start/end 순서 보정)
  const rect = normalizeRect(marquee.start, marquee.current);

  // 2. Screen → World 변환
  const worldRect = screenRectToWorldRect(rect, viewport);

  // 3. 각 노드의 boundingBox가 worldRect와 교차하는지 검사
  return nodes
    .filter(n => intersects(getNodeBounds(n), worldRect))
    .map(n => n.id);
}
```

---

### 8. 키보드 방향키 선택 이동 (미구현 — 2단계)

| 레이아웃 계열      | `↑`      | `↓`      | `←`    | `→`    |
| ------------ | -------- | -------- | ------ | ------ |
| radial       | 이전 형제    | 다음 형제    | 부모     | 첫 번째 자식 |
| tree-right   | 이전 형제    | 다음 형제    | 부모     | 첫 번째 자식 |
| tree-down    | 부모       | 첫 번째 자식  | 이전 형제  | 다음 형제   |
| kanban       | 이전 카드(열) | 다음 카드(열) | 이전 컬럼  | 다음 컬럼   |

---

### 9. 예외 / 경계 (Edge Case)

* **빈 맵 (노드 없음)**: `Ctrl+A` 동작 없음, Marquee 드래그 영역 빈 선택 허용
* **Marquee가 캔버스 경계를 벗어남**: 캔버스 경계에서 클램핑 처리
* **collapsed 노드 Subtree Select**: 숨겨진 자식 노드도 `selectedNodeIds`에 포함
* **매우 많은 노드 선택 (1000+)**: Right Panel 렌더링 성능 최적화 필요 (공통 속성만 표시)
* **텍스트 편집 중 Shift+Click**: 편집 종료 후 선택 적용
* **루트 노드 포함 다중 선택 삭제 시도**: 루트 노드는 삭제 차단 + 나머지 노드만 삭제
* **방향키 이동 시 접힌(collapsed) 노드**: 자식 방향키 → 접힌 상태 표시만 하고 미이동 (또는 펼침 여부 정책 결정 필요)
* **Kanban depth 0(board) 선택 + Delete 시도**: 루트 정책에 따라 차단

---

### 10. 권한 규칙

| 역할      | 권한                          |
| ------- | --------------------------- |
| creator | 전체 선택 기능 사용 가능              |
| editor  | 전체 선택 기능 사용 가능              |
| viewer  | 선택 가능 (읽기 전용 — 편집 동작 차단)   |

---

### 11. DB 영향

* 선택 상태는 **DB에 저장하지 않는다**
* Interaction Store 내 메모리(클라이언트) 전용 상태
* 맵 재접속 시 선택 상태 초기화 (미선택 상태로 시작)

---

### 12. API 영향

* 선택 자체는 서버 API 호출 없음
* 선택 후 수행되는 동작(삭제, 복사, 스타일 변경 등)이 API 호출 유발:
  * `DELETE /nodes` — 다중 선택 삭제
  * `POST /nodes/batch` — 다중 복제
  * `PATCH /nodes/batch` — 다중 스타일 변경

---

### 13. 연관 기능

* CANVAS (`10-canvas.md` — Center Node, Focus Node View 연동)
* NODE_EDITING (`02-node-editing.md` — 선택 후 편집 동작)
* NODE_STYLE (다중 선택 스타일 일괄 적용)
* HISTORY (`12-history-undo-redo.md` — 선택 후 삭제/이동의 undo)
* LAYOUT (`08-layout.md` — 선택 노드 기준 Subtree layout override)
* KANBAN (`09-kanban.md` — Kanban 선택 특수 규칙)

---

### 14. 예시 시나리오

#### 시나리오 1 — 단일 선택 후 편집

1. 사용자: `기능 정의` 노드 클릭
2. 시스템: `selectedNodeIds = ['node_123']`
3. Right Panel: 해당 노드 속성(스타일/레이아웃/내용) 표시
4. 노드 추가 인디케이터 표시

#### 시나리오 2 — Ctrl+Click 다중 선택 후 일괄 삭제

1. 사용자: `노드A` 클릭 → `Ctrl+노드B` 클릭 → `Ctrl+노드C` 클릭
2. 시스템: `selectedNodeIds = ['nodeA', 'nodeB', 'nodeC']`
3. 사용자: `Delete` 키 입력
4. 시스템: 3개 노드 일괄 삭제, History에 기록

#### 시나리오 3 — 러버밴드 드래그 영역 선택

1. 사용자: 빈 캔버스에서 drag 시작
2. 시스템: 드래그 중 선택 사각형만 표시 (실시간 하이라이트 없음)
3. mouseup 시: 영역 내 노드들 `multiSelectedIds`에 일괄 확정
4. 좌측 Inspector: "N개 노드 선택 · 일괄 편집" 표시

#### 시나리오 4 — Subtree Select 후 복사

1. 사용자: `## 기능 정의` 노드 우클릭 > `하위 전체 선택`
2. 시스템: 해당 노드 + 재귀 하위 노드 전체 `selectedNodeIds`에 추가
3. 사용자: `Ctrl+C`
4. 시스템: 선택된 Subtree 전체 클립보드에 복사

#### 시나리오 5 — 방향키로 선택 이동

1. 사용자: `목표` 노드 선택 (radial layout)
2. `→` 입력 → 첫 번째 자식 노드로 선택 이동
3. `↓` 입력 → 다음 형제 노드로 선택 이동
4. `←` 입력 → 부모 노드로 선택 이동

---

### 15. 구현 우선순위

#### MVP (구현됨)

* Single Select (클릭)
* Deselect (ESC, 빈 영역 클릭)
* **러버밴드 다중 선택 + 일괄 삭제/스타일**
* 선택 시 좌측 Inspector 연동
* 선택 시 노드 추가 인디케이터 표시

#### 2단계 (미구현)

* `Ctrl+Click` 토글 / `Shift+Click` Range Select
* `Ctrl+A` 전체 선택
* Subtree Select (컨텍스트 메뉴)
* 방향키 선택 이동

#### 3단계

* `Shift + Marquee drag` (기존 선택에 추가)
* Kanban 선택 특수 UX (컬럼 전체 선택 등)
* 다중 선택 일괄 스타일 변경 최적화

---
