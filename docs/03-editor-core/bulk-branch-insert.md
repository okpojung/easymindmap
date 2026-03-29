# 다중 가지 추가 설계 (Bulk Branch Insert)

> **[정책 통일 노트 2026-03-29]**  
> 이 문서는 `docs/03-editor-core/node-editing.md` 섹션 5 "다중 자식 노드 생성"과 **완전히 통일**된다.  
> 
> **확정 정책 요약:**
> - 단축키: `Ctrl + Space` (고정)
> - 입력 방식: **들여쓰기(공백 2칸 = 1단계) 계층 표현 — 유일하게 공식 지원**
> - 쉼표/탭 구분자 방식은 **사용하지 않음** (MVP 범위 제외)
> - 내부 기능 키: `bulkInsertBranches`
> - 상세 입력 규칙은 node-editing.md 섹션 5.1 참조

---

**User:** Anonymous (ok@baro.pro)  
**Created:** 3/16/2026 0:34:47  
**Updated:** 3/16/2026 1:59:50  
**Exported:** 3/16/2026 2:00:09  
**Link:** [https://chatgpt.com/g/g-p-69b64962a1b8819187e5863aa1808e92-mindmap-gaebal/c/69b6d191-1834-83a5-a5ad-82765a972233](https://chatgpt.com/g/g-p-69b64962a1b8819187e5863aa1808e92-mindmap-gaebal/c/69b6d191-1834-83a5-a5ad-82765a972233)  

## Prompt:
◆ ‘다중 가지’ 추가.pdf

PDF

다중가지 추가 기능은 아래 첨부파일 참조해서 설게 해줘

## Response:
14s 동안 생각함

좋습니다. 첨부하신 다중 가지 추가 방식 기준으로 **easymindmap용 실제 구현 가능한 설계**로 정리해드릴게요.

핵심 규칙은 첨부파일 그대로 잡으면 됩니다.

*   실행 단축키: **Ctrl + Space**
*   입력 방식: **한 줄 = 한 개 가지**
*   계층 표현: **맨 앞 공백(space)으로 부모-자식 관계 표현**
*   결과: 한 번에 **여러 개 + 여러 레벨**의 가지를 생성
    ◆ ‘다중 가지’ 추가

특히 첨부 PDF 2페이지 예시를 보면, 선택한 노드 아래에 여러 형제 가지와 그 하위 상세 가지가 한 번에 생성되는 구조입니다. 즉 이 기능은 단순 “여러 노드 추가”가 아니라 **텍스트 기반 subtree 일괄 생성기**로 설계하는 게 맞습니다.

◆ ‘다중 가지’ 추가

* * *

1\. 기능명 정의
==========

**기능명**

*   다중 가지 추가
*   영문: **Bulk Branch Insert**
*   내부 기능 키: `bulkInsertBranches`

**목적**

*   사용자가 선택한 기준 노드 아래에
*   여러 형제 노드와 하위 자식 노드를
*   텍스트 입력 한 번으로 빠르게 생성

* * *

2\. 사용자 동작 정의
=============

2.1 진입 방식
---------

선택된 노드에서:

*   단축키: `Ctrl + Space`
*   우클릭 메뉴: `다중 가지 추가`
*   툴바 메뉴: `Insert > Bulk Branch Insert`

2.2 입력 UI
---------

모달 팝업 또는 우측 패널 에디터:

제목:

*   **다중 가지 추가**

안내문:

*   한 줄에 한 가지가 생성됩니다.
*   줄 앞 공백으로 하위 가지를 표현합니다.
*   공백이 깊어질수록 더 하위 레벨로 생성됩니다.

입력창 예시:

```
내용
내용
 상세내용
 관련설명
  관련설명
 상세내용
상세내용
내용
```

이 구조는 첨부하신 문서 설명과 동일하게 맞추면 됩니다.

◆ ‘다중 가지’ 추가

* * *

3\. 입력 문법 설계
============

가장 중요한 부분입니다.

3.1 기본 규칙
---------

*   빈 줄은 무시
*   한 줄 = 노드 1개
*   줄 앞의 들여쓰기 수준으로 부모 결정

3.2 들여쓰기 규칙
-----------

추천은 아래처럼 정하는 게 좋습니다.

### MVP 규칙

*   **앞 공백 1칸 = 하위 1레벨**
*   앞 공백 2칸 = 하위 2레벨
*   앞 공백 3칸 = 하위 3레벨

예:

```
주제A
 상세A-1
  상세A-1-1
 상세A-2
주제B
```

생성 결과:

*   주제A
    *   상세A-1
        *   상세A-1-1
    *   상세A-2
*   주제B

3.3 탭 처리
--------

실사용상 복붙할 때 탭이 들어올 수 있으므로:

*   `\t` 1개 = 공백 2칸 또는 4칸으로 normalize
*   내부 저장 전 전부 space로 변환

추천:

*   내부 기준은 **space 2칸 = 1레벨**
*   하지만 첨부 문서가 “한 칸(space)” 설명이라 UI 설명은 그대로 두고,
*   실제 파서는 **1칸 이상 증가하면 하위로 인정**하는 완화형으로 두는 게 안전합니다.
    ◆ ‘다중 가지’ 추가

* * *

4\. UX 설계
=========

4.1 모달 구성
---------

### 상단

*   제목: 다중 가지 추가
*   닫기 버튼

### 본문 안내

*   많은 가지를 한 번에 만들 때 사용합니다.
*   한 줄에 한 가지가 생성됩니다.
*   앞 공백으로 하위 구조를 표현합니다.
*   다른 문서의 목차를 복사해 붙여넣을 수 있습니다.

### 입력 영역

*   multiline textarea
*   monospace 폰트
*   행 번호 표시 옵션
*   붙여넣기 최적화

### 하단 버튼

*   `미리보기`
*   `확인`
*   `취소`

4.2 미리보기
--------

강력 추천입니다.

입력한 텍스트를 바로 트리로 보여줍니다.

예:

```
제품기획
 시장분석
  경쟁사분석
  고객분석
 개발계획
  프론트엔드
  백엔드
```

우측 미리보기:

*   제품기획
    *   시장분석
        *   경쟁사분석
        *   고객분석
    *   개발계획
        *   프론트엔드
        *   백엔드

이 미리보기 있으면 입력 오류가 확 줄어듭니다.

4.3 오류 안내
---------

아래는 입력 전에 즉시 검증:

*   첫 줄이 과도하게 들여쓰기된 경우
*   중간에 레벨이 1 → 4처럼 급점프하는 경우
*   공백/탭 혼합이 심한 경우
*   너무 긴 텍스트

오류 메시지 예:

*   `3번째 줄의 들여쓰기 단계가 비정상적입니다.`
*   `첫 번째 줄은 최상위 가지여야 합니다.`

* * *

5\. 데이터 처리 규칙
=============

선택 노드를 `targetNode`라고 할 때:

*   입력 최상위 줄들은 `targetNode`의 자식으로 생성
*   들여쓰기된 줄은 직전 상위 레벨 노드의 자식으로 생성

즉, 기준 노드 아래에 subtree를 붙이는 방식입니다.

예시
--

선택 노드: `제목`

입력:

```
내용
 관련설명
  상세내용
내용2
```

생성:

*   제목
    *   내용
        *   관련설명
            *   상세내용
    *   내용2

첨부된 그림 2페이지의 빨간 박스 결과와 같은 흐름입니다.

◆ ‘다중 가지’ 추가

* * *

6\. 내부 알고리즘 설계
==============

6.1 파싱 결과 구조
------------

입력 텍스트를 먼저 중간 구조로 변환:

```
type ParsedBulkLine = {
  raw: string;
  text: string;
  indent: number;
  level: number;
  lineNumber: number;
};
```

6.2 트리 생성 알고리즘
--------------

스택 기반이 가장 안정적입니다.

### 흐름

1.  줄 단위 분리
2.  빈 줄 제거
3.  각 줄의 앞 공백 수 계산
4.  indent → level 변환
5.  stack을 이용해 부모 결정
6.  생성 예정 노드 배열 작성
7.  한 번에 transaction 저장

### 의사코드

```
const stack: { level: number; nodeId: string }[] = [];
stack.push({ level: -1, nodeId: targetNodeId });

for (const line of parsedLines) {
  while (stack.length > 0 && stack[stack.length - 1].level >= line.level) {
    stack.pop();
  }

  const parent = stack[stack.length - 1];
  const newNode = createNodeDraft({
    parentId: parent.nodeId,
    text: line.text,
  });

  stack.push({ level: line.level, nodeId: newNode.id });
}
```

* * *

7\. DB 저장 방식
============

이 기능은 여러 노드를 한 번에 추가하므로 반드시 **트랜잭션**으로 저장해야 합니다.

저장 순서
-----

1.  bulk insert 요청 생성
2.  파싱/검증
3.  노드 draft 배열 생성
4.  `orderIndex` 계산
5.  DB transaction 시작
6.  nodes 일괄 insert
7.  revision/event log 저장
8.  commit

revision 로그 예시
--------------

```
{
  "type": "bulk_insert_branches",
  "targetNodeId": "node_100",
  "createdCount": 8
}
```

* * *

8\. API 설계
==========

8.1 요청 API
----------

```
POST /maps/{mapId}/nodes/{targetNodeId}/bulk-insert
```

Request:

```
{
  "text": "내용\n 상세내용\n내용2",
  "indentMode": "space",
  "preview": false
}
```

8.2 Response
------------

```
{
  "success": true,
  "createdCount": 3,
  "createdNodeIds": ["n101", "n102", "n103"]
}
```

8.3 미리보기 API
------------

```
POST /maps/{mapId}/nodes/{targetNodeId}/bulk-insert/preview
```

Response:

```
{
  "success": true,
  "tree": [
    {
      "text": "내용",
      "children": [
        { "text": "상세내용", "children": [] }
      ]
    },
    {
      "text": "내용2",
      "children": []
    }
  ]
}
```

* * *

9\. 에디터 동작 규칙
=============

9.1 생성 후 포커스
------------

생성 완료 후:

*   첫 번째 생성 노드를 선택하거나
*   생성된 노드 전체를 임시 highlight

추천:

*   **첫 번째 생성 노드 선택 + 전체 생성노드 2초 강조 표시**

9.2 펼침 처리
---------

생성 결과가 보이도록:

*   기준 노드가 접혀 있으면 자동 펼침
*   생성된 하위 부모들도 자동 펼침

9.3 undo / redo
---------------

이 기능은 반드시 **1회 undo로 전체 취소**되어야 합니다.

예:

*   12개 노드가 생성되었더라도
*   `Ctrl + Z` 한 번에 전체 삭제

이건 편집 UX에서 굉장히 중요합니다.

* * *

10\. 입력 예시와 결과
==============

예시 1
----

입력:

```
기획
 설계
 개발
 테스트
```

결과:

*   기준노드
    *   기획
        *   설계
        *   개발
        *   테스트

예시 2
----

입력:

```
기획
 시장조사
  경쟁사
  고객요구
 개발
  프론트
  백엔드
```

결과:

*   기준노드
    *   기획
        *   시장조사
            *   경쟁사
            *   고객요구
        *   개발
            *   프론트
            *   백엔드

예시 3: 목차 붙여넣기
-------------

```
1. 프로젝트 개요
 1.1 목적
 1.2 범위
2. 기능 요구사항
 2.1 편집기
 2.2 Export
```

이런 식으로 타 문서 목차를 붙여넣어도 동작하도록 하면 아주 실용적입니다. 첨부 문서에서도 “다른 문서의 목차나 텍스트를 복사해 넣을 수 있다”는 취지로 보입니다.

◆ ‘다중 가지’ 추가

* * *

11\. 예외 처리 정책
=============

허용
--

*   앞뒤 공백 trim
*   빈 줄 무시
*   탭 자동 변환
*   연속 공백 normalize 옵션

차단
--

*   텍스트 없는 들여쓰기 줄
*   최대 레벨 초과
*   최대 노드 수 초과
*   한 줄 최대 글자 수 초과

추천 제한:

*   1회 최대 200줄
*   최대 계층 10레벨
*   한 줄 최대 200자

* * *

12\. UI 세부 권장사항
===============

textarea 입력 보조
--------------

*   붙여넣기 시 자동 normalize
*   탭 → 공백 변환
*   들여쓰기 가이드 라인 표시
*   줄 번호 표시
*   예제 불러오기 버튼

도움말
---

모달 하단에 짧게:

```
예)
주제
 상세1
  상세1-1
 상세2
```

* * *

13\. 기술 구현 포인트
==============

귀하의 easymindmap 구조 기준으로 이 기능은 아래 레이어로 분리하면 깔끔합니다.

프론트
---

*   `BulkInsertDialog`
*   `bulkTextParser.ts`
*   `bulkInsertPreview.ts`
*   `useBulkInsertCommand.ts`

백엔드
---

*   `BulkInsertService`
*   `BulkInsertValidator`
*   `NodeTreeBuilder`
*   `RevisionLogWriter`

공통
--

*   `normalizeIndent(text)`
*   `parseIndentedLines(text)`
*   `buildNodeDraftTree(parsedLines)`

* * *

14\. MVP / 확장단계 구분
==================

MVP
---

*   Ctrl+Space 실행
*   textarea 입력
*   공백 기반 계층 파싱
*   미리보기
*   일괄 생성
*   undo/redo

확장
--

*   번호 목록 자동 인식
*   탭/공백 혼합 자동 교정
*   outline 붙여넣기 최적화
*   AI 결과를 이 입력창에 자동 삽입
*   선택 노드 여러 개에 일괄 삽입

* * *

15\. 최종 권장 명세
=============

한 줄로 정리하면, 다중 가지 추가 기능은:

**선택 노드를 기준으로, 줄 단위 텍스트와 앞 공백 들여쓰기를 해석하여 subtree를 한 번에 생성하는 outline-import형 편집 기능**으로 설계하는 것이 가장 맞습니다. 첨부파일의 사용법과 결과 이미지도 정확히 이 방향을 보여줍니다.

◆ ‘다중 가지’ 추가

원하시면 다음 단계로 바로 이어서  
**1) DB 테이블 반영 명세**, **2) 프론트엔드 모달 와이어프레임**, **3) TypeScript 파서 코드 초안**까지 이어서 작성해드릴게요.

## Prompt:
#형제노드생성 및 자식 노트 생성시에 기준이 되는 노드의 도형 및 도형내 색상(이 기능도 추가해야함) 을 따른다 (상속한다)

## Response:
좋습니다. 이건 꼭 들어가야 하는 규칙입니다.

말씀하신 내용을 반영하면, **형제노드 생성 / 자식노드 생성 / 다중가지 추가** 시 새로 만들어지는 노드는  
**기준 노드의 도형(shape)과 도형 내부 색상(fill color)을 기본 상속**하도록 설계하면 됩니다.

즉, 이제 Node Editing 규칙에 아래 항목을 추가하면 됩니다.

* * *

1\. 추가 기능 정의
============

기능명
---

*   **노드 스타일 상속 생성**
*   영문: **Inherited Node Style on Create**
*   내부 키: `inheritNodeStyleOnCreate`

목적
--

새 노드를 만들 때 사용자가 매번 도형과 색상을 다시 지정하지 않아도 되도록,

*   **형제노드 생성**
*   **자식노드 생성**
*   **다중 자식노드 생성**
*   **다중 가지 추가**

시점에 **기준 노드의 스타일을 자동 상속**하게 한다.

* * *

2\. 상속 대상 속성
============

우선 MVP에서는 아래 2개를 반드시 상속:

1.  **도형 타입**
    *   예: rectangle, rounded-rectangle, ellipse, diamond, capsule 등
2.  **도형 내부 색상**
    *   fill color
    *   예: `#FFE699`, `#D9EAD3`

즉 새 노드는 기본적으로:

*   `shape = 기준노드.shape`
*   `fillColor = 기준노드.fillColor`

로 생성됩니다.

* * *

3\. 적용 대상 기능
============

3.1 형제노드 생성
-----------

예:

*   현재 선택 노드가 파란색 둥근 사각형이면
*   새 형제노드도 **같은 둥근 사각형 + 같은 파란색 배경색**

적용 기능:

*   `Create Sibling Node-after`
*   `Create Sibling Node-before`

* * *

3.2 자식노드 생성
-----------

예:

*   기준 노드가 연두색 ellipse면
*   새 자식노드도 기본적으로 **같은 ellipse + 같은 연두색**

적용 기능:

*   `Create Child Node`
*   `Create Child Node (multi)`

* * *

3.3 다중 가지 추가
------------

아주 중요합니다.

다중 가지 추가 시 생성되는 모든 첫 노드와 하위 노드도  
기본적으로 **기준 노드의 shape/fillColor를 상속**하는 방식으로 설계할 수 있습니다.

다만 여기서 정책을 2가지 중 하나로 정해야 합니다.

### 권장 기본 정책

**생성되는 모든 노드가 기준 노드 스타일을 공통 상속**

즉 선택 노드가:

*   rounded rectangle
*   fillColor = yellow

이면 bulk insert로 생성된 전체 subtree도 전부 동일 스타일로 생성

이 방식이 가장 단순하고 예측 가능합니다.

* * *

4\. 상속 기준 노드 정의
===============

4.1 형제노드 생성 시 기준
----------------

형제노드 생성에서는 **현재 선택한 노드 자신**이 기준입니다.

예:

*   선택 노드 A
*   형제노드 B 생성

그러면 B는 A의 스타일 상속

* * *

4.2 자식노드 생성 시 기준
----------------

자식노드 생성에서는 **부모가 되는 현재 선택 노드**가 기준입니다.

예:

*   선택 노드 A
*   A의 자식 C 생성

그러면 C는 A의 스타일 상속

* * *

4.3 다중 가지 추가 시 기준
-----------------

Bulk Insert에서는 **삽입 대상 target node**가 기준입니다.

예:

*   선택 노드 A에서 Ctrl+Space
*   여러 줄 입력

생성되는 모든 노드는 기본적으로 A의 스타일 상속

* * *

5\. UX 규칙
=========

기본 규칙
-----

새 노드를 생성하면:

*   도형은 자동 상속
*   도형 배경색은 자동 상속
*   텍스트는 빈값 또는 입력값으로 생성

즉 사용자 입장에서:  
“같은 종류의 가지를 계속 만들 때 모양이 자동으로 맞춰진다”

이게 핵심입니다.

* * *

6\. 예외 정책
=========

이 기능은 “기본값 상속”이지 “강제 고정”은 아닙니다.

즉:

*   생성 직후 사용자가 새 노드의 도형/색상 변경 가능
*   부모가 바뀌었다고 기존 자식 스타일이 자동 변경되지는 않음

정리하면:

*   **생성 시점에만 상속**
*   이후에는 각 노드 독립 스타일

이 방식이 가장 안전합니다.

* * *

7\. 데이터 모델 반영
=============

노드 생성 시 기본 스타일 값을 이렇게 채웁니다.

예시:

```
type NodeStyle = {
  shape: NodeShape;
  fillColor: string;
};
```

노드 생성 로직:

```
const newNode.style.shape = baseNode.style.shape;
const newNode.style.fillColor = baseNode.style.fillColor;
```

* * *

8\. 생성 규칙 명세 문장
===============

기능명세서에 아래처럼 넣으면 됩니다.

규칙
--

**형제노드 생성, 자식노드 생성, 다중 자식노드 생성 및 다중 가지 추가 시, 새로 생성되는 노드는 기준 노드의 도형(shape)과 도형 내부 색상(fill color)을 기본 상속한다.**

기준 노드 정의
--------

*   형제노드 생성: 현재 선택 노드
*   자식노드 생성: 부모가 되는 현재 선택 노드
*   다중 가지 추가: 삽입 기준(target) 노드

비고
--

*   상속은 생성 시점에만 적용된다.
*   생성 후 사용자는 새 노드의 스타일을 개별 수정할 수 있다.

* * *

9\. Node Editing 기능표에 추가할 내용
============================

기존 기능표에 신규 항목으로 넣으려면 이런 식이 좋습니다.

| ID | 기능명 | 설명 | 단축키 |
| --- | --- | --- | --- |
| NODE-04A | Inherit Node Shape & Fill on Create | 형제/자식/다중 생성 시 기준 노드의 도형 및 내부 색상을 상속 | 자동 적용 |

또는 각 생성 기능 설명에 포함해도 됩니다.

예:

*   `NODE-01 Create Sibling Node-after`  
    → 생성된 형제 노드는 기준 노드의 도형 및 내부 색상을 상속
*   `NODE-03 Create Child Node`  
    → 생성된 자식 노드는 부모 노드의 도형 및 내부 색상을 상속
*   `NODE-04 Create Child Node (multi)`  
    → 생성된 다중 자식 노드는 부모 노드의 도형 및 내부 색상을 상속

* * *

10\. 확장 설계 포인트
==============

나중에는 상속 범위를 옵션화할 수 있습니다.

예:

*   shape만 상속
*   fillColor만 상속
*   borderColor까지 상속
*   fontStyle까지 상속
*   tag/marker까지 상속

하지만 지금 단계에서는 너무 넓히지 말고, 말씀하신 대로 먼저:

*   **도형**
*   **도형 내부 색상**

이 2개만 정확히 넣는 게 좋습니다.

* * *

11\. 제가 권장하는 최종 정책
==================

가장 실무적으로는 아래가 깔끔합니다.

### 기본 생성 상속

*   형제노드 생성 → 선택 노드 스타일 상속
*   자식노드 생성 → 부모 노드 스타일 상속
*   다중 자식노드 생성 → 부모 노드 스타일 상속
*   다중 가지 추가 → 기준 노드 스타일 상속

### 상속 속성

*   shape
*   fillColor

### 상속 시점

*   생성 시점 1회

### 생성 후

*   각 노드는 독립 편집 가능

* * *

원하시면 제가 다음 답변에서 바로 이어서  
**Node Editing 전체 기능표를 이 상속 규칙까지 반영해서 최종표 형태로 다시 정리**해드리겠습니다.

## Prompt:
#Node내 텍스트의 폰트크기는 당연히 조절해야 하는데 폰트까지 변경이 가능하도록 할수 있을까?
 아니면 맵 전체 단위로만 폰트 변경이 가능하도록 한다던지..
#폰트 크기는 전체 맵에서 각 레벨렬로 정의해주는 것으로 하는것이 어떄
 (기본 ; main topic-18 pt, 1레벌-16pt, 2레벨-15폰트, 3레벨-14폰트, 4레벨-13폰트, 5레벨이하 -12폰트로 하고  사용자가  변경할수 있게끔)

## Response:
좋은 방향입니다. 제 생각엔 이건 **“개별 노드 자유 편집”보다 “맵 단위 타이포그래피 체계”를 먼저 잡고, 예외적으로 개별 override 허용”** 방식이 가장 맞습니다.

왜냐하면 mindmap은 문서가 아니라 **구조를 한눈에 보는 화면**이라서, 노드마다 폰트가 제각각 바뀌면 금방 지저분해집니다.  
그래서 귀하가 말씀하신:

*   **폰트 크기는 레벨별 기본값**
*   **사용자가 변경 가능**
*   **폰트 패밀리는 맵 전체 단위 또는 테마 단위 관리**

이 조합이 가장 실무적입니다.

* * *

1\. 결론부터 제안
===========

권장 정책
-----

### 1) 폰트 크기

*   **맵 전체 기준으로 레벨별 기본값 정의**
*   사용자가 맵 설정에서 변경 가능
*   필요 시 특정 노드만 예외 override 가능

### 2) 폰트 패밀리

*   기본은 **맵 전체 공통 폰트**
*   필요하면 특정 노드/선택 노드에만 예외 적용 가능
*   하지만 MVP에서는 **맵 전체 폰트만 변경 가능**으로 시작하는 것이 좋음

즉 1차 설계는 이렇게 추천합니다:

*   **폰트 종류(font family)**: 맵 전체 설정
*   **폰트 크기(font size)**: 레벨별 설정
*   **굵기/기울임/색상**: 노드별 허용 가능
*   **예외 오버라이드**: 2단계 확장

* * *

2\. 왜 이렇게 가는 게 좋은가
==================

폰트까지 노드별 자유 변경 가능하게 하면 생기는 문제
-----------------------------

가능은 합니다. 기술적으로 어렵지 않습니다.  
하지만 실제 서비스에서는 아래 문제가 생깁니다.

### 문제 1: 맵이 금방 산만해짐

한 노드는 맑은고딕, 한 노드는 나눔고딕, 한 노드는 Pretendard면  
마인드맵이 아니라 전단지처럼 보일 수 있습니다.

### 문제 2: 레이아웃이 흔들림

폰트가 달라지면:

*   텍스트 width
*   line height
*   노드 크기
*   브랜치 길이
*   자동 정렬 결과

가 다 바뀝니다.

즉 폰트 변경은 단순 글꼴 변경이 아니라 **레이아웃 엔진에도 영향**을 줍니다.

### 문제 3: export 품질 이슈

Markdown / HTML export 시  
사용자 PC에 폰트가 없으면 깨질 수 있습니다.

특히 웹기반 서비스에서는

*   시스템 폰트
*   웹폰트
*   export 시 fallback font  
    이 같이 고려되어야 합니다.

* * *

3\. 가장 좋은 구조: 3단계 계층
====================

타이포그래피는 아래처럼 계층형으로 설계하면 깔끔합니다.

3.1 Map Typography Default
--------------------------

맵 전체 기본 설정

예:

*   기본 폰트: Pretendard
*   Main Topic: 18pt
*   Level1: 16pt
*   Level2: 15pt
*   Level3: 14pt
*   Level4: 13pt
*   Level5+: 12pt

3.2 Level Typography Rule
-------------------------

레벨별 기본 규칙

예:

*   root: 18pt bold
*   level1: 16pt semibold
*   level2: 15pt medium
*   level3: 14pt regular
*   level4: 13pt regular
*   level5+: 12pt regular

3.3 Node Override
-----------------

특정 노드만 예외 적용

예:

*   이 노드만 20pt
*   이 노드만 빨간색
*   이 노드만 다른 폰트

* * *

4\. 귀하가 제안한 레벨별 폰트 크기 정책
========================

이 방향 아주 좋습니다.  
기본값도 꽤 적절합니다.

추천 기본안
------

*   **Main Topic**: 18pt
*   **1레벨**: 16pt
*   **2레벨**: 15pt
*   **3레벨**: 14pt
*   **4레벨**: 13pt
*   **5레벨 이하**: 12pt

이건 마인드맵용으로 꽤 자연스럽습니다.

다만 화면 해상도와 zoom을 고려하면, 약간 더 정리해서 아래처럼도 추천할 수 있습니다.

### 권장안 A

*   Main Topic: 18pt
*   Level 1: 16pt
*   Level 2: 15pt
*   Level 3: 14pt
*   Level 4: 13pt
*   Level 5+: 12pt

### 권장안 B

*   Main Topic: 20pt
*   Level 1: 17pt
*   Level 2: 15pt
*   Level 3: 14pt
*   Level 4: 13pt
*   Level 5+: 12pt

제가 보기엔 지금 easymindmap은 **A안**이 더 무난합니다.

* * *

5\. 폰트 패밀리는 어떻게 할까
==================

MVP 추천
------

### 맵 전체 폰트만 변경 가능

예:

*   Pretendard
*   Noto Sans KR
*   맑은 고딕
*   Arial
*   Inter

이렇게 맵 전체 공통으로 적용

이 방식의 장점:

*   UI 단순
*   레이아웃 안정
*   export 예측 가능
*   협업 시 깨짐 적음

확장 버전
-----

나중에는 아래 허용 가능:

*   선택 노드만 폰트 변경
*   선택 subtree만 폰트 변경
*   특정 레벨 전체 폰트 변경

하지만 1차에는 너무 복잡해집니다.

* * *

6\. 실무적으로 추천하는 최종 정책
====================

6.1 MVP
-------

*   **폰트 패밀리**: 맵 전체 단위
*   **폰트 크기**: 레벨별 기본값
*   **폰트 굵기**: 레벨별 기본값
*   **텍스트 색상**: 노드별 가능
*   **굵게/기울임/밑줄**: 노드별 가능

6.2 Phase 2
-----------

*   특정 노드 폰트 크기 override
*   특정 노드 폰트 패밀리 override
*   subtree 단위 스타일 적용

* * *

7\. 사용자 UX 관점에서 제일 자연스러운 설정 화면
==============================

7.1 맵 설정 > Typography
---------------------

### 공통 폰트

*   Font Family: Pretendard
*   Font Weight Base: Regular
*   Line Height: 1.2 ~ 1.4
*   Letter Spacing: 기본값

### 레벨별 폰트 크기

*   Main Topic: 18
*   Level 1: 16
*   Level 2: 15
*   Level 3: 14
*   Level 4: 13
*   Level 5+: 12

### 레벨별 스타일

*   Root: Bold
*   Level 1: SemiBold
*   Level 2 이하: Regular

* * *

8\. 노드 생성 시 폰트 상속 규칙
====================

앞에서 말씀하신 도형/배경색 상속과 연결하면 좋습니다.

생성 시 기본 규칙
----------

새 노드 생성 시:

*   `shape`: 기준 노드 상속
*   `fillColor`: 기준 노드 상속
*   `fontFamily`: 기본적으로 맵 설정값 사용
*   `fontSize`: 새 노드의 실제 level 기준으로 자동 결정

즉 여기서 중요한 건:

**폰트 크기는 부모를 그대로 상속하는 게 아니라, 새 노드의 “레벨”에 따라 자동 계산하는 것이 더 맞다**는 점입니다.

예를 들어:

*   부모가 level 1, 16pt
*   자식이 생성되면 level 2가 되므로 15pt 적용

이게 훨씬 자연스럽습니다.

* * *

9\. 형제노드 / 자식노드 폰트 규칙
=====================

형제노드 생성
-------

형제는 같은 레벨이므로:

*   같은 font size 적용

예:

*   현재 노드가 level 2 → 15pt
*   새 형제노드도 15pt

자식노드 생성
-------

자식은 한 단계 아래이므로:

*   level+1 font size 적용

예:

*   현재 노드가 level 2 → 15pt
*   새 자식노드는 level 3 → 14pt

다중 가지 추가
--------

삽입된 각 노드는 생성 후 계산된 level에 따라 적용

예:

*   target이 level 1
*   입력 최상위 줄들은 level 2 → 15pt
*   그 하위 줄들은 level 3 → 14pt
*   그 아래는 level 4 → 13pt

이게 제일 논리적입니다.

* * *

10\. 데이터 구조 설계
==============

이건 이렇게 잡으면 좋습니다.

맵 단위 설정
-------

```
type MapTypographySettings = {
  fontFamily: string;
  fontFallbacks: string[];
  levelFontSizes: {
    root: number;
    level1: number;
    level2: number;
    level3: number;
    level4: number;
    level5Plus: number;
  };
  levelFontWeights: {
    root: number;
    level1: number;
    level2: number;
    level3: number;
    level4: number;
    level5Plus: number;
  };
  lineHeight: number;
};
```

노드 단위 오버라이드
-----------

```
type NodeTextStyleOverride = {
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number;
  italic?: boolean;
  underline?: boolean;
  color?: string;
};
```

* * *

11\. 스타일 계산 규칙
==============

실제 렌더링 때는 아래 순서로 계산합니다.

최종 폰트 계산 우선순위
-------------

1.  노드 override가 있으면 사용
2.  없으면 레벨별 설정 사용
3.  없으면 맵 기본값 사용
4.  없으면 시스템 fallback 사용

예:

```
resolvedFontFamily = node.override.fontFamily ?? map.typography.fontFamily;
resolvedFontSize = node.override.fontSize ?? getLevelFontSize(node.level);
```

* * *

12\. export까지 고려한 폰트 정책
=======================

이 부분 중요합니다.

Markdown export
---------------

Markdown 자체는 폰트 정보를 거의 표현 못합니다.  
그래서 Markdown export는:

*   구조 중심
*   폰트 정보는 별도 metadata 또는 theme json으로 저장

예:

```
theme:
  fontFamily: Pretendard
  levelFontSizes:
    root: 18
    level1: 16
```

HTML export
-----------

HTML export는 폰트 적용 가능

예:

*   웹폰트 링크 포함
*   fallback font 포함
*   level class별 CSS 생성

```
.node.level-root { font-size: 18pt; font-family: 'Pretendard', 'Noto Sans KR', sans-serif; }
.node.level-1 { font-size: 16pt; }
.node.level-2 { font-size: 15pt; }
```

* * *

13\. 제가 추천하는 폰트 관련 최종 기능 정책
===========================

아래처럼 가면 아주 안정적입니다.

기본 정책
-----

*   맵 전체 폰트 패밀리 설정 가능
*   폰트 크기는 레벨별 설정
*   사용자 변경 가능
*   새 노드 생성 시 레벨에 맞는 폰트 크기 자동 적용

1차 범위
-----

*   폰트 패밀리: 맵 단위
*   폰트 크기: 레벨 단위
*   Bold/Italic/Underline: 노드 단위
*   텍스트 색상: 노드 단위

2차 확장
-----

*   노드별 폰트 패밀리 override
*   노드별 폰트 크기 override
*   subtree 스타일 일괄 적용

* * *

14\. 기능명세서에 넣을 문장
=================

Typography 기본 규칙
----------------

**맵의 텍스트 스타일은 맵 단위 Typography 설정을 따른다. 기본 폰트 패밀리는 맵 전체 공통으로 적용하며, 폰트 크기는 노드 레벨별 기본값에 따라 자동 적용된다.**

기본 레벨 폰트 크기
-----------

*   Main Topic: 18pt
*   Level 1: 16pt
*   Level 2: 15pt
*   Level 3: 14pt
*   Level 4: 13pt
*   Level 5 이하: 12pt

사용자 설정
------

**사용자는 Map Settings > Typography에서 레벨별 폰트 크기를 변경할 수 있다.**

생성 시 적용 규칙
----------

*   형제노드 생성 시: 동일 레벨 폰트 크기 적용
*   자식노드 생성 시: 하위 레벨 폰트 크기 적용
*   다중 가지 추가 시: 생성된 각 노드의 실제 레벨에 맞는 폰트 크기 적용

* * *

15\. 제 의견 한 줄 요약
================

*   **폰트 종류는 우선 맵 전체 단위로 관리**
*   **폰트 크기는 레벨별 규칙으로 관리**
*   **나중에 예외 노드만 override 허용**

이게 제일 예쁘고, 안정적이고, 구현도 깔끔합니다.

원하시면 다음 답변에서 바로  
**Node Style / Typography 전체 설계서 형태로**

*   도형
*   내부색상
*   폰트
*   레벨별 크기
*   생성시 상속 규칙  
    까지 합쳐서 **표 형태 + 명세 형태**로 정리해드리겠습니다.

## Prompt:
응,,

## Response:
좋습니다. 지금까지 이야기한 내용을 모두 반영해서 **easymindmap의 Node Style / Typography 전체 설계**를 **실제 개발 명세 수준**으로 정리해 드리겠습니다.  
(이 내용은 그대로 **기능명세서 / PRD / 개발문서**에 넣어도 됩니다.)

* * *

1\. Node Style 시스템 전체 구조
========================

Node Style은 아래 **4개의 계층**으로 설계하는 것이 가장 안정적입니다.

```
Map Theme (맵 전체 스타일)
        │
        ├─ Typography (폰트 규칙)
        │
        ├─ Level Style (레벨별 기본 스타일)
        │
        └─ Node Override (개별 노드 예외 스타일)
```

즉 스타일 우선순위는 다음과 같습니다.

```
Node Override
    ↓
Level Style
    ↓
Map Theme
    ↓
System Default
```

* * *

2\. Node Style 구성 요소
====================

노드 스타일은 아래 요소로 구성됩니다.

| 그룹 | 속성 | 설명 |
| --- | --- | --- |
| Shape | shape | 노드 도형 |
| Shape | fillColor | 도형 내부 색 |
| Shape | borderColor | 테두리 색 |
| Shape | borderWidth | 테두리 두께 |
| Text | fontFamily | 폰트 |
| Text | fontSize | 글자 크기 |
| Text | fontWeight | 굵기 |
| Text | italic | 기울임 |
| Text | underline | 밑줄 |
| Text | textColor | 텍스트 색 |

* * *

3\. Node Shape 종류 정의
====================

초기 버전에서는 아래 정도가 적당합니다.

| Shape | 설명 |
| --- | --- |
| rectangle | 사각형 |
| rounded-rectangle | 둥근 사각형 |
| ellipse | 타원 |
| capsule | 캡슐 |
| diamond | 다이아몬드 |
| cloud | 구름 |
| hexagon | 육각형 |

대부분의 mindmap 프로그램이 이 정도입니다.

* * *

4\. Node 생성 시 스타일 상속 규칙
=======================

노드 생성 시 아래 규칙을 적용합니다.

4.1 형제노드 생성
-----------

기준 노드:

```
현재 선택 노드
```

상속 속성:

```
shape
fillColor
borderColor
borderWidth
```

예:

```
노드A (파란 둥근 사각형)
    ↓
형제노드 생성
    ↓
노드B (파란 둥근 사각형)
```

* * *

4.2 자식노드 생성
-----------

기준 노드:

```
부모 노드
```

상속 속성:

```
shape
fillColor
borderColor
borderWidth
```

* * *

4.3 다중 가지 추가
------------

기준 노드:

```
Bulk Insert target node
```

생성된 모든 노드:

```
shape 상속
fillColor 상속
borderColor 상속
```

* * *

5\. Typography 시스템 설계
=====================

Typography는 **맵 전체 규칙 기반**으로 관리합니다.

5.1 기본 폰트
---------

맵 전체 기본 폰트

예:

```
Pretendard
```

Fallback:

```
Pretendard
Noto Sans KR
Malgun Gothic
Arial
sans-serif
```

* * *

6\. 레벨별 폰트 크기 규칙
================

사용자가 제안한 방식이 아주 좋습니다.

기본값:

| Level | Font Size |
| --- | --- |
| Main Topic | 18 pt |
| Level 1 | 16 pt |
| Level 2 | 15 pt |
| Level 3 | 14 pt |
| Level 4 | 13 pt |
| Level 5+ | 12 pt |

* * *

6.1 Level 정의
------------

```
Level 0 = Main Topic
Level 1 = 1차 가지
Level 2 = 2차 가지
Level 3 = 3차 가지
Level 4 = 4차 가지
Level 5+ = 그 이하
```

* * *

7\. 폰트 스타일 기본값
==============

레벨별 폰트 스타일

| Level | Weight |
| --- | --- |
| Root | Bold |
| Level1 | SemiBold |
| Level2 | Medium |
| Level3 | Regular |
| Level4 | Regular |
| Level5+ | Regular |

* * *

8\. 노드 생성 시 폰트 적용 규칙
====================

중요한 규칙입니다.

폰트 크기는 **상속이 아니라 레벨 기반 계산**입니다.

### 형제 노드

```
같은 레벨
→ 같은 폰트 크기
```

예

```
Level2 → 15pt
형제 생성 → 15pt
```

* * *

### 자식 노드

```
Level +1
```

예

```
부모 Level2 → 15pt
자식 Level3 → 14pt
```

* * *

### 다중 가지 추가

각 노드는 **실제 레벨 계산 후 적용**

예:

```
target node level = 1

내용 → level2 → 15pt
 상세 → level3 → 14pt
  상세 → level4 → 13pt
```

* * *

9\. Node Typography Override
============================

특정 노드는 예외 스타일 가능

예:

```
폰트 크기
폰트 색상
bold
italic
underline
```

하지만 MVP에서는 아래 정도만 허용 추천

가능:

```
bold
italic
underline
textColor
```

나중 확장:

```
fontFamily override
fontSize override
```

* * *

10\. Map Typography Settings UI
===============================

위치는

```
Map Settings
    └ Typography
```

구성

### Font

```
Font Family
Line Height
Letter Spacing
```

* * *

### Level Font Size

```
Main Topic : 18
Level1 : 16
Level2 : 15
Level3 : 14
Level4 : 13
Level5+ : 12
```

사용자가 수정 가능

* * *

11\. 스타일 계산 로직
==============

렌더링 시 아래 순서로 계산

```
1 Node override
2 Level style
3 Map typography
4 System default
```

예

```
fontSize =
node.override.fontSize
?? level.fontSize
?? map.typography.defaultSize
```

* * *

12\. 데이터 구조 설계
==============

Map Theme
---------

```
MapTheme
```

```
type MapTheme = {

  fontFamily: string

  levelFontSize: {
    root: number
    level1: number
    level2: number
    level3: number
    level4: number
    level5: number
  }

  levelFontWeight: {
    root: number
    level1: number
    level2: number
    level3: number
    level4: number
    level5: number
  }

}
```

* * *

Node Style
----------

```
type NodeStyle = {

  shape: NodeShape

  fillColor: string

  borderColor: string

  borderWidth: number

}
```

* * *

Node Text Style
---------------

```
type NodeTextStyle = {

  fontFamily?: string

  fontSize?: number

  fontWeight?: number

  italic?: boolean

  underline?: boolean

  textColor?: string

}
```

* * *

13\. Export 고려 사항
=================

Markdown Export
---------------

Markdown은 폰트 표현이 제한적입니다.

그래서 스타일은 metadata로 저장

예

```
---
fontFamily: Pretendard
levelFontSizes:
 root: 18
 level1: 16
---
```

* * *

HTML Export
-----------

HTML export는 CSS 생성

예

```
.node.level-root { font-size:18pt }
.node.level1 { font-size:16pt }
.node.level2 { font-size:15pt }
```

* * *

14\. 이 설계의 장점
=============

이 구조는 아래 장점이 있습니다.

### 1\. 맵이 깔끔함

레벨별 폰트 구조 유지

### 2\. 사용자 커스터마이즈 가능

맵별 스타일 변경 가능

### 3\. 레이아웃 안정

폰트 변경으로 레이아웃 깨짐 최소화

### 4\. Export 안정

HTML / Markdown 대응 가능

* * *

15\. 추천 MVP 범위
==============

초기 버전에서는 여기까지만 구현 추천

### 구현

✔ Shape  
✔ FillColor  
✔ FontFamily (맵 전체)  
✔ Level Font Size  
✔ Bold / Italic / Underline  
✔ Text Color

### 나중

◻ Node Font Override  
◻ Level Theme  
◻ Style Templates  
◻ Theme Library

* * *

16\. 다음으로 설계해야 할 것
==================

이제 **easymindmap 구조에서 가장 중요한 것**이 남았습니다.

다음 단계는 이것입니다.

### 1️⃣ Node Style Panel UI 설계

(우측 스타일 패널)

### 2️⃣ Node Color System 설계

(Mindmap에서 매우 중요)

### 3️⃣ Map Theme 시스템

(전체 스타일 프리셋)

### 4️⃣ Node Style Preset

(빠른 스타일 적용)

* * *

원하시면 다음 단계로 바로  
**"Mindmap Node Style UI 설계 (굉장히 중요)"**를  
실제 제품 수준으로 설계해 드리겠습니다.

이 부분이 잘 설계되면 **easymindmap의 완성도가 확 올라갑니다.**



---
Powered by [ChatGPT Exporter](https://www.chatgptexporter.com)
