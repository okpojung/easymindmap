import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { FoldersService } from '../folders/folders.service';
import { FocusService } from '../maps/focus.service';
import { MapsService } from '../maps/maps.service';
import { PRO, type ProContract } from '../pro/pro.contract';
import { AppendError, appendSubtree, findByPath, parseFragment } from './append-to-map';
import { checkItems, listCheckable } from './check-items';
import { DocShapeError, docToEmm, mapFromDoc } from './doc-to-emm';
import { EmmParseError, emmToSnapshot, titleFromSnapshot } from './emm-to-doc';
import { TemplateError, applyLevelLayouts, templateFor } from './map-template';
import { mapCenters, type MindNode, type SampleMap } from '../emm/model';
import { GithubClient, GithubError, GithubWriter, mapLimit } from './github-client';
import {
  GithubDocsError, IdGen, applyUpdate, buildDocsMap, collectFileNodes, detectDocsDir, listSome, parseRepoRef, planUpdate,
  readFileMeta, readSource, resolveScope, selectDocFiles, settleByCommit, type DocInput, type DocsSource, type FileCommit,
  type FileNodeRef, type RemoteFile, type UpdateScope,
} from './github-docs';
import {
  applyPushToMap, clearPendingIn, collectNewFiles, diffFileNode, formatPushPreview, pendingPrOf, planCode, pushAllowed,
  type FileChange, type PushedFile,
} from './github-push';
import { AttachmentsService } from '../attachments/attachments.service';
import { BlockedUrlError, RemoteFetchError, fetchRemotePdf } from '../attachments/remote-image';
import { PdfError, readPdf } from './pdf-parse';
import { buildPdfMap, cleanPdfTitle, linesFromPages, type Structure } from './pdf-map';
import { extractPdfImages, type PdfImagesResult } from './pdf-image';
import {
  YoutubeClient, YoutubeError, buildTranscript, formatTranscriptResult, parseChapters, parseStartParam, parseVideoId, pickTrack,
} from './youtube';

/**
 * MCP 가 AI 에게 주는 **도구 목록**과 그 실행.
 * 설계: docs/04-extensions/ai/mcp-connector.md §2
 *
 * 도구는 기존 `/v1` 엔드포인트를 **얇게 감싸기만 한다.** 쿼터·권한·이름
 * 중복 판정 같은 규칙은 전부 `MapsService` 안에 이미 있고, 여기서 다시
 * 만들지 않는다 — 두 벌이 되면 반드시 어긋난다(§2 머리말).
 *
 * 1단계 `create_map`(§7) + 2단계 `list_maps`·`get_map` + `append_to_map`
 * (2026-09-05) + `check_items`(2026-09-09, §9.12) + GitHub 문서 `import_github_docs`·
 * `update_map_from_github`(2026-09-21, §9.14). **맵을 지우는 도구는 없다**(§2-3).
 * 고치는 것은 셋 — `append_to_map` 은 **덧붙이기만** 하고, `check_items` 는
 * 노드의 **체크박스 한 글자(`[ ]`↔`[x]`)만** 바꾼다. `update_map_from_github` 만
 * 노드를 더하고·바꾸고·지우는데, **자기가 만든 노드**(GitHub 링크가 달린 문서·
 * 폴더 노드와 그 아래 절 노드)만이고 사용자가 손으로 붙인 것은 남긴다(§9.14).
 */

/**
 * 도구 힌트(MCP `annotations`) — 클라이언트가 **확인 창을 띄울지** 정하는 데 쓴다
 * (2026-09-21, ChatGPT 연결 §12). ChatGPT 는 `readOnlyHint` 가 없는 도구를 전부
 * "쓰기" 로 보고 부를 때마다 사용자 확인을 받는다 — 맵 목록·읽기까지 매번 묻게
 * 된다. 읽기만 하는 셋에 `readOnlyHint:true`, 덧붙이기만 하는 것에
 * `destructiveHint:false` 를 단다. 규격에서 `destructiveHint:false` 는 "덧붙이기만
 * 한다" 는 약속이라, **있는 내용을 바꾸는** `check_items`(`[ ]`↔`[x]`)와
 * `update_map_from_github`(노드 삭제)는 파괴적(기본값 true)으로 둔다 — 되돌릴 수
 * 있어도 고치는 것은 고치는 것이다(#534 Codex). GitHub 로 나가는 둘은
 * `openWorldHint:true`.
 */
export interface McpToolAnnotations {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

export interface McpToolDef {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: McpToolAnnotations;
}

/**
 * 도구 설명은 **AI 가 읽는 유일한 사용설명서**다. "무엇을 하는가"보다
 * "언제 부르고 무엇을 넣어야 하는가"를 적는다 — 특히 `markdown` 이
 * 자유 서식이 아니라 **견출 구조**여야 한다는 것.
 */
export const TOOL_DEFS: McpToolDef[] = [
  {
    name: 'create_map',
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    title: 'EasyMindMap 에 새 마인드맵 만들기',
    description:
      '대화 내용을 EasyMindMap 문서함에 **새 마인드맵으로 저장한다.** ' +
      '`markdown` 은 견출(heading) 구조의 마크다운이어야 한다 — ' +
      '`# 중심 주제` 한 줄, 그 아래 `## 가지`, `### 하위 가지` … 로 깊이를 만든다. ' +
      '목록(`- 항목`)은 그 견출의 하위 노드가 되고, 표·코드블록·인용문·' +
      '체크리스트(`- [ ] 항목`)는 그 노드의 본문으로 들어간다. ' +
      '언제나 새 맵이 하나 생긴다 — 기존 맵의 노드 아래에 붙이려면 append_to_map 을 쓴다. ' +
      '`template` 으로 맵 모양(레이아웃)을 고를 수 있다 — 예: "진행트리-트리맵", "트리-진행트리맵", "방사형 양쪽", "시간배치", "계층형", "칸반". ' +
      '사용자가 모양을 말하지 않으면 비워 둔다(앱 기본 = 방사형 양쪽).',
    inputSchema: {
      type: 'object',
      properties: {
        markdown: {
          type: 'string',
          description:
            '맵으로 만들 마크다운. 반드시 `#` 견출로 시작하는 구조여야 한다. '
            + '견출이 하나도 없으면 맵을 만들 수 없다.',
        },
        title: {
          type: 'string',
          description:
            '문서함에 보일 맵 이름. 생략하면 마크다운의 첫 `# 제목` 을 쓴다. '
            + '같은 폴더에 같은 이름이 이미 있으면 거절되므로 다른 이름으로 다시 부른다.',
        },
        block_placement: {
          type: 'string',
          enum: ['node', 'note'],
          description:
            "표·코드블록·인용문·체크리스트를 어디에 넣을지. 'node'(기본) = 노드 본문, "
            + "'note' = 노드에 딸린 노트. 사용자가 따로 말하지 않으면 'node' 로 둔다.",
        },
        code_to_note: {
          type: 'boolean',
          description: '코드블록을 노드로 만들지 않고 **그 노드의 노트(코드)** 로 첨부한다 — 사용자가 "코드는 노트코드로 첨부해줘" 라고 하면 true. 말이 없으면 비운다(노드 내용).',
        },
        long_text_to_note: {
          type: 'integer',
          minimum: 1,
          description: '이 글자 수 **이상**인 문단은 노드로 만들지 않고 **그 노드의 노트(문단)** 로 넣는다 — "긴 문장(300자 이상)은 노트 문단으로" 면 300. 글자 수를 말하지 않으면 300. 말이 없으면 비운다(노드 내용).',
        },
        template: {
          type: 'string',
          description:
            '맵 모양 템플릿. 짧은 ID(TP=트리-진행트리맵(기본) · PT=진행트리-트리맵 · RB=방사형 양쪽 · RR=방사형 오른쪽 · HR=계층형 오른쪽 · KB=칸반 · TM=시간배치 · TR=트리 오른쪽 · PR=진행트리 오른쪽), '
            + '앱 라이브러리 이름("트리-진행트리맵"·"진행트리-트리맵"·"방사형 양쪽"·"시간배치"·"계층형 오른쪽"·"칸반") '
            + '또는 레이아웃 이름(tree-right, process-tree-right, radial-bidirectional, hierarchy-right, timeline, kanban …). 사용자가 "PT 템플릿으로" 라고 하면 그대로 "PT". '
            + '마크다운 안에 ```emm 코드블록으로 `template: progtree-tree` 를 적어도 같다(인자가 있으면 인자가 이긴다).',
        },
      },
      required: ['markdown'],
    },
  },
  {
    name: 'list_maps',
    annotations: { readOnlyHint: true, openWorldHint: false },
    title: 'EasyMindMap 문서함의 맵 목록',
    description:
      '사용자의 EasyMindMap 문서함에 있는 맵 목록을 돌려준다 — 이름 · 맵 id · 폴더 · ' +
      '마지막 수정 시각 · 노드 수. **기존 맵을 이어 쓰거나 내용을 읽으려면 먼저 이것으로 ' +
      '맵 id 를 찾는다**(`get_map` 은 id 로만 연다). `query` 를 주면 이름과 본문에서 찾는다. ' +
      '나에게 공유된 맵도 함께 나오며 "(공유받음)" 으로 표시된다.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '찾을 말. 맵 이름과 노드 본문에서 찾는다. 비우면 최근 수정순 전체.',
        },
        folder: {
          type: 'string',
          description: "폴더 이름으로 좁힌다. 'home' 은 최상위(폴더 없음)만. 비우면 전체.",
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 100,
          description: '최대 몇 개 (기본 20, 최대 100).',
        },
      },
    },
  },
  {
    name: 'get_map',
    annotations: { readOnlyHint: true, openWorldHint: false },
    title: 'EasyMindMap 맵 한 개를 마크다운으로 읽기',
    description:
      '맵 한 개의 내용을 **mmd 마크다운**(Mindmap Markdown — `# 중심 주제` · `## 가지` · `### 하위 가지` … 견출 구조)으로 ' +
      '돌려준다. 대화에서 기존 맵을 읽거나, 이어 쓰거나, 고친 결과를 `create_map` 으로 ' +
      '새 맵으로 저장할 때 쓴다. `map_id` 는 `list_maps` 가 준 값이다. ' +
      '이 도구는 읽기만 한다 — 맵을 바꾸지 않는다.',
    inputSchema: {
      type: 'object',
      properties: {
        map_id: {
          type: 'string',
          description: '`list_maps` 가 돌려준 맵 id (UUID), 또는 `"current"` = 사용자가 앱에서 지금 열어 둔 맵.',
        },
      },
      required: ['map_id'],
    },
  },
  {
    name: 'get_open_map',
    annotations: { readOnlyHint: true, openWorldHint: false },
    title: '사용자가 지금 앱에서 열어 둔 맵과 선택한 노드',
    description:
      '사용자가 EasyMindMap 앱에서 **지금 열어 둔 맵**과 **선택한 노드**를 알려 준다(맵 id · 이름 · 선택 노드 경로). ' +
      '사용자가 "지금 열려 있는 맵" · "선택한 노드 아래에" 처럼 말하면 이것으로 확인하거나, ' +
      '바로 get_map / append_to_map 에 `map_id:"current"`, `parent:"selected"` 를 넣어도 된다. ' +
      '앱이 1분 넘게 조용하면(닫았거나 로그아웃) "열린 맵이 없다" 고 답한다.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'append_to_map',
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    title: 'EasyMindMap 기존 맵의 노드 아래에 가지 붙이기',
    description:
      '기존 맵의 **한 노드 아래에** 마크다운 조각을 하위 가지로 덧붙인다. ' +
      '`parent` 는 노드 이름(`"할 일"`) 또는 경로(`"2분기 > 협업"`)이고, 비우거나 `root` 면 중심 주제 바로 아래 새 가지가 된다. ' +
      '**사용자가 앱에서 지금 열어 둔 맵의 선택한 노드 아래**에 붙이려면 `map_id:"current"`, `parent:"selected"` 를 쓴다(get_open_map 이 그 자리를 보여 준다). ' +
      '`markdown` 은 `## 이름` 견출이나 `- 항목` 목록으로 시작하는 조각이다 — 그 최상위 항목들이 parent 의 새 하위 노드가 되고 더 깊은 견출·들여쓴 목록은 그 아래로 간다. ' +
      '있는 노드를 바꾸거나 지우지는 않는다(덧붙이기만). 앱에서 그 맵을 열어 둔 채여도 된다 — 앱 화면이 몇 초 안에 갱신된다. ' +
      '저장은 히스토리 버전으로 남으므로 앱의 [히스토리] 에서 되돌릴 수 있다. 노드 이름은 get_map 으로 먼저 확인한다.',
    inputSchema: {
      type: 'object',
      properties: {
        map_id: { type: 'string', description: '`list_maps` 가 돌려준 맵 id (UUID), 또는 `"current"` = 사용자가 앱에서 지금 열어 둔 맵.' },
        parent: {
          type: 'string',
          description: '붙일 부모 노드 — 이름 또는 `"가지 > 하위"` 경로, 또는 `"selected"` = 앱에서 지금 선택한 노드. 비우면 중심 주제 아래(새 최상위 가지).',
        },
        markdown: {
          type: 'string',
          description: '붙일 조각. `## 이름` 견출 또는 `- 항목` 목록으로 시작. 줄글만 있으면 노드가 되지 않는다.',
        },
        block_placement: {
          type: 'string',
          enum: ['node', 'note'],
          description: "표·코드블록·인용문·체크리스트를 노드 본문('node', 기본)에 넣을지 노트('note')로 넣을지.",
        },
        code_to_note: {
          type: 'boolean',
          description: '코드블록을 노드로 만들지 않고 **그 노드의 노트(코드)** 로 첨부한다 — 사용자가 "코드는 노트코드로 첨부해줘" 라고 하면 true. 말이 없으면 비운다(노드 내용).',
        },
        long_text_to_note: {
          type: 'integer',
          minimum: 1,
          description: '이 글자 수 **이상**인 문단은 노드로 만들지 않고 **그 노드의 노트(문단)** 로 넣는다 — "긴 문장(300자 이상)은 노트 문단으로" 면 300. 글자 수를 말하지 않으면 300. 말이 없으면 비운다(노드 내용).',
        },
      },
      required: ['map_id', 'markdown'],
    },
  },
  {
    name: 'check_items',
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    title: 'EasyMindMap 맵 노드의 체크박스에 체크하기',
    description:
      '기존 맵의 노드에 있는 **체크박스**(노드 본문의 `- [ ] 완료` 줄, 체크리스트 노트)를 **체크하거나 해제**한다. ' +
      '사용자가 "완료된 항목은 완료 체크에 체크해 줘" · "1단계 범위 끝났으니 체크해 줘" 라고 하면 이것을 부른다. ' +
      '`nodes` 에는 체크박스가 **들어 있는 노드**의 이름(`"1단계 범위"`) 또는 경로(`"3단계 > 1단계 범위"`)를 적는다 — get_map 본문에서 그 노드 아래에 `- [ ] …` 줄이 보인다. ' +
      '`"selected"` 는 앱에서 지금 선택한 노드, `map_id:"current"` 는 지금 열어 둔 맵이다. ' +
      '무엇이 끝났는지 대화에 없으면 짐작해서 체크하지 말고, get_map 으로 체크 줄이 있는 노드를 보여 주고 어느 것을 체크할지 묻는다. ' +
      '바꾸는 것은 `[ ]`↔`[x]` 뿐이다 — 노드의 글·자식·스타일은 그대로다. 되돌리려면 `checked:false` 로 다시 부르거나 앱의 [히스토리] 에서 이전 버전을 복원한다.',
    inputSchema: {
      type: 'object',
      properties: {
        map_id: { type: 'string', description: '`list_maps` 가 돌려준 맵 id (UUID), 또는 `"current"` = 사용자가 앱에서 지금 열어 둔 맵.' },
        nodes: {
          type: 'array',
          items: { type: 'string' },
          minItems: 1,
          description: '체크박스를 바꿀 노드들 — 이름 또는 `"가지 > 하위"` 경로, 또는 `"selected"`(앱에서 선택한 노드). 노드 안의 체크박스가 전부 대상이다(`item` 으로 좁힌다).',
        },
        checked: {
          type: 'boolean',
          description: 'true(기본) = 체크, false = 체크 해제.',
        },
        item: {
          type: 'string',
          description: '노드에 체크박스가 여럿일 때 이 말이 **들어간** 항목만 — 예: "완료". 비우면 그 노드의 체크박스 전부.',
        },
      },
      required: ['map_id', 'nodes'],
    },
  },
  {
    name: 'import_github_docs',
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    title: 'GitHub 저장소의 문서를 EasyMindMap 새 맵으로',
    description:
      'GitHub 저장소를 지정하면 그 저장소의 마크다운 문서들을 **새 맵 하나**로 만든다. 기본은 **저장소 전체**에서 문서(.md)를 찾는다 — ' +
      '`docs/` 가 없고 저장소 자체가 문서인 경우(예: 가이드 폴더가 뿌리에 여럿)도 그대로 된다. node_modules·vendor·dist·build 와 점(.)으로 시작하는 폴더는 건너뛴다. ' +
      '사용자가 특정 폴더만 말하면("docs 폴더만", "install-guide 만") 그 폴더를 `path` 로 준다. ' +
      '사용자가 "OOO 저장소 문서를 emm 새 맵으로 만들어 줘" · "github 문서를 맵으로" 라고 하면 이것을 부른다. ' +
      '폴더 트리가 그대로 가지가 되고(폴더 노드는 GitHub 폴더 링크), 문서 하나는 노드 하나다 — 제목은 문서의 첫 `#`, GitHub 주소가 그 노드의 링크로 붙고, ' +
      '문서 안의 `##`·`###` 제목이 그 아래 노드가 되며 표·문단·코드는 그 노드의 노트로 들어간다. 문서 노드에는 마지막 커밋 시각이 노트로 붙는다. ' +
      '이 맵은 나중에 update_map_from_github 으로 저장소 변경에 맞춰 갱신할 수 있다. ' +
      '익명으로는 GitHub API 가 시간당 60회라 앞 50개 문서만 마지막 커밋 시각을 읽고 나머지는 "(알 수 없음)" 으로 둔다(문서 내용은 전부 가져온다) — 전부 읽으려면 API 서버에 GITHUB_TOKEN.',
    inputSchema: {
      type: 'object',
      properties: {
        repo: { type: 'string', description: '저장소 — "owner/repo" 또는 GitHub 주소("https://github.com/owner/repo", ".../tree/main/docs" 도 됨).' },
        path: { type: 'string', description: '이 폴더 아래만(예: "docs", "docs/guide", "install-guide"). 비우면 **저장소 전체**의 마크다운 — 사용자가 폴더를 말했을 때만 준다.' },
        ref: { type: 'string', description: '브랜치·태그·커밋. 비우면 기본 브랜치.' },
        title: { type: 'string', description: '맵 이름. 비우면 "저장소이름 문서".' },
        template: { type: 'string', description: '맵 모양 — create_map 과 같다. 비우면 create_map 과 같은 방사형(양쪽). 문서 트리를 개요처럼 보려면 "TR"(트리·오른쪽).' },
        max_files: { type: 'integer', minimum: 1, maximum: 500, description: '가져올 문서 수 상한(기본 200). 넘으면 경로순 앞부분만 가져오고 그 사실을 알린다.' },
      },
      required: ['repo'],
    },
  },
  {
    name: 'update_map_from_github',
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
    title: 'GitHub 문서로 만든 맵을 저장소의 지금 상태에 맞춰 갱신',
    description:
      'import_github_docs 로 만든 맵을 저장소의 **지금 상태**에 맞춘다. 사용자가 "OOO 맵을 업데이트 해줘" · "OOO 맵을 github 수정사항 반영해서 수정해줘" 라고 하면 이것을 부른다(맵 id 는 list_maps 로). ' +
      '문서 노드의 갱신 시각·파일 sha 를 GitHub 과 비교해 **사라진 문서의 노드는 지우고, 새 문서는 노드를 더하고, 내용이 바뀐 문서는 그 노드(제목·하위 절·노트)를 다시 만든다.** ' +
      '절 노드는 제목으로 짝지어 id 를 유지하고, 사용자가 손으로 붙인 노드·노트는 남긴다. ' +
      '`node` 로 범위를 좁힐 수 있다 — "OOO 맵의 OOO 노드를 업데이트 해줘" 면 그 노드 이름(폴더 노드면 그 폴더 아래 문서들, 문서 노드면 그 문서, 문서 안의 절 노드면 **그 절만**), ' +
      '"현재 선택한 노드의 내용을 업데이트 해줘" 면 map_id:"current", node:"selected". 비우면 맵 전체. ' +
      '저장은 히스토리 버전으로 남아 앱의 [히스토리] 에서 되돌릴 수 있다. 이 도구로 만들지 않은 맵(루트 노트에 `출처: github:…` 가 없는 맵)은 거절한다.',
    inputSchema: {
      type: 'object',
      properties: {
        map_id: { type: 'string', description: '`list_maps` 가 돌려준 맵 id (UUID), 또는 `"current"` = 사용자가 앱에서 지금 열어 둔 맵.' },
        node: { type: 'string', description: '갱신 범위 — 노드 이름 또는 `"폴더 > 문서"` 경로, 또는 `"selected"`(앱에서 지금 선택한 노드). 비우면 맵 전체.' },
      },
      required: ['map_id'],
    },
  },
  {
    // §9.15 (2026-10-14) — 맵에서 고친 내용을 저장소 파일로. 맵이 아니라 GitHub 을 바꾼다 — 파괴적·바깥 세상.
    name: 'push_map_to_github',
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    title: 'GitHub 문서로 만든 맵에서 고친 내용을 저장소 파일에 반영',
    description:
      'import_github_docs 로 만든 맵에서 사용자가 고친 내용을 **GitHub 저장소의 파일에 되돌려 쓴다.** ' +
      '사용자가 "이 맵에서 고친 내용을 GitHub 에 반영해 줘" · "맵 수정사항을 저장소에 올려 줘" 라고 하면 이것을 부른다. ' +
      '**두 번 부른다** — 처음(confirm 없이)은 미리보기만 돌려준다(어느 파일의 어느 줄이 어떻게 바뀌는지 + 확인 코드). ' +
      '그 미리보기를 사용자에게 보여 주고 승인을 받은 뒤에만 같은 인자에 confirm:"확인 코드" 를 붙여 다시 부른다. 승인 없이 confirm 을 넣지 않는다. ' +
      '반영 규칙: 문서 노드·절 노드의 이름 → 제목·견출, 노트 글 → 그 문단·표·코드, 지운 절·노트 → 파일에서 지움, ' +
      '문서 노드 아래에 사용자가 붙인 노드·노트 → 새 절·새 문단(반영하지 않을 것은 태그 `메모` 또는 이름 머리 `[메모]`). ' +
      '원문은 바뀜 자리만 고친다(맵에 안 들어온 사진·긴 글은 그대로). ' +
      '**새 파일**은 폴더 노드(또는 중심주제) 아래 노드 중 태그 `새파일` 또는 이름 머리 `[새파일]` 을 단 것만 — 파일 이름을 정하려면 ' +
      '태그 `새파일:install.md` 또는 이름 `[새파일:guide/install.md] 설치 안내`. 대화에서 새 파일을 만들 때는 append_to_map(parent: 폴더 노드) 로 ' +
      '`## [새파일:이름.md] 제목` 가지(그 아래 `###` = 파일의 `##` 절)를 붙인 뒤 이 도구를 부른다. ' +
      '맵을 가져온 뒤 GitHub 쪽 파일이 바뀌었으면 그 파일은 충돌로 건너뛴다. 맵에서 문서 노드를 지워도 GitHub 파일은 지우지 않는다. ' +
      '기본은 새 브랜치에 커밋하고 PR 을 연다(mode:"pr"). mode:"commit" 은 맵의 브랜치에 바로 커밋한다. ' +
      '반영 뒤 맵의 문서 노드는 반영한 원문으로 다시 맞춘다(히스토리 버전). 이 도구로 만들지 않은 맵(루트 노트에 `출처: github:…` 가 없는 맵)은 거절한다.',
    inputSchema: {
      type: 'object',
      properties: {
        map_id: { type: 'string', description: '`list_maps` 가 돌려준 맵 id (UUID), 또는 `"current"` = 사용자가 앱에서 지금 열어 둔 맵.' },
        node: { type: 'string', description: '반영 범위 — 폴더·문서 노드 이름 또는 `"폴더 > 문서"` 경로, 또는 `"selected"`. 문서 안의 절을 고르면 그 문서 전체. 비우면 맵 전체.' },
        mode: { type: 'string', enum: ['pr', 'commit'], description: '"pr"(기본) = 새 브랜치 + PR, "commit" = 맵의 브랜치에 바로 커밋.' },
        confirm: { type: 'string', description: '미리보기가 준 확인 코드. **사용자가 미리보기를 승인한 뒤에만** 넣는다. 비우면 미리보기만.' },
        message: { type: 'string', description: '커밋·PR 제목. 비우면 "docs: EasyMindMap 맵 "…" 수정 반영".' },
      },
      required: ['map_id'],
    },
  },
  {
    // §9.16 (2026-10-14) — 유튜브 영상 → 맵. 이 도구는 읽기만, 요약·create_map 은 부른 AI 가 한다. YouTube 로 나간다.
    name: 'get_youtube_transcript',
    annotations: { readOnlyHint: true, openWorldHint: true },
    title: '유튜브 영상의 정보·챕터·자막 읽기 (맵으로 요약하려고)',
    description:
      '유튜브 영상 주소를 받아 **제목·채널·길이·챕터(설명란 시각 목록)·시각이 붙은 자막**을 돌려준다. ' +
      '사용자가 "이 유튜브 영상을 맵으로 만들어 줘" · "영상 내용을 요약해서 emm 맵으로" 라고 하면: ① 이 도구로 자막을 받고 ' +
      '② 그 내용을 직접 요약해 create_map 을 부른다(결과 끝의 "맵 만들기 안내" 대로 — 챕터/주제별 가지, 가지마다 시작 시각 링크, 자막에 없는 내용은 쓰지 않음). ' +
      '자막을 그대로 맵에 옮기지 않는다. 긴 영상은 자막이 나눠 오니 결과의 start_at 으로 이어 받아 다 읽은 뒤 한 번에 만든다. ' +
      '사람이 만든 자막을 자동 생성보다, 한국어를 영어보다 먼저 고른다(`lang` 으로 바꿀 수 있다). ' +
      '자막이 없거나 YouTube 가 서버를 막으면 이유를 돌려주니, 그때는 사용자에게 스크립트를 붙여 넣어 달라고 한다. 맵은 바꾸지 않는다.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: '유튜브 영상 주소(youtube.com/watch?v=… · youtu.be/… · shorts/… · live/…) 또는 영상 id. 주소의 t= 는 시작 시각으로 쓴다.' },
        lang: { type: 'string', description: '자막 언어 코드(ko·en·ja …). 비우면 한국어 → 영어 → 있는 것.' },
        start_at: { type: 'integer', minimum: 0, description: '이 초부터 읽는다 — 긴 영상에서 앞선 결과가 알려 준 값으로 이어 읽을 때.' },
        max_chars: { type: 'integer', minimum: 2000, maximum: 100000, description: '한 번에 받을 자막 글자 수(기본 30000).' },
      },
      required: ['url'],
    },
  },
  {
    // §9.17 (2026-10-14) — PDF → 새 맵. **요약하지 않는다** — 글을 모두 담고 구조만 만든다. URL 이면 밖으로 나간다.
    name: 'import_pdf',
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    title: 'PDF 를 EasyMindMap 새 맵으로 (내용 전체를 구조화)',
    description:
      'PDF 파일을 읽어 **새 맵 하나**로 만든다. **요약하지 않는다 — PDF 의 글을 모두 담고**, 책갈피(없으면 글자 크기·번호 꼴, 그것도 없으면 쪽)로 ' +
      '제목 가지를 만들고 문단·목록 항목을 그 아래 노드로 둔다(목록은 들여쓰기 단계대로). 빼는 것은 반복 머리글·바닥글·쪽 번호와 겹쳐 그린 글자뿐이고 결과에 양을 알린다. ' +
      'PDF 의 **그림(사진·구성도)은 글로 옮기지 않고 그 자리에 노드 사진("그림 (p.4)")으로 붙인다** — 그림 속 글자를 읽어 적지 않는다. ' +
      '사용자가 "이 PDF 를 맵으로 만들어 줘" · "첨부한 PDF 를 emm 맵으로" 라고 하면 이것을 부른다 — 대화에서 직접 요약해 create_map 을 부르지 않는다. ' +
      'PDF 를 넘기는 길은 셋: ① **EasyMindMap 에 첨부한 PDF** — attachment 에 get_map 에 보이는 첨부 주소(…/v1/attachments/<id>)·id, 또는 map_id(+node)와 파일 이름. ' +
      'map_id 만 주면 그 맵(node 를 주면 그 노드 아래)의 PDF 첨부가 하나일 때 그것. ② url — 인터넷의 PDF 주소. ③ data_base64 — 파일을 직접 읽을 수 있을 때(예: Claude Code 가 로컬 파일을 읽어) PDF 바이트를 base64 로(약 18MB 까지). ' +
      '**대화창에 올린 첨부 파일은 도구로 넘어오지 않는다** — 그때는 사용자에게 EasyMindMap 앱에서 노드에 PDF 를 첨부하거나(링크·첨부 탭) PDF 주소를 달라고 한다. ' +
      '암호 걸린 PDF·글자가 그림인 스캔 PDF(OCR 없음)는 만들 수 없다. 큰 PDF 는 pages 로 나눈다(한 번에 300쪽).',
    inputSchema: {
      type: 'object',
      properties: {
        attachment: { type: 'string', description: 'EasyMindMap 첨부 — 첨부 주소(…/v1/attachments/<id>) 또는 id, 또는 map_id 와 함께 파일 이름.' },
        map_id: { type: 'string', description: '첨부를 찾을 맵(list_maps 의 id 또는 "current"). attachment 가 이름이거나 비었을 때.' },
        node: { type: 'string', description: '첨부를 찾을 노드 이름·경로 또는 "selected" — 그 노드 아래에서만 찾는다.' },
        url: { type: 'string', description: '인터넷의 PDF 주소 (https://…).' },
        data_base64: { type: 'string', description: 'PDF 파일 바이트를 base64 로 (data:application/pdf;base64,… 도 됨).' },
        file_name: { type: 'string', description: 'data_base64 일 때 파일 이름(출처 표시용).' },
        title: { type: 'string', description: '맵 이름. 비우면 PDF 문서 제목 → 표지 제목 → 파일 이름.' },
        template: { type: 'string', description: '맵 모양 — create_map 과 같다. 비우면 앱 기본(방사형 양쪽). 긴 문서는 "TR"(트리·오른쪽)이 읽기 좋다.' },
        pages: { type: 'string', description: '쪽 범위 "1-20,25" · "30-". 비우면 전부.' },
        structure: { type: 'string', enum: ['auto', 'outline', 'fontsize', 'numbering', 'pages'], description: '가지를 나누는 기준. auto(기본) = 책갈피 → 글자 크기 → 번호 꼴 → 쪽.' },
        long_text_to_note: { type: 'integer', minimum: 1, description: '이 글자 수 이상 문단은 노드가 아니라 그 제목 노드의 노트(문단)로 — 글은 그대로 다 담긴다. 비우면 모든 문단이 노드.' },
        images: { type: 'boolean', description: 'PDF 의 그림(사진·구성도 등)을 노드 사진으로 넣는다(기본 true). false 면 그림을 뺀다. 그림 속 글자는 읽지 않는다.' },
      },
    },
  },
];

/** `get_map` 이 한 번에 돌려주는 본문 상한 — 넘으면 자르고 그 사실을 알린다 */
export const GET_MAP_MAX_CHARS = 120_000;

/** 도구 실행 결과 — MCP `tools/call` 의 result 모양 그대로 */
export interface ToolResult {
  content: { type: 'text'; text: string }[];
  isError?: boolean;
}

function text(s: string, isError = false): ToolResult {
  return { content: [{ type: 'text', text: s }], ...(isError ? { isError: true } : {}) };
}

@Injectable()
export class McpToolsService {
  private readonly log = new Logger(McpToolsService.name);

  constructor(
    private readonly maps: MapsService,
    private readonly folders: FoldersService,
    private readonly focus: FocusService,
    // 협업 방이 살아 있는지 묻는 데만 쓴다 — 시험은 안 넣어도 된다(그러면 "방 없음")
    @Optional() @Inject(PRO) private readonly pro?: ProContract,
    // import_pdf 가 맵에 붙은 PDF 를 읽는 데만 쓴다(열기 권한은 첨부 서비스의 규칙 그대로) — 시험은 안 넣어도 된다
    @Optional() private readonly attachments?: AttachmentsService,
  ) {}

  list(): McpToolDef[] {
    return TOOL_DEFS;
  }

  /**
   * 도구 실행. **도구가 실패해도 JSON-RPC 오류로 올리지 않는다** —
   * `isError: true` 인 결과로 돌려준다. 그래야 AI 가 그 문장을 읽고
   * 스스로 고쳐서 다시 부를 수 있다(이름 중복·견출 없음 등이 전부
   * 그렇게 풀리는 실패다). JSON-RPC 오류는 대화가 아니라 프로토콜이
   * 깨졌을 때만 쓴다.
   */
  async call(userId: string, name: string, args: Record<string, unknown>): Promise<ToolResult> {
    switch (name) {
      case 'create_map': return this.createMap(userId, args);
      case 'list_maps': return this.listMaps(userId, args);
      case 'get_map': return this.getMap(userId, args);
      case 'append_to_map': return this.appendToMap(userId, args);
      case 'check_items': return this.checkItems(userId, args);
      case 'get_open_map': return this.getOpenMap(userId);
      case 'import_github_docs': return this.importGithubDocs(userId, args);
      case 'update_map_from_github': return this.updateMapFromGithub(userId, args);
      case 'push_map_to_github': return this.pushMapToGithub(userId, args);
      case 'get_youtube_transcript': return this.getYoutubeTranscript(args);
      case 'import_pdf': return this.importPdf(userId, args);
      default: return text(`알 수 없는 도구입니다: ${name}`, true);
    }
  }

  /** `map_id` 가 "지금 열린 맵" 을 뜻하는 말인가 */
  private static isCurrentMapWord(v: string): boolean {
    return /^(current|open|opened|now|active|현재|현재 맵|지금|열린 맵|열려 있는 맵|열려있는 맵)$/i.test(v.trim());
  }
  /** `parent` 가 "선택한 노드" 를 뜻하는 말인가 */
  private static isSelectedWord(v: string): boolean {
    return /^(selected|selection|selected node|current node|선택|선택 노드|선택한 노드|선택된 노드|지금 선택)$/i.test(v.trim());
  }

  /**
   * `map_id` 를 푼다 — UUID 면 그대로, "current" 류면 앱이 알려 준 열린 맵.
   * 실패는 사람이 읽을 문장(AI 가 사용자에게 전한다).
   */
  private resolveMapId(userId: string, raw: unknown): { mapId: string } | { error: string } {
    const v = typeof raw === 'string' ? raw.trim() : '';
    if (!v || McpToolsService.isCurrentMapWord(v)) {
      const f = this.focus.get(userId);
      if (!f) {
        return { error: '앱에서 열어 둔 맵이 없습니다 — EasyMindMap 앱에서 맵을 열어 두거나(1분 안에 알려집니다), list_maps 로 맵 id 를 찾아 주세요.' };
      }
      return { mapId: f.mapId };
    }
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) {
      return { error: '`map_id` 가 맵 id(UUID) 모양이 아닙니다 — list_maps 가 돌려준 id 를 그대로 넣거나, 앱에서 열어 둔 맵이면 "current" 라고 적어 주세요.' };
    }
    return { mapId: v };
  }

  /** `get_open_map` — 앱이 지금 보고 있는 자리 */
  private async getOpenMap(userId: string): Promise<ToolResult> {
    const f = this.focus.get(userId);
    if (!f) {
      return text('앱에서 열어 둔 맵이 없습니다 (닫았거나, 로그아웃했거나, 1분 넘게 조용합니다). 맵을 열어 두면 몇 초 안에 알려집니다.');
    }
    let title = '';
    try { title = (await this.maps.getOne(userId, f.mapId)).title; } catch { /* 지워졌거나 권한이 사라짐 */ }
    const where = f.nodeId === null
      ? '선택한 노드 없음 (append_to_map 의 parent 를 이름으로 적거나 앱에서 노드를 고르세요)'
      : f.nodeId === 'root' || f.path.length === 0
        ? '중심 주제(루트)가 선택됨 — parent:"selected" 면 새 최상위 가지가 된다'
        : `선택한 노드: "${f.path.join(' > ')}"`;
    const age = Math.round((Date.now() - f.at) / 1000);
    return text(
      `지금 열린 맵: "${title || '(이름을 읽지 못함)'}" (id: ${f.mapId})\n${where}\n` +
      `(${age}초 전 앱이 알려 줌. 이 맵에 붙이려면 append_to_map 에 map_id:"current", parent:"selected" 를 넣으면 된다.)`,
    );
  }

  /**
   * `list_maps` — 내 맵(`GET /maps`) + 공유받은 맵(`GET /maps/shared`).
   * 결과는 **AI 가 읽는 글**이라 JSON 이 아니라 줄 목록으로 준다 — id 는
   * `get_map` 에 그대로 넣을 수 있게 줄마다 붙인다. 폴더는 id 가 아니라
   * **이름**으로 보인다(대화에서 "기획 폴더의 …" 처럼 말하기 위해서다).
   */
  private async listMaps(userId: string, args: Record<string, unknown>): Promise<ToolResult> {
    const q = typeof args.query === 'string' ? args.query.trim() : '';
    const folderArg = typeof args.folder === 'string' ? args.folder.trim() : '';
    const limit = clampInt(args.limit, 1, 100, 20);

    const { folders } = await this.folders.list(userId);
    const folderName = new Map(folders.map((f) => [f.folderId, f.name] as const));

    // 폴더 이름 → id. 같은 이름이 여러 층에 있을 수 있어 **전부** 받는다.
    let folderIds: string[] | null = null;
    let homeOnly = false;
    if (folderArg) {
      if (/^(home|홈|root)$/i.test(folderArg)) homeOnly = true;
      else {
        folderIds = folders
          .filter((f) => f.name.toLowerCase() === folderArg.toLowerCase())
          .map((f) => f.folderId);
        if (folderIds.length === 0) {
          const names = folders.map((f) => f.name).join(', ') || '(폴더 없음)';
          return text(`"${folderArg}" 폴더가 없습니다. 있는 폴더: ${names}`, true);
        }
      }
    }

    const mine = homeOnly
      ? await this.maps.list(userId, { q, limit, folder: 'root' })
      : folderIds && folderIds.length === 1
        ? await this.maps.list(userId, { q, limit, folder: folderIds[0] })
        : await this.maps.list(userId, { q, limit: folderIds ? 500 : limit });
    let rows = mine.maps.map((m) => ({
      mapId: m.mapId, title: m.title, folderId: m.folderId,
      updatedAt: m.updatedAt, nodeCount: m.nodeCount, shared: null as string | null,
    }));
    if (folderIds && folderIds.length > 1) {
      const wanted = new Set(folderIds);
      rows = rows.filter((r) => r.folderId && wanted.has(r.folderId)).slice(0, limit);
    }

    // 공유받은 맵 — 폴더로 좁힐 때는 뺀다(남의 폴더 배치는 내 트리가 아니다)
    let sharedCount = 0;
    if (!folderArg) {
      const shared = await this.maps.listShared(userId, { q, limit });
      sharedCount = shared.maps.length;
      for (const m of shared.maps) {
        rows.push({
          mapId: m.mapId, title: m.title, folderId: null,
          updatedAt: m.updatedAt, nodeCount: m.nodeCount,
          shared: m.ownerEmail ?? '공유받음',
        });
      }
    }

    if (rows.length === 0) {
      return text(q
        ? `"${q}" 에 맞는 맵이 없습니다.`
        : '문서함에 맵이 없습니다. create_map 으로 첫 맵을 만들 수 있습니다.');
    }

    const lines = rows.map((r) => {
      const where = r.shared ? `공유받음(${r.shared})`
        : r.folderId ? `폴더: ${folderName.get(r.folderId) ?? '?'}` : '폴더: 홈';
      const nodes = r.nodeCount == null ? '' : ` · 노드 ${r.nodeCount}개`;
      return `- ${r.title} — id: ${r.mapId} · ${where} · 수정: ${fmtDate(r.updatedAt)}${nodes}`;
    });
    const head = q
      ? `"${q}" 검색 결과 ${rows.length}개 (내 맵 ${mine.total}개 중 · 공유받은 맵 ${sharedCount}개):`
      : `맵 ${rows.length}개 (내 맵 전체 ${mine.total}개 · 공유받은 맵 ${sharedCount}개, 최근 수정순):`;
    const more = mine.total > mine.maps.length
      ? `\n… 더 있습니다. \`query\` 로 좁히거나 \`limit\` 을 늘려 다시 부르세요.` : '';
    return text(`${head}\n${lines.join('\n')}${more}`);
  }

  /**
   * `get_map` — `GET /maps/:id/document` 를 읽어 EMM 마크다운으로.
   * **편집 세션을 열지 않는다**(editSession 을 주지 않는다) — 읽기가 다른
   * 사람의 편집 잠금을 가로채면 안 된다. 접근 판정(내 맵·공유받은 맵)은
   * MapsService 가 한다 — 남의 맵이면 404 가 오고 그 문장을 그대로 전한다.
   */
  private async getMap(userId: string, args: Record<string, unknown>): Promise<ToolResult> {
    const rid = this.resolveMapId(userId, args.map_id);
    if ('error' in rid) return text(rid.error, true);
    const mapId = rid.mapId;
    let docRes;
    try {
      docRes = await this.maps.getDocument(userId, mapId);
    } catch (err) {
      return text(mapError(err, '맵을 읽지 못했습니다'), true);
    }
    let emm;
    try {
      emm = docToEmm(docRes.doc);
    } catch (err) {
      if (err instanceof DocShapeError) return text(err.message, true);
      throw err;
    }

    let body = emm.markdown;
    let cut = '';
    if (body.length > GET_MAP_MAX_CHARS) {
      body = body.slice(0, GET_MAP_MAX_CHARS);
      cut = `\n\n[… 본문이 ${emm.markdown.length.toLocaleString()}자라 ${GET_MAP_MAX_CHARS.toLocaleString()}자에서 잘랐습니다. 앱에서 [내보내기 ▸ Markdown] 으로 전체를 받을 수 있습니다.]`;
    }
    const imgs = emm.imageCount ? ` · 사진 ${emm.imageCount}장(본문의 files/ 경로 — 이 도구는 사진 바이트를 주지 않는다)` : '';
    const role = docRes.role && docRes.role !== 'owner' ? ` · 내 권한: ${docRes.role}` : '';
    return text(
      `맵 "${docRes.title}" (id: ${docRes.mapId} · 수정: ${fmtDate(docRes.updatedAt)} · 노드 ${emm.nodeCount}개${imgs}${role})\n` +
      `아래가 mmd 마크다운 본문이다. 고쳐서 새 맵으로 저장하려면 create_map 에, 어느 노드 아래에 덧붙이려면 append_to_map(parent: 노드 이름 또는 "가지 > 하위") 에 넣는다.\n` +
      `\n${body}${cut}`,
    );
  }

  /**
   * `append_to_map` — 읽기 → 붙이기 → 저장(버전).
   *
   * **잠금을 잡지 않는다** (2026-09-05 사용자 결정: "열어 놓고 보고만 있는
   * 동안에도 AI 가 붙이게"). 앱이 그 맵을 열어 둔 채(잠금 살아 있음)라도
   * **같은 사용자**면 저장을 통과시킨다(`lockPolicy: 'same-user-ok'`). 덮어쓰기는
   * 두 겹으로 막는다 — 앱은 저장 때 `baseUpdatedAt` 을 보내 서버가 더 새로우면
   * 409 STALE 을 받고(편집분은 브라우저 초안으로 보관), 편집 중이 아니면
   * 하트비트의 `updatedAt` 을 보고 화면을 조용히 다시 읽는다(§9.8).
   * 다른 사용자의 살아 있는 잠금(공유 편집자)은 여전히 거절된다.
   *
   * **되돌리기**: `keepVersion=true` 로 저장해 히스토리 버전이 남는다.
   */
  private async appendToMap(userId: string, args: Record<string, unknown>): Promise<ToolResult> {
    const rid = this.resolveMapId(userId, args.map_id);
    if ('error' in rid) return text(rid.error, true);
    const mapId = rid.mapId;
    let parent = typeof args.parent === 'string' ? args.parent : '';
    // "선택한 노드" — 앱이 알려 준 자리로. 그 맵이 지금 열린 맵이어야 뜻이 맞는다.
    if (parent && McpToolsService.isSelectedWord(parent)) {
      const f = this.focus.get(userId);
      if (!f) return text('앱에서 선택한 노드를 알 수 없습니다 — 앱에서 그 맵을 열어 두고 노드를 고른 뒤 다시 불러 주세요(1분 안에 알려집니다).', true);
      if (f.mapId !== mapId) {
        return text(`앱에서 지금 열어 둔 맵은 다른 맵(id: ${f.mapId})입니다 — 그 맵에 붙이려면 map_id:"current" 로, 이 맵에 붙이려면 parent 를 노드 이름으로 적어 주세요.`, true);
      }
      if (f.nodeId === null) return text('앱에서 선택한 노드가 없습니다 — 앱에서 노드를 고르거나 parent 를 노드 이름으로 적어 주세요.', true);
      parent = `id:${f.nodeId}`;
    }
    const placement = placementArgs(args);

    let fragment;
    try {
      fragment = parseFragment(typeof args.markdown === 'string' ? args.markdown : '', placement);
    } catch (err) {
      if (err instanceof AppendError) return text(err.message, true);
      throw err;
    }

    const opened = await this.openForWrite(userId, mapId, '붙일');
    if ('error' in opened) return text(opened.error, true);
    const docRes = opened.docRes;

    let result;
    try {
      result = appendSubtree(mapFromDoc(docRes.doc), parent, fragment);
    } catch (err) {
      if (err instanceof AppendError || err instanceof DocShapeError) return text(err.message, true);
      throw err;
    }

    const saved = await this.saveVersion(userId, mapId, docRes.doc, result.map, 'append_to_map', '붙인 내용을');
    if ('error' in saved) return text(saved.error, true);
    return text(
      `"${docRes.title}" 맵의 "${result.parentPath}" 아래에 노드 ${result.added}개(바로 아래 ${result.topCount}개)를 붙였습니다.` +
      saved.versionNote + '\n' + LIVE_NOTE,
    );
  }

  /**
   * `check_items` — 읽기 → 체크박스 맞추기 → 저장(버전). 잠금·권한·공개
   * 판정은 `append_to_map` 과 **같다**(openForWrite · saveVersion). 노드
   * 하나가 못 찾아져도 나머지는 진행하고, 결과에 노드별로 적는다.
   * 바뀐 것이 하나도 없으면 저장하지 않는다 — 버전만 늘어난다.
   */
  private async checkItems(userId: string, args: Record<string, unknown>): Promise<ToolResult> {
    const rid = this.resolveMapId(userId, args.map_id);
    if ('error' in rid) return text(rid.error, true);
    const mapId = rid.mapId;
    const checked = !(args.checked === false || args.checked === 'false');
    const item = typeof args.item === 'string' && args.item.trim() ? args.item.trim() : undefined;
    const rawNodes = Array.isArray(args.nodes) ? args.nodes
      : typeof args.nodes === 'string' && args.nodes.trim() ? [args.nodes] : [];
    let targets = rawNodes.map((n) => String(n ?? '').trim()).filter(Boolean);
    if (targets.length === 0) {
      return text('`nodes` 가 비어 있습니다 — 체크할 노드 이름(또는 "가지 > 하위" 경로)을 하나 이상 넣어 주세요.', true);
    }
    // "선택한 노드" — 앱이 알려 준 자리로 (append_to_map 과 같은 규칙)
    if (targets.some((t) => McpToolsService.isSelectedWord(t))) {
      const f = this.focus.get(userId);
      if (!f) return text('앱에서 선택한 노드를 알 수 없습니다 — 앱에서 그 맵을 열어 두고 노드를 고른 뒤 다시 불러 주세요(1분 안에 알려집니다).', true);
      if (f.mapId !== mapId) {
        return text(`앱에서 지금 열어 둔 맵은 다른 맵(id: ${f.mapId})입니다 — 그 맵이면 map_id:"current" 로, 이 맵이면 nodes 를 노드 이름으로 적어 주세요.`, true);
      }
      if (f.nodeId === null) return text('앱에서 선택한 노드가 없습니다 — 앱에서 노드를 고르거나 nodes 를 노드 이름으로 적어 주세요.', true);
      targets = targets.map((t) => (McpToolsService.isSelectedWord(t) ? `id:${f.nodeId}` : t));
    }

    const opened = await this.openForWrite(userId, mapId, '체크할');
    if ('error' in opened) return text(opened.error, true);
    const docRes = opened.docRes;

    let map;
    try { map = mapFromDoc(docRes.doc); } catch (err) {
      if (err instanceof DocShapeError) return text(err.message, true);
      throw err;
    }
    let result;
    try {
      result = checkItems(map, targets, checked, item);
    } catch (err) {
      if (err instanceof AppendError) return text(err.message, true);
      throw err;
    }

    const verb = checked ? '체크' : '체크 해제';
    const lines = result.outcomes.map((o) => {
      if (o.error) return `- "${o.asked}": 건너뜀 — ${o.error}`;
      if (o.total === 0) return `- "${o.path}": 이 노드에는 체크박스가 없습니다(건너뜀)`;
      if (o.matched === 0) return `- "${o.path}": "${item}" 이 들어간 체크박스가 없습니다(체크박스 ${o.total}개는 다른 항목)`;
      const parts = [`${verb} ${o.changed}개`];
      if (o.already) parts.push(`이미 ${verb}된 것 ${o.already}개`);
      return `- "${o.path}": ${parts.join(' · ')}`;
    });

    if (result.changed === 0) {
      const anyFound = result.outcomes.some((o) => !o.error && o.total > 0);
      const avail = anyFound ? '' : hintCheckable(map);
      return text(`바뀐 체크박스가 없습니다 — 저장하지 않았습니다.\n${lines.join('\n')}${avail}`, true);
    }

    const saved = await this.saveVersion(userId, mapId, docRes.doc, result.map, 'check_items', '체크한 내용을');
    if ('error' in saved) return text(saved.error, true);
    return text(
      `"${docRes.title}" 맵에서 체크박스 ${result.changed}개를 ${verb}했습니다.${saved.versionNote}\n${lines.join('\n')}\n` + LIVE_NOTE,
    );
  }

  /**
   * 쓰기용으로 문서를 연다 — `append_to_map` · `check_items` 공통. 공개 중이면
   * 거절(서버 저장 규칙과 같다), 읽기 권한이면 거절. `what` 은 문장에 들어갈
   * 동사("붙일"·"체크할").
   */
  private async openForWrite(userId: string, mapId: string, what: string): Promise<
    { docRes: Awaited<ReturnType<MapsService['getDocument']>> } | { error: string }
  > {
    let docRes;
    try {
      docRes = await this.maps.getDocument(userId, mapId);
    } catch (err) {
      return { error: mapError(err, '맵을 읽지 못했습니다') };
    }
    if (docRes.published) {
      return { error: `"${docRes.title}" 맵은 지금 공개(퍼블리싱) 중이라 편집할 수 없습니다 — 앱에서 비공개(보관)로 바꾼 뒤 다시 시도해 주세요.` };
    }
    if (docRes.role && !['owner', 'editor', 'collab_creator'].includes(String(docRes.role))) {
      return { error: `"${docRes.title}" 맵에는 읽기 권한만 있어 ${what} 수 없습니다 (내 권한: ${docRes.role}).` };
    }
    // **협업 방이 살아 있으면 거절한다** (2026-09-09 사용자 결정 — B안, §9.13).
    // 협업맵은 열려 있는 동안 유료 모듈의 방(Y.Doc)이 정본을 되돌려 쓴다.
    // 지금 정본에 써 봐야 방이 모른 채 곧 덮어쓴다 — 실제로 할 일 맵의 체크
    // 12개가 히스토리 v10 에만 남고 4분 뒤 사라졌다. 버전으로 남기고 정본에서
    // 지워지는 것보다, 지금은 안 된다고 **이유와 함께** 말하는 편이 낫다.
    // A안(방에 직접 반영)은 유료·코어에 걸친 큰 일이라 접었다.
    if (await this.collabRoomLive(mapId)) {
      return { error: `"${docRes.title}" 맵은 협업맵이고 지금 협업 방이 열려 있어 ${what} 수 없습니다 — 누군가(나 자신일 수도) 앱에서 열어 두었거나 닫은 지 1분이 안 됐습니다. 이 상태에서 쓰면 방이 곧 덮어씁니다. 앱에서 그 맵을 닫고 1분쯤 뒤에 다시 불러 주세요.` };
    }
    return { docRes };
  }

  /** 유료 모듈이 없거나(스텁) 묻는 길이 없으면 **방 없음**으로 본다 */
  private async collabRoomLive(mapId: string): Promise<boolean> {
    const ask = this.pro?.collabRoomLive;
    if (typeof ask !== 'function') return false;
    try {
      return Boolean(await ask.call(this.pro, mapId));
    } catch (err) {
      // 묻다 실패했으면 **막지 않는다** — 협업 판정이 죽었다고 MCP 까지 죽으면 원인을 못 찾는다
      this.log.warn(`협업 방 상태 확인 실패 (map=${mapId}) — 방 없음으로 진행`, err as Error);
      return false;
    }
  }

  /**
   * 바꾼 맵을 **히스토리 버전으로** 저장한다 — §9.8 의 규칙 그대로: 잠금을
   * 잡지 않고 같은 사용자의 살아 있는 잠금은 통과(`same-user-ok`), 덮어쓰기는
   * 앱이 두 겹으로 막는다. 실패는 사람이 읽을 문장으로.
   */
  private async saveVersion(
    userId: string, mapId: string, doc: unknown, map: unknown, tool: string, what: string,
  ): Promise<{ versionNote: string } | { error: string }> {
    const next = { ...(doc as Record<string, unknown>), map };
    let saved;
    try {
      saved = await this.maps.saveDocument(
        userId, mapId, next, undefined, true, undefined, false,
        { platform: 'MCP', browser: 'AI 대화' },
        { lockPolicy: 'same-user-ok' },
      );
    } catch (err) {
      this.log.warn(`MCP ${tool} 저장 실패 (map=${mapId}, user=${userId})`, err as Error);
      return { error: mapError(err, `${what} 저장하지 못했습니다`) };
    }
    const ver = (saved as { version?: number }).version;
    return { versionNote: ver ? ` (히스토리 버전 ${ver})` : '' };
  }

  private async createMap(userId: string, args: Record<string, unknown>): Promise<ToolResult> {
    const markdown = typeof args.markdown === 'string' ? args.markdown : '';
    if (!markdown.trim()) {
      return text('`markdown` 이 비어 있습니다 — 맵으로 만들 내용을 넣어 주세요.', true);
    }
    const placement = placementArgs(args);
    const askedTitle = typeof args.title === 'string' ? args.title.trim() : '';

    let snapshot;
    try {
      snapshot = emmToSnapshot(markdown, askedTitle || '새 마인드맵', placement);
    } catch (err) {
      if (err instanceof EmmParseError) return text(err.message, true);
      throw err;
    }
    const title = askedTitle || titleFromSnapshot(snapshot, '새 마인드맵');

    // 템플릿 — 앱의 불러오기와 같은 규칙으로 맵 레이아웃 + 레벨별 레이아웃을
    // 정하고, 선언한 레벨의 노드에 **박는다**(설정만 넣어서는 그림이 안 바뀐다 —
    // importMapFile.ts 2026-09-03 의 교훈). 모르는 이름은 거절해 AI 가 고쳐 부르게.
    let templateNote = '';
    try {
      const tpl = templateFor(typeof args.template === 'string' ? args.template : undefined, markdown);
      if (tpl.editor) snapshot.editor = { ...snapshot.editor, layoutType: tpl.editor.layoutType };
      if (tpl.settings) {
        snapshot.map.settings = { ...(snapshot.map.settings ?? {}), ...tpl.settings };
        if (tpl.settings.levelLayouts) {
          snapshot.map.branches = applyLevelLayouts(
            snapshot.map.branches as unknown as import('../emm/model').MindNode[], tpl.settings.levelLayouts,
          ) as unknown as typeof snapshot.map.branches;
          // 둘째 이후의 중심주제 가지에도 (2026-09-16) — 선언은 맵 전체의 것
          if (snapshot.map.centers) {
            snapshot.map.centers = snapshot.map.centers.map((c) => ({
              ...c,
              branches: applyLevelLayouts(
                c.branches as unknown as import('../emm/model').MindNode[], tpl.settings!.levelLayouts!,
              ) as unknown as typeof c.branches,
            }));
          }
        }
      }
      if (tpl.editor) templateNote = ` · 레이아웃: ${tpl.editor.layoutType}` + (tpl.settings?.levelLayouts ? ' + 레벨별' : '');
      if (tpl.skipped?.length) templateNote += ` (건너뜀: ${tpl.skipped.join(', ')})`;
    } catch (err) {
      if (err instanceof TemplateError) return text(err.message, true);
      throw err;
    }

    // 맵을 만든다 — 폴더는 지정하지 않는다(최상위 '홈'). 대화에서 폴더를
    // 고르려면 폴더 목록 도구가 먼저 있어야 하는데 그것은 2단계다(§2-2).
    let mapId: string;
    try {
      const created = await this.maps.create(userId, { title });
      mapId = created.mapId;
    } catch (err) {
      return text(mapError(err, '맵을 만들지 못했습니다'), true);
    }

    try {
      // keepVersion=true — 이 저장이 그 맵의 **첫 히스토리 버전**이 된다.
      // 앱에서 '처음 저장'(saveNewMap)이 하는 것과 같다.
      await this.maps.saveDocument(userId, mapId, snapshot, title, true);
    } catch (err) {
      // **반쪽 맵을 남기지 않는다** — 앱의 saveNewMap 과 같은 이유다
      // (mapSession.ts): 이름만 있고 열면 "스냅샷이 없습니다" 로 막히는
      // 맵이 문서함에 남는다. 지우기가 실패해도 원래 오류를 알린다.
      await this.maps.remove(userId, mapId).catch(() => { /* 원래 오류가 우선 */ });
      this.log.warn(`MCP create_map 문서 저장 실패 (user=${userId})`, err as Error);
      return text(mapError(err, '맵 내용을 저장하지 못했습니다'), true);
    }

    // 노드 수는 **문서함과 같은 셈**(루트 포함 = map_documents.node_count) —
    // list_maps·get_map 이 같은 맵을 다른 수로 말하면 AI 도 사용자도 헷갈린다.
    const allCenters = mapCenters(snapshot.map);
    const nodes = allCenters.reduce((n, c) => n + 1 + countNodes(c.branches), 0);
    const branchCount = allCenters.reduce((n, c) => n + c.branches.length, 0);
    const centerNote = allCenters.length > 1 ? ` · 중심주제 ${allCenters.length}개` : '';
    return text(
      `EasyMindMap 문서함에 "${title}" 맵을 만들었습니다 (가지 ${branchCount}개 · 노드 ${nodes}개${centerNote}${templateNote}).\n` +
      `맵 id: ${mapId}\n` +
      `EasyMindMap 을 열고 [☁ 클라우드 ▸ 열기] 에서 확인할 수 있습니다.`,
    );
  }

  // ── GitHub 문서 → 맵 (2026-09-21, §9.14) ─────────────────────────────

  /** 익명 호출은 시간당 60회 — 트리·저장소 정보에 2회를 쓰고 나머지가 커밋 조회다 */
  private static readonly ANON_FILE_LIMIT = 50;
  private static readonly DEFAULT_MAX_FILES = 200;
  private static readonly FETCH_CONCURRENCY = 6;

  /**
   * 문서 하나를 읽는다 — 원문 + 마지막 커밋 (둘은 서로 독립이라 같이 기다린다).
   * 원문은 raw.githubusercontent.com 이라 API 한도를 쓰지 않는다. 커밋 조회만 한도를 쓴다 —
   * `withCommit` 이 거짓이면 건너뛴다(익명 한도, 2026-10-04).
   */
  private async loadDoc(gh: GithubClient, src: DocsSource, file: RemoteFile, withCommit = true): Promise<DocInput> {
    const [markdown, commit] = await Promise.all([
      gh.raw(src.owner, src.repo, src.ref, file.path),
      withCommit
        ? gh.lastCommit(src.owner, src.repo, src.ref, file.path).catch(() => null as FileCommit | null)
        : Promise.resolve(null as FileCommit | null),
    ]);
    return { file, markdown, commit };
  }

  private async importGithubDocs(userId: string, args: Record<string, unknown>): Promise<ToolResult> {
    let ref;
    try { ref = parseRepoRef(typeof args.repo === 'string' ? args.repo : ''); } catch (err) {
      if (err instanceof GithubDocsError) return text(err.message, true);
      throw err;
    }
    const gh = new GithubClient();
    const askedPath = typeof args.path === 'string' ? args.path.trim().replace(/^\/+|\/+$/g, '') : '';
    const maxFiles = Math.max(1, Math.min(500, Number(args.max_files) || McpToolsService.DEFAULT_MAX_FILES));

    let src: DocsSource;
    let files: RemoteFile[];
    let scopeNote = '';
    try {
      const branch = (typeof args.ref === 'string' && args.ref.trim()) || ref.ref || await gh.defaultBranch(ref.owner, ref.repo);
      // ★ 기본은 **저장소 전체** (2026-10-04 사용자 요청: "저장소 전체가 문서인 경우 — docs 하위뿐 아니라
      //   저장소 전체에서 문서를 찾아서"). 예전엔 뿌리의 docs/doc/… 를 먼저 찾아 그 아래만 읽었다.
      let dir = askedPath || ref.path || '';
      let tree = await gh.treeUnder(ref.owner, ref.repo, branch, dir);
      if (tree.truncated && !dir) {
        // 저장소가 너무 커서 전체 목록이 잘렸다 — 문서 폴더가 있으면 그리로 물러선다
        const docsDir = detectDocsDir((await gh.tree(ref.owner, ref.repo, branch, false)).entries);
        if (docsDir) {
          dir = docsDir;
          tree = await gh.treeUnder(ref.owner, ref.repo, branch, dir);
          scopeNote = `\n(저장소가 너무 커서 GitHub 이 전체 목록을 잘랐습니다 — 문서 폴더 "${dir}" 만 가져왔습니다. 다른 폴더는 \`path\` 로 따로 가져오세요.)`;
        }
      }
      if (tree.truncated) {
        return text(`${ref.owner}/${ref.repo}@${branch} 의 "${dir || '/'}" 아래가 너무 커서 GitHub 이 목록을 잘랐습니다 — \`path\` 로 더 좁혀 주세요.`, true);
      }
      src = { owner: ref.owner, repo: ref.repo, ref: branch, path: dir };
      files = selectDocFiles(tree.entries, dir);
    } catch (err) {
      if (err instanceof GithubError) return text(err.message, true);
      throw err;
    }
    if (files.length === 0) {
      return text(
        `${src.owner}/${src.repo}@${src.ref} 의 "${src.path || '/'}" 아래에 마크다운 문서(.md)가 없습니다 — \`path\` 로 문서 폴더를 지정해 주세요.`, true,
      );
    }
    let limitNote = '';
    if (files.length > maxFiles) {
      limitNote = `\n(문서가 ${files.length}개라 경로순 앞 ${maxFiles}개만 가져왔습니다 — \`max_files\` 를 늘리거나 \`path\` 로 좁혀 주세요.)`;
      files = files.slice(0, maxFiles);
    }
    // ★ 익명이면 커밋 시각은 앞 50개만 (2026-10-04) — 예전엔 50개가 넘으면 통째로 거절했다.
    //   원문은 한도를 쓰지 않으니 문서는 전부 가져오고, 커밋 시각만 "(알 수 없음)" 으로 남긴다.
    //   갱신(update_map_from_github)은 파일 sha 로 비교하므로 커밋 시각이 없어도 된다.
    const commitBudget = gh.authenticated ? files.length : McpToolsService.ANON_FILE_LIMIT;
    const skippedCommits = Math.max(0, files.length - commitBudget);

    let docs: DocInput[];
    try {
      const withIdx = files.map((f, i) => ({ f, i }));
      docs = await mapLimit(withIdx, McpToolsService.FETCH_CONCURRENCY, ({ f, i }) => this.loadDoc(gh, src, f, i < commitBudget));
    } catch (err) {
      if (err instanceof GithubError) return text(err.message, true);
      throw err;
    }

    const askedTitle = typeof args.title === 'string' ? args.title.trim() : '';
    const title = (askedTitle || `${src.repo} 문서`).slice(0, 255);
    const fetchedAt = new Date().toISOString();
    const map = buildDocsMap(src, docs, title, fetchedAt);
    const snapshot = { v: 2, map, editor: { layoutType: 'radial-bidirectional', spacingX: 1, spacingY: 1 } };

    // 템플릿 — create_map 과 같은 길. 비우면 **방사형(양쪽)** — create_map·앱 새 맵과 같다
    // (2026-09-29 사용자 결정: 처음엔 트리·오른쪽(TR)이 기본이었는데 "새 맵의 레이아웃이
    // 왜 트리가 기본인가" — 문서 가져오기만 다른 기본을 갖지 않는다)
    let templateNote = '';
    try {
      const askedTemplate = typeof args.template === 'string' && args.template.trim();
      const tpl = askedTemplate ? templateFor(askedTemplate, '') : {};
      if (tpl.editor) snapshot.editor = { ...snapshot.editor, layoutType: tpl.editor.layoutType };
      if (tpl.settings) {
        snapshot.map.settings = { ...(snapshot.map.settings ?? {}), ...tpl.settings };
        if (tpl.settings.levelLayouts) {
          snapshot.map.branches = applyLevelLayouts(
            snapshot.map.branches as unknown as MindNode[], tpl.settings.levelLayouts,
          ) as unknown as typeof snapshot.map.branches;
        }
      }
      if (tpl.editor) templateNote = ` · 레이아웃: ${tpl.editor.layoutType}`;
    } catch (err) {
      if (err instanceof TemplateError) return text(err.message, true);
      throw err;
    }

    let mapId: string;
    try {
      mapId = (await this.maps.create(userId, { title })).mapId;
    } catch (err) {
      return text(mapError(err, '맵을 만들지 못했습니다'), true);
    }
    try {
      await this.maps.saveDocument(userId, mapId, snapshot, title, true);
    } catch (err) {
      await this.maps.remove(userId, mapId).catch(() => { /* 원래 오류가 우선 */ });
      this.log.warn(`MCP import_github_docs 문서 저장 실패 (user=${userId})`, err as Error);
      return text(mapError(err, '맵 내용을 저장하지 못했습니다'), true);
    }
    const nodes = 1 + countNodes(map.branches);
    const noCommit = docs.filter((d) => !d.commit).length;
    return text(
      `EasyMindMap 문서함에 "${title}" 맵을 만들었습니다 — ${src.owner}/${src.repo}@${src.ref} 의 ${src.path ? `"${src.path}" 아래` : '저장소 전체'} 문서 ${docs.length}개 · 노드 ${nodes}개${templateNote}.\n` +
      `맵 id: ${mapId}\n` +
      (skippedCommits
        ? `(익명 GitHub 호출 한도(시간당 60회) 때문에 문서 ${skippedCommits}개는 커밋 시각을 읽지 않고 "(알 수 없음)" 으로 적었습니다 — 내용은 모두 가져왔습니다. API 서버에 GITHUB_TOKEN 을 넣으면 전부 읽습니다.)\n`
        : noCommit ? `(문서 ${noCommit}개는 커밋 시각을 읽지 못해 "(알 수 없음)" 으로 적었습니다.)\n` : '') +
      (limitNote ? `${limitNote.trim()}\n` : '') +
      (scopeNote ? `${scopeNote.trim()}\n` : '') +
      '나중에 "이 맵을 업데이트 해줘" 라고 하면 update_map_from_github 이 저장소 변경을 반영합니다.',
    );
  }

  private async updateMapFromGithub(userId: string, args: Record<string, unknown>): Promise<ToolResult> {
    const rid = this.resolveMapId(userId, args.map_id);
    if ('error' in rid) return text(rid.error, true);
    const mapId = rid.mapId;
    let nodeArg = typeof args.node === 'string' ? args.node.trim() : '';
    if (nodeArg && McpToolsService.isSelectedWord(nodeArg)) {
      const f = this.focus.get(userId);
      if (!f) return text('앱에서 선택한 노드를 알 수 없습니다 — 앱에서 그 맵을 열어 두고 노드를 고른 뒤 다시 불러 주세요(1분 안에 알려집니다).', true);
      if (f.mapId !== mapId) {
        return text(`앱에서 지금 열어 둔 맵은 다른 맵(id: ${f.mapId})입니다 — 그 맵이면 map_id:"current" 로, 이 맵이면 node 를 노드 이름으로 적어 주세요.`, true);
      }
      nodeArg = f.nodeId === null || f.nodeId === 'root' ? '' : `id:${f.nodeId}`;
    }

    const opened = await this.openForWrite(userId, mapId, '갱신할');
    if ('error' in opened) return text(opened.error, true);
    const docRes = opened.docRes;
    let map;
    try { map = mapFromDoc(docRes.doc); } catch (err) {
      if (err instanceof DocShapeError) return text(err.message, true);
      throw err;
    }
    const src = readSource(map);
    if (!src) {
      return text(`"${docRes.title}" 맵은 import_github_docs 로 만든 맵이 아닙니다(루트 노트에 \`출처: github:…\` 가 없습니다) — 갱신할 저장소를 모릅니다. 새로 만들려면 import_github_docs 를 쓰세요.`, true);
    }

    let scope: UpdateScope | null;
    let scopeLabel = '맵 전체';
    if (!nodeArg || /^root$/i.test(nodeArg)) {
      scope = { kind: 'all' };
    } else {
      let found;
      try { found = findByPath(map, nodeArg); } catch (err) {
        if (err instanceof AppendError) return text(err.message, true);
        throw err;
      }
      scope = resolveScope(src, map, found.node);
      if (!scope) {
        return text(`"${found.path}" 노드는 GitHub 문서에서 온 노드가 아닙니다(폴더·문서·문서 안의 절 노드만 갱신할 수 있습니다). 노드 이름을 다시 확인하거나 node 를 비워 맵 전체를 갱신해 주세요.`, true);
      }
      scopeLabel = scope.kind === 'all' ? '맵 전체'
        : scope.kind === 'folder' ? `폴더 "${found.path}"`
          : scope.kind === 'file' ? `문서 "${found.path}"`
            : `절 "${found.path}"`;
    }

    const gh = new GithubClient();
    let remote: RemoteFile[];
    try {
      const tree = await gh.treeUnder(src.owner, src.repo, src.ref, src.path);
      // ★ 잘린 목록으로는 계획하지 않는다 — 빠진 문서가 전부 "사라진 것" 이 되어
      //   노드를 지운다(#531 Codex 지적). 문서 폴더 아래만 받으므로 드문 일이다.
      if (tree.truncated) {
        return text(`${src.owner}/${src.repo}@${src.ref} 의 "${src.path || '/'}" 아래가 너무 커서 GitHub 이 목록을 잘랐습니다 — 잘린 목록으로 갱신하면 멀쩡한 문서 노드가 지워질 수 있어 멈췄습니다. 폴더를 나눠 별도 맵으로 가져오는 것을 권합니다.`, true);
      }
      remote = selectDocFiles(tree.entries, src.path);
    } catch (err) {
      if (err instanceof GithubError) return text(err.message, true);
      throw err;
    }
    const pre = planUpdate(map, src, scope, remote);
    let plan;
    try {
      // 옛 맵(파일 sha 없음)만 커밋 시각으로 판정 — 익명 한도 안에서
      const commits = new Map<string, FileCommit | null>();
      const checks = pre.needsCommitCheck.map((c) => c.file);
      if (!gh.authenticated && checks.length + pre.added.length + pre.updated.length > McpToolsService.ANON_FILE_LIMIT) {
        return text(`비교·갱신할 문서가 ${checks.length + pre.added.length + pre.updated.length}개인데 익명 GitHub 호출은 시간당 60회입니다 — API 서버에 GITHUB_TOKEN 을 넣거나 node 로 범위를 좁혀 주세요.`, true);
      }
      const got = await mapLimit(checks, McpToolsService.FETCH_CONCURRENCY, (f) => gh.lastCommit(src.owner, src.repo, src.ref, f.path).catch(() => null));
      checks.forEach((f, i) => commits.set(f.path, got[i]));
      plan = settleByCommit(pre, commits);
    } catch (err) {
      if (err instanceof GithubError) return text(err.message, true);
      throw err;
    }

    // ★ 반영 대기(PR) — push_map_to_github 가 PR 로 올린 문서는 **머지 전이면 건너뛴다**
    //   (2026-10-14, §9.15). 기준 브랜치에는 아직 옛 내용(또는 파일 없음)이라 그대로 맞추면
    //   맵에서 고쳐 올린 내용이 옛 내용으로 되돌아가거나(수정) 새 파일 노드가 지워진다(삭제).
    //   머지·닫힘이면 평소처럼 맞추고 "PR #n 대기" 표시를 지운다.
    const pendingRefs: FileNodeRef[] = (scope.kind === 'file' || scope.kind === 'section'
      ? [{ node: scope.kind === 'file' ? scope.node : scope.fileNode, siblings: [], index: 0, path: scope.path, meta: null }]
      : collectFileNodes(src, scope.kind === 'folder' ? (scope.node.children ?? []) : (map.branches as MindNode[])))
      .filter((r) => pendingPrOf(r.node) !== null);
    const held: string[] = [];
    const clearIds: string[] = [];
    if (pendingRefs.length) {
      const states = new Map<number, string>();
      for (const num of new Set(pendingRefs.map((r) => pendingPrOf(r.node) as number))) {
        // 묻다 실패하면 **열려 있는 것으로** — 모르면 되돌리지 않는 쪽이 안전하다
        states.set(num, await gh.pullState(src.owner, src.repo, num).catch(() => 'open'));
      }
      const openIds = new Set(pendingRefs.filter((r) => states.get(pendingPrOf(r.node) as number) === 'open').map((r) => r.node.id));
      pendingRefs.forEach((r) => { if (!openIds.has(r.node.id)) clearIds.push(r.node.id); });
      const keep = (ref: FileNodeRef): boolean => {
        if (!openIds.has(ref.node.id)) return true;
        held.push(`${ref.path} (PR #${pendingPrOf(ref.node)} 머지 전)`);
        return false;
      };
      plan.updated = plan.updated.filter((u) => keep(u.ref));
      plan.removed = plan.removed.filter((r) => keep(r));
    }
    const heldNote = held.length ? `\n머지 전이라 건너뛴 문서 ${held.length}개:\n${listSome(held)}` : '';

    if (plan.added.length === 0 && plan.updated.length === 0 && plan.removed.length === 0) {
      if (clearIds.length) {
        const copy = JSON.parse(JSON.stringify(map)) as typeof map;
        const cleared = clearPendingIn(copy, clearIds);
        if (cleared) {
          const saved = await this.saveVersion(userId, mapId, docRes.doc, copy, 'update_map_from_github', '대기 표시를 지운 맵을');
          if ('error' in saved) return text(saved.error, true);
          return text(`"${docRes.title}" 맵(${scopeLabel})은 저장소와 같습니다 — PR 이 머지(또는 닫힘)된 문서 ${cleared}개의 "PR 대기" 표시를 지웠습니다.${saved.versionNote}${heldNote}`);
        }
      }
      return text(`"${docRes.title}" 맵(${scopeLabel})은 이미 저장소와 같습니다 — 바뀐 문서가 없어 저장하지 않았습니다 (문서 ${plan.unchanged}개 그대로).${heldNote}`);
    }

    let applied;
    try {
      applied = await applyUpdate(
        map, src, scope, plan,
        async (f) => { const d = await this.loadDoc(gh, src, f); return { markdown: d.markdown, commit: d.commit }; },
        new Date().toISOString(), new IdGen(),
      );
    } catch (err) {
      if (err instanceof GithubError) return text(err.message, true);
      throw err;
    }
    if (applied.sectionGone && applied.updated.length === 0 && applied.added.length === 0 && applied.removed.length === 0) {
      return text(`저장소의 문서에 "${applied.sectionGone}" 절이 더 이상 없습니다 — 이 절 노드는 그대로 두었습니다. 문서 노드 전체를 갱신하면(node 에 문서 이름) 이 절 노드가 지워집니다.`, true);
    }

    if (clearIds.length) clearPendingIn(applied.map, clearIds);
    const saved = await this.saveVersion(userId, mapId, docRes.doc, applied.map, 'update_map_from_github', '갱신한 내용을');
    if ('error' in saved) return text(saved.error, true);
    const lines: string[] = [];
    if (applied.added.length) lines.push(`추가 ${applied.added.length}개:\n${listSome(applied.added)}`);
    if (applied.updated.length) lines.push(`수정 ${applied.updated.length}개:\n${listSome(applied.updated)}`);
    if (applied.removed.length) lines.push(`삭제 ${applied.removed.length}개${applied.removedFolders ? ` (빈 폴더 ${applied.removedFolders}개 함께)` : ''}:\n${listSome(applied.removed)}`);
    if (plan.unchanged) lines.push(`그대로 ${plan.unchanged}개`);
    return text(
      `"${docRes.title}" 맵(${scopeLabel})을 ${src.owner}/${src.repo}@${src.ref} 에 맞췄습니다.${saved.versionNote}\n${lines.join('\n')}${heldNote}\n` + LIVE_NOTE,
    );
  }

  // ── 맵 → GitHub 반영 (2026-10-14, §9.15) ─────────────────────────────

  /**
   * 맵에서 고친 내용을 저장소 파일로. **confirm 없이 부르면 미리보기만** — 아무것도
   * 쓰지 않고 확인 코드를 준다. 같은 계획(기준 커밋·방식·파일 내용)일 때만 그 코드가
   * 맞으므로, 미리보기 뒤 맵이나 저장소가 바뀌면 쓰지 않고 새 미리보기를 돌려준다.
   * 쓰기는 `GITHUB_WRITE_TOKEN` + `GITHUB_PUSH_ALLOW`(사용자·저장소 허용 목록)가 있어야 한다.
   */
  private async pushMapToGithub(userId: string, args: Record<string, unknown>): Promise<ToolResult> {
    const rid = this.resolveMapId(userId, args.map_id);
    if ('error' in rid) return text(rid.error, true);
    const mapId = rid.mapId;
    if (args.mode !== undefined && args.mode !== null && args.mode !== '' && args.mode !== 'pr' && args.mode !== 'commit') {
      return text('`mode` 는 "pr"(기본 — 새 브랜치 + PR) 또는 "commit"(바로 커밋) 입니다.', true);
    }
    const mode: 'pr' | 'commit' = args.mode === 'commit' ? 'commit' : 'pr';
    const confirm = typeof args.confirm === 'string' ? args.confirm.trim().toLowerCase() : '';
    let nodeArg = typeof args.node === 'string' ? args.node.trim() : '';
    if (nodeArg && McpToolsService.isSelectedWord(nodeArg)) {
      const f = this.focus.get(userId);
      if (!f) return text('앱에서 선택한 노드를 알 수 없습니다 — 앱에서 그 맵을 열어 두고 노드를 고른 뒤 다시 불러 주세요(1분 안에 알려집니다).', true);
      if (f.mapId !== mapId) {
        return text(`앱에서 지금 열어 둔 맵은 다른 맵(id: ${f.mapId})입니다 — 그 맵이면 map_id:"current" 로, 이 맵이면 node 를 노드 이름으로 적어 주세요.`, true);
      }
      nodeArg = f.nodeId === null || f.nodeId === 'root' ? '' : `id:${f.nodeId}`;
    }

    // 쓰기용으로 연다 — 반영 뒤 맵도 맞추므로(편집 권한·협업 방 규칙 그대로)
    const opened = await this.openForWrite(userId, mapId, 'GitHub 에 반영할');
    if ('error' in opened) return text(opened.error, true);
    const docRes = opened.docRes;
    let map;
    try { map = mapFromDoc(docRes.doc); } catch (err) {
      if (err instanceof DocShapeError) return text(err.message, true);
      throw err;
    }
    const src = readSource(map);
    if (!src) {
      return text(`"${docRes.title}" 맵은 import_github_docs 로 만든 맵이 아닙니다(루트 노트에 \`출처: github:…\` 가 없습니다) — 어느 저장소에 반영할지 모릅니다.`, true);
    }

    let scope: UpdateScope | null = { kind: 'all' };
    let scopeLabel = '맵 전체';
    if (nodeArg && !/^root$/i.test(nodeArg)) {
      let found;
      try { found = findByPath(map, nodeArg); } catch (err) {
        if (err instanceof AppendError) return text(err.message, true);
        throw err;
      }
      scope = resolveScope(src, map, found.node);
      if (!scope) {
        return text(`"${found.path}" 노드는 GitHub 문서에서 온 노드가 아닙니다 — 폴더·문서 노드(또는 문서 안의 절)를 고르거나 node 를 비워 맵 전체를 반영하세요.`, true);
      }
      // 절을 골랐어도 파일은 통째로 올라간다 — 그 문서 노드 전체를 비교한다
      if (scope.kind === 'section') scope = { kind: 'file', path: scope.path, node: scope.fileNode };
      scopeLabel = scope.kind === 'folder' ? `폴더 "${found.path}"` : scope.kind === 'file' ? `문서 "${scope.path}"` : '맵 전체';
    }

    // 기준 = 지금 브랜치의 커밋 하나. 목록·원문을 모두 그 커밋에서 읽고, 새 커밋의 부모도 그것이다.
    const gh = new GithubClient();
    let headSha: string;
    let remote: RemoteFile[];
    let repoPaths: Set<string>;
    try {
      headSha = await gh.headSha(src.owner, src.repo, src.ref);
      const tree = await gh.treeUnder(src.owner, src.repo, headSha, src.path);
      if (tree.truncated) {
        return text(`${src.owner}/${src.repo}@${src.ref} 의 "${src.path || '/'}" 아래가 너무 커서 GitHub 이 목록을 잘랐습니다 — 잘린 목록으로는 새 파일이 있는 파일을 덮을 수 있어 멈췄습니다.`, true);
      }
      remote = selectDocFiles(tree.entries, src.path);
      repoPaths = new Set(tree.entries.map((e) => e.path));
    } catch (err) {
      if (err instanceof GithubError) return text(err.message, true);
      throw err;
    }

    const roots: MindNode[] = scope.kind === 'all' ? (map.branches as MindNode[])
      : scope.kind === 'folder' ? (scope.node.children ?? []) : [];
    const refs: FileNodeRef[] = scope.kind === 'file'
      ? [{ node: scope.node, siblings: [scope.node], index: 0, path: scope.path, meta: readFileMeta(scope.node) }]
      : collectFileNodes(src, roots);
    const byPath = new Map(remote.map((f) => [f.path, f]));
    const conflicts: string[] = [];
    const ready: { ref: FileNodeRef; file: RemoteFile }[] = [];
    for (const r of refs) {
      const pr = pendingPrOf(r.node);
      if (pr !== null) { conflicts.push(`${r.path} — PR #${pr} 이 아직 반영 대기입니다. 머지한 뒤 update_map_from_github 로 맞추고 다시 반영하세요.`); continue; }
      const f = byPath.get(r.path);
      if (!f) { conflicts.push(`${r.path} — 저장소(${src.ref})에 이 파일이 없습니다.`); continue; }
      ready.push({ ref: r, file: f });
    }

    // 원문을 읽고 비교 — 맵이 가져온 판(blob sha)과 같은 파일만 반영한다.
    // 판이 다르면 기준이 없다: 맵과 내용이 다르면 충돌, 같으면(맵에서 고친 것 없음) 조용히 건너뛴다.
    let loaded: { ref: FileNodeRef; file: RemoteFile; change: FileChange; base: boolean }[];
    try {
      loaded = await mapLimit(ready, McpToolsService.FETCH_CONCURRENCY, async ({ ref, file }) => {
        const md = await gh.raw(src.owner, src.repo, headSha, file.path);
        const base = Boolean(ref.meta?.blobSha && file.blobSha.startsWith(ref.meta.blobSha));
        return { ref, file, change: diffFileNode(file.path, ref.node, md), base };
      });
    } catch (err) {
      if (err instanceof GithubError) return text(err.message, true);
      throw err;
    }
    const edits: FileChange[] = [];
    const warnings: string[] = [];
    let behind = 0;
    for (const l of loaded) {
      if (!l.base) {
        if (!l.change.changed) { behind++; continue; }
        conflicts.push(l.ref.meta?.blobSha
          ? `${l.file.path} — 맵을 가져온 뒤 GitHub 쪽 파일이 바뀌었습니다(맵 ${l.ref.meta.blobSha.slice(0, 7)} · 저장소 ${l.file.blobSha.slice(0, 7)}). update_map_from_github 로 맞추면 맵에서 고친 내용이 GitHub 내용으로 바뀌니, 고친 내용을 따로 적어 두고 맞춘 뒤 다시 고쳐 주세요.`
          : `${l.file.path} — 맵에 파일 sha 가 없는 옛 노드라 비교 기준이 없습니다. update_map_from_github 로 먼저 맞추세요.`);
        continue;
      }
      if (l.change.changed) edits.push(l.change);
      l.change.warnings.forEach((w) => warnings.push(`${l.file.path}: ${w}`));
    }

    // 새 파일 — 문서 하나만 골랐으면 찾지 않는다
    const newErrors: string[] = [];
    const newFiles = scope.kind === 'file' ? []
      : collectNewFiles(src, roots, scope.kind === 'folder' ? scope.dir : src.path, repoPaths, newErrors);
    newFiles.forEach((n) => n.warnings.forEach((w) => warnings.push(`${n.path}: ${w}`)));
    const inMap = new Set(collectFileNodes(src, map.branches as MindNode[]).map((r) => r.path));
    const notInMap = scope.kind === 'all' ? remote.filter((f) => !inMap.has(f.path)).map((f) => f.path) : [];
    const behindNote = behind
      ? `\n(GitHub 쪽이 더 새로운 문서 ${behind}개는 맵에서 고친 것이 없어 건너뛰었습니다 — update_map_from_github 로 맵을 맞출 수 있습니다.)`
      : '';

    const preview = formatPushPreview({
      mapTitle: docRes.title, src, headSha, mode, edits, newFiles, conflicts, errors: newErrors,
      warnings: [...new Set(warnings)], notInMap,
    }) + behindNote;
    if (edits.length === 0 && newFiles.length === 0) {
      return text(`"${docRes.title}" 맵(${scopeLabel})에는 GitHub 에 반영할 변경이 없습니다.\n\n${preview}`, conflicts.length + newErrors.length > 0);
    }

    const files = [
      ...edits.map((e) => ({ path: e.path, content: e.after })),
      ...newFiles.map((n) => ({ path: n.path, content: n.content })),
    ];
    const code = planCode({ headSha, mode, files });
    const writer = new GithubWriter();
    const blockers: string[] = [];
    if (!writer.configured) blockers.push('API 서버에 GITHUB_WRITE_TOKEN 이 없습니다 — 서버 관리자가 이 저장소에 쓸 수 있는 토큰을 넣어야 반영할 수 있습니다.');
    if (!pushAllowed(process.env.GITHUB_PUSH_ALLOW, userId, src.owner, src.repo)) {
      blockers.push(`이 계정(${userId})은 ${src.owner}/${src.repo} 에 반영하도록 허용되지 않았습니다 — API 서버의 GITHUB_PUSH_ALLOW 에 "${src.owner}/${src.repo}=${userId}" 를 넣어야 합니다.`);
    }
    if (!confirm) {
      return text(
        `${preview}\n\n` + (blockers.length
          ? `지금은 반영할 수 없습니다:\n${blockers.map((b) => `  · ${b}`).join('\n')}`
          : `확인 코드: ${code}\n사용자에게 위 내용을 보여 주고 승인을 받은 뒤, 같은 인자에 confirm:"${code}" 를 붙여 다시 부르세요.`),
      );
    }
    if (confirm !== code) {
      return text(`확인 코드(${confirm})가 지금 계획과 맞지 않습니다 — 미리보기 뒤에 맵이나 저장소(또는 mode)가 바뀌었습니다. 아래 새 미리보기를 사용자에게 다시 보여 주세요.\n\n${preview}\n\n새 확인 코드: ${code}`, true);
    }
    if (blockers.length) return text(blockers.join('\n'), true);

    // 쓰기 — 커밋 하나(트리 → 커밋 → 브랜치). 실패하면 맵은 그대로 둔다.
    const title = docRes.title;
    const subject = ((typeof args.message === 'string' && args.message.trim()) || `docs: EasyMindMap 맵 "${title}" 수정 반영 (파일 ${files.length}개)`).slice(0, 200);
    const fileList = [
      ...edits.map((e) => `- ${e.path}${e.ops.length ? `\n${e.ops.map((o) => `  - ${o}`).join('\n')}` : ''}`),
      ...newFiles.map((n) => `- ${n.path} (새 파일)`),
    ].join('\n');
    const body = `EasyMindMap 맵 "${title}" 에서 고친 내용을 push_map_to_github 로 반영합니다.\n\n${fileList}\n\n맵 id: ${mapId} · 기준 커밋 ${headSha.slice(0, 7)}`.slice(0, 60000);
    let commit: { sha: string; date: string };
    let branch = src.ref;
    try {
      const baseTree = await writer.commitTree(src.owner, src.repo, headSha);
      const treeSha = await writer.createTree(src.owner, src.repo, baseTree, files);
      commit = await writer.createCommit(src.owner, src.repo, `${subject}\n\n${body}`.slice(0, 60000), treeSha, headSha);
      if (mode === 'commit') {
        await writer.fastForward(src.owner, src.repo, src.ref, commit.sha);
      } else {
        branch = `emm/${mapId.slice(0, 8)}-${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}`;
        await writer.createBranch(src.owner, src.repo, branch, commit.sha);
      }
    } catch (err) {
      if (err instanceof GithubError) return text(`GitHub 에 반영하지 못했습니다 — ${err.message}\n(맵은 바꾸지 않았습니다.)`, true);
      throw err;
    }
    let pr: { number: number; url: string } | null = null;
    if (mode === 'pr') {
      try {
        pr = await writer.createPull(src.owner, src.repo, { title: subject, head: branch, base: src.ref, body });
      } catch (err) {
        if (err instanceof GithubError) {
          return text(`브랜치 ${branch} 에 커밋(${commit.sha.slice(0, 7)})은 올렸지만 PR 을 열지 못했습니다 — ${err.message}\nGitHub 에서 그 브랜치로 PR 을 직접 열어 주세요. 맵은 바꾸지 않았습니다.`, true);
        }
        throw err;
      }
    }

    // 맵 맞추기 — 반영한 문서 노드를 반영한 원문으로 다시 만든다(파일 sha 가 새 원문과 같아진다)
    const pushed: PushedFile[] = [
      ...edits.map((e) => ({ path: e.path, nodeId: e.nodeId, markdown: e.after, isNew: false })),
      ...newFiles.map((n) => ({ path: n.path, nodeId: n.nodeId, markdown: n.content, isNew: true, parentDir: n.parentDir, subDirs: n.subDirs })),
    ];
    const next = applyPushToMap(map, src, pushed, commit, pr ? pr.number : null, new IdGen());
    const where = pr
      ? `PR #${pr.number}: ${pr.url}`
      : `커밋 ${commit.sha.slice(0, 7)}: https://github.com/${src.owner}/${src.repo}/commit/${commit.sha}`;
    const saved = await this.saveVersion(userId, mapId, docRes.doc, next, 'push_map_to_github', 'GitHub 반영 뒤 맵을');
    if ('error' in saved) {
      return text(`GitHub 에는 반영했습니다(${where}). 그런데 맵을 반영한 내용으로 맞추지 못했습니다 — ${saved.error}\n${pr ? 'PR 을 머지한 뒤' : '지금'} update_map_from_github 로 이 맵을 맞춰 주세요.`, true);
    }
    return text(
      `"${title}" 맵(${scopeLabel})에서 고친 내용을 ${src.owner}/${src.repo} 에 반영했습니다 — ${where}${saved.versionNote}\n` +
      (edits.length ? `수정 ${edits.length}개:\n${listSome(edits.map((e) => e.path))}\n` : '') +
      (newFiles.length ? `새 파일 ${newFiles.length}개:\n${listSome(newFiles.map((n) => n.path))}\n` : '') +
      (conflicts.length ? `건너뜀 ${conflicts.length}개:\n${listSome(conflicts)}\n` : '') +
      (pr ? `PR 이 머지되기 전에는 이 문서들에 "PR #${pr.number} 대기" 가 표시되고, update_map_from_github 는 머지 전까지 이 문서들을 건너뜁니다.\n` : '') +
      LIVE_NOTE,
    );
  }

  // ── 유튜브 영상 → 맵 (2026-10-14, §9.16) ────────────────────────────

  /** 자막 한 번에 보내는 글자 수 — 기본과 상한 (길면 start_at 으로 이어 읽는다) */
  private static readonly YT_DEFAULT_CHARS = 30000;
  private static readonly YT_MAX_CHARS = 100000;

  /**
   * 유튜브 영상의 정보·챕터·시각 붙은 자막을 돌려준다 — 요약과 `create_map` 은 부른 AI 가 한다.
   * 읽기만 한다(맵·계정과 무관 — 사용자 id 도 쓰지 않는다).
   */
  private async getYoutubeTranscript(args: Record<string, unknown>): Promise<ToolResult> {
    const raw = typeof args.url === 'string' ? args.url : '';
    let id: string;
    try { id = parseVideoId(raw); } catch (err) {
      if (err instanceof YoutubeError) return text(err.message, true);
      throw err;
    }
    const askedStart = Number(args.start_at);
    const startAt = Number.isFinite(askedStart) && askedStart > 0 ? Math.floor(askedStart) : parseStartParam(raw);
    const maxChars = Math.max(2000, Math.min(McpToolsService.YT_MAX_CHARS, Number(args.max_chars) || McpToolsService.YT_DEFAULT_CHARS));
    const lang = typeof args.lang === 'string' ? args.lang.trim() : '';

    const yt = new YoutubeClient();
    try {
      const info = await yt.video(id);
      const track = pickTrack(info.tracks, lang);
      if (!track) {
        return text(
          `"${info.title}" (${info.author}) 영상에는 자막이 없습니다 — 자막 없이는 내용을 요약할 수 없습니다. ` +
          '사용자에게 스크립트를 붙여 넣어 달라고 하거나, 제목·설명만으로 만들지 물어 보세요.' +
          (info.description ? `\n설명(앞부분): ${info.description.slice(0, 600)}` : ''),
          true,
        );
      }
      if (lang && !track.languageCode.toLowerCase().startsWith(lang.toLowerCase().split('-')[0])) {
        // 요청한 언어가 없으면 있는 것으로 읽는다 — 결과의 `자막:` 줄이 어느 언어인지 말해 준다
        this.log.debug(`get_youtube_transcript: ${id} 에 ${lang} 자막 없음 — ${track.languageCode} 로 읽음`);
      }
      const segments = await yt.captions(track);
      if (segments.length === 0) {
        return text(`"${info.title}" 의 자막(${track.languageCode})을 받았지만 비어 있습니다 — YouTube 가 자막 본문을 내주지 않았습니다. 잠시 뒤 다시 시도하거나 사용자에게 스크립트를 붙여 넣어 달라고 하세요.`, true);
      }
      const chapters = parseChapters(info.description, info.lengthSec || Infinity);
      const page = buildTranscript(segments, chapters, startAt, maxChars);
      return text(formatTranscriptResult({ info, track, chapters, page, others: info.tracks.filter((t) => t !== track) }));
    } catch (err) {
      if (err instanceof YoutubeError) return text(err.message, true);
      this.log.warn(`MCP get_youtube_transcript 실패 (video=${id})`, err as Error);
      throw err;
    }
  }

  // ── PDF → 맵 (2026-10-14, §9.17) ─────────────────────────────────────

  private static readonly PDF_MAX_BYTES = 50 * 1024 * 1024;
  private static readonly PDF_MAX_PAGES = 300;
  private static readonly PDF_MAX_NODES = 8000;

  /** 맵 안의 PDF 첨부 — node 를 주면 그 노드 아래만 */
  private pdfAttachmentsIn(map: SampleMap, under: MindNode | null): { name: string; url: string }[] {
    const out: { name: string; url: string }[] = [];
    const walk = (n: MindNode) => {
      for (const a of n.attachments ?? []) {
        if (/\.pdf$/i.test(a.name ?? '')) out.push({ name: a.name, url: String(a.url ?? '') });
      }
      for (const c of n.children ?? []) walk(c);
    };
    if (under) walk(under);
    else for (const c of mapCenters(map)) { walk(c.root as unknown as MindNode); for (const b of c.branches) walk(b as unknown as MindNode); }
    return out;
  }

  private static attachmentId(s: string): string | null {
    return /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i.exec(s)?.[1] ?? null;
  }

  /** 첨부 읽기 — 열기 권한은 첨부 서비스 규칙 그대로(내 것 · 내 맵 · 내가 참가한 맵) */
  private async readAttachment(userId: string, id: string): Promise<{ bytes: Buffer; name: string }> {
    if (!this.attachments) throw new PdfError('이 서버에서는 첨부를 읽을 수 없습니다(첨부 모듈 없음).');
    let meta;
    try { meta = await this.attachments.open(userId, id); } catch (err) {
      throw new PdfError(`첨부를 열 수 없습니다 — ${(err as Error).message} (그 맵을 열 권한이 있는지, 첨부가 지워지지 않았는지 확인해 주세요)`);
    }
    if (meta.sizeBytes > McpToolsService.PDF_MAX_BYTES) {
      meta.stream.destroy();
      throw new PdfError(`첨부 PDF 가 너무 큽니다(${Math.round(meta.sizeBytes / 1024 / 1024)}MB) — 50MB 까지 읽습니다.`);
    }
    const chunks: Buffer[] = [];
    let total = 0;
    for await (const c of meta.stream as AsyncIterable<Buffer>) {
      total += c.length;
      if (total > McpToolsService.PDF_MAX_BYTES) { meta.stream.destroy(); throw new PdfError('첨부 PDF 가 너무 큽니다 — 50MB 까지 읽습니다.'); }
      chunks.push(c);
    }
    return { bytes: Buffer.concat(chunks), name: meta.name };
  }

  /** PDF 바이트 구하기 — attachment · url · data_base64 · map_id(+node) 중 하나 */
  private async pdfSource(userId: string, args: Record<string, unknown>): Promise<{ bytes: Buffer; name: string; source: string }> {
    const str = (k: string) => (typeof args[k] === 'string' ? (args[k] as string).trim() : '');
    const att = str('attachment'), url = str('url'), b64 = str('data_base64');
    if ([att, url, b64].filter(Boolean).length > 1) throw new PdfError('attachment · url · data_base64 중 하나만 주세요.');
    if (b64) {
      const bytes = Buffer.from(b64.replace(/^data:[^,]*,/, '').replace(/\s+/g, ''), 'base64');
      if (!bytes.length) throw new PdfError('data_base64 가 비어 있거나 base64 가 아닙니다.');
      return { bytes, name: str('file_name') || 'document.pdf', source: '직접 전달' };
    }
    if (url) {
      // 우리 첨부 주소면 권한 규칙대로 첨부로 읽는다(밖으로 다시 받지 않는다)
      const own = /\/v1\/attachments\//.test(url) ? McpToolsService.attachmentId(url) : null;
      if (own) return { ...(await this.readAttachment(userId, own)), source: 'EasyMindMap 첨부' };
      try {
        const r = await fetchRemotePdf(url, McpToolsService.PDF_MAX_BYTES);
        return { bytes: r.bytes, name: r.name, source: r.finalUrl };
      } catch (err) {
        if (err instanceof BlockedUrlError || err instanceof RemoteFetchError) throw new PdfError(`PDF 를 받아오지 못했습니다 — ${err.message}`);
        throw err;
      }
    }
    const directId = att ? McpToolsService.attachmentId(att) : null;
    if (directId) return { ...(await this.readAttachment(userId, directId)), source: 'EasyMindMap 첨부' };
    // 이름으로(또는 하나뿐인 PDF) — 맵에서 찾는다
    if (!str('map_id')) {
      throw new PdfError(att
        ? `"${att}" 는 첨부 주소·id 가 아닙니다 — 첨부 이름으로 찾으려면 map_id 도 주세요.`
        : 'PDF 를 어디서 읽을지 주세요 — attachment(EasyMindMap 첨부 주소·id) · url · data_base64, 또는 map_id(그 맵의 PDF 첨부). 대화창에 올린 파일은 도구로 넘어오지 않으니, 앱에서 노드에 PDF 를 첨부하거나 PDF 주소를 알려 달라고 하세요.');
    }
    const rid = this.resolveMapId(userId, args.map_id);
    if ('error' in rid) throw new PdfError(rid.error);
    let docRes;
    try { docRes = await this.maps.getDocument(userId, rid.mapId); } catch (err) { throw new PdfError(mapError(err, '맵을 읽지 못했습니다')); }
    let map: SampleMap;
    try { map = mapFromDoc(docRes.doc); } catch (err) { if (err instanceof DocShapeError) throw new PdfError(err.message); throw err; }
    let under: MindNode | null = null;
    let nodeArg = str('node');
    if (nodeArg && McpToolsService.isSelectedWord(nodeArg)) {
      const f = this.focus.get(userId);
      if (!f || f.mapId !== rid.mapId) throw new PdfError('앱에서 선택한 노드를 알 수 없습니다 — 그 맵을 열고 노드를 고른 뒤 다시 불러 주세요.');
      nodeArg = f.nodeId === null || f.nodeId === 'root' ? '' : `id:${f.nodeId}`;
    }
    if (nodeArg) {
      try { under = findByPath(map, nodeArg).node as MindNode | null; } catch (err) { if (err instanceof AppendError) throw new PdfError(err.message); throw err; }
    }
    let cands = this.pdfAttachmentsIn(map, under);
    if (att) {
      const exact = cands.filter((c) => c.name === att);
      cands = exact.length ? exact : cands.filter((c) => c.name.toLowerCase().includes(att.toLowerCase()));
    }
    if (cands.length === 0) {
      throw new PdfError(`"${docRes.title}" 맵${nodeArg ? '의 그 노드 아래' : ''}에 ${att ? `"${att}" 와 맞는 ` : ''}PDF 첨부가 없습니다 — 앱에서 노드의 링크·첨부 탭으로 PDF 를 올린 뒤 다시 불러 주세요.`);
    }
    if (cands.length > 1) throw new PdfError(`PDF 첨부가 ${cands.length}개입니다 — 어느 것인지 attachment 에 이름을 주세요: ${cands.map((c) => c.name).join(', ')}`);
    const id = McpToolsService.attachmentId(cands[0].url);
    if (!id) throw new PdfError(`"${cands[0].name}" 는 서버에 올린 첨부가 아니라 읽을 수 없습니다(맵 안에 내장된 파일) — 다시 첨부해 주세요.`);
    return { ...(await this.readAttachment(userId, id)), source: `EasyMindMap 첨부 (맵 "${docRes.title}")` };
  }

  /**
   * PDF → 새 맵. **요약하지 않는다** — 글을 모두 담고 구조(책갈피 → 글자 크기 → 번호 꼴 → 쪽)만 만든다.
   * 저장·템플릿·실패 시 지우기는 import_github_docs 와 같은 길.
   */
  private async importPdf(userId: string, args: Record<string, unknown>): Promise<ToolResult> {
    let src;
    try { src = await this.pdfSource(userId, args); } catch (err) {
      if (err instanceof PdfError) return text(err.message, true);
      throw err;
    }
    const pages = typeof args.pages === 'string' ? args.pages : '';
    const structure = (['auto', 'outline', 'fontsize', 'numbering', 'pages'].includes(String(args.structure)) ? args.structure : 'auto') as Structure;
    const longN = Number(args.long_text_to_note) > 0 ? Math.floor(Number(args.long_text_to_note)) : 0;
    let parsed, lines, built;
    let pics: PdfImagesResult | null = null;
    try {
      parsed = readPdf(src.bytes, { pages, maxPages: McpToolsService.PDF_MAX_PAGES });
      lines = linesFromPages(parsed.pages);
      const total = lines.pages.reduce((s, p) => s + p.lines.reduce((a, l) => a + l.text.length, 0), 0);
      if (total < Math.max(20, parsed.pages.length * 5)) {
        return text(`"${src.name}" 에서 글자를 거의 찾지 못했습니다(${parsed.pages.length}쪽에 ${total}자) — 스캔한 그림 PDF 인 것 같습니다. 이 도구는 OCR(그림 속 글자 읽기)을 하지 않습니다. 글자가 들어 있는 PDF 나 OCR 한 PDF 를 주세요.`, true);
      }
      // 그림 — 글로 옮기지 않고 노드 사진으로 (2026-10-17). 꺼내다 실패해도 글은 그대로 만든다
      if (args.images !== false) {
        try { pics = extractPdfImages(parsed.doc, parsed.pages); } catch (err) {
          this.log.warn(`MCP import_pdf 그림 꺼내기 실패 (${src.name})`, err as Error);
          pics = null;
        }
      }
      built = buildPdfMap({
        title: (typeof args.title === 'string' && args.title.trim()) || cleanPdfTitle(parsed.title),
        fileName: src.name, pageCount: parsed.pageCount, pages: lines.pages, outline: parsed.outline,
        structure, longTextToNote: longN, fetchedAt: new Date().toISOString(), source: src.source,
        images: pics?.images ?? [],
      });
    } catch (err) {
      if (err instanceof PdfError) return text(`"${src.name}" 을 읽지 못했습니다 — ${err.message}`, true);
      this.log.warn(`MCP import_pdf 읽기 실패 (${src.name})`, err as Error);
      return text(`"${src.name}" 을 읽지 못했습니다 — PDF 구조가 예상과 다릅니다(${(err as Error).message}). 다른 프로그램으로 다시 저장한 PDF 로 시도해 주세요.`, true);
    }
    if (built.nodes > McpToolsService.PDF_MAX_NODES) {
      return text(`노드가 ${built.nodes}개나 되어 맵 하나로 만들지 않았습니다(한 번에 ${McpToolsService.PDF_MAX_NODES}개까지) — pages 로 나누거나(예: "1-50"), long_text_to_note:200 처럼 긴 문단을 노트로 넣어 노드 수를 줄여 주세요.`, true);
    }
    const title = built.map.title;
    const snapshot = { v: 2, map: built.map, editor: { layoutType: 'radial-bidirectional', spacingX: 1, spacingY: 1 } };
    let templateNote = '';
    try {
      const askedTemplate = typeof args.template === 'string' && args.template.trim();
      const tpl = askedTemplate ? templateFor(askedTemplate, '') : {};
      if (tpl.editor) { snapshot.editor = { ...snapshot.editor, layoutType: tpl.editor.layoutType }; templateNote = ` · 레이아웃: ${tpl.editor.layoutType}`; }
      if (tpl.settings) {
        snapshot.map.settings = { ...(snapshot.map.settings ?? {}), ...tpl.settings };
        if (tpl.settings.levelLayouts) {
          snapshot.map.branches = applyLevelLayouts(snapshot.map.branches as unknown as MindNode[], tpl.settings.levelLayouts) as unknown as typeof snapshot.map.branches;
        }
      }
    } catch (err) {
      if (err instanceof TemplateError) return text(err.message, true);
      throw err;
    }
    let mapId: string;
    try { mapId = (await this.maps.create(userId, { title })).mapId; } catch (err) { return text(mapError(err, '맵을 만들지 못했습니다'), true); }
    try {
      await this.maps.saveDocument(userId, mapId, snapshot, title, true);
    } catch (err) {
      await this.maps.remove(userId, mapId).catch(() => { /* 원래 오류가 우선 */ });
      this.log.warn(`MCP import_pdf 문서 저장 실패 (user=${userId})`, err as Error);
      return text(mapError(err, '맵 내용을 저장하지 못했습니다'), true);
    }
    const why: Record<string, string> = { outline: 'PDF 책갈피', fontsize: '글자 크기(큰 글씨 = 제목)', numbering: '번호 꼴(Ⅰ. · 1. · 1.1)', pages: '쪽 (제목을 찾지 못해 쪽마다 가지)' };
    const margin = lines.removedMargin;
    const marginChars = margin.reduce((s, l) => s + l.text.length, 0);
    const unknown = parsed.pages.reduce((s, p) => s + p.unknownGlyphs, 0);
    const read = parsed.pages.length === parsed.pageCount ? `${parsed.pageCount}쪽 전부` : `${parsed.pageCount}쪽 중 ${parsed.pages.length}쪽`;
    return text(
      `EasyMindMap 문서함에 "${title}" 맵을 만들었습니다 — PDF "${src.name}" ${read} · 가지 기준: ${why[built.structureUsed]} · 제목 ${built.headings}개 · 문단·항목 ${built.paragraphs}개 · 노드 ${built.nodes}개${templateNote}.\n` +
      `맵 id: ${mapId}\n` +
      `요약하지 않고 글 ${built.charsInMap.toLocaleString('en-US')}자를 모두 담았습니다` +
      (margin.length ? ` (반복 머리글·바닥글·쪽 번호 ${margin.length}줄 ${marginChars}자는 뺐습니다)` : '') +
      (lines.droppedDup ? ` · 겹쳐 그린 글자 ${lines.droppedDup}자는 한 번만 넣었습니다` : '') + '.\n' +
      pdfImagesNote(built.images, pics, args.images === false) +
      (lines.emptyPages.length ? `글자가 없는 쪽(그림·스캔일 수 있음 — OCR 하지 않음): ${lines.emptyPages.slice(0, 20).join(', ')}${lines.emptyPages.length > 20 ? ' …' : ''}\n` : '') +
      (unknown ? `글꼴 정보가 없어 읽지 못한 글자 ${unknown}개가 있습니다(빠졌을 수 있음).\n` : '') +
      (longN ? `${longN}자 이상 문단은 제목 노드의 노트에 넣었습니다.\n` : '') +
      '표는 칸 구분 없이 줄 글로 들어갑니다. 제목 노드의 첫 노트에 원문 쪽(p.3–5)이 적혀 있습니다.',
    );
  }

}

/** import_pdf 결과의 그림 한 줄 — 넣은 수와 뺀 까닭 */
function pdfImagesNote(put: number, pics: PdfImagesResult | null, off: boolean): string {
  if (off) return '그림은 빼고 만들었습니다(images:false).\n';
  if (!pics) return '';
  const s = pics.skipped;
  const why = [
    s.format ? `형식(JPEG 2000·JBIG2·팩스 등) ${s.format}장` : '',
    s.tooBig ? `너무 큼 ${s.tooBig}장` : '',
    s.limit ? `맵 한도(${100}장·40MB) 넘음 ${s.limit}장` : '',
    s.broken ? `깨짐 ${s.broken}장` : '',
  ].filter(Boolean);
  const deco = s.small + s.repeated;
  if (!put && !why.length) return deco ? `그림: 아이콘·로고 같은 장식 ${deco}개는 넣지 않았습니다.\n` : '';
  return `그림 ${put}장은 글로 옮기지 않고 그 자리에 노드 사진("그림 (p.N)")으로 붙였습니다(그림 속 글자는 읽지 않음)` +
    (deco ? ` · 아이콘·로고 같은 장식 ${deco}개는 뺐습니다` : '') +
    (pics.opaque ? ` · 투명 배경이 있는 JPEG ${pics.opaque}장은 배경을 채운 채 넣었습니다` : '') +
    (why.length ? ` · 넣지 못한 그림: ${why.join(', ')}` : '') + '.\n';
}

/** 맵을 바꾼 도구가 끝에 붙이는 안내 — 열어 둔 앱 화면·되돌리기 (§9.8) */
const LIVE_NOTE =
  '앱에서 이 맵을 열어 두었다면 몇 초 안에 화면이 갱신됩니다(편집 중이던 내용이 있으면 앱이 초안으로 보관하고 안내합니다). ' +
  '되돌리려면 앱의 [히스토리] 에서 이전 버전을 복원하세요.';

/** 체크박스가 있는 노드를 보여 준다 — 하나도 못 맞췄을 때 AI 가 사용자에게 고르게 하려고 */
function hintCheckable(map: import('../emm/model').SampleMap): string {
  const rows = listCheckable(map);
  if (rows.length === 0) return '\n이 맵에는 체크박스(`- [ ] …` 줄·체크리스트 노트)가 있는 노드가 없습니다.';
  const shown = rows.slice(0, 20).map((r) =>
    `- "${r.path}": ${r.items.map((i) => `[${i.checked ? 'x' : ' '}] ${i.label}`).join(' · ')}`);
  const more = rows.length > 20 ? `\n… 외 ${rows.length - 20}개 노드` : '';
  return `\n체크박스가 있는 노드:\n${shown.join('\n')}${more}`;
}

/** 서비스가 던진 HttpException 의 **사람이 읽을 문장**만 꺼낸다 */
function mapError(err: unknown, fallback: string): string {
  const res = (err as { response?: unknown })?.response;
  const msg = typeof res === 'string' ? res
    : typeof (res as { message?: unknown })?.message === 'string'
      ? String((res as { message: string }).message)
      : (err as Error)?.message;
  return msg ? `${fallback}: ${msg}` : `${fallback}.`;
}

function countNodes(nodes: { children?: unknown[] }[]): number {
  let n = 0;
  for (const node of nodes) {
    n += 1 + countNodes((node.children ?? []) as { children?: unknown[] }[]);
  }
  return n;
}

/** create_map · append_to_map 공통 — 노드 내용이 기본, 말이 있을 때만 노트로 */
function placementArgs(args: Record<string, unknown>): {
  blockPlacement: 'node' | 'note'; codeToNote?: boolean; longParagraphToNote?: number;
} {
  const blockPlacement = args.block_placement === 'note' ? 'note' : 'node';
  const codeToNote = args.code_to_note === true || args.code_to_note === 'true' ? true : undefined;
  const raw = args.long_text_to_note;
  let longParagraphToNote: number | undefined;
  if (raw === true || raw === 'true') longParagraphToNote = 300;
  else if (typeof raw === 'number' && raw > 0) longParagraphToNote = Math.trunc(raw);
  else if (typeof raw === 'string' && /^\d+$/.test(raw)) longParagraphToNote = Number(raw);
  return { blockPlacement, codeToNote, longParagraphToNote };
}

function clampInt(v: unknown, min: number, max: number, dflt: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  if (!Number.isFinite(n)) return dflt;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

/** 대화에 실리는 시각 — 초·밀리초는 뺀다(읽는 것은 AI 와 사람이다) */
function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return '—';
  const t = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(t.getTime())) return '—';
  return t.toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
}
