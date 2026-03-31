# easymindmap — Node Editing 기능 명세

> **문서 위치**: `docs/03-editor-core/node-editing.md`  
> **최종 업데이트**: 2026-03-31  
> **버전**: v2.0  
> **관련 문서**: `docs/03-editor-core/autosave-engine.md`, `docs/01-product/functional-spec.md §NODE`

---

## 1. Node Editing 기능 명세

> **지원 레이아웃 범위**: Radial / Tree / Hierarchy / Process-Tree / Freeform / **Kanban** (전체 레이아웃 지원)

Node Editing 기능은 mindmap 편집기의 핵심 인터랙션 기능이다.

사용자는 아래 작업을 수행할 수 있어야 한다.

*   형제 노드 생성
*   자식 노드 생성
*   다중 자식 노드 생성
*   노드 텍스트 편집
*   노드 삭제
*   노드 이동
*   노드 복사 / 붙여넣기
*   노드 복제
*   노드 접기 / 펼치기

단축키는 **MindMapper 스타일 UX**를 기준으로 정의한다.

* * *

2\. Node Editing 기능 목록
======================

| ID | 기능명 | 설명 | 단축키 |
| --- | --- | --- | --- |
| NODE-01 | Create Sibling Node-after | 현재 노드 다음 위치에 형제 노드 생성 | **Shift + Space** |
| NODE-02 | Create Sibling Node-before | 현재 노드 이전 위치에 형제 노드 생성 | **Shift + Ctrl + Space** |
| NODE-03 | Create Child Node | 자식 노드 1개 생성 | **Space** |
| NODE-04 | Create Child Node (Multi) | 여러 자식 노드 한번에 생성 | **Ctrl + Space** |
| NODE-05 | Edit Node Text | 노드 텍스트 편집 모드 | **Double Click** |
| NODE-06 | Delete Node | 선택 노드 삭제 | **Delete** |
| NODE-07 | Move Node | 노드 Drag 이동 | **Drag** |
| NODE-08 | Copy Node | 노드 복사 | **Ctrl + C** |
| NODE-09 | Paste Node | 노드 붙여넣기 | **Ctrl + V** |
| NODE-10 | Duplicate Node | 노드 복제 | **Ctrl + D** |
| NODE-11 | Collapse Node | 하위 노드 접기 | **Click collapse icon** |
| NODE-12 | Expand Node | 하위 노드 펼치기 | **Click expand icon** |

* * *

3\. Node 생성 규칙
==============

3.1 형제 노드 생성 (after)
--------------------

단축키

```
Shift + Space
```

동작

```
Topic1
   └ Topic2 (selected)
```

실행 후

```
Topic1
   ├ Topic2
   └ New Node
```

새 노드는 **선택된 노드 다음 위치**에 생성된다.

* * *

3.2 형제 노드 생성 (before)
---------------------

단축키

```
Shift + Ctrl + Space
```

동작

```
Topic1
   └ Topic2 (selected)
```

실행 후

```
Topic1
   ├ New Node
   └ Topic2
```

* * *

4\. 자식 노드 생성
============

4.1 기본 자식 노드 생성
---------------

단축키

```
Space
```

동작

```
Topic2 (selected)
```

실행 후

```
Topic2
   └ New Child
```

* * *

5\. 다중 자식 노드 생성 (Bulk Branch Insert)
==========================================

> **[통합 정책 2026-03-29]**  
> 이 기능은 `docs/03-editor-core/bulk-branch-insert.md`의 설계와 완전히 통일된다.  
> 내부 기능 키: `bulkInsertBranches`  
> 입력 방식: **들여쓰기(공백 기반) 계층 표현 — 유일하게 지원되는 공식 방식**

이 기능은 **easymindmap의 생산성을 높이는 핵심 기능**입니다.

단축키

```
Ctrl + Space
```

그 외 진입 방법:
- 우클릭 메뉴 → `다중 가지 추가`
- 툴바 → `Insert > Bulk Branch Insert`

실행 시 **Bulk Branch Insert 패널(모달 또는 우측 패널)** 이 열린다.

* * *

5.1 입력 규칙 — 들여쓰기 계층 방식 (공식 유일 방식)
----------------------------------------------

> **통일 결정**: 쉼표/탭 구분자 방식은 사용하지 않는다.  
> 한 줄 = 노드 1개, **줄 앞 공백(스페이스 2칸 = 1단계)** 으로 계층을 표현한다.

```
안내문:
  한 줄에 한 가지가 생성됩니다.
  줄 앞 공백으로 하위 가지를 표현합니다.
  공백이 깊어질수록 더 하위 레벨로 생성됩니다.
```

#### 입력 예 — 동일 레벨 (형제 노드)

```
API Server
Scheduler
Controller Manager
etcd
```

생성 결과

```
Kubernetes (기준 노드)
   ├ API Server
   ├ Scheduler
   ├ Controller Manager
   └ etcd
```

#### 입력 예 — 계층 구조 (들여쓰기)

```
Frontend
  React
  TypeScript
Backend
  NestJS
  PostgreSQL
```

생성 결과

```
Architecture (기준 노드)
   ├ Frontend
   │   ├ React
   │   └ TypeScript
   └ Backend
       ├ NestJS
       └ PostgreSQL
```

#### 들여쓰기 규칙

| 공백 수 | 상대 깊이 |
|--------|---------|
| 0      | 기준 노드의 직계 자식 (depth +1) |
| 2      | depth +2 |
| 4      | depth +3 |
| (n×2)  | depth +(n+1) |

- 공백은 **2칸 단위**를 기본으로 한다 (탭 1개 = 2칸으로 자동 변환).
- 갑자기 깊이가 2단계 이상 올라가는 경우(de-indent)는 허용되며, 해당 상위 노드의 자식으로 배치된다.

* * *

5.2 스타일 상속 규칙
-----------------

- 기준 노드(Ctrl+Space 선택 노드)의 **도형(shape)** 및 **배경색(fillColor)** 을 모든 생성 노드에 기본 상속
- 생성 후 각 노드는 독립적으로 스타일 변경 가능 (상속은 **생성 시점에만** 적용)

* * *

5.3 생성 알고리즘
--------------

```
parseIndentedLines(input)
→ normalizeIndent(lines)  // 탭 → 스페이스 2칸 변환
→ buildNodeDraftTree(parsedLines)
→ validate (빈 줄 제거, 깊이 범위 확인)
→ preview (UI 미리보기)
→ [확인] bulkInsertBranches() 실행
   → 트랜잭션: 모든 노드 생성 + path/depth/order_index 일괄 설정
   → undoCommand 등록 (Undo 시 일괄 삭제)
→ layout engine 재계산
```

* * *

5.4 MVP vs 확장 기능

| 구분 | 기능 |
|------|------|
| **MVP** | Ctrl+Space 진입, 들여쓰기 파싱, 미리보기, 일괄 생성, Undo |
| **확장** | 번호 목록 자동 인식, 탭/공백 혼합 교정, AI 결과 자동 삽입 |

* * *

6\. Node Text Editing
=====================

편집 방식

```
Double Click
```

동작

```
Topic2
```

→

```
[ text input ]
```

편집 종료

```
Enter → 저장
Esc → 취소
```

* * *

7\. Node 삭제
===========

단축키

```
Delete
```

동작

```
Delete node
+ subtree
```

삭제 정책

```
노드 삭제 시
모든 하위 노드 함께 삭제
```

* * *

8\. Node 이동
===========

방식

```
Drag & Drop
```

가능 이동

```
Sibling reorder
Change parent
Change branch
```

예

```
Topic2
   └ child
```

→ drag

```
Topic3
   └ child
```

* * *

9\. Node 복사 / 붙여넣기
==================

복사

```
Ctrl + C
```

붙여넣기

```
Ctrl + V
```

복사 대상

```
node
+ subtree
+ note
+ tags
+ style
```

* * *

10\. Node Duplicate
===================

단축키

```
Ctrl + D
```

동작

```
Topic2
```

→

```
Topic2
Topic2 copy
```

subtree도 함께 복제된다.

* * *

11\. Collapse / Expand
======================

접기

```
Click collapse icon
```

펼치기

```
Click expand icon
```

데이터 저장

```
node.collapsed = true/false
```

* * *

12\. Node 생성 후 포커스 규칙
=====================

새 노드 생성 시

```
focus → new node
edit mode → 자동 진입
```

즉

```
Shift + Space
```

→ 바로 텍스트 입력 가능

* * *

13\. Editor Interaction 우선순위
============================

단축키 충돌 방지

| Priority | Action |
| --- | --- |
| 1 | Text Editing |
| 2 | Node Creation |
| 3 | Copy/Paste |
| 4 | Layout Update |

* * *

14\. 데이터 구조
===========

Node Model

```
Node {
 id
 mapId
 parentId
 text
 orderIndex
 layoutType
 collapsed
 note
 tags[]
 children[]
}
```

* * *

15\. Node 생성 이벤트
================

```
NODE_CREATE_SIBLING_AFTER
NODE_CREATE_SIBLING_BEFORE
NODE_CREATE_CHILD
NODE_CREATE_CHILD_MULTI
NODE_DELETE
NODE_MOVE
NODE_COPY
NODE_PASTE
NODE_DUPLICATE
```

* * *

16\. Autosave Trigger
=====================

Node Editing 후 자동 저장

> **[확정 2026-03-29]** 저장 타이밍 기준: `docs/03-editor-core/autosave-engine.md §8` 기준으로 통일

Trigger 및 저장 방식

| 트리거 | 저장 방식 | 딜레이 |
|--------|----------|--------|
| `node_create` | 즉시 저장 | 0ms |
| `node_delete` | 즉시 저장 | 0ms |
| `node_move` | 즉시 저장 | 0ms |
| `node_edit` (텍스트) | Debounce | **800ms** |
| `node_style` | Debounce | 800ms |

> ~~debounce 1000ms~~ → 800ms로 확정 (autosave-engine.md 기준)

* * *

17\. Layout 업데이트
================

Node 생성 시

```
update subtree layout
```

### ⚠️ LayoutType 완전 고정 선언

> **이 enum이 프론트엔드 · 백엔드 · DB · AI 모두의 단일 기준이다.**  
> 아래 값 이외의 문자열은 DB 저장 및 API 요청에서 **거부(400 Bad Request)** 한다.

```typescript
// docs/02-domain/node-model.md §LayoutType 와 동일 — 반드시 동기화 유지
export type LayoutType =
  // 방사형
  | 'radial-bidirectional'   // 기본값 (루트 노드 미설정 시 적용)
  | 'radial-right'
  | 'radial-left'
  // 트리형
  | 'tree-right'
  | 'tree-left'
  | 'tree-down'
  | 'tree-up'
  // 계층형
  | 'hierarchy-right'
  | 'hierarchy-left'
  // 진행트리
  | 'process-tree-right'
  | 'process-tree-left'
  | 'process-tree-right-a'   // 버블형
  | 'process-tree-right-b'   // 타임라인형
  // 자유배치
  | 'freeform'
  // 보드형
  | 'kanban';
```

> 상세 BL 코드 매핑은 `docs/02-domain/node-model.md §LayoutType ↔ BL 코드 매핑표` 참조.

---

### 지원 Layout — 노드 편집 동작 규칙

| Layout 타입 | 대표 코드값 | 노드 생성 시 subtree 재계산 | 특이 규칙 |
|-------------|------------|--------------------------|-----------|
| Radial (방사형) | `radial-bidirectional` | 양방향 방사 배치 재계산 | — |
| Tree (트리형) | `tree-right` / `tree-down` 등 | 단방향 계층 재배치 | — |
| Hierarchy (계층형) | `hierarchy-right` / `hierarchy-left` | 수직 계층 재배치 | — |
| Process-Tree (진행트리) | `process-tree-right` 등 | 좌→우 순서 흐름 재계산 | — |
| **Freeform (자유배치)** | `freeform` | **자동 재계산 없음** — `manual_position` 우선 | ⬇ 아래 ⚠️ 참조 |
| **Kanban** | `kanban` | depth 제한 적용 (depth 3+ 불가) | ⬇ 아래 ⚠️ 참조 |

---

### ⚠️ Freeform + Drag 시 History 규칙

> **미정의 시 발생 문제**: Undo 미작동 · Autosave 중복 패치 충돌

| 상황 | Command 타입 | 저장 필드 | History 처리 |
|------|-------------|----------|-------------|
| Freeform에서 노드 drag 이동 | **`moveNode`** | `manual_position: { x, y }` | ✅ History Stack push — Undo/Redo 가능 |
| drag 중 (mousedown → mousemove) | — | — | History push **안 함** (최종 drop 시만 기록) |
| drag 완료 (mouseup / drop) | `moveNode` | `manual_position` 확정값 저장 | ✅ Autosave 즉시 트리거 (0ms, `IMMEDIATE_SAVE_OPS`) |
| Undo 후 위치 복원 | `moveNode` inverse | 이전 `manual_position` 복원 | ✅ patchId 신규 생성 후 Autosave |

```typescript
// Freeform drag 완료 시 dispatch 예시
dispatch({
  type: 'moveNode',
  nodeId: 'n_abc123',
  // freeform: manualPosition 변경
  manualPosition: { x: 420, y: 180 },
  // 일반 트리 이동: parentId + orderIndex 변경
  // parentId: ...,
  // orderIndex: ...,
});
// → History Stack push → Autosave 즉시 트리거
```

> 참고: `docs/03-editor-core/autosave-engine.md §IMMEDIATE_SAVE_OPS`,  
> `docs/03-editor-core/command-history.md §patch_id Undo 규칙`

---

### ⚠️ Kanban + Node Editing 충돌 방지 규칙

> **미정의 시 발생 문제**: Space / Shift+Space 단축키가 Kanban 구조를 깨뜨림

| 편집 액션 | 일반 레이아웃 동작 | Kanban 재정의 동작 |
|-----------|-------------------|-------------------|
| **Space** (Create Child) | 현재 노드의 자식 생성 | **depth 0 (보드)** → 컬럼(depth 1) 생성<br>**depth 1 (컬럼)** → 카드(depth 2) 생성<br>**depth 2 (카드)** → ❌ 차단 (depth 3 불가) |
| **Shift+Space** (Create Sibling-after) | 다음 형제 노드 생성 | **depth 1 (컬럼)** → 다음 컬럼 추가<br>**depth 2 (카드)** → **같은 컬럼 내** 다음 카드 추가<br>**depth 0 (보드)** → ❌ 차단 (보드 형제 불가) |
| **Shift+Ctrl+Space** (Create Sibling-before) | 이전 형제 노드 생성 | Shift+Space와 동일 규칙 |
| **Delete** | 노드 삭제 | 컬럼 삭제 시 하위 카드 전체 cascade 삭제 — **확인 다이얼로그 필수** |

```
Kanban 구조 예시:
  보드 (depth 0)
   ├── 컬럼 A (depth 1)   ← Space로 생성 가능
   │    ├── 카드 1 (depth 2)  ← Space로 생성 가능
   │    └── 카드 2 (depth 2)  ← Shift+Space로 카드 1 다음에 추가
   └── 컬럼 B (depth 1)   ← Shift+Space로 컬럼 A 다음에 추가
        └── 카드 3 (depth 2)
```

> **핵심 규칙 요약**:
> - Kanban에서 sibling 생성(Shift+Space) = **같은 depth 레벨** 내 추가  
> - Kanban에서 child 생성(Space) = **컬럼 → 카드** 단계만 허용, depth 3+ 완전 차단  
> - 단축키 동작은 `currentNode.depth`와 `currentNode.layoutType`을 조합하여 분기

> 참고: `docs/03-editor-core/layout-engine.md §Kanban`,  
> `docs/02-domain/node-model.md §layoutType kanban`

이 부분은 **진행방향 문서와 연결됩니다.**

참고: 진행 방향 아이콘 정의 자료

맵진행방향

* * *

18\. Tag 표시 연동
==============

Node 렌더링 시

```
Node
 ├ text
 ├ icons
 └ tags
```

Tag 기능은 별도 문서에서 정의됨

tag기능

* * *

19\. UX 규칙 (MindMapper 스타일)
===========================

편집 속도 최적화 규칙

1️⃣ 키보드 중심 편집  
2️⃣ 새 노드 생성 즉시 편집  
3️⃣ 마우스 이동 최소화  
4️⃣ multi node 생성 지원

* * *

20\. 구현 난이도 평가
==============

| 기능 | 난이도 |
| --- | --- |
| Sibling Node | 낮음 |
| Child Node | 낮음 |
| Multi Child | 중간 |
| Drag Move | 중간 |
| Copy/Paste Subtree | 중간 |
| Collapse | 낮음 |

* * *

다음 단계 (매우 중요)
=============

지금 설계에서 **가장 중요한 것은 이것입니다.**

```
Mindmap Layout Engine
```

즉

```
노드 좌표 계산 알고리즘
```

이게 없으면 Editor가 완성되지 않습니다.

원하시면 다음 단계로 **easymindmap 핵심 설계**를 바로 만들어 드리겠습니다.

1️⃣ **Mindmap Layout Engine 설계 (가장 중요)**  
2️⃣ **Node 좌표 계산 알고리즘**  
3️⃣ **Radial / Tree / Process Layout 구현 방식**  
4️⃣ **D3 / vis.js / GoJS 중 최적 라이브러리 선택**

이 4개는 **이 프로젝트 성공을 좌우하는 핵심 설계**입니다.



---
Powered by [ChatGPT Exporter](https://www.chatgptexporter.com)
