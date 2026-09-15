// 여러 중심주제 편집 단위 테스트 (2026-09-15, 2단계 — emm-spec §3.1).
//
//   npx tsx src/stores/centers.test.ts
//
// 지키는 것: ① 두 번째 이후의 중심 안에서도 추가·형제·상위·삭제·이동이
// 첫 중심과 똑같이 된다 ② 노드는 중심을 건너 옮겨진다 ③ 중심 추가·자리
// 저장·삭제·묶기·올리기가 되돌리기와 함께 돈다 ④ 첫 중심('root')은 그대로다.

import {
  buildParentIndex, findNodeInMap, findParentId, getNodeDepth, isCenterRootId,
  nodePathInMap, topLevelSelection, useDocumentStore,
} from './documentStore';
import { useEditorUiStore } from './editorUiStore';
import type { MindNode, SampleMap } from '@emm/model';
import { mapCenters } from '@emm/model';

let failed = 0;
function check(name: string, got: unknown, want: unknown): void {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  const ok = g === w;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      받음 ${g}\n      기대 ${w}`}`);
}

const N = (id: string, children: MindNode[] = []): MindNode => ({ id, text: id, children });
function sample(): SampleMap {
  return {
    title: 't',
    root: { id: 'root', text: 'R', colorKey: 'root' },
    branches: [
      { ...N('A', [N('A1'), N('A2', [N('A2a')])]), colorKey: 'l1A', side: 'right' },
      { ...N('B', [N('B1')]), colorKey: 'l1B', side: 'left' },
    ],
    centers: [
      {
        root: { id: 'c2', text: 'C2', colorKey: 'root', side: 'center' },
        branches: [
          { ...N('X', [N('X1'), N('X2')]), colorKey: 'l1A', side: 'right' },
          { ...N('Y'), colorKey: 'l1B', side: 'left' },
        ],
      },
    ],
  };
}
const shape = (ns: MindNode[]): string =>
  ns.map((n) => (n.children?.length ? `${n.id}(${shape(n.children)})` : n.id)).join(',');
const st = () => useDocumentStore.getState();
const m = () => st().map;
const first = () => shape(m().branches);
const second = () => shape(m().centers?.[0]?.branches ?? []);
const load = () => st().loadMap(sample(), { resetHistory: true });

console.log('--- 읽기 헬퍼 (1단계) ---');
load();
check('둘째 중심 루트 찾기', (findNodeInMap(m(), 'c2') as { text: string }).text, 'C2');
check('둘째 중심 안의 노드 찾기', (findNodeInMap(m(), 'X1') as { text: string }).text, 'X1');
check('깊이 — 둘째 중심 가지', getNodeDepth(m(), 'X'), 1);
check('깊이 — 둘째 중심 손자', getNodeDepth(m(), 'X1'), 2);
check('깊이 — 중심 루트', getNodeDepth(m(), 'c2'), 0);
check('부모 — 둘째 중심 가지의 부모는 그 중심 루트', findParentId(m(), 'X'), 'c2');
check('부모 — 중심 루트는 null', findParentId(m(), 'c2'), null);
check('부모 색인', [buildParentIndex(m()).get('c2'), buildParentIndex(m()).get('X'), buildParentIndex(m()).get('X1')], [null, 'c2', 'X']);
check('이름 경로 — 둘째 중심', nodePathInMap(m(), 'X1'), ['X', 'X1']);
check('중심 루트 판정', [isCenterRootId(m(), 'root'), isCenterRootId(m(), 'c2'), isCenterRootId(m(), 'X')], [true, true, false]);
check('최상위 선택 — 중심 루트는 빠지고 문서 순서', topLevelSelection(m(), ['X1', 'c2', 'A', 'X', 'A1']), ['A', 'X']);

console.log('--- 둘째 중심 안의 추가·형제·상위·삭제 ---');
load();
{
  const id = st().addChildNode('c2');
  check('중심 루트에 자식 추가 → 그 중심의 가지', second().endsWith(`,${id}`), true);
  check('첫 중심은 그대로', first(), 'A(A1,A2(A2a)),B(B1)');
  const kid = st().addChildNode('X1');
  check('둘째 중심 손자 아래 추가', shape((findNodeInMap(m(), 'X1') as MindNode).children ?? []), kid);
  const sib = st().addSiblingNode('Y', 'after');
  check('둘째 중심 가지의 형제 → 가지', m().centers![0].branches.map((b) => b.id).includes(sib), true);
  check('형제는 가지 다음 자리', m().centers![0].branches.findIndex((b) => b.id === sib), 2);
  const p = st().addParentNode('X');
  check('둘째 중심 가지에 상위 추가 → 새 가지가 X 를 감싼다', m().centers![0].branches[0].id === p && m().centers![0].branches[0].children?.[0].id === 'X', true);
  st().deleteNode('X1');
  check('둘째 중심 노드 삭제', JSON.stringify(m()).includes('"X1"'), false);
  st().deleteNodesBulk(['Y', 'A1']);
  check('일괄 삭제 — 두 중심에 걸쳐', [JSON.stringify(m()).includes('"Y"'), JSON.stringify(m()).includes('"A1"')], [false, false]);
  st().addChildNodesBulk('c2', ['p', 'q']);
  check('일괄 자식 추가 — 중심 루트', m().centers![0].branches.slice(-2).map((b) => b.text), ['p', 'q']);
  st().appendChildren('X', [N('Z', [N('Z1')])]);
  check('appendChildren — 둘째 중심 노드', shape((findNodeInMap(m(), 'X') as MindNode).children ?? []).includes('Z(Z1)'), true);
}

console.log('--- 중심을 건너 옮기기 ---');
load();
{
  check('첫 중심 노드 → 둘째 중심 노드의 자식', st().moveNodeRelative('A2', 'X', 'child'), true);
  check('  첫 중심에서 사라짐', first(), 'A(A1),B(B1)');
  check('  둘째 중심에 붙음', second(), 'X(X1,X2,A2(A2a)),Y');
  check('둘째 중심 가지 → 첫 중심 루트의 자식(가지)', st().moveNodeRelative('Y', 'root', 'child'), true);
  check('  첫 중심 가지가 됨', first(), 'A(A1),B(B1),Y');
  check('  makeBranch 로 색·방향 받음', !!m().branches[2].colorKey && !!m().branches[2].side, true);
  check('둘째 중심 루트의 자식으로 (child on center root)', st().moveNodeRelative('B', 'c2', 'child'), true);
  check('  둘째 중심 가지 끝에', second(), 'X(X1,X2,A2(A2a)),B(B1)');
  check('형제로 건너가기', st().moveNodeRelative('A', 'X', 'before'), true);
  check('  둘째 중심 가지 앞에', second(), 'A(A1),X(X1,X2,A2(A2a)),B(B1)');
  check('중심 루트는 옮기지 않는다', st().moveNodeRelative('c2', 'A', 'child'), false);
  check('moveNode 로 건너가기', st().moveNode('X1', 'root'), true);
  check('  첫 중심 가지가 됨', first(), 'Y,X1');
  check('다중 이동 — 두 중심의 노드를 한 자리로', st().moveNodesRelative(['Y', 'A1'], 'c2', 'child').reason, 'ok');
  check('  둘째 중심 끝에 둘', second().endsWith('Y,A1'), true);
}

console.log('--- 중심 추가 · 자리 · 삭제 · 되돌리기 ---');
load();
{
  const id = st().addCenter('새 중심');
  check('중심 추가 → 맨 뒤', m().centers!.length === 2 && m().centers![1].root.id === id, true);
  check('새 중심 루트 모양', [m().centers![1].root.text, m().centers![1].root.colorKey, m().centers![1].branches.length], ['새 중심', 'root', 0]);
  const kid = st().addChildNode(id);
  check('새 중심에 자식', m().centers![1].branches[0].id, kid);
  st().setCenterPos(id, { dx: 300.4, dy: -20.6 });
  check('자리 저장(반올림)', m().centers![1].pos, { dx: 300, dy: -21 });
  st().setCenterPos(id, null);
  check('자리 지움 → 자동 배치', m().centers![1].pos, undefined);
  st().setCenterPos('root', { dx: 1, dy: 1 });
  check('첫 중심은 자리를 갖지 않는다', JSON.stringify(m()).includes('"dx":1'), false);
  st().deleteNode(id);
  check('중심 루트 삭제 → 그 중심째', m().centers!.length, 1);
  st().undo();
  check('되돌리기 → 중심 복구', m().centers!.length === 2 && m().centers![1].branches[0].id === kid, true);
  st().deleteNodesBulk(['c2', id]);
  check('일괄 삭제로 중심 둘 → centers 없음', m().centers, undefined);
  st().deleteNode('root');
  check("첫 중심 루트('root')는 지워지지 않는다", m().root.text, 'R');
}

console.log('--- 묶기 · 올리기 ---');
load();
{
  check('묶기 (첫 중심으로)', st().mergeCentersInto('root'), true);
  check('  centers 없음', m().centers, undefined);
  check('  둘째 중심이 가지 하나로, 그 가지들이 자식', first(), 'A(A1,A2(A2a)),B(B1),c2(X(X1,X2),Y)');
  check('  묶인 가지는 루트 글자·색·방향을 가진다', [m().branches[2].text, !!m().branches[2].colorKey, !!m().branches[2].side], ['C2', true, true]);
  st().undo();
  check('되돌리기', [first(), second()], ['A(A1,A2(A2a)),B(B1)', 'X(X1,X2),Y']);
  check('묶기 (둘째 중심으로)', st().mergeCentersInto('c2'), true);
  check("  둘째 중심이 'root' 자리로", [m().root.id, m().root.text], ['root', 'C2']);
  const idsAfter = m().branches.map((b) => b.id);
  check('  옛 첫 중심은 새 id 의 가지 (root 라는 id 는 가지에 없다)', [idsAfter.slice(0, 2), idsAfter.includes('root'), m().branches[2].text], [['X', 'Y'], false, 'R']);
  check('  옛 첫 중심의 가지가 자식으로', shape(m().branches[2].children ?? []), 'A(A1,A2(A2a)),B(B1)');
  check('중심 하나뿐이면 묶을 것이 없다', st().mergeCentersInto('root'), false);

  load();
  const id = st().promoteToCenter('A');
  check('올리기 → 새 중심 (id 유지)', id, 'A');
  check('  첫 중심에서 빠짐', first(), 'B(B1)');
  check('  새 중심은 맨 뒤, 자식이 가지로', [m().centers!.length, m().centers![1].root.text, shape(m().centers![1].branches)], [2, 'A', 'A1,A2(A2a)']);
  check('  가지들은 색·방향을 받았다', m().centers![1].branches.every((b) => !!b.colorKey && !!b.side), true);
  check('손자는 올릴 수 없다', st().promoteToCenter('X1'), null);
  check('중심 루트는 올릴 수 없다', st().promoteToCenter('c2'), null);
  check('둘째 중심의 가지도 올린다', st().promoteToCenter('X'), 'X');
  check('  둘째 중심에서 빠짐', shape(m().centers![0].branches), 'Y');
  check('전체 중심 수', mapCenters(m()).length, 4);
  st().undo(); st().undo();
  check('되돌리기 둘 → 원래대로 (못 올린 호출은 히스토리에 남지 않는다)', [first(), second(), m().centers!.length], ['A(A1,A2(A2a)),B(B1)', 'X(X1,X2),Y', 1]);
}

console.log('--- 접기·레벨 레이아웃·좌우 ---');
load();
{
  st().toggleCollapse('X');
  check('둘째 중심 노드 접기', (findNodeInMap(m(), 'X') as MindNode).collapsed, true);
  st().toggleCollapse('c2');
  check('중심 루트는 접지 않는다', (findNodeInMap(m(), 'c2') as MindNode).collapsed, undefined);
  st().collapseAll();
  check('모두 접기 — 두 중심', [(findNodeInMap(m(), 'A') as MindNode).collapsed, (findNodeInMap(m(), 'X') as MindNode).collapsed], [true, true]);
  st().expandAll();
  check('모두 펼치기 — 두 중심', [(findNodeInMap(m(), 'A') as MindNode).collapsed, (findNodeInMap(m(), 'X') as MindNode).collapsed], [undefined, undefined]);
  st().setBranchSide('Y', 'right');
  check('둘째 중심 가지의 좌우', m().centers![0].branches[1].side, 'right');
  st().setLevelLayout(1, 'tree-right');
  check('레벨 레이아웃은 두 중심 모두', [m().branches[0].layoutType, m().centers![0].branches[0].layoutType], ['tree-right', 'tree-right']);
  st().updateNodeLayoutType('c2', 'hierarchy-right');
  check('둘째 중심 루트의 레이아웃 + 가지 오버라이드 초기화', [m().centers![0].root.layoutType, m().centers![0].branches[0].layoutType], ['hierarchy-right', undefined]);
  check('첫 중심은 건드리지 않았다', m().branches[0].layoutType, 'tree-right');
}

console.log('--- 레벨 레이아웃 폴백은 그 중심의 가지에서 · 묶기 후 전역 레이아웃 (PR #493 Codex) ---');
{
  const withLayouts = sample();
  withLayouts.branches[0].layoutType = 'tree-right';
  withLayouts.centers![0].branches[0].layoutType = 'hierarchy-right';
  st().loadMap(withLayouts, { resetHistory: true });
  const a = st().addChildNode('root');
  const b = st().addChildNode('c2');
  check('첫 중심의 새 가지는 첫 중심 형제의 레이아웃', (findNodeInMap(m(), a) as MindNode).layoutType, 'tree-right');
  check('둘째 중심의 새 가지는 둘째 중심 형제의 레이아웃', (findNodeInMap(m(), b) as MindNode).layoutType, 'hierarchy-right');
  const sib = st().addSiblingNode('X', 'after');
  check('둘째 중심의 형제도 그 중심의 것', (findNodeInMap(m(), sib) as MindNode).layoutType, 'hierarchy-right');
  st().appendChildren('c2', [N('Q')]);
  check('appendChildren 도 그 중심의 것', (findNodeInMap(m(), 'Q') as MindNode).layoutType, 'hierarchy-right');

  const merged = sample();
  merged.centers![0].root.layoutType = 'tree-down';
  st().loadMap(merged, { resetHistory: true });
  useEditorUiStore.getState().setLayoutType('radial-right');
  check('묶기(둘째 중심으로) → 전역 레이아웃이 그 중심의 것으로', [st().mergeCentersInto('c2'), useEditorUiStore.getState().layoutType, m().root.layoutType], [true, 'tree-down', 'tree-down']);
  st().undo();
  check('되돌리기 → 전역 레이아웃도 돌아온다', useEditorUiStore.getState().layoutType, 'radial-right');
  st().loadMap(sample(), { resetHistory: true });
  useEditorUiStore.getState().setLayoutType('radial-right');
  check('남는 중심에 레이아웃이 없으면 전역은 그대로', [st().mergeCentersInto('c2'), useEditorUiStore.getState().layoutType], [true, 'radial-right']);
}

if (failed) { console.log(`\n${failed} failed`); process.exit(1); }
console.log('\nall passed');
