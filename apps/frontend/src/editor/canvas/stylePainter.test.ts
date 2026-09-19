// 스타일 복사(붓) 단위 테스트 (2026-09-19) — snapshotNodeStyle / applyStyleSnapshot
// 와 documentStore.applyStyleSnapshot(한 번에 여러 노드 · undo 한 단계).
//
//   npx tsx src/editor/canvas/stylePainter.test.ts

import { applyStyleSnapshot, snapshotIsEmpty, snapshotNodeStyle } from './stylePainter';
import { findNodeInMap, useDocumentStore } from '@/stores/documentStore';
import type { MindNode, SampleMap } from '@emm/emm-parser';

let failed = 0;
function check(name: string, got: unknown, want: unknown): void {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      받음 ${JSON.stringify(got)}\n      기대 ${JSON.stringify(want)}`}`);
}

// ① 원본에서 뜨기 — fontSize 는 빼고, root colorKey 는 빼고
const src: MindNode = {
  id: 'a', text: '원본', textAlign: 'left', colorKey: 'l1B',
  style: { shapeType: 'hexagon', fillColor: '#ffe', textColor: '#900', fontSize: 13, fontWeight: 'bold' },
  notes: [{ id: 'n1', type: 'paragraph', text: '노트' }], sizeW: 200, icon: '★',
};
const snap = snapshotNodeStyle(src);
check('① 도형·색·굵게·글자맞춤·colorKey 를 뜬다 (fontSize 제외)', snap, {
  style: { shapeType: 'hexagon', fillColor: '#ffe', textColor: '#900', fontWeight: 'bold' },
  textAlign: 'left', colorKey: 'l1B',
});
check('① 중심주제(root) 의 colorKey 는 뜨지 않는다',
  snapshotNodeStyle({ colorKey: 'root', style: { fillColor: '#123' } }), { style: { fillColor: '#123' } });
check('① 기본 모습 노드는 빈 붓', snapshotIsEmpty(snapshotNodeStyle({ text: 'x', id: 'x' } as MindNode)), true);
check('① style 에 fontSize 만 있으면 style 은 뜨지 않는다', snapshotNodeStyle({ style: { fontSize: 14 } }), {});

// ② 입히기 — 통째로 바꾼다(대상의 borderColor 는 사라진다), 내용은 그대로
const dst: MindNode = {
  id: 'b', text: '대상', textAlign: 'right', colorKey: 'l1D',
  style: { borderColor: '#00f', fontSize: 11 }, notes: [{ id: 'n2', type: 'paragraph', text: '대상 노트' }], sizeH: 80,
};
const out = applyStyleSnapshot(dst, snap);
check('② 겉모습이 원본과 같아진다 (fontSize 는 대상 것 유지, borderColor 는 사라짐)', out.style,
  { shapeType: 'hexagon', fillColor: '#ffe', textColor: '#900', fontWeight: 'bold', fontSize: 11 });
check('② textAlign·colorKey 가 바뀐다', [out.textAlign, out.colorKey], ['left', 'l1B']);
check('② 글·노트·크기는 그대로', [out.text, out.notes?.[0].text, out.sizeH], ['대상', '대상 노트', 80]);
check('② 원본 객체는 건드리지 않는다', dst.style, { borderColor: '#00f', fontSize: 11 });
check('② 빈 붓을 칠하면 기본 모습으로 (fontSize 만 남고 textAlign 은 지워짐)',
  applyStyleSnapshot(dst, {}), { id: 'b', text: '대상', colorKey: 'l1D', style: { fontSize: 11 }, notes: dst.notes, sizeH: 80 });
check('② 빈 붓 + fontSize 없는 대상 = style 자체가 사라진다',
  applyStyleSnapshot({ id: 'c', text: 'c', style: { fillColor: '#abc' } } as MindNode, {}), { id: 'c', text: 'c' });
check('② 대상이 중심주제면 colorKey 는 덮지 않는다',
  applyStyleSnapshot({ colorKey: 'root', text: 'R' } as unknown as MindNode, snap).colorKey, 'root');

// ③ 스토어 — 여러 노드 한 번에, undo 한 단계
const N = (id: string, extra: Partial<MindNode> = {}, children: MindNode[] = []): MindNode => ({ id, text: id, children, ...extra });
const map: SampleMap = {
  title: 't', root: { id: 'root', text: 'R', colorKey: 'root' },
  branches: [
    { ...N('A', { style: { shapeType: 'star', fillColor: '#fee' }, textAlign: 'left' }, [N('A1'), N('A2', { style: { fillColor: '#eef' } })]), colorKey: 'l1A', side: 'right' },
    { ...N('B', {}, [N('B1', { textAlign: 'right' })]), colorKey: 'l1B', side: 'right' },
  ],
};
const st = () => useDocumentStore.getState();
st().loadMap(map, { resetHistory: true });
const pastBefore = st().past.length;
const brush = snapshotNodeStyle(findNodeInMap(st().map, 'A')!);
st().applyStyleSnapshot(['A1', 'B1', 'root'], brush);
const g = (id: string) => findNodeInMap(st().map, id)!;
check('③ 세 노드가 한 번에 A 의 겉모습 (도형·채움·글자맞춤·colorKey)',
  ['A1', 'B1'].map((id) => [g(id).style?.shapeType, g(id).style?.fillColor, g(id).textAlign, g(id).colorKey]),
  [['star', '#fee', 'left', 'l1A'], ['star', '#fee', 'left', 'l1A']]);
check('③ 중심주제도 칠해지지만 colorKey 는 root 그대로', [g('root').style?.shapeType, g('root').colorKey], ['star', 'root']);
check('③ 글은 그대로', ['A1', 'B1', 'root'].map((id) => g(id).text), ['A1', 'B1', 'R']);
check('③ undo 한 단계만 쌓인다', st().past.length - pastBefore, 1);
st().undo();
check('③ undo 로 셋 다 되돌아간다', ['A1', 'B1'].map((id) => [g(id).style, g(id).textAlign]), [[undefined, undefined], [undefined, 'right']]);
check('③ 빈 목록은 아무 것도 하지 않는다 (undo 안 쌓임)', (st().applyStyleSnapshot([], brush), st().past.length - pastBefore), 0);

console.log(failed ? `\n${failed}개 실패` : '\n모두 통과');
if (failed) process.exit(1);
