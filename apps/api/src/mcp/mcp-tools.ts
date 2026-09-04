import { Injectable, Logger } from '@nestjs/common';
import { MapsService } from '../maps/maps.service';
import { EmmParseError, emmToSnapshot, titleFromSnapshot } from './emm-to-doc';

/**
 * MCP 가 AI 에게 주는 **도구 목록**과 그 실행.
 * 설계: docs/04-extensions/ai/mcp-connector.md §2
 *
 * 도구는 기존 `/v1` 엔드포인트를 **얇게 감싸기만 한다.** 쿼터·권한·이름
 * 중복 판정 같은 규칙은 전부 `MapsService` 안에 이미 있고, 여기서 다시
 * 만들지 않는다 — 두 벌이 되면 반드시 어긋난다(§2 머리말).
 *
 * 1단계는 `create_map` 하나다(§7). `list_maps`·`get_map` 은 2단계다.
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
      '기존 맵을 고치지는 못한다 — 언제나 새 맵이 하나 생긴다.',
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
      },
      required: ['markdown'],
    },
  },
];

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

  constructor(private readonly maps: MapsService) {}

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
    if (name !== 'create_map') {
      return text(`알 수 없는 도구입니다: ${name}`, true);
    }
    return this.createMap(userId, args);
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

    const nodes = countNodes(snapshot.map.branches);
    return text(
      `EasyMindMap 문서함에 "${title}" 맵을 만들었습니다 (가지 ${snapshot.map.branches.length}개 · 노드 ${nodes}개).\n` +
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
