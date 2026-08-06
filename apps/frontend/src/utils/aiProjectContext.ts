// aiProjectContext — "맵 = AI 프로젝트, 노드 = 질문" 워크스페이스의 맥락
// 조립기 (MVP: 경로만). 선택 노드를 "더 자세히 확장"할 때, 그 노드의
// 트리 위치(직계 조상 경로)로 맥락을 만들어 시스템/유저 메시지로 나눈다.
//
// 설계: docs/04-extensions/ai/ai-project-workspace.md
//  system = EMM 규칙 + 확장 지시 + [프로젝트 지침(=루트 내용)] +
//           [프로젝트 소스(있으면)]   ← 프로젝트 안에서 안 바뀌는 접두사
//           (Anthropic prompt caching 대상)
//  user   = [상위 경로(중간 조상)] + [확장할 노드] + 확장 요청
//
// 노드 출처(AI/사용자)는 관여하지 않는다 — 트리 위치로만 조립한다.

import type { MindNode, SampleMap, SampleRoot } from '@/editor/__samples__/types';
import { findNodeInMap, findParentId } from '@/stores/documentStore';
import { EMM_EXPAND_DIRECTIVE } from '@/utils/emmSystemPrompt';

type AnyNode = MindNode | SampleRoot;

// 노드 하나의 "내용"을 텍스트로 — 제목 + 노트(문단/코드/표) 본문.
function nodeContent(node: AnyNode): string {
  const parts: string[] = [node.text || ''];
  for (const nb of node.notes ?? []) {
    const txt = (nb.text || '').trim();
    if (!txt) continue;
    if (nb.type === 'code_block') parts.push('```' + (nb.lang || '') + '\n' + txt + '\n```');
    else parts.push(txt);
  }
  return parts.join('\n').trim();
}

// 서브트리 전체 텍스트(프로젝트 소스 노드용) — 제목/노트 + 자식 재귀.
function subtreeContent(node: MindNode, depth = 0): string {
  const lines: string[] = [('  '.repeat(depth)) + '- ' + nodeContent(node).replace(/\n/g, '\n' + '  '.repeat(depth + 1))];
  for (const c of node.children ?? []) lines.push(subtreeContent(c, depth + 1));
  return lines.join('\n');
}

// 루트 → … → 노드(포함) 조상 경로.
export function ancestorPath(map: SampleMap, nodeId: string): AnyNode[] {
  const path: AnyNode[] = [];
  let cur: string | null = nodeId;
  const seen = new Set<string>();
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    const n = findNodeInMap(map, cur);
    if (!n) break;
    path.unshift(n);
    if (cur === 'root') break;
    cur = findParentId(map, cur);
  }
  return path;
}

// 소스 노드 식별 마커. 일반 노드 텍스트("프로젝트 소스" 등)와 섞이지
// 않게 눈에 띄는 "@소스"를 쓴다 (2026-07 사용자 요청).
export const SOURCE_MARKER = '@소스';

// 소스 노드 — 중심 주제 바로 아래(2레벨)에서 이름에 "@소스"가 들어간
// 첫 노드. 그 노드의 텍스트·노트 + 하위 노드 내용이 확장 맥락에 항상
// 참고 자료로 실린다. 없으면 null.
export function findProjectSourceNode(map: SampleMap): MindNode | null {
  return map.branches.find((b) => (b.text || '').includes(SOURCE_MARKER)) ?? null;
}

export interface ExpandContext {
  system: string;
  user: string;
  targetText: string;
}

// 선택 노드를 확장하기 위한 system/user 메시지 조립.
// baseSystem = 사용자의 EMM 시스템 프롬프트(설정) — 구조/정보량 규칙.
export function buildExpandContext(
  map: SampleMap,
  nodeId: string,
  baseSystem: string,
  /**
   * 사용자가 입력창에 적어 둔 **추가 지시** (2026-08-06 보고).
   *
   * 예전에는 이 값을 아예 쓰지 않았다 — 확장은 맵 문맥(프로젝트 지침 +
   * 상위 경로 + 이 노드)만 보고 만들었다. 그런데 입력창이 바로 위에
   * 있어서, 사용자는 **거기 적은 질문이 반영된다고 본다.**
   * "고흐 작품을 연도별로" 라고 적고 확장을 눌렀는데 맵 문맥(쿠버네티스)
   * 대로 나와 "엉뚱한 답"이 됐다. 비어 있지 않으면 지시로 함께 보낸다.
   */
  extraInstruction?: string,
): ExpandContext | null {
  const target = findNodeInMap(map, nodeId);
  if (!target) return null;

  const path = ancestorPath(map, nodeId); // [root, ..., target]
  const root = map.root;
  const source = findProjectSourceNode(map);

  // system: EMM 규칙 + 확장 지시 + 프로젝트 지침(루트) + 소스(@소스)
  const sysParts = [baseSystem, EMM_EXPAND_DIRECTIVE];
  sysParts.push('[프로젝트 지침]\n' + nodeContent(root));
  // @소스 노드가 확장 대상 경로에 없을 때만 별도 첨부(중복 방지)
  if (source && !path.some((p) => p.id === source.id)) {
    sysParts.push('[프로젝트 소스]\n' + subtreeContent(source));
  }
  const system = sysParts.join('\n\n');

  // user: 중간 경로(루트·타깃 제외) + 확장할 노드 + 요청
  const middle = path.slice(1, -1); // 조상들(루트 제외), 타깃 제외
  const userParts: string[] = [];
  if (middle.length) {
    userParts.push('[상위 경로]\n' + middle.map((n) => '↳ ' + nodeContent(n)).join('\n'));
  }
  userParts.push('[확장할 노드]\n' + nodeContent(target));
  const extra = extraInstruction?.trim();
  if (extra) {
    // **사용자 지시를 맵 문맥보다 앞세운다** — 둘이 어긋날 때 사용자가
    // 방금 적은 말이 이긴다. 어긋나지 않으면 그냥 함께 반영된다.
    userParts.push('[요청]\n' + extra
      + '\n\n(위 요청이 맵 문맥과 다르면 **요청을 따른다.**)');
  }
  userParts.push('위 노드를 더 자세하고 상세하게 확장해줘. 그 노드의 하위 구조만 EMM으로 출력해줘.');
  const user = userParts.join('\n\n');

  return { system, user, targetText: target.text || '노드' };
}

// 파싱된 확장 결과(하위 노드들)에 맵 내 고유 ID를 새로 부여한다 —
// parseEmm이 만든 id(md#N 등)가 두 번째 확장에서 충돌하지 않게.
let expandSeq = 0;
export function reassignIds(nodes: MindNode[]): MindNode[] {
  const base = 'ai-' + Date.now().toString(36);
  const walk = (ns: MindNode[]): MindNode[] =>
    ns.map((n) => ({
      ...n,
      id: `${base}-${expandSeq++}`,
      children: n.children && n.children.length ? walk(n.children) : n.children,
    }));
  return walk(nodes);
}
