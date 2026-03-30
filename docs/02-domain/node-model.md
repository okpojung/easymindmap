# easymindmap — Node Data Model

## NodeObject 전체 스키마

```typescript
type NodeObject = {
  // === 식별자 ===
  id: string;                    // UUID, 노드 고유 ID
  mapId: string;                 // 소속 맵 ID

  // === 트리 구조 ===
  parentId: string | null;       // 루트 노드는 null
  // [중요] childIds는 DB 컬럼이 아님 — 클라이언트 Document Store 전용 메모리 캐시
  // DB에는 nodes.parent_id (+ ltree path) 만 저장되며,
  // childIds는 맵 로딩 시 parent_id 관계를 역전하여 런타임에 구성된다.
  // ltree path 기반 subtree 탐색은 서버 사이드 DB 쿼리 전용이다.
  childIds: string[];            // ⚠ DB 없음 — 런타임 메모리 캐시
  depth: number;                 // 루트 = 0, 1레벨 = 1, ...
  orderIndex: number;            // 형제 내 순서

  // === 콘텐츠 ===
  text: string;                  // 노드 표시 텍스트
  note: string | null;           // 긴 설명 (노트)
  // [변경 주석]
  // note는 프론트엔드/도메인 관점의 "논리 필드"로 유지한다.
  // 현재 저장소의 물리 DB 설계는 node_notes 테이블 분리안과 nodes.note 컬럼 공존 흔적이 있어
  // 구현 단계에서 "어디를 최종 저장 원천으로 할지"를 1곳으로 확정해야 한다.
  // 문서/API 응답에서는 편의상 note를 NodeObject에 포함하여 다루는 것이 가장 이해하기 쉽다.

  // === 레이아웃 ===
  layoutType: LayoutType;        // 이 노드 이하 subtree 전개 방식
  collapsed: boolean;            // true = 자식 숨김

  // === 스타일 ===
  shapeType: ShapeType;
  style: NodeStyle;

  // === 부가 요소 ===
  tags: string[];                // Tag ID 목록
  hyperlinkIds: string[];        // 하이퍼링크 ID 목록
  attachmentIds: string[];       // 첨부파일 ID 목록
  multimediaId: string | null;   // 멀티미디어 ID

  // [변경 주석]
  // 위 4개 필드는 "API/프론트엔드 조립 결과 기준"의 논리 필드로 정의한다.
  // 즉, 에디터/뷰어가 NodeObject 하나만 보고도 indicator/tag 상태를 쉽게 판단할 수 있도록 유지한다.
  //
  // 단, 현재 최신 DB 물리 설계(schema.sql 기준)는 아래와 같이 정규화 관계 테이블을 사용한다.
  // - node_tags
  // - node_links
  // - node_attachments
  // - node_media
  //
  // 따라서 실제 저장은 관계 테이블에 하고,
  // API 응답에서 필요 시 집계/조립하여 tags, hyperlinkIds, attachmentIds, multimediaId 형태로 내려준다.
  // 즉:
  //   NodeObject = "논리/응답 모델"
  //   schema.sql = "물리 저장 모델"
  //
  // 이렇게 구분해 두면 프론트엔드 사용성은 유지하면서도 DB 정규화와 충돌하지 않는다.

  // === 노드 배경 이미지 ===
  // [변경 주석 2026-03-29]
  // node-background-image.md에서 완전히 설계되었으나 NodeObject에 누락됨 → 추가
  // 물리 저장: nodes.style_json JSONB 또는 nodes.background_image_json JSONB
  //   MVP: style_json 내 backgroundImage 키로 통합 저장
  //   확장: 별도 background_image_json JSONB 컬럼 분리 (erd.md bg_image_config_json 참조)
  // 첨부파일(node_attachments)과는 별개 개념:
  //   backgroundImage = 노드 자체 시각 표현 스타일
  //   attachment = 사용자가 열어보는 일반 파일
  backgroundImage?: NodeBackgroundImage | null;

  // === 자유배치 ===
  manualPosition: { x: number; y: number } | null;  // freeform 전용

  // === 캐시 ===
  size: { width: number; height: number } | null;   // 렌더링 캐시

  // === 다국어 번역 (V2 신규) ===
  // 물리 저장: nodes.text_lang, text_hash, translation_mode,
  //           translation_override, author_preferred_language 컬럼
  text_lang: string;             // franc 자동 감지 언어 코드 (ISO 639-1, 예: 'ko', 'en', 'ja')
  text_hash: string;             // SHA-256[:16] — 번역 캐시 유효성 검증용

  translation_mode: 'auto' | 'skip';
  // 'auto': 열람자 언어에 맞춰 자동 번역 대상
  // 'skip': 모든 열람자에게 원문 그대로 표시
  //   → 비영어권 작성자가 영어로 작성한 경우 저장 시 자동 설정
  //   → 2차 언어(secondaryLanguages)로 작성한 경우 자동 설정

  translation_override: 'force_on' | 'force_off' | null;
  // null:        자동 정책 적용 (기본)
  // 'force_on':  강제 번역 (skip 설정도 무시하고 번역 실행)
  // 'force_off': 강제 번역 금지 (모든 열람자에게 원문 표시)
  // 우선순위 최상위 — 맵/사용자 정책보다 항상 먼저 적용

  author_preferred_language: string | null;
  // 노드 작성 시점의 작성자 기본 언어 스냅샷 (예: 'ko')
  // 작성자가 이후 언어 설정을 바꿔도 기존 노드 translation_mode에 영향 없도록 저장
  // null: 레거시 노드 (migration 전 데이터)

  // === 메타 ===
  createdAt: string;             // ISO 8601
  updatedAt: string;
};
```

---

## LayoutType

```typescript
type LayoutType =
  // 방사형
  | 'radial-bidirectional'   // BL-RD-BI  방사형 양쪽 (기본값)
  | 'radial-right'           // BL-RD-R   방사형 오른쪽
  | 'radial-left'            // BL-RD-L   방사형 왼쪽
  // 트리형
  | 'tree-up'                // BL-TR-U   트리형 위
  | 'tree-down'              // BL-TR-D   트리형 아래
  | 'tree-right'             // BL-TR-R   트리형 오른쪽
  | 'tree-left'              // BL-TR-L   트리형 왼쪽
  // 계층형
  | 'hierarchy-right'        // BL-HR-R   계층형 오른쪽
  | 'hierarchy-left'         // BL-HR-L   계층형 왼쪽
  // 진행트리
  | 'process-tree-right'     // BL-PR-R   진행트리 오른쪽
  | 'process-tree-left'      // BL-PR-L   진행트리 왼쪽
  | 'process-tree-right-a'   // BL-PR-RA  진행트리 오른쪽A (버블형)
  | 'process-tree-right-b'   // BL-PR-RB  진행트리 오른쪽B (타임라인형)
  // 자유배치
  | 'freeform';              // BL-FR     수동 좌표 배치
  // 보드형
  | 'kanban';                // BL-KB     Kanban 보드형 레이아웃
```

### LayoutType ↔ BL 코드 매핑표

> **확정 규칙**: `layoutType` 필드에 저장되는 값은 **kebab-case 영문 문자열**을 사용한다.  
> BL 코드는 문서 내 참조용 식별자이며, DB 저장값이 아니다.

| BL 코드 | DB 저장값 (layoutType) | 한국어 명칭 | 기본값 |
|---------|----------------------|-----------|--------|
| BL-RD-BI | `radial-bidirectional` | 방사형 양쪽 | ✅ 기본 |
| BL-RD-R | `radial-right` | 방사형 오른쪽 | |
| BL-RD-L | `radial-left` | 방사형 왼쪽 | |
| BL-TR-U | `tree-up` | 트리형 위 | |
| BL-TR-D | `tree-down` | 트리형 아래 | |
| BL-TR-R | `tree-right` | 트리형 오른쪽 | |
| BL-TR-L | `tree-left` | 트리형 왼쪽 | |
| BL-HR-R | `hierarchy-right` | 계층형 오른쪽 | |
| BL-HR-L | `hierarchy-left` | 계층형 왼쪽 | |
| BL-PR-R | `process-tree-right` | 진행트리 오른쪽 | |
| BL-PR-L | `process-tree-left` | 진행트리 왼쪽 | |
| BL-PR-RA | `process-tree-right-a` | 진행트리 오른쪽A (버블형) | |
| BL-PR-RB | `process-tree-right-b` | 진행트리 오른쪽B (타임라인형) | |
| BL-FR | `freeform` | 자유배치 | |
| BL-KB | `kanban` | Kanban 보드형 | |

**주의**: `schema.sql`의 `nodes.layout_type` 컬럼은 `VARCHAR(50)`으로 위 DB 저장값 문자열을 그대로 저장한다.

---

## ShapeType

```typescript
type ShapeType =
  | 'rounded-rectangle'   // 기본
  | 'rectangle'
  | 'ellipse'
  | 'pill'
  | 'diamond'
  | 'parallelogram'
  | 'none';               // 텍스트만
```

---

## NodeStyle

```typescript
type NodeStyle = {
  fillColor?: string;       // 배경색 (hex)
  borderColor?: string;     // 테두리색
  textColor?: string;       // 글자색
  fontSize?: number;        // 기본: depth별 자동 결정
  fontWeight?: 400 | 500 | 600 | 700;
  fontStyle?: 'normal' | 'italic';
  borderWidth?: number;
  borderStyle?: 'solid' | 'dashed' | 'dotted';
  // [변경 주석 2026-03-29]
  // backgroundImage/backgroundImageOpacity 필드는 NodeStyle에서 제거됨
  // → NodeObject.backgroundImage (NodeBackgroundImage 타입)로 승격
  // 이유: 배경 이미지는 단순 스타일 속성이 아닌 독립 기능 (type, fit, overlay 등 복합 구조)
};

// ─────────────────────────────────────────────
// NodeBackgroundImage — 노드 배경 이미지 타입
// ─────────────────────────────────────────────
// 설계 기준: docs/03-editor-core/node-background-image.md
// 물리 저장: nodes.style_json 내 backgroundImage 키 (MVP)
//           또는 nodes.background_image_json JSONB 컬럼 (확장)
//
// [수정 2026-03-30]
// - fit: 'fill' → 'stretch' | 'original' 추가
//   node-background-image.md BackgroundFit과 동기화
//   ('fill'은 CSS 용어, 이 프로젝트에서는 'stretch'로 통일)
// - position: string → 구체적 유니온 타입으로 변경
//   (CSS object-position 자유 문자열 대신 사전 정의 값 사용)

// 배경 이미지 fit 모드
// cover    : 비율 유지, 노드 영역 꽉 채움 (잘릴 수 있음) — 기본값
// contain  : 비율 유지, 노드 영역 내에 전체 표시 (여백 생길 수 있음)
// stretch  : 비율 무시, 노드 영역에 꽉 맞게 늘림 (CSS fill에 해당)
// original : 이미지 원본 크기 그대로 표시 (노드보다 크면 잘림)
type BackgroundFit = 'cover' | 'contain' | 'stretch' | 'original';

// 배경 이미지 정렬 위치 (CSS object-position 사전 정의 값)
type BackgroundPosition =
  | 'center'       // 기본값
  | 'top'
  | 'bottom'
  | 'left'
  | 'right'
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right';

type NodeBackgroundImage = {
  type: 'preset' | 'upload';

  // preset 타입 전용
  assetId?: string;          // 프리셋 식별자 (예: 'preset_img_102')

  // upload 타입 전용
  fileId?: string;           // 업로드 파일 ID (Supabase Storage 기준)
  originalName?: string;     // 원본 파일명
  width?: number;            // 이미지 원본 너비 (px)
  height?: number;           // 이미지 원본 높이 (px)

  // 공통 필드
  url: string;               // CDN URL 또는 Supabase Storage URL (필수)
  fit: BackgroundFit;        // 기본값: 'cover'
  position?: BackgroundPosition; // 기본값: 'center'
  overlayOpacity: number;    // 0.0 ~ 1.0 (텍스트 가독성 보정 오버레이, 기본값: 0)
  overlayColor?: string;     // hex 색상 (기본값: '#000000')
  mediaType?: string;        // MIME 타입 (예: 'image/png', 'image/jpeg', 'image/webp')
};
```

---

## 주요 필드 설명

### layoutType
가장 중요한 필드. **이 노드 이하 subtree 전체**의 전개 방식을 결정한다.
- 루트 노드의 layoutType이 전체 기본 레이아웃을 결정
- 하위 노드에서 다른 layoutType을 지정하면 그 subtree만 독립 전환
- 단, `kanban`은 일반 subtree 확장형 레이아웃이 아니라 board 기반 레이아웃으로 해석한다.
- `kanban` 사용 시 depth 의미는 다음과 같이 고정된다:
  - depth 0 = board
  - depth 1 = column
  - depth 2 = card
  - depth 3 이상 = 허용하지 않음

### manualPosition
`freeform` layoutType일 때만 사용.
- auto layout에서는 엔진이 계산한 좌표 사용
- freeform에서는 drag 결과를 이 필드에 저장

### collapsed
`true`이면 자식 노드가 존재하지만 화면에 렌더링하지 않음.
노드 indicator로 자식 존재 여부를 표시.

### childIds
**⚠ DB 컬럼이 아닌 클라이언트 전용 메모리 캐시.**

| 항목 | 내용 |
|------|------|
| DB 저장 여부 | ❌ 없음 — `nodes` 테이블에 `child_ids` 컬럼 없음 |
| 서버 subtree 탐색 | `nodes.path LTREE` + GIST 인덱스로 `path <@ $target` 쿼리 |
| 클라이언트 구성 | 맵 로딩 시(`GET /maps/{mapId}`) `parent_id` 역전 → `childIds` 빌드 |
| 동기화 책임 | Document Store의 `applyPatch()` 가 노드 생성/삭제/이동 시 자동 갱신 |

```typescript
// 맵 로딩 시 childIds 구성 예시
function buildChildIds(nodes: NodeObject[]): Map<string, string[]> {
  const childMap = new Map<string, string[]>();
  for (const node of nodes) {
    if (node.parentId) {
      const siblings = childMap.get(node.parentId) ?? [];
      siblings.push(node.id);
      childMap.set(node.parentId, siblings);
    }
  }
  return childMap;
}
```

### tags / hyperlinkIds / attachmentIds / multimediaId
- 프론트엔드/응답 모델 기준에서는 NodeObject에 포함한다.
- 실제 저장은 최신 DB 설계 기준으로 관계 테이블에 정규화한다.
- 즉, "응답 편의 모델"과 "물리 저장 모델"을 분리하여 이해해야 한다.

### 번역 관련 필드 (V2 신규)

| 필드 | DB 컬럼 | 설명 |
|------|---------|------|
| `text_lang` | `nodes.text_lang` | franc 자동 감지 언어 코드 (저장 시 결정) |
| `text_hash` | `nodes.text_hash` | SHA-256[:16] — 번역 캐시 유효성 검증 |
| `translation_mode` | `nodes.translation_mode` | `'auto'`\|`'skip'` — 저장 시 자동 결정 |
| `translation_override` | `nodes.translation_override` | `'force_on'`\|`'force_off'`\|`null` — 편집자 수동 설정 |
| `author_preferred_language` | `nodes.author_preferred_language` | 작성 시점 작성자 기본 언어 스냅샷 |

**`translation_mode` 결정 규칙 (저장 시 서버가 자동 계산):**

| 조건 | translation_mode |
|------|-----------------|
| 작성자 기본 언어로 작성 | `'auto'` (번역 대상) |
| 2차 언어(secondaryLanguages)로 작성 | `'skip'` |
| 비영어권 작성자가 영어로 작성 + skipEnglish=true | `'skip'` |
| 그 외 (다른 언어) | `'auto'` (번역 대상) |

**`translation_override` 우선순위:**
> 노드별 override → 맵별 정책 → 사용자 기본 설정  
> 상세 알고리즘: `docs/04-extensions/multilingual-translation.md` § 3. shouldTranslate

### kanban layout 사용 시 depth 규칙
`layoutType = "kanban"` 인 경우 depth는 아래처럼 해석한다.

- depth 0: board
- depth 1: column
- depth 2: card
- depth 3 이상: 허용하지 않음

Kanban은 일반 subtree 확장 구조가 아니라, 3레벨 제한 보드형 구조로 동작한다.

### kanbanRole 확장 권장
Kanban Layout 구현 시 아래와 같은 role metadata를 둘 수 있다.

```typescript
type KanbanNodeRole = 'board' | 'column' | 'card';
---

## 루트 노드 특수 처리 정책

```typescript
const rootNode: NodeObject = {
  id: "node_root",
  parentId: null,        // 루트는 반드시 null
  depth: 0,
  layoutType: "radial-bidirectional",  // 전체 기본 레이아웃
  // ...
};
```

### 루트 노드 제약사항

| 항목 | 정책 |
|------|------|
| 삭제 | **불가** — 루트 노드는 삭제 버튼 비활성화, 키보드 단축키도 무시 |
| 부모 이동 | **불가** — 루트는 항상 `parentId: null` |
| layoutType 변경 | **가능** — 단, 전체 맵 레이아웃에 영향 (즉시 relayout 트리거) |
| 텍스트 편집 | **가능** — 맵 제목 역할, 기본값은 "New Mind Map" |
| collapsed | **불가** — 루트 노드는 collapse 기능 없음 (아이콘 미표시) |
| path (ltree) | `'root'` 고정 |
| order_index | `0.0` 고정 |

### freeform ↔ auto layout 전환 정책

`manualPosition`과 자동 레이아웃의 공존 규칙:

| 상황 | 처리 |
|------|------|
| auto layout → freeform 전환 | 전환 시점의 `computedX/Y`를 `manualPosition`에 복사하여 저장 |
| freeform → auto layout 전환 | `manualPosition = null` 로 초기화, Layout Engine이 재계산 |
| auto layout 중 drag | 해당 노드만 `freeform`으로 전환 + `manualPosition` 저장 |
| 부모 layoutType 변경 시 | 자식 노드 `manualPosition`은 유지 (수동 지정 좌표 보존) |

---

## 스타일 상속 규칙

1. 노드 생성 시 부모 노드의 style을 기본으로 복사
2. depth에 따른 기본 fontSize 자동 적용
   - depth 0 (루트): 20px
   - depth 1: 16px
   - depth 2: 14px
   - depth 3+: 12px
3. 명시적으로 지정한 style 필드는 상속값을 override

4. [변경 주석] shapeType과 fillColor 상속 규칙
   - 형제 노드 생성 / 자식 노드 생성 / 다중 가지 추가 시
     기준 노드의 shapeType과 style.fillColor를 기본 상속하는 정책과 연결된다.
   - 따라서 프론트엔드 생성 명령(Command) 설계 시
     단순히 text만 복사하지 말고 style/shape 기본값도 함께 복사해야 한다.
