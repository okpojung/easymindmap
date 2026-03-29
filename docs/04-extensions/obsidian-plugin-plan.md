# easymindmap — Obsidian Plugin 설계

## 개요

Obsidian과 연동하여 **Markdown 기반 Mindmap 생성 및 편집**을 지원하는 플러그인.

핵심 방향:

```
Markdown ↔ NodeObject[]  양방향 변환
```

기존 export 파이프라인(`NodeObject[] → Markdown → Standalone HTML`)을  
역방향으로도 동작시켜, Obsidian note를 곧바로 맵으로 열거나 맵을 note로 저장한다.

---

## 목표 기능

### Markdown → Mindmap (1차)

Obsidian note의 heading / list 구조를 NodeObject[]로 변환한다.

**입력 예시:**

```
# 프로젝트 계획
## 기획
### 요구사항 분석
### 경쟁사 조사
## 개발
### 프론트엔드
### 백엔드
## 배포
```

**변환 결과:**

```
root: "프로젝트 계획"
  ├ "기획"
  │   ├ "요구사항 분석"
  │   └ "경쟁사 조사"
  ├ "개발"
  │   ├ "프론트엔드"
  │   └ "백엔드"
  └ "배포"
```

### Mindmap → Markdown (1차)

맵 NodeObject[] 구조를 Obsidian outline(heading 계층)으로 직렬화한다.

### 실시간 연동 (3차)

* Obsidian note 저장 이벤트 → 맵 자동 갱신
* 맵 수정 → note 자동 반영

---

## 시스템 구조

```
Obsidian Vault (*.md files)
      ↓  read / watch
Obsidian Plugin  (packages/obsidian-plugin)
      ↓
MarkdownAdapter  (packages/markdown-adapter)
      ↓  parse() / serialize()
NodeObject[]  →  Command Engine  →  DocumentStore
      ↓
Editor UI (React + SVG)
```

---

## Canonical Format

> **결정:** Markdown을 Canonical Format으로 사용한다.

| 방향 | 처리 |
| --- | --- |
| Obsidian → easymindmap | `MarkdownAdapter.parse(md)` → `NodeObject[]` |
| easymindmap → Obsidian | `MarkdownAdapter.serialize(nodes)` → `string` |

기존 export의 Markdown 출력 포맷과 **완전히 동일한 포맷**을 사용한다.  
`serialize()`는 `ai-mindmap-generation.md` 의 Markdown 출력 스펙을 그대로 따른다.

---

## Markdown 변환 규칙

### Heading 기반 (기본)

| Markdown | NodeObject depth |
| --- | --- |
| `#` | 0 (root) |
| `##` | 1 |
| `###` | 2 |
| `####` | 3 |

### List 기반

Heading 없이 List만 있는 경우에도 변환 지원:

```
- A
  - B
    - C
      - D
```

→ depth 0~3 tree 구조

### 혼합 모드

Heading 아래에 List가 오면 해당 Heading 노드의 자식으로 처리:

```
## 기획
- 요구사항 분석
  - 인터뷰
  - 설문
- 경쟁사 조사
```

---

## Metadata 처리

### Frontmatter (권장)

```
---
easymindmap:
  layoutType: radial-bidirectional
  theme: default
tags: [AI, 중요]
---
```

### Node inline comment (2차)

```
## 기획 <!-- { "collapsed": true } -->
```

---

## NodeObject 확장

기존 `NodeObject` (docs/02-domain/node-model.md) 에  
`externalMeta` 필드를 통해 Markdown 소스 정보를 저장한다.  
Redmine 연동과 동일한 `externalMeta` 확장 패턴을 사용한다.

```
type MarkdownMeta = {
  sourceType: 'markdown';
  filePath: string;        // vault 내 상대 경로
  headingLevel?: number;   // 1 ~ 6
  blockId?: string;        // Obsidian block reference ID
  listIndent?: number;     // List 기반 변환 시 들여쓰기 레벨
  lineNumber?: number;     // 원본 파일 내 줄 번호
};
```

---

## MarkdownAdapter 인터페이스

```
interface MarkdownAdapter {
  // Markdown → NodeObject[]
  parse(markdown: string, options?: ParseOptions): NodeObject[];

  // NodeObject[] → Markdown
  serialize(nodes: NodeObject[], options?: SerializeOptions): string;

  // 특정 노드 텍스트만 부분 업데이트
  updatePartial(markdown: string, nodeId: string, newText: string): string;

  // 파싱 가능 여부 확인
  validate(markdown: string): ValidationResult;
}

type ParseOptions = {
  mode: 'heading' | 'list' | 'auto';  // 기본: auto
  maxDepth?: number;
  ignoreCodeBlocks?: boolean;
};

type SerializeOptions = {
  headingStyle: 'atx' | 'setext';
  includeMetadata?: boolean;
};

type ValidationResult = {
  valid: boolean;
  warnings: string[];
  errors: string[];
};
```

---

## Command 연동

Obsidian에서 맵으로 import 시 반드시 **Command Engine**을 통한다.

```
// Obsidian note 열기 → 맵 import
const markdown = await obsidianVault.read(file);
const nodes = markdownAdapter.parse(markdown);

commandEngine.dispatch({
  type: 'IMPORT_EXTERNAL_NODES',
  payload: { nodes, sourceType: 'markdown' }
});

// 맵 → Obsidian note 저장
const nodes = documentStore.getNodes();
const markdown = markdownAdapter.serialize(nodes);
await obsidianVault.write(filePath, markdown);
```

---

## Obsidian Plugin 기능

### 기본 기능

| 기능 | 설명 |
| --- | --- |
| Note → Mindmap | 현재 note를 easymindmap에서 열기 |
| Mindmap → Note | 맵 내용을 현재 note에 저장 |
| 새 맵 생성 | note에서 빈 맵 생성 후 연결 |

### UI

| UI 요소 | 설명 |
| --- | --- |
| Command Palette | `easymindmap: Open as Mindmap` 등록 |
| Side Panel View | 맵 미리보기 (read-only) |
| 노드 클릭 | 해당 note의 heading 위치로 이동 |
| Ribbon 아이콘 | 빠른 맵 열기 버튼 |

### Settings

```
type ObsidianPluginSettings = {
  serverUrl: string;           // easymindmap 서버 주소
  apiToken: string;            // Supabase Auth 토큰
  defaultLayout: LayoutType;   // 기본 레이아웃 (node-model.md 참조)
  syncMode: SyncMode;          // read-only | manual | live
  autoOpenOnNote: boolean;
};
```

---

## Sync 정책

| 모드 | 설명 | 구현 시기 |
| --- | --- | --- |
| `read-only` | Obsidian → 맵 보기만 | 1차 |
| `manual` | \[저장] 버튼으로 양방향 | 2차 |
| `live` | vault 파일 변경 감지 → 자동 업데이트 | 3차 |

> live 모드는 Obsidian의 `vault.on('modify')` 이벤트 활용.

---

## 패키지 구조

```
packages/
  core/                        # 기존 NodeObject, Command Engine
  markdown-adapter/
    src/
      MarkdownAdapter.ts        # 구현체
      headingParser.ts          # Heading 기반 파싱
      listParser.ts             # List 기반 파싱
      markdownSerializer.ts     # NodeObject[] → Markdown
      metadataParser.ts         # Frontmatter / inline comment
      types.ts
    index.ts
  obsidian-plugin/
    src/
      main.ts                   # Plugin entry point
      MindmapView.ts            # Side panel view
      commands.ts               # Command palette 등록
      settings.ts               # Plugin 설정 UI
    manifest.json
    styles.css
```

---

## 기존 파이프라인과의 관계

기존 easymindmap export 파이프라인:

```
NodeObject[]
  ↓  markdown-export.md 참조
Markdown
  ↓
Markmap Renderer
  ↓
Standalone HTML
```

Obsidian 연동은 이 파이프라인의 **역방향 입력**을 추가하는 것:

```
Obsidian note (Markdown)
  ↓  MarkdownAdapter.parse()
NodeObject[]
  ↓
Editor
```

`MarkdownAdapter.serialize()` 출력은 `markdown-export.md` 의 포맷과 동일해야 한다.

---

## MVP 제외

* 실시간 양방향 sync (live mode)
* block-level 정밀 sync
* 충돌 자동 해결
* Obsidian Graph View 연동
* Dataview plugin 연동

---

## 확장 로드맵

| 단계 | 기능 |
| --- | --- |
| 1 | Markdown import/export (CLI/API) |
| 2 | Obsidian Plugin viewer (read-only) |
| 3 | manual-sync (양방향 저장) |
| 4 | live sync |
| 5 | block-level sync |
