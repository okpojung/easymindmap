# easymindmap — Domain Models

> `map-model.md` + `node-model.md` 통합 문서  
> 문서 버전: v3.3  
> 최종 업데이트: 2026-04-16

---

## 1. 전체 도메인 엔티티 관계

```
User
 └── Workspace (1:N)
      └── WorkspaceMember (N:N ↔ User)

User
 └── Map (1:N)
      ├── Node (1:N, 트리 구조)
      │    ├── NodeNote (1:1)
      │    ├── NodeLink (1:N)
      │    ├── NodeAttachment (1:N)
      │    ├── NodeMedia (1:1)
      │    ├── NodeTag (N:N ↔ Tag)
      │    ├── NodeTranslation (1:N)
      │    ├── NodeSchedule (1:1, WBS)
      │    └── NodeResource (1:N, WBS/Kanban)
      ├── MapRevision (1:N, 버전 히스토리)
      ├── PublishedMap (1:N, 공개 스냅샷)
      ├── Export (1:N)
      └── MapCollaborator (1:N, 협업자)

Tag (User 또는 Workspace 소속)
AIJob (User 소속)
FieldRegistry (독립 — 대시보드 필드 메타)
```

> 물리 DB 스키마 전체: `docs/02-domain/db-schema.md`

---

## 2. 공통 타입

### 2.1 SupportedLanguage

```typescript
// ISO 639-1 기반 지원 언어 (V2 신규)
type SupportedLanguage =
  | 'ko' | 'en' | 'ja' | 'zh' | 'zh-TW'
  | 'fr' | 'de' | 'es' | 'pt' | 'ru'
  | 'ar' | 'vi' | 'th';
```

### 2.2 LayoutType

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
  | 'freeform'               // BL-FR     수동 좌표 배치
  // 보드형
  | 'kanban';                // BL-KB     Kanban 보드형 레이아웃
```

#### LayoutType ↔ BL 코드 매핑표

> DB 저장값은 kebab-case 영문 소문자. BL 코드는 문서 내 참조용이며 DB에 저장하지 않는다.

| BL 코드 | DB 저장값 (layoutType) | 한국어 명칭 | 기본값 |
|---------|----------------------|-----------|--------|
| BL-RD-BI | `radial-bidirectional` | 방사형 양쪽 | ✅ |
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

#### LayoutType ↔ Edge 타입 매핑 (자동 결정)

> Edge 타입은 `layoutType`에서 자동 파생된다. 별도 DB 컬럼(`connector_style`) 불필요.  
> 참조: `docs/03-editor-core/edge-policy.md §3`, `docs/assets/맵진행방향.pdf`

| layoutType 계열 | Edge 타입 | 연결선 형태 |
|---|---|---|
| `radial-bidirectional`, `radial-right`, `radial-left` | `curve-line` | **Cubic Bezier 곡선** |
| `tree-*`, `hierarchy-*`, `process-tree-*`, `freeform`, `kanban` | `tree-line` | **직각선 (Orthogonal Connector)** |

```typescript
// Edge 타입 결정 함수
function resolveEdgeType(layoutType: LayoutType): 'curve-line' | 'tree-line' {
  if (layoutType.startsWith('radial-')) return 'curve-line';
  return 'tree-line';  // tree / hierarchy / process-tree / freeform / kanban 모두 직각선
}
```

> **⚠ 핵심**: `tree-line` = 직각선(Orthogonal), **대각선(straight-line) 아님**

### 2.3 ShapeType

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

### 2.4 NodeStyle

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
  // backgroundImage/backgroundImageOpacity 필드는 NodeStyle에서 제거됨
  // → NodeObject.backgroundImage (NodeBackgroundImage 타입)로 승격
};
```

### 2.5 NodeBackgroundImage

```typescript
// 배경 이미지 fit 모드
type BackgroundFit = 'cover' | 'contain' | 'stretch' | 'original';

// 배경 이미지 정렬 위치
type BackgroundPosition =
  | 'center' | 'top' | 'bottom' | 'left' | 'right'
  | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

type NodeBackgroundImage = {
  type: 'preset' | 'upload';

  // preset 타입 전용
  assetId?: string;          // 프리셋 식별자 (예: 'preset_img_102')

  // upload 타입 전용
  fileId?: string;           // 업로드 파일 ID (Supabase Storage 기준)
  originalName?: string;
  width?: number;
  height?: number;

  // 공통
  url: string;               // CDN 또는 Supabase Storage URL (필수)
  fit: BackgroundFit;        // 기본값: 'cover'
  position?: BackgroundPosition; // 기본값: 'center'
  overlayOpacity: number;    // 0.0~1.0 (기본값: 0)
  overlayColor?: string;     // hex (기본값: '#000000')
  mediaType?: string;        // MIME 타입
};
```

---

## 3. UserObject

```typescript
// UI 환경설정 (users.ui_preferences_json JSONB)
type UiPreferences = {
  showTranslationIndicator: boolean;     // 번역 아이콘 표시 (기본: true)
  showTranslationOverrideIcon: boolean;  // Override 아이콘 표시 (기본: true)
  showTagBadge: boolean;                 // 태그 badge 표시 (기본: true)
};

type UserObject = {
  id: string;                             // Supabase auth.users.id
  email: string;                          // Supabase Auth에서 관리
  displayName: string | null;

  // 번역 설정
  preferredLanguage: SupportedLanguage;   // [V2] 기본 언어
  secondaryLanguages: SupportedLanguage[]; // [V2] 2차 언어 최대 3개
  skipEnglishTranslation: boolean;        // [V2] 영어 번역 생략 (기본: true)

  // 기본 레이아웃
  defaultLayoutType: LayoutType;

  // UI 환경설정
  uiPreferences: UiPreferences;

  createdAt: string;
  updatedAt: string;
};
// 비밀번호 해시는 Supabase Auth에서 관리 — 앱 도메인 모델에 포함하지 않음
```

---

## 4. MapObject

### 4.1 번역 정책 타입

```typescript
// 맵별 번역 정책 (V2 신규)
// null = 맵별 정책 없음, UserObject 기본 설정을 그대로 따름
type MapTranslationPolicy = {
  skipLanguages: SupportedLanguage[];  // 이 맵에서 번역 생략할 언어 목록
  skipEnglish: boolean | null;         // null = 사용자 기본 설정 따름
} | null;
```

### 4.2 MapObject 타입

```typescript
type MapObject = {
  id: string;             // UUID
  ownerId: string;        // users.id
  workspaceId?: string | null;
  title: string;
  rootNodeId: string;

  // 설정
  defaultLayoutType: LayoutType;
  viewMode?: 'edit' | 'dashboard';
  refreshIntervalSeconds?: number;
  currentVersion?: number;

  // 번역 정책 (V2 신규) — DB: maps.translation_policy_json JSONB
  translationPolicy: MapTranslationPolicy;

  // 협업맵 필드 (V3.3 신규)
  isCollaborative: boolean;        // active editor ≥ 1명이면 true
  collabOwnerId: string | null;    // 현재 creator userId. 이양 시 변경

  // 상태
  deletedAt: string | null;        // soft delete (30일 휴지통)
  createdAt: string;
  updatedAt: string;
};
```

### 4.3 번역 정책 3단계 계층

번역 정책은 아래 3단계로 적용되며, 상위 레벨이 하위보다 우선한다.

```
레벨 3 (노드):   NodeObject.translation_override  ← 최우선
레벨 2 (맵):     MapObject.translationPolicy       ← 중간
레벨 1 (사용자): UserObject.preferredLanguage
                 UserObject.secondaryLanguages
                 UserObject.skipEnglishTranslation ← 기본값
```

| 레벨 | 적용 범위 | 타입 / 필드 | 기본값 |
|------|----------|------------|--------|
| 1 (사용자) | 모든 맵 | `preferredLanguage`, `secondaryLanguages`, `skipEnglishTranslation` | 가입 시 자동 설정 |
| 2 (맵) | 해당 맵만 | `translationPolicy: MapTranslationPolicy` | `null` (레벨 1 따름) |
| 3 (노드) | 해당 노드만 | `translation_override: 'force_on'|'force_off'|null` | `null` (자동) |

> 상세 알고리즘(`shouldTranslate()`): `docs/04-extensions/translation/23-node-translation.md`

---

## 5. NodeObject

```typescript
type NodeObject = {
  // === 식별자 ===
  id: string;                     // UUID
  mapId: string;

  // === 트리 구조 ===
  parentId: string | null;        // 루트 노드는 null
  childIds: string[];             // ⚠ DB 없음 — 런타임 메모리 캐시
  depth: number;                  // 루트 = 0
  orderIndex: number;             // 형제 내 순서 (FLOAT)

  // === 콘텐츠 ===
  text: string;
  note: string | null;            // 논리 필드 — 물리 저장: node_notes 테이블

  // === 레이아웃 ===
  layoutType: LayoutType;
  collapsed: boolean;
  created_by: string | null;      // [V3.3] 협업 권한 판단용 최초 생성자

  // === 스타일 ===
  shapeType: ShapeType;
  style: NodeStyle;

  // === 부가 요소 (논리 필드 — 물리: 관계 테이블) ===
  tags: string[];                 // Tag ID 목록
  hyperlinkIds: string[];
  attachmentIds: string[];
  multimediaId: string | null;

  // === 노드 배경 이미지 ===
  backgroundImage?: NodeBackgroundImage | null;

  // === 자유배치 ===
  manualPosition: { x: number; y: number } | null;  // freeform 전용

  // === 캐시 ===
  size: { width: number; height: number } | null;

  // === 다국어 번역 (V2 신규) ===
  text_lang: string;
  text_hash: string;              // SHA-256[:16]
  translation_mode: 'auto' | 'skip';
  translation_override: 'force_on' | 'force_off' | null;
  author_preferred_language: string | null;

  // === WBS 일정 (node_schedule 1:1) ===
  schedule: NodeSchedule | null;

  // === 리소스 할당 (node_resources 1:N) ===
  resources: NodeResource[];

  // === Redmine 연동 ===
  redmineIssueId: number | null;
  syncStatus: 'synced' | 'pending' | 'error' | 'failed' | null;

  // === 메타 ===
  createdAt: string;
  updatedAt: string;
};
```

### 5.1 childIds — 런타임 파생 구조

`childIds`는 DB에 저장하지 않는다. 맵 로딩 시 `parent_id` 관계를 역전하여 런타임에 구성한다.

```typescript
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

### 5.2 번역 관련 필드 (V2)

| 필드 | DB 컬럼 | 설명 |
|------|---------|------|
| `text_lang` | `nodes.text_lang` | franc 자동 감지 언어 코드 |
| `text_hash` | `nodes.text_hash` | SHA-256[:16] — 캐시 유효성 검증 |
| `translation_mode` | `nodes.translation_mode` | `'auto'`\|`'skip'` — 저장 시 서버 자동 결정 |
| `translation_override` | `nodes.translation_override` | `'force_on'`\|`'force_off'`\|`null` — 편집자 수동 설정 |
| `author_preferred_language` | `nodes.author_preferred_language` | 작성 시점 작성자 언어 스냅샷 |

`translation_mode` 결정 규칙 (서버 자동 계산):

| 조건 | translation_mode |
|------|-----------------|
| 작성자 기본 언어로 작성 | `'auto'` |
| 2차 언어(secondaryLanguages)로 작성 | `'skip'` |
| 비영어권 작성자 + 영어로 작성 + skipEnglish=true | `'skip'` |
| 그 외 | `'auto'` |

### 5.3 루트 노드 특수 정책

```typescript
const rootNode: NodeObject = {
  id: "node_root",
  parentId: null,        // 루트는 반드시 null
  depth: 0,
  layoutType: "radial-bidirectional",
  // ...
};
```

| 항목 | 정책 |
|------|------|
| 삭제 | 불가 — 버튼 비활성화, 키보드 단축키 무시 |
| 부모 이동 | 불가 — `parentId: null` 고정 |
| layoutType 변경 | 가능 — 전체 맵 레이아웃에 영향 |
| 텍스트 편집 | 가능 — 맵 제목 역할 |
| collapsed | 불가 |
| path (ltree) | `'root'` 고정 |
| order_index | `0.0` 고정 |

### 5.4 kanban layout depth 규칙

`layoutType = "kanban"` 시 depth 의미:

| depth | 역할 |
|-------|------|
| 0 | board |
| 1 | column |
| 2 | card |
| 3 이상 | 허용 안 함 (`chk_nodes_kanban_depth` DB 제약) |

### 5.5 freeform ↔ auto layout 전환 정책

| 상황 | 처리 |
|------|------|
| auto → freeform 전환 | 전환 시점 `computedX/Y`를 `manualPosition`에 복사 |
| freeform → auto 전환 | `manualPosition = null`, Layout Engine 재계산 |
| auto 중 drag | 해당 노드만 freeform 전환 + `manualPosition` 저장 |
| 부모 layoutType 변경 | 자식 `manualPosition` 유지 (수동 좌표 보존) |

---

## 6. 스타일 상속 규칙

1. 노드 생성 시 부모 노드의 style을 기본으로 복사
2. depth에 따른 기본 fontSize 자동 적용 (px 단위, 확정값 2026-03-31):
   - depth 0 (루트): 20px
   - depth 1: 16px
   - depth 2: 14px
   - depth 3+: 12px
3. 명시적으로 지정한 style 필드는 상속값을 override
4. 형제/자식 노드 생성 및 다중 가지 추가 시 기준 노드의 `shapeType` + `style.fillColor` 기본 상속

---

## 7. AI Workflow 확장 필드

```typescript
// AI Workflow 전용 확장 (선택적 — 일반 노드는 생략 가능)
workflowType?: 'normal' | 'executable';
stepState?: 'not_started' | 'in_progress' | 'blocked' | 'resolved' | 'done';
isExecutableStep?: boolean;
resolutionStatus?: 'none' | 'in_progress' | 'resolved';
```

### Note 구조화 블록

```typescript
type NoteBlock =
  | { type: 'paragraph'; content: string }
  | { type: 'code_block'; language: string; content: string; copyEnabled: boolean }
  | { type: 'warning'; content: string }
  | { type: 'tip'; content: string }
  | { type: 'checklist'; items: { text: string; checked: boolean }[] };
```

---

## 8. WBS / Resource / Redmine 확장 타입

### 8.1 NodeSchedule — WBS 일정

```typescript
// node_schedule 테이블 1:1 대응
type NodeSchedule = {
  startDate:   string | null;   // YYYY-MM-DD
  endDate:     string | null;
  isMilestone: boolean;         // true이면 startDate = endDate 강제
  progress:    number;          // 0~100
  updatedAt:   string;
};
```

### 8.2 NodeResource — 리소스 할당

```typescript
// node_resources 테이블 1:N 대응
// WBS: Activity 담당자/검토자 | Kanban: 카드 담당자 (allocatedHours = null)
type NodeResource = {
  id:              string;
  nodeId:          string;
  userId:          string | null;     // easymindmap 내부 사용자
  redmineUserId:   number | null;     // Redmine user.id (연동 시)
  redmineUserName: string | null;
  displayName:     string;
  avatarUrl:       string | null;
  role:            'assignee' | 'reviewer' | 'observer';
  allocatedHours:  number | null;     // WBS 전용
};
```

### 8.3 syncStatus 필드

| 값 | 의미 |
|---|---|
| `null` | Redmine 비연동 노드 |
| `'synced'` | 정상 동기화 완료 |
| `'pending'` | 동기화 진행 중 (BullMQ 대기) |
| `'error'` | 실패, 자동 재시도 대기 (최대 3회) |
| `'failed'` | 3회 재시도 모두 실패 — 수동 처리 필요 |

---

## 9. 보조 엔티티

### 9.1 RevisionObject

```typescript
// map_revisions 테이블 대응 (patch 중심 버전 모델)
type RevisionObject = {
  id: string;
  mapId: string;
  version: number;
  patchJson: object;
  clientId?: string;
  patchId?: string;    // idempotency key
  createdBy?: string;
  createdAt: string;
};
```

### 9.2 PublishedMapObject

```typescript
// published_maps 테이블 대응
type PublishedMapObject = {
  id: string;
  mapId: string;
  publishId: string;        // URL slug (nanoid)
  storagePath: string;      // Supabase Storage 경로
  publishedAt: string;
  unpublishedAt: string | null;
};
```

### 9.3 AIJobObject

```typescript
// ai_jobs 테이블 대응
type AIJobObject = {
  id: string;
  userId: string;
  mapId: string | null;
  jobType: 'generate' | 'expand' | 'summarize';
  prompt: string;
  resultMarkdown: string | null;
  model: string | null;
  tokensUsed: number | null;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  createdAt: string;
};
```

### 9.4 TagObject

```typescript
// tags 테이블 대응
type TagObject = {
  id: string;
  ownerId: string;             // 개인 태그 소유자 (owner_id)
  workspaceId: string | null;  // null = 개인 태그, NOT NULL = 워크스페이스 공유 태그
  name: string;
  color: string;               // hex
  createdAt: string;
};
```
