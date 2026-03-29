
아래에 **easymindmap용 Tag 기능 명세서**를 실제 개발문서 형태로 정리하겠습니다.

문서 목적은 다음입니다.

*   기획 기준 확정
*   프론트엔드/백엔드 개발 기준 제공
*   AI에게 구현 지시할 때 기준 문서로 사용
*   향후 검색, 필터, 협업, AI 추천까지 확장 가능한 구조 정의

* * *

easymindmap Tag 기능 명세서
======================

**Document Version:** v1.0  
**Project:** easymindmap  
**Domain:** mindmap.ai.kr  
**Last Updated:** 2026-03-15

* * *

1\. 문서 개요
=========

1.1 목적
------

본 문서는 easymindmap의 **Tag 기능**에 대한 요구사항, UX, 데이터 구조, API, 동작 규칙을 정의한다.

Tag 기능은 단순한 라벨 부착 기능이 아니라 아래 목적을 가진다.

*   노드 분류
*   맵 탐색 향상
*   검색 정확도 향상
*   특정 관점의 필터 뷰 제공
*   AI 기반 자동 분류 확장 기반 제공

1.2 범위
------

본 문서는 다음 기능을 포함한다.

*   Node 단위 Tag 추가/수정/삭제
*   Tag 자동완성
*   Tag Explorer
*   Tag 검색 및 필터
*   Tag 색상 관리
*   Tag 데이터 모델
*   Tag API
*   Tag UX
*   향후 확장 고려사항

본 문서는 아래는 포함하지 않는다.

*   실시간 협업 충돌 해결 상세 정책
*   AI Tag 추천 모델 상세 Prompt
*   권한 기반 Tag 편집 제한 정책의 세부 구현

* * *

2\. 기능 목표
=========

2.1 핵심 목표
---------

easymindmap의 Tag 시스템은 다음 목표를 만족해야 한다.

1.  사용자가 node를 여러 관점으로 분류할 수 있어야 한다.
2.  Tag를 기준으로 mindmap을 빠르게 검색/필터링할 수 있어야 한다.
3.  Tag 정보는 시각적으로 명확해야 하지만 node 본문 가독성을 해치지 않아야 한다.
4.  향후 AI 추천, 저장된 뷰, 협업 기능으로 확장 가능해야 한다.

2.2 성공 기준
---------

*   사용자는 3클릭 이내로 node에 tag를 추가할 수 있어야 한다.
*   사용자는 검색창에서 `tag:AI` 형태로 tag 검색이 가능해야 한다.
*   사용자는 Tag Explorer에서 태그별 node 수를 확인할 수 있어야 한다.
*   같은 tag는 앱 전체에서 일관된 색상으로 표시되어야 한다.

* * *

3\. 용어 정의
=========

3.1 Tag
-------

Node를 분류하기 위한 사용자 정의 키워드.

예:

*   AI
*   Research
*   Todo
*   Infra
*   Important

3.2 Tag Explorer
----------------

현재 mindmap 또는 workspace 내 tag 목록과 사용 빈도를 표시하는 UI 패널.

3.3 Tag Filter
--------------

선택한 tag 조건에 따라 node를 강조, 흐림 처리, 숨김 처리하는 기능.

3.4 Tag Search
--------------

검색창에서 tag 조건으로 node를 검색하는 기능.

* * *

4\. 사용자 시나리오
============

4.1 기본 태그 부여
------------

사용자는 node를 선택하고 `AI`, `Research` 태그를 추가한다.

결과:

*   node 하단에 tag badge 표시
*   검색 시 `tag:AI`로 해당 node 조회 가능

4.2 태그 기반 탐색
------------

사용자는 좌측 Tag Explorer에서 `Todo` 태그를 클릭한다.

결과:

*   해당 태그를 가진 node만 highlight
*   나머지 node는 흐림 처리

4.3 태그 정리
---------

사용자는 `ai`, `AI`, `A.I.`처럼 중복된 태그를 하나로 합치고 싶다.

결과:

*   Tag Merge 기능을 통해 `AI`로 통합

4.4 전역 검색
---------

사용자는 자신의 전체 mindmap 중 `tag:Research tag:AI` 조건을 만족하는 node를 찾고 싶다.

결과:

*   map별 결과 목록 표시
*   클릭 시 해당 map으로 이동 가능

* * *

5\. 기능 요구사항
===========

5.1 Node Tagging
================

5.1.1 다중 태그 지원
--------------

*   각 node는 0개 이상의 tag를 가질 수 있다.
*   동일 node에 동일 tag를 중복 부여할 수 없다.

예:

```
{
  "nodeId": "node_001",
  "tags": ["AI", "Research", "Important"]
}
```

5.1.2 Tag 추가
------------

사용자는 다음 방식으로 tag를 추가할 수 있어야 한다.

*   Node 속성 패널
*   인라인 태그 입력 팝업
*   향후 단축키 입력

5.1.3 Tag 삭제
------------

사용자는 node에 연결된 개별 tag를 제거할 수 있어야 한다.

5.1.4 Bulk Tagging
------------------

향후 확장 기능으로 아래를 지원할 수 있어야 한다.

*   선택한 여러 node에 tag 일괄 추가
*   선택 subtree에 tag 일괄 추가
*   필터 결과 전체에 tag 일괄 추가

초기 MVP에서는 선택사항이다.

* * *

5.2 Tag 표시
==========

5.2.1 표시 위치
-----------

태그는 node 제목과 분리된 **badge/chip UI**로 표시한다.

표시 위치 권장:

*   node 하단  
    또는
*   node 우측 상단

5.2.2 표시 규칙
-----------

*   최대 2~3개까지 직접 노출
*   초과 시 `+N` 형태 축약
*   hover 시 전체 tag 목록 표시

예:

```
[ Kubernetes ]
[infra] [cloud] [+2]
```

5.2.3 색상 규칙
-----------

*   같은 tag는 동일한 색상으로 표시
*   tag 색상은 tag 엔터티에 저장
*   사용자 정의 색상 변경 가능
*   다크/라이트 모드에서 충분한 대비 확보

* * *

5.3 Tag 입력 UX
=============

5.3.1 속성 패널 입력
--------------

Node 선택 시 우측 패널에 Tags 섹션을 표시한다.

예:

```
Tags
[AI] [Research] [Todo]
+ Add Tag
```

5.3.2 입력 방식
-----------

*   Enter로 확정
*   쉼표 구분 입력 허용
*   자동완성 지원
*   이미 존재하는 tag 우선 추천

예:

```
사용자 입력: Res...
자동완성 후보: Research
```

5.3.3 중복 처리
-----------

*   이미 동일 node에 존재하는 tag는 다시 추가되지 않는다.
*   대소문자 차이만 있는 tag는 정책에 따라 동일 tag로 처리한다.

권장 정책:

*   표시명은 유지
*   내부 검색 키는 소문자 normalize

예:

*   `AI` 와 `ai` 는 동일 tag로 처리

* * *

5.4 Tag Explorer
================

5.4.1 목적
--------

사용자가 현재 맵 또는 전체 워크스페이스의 tag 현황을 쉽게 탐색할 수 있어야 한다.

5.4.2 표시 항목
-----------

각 tag마다 다음 정보 표시:

*   tag name
*   color
*   usage count
*   선택 상태

예:

```
Tags
AI (24)
Research (18)
Todo (9)
Infra (12)
```

5.4.3 동작
--------

*   단일 클릭: 해당 tag 기준 필터/하이라이트
*   Ctrl/Cmd 클릭: 다중 태그 선택
*   우클릭 또는 메뉴: rename, color change, merge, delete

5.4.4 정렬 기준
-----------

초기 MVP:

*   이름순
*   사용 수 내림차순

향후:

*   최근 사용순
*   사용자 지정 pin 지원

* * *

5.5 Tag Search
==============

5.5.1 검색창 문법
------------

검색창은 아래 문법을 지원한다.

*   `tag:AI`
*   `tag:"Machine Learning"`
*   `-tag:done`
*   `text:kubernetes`
*   `layout:tree`
*   `has:note`

5.5.2 복합 검색
-----------

아래 조합 검색을 지원한다.

예:

```
tag:AI tag:Research -tag:done
```

의미:

*   AI 태그 있음
*   Research 태그 있음
*   done 태그 없음

5.5.3 검색 범위
-----------

*   현재 map 검색
*   전체 map 검색

초기 MVP:

*   현재 map 검색 우선 지원

향후:

*   전체 workspace 검색 추가

5.5.4 검색 결과 UI
--------------

검색 결과는 다음 두 형태를 함께 제공한다.

*   결과 리스트
*   맵 내 highlight

결과 클릭 시:

*   해당 node로 이동
*   node 선택 상태로 변경
*   부모 subtree 자동 펼침 옵션 적용 가능

* * *

5.6 Tag Filter
==============

5.6.1 필터 모드
-----------

필터는 아래 모드를 지원한다.

### Highlight Only

조건 일치 node만 강조

### Dim Others

조건 일치하지 않는 node를 흐리게 표시

### Hide Others

조건 일치하지 않는 node를 숨김

초기 MVP 권장:

*   Highlight Only
*   Dim Others

5.6.2 다중 태그 필터 조건
-----------------

초기:

*   AND 조건

향후:

*   OR 조건
*   NOT 조건
*   고급 필터 빌더

예:

```
AI + Research 태그를 모두 가진 node만 표시
```

* * *

5.7 Tag 관리 기능
=============

5.7.1 Rename
------------

사용자는 tag 이름을 변경할 수 있어야 한다.

예:

*   `ML` → `Machine Learning`

동작:

*   관련 node 전체에 반영

5.7.2 Merge
-----------

사용자는 유사 tag를 하나로 병합할 수 있어야 한다.

예:

*   `ai`, `AI`, `A.I.` → `AI`

5.7.3 Delete
------------

사용자는 특정 tag를 삭제할 수 있어야 한다.

삭제 시 정책:

*   tag 엔터티 삭제
*   관련 node와의 연결 제거
*   node 자체는 유지

5.7.4 Color Change
------------------

사용자는 tag color를 수정할 수 있어야 한다.

* * *

6\. UI/UX 명세
============

6.1 Node 내부 표시 규칙
=================

*   node 본문과 tag는 분리 표시
*   tag는 줄바꿈 가능한 badge로 렌더링 가능
*   node 크기를 과도하게 키우지 않도록 제한 필요

6.2 툴팁
------

축약된 tag가 있을 때 hover 시 전체 목록 표시

예:

```
AI, Research, Infra, Cloud, Backend
```

6.3 빈 상태
--------

tag가 없는 node는 tag 영역을 표시하지 않는다.

6.4 태그 자동완성 UX
--------------

사용자가 입력 중일 때:

*   최근 사용 tag 우선
*   prefix 일치 항목 우선
*   정확 일치 항목은 최상단 배치

6.5 오류 UX
---------

*   tag 이름이 너무 길면 저장 불가
*   금지 문자 포함 시 안내 메시지 표시
*   중복 입력 시 무시 또는 안내

* * *

7\. 데이터 모델 명세
=============

7.1 Tag 엔터티
===========

```
{
  "id": "tag_ai",
  "workspaceId": "ws_001",
  "name": "AI",
  "normalizedName": "ai",
  "color": "#8b5cf6",
  "description": "Artificial Intelligence related topics",
  "createdBy": "user_001",
  "createdAt": "2026-03-15T10:00:00Z",
  "updatedAt": "2026-03-15T10:00:00Z"
}
```

7.2 NodeTag 연결 엔터티
------------------

```
{
  "nodeId": "node_001",
  "tagId": "tag_ai",
  "createdAt": "2026-03-15T10:01:00Z"
}
```

7.3 Node 응답 예시
--------------

```
{
  "id": "node_001",
  "text": "Kubernetes",
  "layoutType": "tree",
  "tags": [
    {
      "id": "tag_ai",
      "name": "AI",
      "color": "#8b5cf6"
    },
    {
      "id": "tag_research",
      "name": "Research",
      "color": "#3b82f6"
    }
  ]
}
```

* * *

8\. DB 스키마 초안
=============

8.1 tags 테이블
------------

```
CREATE TABLE tags (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL,
  name VARCHAR(100) NOT NULL,
  normalized_name VARCHAR(100) NOT NULL,
  color VARCHAR(20) NOT NULL,
  description TEXT NULL,
  created_by UUID NOT NULL,
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL
);
```

8.2 node\_tags 테이블
------------------

```
CREATE TABLE node_tags (
  node_id UUID NOT NULL,
  tag_id UUID NOT NULL,
  created_at TIMESTAMP NOT NULL,
  PRIMARY KEY (node_id, tag_id)
);
```

8.3 인덱스 권장
----------

*   `tags(workspace_id, normalized_name)`
*   `node_tags(tag_id)`
*   `node_tags(node_id)`

* * *

9\. API 명세 초안
=============

9.1 Tag 생성
==========

```
POST /tags
```

Request:

```
{
  "workspaceId": "ws_001",
  "name": "AI",
  "color": "#8b5cf6"
}
```

Response:

```
{
  "id": "tag_ai",
  "name": "AI",
  "normalizedName": "ai",
  "color": "#8b5cf6"
}
```

9.2 Tag 목록 조회
=============

```
GET /workspaces/{workspaceId}/tags
```

Response:

```
[
  {
    "id": "tag_ai",
    "name": "AI",
    "color": "#8b5cf6",
    "usageCount": 24
  }
]
```

9.3 Node에 Tag 추가
================

```
POST /nodes/{nodeId}/tags
```

Request:

```
{
  "tagId": "tag_ai"
}
```

또는 신규 생성 겸용:

```
{
  "name": "AI"
}
```

9.4 Node의 Tag 제거
================

```
DELETE /nodes/{nodeId}/tags/{tagId}
```

9.5 Tag 이름 변경
=============

```
PATCH /tags/{tagId}
```

Request:

```
{
  "name": "Artificial Intelligence"
}
```

9.6 Tag 병합
==========

```
POST /tags/merge
```

Request:

```
{
  "sourceTagIds": ["tag_ai_old", "tag_ai_legacy"],
  "targetTagId": "tag_ai"
}
```

9.7 Tag 삭제
==========

```
DELETE /tags/{tagId}
```

9.8 Tag 기반 검색
=============

```
GET /maps/{mapId}/search?q=tag:AI%20-tag:done
```

* * *

10\. 유효성 규칙
===========

10.1 이름 제한
----------

*   최소 1자
*   최대 50자 권장
*   공백만 입력 불가

10.2 허용 문자
----------

권장 허용:

*   한글
*   영문
*   숫자
*   공백
*   `_`
*   `-`

금지 권장:

*   제어문자
*   HTML/script 관련 위험 문자 직접 삽입

10.3 중복 규칙
----------

같은 workspace 내에서 `normalizedName` 기준 중복 금지

예:

*   `AI`
*   `ai`
*   `Ai`  
    모두 동일 tag로 간주

* * *

11\. 성능 요구사항
============

11.1 렌더링
--------

*   node 1,000개 수준에서도 tag badge 렌더링이 과도한 성능 저하를 유발하지 않아야 한다.

11.2 검색
-------

*   현재 map 기준 tag 검색은 500ms 이내 결과 표시 권장

11.3 Explorer
-------------

*   tag usage count는 실시간 또는 캐시 기반으로 빠르게 표시되어야 한다.

* * *

12\. 보안 및 무결성
=============

12.1 입력 검증
----------

tag 이름은 서버 측에서 반드시 sanitize/validate 해야 한다.

12.2 권한 검증
----------

*   사용자는 자신이 접근 가능한 workspace 내에서만 tag 생성/수정 가능
*   향후 협업 시 tag 편집 권한 분리 가능해야 함

12.3 삭제 정책
----------

tag 삭제 시 node는 보존되어야 하며, tag 연결만 제거되어야 한다.

* * *

13\. 향후 확장 요구사항
===============

13.1 Saved Views
----------------

특정 tag 조건을 저장해 빠르게 재사용할 수 있어야 한다.

예:

*   `AI Research`
*   `Todo Nodes`
*   `Publish Ready`

13.2 AI Tag Suggestion
----------------------

AI가 node text/note를 분석하여 tag 후보를 제안할 수 있어야 한다.

예:

```
{
  "suggestedTags": ["AI", "Architecture", "Infra"]
}
```

13.3 Global Tag Analytics
-------------------------

workspace 단위 tag 사용량, 증가 추이, 인기 태그 통계를 제공할 수 있어야 한다.

13.4 Bulk Operations
--------------------

*   subtree 전체 태깅
*   검색 결과 전체 태깅
*   선택 node 집합 태깅

* * *

14\. MVP 범위 권장안
===============

포함
--

*   node별 다중 tag
*   tag badge 표시
*   tag 생성/삭제
*   자동완성
*   Tag Explorer
*   `tag:AI` 검색
*   highlight/dim filter
*   tag color 기본 지원

제외
--

*   tag 병합
*   saved views
*   AI 추천
*   전역 검색
*   고급 boolean 검색 빌더
*   협업 권한 분리

* * *

15\. 개발 우선순위
============

Phase 1
-------

*   DB 모델
*   Tag API
*   Node tag UI
*   Tag badge 렌더링
*   자동완성
*   Explorer 목록

Phase 2
-------

*   검색 문법 지원
*   filter mode
*   rename/delete/color edit

Phase 3
-------

*   merge
*   bulk tagging
*   saved views
*   AI 추천
*   전역 검색

* * *

16\. 최종 권장 구현 방안
================

easymindmap의 Tag 시스템은 아래 원칙으로 구현하는 것을 권장한다.

*   **저장 구조는 정규화**: `tags` + `node_tags`
*   **UI는 badge/chip 기반**
*   **검색 문법은 `tag:` 기반**
*   **초기에는 flat tag**
*   **향후 saved views와 AI 추천으로 확장**

* * *

원하시면 이어서 **Tag 기능 기반 DB ERD**, **Tag API OpenAPI 초안**, 또는 **Tag UI 와이어프레임 명세서**까지 바로 이어서 작성해드리겠습니다.



---
Powered by [ChatGPT Exporter](https://www.chatgptexporter.com)
