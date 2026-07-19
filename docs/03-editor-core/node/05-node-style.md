# 05. Node Style
## NODE_STYLE

* 문서 버전: v1.1
* 작성일: 2026-04-06
* 최종 업데이트: 2026-05-07
* 변경 이력:
  * v1.1 — 노드 배경 이미지 구현 단계를 MVP → V1으로 변경 (roadmap.md v1.6 동기화)

---

### 1. 기능 목적

* 노드의 **시각적 표현(UI/UX)**을 담당
* 콘텐츠(markdown)와 스타일을 분리하여 유지보수성과 확장성 확보

---

### 2. 기능 범위

* 포함:

  * 색상
  * 폰트
  * 배경
  * border
  * icon
  * 상태 표시
* 제외:

  * 콘텐츠 (NODE_CONTENT)
  * 위치 (LAYOUT)

---

### 3. 세부 기능 목록

| 기능ID  | 기능명    | 설명        | 주요 동작        |
| ----- | ------ | --------- | ------------ |
| NS-01 | 텍스트 색상 | 글자 색 변경   | color picker |
| NS-02 | 배경 색상  | 노드 배경     | palette      |
| NS-03 | 폰트 스타일 | bold/size | toolbar      |
| NS-04 | border | 테두리 스타일   | radius       |
| NS-05 | 아이콘    | 상태 아이콘    | emoji/icon   |
| NS-06 | 강조     | highlight | 중요 표시        |

---

### 4. 기능 정의 (What)

```json
{
  "style": {
    "textColor": "#333",
    "backgroundColor": "#fff",
    "fontSize": 14,
    "fontWeight": "bold",
    "borderRadius": 8,
    "borderColor": "#ddd"
  }
}
```

---

### 5. 동작 방식 (How)

#### 사용자

* 스타일 메뉴 선택
* 색상/폰트 변경

#### 시스템

* style state 저장
* 즉시 UI 반영
* autosave

---

### 6. 규칙 (Rule)

#### 6.1 분리 규칙

* 콘텐츠 ≠ 스타일
* markdown에는 색상 포함하지 않음

#### 6.2 상속 규칙

* 부모 스타일 → 자식 기본 상속
* override 가능

#### 6.3 우선순위

* node style > theme

---

### 7. 예외 / 경계

* 색상 없음 → default 적용
* 잘못된 값 → fallback
* viewer 수정 금지

---

### 8. 권한 규칙

| 역할      | 권한    |
| ------- | ----- |
| creator | 전체    |
| editor  | 변경 가능 |
| viewer  | 읽기    |

---

### 9. DB 영향

* nodes.style (JSON)

---

### 10. API 영향

* PATCH /nodes/{id}/style

---

### 11. 연관 기능

* NODE_CONTENT
* LAYOUT
* THEME
* EXPORT

---

### 12. 예시

* 중요 노드 → 빨간색
* 완료 노드 → 회색
* 루트 노드 → 강조 스타일

---

### 13. 구현 우선순위

#### MVP

* 색상
* 배경

#### 2단계

* 폰트
* border

#### 3단계

* theme 시스템

---

### 14. 노드 배경 이미지 (Node Background Image)

> **관련 문서**: `docs/02-domain/db-schema.md § node_media`, `docs/03-editor-core/node/03-node-indicator.md`  
> **기능 그룹**: Node Style / Media  
> **기능 ID 범위**: IMG-01 ~ IMG-20

#### 14.1 기능 개요

노드 도형 내부에 **배경 이미지(background image)** 를 삽입하고, 그 위에 노드 텍스트를 입력·편집할 수 있는 기능이다.

지원 소스:
1. **사전 정의 이미지**: 시스템 기본 이미지 라이브러리에서 카테고리별 선택
2. **사용자 PC 업로드 이미지**: 로컬 파일을 업로드하여 배경으로 즉시 적용

핵심 설계 원칙:
- 배경 이미지는 **첨부파일이 아니라 노드 스타일 속성**으로 저장한다.
- 텍스트는 항상 노드 본문 데이터로 유지하고, 렌더러가 이미지+텍스트를 합성하여 표시한다.

#### 14.2 NodeBackgroundImage 인터페이스 (9개 필드)

프론트엔드 상태 모델에서 노드의 배경 이미지는 다음 타입으로 정의한다.

```typescript
export type BackgroundImageMode     = 'none' | 'preset' | 'upload';
export type BackgroundFit           = 'cover' | 'contain' | 'stretch' | 'original';
export type BackgroundPosition      = 'center' | 'top' | 'bottom' | 'left' | 'right';

export interface NodeBackgroundImage {
  mode: BackgroundImageMode;      // 1. 이미지 소스 모드 (none/preset/upload)
  mediaId?: number;               // 2. media_assets 테이블 ID
  url?: string;                   // 3. 렌더링용 이미지 URL
  thumbnailUrl?: string;          // 4. 미리보기용 썸네일 URL
  fit: BackgroundFit;             // 5. 이미지 배치 방식 (cover/contain/stretch/original)
  position: BackgroundPosition;   // 6. 이미지 정렬 위치 (center/top/bottom/left/right)
  overlayColor: string;           // 7. 오버레이 색상 (예: "#000000")
  overlayOpacity: number;         // 8. 오버레이 투명도 (0.00 ~ 1.00)
  textBoxEnabled: boolean;        // 9. 텍스트 가독성 보조 박스 활성화 여부
  textBoxColor?: string;          // (선택) 텍스트 박스 배경 색상
  textBoxOpacity?: number;        // (선택) 텍스트 박스 투명도
}
```

기본값 권장:
- `fit`: `cover`
- `position`: `center`
- `overlayColor`: `#000000`
- `overlayOpacity`: `0.20`
- `textBoxEnabled`: `false`

#### 14.3 렌더링 순서

노드를 렌더링할 때 다음 순서를 반드시 준수한다.

```
1. 노드 도형 배경 (backgroundColor)
2. 배경 이미지 (backgroundImage.url)
3. 반투명 오버레이 (overlayColor + overlayOpacity)
4. 텍스트 (node.text)
5. node indicator / tag / note / hyperlink / attachment 아이콘
6. selection / hover outline
```

도형에 따라 이미지가 도형 영역을 벗어나지 않도록 clipping 처리가 필요하다.
- SVG 기반: `clipPath` 사용
- HTML/CSS 기반: `overflow: hidden + border-radius` 조합 권장

#### 14.4 배경 이미지 vs 첨부파일 구분

| 구분 | 노드 배경 이미지 (`backgroundImage`) | 첨부파일 (`node_attachments`) |
|------|--------------------------------------|-------------------------------|
| **저장 위치** | `nodes.style_json.backgroundImage` (JSONB) | `node_attachments` 별도 테이블 |
| **표시 방식** | 노드 도형 내부 배경으로 렌더링 | 노드 우측 📎 아이콘 (인디케이터) |
| **지원 타입** | 이미지 파일만 (jpg, png, webp, svg) | 모든 파일 형식 |
| **텍스트 공존** | ✅ 이미지 위에 텍스트 입력 가능 | ❌ 텍스트와 무관한 보조 파일 |
| **기능 ID** | IMG-01 ~ IMG-20 | Node Indicator 문서 참조 |
| **API 엔드포인트** | `PATCH /nodes/{id}/background-image` | `POST /nodes/{id}/attachments` |

이미지 파일(jpg, png 등)은 사용자 의도에 따라 두 가지 방식으로 처리된다.

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

#### 14.5 DB 스키마

**방법 A. `nodes` 테이블 JSONB 저장 (MVP용)**

`nodes.style_json` 컬럼 내부에 `backgroundImage` 키로 저장한다.

```json
{
  "fillColor": "#FFE08A",
  "backgroundImage": {
    "url": "https://storage.mindmap.ai.kr/images/abc123.png",
    "fit": "cover",
    "overlayOpacity": 0.3
  }
}
```

**방법 B. `nodes` 테이블 전용 컬럼 (확장형 — MVP 이후 고려)**
> ⚠ MVP에서는 방법 A(`nodes.style_json JSONB`)를 채택한다. 방법 B는 이후 성능 최적화 시 검토한다.

```sql
CREATE TABLE nodes (  -- 방법 B 예시 (MVP 이후 검토용)
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    map_id          BIGINT UNSIGNED NOT NULL,
    parent_id       BIGINT UNSIGNED NULL,
    node_key        VARCHAR(64) NOT NULL,
    node_text       TEXT NULL,

    -- 기존 스타일 컬럼 생략 --

    -- 배경 이미지 전용 컬럼
    bg_image_mode       VARCHAR(20) NOT NULL DEFAULT 'none',  -- none / preset / upload
    bg_media_id         BIGINT UNSIGNED NULL,
    bg_image_fit        VARCHAR(20) NOT NULL DEFAULT 'cover', -- cover / contain / stretch / original
    bg_image_position   VARCHAR(20) NOT NULL DEFAULT 'center',
    bg_overlay_color    VARCHAR(20) NOT NULL DEFAULT '#000000',
    bg_overlay_opacity  DECIMAL(4,2) NOT NULL DEFAULT 0.00,
    bg_text_box_enabled TINYINT(1) NOT NULL DEFAULT 0,
    bg_text_box_color   VARCHAR(20) NULL,
    bg_text_box_opacity DECIMAL(4,2) NULL,

    PRIMARY KEY (id),
    KEY idx_bg_media_id (bg_media_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

**`media_assets` 테이블 (업로드 파일 / 프리셋 이미지 공통 관리)**

```sql
CREATE TABLE media_assets (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    asset_key       VARCHAR(64) NOT NULL,
    source_type     VARCHAR(20) NOT NULL,    -- preset / upload
    category        VARCHAR(50) NULL,        -- office / education / process 등
    original_name   VARCHAR(255) NULL,
    stored_name     VARCHAR(255) NULL,
    mime_type       VARCHAR(100) NULL,
    file_ext        VARCHAR(20) NULL,
    file_size       BIGINT UNSIGNED NULL,
    width           INT NULL,
    height          INT NULL,
    storage_disk    VARCHAR(50) NOT NULL DEFAULT 'local',
    file_path       VARCHAR(500) NOT NULL,
    file_url        VARCHAR(1000) NOT NULL,
    thumbnail_url   VARCHAR(1000) NULL,
    owner_user_id   BIGINT UNSIGNED NULL,
    workspace_id    BIGINT UNSIGNED NULL,
    map_id          BIGINT UNSIGNED NULL,
    is_active       TINYINT(1) NOT NULL DEFAULT 1,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_asset_key (asset_key),
    KEY idx_source_type (source_type),
    KEY idx_owner_user_id (owner_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

#### 14.6 API 명세

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/image-presets?category={key}` | 사전 정의 이미지 목록 조회 |
| POST | `/api/media/upload-image` | 사용자 이미지 업로드 |
| PATCH | `/api/maps/{mapId}/nodes/{nodeId}/background-image` | 노드 배경 이미지 설정 |
| DELETE | `/api/maps/{mapId}/nodes/{nodeId}/background-image` | 노드 배경 이미지 제거 |
| PATCH | `/api/maps/{mapId}/nodes/{nodeId}/background-image-style` | 배경 옵션만 수정 |

**배경 이미지 설정 요청 예시**

```json
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

#### 14.7 기능 명세 목록 (IMG 그룹)

| ID | 기능명 | 설명 | 우선순위 |
|----|--------|------|----------|
| IMG-01 | Open Image Panel | 선택한 노드에 대해 이미지 삽입/변경/삭제 패널 열기 | 상 |
| IMG-02 | Insert Preset Image | 사전 정의된 이미지를 노드 배경으로 삽입 | 상 |
| IMG-03 | Upload User Image | 사용자 PC 이미지를 업로드하여 노드 배경으로 삽입 | 상 |
| IMG-04 | Replace Background Image | 기존 배경 이미지를 다른 이미지로 교체 | 상 |
| IMG-05 | Remove Background Image | 노드에 적용된 배경 이미지 제거 | 상 |
| IMG-06 | Edit Image Fit Mode | 이미지 배치 방식 변경 (cover/contain/stretch/original) | 중 |
| IMG-07 | Edit Image Position | 이미지 정렬 위치 변경 (center/top/bottom/left/right) | 중 |
| IMG-08 | Edit Overlay Style | overlay 색상/투명도 조정 | 중 |
| IMG-09 | Text Over Image | 배경 이미지 위에 노드 텍스트 입력/편집 | 상 |
| IMG-10 | Text Contrast Assist | 배경 이미지 위 텍스트 가독성 자동 대비 보정 | 중 |
| IMG-11 | Render Background Image | 편집기 Canvas에서 배경 이미지 노드 렌더링 | 상 |
| IMG-12 | Save Background Image State | 배경 이미지 관련 상태를 DB에 저장 | 상 |
| IMG-13 | Undo/Redo Image Action | 이미지 삽입/교체/삭제/스타일 변경 undo/redo | 중 |
| IMG-14 | Export HTML With Background Image | HTML export 시 배경 이미지와 텍스트 오버레이 유지 | 상 |
| IMG-15 | Export Markdown Metadata | Markdown export 시 배경 이미지 정보를 metadata로 보존 | 중 |
| IMG-16 | Validate Upload Image | 업로드 가능한 이미지 형식과 용량 검증 | 상 |
| IMG-17 | Preset Image Category Filter | preset 이미지를 카테고리별로 조회/필터링 | 하 |
| IMG-18 | Node Resize Reaction | 노드 크기 변경 시 이미지와 텍스트 재배치 | 중 |
| IMG-19 | Copy/Paste Image Node Style | 노드 복사/붙여넣기 시 배경 이미지 스타일 포함 처리 | 중 |
| IMG-20 | Inheritance Policy On New Node | 형제/자식 노드 생성 시 배경 이미지 상속 여부 제어 | 중 |

#### 14.8 상속 규칙

자식/형제 노드 생성 시 권장 기본 정책:
- **배경 이미지 자체는 상속하지 않는다** (모든 자식이 같은 이미지로 복제되는 혼란 방지).
- 다음 스타일 속성만 상속한다:
  - 도형 종류 (`shape`)
  - 배경색 (`fillColor`)
  - 테두리색 (`borderColor`)
  - 텍스트 스타일
- "이미지 포함 스타일 복제" 기능은 별도 옵션으로 제공할 수 있다 (IMG-20).

#### 14.9 업로드 파일 정책

| 항목 | 정책 |
|------|------|
| 허용 포맷 | PNG, JPG/JPEG, WEBP (SVG는 보안 검토 후 선택 지원) |
| 파일 크기 제한 | 1파일 최대 10MB (기본 권장 5MB) |
| 업로드 후 처리 | 썸네일 생성, 웹 렌더링용 최적화본 생성 |
| 보안 검증 | MIME type + 확장자 동시 검증, 악성 파일 검사, SVG는 스크립트 sanitize 필수 |

#### 14.10 Undo/Redo 처리

이미지 삽입도 일반 노드 편집과 동일하게 undo/redo 대상이다.

history stack에 기록할 이벤트 유형:
- `NODE_BG_IMAGE_SET`
- `NODE_BG_IMAGE_REMOVE`
- `NODE_BG_IMAGE_STYLE_CHANGE`

```json
{
  "type": "NODE_BG_IMAGE_SET",
  "nodeId": "node_101",
  "before": { "mode": "none" },
  "after": {
    "mode": "upload",
    "mediaId": 901,
    "url": "/uploads/maps/12/nodes/301/bg_901.webp",
    "fit": "cover",
    "position": "center",
    "overlayColor": "#000000",
    "overlayOpacity": 0.25
  }
}
```

#### 14.11 협업 충돌 정책

- 이미지 저장은 **2단계**로 수행한다: ① 파일(media) 저장 → ② 노드 style 저장
- 두 사용자가 같은 노드의 배경 이미지를 동시에 수정하면 **마지막 저장 우선(LWW)** 을 기본으로 한다.
- 추후 CRDT/OT 기반 확장이 가능하다.

#### 14.12 Export 처리

**HTML Export**

standalone HTML export 시 배경 이미지, overlay, 텍스트 정렬, clipping이 최대한 동일하게 재현되어야 한다.

```html
<div class="node" style="
  position:absolute; left:100px; top:200px;
  width:220px; height:120px;
  border-radius:16px; overflow:hidden;
  border:2px solid #f0b400;
">
  <img src="assets/node-bg-101.webp" style="
    position:absolute; inset:0;
    width:100%; height:100%;
    object-fit:cover; object-position:center;
  ">
  <div style="position:absolute; inset:0; background:rgba(0,0,0,0.25);"></div>
  <div style="
    position:absolute; inset:0;
    display:flex; align-items:center; justify-content:center;
    padding:12px; color:#fff;
    text-shadow:0 1px 3px rgba(0,0,0,0.45);
  ">노드 텍스트</div>
</div>
```

**Markdown Export**

배경 이미지는 Markdown 본문에 직접 표현하기 어려우므로 metadata 주석 또는 sidecar JSON으로 저장한다.

```markdown
- 노드 텍스트
  <!-- backgroundImage: {"mode":"upload","url":"assets/node-bg-101.webp","fit":"cover"} -->
```

#### 14.13 V1 구현 범위

> **로드맵 V1 단계에 포함.** MVP에는 포함되지 않음 (roadmap.md v1.6 기준).

| 구분 | 포함 기능 |
|------|----------|
| **V1 필수** | IMG-01, IMG-02, IMG-03, IMG-04, IMG-05, IMG-09, IMG-11, IMG-12, IMG-14, IMG-16 |
| **V1 선택** | IMG-06, IMG-07, IMG-08, IMG-10, IMG-15 |
| **후속 단계** | IMG-13, IMG-17, IMG-18, IMG-19, IMG-20 |

Phase별 개발 순서:
- **Phase 1 (V1)**: 데이터 모델 확장, 업로드 API, preset 이미지 API, node renderer 배경 이미지 지원, 텍스트 오버레이 렌더링, 이미지 삽입 패널
- **Phase 2 (V1)**: fit/position/overlay 옵션, HTML export 반영, undo/redo 지원, autosave 반영
- **Phase 3 (후속)**: 이미지 crop, 최근 사용 이미지, 즐겨찾기, workspace 공용 이미지 라이브러리

---

### 15. 텍스트 강조·정렬 확장 (MVS 구현 — 2026-07)

- **텍스트 강조**(스타일 탭): 굵게 / 기울임에 **취소선(strike)** 과
  **하이라이트(highlight)** 토글 추가. `NodeStyle.strike?: boolean`,
  `NodeStyle.highlight?: boolean`. 취소선은 SVG `text-decoration:
  line-through`, 하이라이트는 각 텍스트 줄 뒤에 노란(#FFE066) 형광 띠를
  그린다. HTML 내보내기 뷰어에도 동일하게 재현.
- **텍스트 정렬**(스타일 탭): 왼쪽(기본) / 중앙 / 오른쪽 버튼 —
  `MindNode.textAlign` 사용 (documentStore.updateNodeTextAlign).
- **레벨별 폰트는 스타일 탭에서 제거** — 좌측 상단 **맵 설정** 메뉴
  (MapSettingsPanel)로 이동, 레벨(Root/L1/L2/L3/L4+)별 **글자 크기 +
  글꼴(font-family)** 을 실제로 변경할 수 있다.
  - 저장: `map.settings.levelFonts[0..4] = { size?, family?, align? }`
  - **텍스트 맞춤(align)** (2026-07 추가): 레벨별 기본 맞춤
    (왼쪽/중앙/오른쪽). 해석 순서는 **노드별 `textAlign`(스타일 탭) →
    레벨 기본(`levelFonts[li].align`) → 중앙**. 이를 위해
    normalizeNode가 더 이상 textAlign을 'center'로 강제하지 않는다
    (강제하면 레벨 기본 맞춤이 절대 적용될 수 없다).
  - 측정·그리기 일치: Canvas가 레이아웃 계산 직전
    `setLevelFontConfig()`로 주입 → 모든 레이아웃 전략의
    `sizeNodeForText()`와 NodeRenderer가 같은 값 사용. 줄 높이는
    기본값(24/18) + (설정 크기 − 기본 크기)로 따라 움직인다.
  - 글꼴 목록(MVS 하드코딩): 기본(시스템)/맑은 고딕/나눔고딕/본고딕/
    명조/고정폭 — [서버 연결 예정] 코드 언어 목록처럼 시스템 관리자
    카탈로그로 이관 (docs/02-domain/db-schema.md §향후 관리 테이블 참조)
  - [서버 연결 예정] `maps.settings_json.levelFonts`로 저장.

### 16. 맵 설정 — 레벨별 레이아웃 (MVS 구현 — 2026-07)

맵 설정 메뉴에 **레벨별 레이아웃** 추가 (Level 1/2/3/4+). 선택하면 해당
레벨의 **모든 노드에 서브트리 레이아웃을 일괄 적용**한다 (개별 노드의
기존 오버라이드를 그 레벨에 한해 덮어씀 — 각 노드 layoutType에 기록되어
기존 레이아웃 엔진·내보내기와 그대로 호환). '기본(상위 따름)'으로 되돌리면
해당 레벨의 오버라이드를 해제한다.

- 선택지: 방사형·오른쪽 / 트리·오른쪽 / 계층형·오른쪽 / 진행트리·오른쪽
  (루트 전용 레이아웃 — 방사형·양쪽/트리·아래/Kanban/자유배치 — 제외,
  08-layout.md §6.3.1 규칙과 동일)
- 저장: `map.settings.levelLayouts[1..4]` → [서버 연결 예정]
  `maps.settings_json.levelLayouts`
- 맵 전체 레이아웃 변경 시(레이아웃 탭에서 루트 레이아웃 선택) 모든
  오버라이드와 함께 초기화된다 (기존 규칙 유지).
- 일괄 적용 방식이므로 이후 **새로 추가된 노드에는 자동 적용되지 않는다**
  — 다시 선택하면 재적용. (자동 상속형은 후속 검토)
- **1레벨(중심) 행** (2026-07 추가): 레벨별 레이아웃 목록 맨 위에
  1레벨(중심) = **맵 전체 레이아웃** 선택을 둔다 (레이아웃 탭과 동일
  선택지·동일 동작 — 방사형·양쪽/오른쪽, 트리·오른쪽/아래, 계층형,
  진행트리, 시간배치). 레이아웃 탭까지 가지 않아도 맵 설정 한 곳에서
  모든 레벨의 레이아웃을 조정할 수 있다.

### 16.1 맵 설정 — 레벨별 도형 (MVS 구현 — 2026-07)

맵 설정 메뉴에 **레벨별 도형** 추가 (1레벨(중심)/2/3/4/5레벨+).
레벨의 **기본 도형**을 정한다 — 스타일 탭에서 노드별로 정한 도형이
항상 우선하고, '기본'이면 둥근 사각형이다.

- 해석 순서: `style.shapeType`(노드별) → `levelShapes[li]`(맵 설정)
  → `rounded`
- 저장: `map.settings.levelShapes[0..4]` (`null`/없음 = 기본) →
  [서버 연결 예정] `maps.settings_json.levelShapes`
- 주입 경로는 레벨별 폰트와 동일: Canvas가 레이아웃 계산 직전
  `setLevelShapeConfig()` 주입 → NodeRenderer의 `levelShape(depth)`
  조회. 템플릿 '적용'(applyTemplateStyles)도 settings째 복사되므로
  함께 적용된다.
- 선택지: 스타일 탭과 같은 11종 (둥근/사각/캡슐/원/육각/다이아/평행/
  화살◀/화살▶/원통/별).

### 17. 부분 텍스트 강조 — 인라인 마커 (MVS 구현 — 2026-07)

스타일 탭의 텍스트 강조는 **노드 전체**에 적용된다. 노드 텍스트의
**일부 구간**에만 강조하려면 markmap과 같은 인라인 마커를 쓴다:

| 문법 | 효과 |
|------|------|
| `**텍스트**` | 굵게 |
| `*텍스트*` | 기울임 |
| `~~텍스트~~` | 취소선 |
| `__텍스트__` | 밑줄 |
| `==텍스트==` | 하이라이트(형광) |

- 입력 방법 ①: 노드 텍스트에 마커를 직접 입력 (MD 가져오기와 호환)
- 입력 방법 ②: 노드 편집(더블클릭) 중 텍스트를 드래그 선택하고
  노드 위에 뜨는 **강조 툴바(B/I/S/U/H)** 클릭 또는 **Ctrl+B/I/U**
- **토글 동작**: 이미 그 마커가 적용된 구간을 선택하고 같은 버튼을
  다시 누르면 **해제**된다 (`toggleMarkRange` — 선택이 마커째든,
  마커 안쪽 텍스트만이든 모두 인식). 여러 줄 선택은 줄마다 처리.
- 렌더링: 파서(`inlineMarks.ts`)가 줄을 구간(tspan)으로 나눠 그리고
  마커 문자는 숨긴다. 노드 전체 강조(스타일 탭)와 결합. 하이라이트는
  해당 구간 뒤에만 노란 띠. HTML 내보내기 뷰어 동일 규칙.
- **구간 좌표는 캔버스 실측**(`textMeasure.ts measureTextPx`,
  뷰어는 `measureReal`) — 근사 폭(`measureTextApprox`)으로 tspan의
  x를 정하면 실제 렌더 폭과 어긋나 인접 구간 글자가 겹친다.
  노드 **크기** 계산은 여전히 근사 폭(레이아웃을 폰트 로딩 시점과
  분리; 근사가 실측보다 넉넉해 잘림 없음).
- 파서 규칙: 마커는 토글 — 닫는 짝이 없으면 줄 끝까지 적용.
- **자동 줄바꿈 이월** (2026-07 수정): 마커 구간이 자동 줄바꿈으로 두
  줄에 걸치면, 줄 끝의 마커 상태(`parseInlineMarksWithState`)를 다음
  줄로 이월한다 — 줄마다 독립 파싱하면 다음 줄의 닫는 마커가 "여는
  마커"로 재해석되어 강조 위치가 밀린다. **수동 줄바꿈(\n) 세그먼트가
  시작하는 줄**(sizeNodeForText의 manualStarts → 레이아웃 `_manualStarts`)
  에서만 상태를 리셋한다. HTML 내보내기 뷰어도 동일 규칙 (내보낸
  pos.ms로 전달 — 에디터·뷰어 파리티).
- 아웃라인 목록에는 마커를 제거한 일반 텍스트로 표시(stripInlineMarks).
- **표 셀에서도 렌더링** (2026-07): 노드 안 Markdown 표의 각 셀도
  같은 파서로 구간(tspan)을 나눠 그린다 — `**` 마커가 셀에 그대로
  보이던 문제 수정. 셀 폭 측정은 `stripInlineMarks(cell)` 기준
  (마커 문자가 폭을 부풀리지 않게), 구간 x 좌표는 캔버스 실측
  (`measureTextPx`). 헤더 행은 원래 굵게이므로 굵게 마커와 자연 결합.
- **노트 뷰어 팝업에서도 렌더링** (2026-07): 문단·체크리스트 노트를
  줄 단위로 파싱해 굵게/기울임/취소선/밑줄/하이라이트(#FFE066) span으로
  표시한다 (`NoteViewerPopover`) — 중심 주제 노트에 붙여넣은 강조가
  마커 문자 그대로 보이던 문제 수정. 노트 편집창(노트·태그 탭)에는
  원문(마커 포함)이 그대로 남는다.

#### 강조 툴바 (공용 컴포넌트 `MarkToolbar.tsx`)

노드 편집 오버레이와 아웃라인 편집창이 같은 툴바를 쓴다. 28px 버튼,
15px 글자, 흰 배경 + 뚜렷한 테두리·그림자, 호버 배경 (ThinkWise 상단
서식 툴바 수준의 시인성). `onMouseDown preventDefault`로 편집창의
포커스·선택이 풀리지 않게 유지. 아웃라인 쪽은 떠 있는(absolute) 위치가
첫 행(루트)에서 페인 스크롤 영역에 잘리므로 입력창 위 일반 흐름으로
배치한다.

#### 캔버스 드래그 선택 하이라이트 방지 (같은 커밋)

캔버스에서 좌클릭 드래그 시 SVG 글자가 **브라우저 기본 '텍스트 선택'**
대상이 되어 선택 하이라이트(주황 배경)가 그려지던 문제 — 캔버스 svg에
`user-select: none`을 적용해 차단. 노드 편집창(textarea) 안의 선택은
그대로 동작한다.

### 18. 도형 4종 추가 + 테두리 이중선 (MVS 구현 — 2026-07)

`ShapeType`에 4종 추가 (스타일 탭 '도형' 그리드, 총 11종):

| 도형 | 키 | 렌더링 |
|---|---|---|
| 화살◀ (왼쪽 화살표) | `arrow-left` | 촉이 왼쪽 중앙인 5점 polygon |
| 화살▶ (오른쪽 화살표) | `arrow-right` | 촉이 오른쪽 중앙인 5점 polygon |
| 원통 (데이터베이스) | `cylinder` | 몸통 path + 위 뚜껑 ellipse |
| 별 | `star` | 박스에 맞춘 5각 별 (10점 polygon, 안쪽 반지름 0.45) |

**테두리 이중선**: `NodeBorderStyle`에 `double` 추가 (실선/파선/점선/이중선).
SVG에는 CSS `double` stroke가 없으므로 **같은 도형을 9px 작게 한 번 더**
(fill 없이) 그려 이중 실선을 만든다 — 모든 도형(11종)에 동일하게 동작.

주의: HTML 내보내기 뷰어는 노드를 둥근 사각형으로만 그린다(도형·테두리
스타일 미반영 — 기존 7종 도형도 동일). 뷰어 도형 파리티는 후속 과제.


### 맵 설정 — 노트 폰트 + 노트 뷰어 자동 크기 (MVS 구현 — 2026-07)

- **노트 폰트**: 맵 설정 메뉴에 노트(문단·코드·표·체크리스트)의
  글꼴·크기 항목 추가 — `map.settings.noteFont = { size?, family? }`,
  **기본 크기 13pt**. 노트 뷰어 팝업(NoteViewerPopover)·노트 편집창
  (노트·태그 탭 textarea)·HTML 내보내기 뷰어 노트 패널에 적용된다.
  표는 −1pt, 코드는 −2pt(고정폭 유지).
- **노트 뷰어 팝업 자동 크기**: 내용의 자연 크기에 맞춰 창 크기를
  자동 결정 — 최소 220×120 ~ **최대 "화면 4분할 시 우측 상단"
  (브라우저 화면의 1/2 × 1/2)**. 첫 프레임에 최대 폭으로 그려
  내용을 잰 뒤(useLayoutEffect, 블록 요소는 max-content로 자연 폭
  측정) 페인트 전에 줄인다. 범위를 넘는 내용은 스크롤, 우하단
  핸들로 수동 조절은 그대로 가능. 노트·폰트가 바뀌면 다시 측정.
