// 노드 id 유일성 (2026-09-22 사용자 보고 "[36주]에 진행트리를 걸었더니 맵이 엉망" 의 원인).
//   npx tsx src/stores/nodeIds.test.ts
import { dedupeNodeIds, findNodeInMap, useDocumentStore } from './documentStore';
import { weekOutline } from '@/utils/calendarNodes';
import type { MindNode, SampleMap } from '@emm/emm-parser';

let failed = 0;
function check(name: string, got: unknown, want: unknown): void {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  const ok = g === w; if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      받음 ${g}\n      기대 ${w}`}`);
}
const allIds = (map: SampleMap): string[] => {
  const out: string[] = [];
  const walk = (n: MindNode) => { out.push(n.id); (n.children ?? []).forEach(walk); };
  out.push(map.root.id); map.branches.forEach(walk);
  (map.centers ?? []).forEach((c) => { out.push(c.root.id); c.branches.forEach(walk); });
  return out;
};
const N = (id: string, children: MindNode[] = []): MindNode => ({ id, text: id, children });

// ① 한 틱에 40개(달력 5주 × 7일 + 5) → 전부 다른 id (예전엔 절반 넘게 겹쳤다)
{
  const st = useDocumentStore.getState();
  st.loadMap({ title: 't', root: { id: 'root', text: 'root' }, branches: [{ ...N('A'), colorKey: 'l1A' } as never] } as SampleMap, { resetHistory: true });
  for (let k = 0; k < 5; k++) useDocumentStore.getState().addChildOutlineBulk('A', weekOutline(2026, 9)); // 200개
  const ids = allIds(useDocumentStore.getState().map);
  check('① 200개를 한 틱에 만들어도 id 가 모두 다르다', [ids.length, new Set(ids).size], [202, 202]);
  check('① id 는 node- 로 시작한다', ids.slice(2).every((id) => id.startsWith('node-')), true);
}
// ② 겹친 id 를 품은 맵을 열면 뒤의 것이 새 id 를 받는다 — 앞의 것·나머지는 그대로
{
  const dup: SampleMap = { title: 't', root: { id: 'root', text: 'root' }, branches: [
    { ...N('A', [N('x'), N('y', [N('x')])]), colorKey: 'l1A' } as never,
    { ...N('B', [N('y')]), colorKey: 'l1B' } as never,
  ] };
  const { map, fixed } = dedupeNodeIds(dup);
  const ids = allIds(map);
  check('② 겹침 2개를 고쳤다 · 전부 유일', [fixed, ids.length, new Set(ids).size], [2, 7, 7]);
  check('② 첫 번째 x·y 는 그대로 (A 의 x, A 의 y)', [(map.branches[0] as MindNode).children![0].id, (map.branches[0] as MindNode).children![1].id], ['x', 'y']);
  check('② 겹침 없는 맵은 같은 객체', dedupeNodeIds(map).map === map, true);
  useDocumentStore.getState().loadMap(dup, { resetHistory: true });
  const loaded = allIds(useDocumentStore.getState().map);
  check('② loadMap 이 여는 순간 고친다', [loaded.length, new Set(loaded).size, !!findNodeInMap(useDocumentStore.getState().map, 'x')], [7, 7, true]);
}
if (failed) { console.log(`\n${failed} FAIL`); process.exit(1); }
console.log('\n모두 통과');
