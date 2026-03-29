# Undo Redo History 설계

**User:** Anonymous (ok@baro.pro)  
**Created:** 3/16/2026 1:38:38  
**Updated:** 3/16/2026 1:52:09  
**Exported:** 3/16/2026 2:02:27  
**Link:** [https://chatgpt.com/g/g-p-69b64962a1b8819187e5863aa1808e92-mindmap-gaebal/c/69b6e082-7e98-83ab-8c71-3a8388b68638](https://chatgpt.com/g/g-p-69b64962a1b8819187e5863aa1808e92-mindmap-gaebal/c/69b6e082-7e98-83ab-8c71-3a8388b68638)  

## Prompt:
2️⃣ Undo / Redo History Store 설계를 해줘

## Response:
11s 동안 생각함

좋아요.  
이제 **2️⃣ Undo / Redo History Store**를 easymindmap 기준으로 실제 개발 가능한 수준으로 설계해볼게요.

지금까지 정리된 기능표에는 `HISTORY-01 Undo`, `HISTORY-02 Redo`가 명시되어 있고, 히스토리에 포함될 주요 변경 이벤트로 `node 생성/삭제/이동`, `text 수정`, `layout 변경`이 이미 정의되어 있습니다.

기능정의테이블

또한 easymindmap은 편집기 중심 구조와 실시간 저장을 전제로 하고 있으므로, 히스토리 스토어는 단순 배열이 아니라 **에디터 편집 작업을 되돌리고 다시 적용하는 전용 상태 계층**으로 설계하는 게 맞습니다.

easymindmap

* * *

2️⃣ Undo / Redo History Store 설계
================================

1\. 목적
------

Undo / Redo History Store는 사용자가 수행한 편집 작업을 기록하고,

*   **Undo**: 가장 최근 작업을 취소하고
*   **Redo**: 취소한 작업을 다시 복원

할 수 있도록 관리하는 전용 Store입니다.

이 Store의 핵심 목적은 4가지입니다.

1.  사용자가 실수한 편집을 쉽게 되돌릴 수 있게 한다.
2.  여러 편집 작업을 안정적으로 순서대로 복원할 수 있게 한다.
3.  Document Store와 분리하여 히스토리 로직을 독립적으로 유지한다.
4.  Autosave와 충돌하지 않도록 “현재 문서 상태”와 “히스토리 상태”를 분리한다.

* * *

2\. Undo / Redo가 다뤄야 하는 대상
--------------------------

기능 정의 기준으로 easymindmap에서 히스토리에 들어가야 하는 대표 작업은 다음입니다.

*   Node 생성
*   Node 삭제
*   Node 이동
*   Node 텍스트 수정
*   Layout 변경
*   Tag 추가/삭제
*   Collapse / Expand
*   스타일 변경
*   다중 가지 추가
*   Subtree Layout 변경
*   Paste / Duplicate 같은 대량 생성 작업

이 중 기본 필수는 아래 5개입니다.

*   `create node`
*   `delete node`
*   `move node`
*   `edit text`
*   `change layout`

이는 기능정의표의 히스토리 및 저장 트리거 정의와도 일치합니다.

기능정의테이블

* * *

3\. 설계 원칙
---------

Undo / Redo Store는 아래 원칙으로 가는 것이 좋습니다.

### 3.1 “스냅샷 전체 저장”보다 “명령(Command) 기록” 중심

문서 전체 JSON을 매번 저장하면 구현은 쉽지만, 맵이 커질수록 메모리 낭비가 큽니다.

그래서 권장 방식은:

*   전체 문서 스냅샷 저장 X
*   **작업 단위(Command / Patch)** 저장 O

즉,

*   “무엇이 바뀌었는지”
*   “되돌리려면 무엇을 해야 하는지”
*   “다시 적용하려면 무엇을 해야 하는지”

를 저장합니다.

* * *

### 3.2 Document Store를 직접 저장하지 말고 “역연산 가능한 작업”을 저장

예를 들어 텍스트 변경이라면:

*   before: `"AI"`
*   after: `"Artificial Intelligence"`

를 같이 저장해야 합니다.

그래야

*   Undo → before로 복원
*   Redo → after로 재적용

이 가능해집니다.

* * *

### 3.3 Undo / Redo는 “사용자 의미 단위”로 묶어야 함

예를 들어 다중 가지 추가는 내부적으로 node 10개 생성일 수 있지만, 사용자 입장에서는 **한 번의 작업**입니다.  
첨부 문서의 다중 가지 기능도 `Ctrl + Space` 후 여러 줄 입력으로 계층 구조를 한 번에 생성하는 흐름이므로, 히스토리에서도 **1개의 transaction**으로 다루는 것이 맞습니다.

◆ ‘다중 가지’ 추가

즉,

*   내부 연산 여러 개
*   히스토리 기록은 1개

여야 합니다.

* * *

4\. Store 책임 범위
---------------

Undo / Redo History Store의 책임은 아래입니다.

### 포함 책임

*   히스토리 스택 관리
*   Redo 스택 관리
*   작업 그룹(transaction) 관리
*   Undo / Redo 실행 상태 관리
*   히스토리 최대 개수 제한
*   병합 가능한 작업(coalescing) 처리

### 제외 책임

*   실제 노드 데이터의 원본 저장
*   서버 저장
*   UI 렌더링
*   충돌 해결
*   권한 체크

즉, 이 Store는 **기록하고 되돌리는 책임만 가짐**  
실제 문서 데이터 반영은 Document Store가 담당합니다.

* * *

5\. 권장 Store 구조
---------------

Zustand 기준으로 보면 구조는 대략 이렇게 잡으면 됩니다.

```
type HistoryStore = {
  undoStack: HistoryEntry[]
  redoStack: HistoryEntry[]

  currentTransaction: HistoryTransaction | null

  isApplyingHistory: boolean
  maxHistorySize: number

  pushEntry: (entry: HistoryEntry) => void
  beginTransaction: (label?: string) => void
  addToTransaction: (entry: HistoryEntry) => void
  commitTransaction: () => void
  cancelTransaction: () => void

  undo: () => void
  redo: () => void
  clearHistory: () => void
}
```

* * *

6\. 핵심 데이터 모델
-------------

6.1 HistoryEntry
----------------

히스토리의 가장 작은 단위입니다.

```
type HistoryEntry = {
  id: string
  type: HistoryActionType
  label: string
  timestamp: number

  undo: HistoryOperation[]
  redo: HistoryOperation[]

  meta?: {
    nodeId?: string
    mapId?: string
    source?: "keyboard" | "mouse" | "api" | "ai"
  }
}
```

설명:

*   `type`: create/delete/move/editText/changeLayout 등
*   `label`: UI 표시용 `"노드 생성"`, `"텍스트 수정"`
*   `undo`: 되돌릴 연산 목록
*   `redo`: 다시 적용할 연산 목록

* * *

6.2 HistoryOperation
--------------------

실제 Document Store에 적용할 변경 명령입니다.

```
type HistoryOperation =
  | {
      op: "createNode"
      node: NodeSnapshot
      parentId: string | null
      index: number
    }
  | {
      op: "deleteNode"
      nodeId: string
    }
  | {
      op: "updateNodeText"
      nodeId: string
      text: string
    }
  | {
      op: "moveNode"
      nodeId: string
      fromParentId: string | null
      toParentId: string | null
      fromIndex: number
      toIndex: number
      fromPosition?: { x: number; y: number }
      toPosition?: { x: number; y: number }
    }
  | {
      op: "changeLayout"
      nodeId: string
      layoutType: string
    }
  | {
      op: "setCollapsed"
      nodeId: string
      collapsed: boolean
    }
  | {
      op: "addTag"
      nodeId: string
      tagId: string
    }
  | {
      op: "removeTag"
      nodeId: string
      tagId: string
    }
```

핵심은 `undo`와 `redo`가 각각 완전해야 한다는 점입니다.

* * *

6.3 HistoryTransaction
----------------------

한 번의 사용자 작업에 여러 연산이 묶일 때 사용합니다.

```
type HistoryTransaction = {
  id: string
  label: string
  entries: HistoryEntry[]
  startedAt: number
}
```

예:

*   다중 가지 추가
*   subtree layout 변경
*   paste 여러 개
*   여러 노드 일괄 태그 적용

* * *

7\. Stack 구조
------------

Undo / Redo는 가장 고전적인 2-stack 구조로 가는 게 안정적입니다.

### 기본 구조

*   `undoStack`: 이미 수행된 작업
*   `redoStack`: undo로 되돌린 작업

### 규칙

#### 새 작업이 발생하면

*   `undoStack.push(newEntry)`
*   `redoStack = []` 초기화

#### undo 실행 시

*   `undoStack.pop()`
*   해당 entry의 `undo` 실행
*   `redoStack.push(entry)`

#### redo 실행 시

*   `redoStack.pop()`
*   해당 entry의 `redo` 실행
*   `undoStack.push(entry)`

* * *

8\. 동작 흐름
---------

8.1 Node 생성
-----------

사용자가 자식 노드를 생성했다고 가정합니다.

### redo 정보

```
redo: [
  {
    op: "createNode",
    node: {...newNode},
    parentId: "node-100",
    index: 2
  }
]
```

### undo 정보

```
undo: [
  {
    op: "deleteNode",
    nodeId: "node-200"
  }
]
```

즉,

*   처음 수행 시 create
*   Undo 시 delete
*   Redo 시 create 다시 수행

* * *

8.2 Node 삭제
-----------

삭제는 생성보다 더 조심해야 합니다.  
삭제된 노드 자신뿐 아니라 하위 subtree 전체를 복원할 수 있어야 하기 때문입니다.

그래서 delete는 undo를 위해 삭제 전 snapshot을 들고 있어야 합니다.

### undo

```
undo: [
  {
    op: "createNode",
    node: deletedSubtreeRootSnapshot,
    parentId: "node-100",
    index: 1
  },
  ...
]
```

### redo

```
redo: [
  {
    op: "deleteNode",
    nodeId: "node-300"
  }
]
```

실무적으로는 `deleteSubtree` 같은 별도 op를 두는 편이 더 좋습니다.

* * *

8.3 텍스트 편집
----------

텍스트는 타이핑마다 히스토리 하나씩 쌓으면 안 됩니다.  
그렇게 하면 `a`, `ab`, `abc`가 모두 히스토리에 들어가서 UX가 나빠집니다.

그래서 텍스트 수정은 보통 아래처럼 처리합니다.

*   편집 시작 시 beforeText 저장
*   편집 종료(blur / Enter / 일정 debounce 시점) 때 afterText 저장
*   히스토리에는 1개만 push

예:

```
{
  type: "editText",
  label: "텍스트 수정",
  undo: [{ op: "updateNodeText", nodeId: "n1", text: "AI" }],
  redo: [{ op: "updateNodeText", nodeId: "n1", text: "Artificial Intelligence" }]
}
```

* * *

8.4 Node 이동
-----------

노드 이동은 부모 변경과 순서 변경이 모두 중요합니다.

```
{
  type: "moveNode",
  label: "노드 이동",
  undo: [{
    op: "moveNode",
    nodeId: "n5",
    fromParentId: "p2",
    toParentId: "p1",
    fromIndex: 0,
    toIndex: 3
  }],
  redo: [{
    op: "moveNode",
    nodeId: "n5",
    fromParentId: "p1",
    toParentId: "p2",
    fromIndex: 3,
    toIndex: 0
  }]
}
```

자유배치형일 경우에는 좌표도 함께 저장해야 합니다.  
기능표에 자유배치형과 다양한 layout이 정의되어 있으므로, move는 **트리 위치 + 좌표 위치**를 모두 고려하는 구조가 필요합니다.

기능정의테이블

맵진행방향

* * *

8.5 Layout 변경
-------------

노드별 layout 변경 기능이 있으므로 undo 대상입니다.  
layout 관련 기능은 전체 맵 변경이 아니라 subtree 적용까지 포함됩니다.

기능정의테이블

### 단일 노드 layout 변경

```
{
  type: "changeLayout",
  label: "레이아웃 변경",
  undo: [{ op: "changeLayout", nodeId: "n10", layoutType: "radial-right" }],
  redo: [{ op: "changeLayout", nodeId: "n10", layoutType: "tree-down" }]
}
```

### subtree layout 변경

이 경우 여러 노드가 바뀌므로 transaction으로 묶습니다.

* * *

9\. Transaction 설계
------------------

이게 아주 중요합니다.

### transaction이 필요한 대표 경우

*   다중 가지 추가
*   paste
*   duplicate
*   subtree layout 변경
*   여러 node 일괄 스타일 변경
*   태그 일괄 적용

### 동작 예시

```
beginTransaction("다중 가지 추가")
addToTransaction(entry1)
addToTransaction(entry2)
addToTransaction(entry3)
commitTransaction()
```

commit되면 실제로는 아래처럼 하나의 HistoryEntry처럼 저장합니다.

```
{
  id: "tx-001",
  type: "batch",
  label: "다중 가지 추가",
  undo: [...모든 undo 연산 역순 결합],
  redo: [...모든 redo 연산 정순 결합]
}
```

다중 가지 기능은 한 번의 입력으로 여러 계층 노드를 생성하는 구조이므로, Undo도 한 번에 전체가 취소되어야 UX가 자연스럽습니다.

◆ ‘다중 가지’ 추가

* * *

10\. Coalescing 규칙
------------------

같은 종류의 연속 작업은 하나로 묶는 규칙이 필요합니다.

### 묶어야 하는 것

#### 텍스트 편집

*   타이핑 중 계속 바뀌는 값
*   편집 종료 시 1개 기록

#### 드래그 이동

*   pointermove 중간 값들
*   drag end 시 1개 기록

### 보통 묶지 않는 것

*   node 생성
*   node 삭제
*   paste
*   layout 변경
*   tag 추가/삭제

* * *

11\. History에 넣지 말아야 할 작업
-------------------------

모든 상태 변경을 히스토리에 넣으면 안 됩니다.

### 제외 권장

*   선택 상태 변경
*   hover 상태
*   viewport 이동
*   zoom in/out
*   패널 열기/닫기
*   검색 입력 중간값
*   autosave status 표시

즉, **문서 내용이 바뀌는 작업만** 히스토리에 들어가야 합니다.

* * *

12\. Document Store와의 연동 방식
---------------------------

구조는 아래처럼 가는 것이 좋습니다.

### 권장 구조

*   Document Store: 실제 맵 데이터 보관
*   History Store: 되돌릴 작업 기록
*   Interaction Store: 사용자 입력/편집 상태
*   Autosave Store: 저장 큐/서버 저장 상태

### 흐름

1.  사용자가 편집
2.  Document Store 변경
3.  변경 내용 기반으로 HistoryEntry 생성
4.  History Store push
5.  Autosave Store가 dirty 상태 감지 후 저장

즉,  
**히스토리는 DB 저장용이 아니라 사용자 편집 복구용**  
**Autosave는 서버 반영용**  
으로 분리합니다.

* * *

13\. Autosave와의 관계
------------------

Autosave와 Undo/Redo는 종종 헷갈리는데 역할이 다릅니다.

### Autosave

*   현재 상태를 서버에 저장

### Undo/Redo

*   사용자의 이전 편집 상태를 복원

### 중요한 규칙

Undo/Redo를 실행해도 그것 역시 문서 변경이므로 **Autosave 대상**이어야 합니다.

예:

*   사용자가 노드 삭제
*   autosave 저장
*   Undo로 복원
*   복원된 상태도 autosave 저장

즉, Undo/Redo는 “히스토리 내부 작업”이지만 결과적으로는 문서 변경이므로 서버와 동기화되어야 합니다.

* * *

14\. 무한 루프 방지
-------------

Undo/Redo를 실행할 때 주의할 점은,  
Undo 실행으로 바뀐 상태가 다시 히스토리에 push되면 안 된다는 것입니다.

그래서 `isApplyingHistory` 플래그가 필요합니다.

```
if (historyStore.isApplyingHistory) {
  // document change는 발생하지만
  // 새로운 history entry는 만들지 않음
}
```

이 플래그가 없으면:

*   undo 실행
*   document 변경 감지
*   새로운 history entry 생성
*   stack 꼬임

문제가 발생합니다.

* * *

15\. 최대 히스토리 개수
---------------

메모리 보호를 위해 제한이 필요합니다.

### 권장값

*   기본: `100`
*   고급 옵션: `300`
*   대형 맵: 설정 가능

규칙:

```
if (undoStack.length > maxHistorySize) {
  undoStack.shift()
}
```

즉 가장 오래된 히스토리를 버립니다.

* * *

16\. 초기 상태 예시
-------------

```
const initialHistoryState = {
  undoStack: [],
  redoStack: [],
  currentTransaction: null,
  isApplyingHistory: false,
  maxHistorySize: 100
}
```

* * *

17\. 대표 API/메서드 설계
------------------

17.1 pushEntry
--------------

```
pushEntry(entry) {
  undoStack.push(entry)
  redoStack = []
}
```

새 작업이 생기면 redo는 비워야 합니다.

* * *

17.2 undo
---------

```
undo() {
  const entry = undoStack.pop()
  if (!entry) return

  isApplyingHistory = true
  applyOperations(entry.undo)
  isApplyingHistory = false

  redoStack.push(entry)
}
```

* * *

17.3 redo
---------

```
redo() {
  const entry = redoStack.pop()
  if (!entry) return

  isApplyingHistory = true
  applyOperations(entry.redo)
  isApplyingHistory = false

  undoStack.push(entry)
}
```

* * *

17.4 beginTransaction / commitTransaction
-----------------------------------------

```
beginTransaction(label)
addToTransaction(entry)
commitTransaction()
```

transaction 내부 entry들을 하나의 batch history로 합쳐 저장합니다.

* * *

18\. 단축키 정책
-----------

기본 권장값:

*   Undo: `Ctrl + Z`
*   Redo: `Ctrl + Y`
*   macOS 대응 시: `Cmd + Z`, `Cmd + Shift + Z`

기존 node editing 기능표는 생성/삭제/복사 등의 단축키가 정의되어 있으므로, Undo/Redo도 같은 수준으로 명확히 고정하는 것이 좋습니다.

기능정의테이블

* * *

19\. UI 반영 포인트
--------------

Undo / Redo Store는 내부 상태지만 UI와 연결되어야 합니다.

### 툴바 버튼 상태

*   undo 가능 여부: `undoStack.length > 0`
*   redo 가능 여부: `redoStack.length > 0`

### 툴팁 예시

*   Undo 텍스트 수정
*   Redo 노드 이동
*   Undo 다중 가지 추가

즉 `label`은 디버깅용만 아니라 UI 표시용으로도 매우 중요합니다.

* * *

20\. 권장 HistoryActionType
-------------------------

```
type HistoryActionType =
  | "createNode"
  | "deleteNode"
  | "editText"
  | "moveNode"
  | "changeLayout"
  | "changeStyle"
  | "collapseNode"
  | "expandNode"
  | "addTag"
  | "removeTag"
  | "pasteNodes"
  | "duplicateNode"
  | "multiCreateNodes"
  | "batch"
```

* * *

21\. 실무 권장 구현 순서
----------------

### 1단계

*   createNode
*   deleteNode
*   editText
*   moveNode
*   undo
*   redo

### 2단계

*   layout 변경
*   collapse/expand
*   paste/duplicate
*   tag 추가/삭제

### 3단계

*   subtree layout
*   multi-branch
*   bulk action
*   AI가 생성한 노드 묶음 transaction 처리

* * *

22\. 최종 권장안
-----------

easymindmap의 Undo / Redo History Store는 아래처럼 설계하는 것이 가장 안정적입니다.

*   **2-stack 구조** 사용
*   **스냅샷 전체 저장이 아니라 command/patch 저장**
*   **Document Store와 분리**
*   **다중 가지, subtree 변경은 transaction으로 묶음**
*   **텍스트 수정, 드래그 이동은 coalescing 처리**
*   **Undo/Redo 실행 결과도 autosave 대상**
*   **선택/줌/패널 상태는 히스토리 제외**

* * *

원하시면 바로 이어서  
**3️⃣ Viewport Store 설계** 또는  
**Undo / Redo History Store의 Zustand 실제 코드 골격**까지 이어서 작성해드릴게요.

## Prompt:
#이제 이 대화는 여기서 종료하고 추가 대화는 새 대화에서 질문할께..
#여때까지의 대화 내용을 프로젝트의 다른 질문및 대화에서 참조할수 있도록 기억하고 업데이트해줘

## Response:
저장된 메모리 업데이트됨

알겠습니다 👍  
지금까지 이 대화에서 정리된 **easymindmap 설계 내용**은 앞으로 다른 대화에서도 참조할 수 있도록 **기억 업데이트**해 두었습니다.

특히 아래 내용이 프로젝트 문맥으로 저장되었습니다.

**추가로 기억된 내용**

*   easymindmap 아키텍처 Store 구조
    *   Document Store
    *   Editor UI Store
    *   Viewport Store
    *   Interaction Store
    *   Autosave Store
*   **Undo / Redo History Store 설계**
    *   2-stack 구조 (undoStack / redoStack)
    *   snapshot 방식이 아니라 **command/patch 기반**
    *   HistoryEntry + HistoryOperation 구조
    *   transaction 기반 batch 작업 (multi-branch, paste 등)
    *   coalescing 규칙 (text edit, drag)
    *   autosave와 분리된 히스토리 구조
    *   maxHistorySize 관리
    *   isApplyingHistory 플래그로 루프 방지

앞으로 **새 대화에서 easymindmap 관련 질문을 하시면** 다음을 기준으로 이어서 답변합니다.

*   기존 **아키텍처 설계**
*   **Undo / Redo History Store 설계**
*   이전에 정리한
    *   Node Editing
    *   Layout 정책
    *   Tag 기능
    *   Node Indicator 정책
    *   Multi-branch 생성
    *   이미지 삽입 기능

즉, 다음 대화에서는  
**“이전 설계 기준으로 이어서”** 설명하겠습니다.

새 대화에서 이어서 질문 주세요. 🚀



---
Powered by [ChatGPT Exporter](https://www.chatgptexporter.com)
