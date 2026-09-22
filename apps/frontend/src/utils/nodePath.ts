// 노드 경로 (2026-09-22) — 연결선을 mmd 선언에 적을 때 노드를 가리키는 문자열.
// id 는 문서를 읽을 때마다 새로 나므로 **글로 된 경로**를 쓴다: 중심 글부터
// `>` 로 이어 `테스트 > Topic 1 > Sub Topic`. 각 조각은 노드 글의 첫 줄(공백 정리).
// MCP 의 `parent: "가지 > 하위"` 표기와 같은 꼴이되, 중심이 여럿일 수 있어 중심
// 글을 맨 앞에 둔다. 같은 경로가 둘 이상이면 **첫 번째**를 잡는다.
import type { MindNode, SampleMap } from '@/editor/__samples__/types';
import { mapCenters } from '@/editor/__samples__/types';

export const PATH_SEP = ' > ';

/**
 * 노드 글 → 경로 조각. mmd 로 내보낼 때 견출이 되는 글과 **같은 규칙**이어야
 * 다시 읽어도 찾는다 (serialize.ts `splitNodeBody`):
 *   · 가지 노드 — 블록(코드·표·체크) 앞의 **첫 비지 않은 줄**
 *   · 중심 노드 — 블록 앞의 줄들을 **공백으로 이어 한 줄** (`# 제목` 은 한 줄이라
 *     불러오면 `2026\n제품 로드맵` 이 `2026 제품 로드맵` 으로 돌아온다)
 * 공백은 하나로, `>` 는 `＞` 로 (구분자와 섞이지 않게).
 */
export function pathSegment(text: string, center = false): string {
  const leading: string[] = [];
  for (const line of String(text ?? '').split('\n')) {
    const t = line.trim();
    if (/^```/.test(t) || /^\|/.test(t) || /^- \[[ xX]\]/.test(t)) break;
    leading.push(t);
  }
  const s = center ? leading.filter(Boolean).join(' ') : (leading.find(Boolean) ?? '');
  return s.replace(/\s+/g, ' ').trim().replace(/>/g, '＞');
}

/** id → 경로. 없으면 null */
export function nodePathOf(map: SampleMap, id: string): string | null {
  for (const c of mapCenters(map)) {
    const rootSeg = pathSegment(c.root.text, true);
    if (c.root.id === id) return rootSeg;
    const found = findPath(c.branches, id, [rootSeg]);
    if (found) return found.join(PATH_SEP);
  }
  return null;
}

function findPath(nodes: MindNode[], id: string, acc: string[]): string[] | null {
  for (const n of nodes) {
    const seg = [...acc, pathSegment(n.text)];
    if (n.id === id) return seg;
    const deeper = findPath(n.children ?? [], id, seg);
    if (deeper) return deeper;
  }
  return null;
}

/** 경로 → 노드 id. 첫 번째로 맞는 것. 없으면 null */
export function findNodeIdByPath(map: SampleMap, path: string): string | null {
  const segs = String(path ?? '').split('>').map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
  if (!segs.length) return null;
  for (const c of mapCenters(map)) {
    if (pathSegment(c.root.text, true) !== segs[0]) continue;
    if (segs.length === 1) return c.root.id;
    const hit = walkPath(c.branches, segs.slice(1));
    if (hit) return hit;
  }
  return null;
}

function walkPath(nodes: MindNode[], segs: string[]): string | null {
  for (const n of nodes) {
    if (pathSegment(n.text) !== segs[0]) continue;
    if (segs.length === 1) return n.id;
    const hit = walkPath(n.children ?? [], segs.slice(1));
    if (hit) return hit;
  }
  return null;
}
