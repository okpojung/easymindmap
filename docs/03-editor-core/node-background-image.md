# 노드 배경 이미지 삽입

**User:** Anonymous (ok@baro.pro)  
**Created:** 3/16/2026 1:00:06  
**Updated:** 3/16/2026 2:00:52  
**Exported:** 3/16/2026 2:01:05  
**Link:** [https://chatgpt.com/g/g-p-69b64962a1b8819187e5863aa1808e92-mindmap-gaebal/c/69b6d720-3168-83a3-a982-82eec97e5fb3](https://chatgpt.com/g/g-p-69b64962a1b8819187e5863aa1808e92-mindmap-gaebal/c/69b6d720-3168-83a3-a982-82eec97e5fb3)  

## Prompt:
![업로드한 이미지](https://chatgpt.com/backend-api/estuary/content?id=file_000000006990720788416862e4e3b736&ts=492665&p=fs&cid=1&sig=35bbd7c2add6e94972354d5ae4ca74f653de9f7102b0f1837b3a3941cdf2b02d&v=0)

이미지 삽입 기능 추가
- 사전에 정의된 이미지를 삽입하거나 사용자 PC의 이미지를 업로드하여 노드내 이미지를 배경으로 삽입 기능 추가
- 삽입된 이미지 배경위해 텍스트는 삽입 가능

## Response:
6s 동안 생각함

좋아요. 이건 **Node 안에 “배경 이미지 삽입 + 그 위에 텍스트 입력”** 기능을 추가하는 방향으로 잡으면 됩니다.  
첨부해주신 예시처럼, **사전 정의 이미지 선택**과 **사용자 PC 업로드 이미지**를 모두 지원하고, 노드 안에서는 이미지가 배경으로 깔리고 텍스트는 그 위에 표시되는 방식으로 정의하는 게 맞습니다. 진행방향 아이콘/레이아웃 문맥도 기존 자료와 자연스럽게 연결됩니다.

easymindmap

맵진행방향

아래처럼 **실제 개발문서에 바로 넣을 수 있는 수준**으로 정리해드릴게요.

* * *

easymindmap 기능 추가 명세서
=====================

IMG-01. 노드 배경 이미지 삽입 기능
-----------------------

**문서 버전**: v1.0  
**대상 프로젝트**: easymindmap  
**기능 그룹**: Node Editing / Node Style / Media  
**관련 기존 문서**: Tag 기능 명세, Node Editing 기능, Layout 기능, 진행방향 아이콘 참조 자료

tag기능

맵진행방향

* * *

1\. 기능 개요
---------

노드 내부에 이미지를 삽입할 수 있도록 한다.

단, 일반 첨부파일처럼 노드 밖의 보조정보로 붙는 것이 아니라,  
**노드 도형 내부에 “배경 이미지(background image)” 형태로 삽입**되며,  
그 위에 **노드 텍스트를 계속 입력/편집 가능**해야 한다.

easymindmap

즉, 이 기능은 아래 2가지를 모두 지원한다.

1.  **사전 정의된 이미지 삽입**
    *   시스템에서 미리 제공하는 이미지/아이콘/일러스트를 선택하여 노드 배경으로 삽입
2.  **사용자 PC 이미지 업로드 삽입**
    *   사용자가 로컬 PC의 이미지 파일을 업로드하여 해당 노드 배경으로 삽입

* * *

2\. 기능 목표
---------

이 기능의 목표는 단순 이미지 첨부가 아니라 다음과 같다.

*   노드를 보다 시각적으로 표현
*   교육용/설명용/업무 흐름용 마인드맵의 가독성 향상
*   특정 노드를 “이미지 카드형 노드”처럼 사용할 수 있도록 확장
*   텍스트 중심 mindmap + 이미지 중심 graphic map을 함께 지원

* * *

3\. 핵심 요구사항
-----------

### 3.1 배경 이미지 삽입

*   노드 내부에 이미지 1개를 배경으로 삽입 가능해야 한다.
*   배경 이미지는 노드 도형 내부 bounds에 맞게 렌더링되어야 한다.
*   노드 텍스트는 이미지 위에 오버레이되어 표시되어야 한다.

### 3.2 이미지 소스

지원 소스는 다음 2가지다.

#### A. 사전 정의 이미지

*   시스템 기본 이미지 라이브러리 제공
*   카테고리별 선택 가능
    *   일반 아이콘
    *   업무/오피스
    *   교육
    *   IT/기술
    *   프로세스/진행방향
    *   사용자 즐겨찾기

#### B. 사용자 업로드 이미지

*   사용자가 로컬 PC에서 이미지 선택
*   업로드 후 노드 배경으로 즉시 적용
*   업로드 이미지는 서버/Object Storage에 저장

### 3.3 텍스트 오버레이

*   배경 이미지가 삽입된 상태에서도 노드 텍스트 입력 가능
*   텍스트 편집, 폰트 크기 변경, 정렬 변경 가능
*   텍스트는 이미지 위에 가독성 있게 표시되어야 함

### 3.4 텍스트 가독성 보조

배경 이미지 위 텍스트가 안 보일 수 있으므로 다음 옵션 필요

*   텍스트 그림자
*   텍스트 외곽선
*   반투명 오버레이(어두운 막/밝은 막)
*   텍스트 영역 배경(반투명 박스)

초기 MVP에서는 최소 아래 2개는 반드시 지원 권장

*   **배경 오버레이 opacity**
*   **텍스트 색상 자동 대비**

### 3.5 배경 이미지 편집 옵션

*   배경 이미지 교체
*   배경 이미지 삭제
*   이미지 맞춤 방식 변경
    *   채우기(fill)
    *   맞춤(contain)
    *   원본 비율 유지
    *   가운데 정렬
*   배경 위치 조정
    *   center
    *   top
    *   bottom
    *   left
    *   right

* * *

4\. UI/UX 요구사항
--------------

### 4.1 진입 방식

노드 선택 시 아래 방식으로 이미지 삽입 가능해야 한다.

#### 방법 1: 툴바

*   상단 또는 컨텍스트 툴바에 **이미지 삽입 아이콘**

#### 방법 2: 우클릭 메뉴

*   `배경 이미지 삽입`
*   `배경 이미지 변경`
*   `배경 이미지 제거`

#### 방법 3: 속성 패널

오른쪽 속성 패널에 Image 섹션 추가

예:

*   이미지 없음
*   이미지 선택
*   업로드
*   배치 방식
*   오버레이 밝기
*   텍스트 정렬

### 4.2 이미지 선택 패널

첨부 예시처럼 이미지 패널을 제공한다.

easymindmap

권장 구성:

*   카테고리 드롭다운
*   삽입 방식 드롭다운
    *   배경으로 배치
    *   아이콘으로 삽입
    *   일반 첨부로 추가
*   사전 정의 이미지 썸네일 목록
*   업로드 버튼
*   삭제 버튼

### 4.3 노드 내 표시 규칙

*   이미지는 노드의 도형 영역 안에서만 표시
*   노드 border, connector, 접기/펼치기 버튼과 충돌하지 않아야 함
*   텍스트는 기본적으로 중앙 정렬
*   사용자가 상/중/하 정렬 가능

### 4.4 선택 상태

배경 이미지가 적용된 노드를 선택하면:

*   일반 노드와 동일하게 selection outline 표시
*   이미지 편집 핸들이 아니라 노드 편집 기준 유지
*   필요 시 “이미지 있음” 속성 아이콘 표시 가능

* * *

5\. 동작 규칙
---------

### 5.1 삽입 규칙

*   한 노드에는 기본적으로 배경 이미지 1개만 허용
*   새 이미지 삽입 시 기존 배경 이미지는 교체
*   일반 첨부파일 이미지와는 별도 개념으로 처리

### 5.2 상속 규칙

기존 사용자 요구와 맞추어, 자식/형제 노드 생성 시 아래 정책을 권장한다.

#### 권장 기본값

*   **배경 이미지 자체는 상속하지 않음**
*   대신 아래 스타일만 상속 가능
    *   도형 종류
    *   배경색
    *   테두리색
    *   텍스트 스타일
    *   이미지 배치 모드 옵션(선택)

이유:  
배경 이미지까지 무조건 상속하면 자식 노드가 전부 같은 사진으로 복제되어 불편할 수 있음.

#### 선택 옵션

*   “이미지 포함 스타일 복제” 기능을 별도 제공 가능

### 5.3 노드 크기와 이미지

*   노드 크기가 작으면 이미지도 축소
*   최소 크기 이하에서는 이미지 가독성이 떨어질 수 있으므로 다음 중 택1
    *   자동 crop
    *   contain 축소
    *   작은 노드에서는 이미지 숨김

권장:

*   기본은 `fill + crop`
*   너무 작은 노드일 때는 텍스트 우선

### 5.4 레이아웃과의 관계

*   map / tree / graphic / 방사형 / 양쪽방사형 / 진행트리 등 어떤 layout에서도 동작해야 함
*   배경 이미지 기능은 **노드 스타일 레벨 기능**으로 취급
*   layout 엔진은 노드의 크기만 알면 되고, 이미지 렌더링은 node renderer가 담당
    맵진행방향

* * *

6\. 표시/렌더링 명세
-------------

### 6.1 렌더링 순서

권장 렌더 순서:

1.  노드 도형 배경
2.  배경 이미지
3.  반투명 overlay
4.  텍스트
5.  node indicator / tag / note / hyperlink / attachment icon
6.  selection / hover outline

### 6.2 텍스트 가독성 규칙

자동 규칙 예시:

*   배경 이미지 평균 밝기 계산
*   밝으면 텍스트 검정 계열
*   어두우면 텍스트 흰색 계열
*   자동 대비가 애매하면 반투명 overlay 기본 20~40%

### 6.3 도형 대응

지원 대상:

*   직사각형
*   둥근 사각형
*   캡슐형
*   원형/타원형
*   카드형
*   사용자 정의 shape

도형에 따라 이미지 clipping 처리 필요

*   `border-radius`
*   `clipPath`
*   `mask`

SVG 기반이면 `clipPath`, HTML/CSS 기반이면 `overflow:hidden + border-radius` 조합 권장

* * *

7\. 데이터 모델 명세
-------------

### 7.1 Node 확장 필드

기존 node 엔터티에 아래 필드 추가 권장

```
{
  "id": "node_001",
  "text": "사용자 이미지 삽입",
  "shapeType": "rounded-rectangle",
  "style": {
    "backgroundColor": "#23485d",
    "textColor": "#ffffff"
  },
  "backgroundImage": {
    "type": "preset",
    "assetId": "preset_img_102",
    "url": "https://cdn.mindmap.ai.kr/assets/preset/102.png",
    "fit": "cover",
    "position": "center",
    "overlayOpacity": 0.28,
    "overlayColor": "#000000"
  }
}
```

### 7.2 업로드 이미지 예시

```
{
  "backgroundImage": {
    "type": "upload",
    "fileId": "file_abc123",
    "url": "https://cdn.mindmap.ai.kr/uploads/maps/map_001/node_001/bg.png",
    "originalName": "sample.png",
    "width": 1280,
    "height": 720,
    "fit": "cover",
    "position": "center",
    "overlayOpacity": 0.2,
    "overlayColor": "#000000"
  }
}
```

### 7.3 DB 권장 구조

#### 방법 A. nodes 테이블 JSONB 저장

간단한 MVP용

*   `background_image_json JSONB NULL`

#### 방법 B. 별도 media\_assets 테이블

확장형 권장

`media_assets`

*   id
*   owner\_id
*   workspace\_id
*   map\_id
*   file\_name
*   mime\_type
*   file\_size
*   width
*   height
*   storage\_url
*   thumbnail\_url
*   source\_type (preset/upload)
*   created\_at

`nodes`

*   background\_media\_id nullable
*   image\_fit
*   image\_position
*   overlay\_opacity
*   overlay\_color

* * *

8\. API 명세 초안
-------------

### 8.1 사전 정의 이미지 목록 조회

```
GET /image-assets?presetCategory=office
```

Response:

```
[
  {
    "id": "preset_img_102",
    "name": "Office Board",
    "category": "office",
    "thumbnailUrl": "...",
    "imageUrl": "..."
  }
]
```

### 8.2 사용자 이미지 업로드

```
POST /uploads/images
Content-Type: multipart/form-data
```

Response:

```
{
  "fileId": "file_abc123",
  "url": "https://cdn.../bg.png",
  "width": 1280,
  "height": 720
}
```

### 8.3 노드 배경 이미지 설정

```
PATCH /nodes/{nodeId}/background-image
```

Request:

```
{
  "type": "upload",
  "fileId": "file_abc123",
  "fit": "cover",
  "position": "center",
  "overlayOpacity": 0.25,
  "overlayColor": "#000000"
}
```

### 8.4 노드 배경 이미지 제거

```
DELETE /nodes/{nodeId}/background-image
```

### 8.5 배경 이미지 옵션 수정

```
PATCH /nodes/{nodeId}/background-image-style
```

Request:

```
{
  "fit": "contain",
  "position": "top",
  "overlayOpacity": 0.4
}
```

* * *

9\. 업로드/파일 정책
-------------

### 9.1 허용 포맷

초기 MVP:

*   PNG
*   JPG/JPEG
*   WEBP
*   SVG는 보안 검토 후 선택 지원

### 9.2 파일 크기 제한

권장:

*   1파일 최대 10MB
*   초기 기본 권장 5MB

### 9.3 리사이징/최적화

업로드 후 서버에서:

*   썸네일 생성
*   웹 렌더링용 최적화본 생성
*   원본 보관 여부는 정책 선택

### 9.4 보안

*   MIME type 검증
*   확장자 검증
*   악성 파일 검사
*   SVG는 스크립트 삽입 위험 때문에 sanitize 필수

* * *

10\. Export 명세
--------------

### 10.1 Markdown Export

배경 이미지는 Markdown 기본 스펙에 직접 표현이 어렵기 때문에 아래 중 하나 선택

#### 권장 방식

frontmatter 또는 node metadata에 포함

예:

```
- 사용자 이미지 삽입
  <!-- bgImage: {"type":"upload","url":"...","fit":"cover"} -->
```

또는 JSON export 병행

### 10.2 HTML Export

Standalone HTML export 시 반드시 유지되어야 함

*   노드 배경 이미지 표시
*   텍스트 오버레이 유지
*   오버레이 opacity 유지
*   노드 shape clipping 유지

즉, 이 기능은 HTML export에서 정상 재현되어야 진짜 완성입니다.

* * *

11\. 성능 요구사항
------------

### 11.1 편집기 성능

*   노드 500개 이상에서도 이미지 노드가 과도한 렌더링 부하를 일으키지 않아야 함
*   viewport 밖 노드는 lazy render 또는 virtualize 고려

### 11.2 이미지 최적화

*   원본 대신 렌더링용 최적화 이미지를 우선 사용
*   확대 수준에 따라 적절한 해상도 사용 가능하면 더 좋음

* * *

12\. 접근성/가독성
------------

*   텍스트와 배경의 대비 비율을 일정 수준 이상 확보 권장
*   이미지 노드라도 텍스트 편집 UX는 일반 노드와 동일해야 함
*   스크린리더용 대체 텍스트는 추후 확장 가능

* * *

13\. MVP 범위 권장안
---------------

### 포함

*   사전 정의 이미지 삽입
*   사용자 PC 이미지 업로드
*   노드 배경 이미지 1개 설정
*   텍스트 오버레이 입력
*   이미지 교체 / 삭제
*   fit: cover / contain
*   overlay opacity
*   HTML export 반영

### 제외

*   배경 이미지 다중 레이어
*   이미지 crop 편집기
*   필터/효과
*   AI 이미지 추천
*   GIF/동영상 배경
*   노드별 슬라이드쇼 배경

* * *

14\. 개발 우선순위
------------

### Phase 1

*   데이터 모델 확장
*   업로드 API
*   preset image 목록 API
*   node renderer 배경 이미지 지원
*   텍스트 오버레이 렌더링
*   이미지 삽입 패널

### Phase 2

*   fit / position / overlay 옵션
*   HTML export 반영
*   undo/redo 지원
*   autosave 반영

### Phase 3

*   이미지 crop
*   최근 사용 이미지
*   즐겨찾기
*   workspace 공용 이미지 라이브러리

* * *

15\. 최종 권장 구현 방향
----------------

핵심은 이렇게 잡는 게 가장 안정적입니다.

*   **이미지는 “노드 첨부파일”이 아니라 “노드 스타일 속성”으로 저장**
*   **텍스트는 항상 노드의 본문 데이터로 유지**
*   **렌더러가 이미지+텍스트를 합성해서 표시**
*   **export HTML에서도 동일하게 재현**
*   **preset / upload 두 경로를 모두 지원**

즉, 개념적으로는:

*   `첨부파일 이미지` = 보조 리소스
*   `배경 이미지` = 노드 자체 표현 스타일

이렇게 분리해야 구조가 안 꼬입니다.

* * *

원하시면 다음 단계로 바로 이어서  
**1) DB 스키마 SQL 초안**, **2) React 컴포넌트 구조 설계**, **3) Node Renderer 실제 구현 방식(SVG/HTML)** 까지 이어서 설계해드릴게요.

## Prompt:
응

## Response:
좋아요. 그럼 바로 이어서 **실개발 수준**으로 정리하겠습니다.

이번에는 아래 3가지를 한 번에 잡겠습니다.

1.  **DB 스키마 SQL 초안**
2.  **React 컴포넌트 구조 설계**
3.  **Node Renderer 구현 방식(SVG/HTML 혼합 권장안)**

* * *

1\. DB 스키마 SQL 초안
=================

배경 이미지는 말씀드린 대로 **첨부파일이 아니라 노드 스타일 속성**으로 두는 게 맞습니다.  
다만 실제 파일은 별도 media 테이블로 관리하는 구조가 가장 깔끔합니다.

* * *

1.1 권장 테이블 구조
-------------

A. mindmap\_nodes
-----------------

기존 노드 테이블 확장

```
CREATE TABLE mindmap_nodes (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    map_id BIGINT UNSIGNED NOT NULL,
    parent_id BIGINT UNSIGNED NULL,
    node_key VARCHAR(64) NOT NULL,
    node_text TEXT NULL,

    shape_type VARCHAR(50) NOT NULL DEFAULT 'rounded-rectangle',
    background_color VARCHAR(20) NOT NULL DEFAULT '#FFFFFF',
    border_color VARCHAR(20) NOT NULL DEFAULT '#CCCCCC',
    border_width INT NOT NULL DEFAULT 1,

    font_family VARCHAR(100) NULL,
    font_size INT NOT NULL DEFAULT 16,
    font_weight VARCHAR(20) NOT NULL DEFAULT 'normal',
    text_color VARCHAR(20) NOT NULL DEFAULT '#000000',
    text_align VARCHAR(20) NOT NULL DEFAULT 'center',
    vertical_align VARCHAR(20) NOT NULL DEFAULT 'middle',

    width INT NOT NULL DEFAULT 180,
    height INT NOT NULL DEFAULT 80,
    x DECIMAL(12,2) NULL,
    y DECIMAL(12,2) NULL,

    branch_layout_type VARCHAR(50) NULL,

    bg_image_mode VARCHAR(20) NOT NULL DEFAULT 'none',   -- none / preset / upload
    bg_media_id BIGINT UNSIGNED NULL,
    bg_image_fit VARCHAR(20) NOT NULL DEFAULT 'cover',   -- cover / contain / stretch / original
    bg_image_position VARCHAR(20) NOT NULL DEFAULT 'center', -- center/top/bottom/left/right
    bg_overlay_color VARCHAR(20) NOT NULL DEFAULT '#000000',
    bg_overlay_opacity DECIMAL(4,2) NOT NULL DEFAULT 0.00,
    bg_text_box_enabled TINYINT(1) NOT NULL DEFAULT 0,
    bg_text_box_color VARCHAR(20) NULL,
    bg_text_box_opacity DECIMAL(4,2) NULL,

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    UNIQUE KEY uk_node_key (node_key),
    KEY idx_map_id (map_id),
    KEY idx_parent_id (parent_id),
    KEY idx_bg_media_id (bg_media_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

* * *

B. media\_assets
----------------

업로드 파일 / 프리셋 이미지 공통 관리

```
CREATE TABLE media_assets (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    asset_key VARCHAR(64) NOT NULL,
    source_type VARCHAR(20) NOT NULL,   -- preset / upload
    category VARCHAR(50) NULL,          -- office / education / process / etc
    original_name VARCHAR(255) NULL,
    stored_name VARCHAR(255) NULL,
    mime_type VARCHAR(100) NULL,
    file_ext VARCHAR(20) NULL,
    file_size BIGINT UNSIGNED NULL,

    width INT NULL,
    height INT NULL,

    storage_disk VARCHAR(50) NOT NULL DEFAULT 'local',
    file_path VARCHAR(500) NOT NULL,
    file_url VARCHAR(1000) NOT NULL,
    thumbnail_url VARCHAR(1000) NULL,

    owner_user_id BIGINT UNSIGNED NULL,
    workspace_id BIGINT UNSIGNED NULL,
    map_id BIGINT UNSIGNED NULL,

    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    UNIQUE KEY uk_asset_key (asset_key),
    KEY idx_source_type (source_type),
    KEY idx_category (category),
    KEY idx_owner_user_id (owner_user_id),
    KEY idx_workspace_id (workspace_id),
    KEY idx_map_id (map_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

* * *

C. preset\_image\_categories
----------------------------

사전 정의 이미지 카테고리

```
CREATE TABLE preset_image_categories (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    category_key VARCHAR(50) NOT NULL,
    category_name VARCHAR(100) NOT NULL,
    sort_order INT NOT NULL DEFAULT 0,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_category_key (category_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

* * *

2\. 백엔드 API 설계
==============

* * *

2.1 프리셋 이미지 목록 조회
-----------------

```
GET /api/image-presets?category=office
```

Response:

```
{
  "success": true,
  "items": [
    {
      "id": 101,
      "assetKey": "preset_office_001",
      "name": "Office Monitor",
      "category": "office",
      "thumbnailUrl": "/assets/preset/thumbs/office_001.png",
      "imageUrl": "/assets/preset/full/office_001.png",
      "width": 512,
      "height": 512
    }
  ]
}
```

* * *

2.2 사용자 이미지 업로드
---------------

```
POST /api/media/upload-image
Content-Type: multipart/form-data
```

폼 필드:

*   file
*   mapId
*   nodeId (optional)

Response:

```
{
  "success": true,
  "item": {
    "id": 901,
    "assetKey": "upload_20260316_0001",
    "fileUrl": "/uploads/maps/12/nodes/301/bg_901.webp",
    "thumbnailUrl": "/uploads/maps/12/nodes/301/bg_901_thumb.webp",
    "width": 1280,
    "height": 720,
    "mimeType": "image/webp"
  }
}
```

* * *

2.3 노드 배경 이미지 설정
----------------

```
PATCH /api/maps/{mapId}/nodes/{nodeId}/background-image
Content-Type: application/json
```

Request:

```
{
  "mode": "upload",
  "mediaId": 901,
  "fit": "cover",
  "position": "center",
  "overlayColor": "#000000",
  "overlayOpacity": 0.25,
  "textBoxEnabled": false
}
```

* * *

2.4 노드 배경 이미지 제거
----------------

```
DELETE /api/maps/{mapId}/nodes/{nodeId}/background-image
```

* * *

2.5 노드 배경 옵션만 수정
----------------

```
PATCH /api/maps/{mapId}/nodes/{nodeId}/background-image-style
```

Request:

```
{
  "fit": "contain",
  "position": "top",
  "overlayOpacity": 0.35,
  "textBoxEnabled": true,
  "textBoxColor": "#FFFFFF",
  "textBoxOpacity": 0.50
}
```

* * *

3\. 프론트엔드 상태 모델
===============

React 쪽에서는 노드 데이터에 아래 필드가 있으면 됩니다.

```
export type BackgroundImageMode = 'none' | 'preset' | 'upload';
export type BackgroundFit = 'cover' | 'contain' | 'stretch' | 'original';
export type BackgroundPosition = 'center' | 'top' | 'bottom' | 'left' | 'right';

export interface NodeBackgroundImage {
  mode: BackgroundImageMode;
  mediaId?: number;
  url?: string;
  thumbnailUrl?: string;
  fit: BackgroundFit;
  position: BackgroundPosition;
  overlayColor: string;
  overlayOpacity: number;
  textBoxEnabled: boolean;
  textBoxColor?: string;
  textBoxOpacity?: number;
}

export interface MindMapNode {
  id: string;
  mapId: string;
  parentId?: string | null;
  text: string;

  shapeType: string;
  width: number;
  height: number;
  x: number;
  y: number;

  backgroundColor: string;
  borderColor: string;
  borderWidth: number;

  fontFamily?: string;
  fontSize: number;
  fontWeight?: string;
  textColor: string;
  textAlign: 'left' | 'center' | 'right';
  verticalAlign: 'top' | 'middle' | 'bottom';

  backgroundImage: NodeBackgroundImage;
}
```

* * *

4\. React 컴포넌트 구조 설계
====================

핵심은 **편집 UI**와 **렌더링 UI**를 분리하는 겁니다.

* * *

4.1 권장 디렉터리 구조
--------------

```
src/
 ┣ editor/
 ┃ ┣ canvas/
 ┃ ┃ ┣ MindMapCanvas.tsx
 ┃ ┃ ┣ NodeLayer.tsx
 ┃ ┃ ┣ ConnectorLayer.tsx
 ┃ ┃ ┗ SelectionLayer.tsx
 ┃ ┣ nodes/
 ┃ ┃ ┣ MindMapNodeView.tsx
 ┃ ┃ ┣ NodeShape.tsx
 ┃ ┃ ┣ NodeBackgroundImage.tsx
 ┃ ┃ ┣ NodeTextOverlay.tsx
 ┃ ┃ ┣ NodeIndicators.tsx
 ┃ ┃ ┗ NodeResizeHandles.tsx
 ┃ ┣ panels/
 ┃ ┃ ┣ NodeStylePanel.tsx
 ┃ ┃ ┣ NodeImagePanel.tsx
 ┃ ┃ ┣ PresetImagePicker.tsx
 ┃ ┃ ┗ UploadImageButton.tsx
 ┃ ┣ dialogs/
 ┃ ┃ ┣ ImagePickerDialog.tsx
 ┃ ┃ ┗ ImageCropDialog.tsx
 ┃ ┣ hooks/
 ┃ ┃ ┣ useNodeActions.ts
 ┃ ┃ ┣ useImageUpload.ts
 ┃ ┃ ┗ useAutoSave.ts
 ┃ ┣ store/
 ┃ ┃ ┣ editorStore.ts
 ┃ ┃ ┣ nodeSelectors.ts
 ┃ ┃ ┗ undoRedoStore.ts
 ┃ ┗ api/
 ┃   ┣ nodeApi.ts
 ┃   ┗ mediaApi.ts
 ┗ shared/
   ┗ types/
     ┗ mindmap.ts
```

* * *

4.2 핵심 컴포넌트 역할
--------------

### MindMapNodeView

노드 하나 전체 렌더링 담당

포함 요소:

*   NodeShape
*   NodeBackgroundImage
*   Overlay
*   Text
*   Indicator
*   Selection state

* * *

### NodeBackgroundImage

노드 내부 배경 이미지 전용 렌더러

책임:

*   이미지 URL 표시
*   fit/position 반영
*   shape clipping
*   overlay 표시

* * *

### NodeTextOverlay

텍스트 렌더링 및 편집 담당

책임:

*   텍스트 정렬
*   더블클릭 편집
*   배경 이미지 위 가독성 유지
*   multi-line 처리

* * *

### NodeImagePanel

오른쪽 속성 패널에서 이미지 설정

기능:

*   프리셋 선택
*   업로드
*   fit 선택
*   position 선택
*   overlay 조정
*   삭제

* * *

5\. 상태관리 권장안
============

노드 수정이 많기 때문에 Zustand 또는 Redux Toolkit 둘 다 가능하지만,  
이 프로젝트는 편집기 성격상 **Zustand + Immer**가 더 가볍고 빠릅니다.

예시:

```
interface EditorState {
  selectedNodeId?: string;
  nodes: Record<string, MindMapNode>;

  setSelectedNode: (nodeId?: string) => void;
  updateNode: (nodeId: string, patch: Partial<MindMapNode>) => void;
  updateNodeBackgroundImage: (
    nodeId: string,
    patch: Partial<NodeBackgroundImage>
  ) => void;
}
```

* * *

6\. Node Renderer 구현 방식
=======================

여기 진짜 중요합니다.

결론부터 말하면:

**권장: HTML 노드 + SVG 커넥터 혼합 구조**
-------------------------------

즉,

*   **선/커넥터/화살표** = SVG
*   **노드 본체** = HTML div
*   **배경 이미지/텍스트/아이콘** = HTML/CSS

이 방식이 제일 낫습니다.

* * *

6.1 왜 HTML 노드가 유리한가
-------------------

배경 이미지 + 텍스트 오버레이 + border-radius + 클릭/편집 UX는  
SVG보다 HTML/CSS가 훨씬 쉽고 안정적입니다.

특히 필요한 기능이:

*   배경 이미지 cover/contain
*   clip
*   border radius
*   overlay
*   contenteditable 또는 textarea 편집
*   drag handle
*   hover effect

이런 것들이라 HTML이 편합니다.

* * *

6.2 노드 렌더 예시
------------

```
type Props = {
  node: MindMapNode;
  selected: boolean;
  onClick: () => void;
  onDoubleClick: () => void;
};

export function MindMapNodeView({ node, selected, onClick, onDoubleClick }: Props) {
  return (
    <div
      className={`mm-node ${selected ? 'selected' : ''}`}
      style={{
        position: 'absolute',
        left: node.x,
        top: node.y,
        width: node.width,
        height: node.height,
        border: `${node.borderWidth}px solid ${node.borderColor}`,
        background: node.backgroundColor,
        borderRadius: getNodeBorderRadius(node.shapeType),
        overflow: 'hidden',
        boxSizing: 'border-box'
      }}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
    >
      <NodeBackgroundImage node={node} />
      <NodeTextOverlay node={node} />
      <NodeIndicators node={node} />
    </div>
  );
}
```

* * *

6.3 배경 이미지 렌더 컴포넌트
------------------

```
export function NodeBackgroundImage({ node }: { node: MindMapNode }) {
  const bg = node.backgroundImage;

  if (!bg || bg.mode === 'none' || !bg.url) return null;

  const objectFit =
    bg.fit === 'cover'
      ? 'cover'
      : bg.fit === 'contain'
      ? 'contain'
      : bg.fit === 'stretch'
      ? 'fill'
      : 'none';

  const objectPosition =
    bg.position === 'center'
      ? 'center center'
      : bg.position === 'top'
      ? 'center top'
      : bg.position === 'bottom'
      ? 'center bottom'
      : bg.position === 'left'
      ? 'left center'
      : 'right center';

  return (
    <>
      <img
        src={bg.url}
        alt=""
        draggable={false}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit,
          objectPosition,
          pointerEvents: 'none',
          userSelect: 'none'
        }}
      />
      {bg.overlayOpacity > 0 && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundColor: bg.overlayColor,
            opacity: bg.overlayOpacity,
            pointerEvents: 'none'
          }}
        />
      )}
    </>
  );
}
```

* * *

6.4 텍스트 오버레이 컴포넌트
-----------------

```
export function NodeTextOverlay({ node }: { node: MindMapNode }) {
  const bg = node.backgroundImage;

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        justifyContent:
          node.textAlign === 'left'
            ? 'flex-start'
            : node.textAlign === 'right'
            ? 'flex-end'
            : 'center',
        alignItems:
          node.verticalAlign === 'top'
            ? 'flex-start'
            : node.verticalAlign === 'bottom'
            ? 'flex-end'
            : 'center',
        padding: 12,
        textAlign: node.textAlign as any,
        pointerEvents: 'none'
      }}
    >
      <div
        style={{
          color: node.textColor,
          fontSize: node.fontSize,
          fontFamily: node.fontFamily || 'Pretendard, sans-serif',
          fontWeight: node.fontWeight as any,
          lineHeight: 1.3,
          textShadow: bg?.mode !== 'none' ? '0 1px 3px rgba(0,0,0,0.45)' : 'none',
          background: bg?.textBoxEnabled
            ? hexToRgba(bg.textBoxColor || '#000000', bg.textBoxOpacity ?? 0.25)
            : 'transparent',
          borderRadius: bg?.textBoxEnabled ? 8 : 0,
          padding: bg?.textBoxEnabled ? '6px 10px' : 0,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          maxWidth: '100%'
        }}
      >
        {node.text}
      </div>
    </div>
  );
}
```

* * *

7\. 편집 플로우
==========

* * *

7.1 프리셋 이미지 삽입 플로우
------------------

1.  사용자 노드 선택
2.  우측 패널 `이미지` 탭 클릭
3.  `사전 정의 이미지` 선택
4.  카테고리 선택
5.  썸네일 클릭
6.  즉시 노드 배경 적용
7.  autosave 반영
8.  undo stack 저장

* * *

7.2 사용자 이미지 업로드 플로우
-------------------

1.  사용자 노드 선택
2.  `업로드` 버튼 클릭
3.  로컬 파일 선택
4.  업로드 API 호출
5.  서버가 최적화본 생성
6.  응답으로 mediaId/url 수신
7.  노드 backgroundImage 업데이트
8.  autosave 반영

* * *

8\. Undo/Redo 처리
================

이미지 삽입도 일반 노드 편집과 똑같이 undo/redo 되어야 합니다.

이벤트 단위 예시:

*   `NODE_BG_IMAGE_SET`
*   `NODE_BG_IMAGE_REMOVE`
*   `NODE_BG_IMAGE_STYLE_CHANGE`

예시 payload:

```
{
  type: 'NODE_BG_IMAGE_SET',
  nodeId: 'node_101',
  before: { mode: 'none' },
  after: {
    mode: 'upload',
    mediaId: 901,
    url: '/uploads/maps/12/nodes/301/bg_901.webp',
    fit: 'cover',
    position: 'center',
    overlayColor: '#000000',
    overlayOpacity: 0.25
  }
}
```

* * *

9\. Autosave / 협업 고려사항
======================

실시간 저장 구조를 쓰므로 다음 정책이 필요합니다.

저장 단위
-----

*   이미지 업로드는 먼저 파일 저장
*   그 다음 노드 속성 변경 저장

즉 2단계:

1.  media 저장
2.  node style 저장

협업 충돌
-----

다른 사용자가 같은 노드의 배경 이미지를 수정하면:

*   마지막 저장 우선(LWW)로 시작 가능
*   추후 CRDT/OT 확장 가능

* * *

10\. Export 처리
==============

* * *

10.1 HTML Export
----------------

이 기능은 HTML export에서 거의 100% 재현 가능합니다.

노드 export 예시:

```
<div class="node" style="
  position:absolute;
  left:100px;
  top:200px;
  width:220px;
  height:120px;
  border-radius:16px;
  overflow:hidden;
  border:2px solid #f0b400;
">
  <img src="assets/node-bg-101.webp" style="
    position:absolute;
    inset:0;
    width:100%;
    height:100%;
    object-fit:cover;
    object-position:center;
  ">
  <div style="
    position:absolute;
    inset:0;
    background:rgba(0,0,0,0.25);
  "></div>
  <div style="
    position:absolute;
    inset:0;
    display:flex;
    align-items:center;
    justify-content:center;
    padding:12px;
    color:#fff;
    text-shadow:0 1px 3px rgba(0,0,0,0.45);
  ">
    사용자 이미지 삽입
  </div>
</div>
```

* * *

10.2 Markdown Export
--------------------

Markdown은 한계가 있어서 2안 중 하나를 추천합니다.

### 권장안 A

Markdown + metadata 주석

```
- 사용자 이미지 삽입
  <!-- backgroundImage: {"mode":"upload","url":"assets/node-bg-101.webp","fit":"cover"} -->
```

### 권장안 B

Markdown + JSON sidecar

*   `map.md`
*   `map.meta.json`

이 방식이 훨씬 안전합니다.

* * *

11\. 권장 UI 옵션 기본값
=================

초기값 추천:

*   배경 이미지 fit: `cover`
*   position: `center`
*   overlay color: `#000000`
*   overlay opacity: `0.20`
*   text box: `off`
*   text color auto contrast: `on`

* * *

12\. 예외 처리
==========

반드시 넣어야 할 것들입니다.

### 업로드 실패

*   “이미지 업로드에 실패했습니다.”

### 지원하지 않는 파일 형식

*   PNG/JPG/JPEG/WEBP 외 차단

### 파일 크기 초과

*   예: 10MB 초과 시 차단

### 이미지 로드 실패

*   기본 placeholder 표시
*   기존 배경색 유지

### 노드가 너무 작은 경우

*   텍스트 우선 표시
*   이미지 품질보다 내용 가독성 우선

* * *

13\. 개발 우선순위
============

1차 구현
-----

*   DB 필드 추가
*   media\_assets 테이블 추가
*   업로드 API
*   preset 이미지 API
*   노드 HTML renderer
*   이미지 패널
*   삭제/교체
*   autosave

2차 구현
-----

*   overlay 옵션
*   text box 옵션
*   fit/position 옵션
*   HTML export

3차 구현
-----

*   crop 편집
*   최근 사용 이미지
*   즐겨찾기 이미지
*   workspace 공용 이미지 라이브러리

* * *

14\. 최종 구현 판단
=============

이 기능은 **노드 내부에 이미지를 단순 삽입하는 기능이 아니라**,  
사실상 **“이미지 카드형 노드” 기능**입니다.

그래서 구조도 이렇게 가는 게 가장 맞습니다.

*   **이미지 파일 관리** = media\_assets
*   **노드에 적용되는 방식** = backgroundImage style
*   **렌더링** = HTML div 기반
*   **선/커넥터** = SVG
*   **export** = HTML에서 완전 지원, Markdown은 metadata 보조

이렇게 가면 나중에 아래 확장도 쉬워집니다.

*   AI가 노드에 맞는 추천 이미지 자동 삽입
*   프리셋 아이콘 라이브러리 확장
*   노드 썸네일 카드형 템플릿
*   멀티미디어 배경 노드 확장

* * *

다음 단계로는 이어서  
**“이미지 삽입 기능” 기능명세서 표 형식(ID, 기능명, 설명, 입력값, 처리규칙, 예외처리, 우선순위)** 형태로 정리해드리는 게 가장 좋습니다.

## Prompt:
“이미지 삽입 기능” 기능명세서 표 형식(ID, 기능명, 설명, 입력값, 처리규칙, 예외처리, 우선순위) 형태로 정리해줘

## Response:
8s 동안 생각함

좋아요.  
아래에 **“이미지 삽입 기능” 기능명세서 표 형식**으로 바로 개발문서에 넣을 수 있게 정리했습니다.  
기존 easymindmap 전체 기능 구조와 기능정의 테이블 흐름에 맞춰 **기능 ID를 IMG 그룹으로 분리**해서 잡았습니다.

easymindmap

기능정의테이블

* * *

easymindmap 기능명세서
=================

이미지 삽입 기능 (Image Insert / Background Image)
-------------------------------------------

| ID | 기능명 | 설명 | 입력값 | 처리규칙 | 예외처리 | 우선순위 |
| --- | --- | --- | --- | --- | --- | --- |
| IMG-01 | Open Image Panel | 선택한 Node에 대해 이미지 삽입/변경/삭제를 위한 이미지 패널을 연다 | nodeId | Node 선택 상태에서만 활성화된다. 우측 속성 패널 또는 툴바/우클릭 메뉴에서 진입 가능하다. | Node 미선택 시 패널 오픈 불가, “노드를 먼저 선택하세요” 안내 표시 | 상 |
| IMG-02 | Insert Preset Image | 사전 정의된 이미지를 Node 배경으로 삽입한다 | nodeId, presetImageId | 선택한 preset 이미지를 해당 Node의 배경 이미지로 저장한다. 기존 배경 이미지가 있으면 교체한다. 기본 배치값은 `fit=cover`, `position=center`, `overlayOpacity=0.20`으로 한다. | preset 이미지 정보가 없거나 삭제된 경우 삽입 실패 처리 | 상 |
| IMG-03 | Upload User Image | 사용자 PC의 이미지를 업로드하여 Node 배경으로 삽입한다 | nodeId, imageFile | 업로드 성공 후 media asset 생성 → Node backgroundImage 속성에 연결한다. 저장 후 즉시 미리보기에 반영한다. | 업로드 실패, 용량 초과, 지원하지 않는 포맷인 경우 오류 메시지 표시 | 상 |
| IMG-04 | Replace Background Image | 기존 Node 배경 이미지를 다른 preset 또는 업로드 이미지로 교체한다 | nodeId, presetImageId 또는 imageFile | 기존 이미지 메타데이터를 새 이미지 정보로 덮어쓴다. 텍스트/도형/태그 등 다른 Node 속성은 유지한다. | 교체 대상 Node가 없거나 저장 충돌 시 마지막 정상 상태 유지 | 상 |
| IMG-05 | Remove Background Image | Node에 적용된 배경 이미지를 제거한다 | nodeId | backgroundImage 값을 `none` 상태로 변경한다. 텍스트와 Node 배경색은 유지한다. | 배경 이미지가 없는 경우 무시하거나 “제거할 이미지 없음” 처리 | 상 |
| IMG-06 | Edit Image Fit Mode | 이미지 배치 방식을 변경한다 | nodeId, fit(cover/contain/stretch/original) | cover는 Node 영역을 꽉 채우고 잘릴 수 있다. contain은 전체 이미지가 보이도록 축소한다. stretch는 Node 크기에 맞춰 비율 무시 확장, original은 원본 크기 기준 표시 정책을 따른다. | 허용되지 않은 fit 값이면 기본값 `cover` 적용 | 중 |
| IMG-07 | Edit Image Position | 이미지 정렬 위치를 변경한다 | nodeId, position(center/top/bottom/left/right) | 선택 위치 기준으로 이미지 기준점을 이동한다. fit과 함께 동작한다. | 허용되지 않은 값이면 `center`로 보정 | 중 |
| IMG-08 | Edit Overlay Style | 배경 이미지 위 텍스트 가독성을 위한 overlay 색상/투명도를 조정한다 | nodeId, overlayColor, overlayOpacity | overlay는 배경 이미지 위, 텍스트 아래에 렌더링한다. opacity 범위는 0.00~1.00이다. | opacity 범위 초과 시 최소/최대값으로 자동 보정 | 중 |
| IMG-09 | Text Over Image | 배경 이미지 위에 Node 텍스트를 입력/편집한다 | nodeId, text, textColor, fontSize, textAlign, verticalAlign | 텍스트는 Node 본문 데이터로 유지한다. 이미지는 스타일 속성으로 처리한다. 텍스트는 이미지 위에 오버레이 렌더링된다. | 텍스트가 너무 길어 overflow 발생 시 줄바꿈/말줄임/Node 확장 정책 중 시스템 규칙 적용 | 상 |
| IMG-10 | Text Contrast Assist | 배경 이미지 위 텍스트 가독성을 높이기 위해 자동 대비를 보정한다 | nodeId, autoContrastOnOff | 자동 대비 ON이면 이미지 밝기 기준으로 textColor 또는 shadow/overlay를 자동 보정한다. 초기 기본값은 ON 권장 | 대비 계산 실패 시 기본 textColor와 overlay 기본값 사용 | 중 |
| IMG-11 | Render Background Image | 편집기 Canvas에서 배경 이미지가 적용된 Node를 렌더링한다 | node data 전체 | 렌더 순서는 `Node 배경 → 이미지 → overlay → 텍스트 → indicator` 순서로 한다. Node shape 범위를 벗어나지 않도록 clipping 처리한다. | 이미지 로드 실패 시 placeholder 없이 기본 Node 배경만 표시 | 상 |
| IMG-12 | Save Background Image State | 배경 이미지 관련 상태를 DB에 저장한다 | nodeId, bgImageMode, bgMediaId, fit, position, overlay 설정값 | autosave 정책에 따라 저장한다. 이미지 업로드 성공 후 Node style 저장이 이어서 수행된다. | 저장 실패 시 UI에 저장 실패 상태 표시, 재시도 큐 또는 undo 가능 상태 유지 | 상 |
| IMG-13 | Undo/Redo Image Action | 이미지 삽입/교체/삭제/스타일 변경을 실행취소/재실행한다 | action history | `SET`, `REMOVE`, `STYLE_CHANGE`를 history stack에 기록한다. undo 시 직전 backgroundImage 상태로 복원한다. | 이전 상태가 없으면 undo 불가 | 중 |
| IMG-14 | Export HTML With Background Image | Standalone HTML export 시 Node 배경 이미지와 텍스트 오버레이를 유지한다 | mapId | export 결과 HTML에서 배경 이미지, overlay, 텍스트 정렬, clipping을 최대한 동일하게 재현한다 | 이미지 파일 누락 시 기본 배경색만 표시하고 export 자체는 실패시키지 않음 | 상 |
| IMG-15 | Export Markdown Metadata | Markdown export 시 배경 이미지 정보를 metadata 또는 주석 형태로 보존한다 | mapId | Markdown 본문에는 텍스트 구조를 유지하고, 배경 이미지는 metadata/comment/sidecar JSON 방식으로 저장한다 | metadata 생성 실패 시 최소한 텍스트 구조만 export | 중 |
| IMG-16 | Validate Upload Image | 업로드 가능한 이미지 형식과 용량을 검증한다 | imageFile | 허용 포맷은 PNG/JPG/JPEG/WEBP를 기본 지원한다. 파일 크기 제한은 운영정책값을 따른다. MIME type과 확장자를 함께 검사한다. | 조건 미충족 시 업로드 중단 및 사유 메시지 표시 | 상 |
| IMG-17 | Preset Image Category Filter | preset 이미지 목록을 카테고리별로 조회/필터링한다 | categoryKey | Office, Education, IT, Process 등 카테고리 기준 목록을 표시한다. 최근 사용/즐겨찾기 확장 가능 | 해당 카테고리 이미지가 없으면 빈 목록 표시 | 하 |
| IMG-18 | Node Resize Reaction | 이미지가 들어간 Node의 크기 변경 시 이미지와 텍스트를 다시 배치한다 | nodeId, width, height | Node 크기 변경 시 fit/position 기준으로 이미지 재렌더링한다. 텍스트 padding과 정렬도 함께 재계산한다. | 최소 크기 이하에서는 이미지보다 텍스트 가독성을 우선 | 중 |
| IMG-19 | Copy/Paste Image Node Style | Node 복사/붙여넣기 또는 복제 시 배경 이미지 스타일 포함 여부를 처리한다 | sourceNodeId, targetNodeId | 기본 정책은 배경 이미지 포함 복제로 할지, 스타일만 복제로 할지 프로젝트 정책으로 결정한다. 권장 기본은 “Node 전체 복제 시 포함” | 원본 이미지 접근 권한이 없으면 배경 이미지는 제외하고 Node만 복제 | 중 |
| IMG-20 | Inheritance Policy On New Node | 형제/자식 Node 생성 시 배경 이미지 상속 여부를 제어한다 | sourceNodeId, createType(sibling/child) | 권장 기본값은 배경 이미지 자체는 상속하지 않고, 도형/색상/폰트 같은 스타일만 상속한다. 옵션으로 이미지 포함 상속 확장 가능 | 상속 설정값이 없으면 프로젝트 기본 정책 사용 | 중 |

* * *

권장 MVP 범위
=========

초기 1차 개발에서는 아래까지만 먼저 들어가면 됩니다.  
이 범위면 실제 사용성이 충분히 나옵니다.

| 구분 | 포함 기능 |
| --- | --- |
| 필수 | IMG-01, IMG-02, IMG-03, IMG-04, IMG-05, IMG-09, IMG-11, IMG-12, IMG-14, IMG-16 |
| 선택 | IMG-06, IMG-07, IMG-08, IMG-10, IMG-15 |
| 후속 | IMG-13, IMG-17, IMG-18, IMG-19, IMG-20 |

* * *

기능 그룹 요약
========

1) 사용자 기능
---------

*   preset 이미지 삽입
*   PC 이미지 업로드
*   이미지 교체/삭제
*   이미지 위 텍스트 입력

2) 스타일 기능
---------

*   fit / position
*   overlay
*   자동 대비
*   Node resize 대응

3) 시스템 기능
---------

*   autosave
*   undo/redo
*   HTML export
*   Markdown metadata export

* * *

권장 기능 ID 네이밍 규칙
===============

문서 전체 일관성을 위해 이렇게 맞추는 걸 권장합니다.

*   `IMG-01 ~ IMG-09` : 사용자 편집 기능
*   `IMG-10 ~ IMG-15` : 렌더링/저장/export 기능
*   `IMG-16 ~ IMG-20` : 검증/정책/확장 기능

* * *

원하시면 다음 단계로 바로 이어서  
**이 표를 기준으로 “화면 동작 시나리오(사용자 액션 → UI 변화 → API 호출 → DB 저장)” 표**까지 정리해드릴게요.



---
Powered by [ChatGPT Exporter](https://www.chatgptexporter.com)

---

## [정합성 보완] 배경 이미지(backgroundImage) vs 첨부파일(Attachment) 역할 구분

> **⚠️ 개발 시 혼동 방지를 위한 명확한 경계 정의**

### 핵심 구분 원칙

| 구분 | 노드 배경 이미지 (`backgroundImage`) | 첨부파일 (`node_attachments`) |
|------|--------------------------------------|-------------------------------|
| **저장 위치** | `nodes.style_json.backgroundImage` (JSONB) | `node_attachments` 별도 테이블 |
| **표시 방식** | 노드 도형 **내부** 배경으로 렌더링 | 노드 우측 📎 아이콘으로 표시 (인디케이터) |
| **지원 타입** | 이미지 파일만 (jpg, png, webp, gif, svg) | 모든 파일 (pdf, docx, xlsx, zip, jpg 등) |
| **텍스트 공존** | ✅ 이미지 위에 노드 텍스트 입력 가능 | ❌ 텍스트와 무관한 보조 파일 |
| **노드 크기 영향** | ✅ 배경 이미지에 따라 노드 크기 조절 가능 | ❌ 노드 크기 영향 없음 |
| **기능 ID** | IMG-01 ~ IMG-20 | (Node Indicator 문서 참조) |
| **API 엔드포인트** | `POST /nodes/{id}/background-image` | `POST /nodes/{id}/attachments` |
| **Export 처리** | HTML export 시 인라인 Base64 또는 URL | 다운로드 링크로 표시 |

### 이미지 파일의 처리 분기

이미지 파일(jpg, png 등)은 **사용자의 의도**에 따라 두 가지 방식으로 처리된다.

```
사용자가 이미지 파일을 드래그/업로드
    │
    ├── "노드 배경으로 삽입" 선택
    │       → style_json.backgroundImage 에 저장
    │       → 노드 도형 내부 배경으로 렌더링
    │
    └── "첨부파일로 추가" 선택
            → node_attachments 테이블에 저장
            → 노드 우측 📎 아이콘으로 표시
```

### DB 저장 구조

```sql
-- 배경 이미지: nodes 테이블의 style_json 컬럼 내부에 저장
-- nodes.style_json 예시:
{
  "fillColor": "#FFE08A",
  "backgroundImage": {
    "url": "https://storage.mindmap.ai.kr/images/abc123.png",
    "fit": "cover",           -- cover | contain | stretch | original
    "overlayOpacity": 0.3     -- 0.0 ~ 1.0 (텍스트 가독성을 위한 오버레이)
  }
}

-- 첨부파일: 별도 테이블 (이미지 파일도 첨부파일로 추가 가능)
-- node_attachments 테이블 참조: docs/02-domain/db-schema.md § 3-4
```

### 참고 문서
- `docs/03-editor-core/node-indicator.md § 31` — Attachment 인디케이터(📎) 표시 규칙
- `docs/02-domain/node-model.md § NodeBackgroundImage` — NodeBackgroundImage 타입 정의
- `docs/02-domain/db-schema.md § 3-4` — node_attachments 테이블 DDL
