# easymindmap — Coding Conventions

> AI(Claude/Codex)가 코드를 생성할 때 반드시 따라야 할 규칙.  
> 이 문서를 프롬프트에 첨부하거나 시스템 프롬프트로 사용한다.

---

## 1. 언어 & 런타임

| 항목 | 선택 |
|------|------|
| 언어 | TypeScript (strict mode) |
| Node.js | 20 LTS 이상 |
| 패키지 매니저 | pnpm |

---

## 2. 디렉토리 구조 규칙

### Frontend (`/frontend/src/`)

```
editor/
  components/     # React 컴포넌트 (.tsx)
  engine/         # 순수 로직, React 의존 없음 (.ts)
  stores/         # Zustand store (.ts)
  hooks/          # React custom hooks (.ts)
  commands/       # Command 패턴 (.ts)
  autosave/       # Autosave 매니저 (.ts)
pages/            # 라우트 페이지 컴포넌트
api/              # API 클라이언트 함수
types/            # 공통 TypeScript 타입
utils/            # 순수 유틸리티 함수
```

### Backend (`/backend/src/`)

```
{module}/
  {module}.module.ts
  {module}.controller.ts
  {module}.service.ts
  {module}.dto.ts        # Request/Response DTO
  {module}.entity.ts     # TypeORM Entity (Supabase 사용 시 생략 가능)
common/
  guards/
  filters/
  interceptors/
  decorators/
```

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

### 필수 설정 (`tsconfig.json`)
```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true
  }
}
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

## 6. Zustand Store 규칙

```typescript
// ✅ Store는 slice 단위로 분리, 하나의 파일에 하나의 store
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

type DocumentStore = {
  nodes: Record<string, NodeObject>;
  createNode: (parentId: string, text: string) => void;
};

export const useDocumentStore = create<DocumentStore>()(
  immer((set) => ({
    nodes: {},
    createNode: (parentId, text) => set((state) => {
      const newNode: NodeObject = { /* ... */ };
      state.nodes[newNode.id] = newNode;
    }),
  }))
);

// ❌ 금지: Store에서 직접 API 호출
// Store는 순수 상태 관리만, API 호출은 hook 또는 service에서
```

---

## 7. API 클라이언트 규칙

```typescript
// ✅ 모든 API 호출은 /api/ 디렉토리에서 중앙 관리
// api/mapsApi.ts
export async function createMap(title: string): Promise<MapObject> {
  const res = await fetch('/api/v1/maps', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  });
  if (!res.ok) throw new ApiError(res.status, await res.json());
  return res.json();
}

// ❌ 금지: 컴포넌트 내부에서 직접 fetch 호출
function MyComponent() {
  fetch('/api/v1/maps').then(...); // X
}
```

### 에러 처리
```typescript
export class ApiError extends Error {
  constructor(
    public statusCode: number,
    public body: unknown
  ) {
    super(`API Error ${statusCode}`);
  }
}

// 모든 API 함수는 ApiError를 throw
// 컴포넌트에서 try/catch로 처리
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

### ESLint 설정 (주요 규칙)
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

### Prettier 설정
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

## 12. AI 코드 생성 시 주의사항

AI(Claude/Codex)에게 코드 생성을 요청할 때 반드시 포함할 내용:

1. **관련 문서 첨부**: 해당 Task의 입력 문서 (`codex-task-plan.md` 참조)
2. **타입 파일 첨부**: `02-domain/node-model.md` 또는 관련 타입 정의
3. **기존 코드 첨부**: 연결되는 Store / Hook / API 클라이언트
4. **이 문서 첨부**: coding-conventions.md를 항상 포함

```
// AI에게 전달하는 프롬프트 예시:
"아래 문서를 참고해서 [기능명]을 구현해줘.
- coding-conventions.md (코드 스타일 규칙)
- node-model.md (NodeObject 타입)
- api-spec.md (API 명세)
strict TypeScript, named export, class-validator DTO 사용."
```
