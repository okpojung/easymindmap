// expandSubtree / collapseSubtree 단위 테스트 (2026-09-08).
//
//   npx tsx src/stores/subtreeCollapse.test.ts

import { useDocumentStore } from './documentStore';
import type { MindNode, SampleMap } from '@emm/emm-parser';

let failed = 0;
function check(name: string, got: unknown, want: unknown): void {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      받음 ${JSON.stringify(got)}\n      기대 ${JSON.stringify(want)}`}`);
}
const N = (id: string, children: MindNode[] = [], collapsed?: boolean): MindNode => ({ id, text: id, children, ...(collapsed ? { collapsed } : {}) });
const sample = (): SampleMap => ({
  title: 't', root: { id: 'root', text: 'R', colorKey: 'root' },
  branches: [
    { ...N('A', [N('A1', [N('A1a', [N('A1a1')], true)], true), N('A2', [N('A2a')], true)], true), colorKey: 'l1A', side: 'right' },
    { ...N('B', [N('B1', [N('B1a')], true)], true), colorKey: 'l1B', side: 'right' },
  ],
});
/** 접힌 노드 id 목록 (문서 순서) */
const collapsedIds = (): string[] => {
  const out: string[] = [];
  const walk = (ns: MindNode[]) => { for (const n of ns) { if (n.collapsed) out.push(n.id); walk(n.children ?? []); } };
  walk(useDocumentStore.getState().map.branches as MindNode[]);
  return out;
};
const load = () => useDocumentStore.getState().loadMap(sample(), { resetHistory: true });
const st = () => useDocumentStore.getState();

load();
check('⓪ 시작: 자식 있는 노드 전부 접힘', collapsedIds(), ['A', 'A1', 'A1a', 'A2', 'B', 'B1']);

st().expandSubtree(['A']);
check('① A 하위 모두 펼치기 — B 는 그대로', collapsedIds(), ['B', 'B1']);

st().collapseSubtree(['A']);
check('② A 하위 모두 접기 — A 자체는 편 채, 자손만 접힘', collapsedIds(), ['A1', 'A1a', 'A2', 'B', 'B1']);

load(); st().expandSubtree(['A1', 'B']);
check('③ 여러 노드 한 번에', collapsedIds(), ['A', 'A2']);

load(); st().expandSubtree(['root']); st().expandSubtree([]);
check('④ 루트·빈 목록은 무시', collapsedIds(), ['A', 'A1', 'A1a', 'A2', 'B', 'B1']);

load(); st().expandSubtree(['A2a']);
check('⑤ 잎을 골라도 아무 일 없음(오류 없음)', collapsedIds(), ['A', 'A1', 'A1a', 'A2', 'B', 'B1']);

check('⑥ 접기/펼치기는 되돌리기 이력에 남지 않는다(보기 전용)', st().past.length, 0);

console.log(failed ? `\n${failed}건 실패` : '\n전부 통과');
process.exit(failed ? 1 : 0);
