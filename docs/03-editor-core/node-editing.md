# Node Editing 기능 정리

**User:** Anonymous (ok@baro.pro)  
**Created:** 3/16/2026 0:28:56  
**Updated:** 3/16/2026 0:30:17  
**Exported:** 3/16/2026 2:05:35  
**Link:** [https://chatgpt.com/g/g-p-69b64962a1b8819187e5863aa1808e92-mindmap-gaebal/c/69b6cf81-3fcc-83a3-96ae-23595093f74c](https://chatgpt.com/g/g-p-69b64962a1b8819187e5863aa1808e92-mindmap-gaebal/c/69b6cf81-3fcc-83a3-96ae-23595093f74c)  

## Prompt:
![업로드한 이미지](https://chatgpt.com/backend-api/estuary/content?id=file_000000008fc07207903d3961b5f5599d&ts=492664&p=fs&cid=1&sig=3954db03d5a5870734bf012b90346c8662ca57693d84e396eaf89598087d208c&v=0)

![업로드한 이미지](https://chatgpt.com/backend-api/estuary/content?id=file_00000000307472079564ceec81617ac8&ts=492664&p=fs&cid=1&sig=aa49bb4205140ab17a29849cd41138420884ed08e1c8b2edaffb62b2293f1b68&v=0)

#Node Edting 기능
#Node Edting 기능에서 단축키를 아래와 에서 단축키를 아래와 같이 정의해줘 (www.mindmapper.com 과 같은 기준)
#다중 가지 추가 기능도 추가해줘기능
# ID	기능명	설명	단축키 
NODE-01	Create Sibling Node-after	형제 Node 생성(다음)	LeftShift + Space
NODE-02	Create Sibling Node-before	형제 Node 생성(이전)	LeftShift + Ctl + Space
NODE-03	Create Child Node	자식 Node 생성	Space
NODE-04	Create Child Node (multi)	자식 Node 생성 (multi)	Ctl + Space
NODE-05	Edit Node Text	Node 텍스트 편집	Double Click
NODE-06	Delete Node	Node 삭제	Delete
NODE-07	Move Node	Node Drag 이동	Drag
NODE-08	Copy Node	Node 복사	Ctrl+C
NODE-09	Paste Node	Node 붙여넣기	Ctrl+V
NODE-10	Duplicate Node	Node 복제	Ctrl+D
NODE-11	Collapse Node	Node 접기	Click
NODE-12	Expand Node	Node 펼치기	Click

## Response:
좋습니다. 올려주신 **Node Editing 기능 + 단축키 기준(mindmapper 스타일)**을 기준으로 **실제 개발 문서 수준으로 정리**해 드리겠습니다.  
또한 요청하신 **다중 가지 추가 기능 (multi child)**도 포함해 정리합니다.

현재 프로젝트 흐름상 이 문서는 **Editor Interaction Spec** 문서에 들어가는 내용입니다.

* * *

easymindmap Node Editing 기능 명세
==============================

Document : Editor Interaction Spec  
Module : Mindmap Editor  
Version : v1.0

* * *

1\. Node Editing 기능 개요
======================

Node Editing 기능은 **mindmap 편집기의 핵심 인터랙션 기능**이다.

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

Trigger

```
node_create
node_delete
node_move
node_edit
```

저장 방식

```
debounce 1000ms
```

* * *

17\. Layout 업데이트
================

Node 생성 시

```
update subtree layout
```

지원 Layout

*   Map
*   Radial
*   Tree
*   Process

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
