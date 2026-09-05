import { Injectable, Logger } from '@nestjs/common';
import { FoldersService } from '../folders/folders.service';
import { MapsService } from '../maps/maps.service';
import { AppendError, appendSubtree, parseFragment } from './append-to-map';
import { DocShapeError, docToEmm, mapFromDoc } from './doc-to-emm';
import { EmmParseError, emmToSnapshot, titleFromSnapshot } from './emm-to-doc';
import { TemplateError, applyLevelLayouts, templateFor } from './map-template';

/**
 * MCP 가 AI 에게 주는 **도구 목록**과 그 실행.
 * 설계: docs/04-extensions/ai/mcp-connector.md §2
 *
 * 도구는 기존 `/v1` 엔드포인트를 **얇게 감싸기만 한다.** 쿼터·권한·이름
 * 중복 판정 같은 규칙은 전부 `MapsService` 안에 이미 있고, 여기서 다시
 * 만들지 않는다 — 두 벌이 되면 반드시 어긋난다(§2 머리말).
 *
 * 1단계 `create_map`(§7) + 2단계 `list_maps`·`get_map` + `append_to_map`
 * (2026-09-05). **지우는 도구는 없다**(§2-3). 고치는 것은 `append_to_map`
 * 하나이고 그것도 **덧붙이기만** 한다 — 있는 노드를 바꾸거나 빼지 않는다.
 */

export interface McpToolDef {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/**
 * 도구 설명은 **AI 가 읽는 유일한 사용설명서**다. "무엇을 하는가"보다
 * "언제 부르고 무엇을 넣어야 하는가"를 적는다 — 특히 `markdown` 이
 * 자유 서식이 아니라 **견출 구조**여야 한다는 것.
 */
export const TOOL_DEFS: McpToolDef[] = [
  {
    name: 'create_map',
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
        template: {
          type: 'string',
          description:
            '맵 모양 템플릿. 앱 라이브러리 이름("트리-진행트리맵"·"진행트리-트리맵"·"방사형 양쪽"·"방사형 오른쪽"·"시간배치"·"계층형 오른쪽"·"칸반") '
            + '또는 레이아웃 이름(tree-right, process-tree-right, radial-bidirectional, hierarchy-right, timeline, kanban …). '
            + '마크다운 안에 ```emm 코드블록으로 `template: progtree-tree` 를 적어도 같다(인자가 있으면 인자가 이긴다).',
        },
      },
      required: ['markdown'],
    },
  },
  {
    name: 'list_maps',
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
    title: 'EasyMindMap 맵 한 개를 마크다운으로 읽기',
    description:
      '맵 한 개의 내용을 **EMM 마크다운**(`# 중심 주제` · `## 가지` · `### 하위 가지` … 견출 구조)으로 ' +
      '돌려준다. 대화에서 기존 맵을 읽거나, 이어 쓰거나, 고친 결과를 `create_map` 으로 ' +
      '새 맵으로 저장할 때 쓴다. `map_id` 는 `list_maps` 가 준 값이다. ' +
      '이 도구는 읽기만 한다 — 맵을 바꾸지 않는다.',
    inputSchema: {
      type: 'object',
      properties: {
        map_id: {
          type: 'string',
          description: '`list_maps` 가 돌려준 맵 id (UUID).',
        },
      },
      required: ['map_id'],
    },
  },
  {
    name: 'append_to_map',
    title: 'EasyMindMap 기존 맵의 노드 아래에 가지 붙이기',
    description:
      '기존 맵의 **한 노드 아래에** 마크다운 조각을 하위 가지로 덧붙인다. ' +
      '`parent` 는 노드 이름(`"할 일"`) 또는 경로(`"2분기 > 협업"`)이고, 비우거나 `root` 면 중심 주제 바로 아래 새 가지가 된다. ' +
      '`markdown` 은 `## 이름` 견출이나 `- 항목` 목록으로 시작하는 조각이다 — 그 최상위 항목들이 parent 의 새 하위 노드가 되고 더 깊은 견출·들여쓴 목록은 그 아래로 간다. ' +
      '있는 노드를 바꾸거나 지우지는 않는다(덧붙이기만). 앱에서 그 맵을 열어 둔 채여도 된다 — 앱 화면이 몇 초 안에 갱신된다. ' +
      '저장은 히스토리 버전으로 남으므로 앱의 [히스토리] 에서 되돌릴 수 있다. 노드 이름은 get_map 으로 먼저 확인한다.',
    inputSchema: {
      type: 'object',
      properties: {
        map_id: { type: 'string', description: '`list_maps` 가 돌려준 맵 id (UUID).' },
        parent: {
          type: 'string',
          description: '붙일 부모 노드 — 이름 또는 `"가지 > 하위"` 경로. 비우면 중심 주제 아래(새 최상위 가지).',
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
      },
      required: ['map_id', 'markdown'],
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
      default: return text(`알 수 없는 도구입니다: ${name}`, true);
    }
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
    const mapId = typeof args.map_id === 'string' ? args.map_id.trim() : '';
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(mapId)) {
      return text('`map_id` 가 맵 id(UUID) 모양이 아닙니다 — list_maps 가 돌려준 id 를 그대로 넣어 주세요.', true);
    }
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
      `아래가 EMM 마크다운 본문이다. 고쳐서 새 맵으로 저장하려면 create_map 에, 어느 노드 아래에 덧붙이려면 append_to_map(parent: 노드 이름 또는 "가지 > 하위") 에 넣는다.\n` +
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
    const mapId = typeof args.map_id === 'string' ? args.map_id.trim() : '';
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(mapId)) {
      return text('`map_id` 가 맵 id(UUID) 모양이 아닙니다 — list_maps 가 돌려준 id 를 그대로 넣어 주세요.', true);
    }
    const parent = typeof args.parent === 'string' ? args.parent : '';
    const placement = args.block_placement === 'note' ? 'note' : 'node';

    let fragment;
    try {
      fragment = parseFragment(typeof args.markdown === 'string' ? args.markdown : '', placement);
    } catch (err) {
      if (err instanceof AppendError) return text(err.message, true);
      throw err;
    }

    let docRes;
    try {
      docRes = await this.maps.getDocument(userId, mapId);
    } catch (err) {
      return text(mapError(err, '맵을 읽지 못했습니다'), true);
    }
    if (docRes.published) {
      return text(`"${docRes.title}" 맵은 지금 공개(퍼블리싱) 중이라 편집할 수 없습니다 — 앱에서 비공개(보관)로 바꾼 뒤 다시 시도해 주세요.`, true);
    }
    if (docRes.role && !['owner', 'editor', 'collab_creator'].includes(String(docRes.role))) {
      return text(`"${docRes.title}" 맵에는 읽기 권한만 있어 붙일 수 없습니다 (내 권한: ${docRes.role}).`, true);
    }

    let result;
    try {
      result = appendSubtree(mapFromDoc(docRes.doc), parent, fragment);
    } catch (err) {
      if (err instanceof AppendError || err instanceof DocShapeError) return text(err.message, true);
      throw err;
    }

    const doc = { ...(docRes.doc as Record<string, unknown>), map: result.map };
    let saved;
    try {
      saved = await this.maps.saveDocument(
        userId, mapId, doc, undefined, true, undefined, false,
        { platform: 'MCP', browser: 'AI 대화' },
        { lockPolicy: 'same-user-ok' },
      );
    } catch (err) {
      this.log.warn(`MCP append_to_map 저장 실패 (map=${mapId}, user=${userId})`, err as Error);
      return text(mapError(err, '붙인 내용을 저장하지 못했습니다'), true);
    }

    const ver = (saved as { version?: number }).version;
    return text(
      `"${docRes.title}" 맵의 "${result.parentPath}" 아래에 노드 ${result.added}개(바로 아래 ${result.topCount}개)를 붙였습니다.` +
      (ver ? ` (히스토리 버전 ${ver})` : '') + '\n' +
      '앱에서 이 맵을 열어 두었다면 몇 초 안에 화면이 갱신됩니다(편집 중이던 내용이 있으면 앱이 초안으로 보관하고 안내합니다). ' +
      '되돌리려면 앱의 [히스토리] 에서 이전 버전을 복원하세요.',
    );
  }

  private async createMap(userId: string, args: Record<string, unknown>): Promise<ToolResult> {
    const markdown = typeof args.markdown === 'string' ? args.markdown : '';
    if (!markdown.trim()) {
      return text('`markdown` 이 비어 있습니다 — 맵으로 만들 내용을 넣어 주세요.', true);
    }
    const placement = args.block_placement === 'note' ? 'note' : 'node';
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
    const nodes = 1 + countNodes(snapshot.map.branches);
    return text(
      `EasyMindMap 문서함에 "${title}" 맵을 만들었습니다 (가지 ${snapshot.map.branches.length}개 · 노드 ${nodes}개${templateNote}).\n` +
      `맵 id: ${mapId}\n` +
      `EasyMindMap 을 열고 [☁ 클라우드 ▸ 열기] 에서 확인할 수 있습니다.`,
    );
  }
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
