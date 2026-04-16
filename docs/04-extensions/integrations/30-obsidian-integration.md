# 30. Obsidian Integration
## OBSIDIAN_INTEGRATION

* 문서 버전: v1.0
* 작성일: 2026-04-16
* 참조: `docs/04-extensions/import-export/20-export.md`, `docs/04-extensions/import-export/21-import.md`

---

### 1. 기능 목적

* easymindmap과 **Obsidian Vault 간 Markdown 기반 양방향 동기화**를 지원하는 기능
* Obsidian에서 작성한 노트를 마인드맵으로 가져오고, 마인드맵을 Obsidian 노트로 내보내기
* Obsidian 플러그인 또는 Vault 폴더 연동으로 파일 기반 동기화

---

### 2. 기능 범위

* 포함:
  * Obsidian → easymindmap: Markdown 가져오기 (OBS-01)
  * easymindmap → Obsidian: Markdown 내보내기 (OBS-02)
  * Vault 폴더 연결 설정 (OBS-03)
  * 변경 감지 및 동기화 (OBS-04, 후순위)
  * Wikilink 처리 (OBS-05, 후순위)

* 제외:
  * 실시간 파일 감시 (파일 시스템 이벤트 기반, MVP 제외)
  * Obsidian 플러그인 직접 개발 (후순위)
  * Obsidian Dataview 호환 (후순위)

---

### 3. 세부 기능 목록

| 기능ID    | 기능명             | 설명                                 | 주요 동작         |
| ------- | --------------- | ---------------------------------- | ------------- |
| OBS-01  | Obsidian → 맵   | Obsidian Markdown 파일을 맵으로 가져오기     | 파일 선택 가져오기    |
| OBS-02  | 맵 → Obsidian   | 맵을 Obsidian 호환 Markdown으로 내보내기     | Markdown 내보내기 |
| OBS-03  | Vault 연결 설정    | Obsidian Vault 경로 / API 연결 설정       | 설정 UI         |
| OBS-04  | 변경 감지 동기화     | Vault 파일 변경 → 자동 맵 업데이트 (후순위)     | Polling/Watch  |
| OBS-05  | Wikilink 처리    | `[[링크]]` → 노드 연결 또는 하이퍼링크로 변환 (후순위) | 링크 변환         |

---

### 4. 기능 정의 (What)

#### 4.1 Obsidian Markdown 호환 형식

```markdown
# 프로젝트 계획 (Root 노드)

## 1단계: 요구사항 (Depth 1)
### 기능 요구사항 (Depth 2)
### 비기능 요구사항 (Depth 2)

## 2단계: 설계 (Depth 1)
### DB 설계 (Depth 2)
### API 설계 (Depth 2)

> [!NOTE] 노드 Note 표시
> 상세 내용은 여기에 작성

```bash
# 코드 블록도 note로 가져오기
npm install
```

```

#### 4.2 Obsidian 전용 요소 처리

| Obsidian 요소        | easymindmap 처리                          |
| ------------------ | --------------------------------------- |
| `[[Wikilink]]`     | 하이퍼링크 또는 노드 연결 (OBS-05)                |
| `#태그`             | 태그 자동 생성 및 할당                           |
| `> [!NOTE]` callout | 노드 Note로 변환                            |
| frontmatter (YAML) | 맵 메타데이터로 파싱 (제목, 날짜)                   |
| `- [ ] checklist`  | Note 체크리스트 블록으로 변환                      |

#### 4.3 Vault 연결 방식 (OBS-03)

* **수동 파일 업로드**: Obsidian에서 `.md` 파일 내보내기 → easymindmap 가져오기 UI
* **Vault API 연결** (후순위): Obsidian Local REST API 플러그인 경유

---

### 5. 동작 방식 (How)

#### 5.1 가져오기 (OBS-01)

```
Obsidian Vault에서 Markdown 파일 선택 또는 내보내기
    │
    ▼
easymindmap > 가져오기 > Markdown 파일 선택
    │
    ▼
파싱 (헤딩 구조 + Obsidian 전용 요소 처리)
    │
    ▼
미리보기 → 확정 → 노드 트리 생성
```

#### 5.2 내보내기 (OBS-02)

```
맵 > 내보내기 > Markdown
    │
    ▼
노드 트리 → Obsidian 호환 Markdown 변환
  - 헤딩 계층 구조
  - Note → `> [!NOTE]` callout
  - 태그 → `#태그` inline
    │
    ▼
.md 파일 다운로드 → Obsidian Vault에 저장
```

---

### 6. 규칙 (Rule)

* 지원 형식: Obsidian Flavored Markdown (CommonMark 기반)
* Wikilink는 MVP에서 하이퍼링크로 변환 (노드 연결은 2단계)
* frontmatter의 `title` 필드 → Root 노드 text로 사용
* 내보내기 시 태그는 `#tagName` inline 표기
* 코드 블록 언어 정보 보존 (```bash, ```python 등)

---

### 7. 예외 / 경계 (Edge Case)

* **깊이 초과 헤딩 (H7+)**: depth 5로 flat 처리
* **Wikilink 순환 참조**: 경고 메시지, 링크만 텍스트로 변환
* **frontmatter 파싱 실패**: frontmatter 무시, 나머지 내용 처리

---

### 8. 권한 규칙

| 역할      | 가져오기 | 내보내기 |
| ------- | ----- | ----- |
| creator | ✅     | ✅     |
| editor  | ✅     | ✅     |
| viewer  | ❌     | ✅     |

---

### 9. DB 영향

* `nodes` — 가져온 노드 트리
* `node_notes` — Obsidian callout/코드 블록 저장
* `tags` — Obsidian `#태그` 자동 생성

---

### 10. API 영향

* `POST /maps/{mapId}/import` — Obsidian Markdown 가져오기 (기존 Import API 공유)
* `POST /maps/{mapId}/export?format=obsidian` — Obsidian 호환 Markdown 내보내기

---

### 11. 연관 기능

* IMPORT (`21-import.md`)
* EXPORT (`20-export.md`)
* TAG (`docs/03-editor-core/search/15-tag.md`)

---

### 12. 구현 우선순위

#### MVP
* OBS-01 파일 가져오기 (IMPORT 기능 확장)
* OBS-02 Obsidian 호환 Markdown 내보내기

#### 2단계
* OBS-03 Vault API 연결 설정
* OBS-05 Wikilink 노드 연결 변환

#### 3단계
* OBS-04 변경 감지 자동 동기화

---

### 13. 시스템 구조

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

### 14. MarkdownAdapter 인터페이스

```typescript
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

#### 14.1 파싱 모드 (ParseOptions.mode)

| 모드 | 설명 |
| --- | --- |
| `heading` | Heading(`#` ~ `######`) 계층 구조만 파싱 |
| `list` | Heading 없이 List(`-`, `*`, `1.`) 들여쓰기 구조만 파싱 |
| `auto` | Heading이 있으면 heading 기반, 없으면 list 기반으로 자동 선택 (기본값) |

혼합 모드: Heading 아래에 List가 오면 해당 Heading 노드의 자식으로 처리:

```markdown
## 기획
- 요구사항 분석
  - 인터뷰
  - 설문
- 경쟁사 조사
```

---

### 15. Markdown 변환 규칙

#### 15.1 Heading 기반 (기본)

| Markdown | NodeObject depth |
| --- | --- |
| `#` | 0 (root) |
| `##` | 1 |
| `###` | 2 |
| `####` | 3 |

#### 15.2 List 기반

Heading 없이 List만 있는 경우에도 변환 지원:

```
- A
  - B
    - C
      - D
```

→ depth 0~3 tree 구조

---

### 16. Metadata 처리

#### 16.1 Frontmatter (권장)

```yaml
---
easymindmap:
  layoutType: radial-bidirectional
  theme: default
tags: [AI, 중요]
---
```

* `easymindmap.layoutType` → 맵 레이아웃 타입으로 적용
* `easymindmap.theme` → 맵 테마로 적용
* `tags` → 루트 노드 태그로 가져오기

#### 16.2 Node inline comment (2차)

노드별 개별 메타데이터는 heading 뒤 inline HTML 주석으로 표현:

```markdown
## 기획 <!-- { "collapsed": true } -->
```

---

### 17. NodeObject 확장 (externalMeta)

기존 `NodeObject`에 `externalMeta` 필드를 통해 Markdown 소스 정보를 저장한다.

```typescript
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

### 18. ObsidianPluginSettings 타입

```typescript
type ObsidianPluginSettings = {
  serverUrl: string;           // easymindmap 서버 주소
  apiToken: string;            // Supabase Auth 토큰
  defaultLayout: LayoutType;   // 기본 레이아웃
  syncMode: SyncMode;          // read-only | manual | live
  autoOpenOnNote: boolean;
};
```

---

### 19. Sync 정책

| 모드 | 설명 | 구현 시기 |
| --- | --- | --- |
| `read-only` | Obsidian → 맵 보기만 | 1차 |
| `manual` | [저장] 버튼으로 양방향 동기화 | 2차 |
| `live` | vault 파일 변경 감지 → 자동 업데이트 | 3차 |

> live 모드는 Obsidian의 `vault.on('modify')` 이벤트 활용.

---

### 20. Command Engine 연동

Obsidian에서 맵으로 import 시 반드시 **Command Engine**을 통한다.

```typescript
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

### 21. Obsidian Plugin UI 기능

| UI 요소 | 설명 |
| --- | --- |
| Command Palette | `easymindmap: Open as Mindmap` 등록 |
| Side Panel View | 맵 미리보기 (read-only) |
| 노드 클릭 | 해당 note의 heading 위치로 이동 |
| Ribbon 아이콘 | 빠른 맵 열기 버튼 |

---

### 22. 패키지 구조

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

### 23. MVP 제외 항목

* 실시간 양방향 sync (live mode)
* block-level 정밀 sync
* 충돌 자동 해결
* Obsidian Graph View 연동
* Dataview plugin 연동

---

### 24. 확장 로드맵 (Phase 1~5)

| 단계 | 기능 |
| --- | --- |
| 1 | Markdown import/export (CLI/API) |
| 2 | Obsidian Plugin viewer (read-only) |
| 3 | manual-sync (양방향 저장) |
| 4 | live sync |
| 5 | block-level sync |

---

### 25. Canonical Format

> **결정:** Markdown을 Canonical Format으로 사용한다.

| 방향 | 처리 |
| --- | --- |
| Obsidian → easymindmap | `MarkdownAdapter.parse(md)` → `NodeObject[]` |
| easymindmap → Obsidian | `MarkdownAdapter.serialize(nodes)` → `string` |

기존 export의 Markdown 출력 포맷과 **완전히 동일한 포맷**을 사용한다.  
`serialize()`는 `ai-mindmap-generation.md` 의 Markdown 출력 스펙을 그대로 따른다.

---

### 26. 플러그인 기본 기능

| 기능 | 설명 |
| --- | --- |
| Note → Mindmap | 현재 note를 easymindmap에서 열기 |
| Mindmap → Note | 맵 내용을 현재 note에 저장 |
| 새 맵 생성 | note에서 빈 맵 생성 후 연결 |

---

### 27. 기존 파이프라인과의 관계

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
