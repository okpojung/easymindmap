easymindmap — 노드 추가 인디케이터 (+버튼) 기능 설계

최종 업데이트: 2026-03-23
관련 기능ID: NODE-13
참고: iThinkWise 사용자 설명서 Ver 4.0 (가지 추가 UX)


1. 기능 개요
노드를 싱글 클릭하면 해당 노드의 상·하·좌·우 4방향에 + 아이콘(인디케이터)이 표시되고,
각 방향을 클릭하면 대응하는 관계의 새 노드가 즉시 생성된다.
                    [ + ]  ← 상 : 부모 노드 추가
                      │
        [ + ] ─── [선택노드] ─── [ + ]
         ←좌                       우→
       형제(이전)                형제(다음)
                      │
                    [ + ]  ← 하 : 자식 노드 추가


iThinkWise 참고
iThinkWise는 "중심가지 클릭 후 상,하,좌,우 + 버튼으로 가지 생성" 방식을 사용하며,
"상/하 [+] 버튼으로 형제가지를, 좌측 [+] 버튼으로 부모가지를 생성"한다.
easymindmap은 이보다 직관적인 방향 매핑으로 재설계한다.


2. 방향별 동작 정의

방향
기능
생성되는 노드 위치
대응 기존 단축키

⬆ 상
부모 노드 추가
선택 노드의 바로 위 상위 노드로 삽입
— (신규)


⬇ 하
자식 노드 추가
선택 노드의 마지막 자식으로 추가
Space


⬅ 좌
형제 노드 추가 (이전)
선택 노드 바로 앞(위쪽)에 형제 삽입
LShift + Ctrl + Space


➡ 우
형제 노드 추가 (다음)
선택 노드 바로 뒤(아래쪽)에 형제 삽입
LShift + Space

2-1. 부모 노드 추가 (⬆ 상) — 상세
[Before]                  [After]
루트                       루트
 └─ A                      └─ A
     └─ B (선택)                └─ 새노드 ← 삽입
         └─ C                        └─ B
                                          └─ C


선택 노드와 기존 부모 사이에 새 노드를 중간 삽입한다.
선택 노드와 그 하위 전체(서브트리)는 새 노드의 자식이 된다.
Root 노드(부모 없음)에서는 ⬆ 상 버튼을 비활성화(disabled)한다.

2-2. 자식 노드 추가 (⬇ 하) — 상세
[Before]          [After]
A (선택)          A (선택)
 ├─ B              ├─ B
 └─ C              ├─ C
                   └─ 새노드 ← 마지막 자식으로 추가


선택 노드의 마지막 자식 위치에 새 노드를 추가한다.
기존 Space 단축키 동작과 동일.

2-3. 형제 노드 추가 - 이전 (⬅ 좌) — 상세
[Before]          [After]
Parent            Parent
 ├─ A              ├─ A
 ├─ B (선택)       ├─ 새노드 ← 선택 노드 앞에 삽입
 └─ C              ├─ B
                   └─ C


선택 노드 바로 앞(이전 순서) 위치에 형제 노드를 삽입한다.
Root 노드에서는 ⬅ 좌 버튼을 비활성화한다.

2-4. 형제 노드 추가 - 다음 (➡ 우) — 상세
[Before]          [After]
Parent            Parent
 ├─ A              ├─ A
 ├─ B (선택)       ├─ B
 └─ C              ├─ 새노드 ← 선택 노드 다음에 삽입
                   └─ C


선택 노드 바로 뒤(다음 순서) 위치에 형제 노드를 삽입한다.
Root 노드에서는 ➡ 우 버튼을 비활성화한다.


3. UI/UX 규칙
3-1. 인디케이터 표시 조건

조건
동작

노드 싱글 클릭
4방향 + 아이콘 표시


노드 선택 해제 (빈 캔버스 클릭 / ESC)
인디케이터 숨김


노드 편집 모드 진입 (Double Click)
인디케이터 숨김


Root 노드 선택
⬆상, ⬅좌, ➡우 비활성화 (⬇하만 활성)


다중 선택 (SEL-02)
인디케이터 표시 안 함

3-2. 인디케이터 위치 계산
노드 bounding box 기준:

  상 (+):  노드 상단 중앙  (cx, top - offset)
  하 (+):  노드 하단 중앙  (cx, bottom + offset)
  좌 (+):  노드 좌측 중앙  (left - offset, cy)
  우 (+):  노드 우측 중앙  (right + offset, cy)

offset 권장: 12px ~ 16px (노드 테두리와 약간의 여백)

3-3. 인디케이터 스타일

상태
스타일

기본(표시)
원형 버튼, 테두리 색 #F0A500 (황금색), 배경 흰색, + 아이콘


hover
배경 #F0A500, + 아이콘 흰색으로 전환


disabled (Root)
회색, 클릭 불가


클릭(active)
약한 scale 애니메이션 후 즉시 노드 생성

첨부 이미지 참고: 황금색(오렌지) 원형 + 아이콘이 노드 4방향에 배치됨

3-4. 새 노드 생성 후 동작
+ 버튼 클릭
  │
  ▼
새 노드 생성 (빈 텍스트)
  │
  ▼
새 노드 즉시 선택
  │
  ▼
텍스트 편집 모드 자동 진입 (커서 활성)
  │
  ▼
Enter 또는 blur → 텍스트 확정 → Auto Save 트리거
  │
Esc → 텍스트 취소 → 빈 노드 삭제 (Undo 히스토리에도 미반영)


4. 레이아웃별 고려사항
인디케이터의 물리적 표시 방향은 고정(상/하/좌/우)이지만,
의미(동작) 는 레이아웃 방향과 무관하게 아래처럼 항상 고정한다.

방향
어떤 레이아웃에서도
이유

⬆ 상
부모 노드 추가
위 = 상위 계층이라는 직관에 일치


⬇ 하
자식 노드 추가
아래 = 하위 계층이라는 직관에 일치


⬅ 좌
형제 노드 이전 추가
좌 = 앞 순서라는 일반 UX 관례


➡ 우
형제 노드 다음 추가
우 = 뒤 순서라는 일반 UX 관례

설계 노트: 레이아웃마다 방향 의미를 다르게 하면 학습 비용이 높아진다.
iThinkWise도 레이아웃에 관계없이 고정 방향으로 동작한다.


5. 키보드 / 마우스 조작 통합 요약

조작 방식
동작

노드 클릭 후 ⬆ + 클릭
부모 노드 추가


노드 클릭 후 ⬇ + 클릭
자식 노드 추가


노드 클릭 후 ⬅ + 클릭
형제 노드 이전 추가


노드 클릭 후 ➡ + 클릭
형제 노드 다음 추가


Space
자식 노드 추가 (⬇와 동일)


LShift + Space
형제 노드 다음 추가 (➡와 동일)


LShift + Ctrl + Space
형제 노드 이전 추가 (⬅와 동일)


Ctrl + Space
자식 노드 다중 생성 (인디케이터 없음, 별도 팝업)

6. 비활성화 규칙 (Root 노드)
Root 노드 선택 시:

        [ + ]  ← 비활성 (상위 없음)
          │
[비활성] ─── [Root] ─── [비활성]
                │
              [ + ]  ← 활성 (자식 추가 가능)


비활성 버튼은 회색으로 표시하거나 아예 숨길 수 있다.
권장: 회색으로 표시 (UI가 더 안정적으로 보임)


7. 프론트엔드 구현 힌트
7-1. 인디케이터 컴포넌트 구조
NodeRenderer
  └─ NodeAddIndicator       ← 4방향 + 버튼 컨테이너
       ├─ AddIndicatorTop    (⬆ 부모)
       ├─ AddIndicatorBottom (⬇ 자식)
       ├─ AddIndicatorLeft   (⬅ 형제 이전)
       └─ AddIndicatorRight  (➡ 형제 다음)

7-2. 표시 조건 상태 관리
// editorStore에 추가
type EditorStore = {
  ...
  selectedNodeId: string | null;
  showAddIndicator: boolean;   // 선택된 노드에 인디케이터 표시 여부
};

// 노드 클릭 시
const handleNodeClick = (nodeId: string) => {
  setSelectedNodeId(nodeId);
  setShowAddIndicator(true);
};

// 캔버스 클릭 시
const handleCanvasClick = () => {
  setSelectedNodeId(null);
  setShowAddIndicator(false);
};
7-3. 부모 노드 삽입 로직
// 부모 노드 추가 (⬆)
const addParentNode = (selectedNodeId: string) => {
  const selectedNode = getNode(selectedNodeId);
  if (!selectedNode.parentId) return; // Root → 비활성

  // 1. 새 노드 생성 (선택 노드의 현재 부모 위치)
  const newNode = createNode({
    parentId: selectedNode.parentId,
    orderIndex: selectedNode.orderIndex,
  });

  // 2. 선택 노드와 하위 서브트리를 새 노드의 자식으로 재배치
  reparentNode(selectedNodeId, newNode.id);

  // 3. 기존 형제 노드들의 orderIndex 재정렬
  reorderSiblings(selectedNode.parentId);

  // 4. 새 노드 선택 + 편집 모드 진입
  selectNodeAndEdit(newNode.id);
};
7-4. SVG 레이아웃에서의 인디케이터 위치 계산
const INDICATOR_OFFSET = 14; // px

const getIndicatorPositions = (nodeBounds: DOMRect) => ({
  top:    { x: nodeBounds.left + nodeBounds.width / 2,  y: nodeBounds.top - INDICATOR_OFFSET },
  bottom: { x: nodeBounds.left + nodeBounds.width / 2,  y: nodeBounds.bottom + INDICATOR_OFFSET },
  left:   { x: nodeBounds.left - INDICATOR_OFFSET,       y: nodeBounds.top + nodeBounds.height / 2 },
  right:  { x: nodeBounds.right + INDICATOR_OFFSET,      y: nodeBounds.top + nodeBounds.height / 2 },
});

8. Undo/Redo 처리

동작
Undo 처리

+ 버튼으로 노드 생성 후 텍스트 확정
Undo 가능 (노드 삭제)


+ 버튼으로 노드 생성 후 Esc 취소
Undo 히스토리에 미반영


부모 노드 삽입 (⬆)
Undo 가능 (중간 노드 제거 + 원복)

9. Auto Save 연동
인디케이터로 생성된 노드도 기존 Auto Save 트리거를 그대로 따른다.

트리거
조건

텍스트 확정 (Enter / blur)
Auto Save 즉시 실행


Esc 취소
Auto Save 미실행

10. 구현 우선순위
Step 1: NodeAddIndicator 컴포넌트 — 4방향 + 버튼 UI
Step 2: 노드 클릭 → 인디케이터 표시/숨김 상태 관리
Step 3: ⬇ 자식 추가 (기존 Space 동작과 동일, 가장 쉬움)
Step 4: ➡ 형제 다음 추가 (기존 LShift+Space 동작과 동일)
Step 5: ⬅ 형제 이전 추가
Step 6: ⬆ 부모 노드 중간 삽입 (가장 복잡 — 서브트리 재배치 필요)
Step 7: Root 노드 비활성화 처리
Step 8: 새 노드 생성 후 편집 모드 자동 진입
Step 9: Undo/Redo 연동


11. 와이어프레임 텍스트 표현
             ┌───────────┐
             │    [+]    │  ← ⬆ 부모 노드 추가
             └─────┬─────┘
                   │
┌──────┐    ┌──────┴───────┐    ┌──────┐
│ [+]  │────│  topic1      │────│ [+]  │
└──────┘    └──────┬───────┘    └──────┘
⬅ 형제이전         │                ➡ 형제다음
             ┌─────┴─────┐
             │    [+]    │  ← ⬇ 자식 노드 추가
             └───────────┘
