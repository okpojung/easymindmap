# easymindmap — Coding Conventions

> AI(Claude/Codex)가 코드를 생성할 때 반드시 따라야 할 규칙.  
> 이 문서를 프롬프트에 첨부하거나 시스템 프롬프트로 사용한다.
>
> * 최종 업데이트: 2026-08-04 — 실제 리포 기준 현행화: pnpm → **npm**(앱별 lock), 디렉토리 트리를 실제 구조로, tsconfig 실제값(frontend strict:false)과 목표 분리, 스토어 8개, immer 미사용, API 클라이언트 = `services/cloud/apiClient.ts`, ESLint·Prettier 설정 파일 아직 없음.

---

## 1. 언어 & 런타임

| 항목 | 선택 |
|------|------|
| 언어 | TypeScript |
| Node.js | 20 LTS 이상 |
| 패키지 매니저 | **npm** — pnpm 워크스페이스 아님. 모노레포지만 워크스페이스 설정 없이 **앱별 `package-lock.json`**(`apps/frontend`, `apps/api`, `packages/emm-parser`)로 관리한다 |

---

## 2. 디렉토리 구조 규칙 (실제)

### Frontend (`apps/frontend/src/`)

```
components/       # 공용 React 컴포넌트 (아이콘 등)
editor/           # 에디터 — 캔버스·인스펙터 패널·샘플(__samples__)
stores/           # Zustand store 8개 (documentStore 등)
hooks/            # React custom hooks
services/         # 서버 연동 (cloud/apiClient.ts 등)
export/           # 내보내기 (exportHtml, exportMarkdown …)
pages/            # 라우트 페이지 컴포넌트
layout/           # 레이아웃 엔진 (순수 로직, React 의존 없음)
utils/            # 순수 유틸리티 함수
types/            # 공통 TypeScript 타입 (@emm/model 재수출 포함)
config/           # 설정
```

### Backend (`apps/api/src/`)

```
maps/             # 맵·문서·버전 (dto/ 하위에 DTO)
nodes/            # 정규화 노드 경로
folders/          # 문서함 폴더
attachments/      # 첨부 업로드
storage/          # 스토리지 드라이버
health/           # /v1/health (스키마 진단 포함)
database/         # DB 연결·스키마
common/           # auth 가드 등 공통
config/
```

NestJS 모듈 내부는 `{module}.module.ts` / `{module}.controller.ts` /
`{module}.service.ts` 관례를 따른다 (TypeORM Entity 는 사용하지 않음 —
SQL 직접).

---

## 3. 파일 네이밍

| 종류 | 규칙 | 예시 |
|------|------|------|
| React 컴포넌트 | PascalCase.tsx | `NodeRenderer.tsx` |
| Hook | camelCase, use 접두사 | `useAutosave.ts` |
| Store | camelCase + Store | `documentStore.ts` |
| Engine/Utils | camelCase | `radialLayout.ts` |
| Type 파일 | camelCase | `nodeTypes.ts` |
| NestJS Module | kebab-case | `maps.module.ts` |
| DTO | PascalCase + Dto | `CreateMapDto.ts` |

---

## 4. TypeScript 규칙

```typescript
// ✅ 올바른 예
type NodeStyle = {
  fillColor?: string;
  fontSize?: number;
};

// ❌ 금지: any 사용
function process(data: any) { }

// ✅ 대신 unknown + 타입 가드 사용
function process(data: unknown) {
  if (isNodeObject(data)) { ... }
}

// ❌ 금지: non-null assertion 남용
const node = nodeMap.get(id)!;

// ✅ 명시적 null 처리
const node = nodeMap.get(id);
if (!node) return;
```

### tsconfig 실제값 (2026-08 현재)

| 앱 | 실제 설정 |
|---|---|
| `apps/frontend` | **`strict: false`** — 유니언 내로잉은 `'reason' in res` 같은 방식으로 우회하는 코드가 있다 (e2e91 노트 참조) |
| `apps/api` | `strictNullChecks: true` + `noImplicitAny: true` (full strict 아님) |

### 목표 설정 (신규 코드 지향 — 아직 미적용)

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true
  }
}
```

> strict 승격은 별도 배치 작업으로 진행한다 — 새 코드는 위 목표 기준으로
> 작성하되, tsconfig 을 임의로 올리지 않는다 (기존 코드 대량 오류).

### nullable 필드 처리 규칙

도메인 모델(`domain-models.md`)에서 nullable 필드는 아래 규칙으로 처리한다:

```typescript
// ✅ nullable 필드 — 명시적 null 분리 (undefined와 혼용 금지)
type NodeObject = {
  parentId: string | null;          // 루트는 null, undefined 아님
  multimediaId: string | null;      // 없으면 null
  manualPosition: { x: number; y: number } | null;  // freeform 전용
  redmineIssueId: number | null;    // Redmine 비연동 시 null
};

// ✅ nullable 필드 접근 시 optional chaining 사용
const x = node.manualPosition?.x ?? 0;

// ❌ 금지: null과 undefined 혼용
type BadType = {
  parentId?: string;   // X — 루트 여부를 null로 명시해야 함
};
```

### JSONB 필드 타입 처리

DB의 JSONB 컬럼(`style_json`, `manual_position`, `size_cache` 등)은 아래 규칙으로 처리한다:

```typescript
// ✅ JSONB 컬럼은 TypeScript 타입으로 명시적 정의
// DB: nodes.style_json JSONB → TypeScript: NodeStyle
// DB: nodes.manual_position JSONB → TypeScript: { x: number; y: number } | null

// ✅ API 응답에서 JSONB 파싱 시 타입 가드 사용
function isNodeStyle(v: unknown): v is NodeStyle {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

// ✅ JSONB 직렬화는 JSON.stringify 사용 (Date는 ISO string으로 변환)
const styleJson = JSON.stringify(node.style);
```

---

## 5. 컴포넌트 규칙 (React)

```typescript
// ✅ 함수형 컴포넌트 + 명시적 Props 타입
type NodeRendererProps = {
  node: NodeObject;
  isSelected: boolean;
  onSelect: (nodeId: string) => void;
};

export function NodeRenderer({ node, isSelected, onSelect }: NodeRendererProps) {
  return (
    <g onClick={() => onSelect(node.id)}>
      {/* SVG elements */}
    </g>
  );
}

// ❌ 금지: default export (Store, Engine은 예외)
export default function NodeRenderer() { }

// ✅ named export 사용
export function NodeRenderer() { }
```

### Hook 규칙
```typescript
// ✅ 단일 책임 — hook 하나가 하나의 기능만 담당
export function useNodeSelection() {
  const selectedNodeId = useEditorUIStore(s => s.selectedNodeId);
  const setSelected = useEditorUIStore(s => s.setSelectedNode);
  return { selectedNodeId, setSelected };
}

// ❌ 금지: 하나의 hook에 여러 관심사 혼합
export function useEverything() {
  // autosave + selection + zoom 모두 처리 — X
}
```

---

## 5-1. 목록 UI 규칙 — 올린 줄이 보여야 한다 (2026-08-05)

**클릭할 수 있는 목록의 모든 행은 마우스를 올렸을 때 그 줄이 또렷하게
보여야 한다.** 문서함·검색 결과·첨부 목록·히스토리처럼 "여러 줄 중
하나를 고르는" 화면에서, 어느 줄을 고르는지 알 수 없으면 엉뚱한 항목을
누르게 된다 (실사용 보고 — 첨부 목록과 HTML 뷰어 검색은 되는데 문서함과
에디터 검색은 아무 표시가 없었다).

새 목록을 만들 때는 **직접 스타일을 짜지 말고** 공용 클래스를 쓴다:

```tsx
<div
  className="mm-list-row"
  aria-selected={selected}          // 선택된 줄은 계속 강조된 채로
  style={{
    padding: '8px 10px',
    ['--row-hover' as string]: t.primarySoft,      // 테마 색을 넘긴다
    ['--row-hover-bd' as string]: t.primaryBorder,
  } as CSSProperties}
>
```

`styles/global.css` 의 `.mm-list-row` 가 hover·focus-visible·
`aria-selected` 를 한 번에 처리한다. 색만 CSS 변수로 넘기므로 라이트/
다크 모두 자동으로 맞는다. 키보드 이동(Tab)도 같은 강조를 받는다.

지키는 이유는 일관성이다 — 한 화면에서만 되는 강조는 "이 목록은 왜
반응이 없지?" 하는 의심을 만든다. 목록이 늘어날 때마다 같은 클래스를
붙이면 앱 전체가 같은 규칙으로 움직인다.

### 5-1-1. 행 강조가 있으면 **툴팁은 붙이지 않는다** (2026-08-05)

행 강조를 넣은 뒤로 `title="이 맵 열기"` 같은 툴팁은 설명이 아니라
방해가 됐다 — 목록을 훑을 때마다 커서를 따라다니며 아래 줄을 가린다.
글자가 이미 붙어 있는 행(맵 이름·폴더 이름·검색 결과)에는 툴팁을
붙이지 않는다.

* 첫 사용자를 위한 설명이 필요하면 **목록 위에 한 줄**로 한 번만 쓴다
  (예: 검색 결과 위 "누르면 그 노드로 이동합니다").
* **예외 = 아이콘만 있는 버튼.** ✏·📂·🗑·✕ 처럼 글자가 없는 버튼은
  툴팁이 유일한 설명이므로 `title` + `aria-label` 을 모두 남긴다.

### 5-1-2. **누른 자리에서 열린다** — 입력창·확인창의 위치 (2026-08-08)

사용자 보고: *"TTTT 폴더의 ＋ 를 눌렀는데, 입력창은 목록 맨 위에 뜨고
마우스 커서는 그대로 Guide 폴더 위에 남아 그 줄이 강조된다."*

목록 한참 아래의 줄에서 무언가를 시작했는데 그 결과가 **화면 반대편**에
나타나면, 화면이 두 가지를 동시에 말하게 된다 — 위쪽 막대는 "TTTT 안",
강조된 줄은 "Guide". 사용자는 어느 쪽을 믿어야 할지 알 수 없다.

**규칙 세 가지.**

1. **입력창은 만들어질 자리에 놓는다.** 새 폴더 입력은 목록의 한 줄로
   부모 폴더 **바로 아래**, 한 단계 들여써서 놓는다. 들여쓰기가 부모를
   말해 주므로 "어디에 만들어지나"를 글로 설명할 필요가 없다.
   (`MapBrowser` 의 `Row` 에 `kind: 'newFolder'` 를 둔 이유)
2. **입력 중에는 hover 강조를 끈다.** 커서는 시작 지점에 남아 있으므로,
   그 줄이 강조되면 목적지를 잘못 말한다. `mm-rows-editing` 을 목록
   컨테이너에 붙이면 hover 만 죽고 선택 표시(`aria-selected`)는 남는다.
   **대상 줄**은 계속 강조해 목적지를 못 박는다.
3. **접혀 있으면 펼친다.** 대상 폴더가 접힌 채면 입력창만 덩그러니
   보인다. 열어서 기존 하위와 함께 보여야 "여기에 추가된다"가 분명해진다.

### 5-1-3. Esc 는 **안쪽부터** 닫는다 (2026-08-08)

같은 보고를 고치다 발견한 버그: 새 폴더 이름을 입력하다 Esc 를 누르면
**문서함이 통째로 닫혔다.** 화면 전체에 `Escape → onClose()` 핸들러
하나만 있었기 때문이다. 검색어를 지우려 눌러도 마찬가지였다.

겹쳐 있는 것은 **가장 안쪽부터** 하나씩 닫는다:

```tsx
const onKey = (e: KeyboardEvent) => {
  if (e.key !== 'Escape') return;
  if (newFolder) { setNewFolder(null); return; }  // 1) 입력 취소
  if (query) { setQuery(''); return; }            // 2) 검색어 지우기
  onClose();                                       // 3) 화면 닫기
};
```

처리는 **한 곳에서만** 한다. 입력마다 각자 Esc 를 처리하면 window
핸들러와 이중으로 동작해(입력도 닫고 화면도 닫고) 같은 버그가 다시
난다. 새 화면에 Esc 를 붙일 때는 "지금 열려 있는 것이 무엇인지" 목록을
먼저 세우고 순서대로 검사한다.

### 5-1-4. 겹치는 레이어는 **순서를 먼저 정한다** (2026-08-09)

노드 편집 오버레이는 SVG 밖 HTML(`zIndex: 1000`)인데 코드 블록 모달이
`200` 이라, 창을 열면 **편집 중이던 노드 글자와 툴바가 창 위로 비쳤다**.

앱의 순서(현재):

| 레이어 | zIndex |
|---|---|
| 일반 다이얼로그(저장·폴더 고르기·사용자 메뉴) | 220~240 |
| 상단 안내 배너 | 300 |
| **노드 편집 오버레이**(SVG 밖 HTML) | 1000 |
| **편집 중 뜨는 모달**(코드 블록 창) | 1200 |

두 가지를 지킨다.

1. **모달은 자기가 덮어야 할 것보다 위**여야 한다. 새 모달을 만들 때
   "이게 뜨는 동안 화면에 무엇이 떠 있나"를 먼저 세고 그보다 위로 둔다.
2. **모달이 뜨면 그 위에 떠 있던 부속 UI는 감춘다** — 서식 툴바·팝오버는
   모달 밖(원래 자리)에 떠 있어 모달을 가리고, 그때는 쓸 수도 없다.

## 6. Zustand Store 규칙

```typescript
// ✅ Store는 slice 단위로 분리, 하나의 파일에 하나의 store
// Store 목록 (8개): documentStore, editorUiStore, viewportStore,
//   interactionStore, autosaveStore, cloudStore, authStore, aiSettingsStore
// 참조: docs/90-architecture/system-architecture.md,
//       docs/03-editor-core/state-architecture.md
import { create } from 'zustand';

// ✅ immer 미사용 — 불변 갱신은 스프레드 + 재귀 헬퍼(mutateNode)로 한다.
//    (구조 공유가 undo 스냅샷 메모리 효율의 전제 — 12-history-undo-redo.md)
export const useDocumentStore = create<DocumentState>((set, get) => ({
  map: SAMPLE_ROADMAP,
  updateNodeText: (nodeId, text) =>
    set((state) => ({
      map: mutateNode(state.map, nodeId, (n) => ({ ...n, text })),
    })),
}));

// ❌ 금지: Store에서 직접 API 호출
// Store는 순수 상태 관리만, API 호출은 hook 또는 service에서
```

---

## 7. API 클라이언트 규칙

```typescript
// ✅ 모든 서버 호출은 services/cloud/apiClient.ts 의 cloudApi 로 중앙 관리
// apps/frontend/src/services/cloud/apiClient.ts
import { cloudApi, CloudError } from '@/services/cloud/apiClient';

const maps = await cloudApi.listMaps();
await cloudApi.saveDocument(mapId, { doc, title, keepVersion, editSession });

// ❌ 금지: 컴포넌트 내부에서 직접 fetch 호출
function MyComponent() {
  fetch('/v1/maps').then(...); // X — cloudApi 에 함수를 추가할 것
}
```

### 에러 처리
```typescript
// cloudApi 의 모든 함수는 실패 시 CloudError 를 throw 한다
// (상태 코드 + 서버 메시지 — 409 "이미 있습니다" 안내 등에 그대로 사용)
export class CloudError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

// 컴포넌트에서 try/catch 로 처리 — 로딩·에러 표시는 컴포넌트 로컬 state
// (서버 상태 캐시 라이브러리 미도입 — docs/05-implementation/state-management.md)
```

---

## 8. NestJS 규칙

```typescript
// ✅ DTO에 class-validator 사용
import { IsString, MaxLength, IsOptional } from 'class-validator';

export class CreateMapDto {
  @IsString()
  @MaxLength(255)
  title: string;
}

// ✅ Controller는 얇게 — 비즈니스 로직은 Service에
@Post()
async create(@Body() dto: CreateMapDto, @CurrentUser() user: User) {
  return this.mapsService.create(user.id, dto);
}

// ❌ Controller에 비즈니스 로직 금지
@Post()
async create(@Body() dto: CreateMapDto) {
  // DB 직접 접근, 복잡한 로직 — X
}
```

---

## 9. Supabase 사용 규칙

```typescript
// ✅ 서버(NestJS)에서는 Service Key 사용
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!  // Service Key — 서버 전용
);

// ✅ 클라이언트(React)에서는 Anon Key + RLS로 보호
const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_ANON_KEY!  // Anon Key만 클라이언트 노출 허용
);

// ❌ 절대 금지: Service Key를 클라이언트 코드에 포함
const supabase = createClient(url, process.env.SUPABASE_SERVICE_KEY!); // 클라이언트에서 절대 금지
```

---

## 10. 코드 스타일

> **ESLint·Prettier 설정 파일은 아직 리포에 없다** — 아래 규칙은 도구
> 강제가 아니라 **규약으로만 유지**한다 (코드 작성 시 준수, 리뷰에서
> 확인). 설정 파일 도입은 백로그. 예외적으로 뷰어 JS(exportHtml 템플릿
> 문자열)는 내보낸 스크립트에 `eslint no-undef` 정적 검사를 수동으로
> 돌린다 (test-catalog.md §3 참조).

### ESLint 규약 (도입 시 기준)
```json
{
  "rules": {
    "no-console": "warn",
    "no-debugger": "error",
    "@typescript-eslint/no-explicit-any": "error",
    "@typescript-eslint/no-non-null-assertion": "warn",
    "react-hooks/exhaustive-deps": "error"
  }
}
```

### Prettier 규약 (도입 시 기준)
```json
{
  "semi": true,
  "singleQuote": true,
  "tabWidth": 2,
  "trailingComma": "es5",
  "printWidth": 100
}
```

---

## 11. Git 커밋 메시지 규칙

```
feat: 새 기능 추가
fix: 버그 수정
docs: 문서 변경
refactor: 리팩토링 (기능 변경 없음)
test: 테스트 추가/수정
chore: 빌드, 설정 변경

예시:
feat: NODE-03 자식 노드 생성 단축키 구현
fix: Autosave debounce 타이머 중복 실행 버그 수정
docs: db-schema.md Supabase RLS 정책 추가
```

---

## 12. WebSocket / 협업 이벤트 네이밍 규칙 (V1~)

협업 기능(`25-map-collaboration.md`) 구현 시 WebSocket 이벤트 이름은 아래 규칙을 따른다:

```
{도메인}:{동작}           예: map:patch, node:editing:started
{도메인}:{동작}:{상태}    예: node:editing:started, node:editing:ended
```

```typescript
// ✅ 서버 → 클라이언트 이벤트 (Redis Pub/Sub 경유)
const WS_EVENTS = {
  MAP_PATCH:              'map:patch',
  NODE_EDITING_STARTED:   'node:editing:started',
  NODE_EDITING_ENDED:     'node:editing:ended',
  TRANSLATION_READY:      'translation:ready',
  EXPORT_COMPLETED:       'export:completed',
  DASHBOARD_REFRESH:      'dashboard:refresh',
  COLLAB_OWNERSHIP_TRANSFERRED: 'collab:ownership_transferred',
} as const;

// ✅ 클라이언트 → 서버 이벤트
const WS_CLIENT_EVENTS = {
  NODE_EDITING_START:  'node:editing:start',
  NODE_EDITING_END:    'node:editing:end',
  PRESENCE_UPDATE:     'presence:update',
  CURSOR_UPDATE:       'cursor:update',
  SELECTION_UPDATE:    'selection:update',
} as const;

// ✅ Supabase Realtime 채널 이름 패턴
// realtime:presence:{mapId}
// realtime:map:{mapId}
```

> 채널 라우팅 전체 규칙: `docs/04-extensions/collaboration/25-map-collaboration.md §14.2`

---

## 13. BullMQ Worker 네이밍 규칙 (V1~)

Worker 클래스와 큐 이름은 아래 규칙을 따른다:

```typescript
// ✅ Queue 이름: kebab-case 소문자
// 큐 목록
const QUEUE_NAMES = {
  AI:           'ai',
  TRANSLATION:  'translation',
  EXPORT:       'export',
  REDMINE_SYNC: 'redmine-sync',   // Redmine 연동 (V1 WBS)
  PUBLISH:      'publish',
  CORE:         'core',            // cleanup / reindex 등 일반 작업
} as const;

// ✅ Worker 클래스명: PascalCase + Worker
// AiWorker, TranslationWorker, ExportWorker, RedmineSyncWorker

// ✅ Job 클래스명: PascalCase + Job
// CreateRedmineIssueJob, TranslateNodeJob, ExportMapJob

// ✅ Worker 파일 위치 (VM-05 src/worker/)
// worker-ai.ts       → AiWorker
// worker-translation.ts → TranslationWorker
// worker-export.ts   → ExportWorker
// worker-redmine.ts  → RedmineSyncWorker (V1 WBS)
```

---

## 14. 번역 관련 코딩 규칙 (V2~)

언어 감지에는 `franc-min` 라이브러리를 사용한다 (`23-node-translation.md §16` 참조):

```typescript
// ✅ franc-min 사용 (경량 언어 감지, 82개 언어 지원)
import { franc } from 'franc-min';

// ✅ ISO 639-3 → ISO 639-1 변환 필수 (franc은 639-3 반환)
// 예: 'kor' → 'ko', 'eng' → 'en', 'jpn' → 'ja'

// ✅ 3자 미만 텍스트는 franc 호출 없이 fallback 처리
// ✅ franc이 'und' 반환 시 작성자 preferredLanguage로 fallback

// ✅ text_hash 생성 — SHA-256 앞 128자
import { createHash } from 'crypto';
function makeTextHash(text: string): string {
  return createHash('sha256').update(text).digest('hex').substring(0, 128);
}

// ✅ Jitter TTL — Thundering Herd 방지
const TTL_BASE   = 7200;   // 2시간
const TTL_JITTER = 600;    // ±10분
const ttl = TTL_BASE + Math.floor(Math.random() * TTL_JITTER);
```

---

## 15. Redmine 연동 규칙 (V1 WBS)

Redmine API Key는 반드시 AES-256-GCM으로 암호화 저장한다 (`31-redmine-integration.md §16` 참조):

```typescript
// ✅ 암호화 키는 환경변수 REDMINE_ENCRYPTION_KEY에서만 읽음
// ✅ 저장 형식: base64(iv) + '.' + base64(authTag) + '.' + base64(ciphertext)
// ✅ GET 응답 시 반드시 '*****' 마스킹 처리
// ❌ 클라이언트에 복호화된 API Key 절대 노출 금지

// sync_status 상태 상수
const SYNC_STATUS = {
  SYNCED:  'synced',   // 정상 동기화 완료
  PENDING: 'pending',  // BullMQ 큐 대기 중
  ERROR:   'error',    // 실패, 자동 재시도 대기 (최대 3회)
  FAILED:  'failed',   // 3회 모두 실패 — 수동 처리 필요
} as const;

// BullMQ 재시도: 최대 3회, Exponential Backoff (1s → 2s → 4s)
```

---

## 16. AI 코드 생성 시 주의사항

AI(Claude/Codex)에게 코드 생성을 요청할 때 반드시 포함할 내용:

1. **관련 문서 첨부**: 해당 Task의 입력 문서 (`codex-task-plan.md` 참조)
2. **타입 파일 첨부**: `02-domain/domain-models.md` (NodeObject, MapObject 등 통합 타입)
3. **기존 코드 첨부**: 연결되는 Store / Hook / API 클라이언트
4. **이 문서 첨부**: coding-conventions.md를 항상 포함

```
// AI에게 전달하는 프롬프트 예시:
"아래 문서를 참고해서 [기능명]을 구현해줘.
- coding-conventions.md (코드 스타일 규칙)
- domain-models.md (NodeObject, MapObject 타입)
- api-spec.md (API 명세)
strict TypeScript, named export, class-validator DTO 사용."
```
