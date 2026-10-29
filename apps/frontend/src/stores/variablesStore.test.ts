// 맵 변수 편집 (2026-10-29) —  npx tsx src/stores/variablesStore.test.ts
// 지키는 것: ① 이름 바꾸기는 노드 글자·수식·정의를 함께 ② 코드 안 [&x] 는 그대로
// ③ 되돌리기 한 번에 전부 원래대로 ④ 목록 저장·비우기
import { useDocumentStore } from './documentStore';
import type { SampleMap } from '@emm/model';

let failed = 0;
function check(name: string, got: unknown, want: unknown): void {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (ok ? '' : '\n      받음 ' + JSON.stringify(got) + '\n      기대 ' + JSON.stringify(want)));
}
const st = () => useDocumentStore.getState();
const sample = (): SampleMap => ({
  title: 't',
  root: { id: 'root', text: '합계 [&a]', colorKey: 'root' },
  branches: [{ id: 'A', text: '[&a] 와 [&ab] `[&a]`', colorKey: 'l1A', side: 'right', children: [{ id: 'A1', text: '깊은 [&a]', children: [] }] }],
  centers: [{ root: { id: 'c2', text: '둘째 [&a]', colorKey: 'root', side: 'center' }, branches: [] }],
  settings: { variables: [{ name: 'a', type: 'number', value: '1' }, { name: 'ab', type: 'number', value: '2' }, { name: 'f', type: 'formula', value: 'a + ab' }] },
} as SampleMap);

st().loadMap(sample(), { resetHistory: true });
st().renameVariable('a', '단가', { name: '단가', type: 'currency', value: '15000' });
const m = st().map;
check('① 중심 글자', m.root.text, '합계 [&단가]');
check('① 가지 글자 — 비슷한 이름·코드는 그대로', m.branches[0].text, '[&단가] 와 [&ab] `[&a]`');
check('① 깊은 자식', m.branches[0].children![0].text, '깊은 [&단가]');
check('① 둘째 중심', m.centers![0].root.text, '둘째 [&단가]');
check('① 정의(타입·값까지)', m.settings!.variables![0], { name: '단가', type: 'currency', value: '15000' });
check('① 수식', m.settings!.variables![2].value, '단가 + ab');
st().undo();
const u = st().map;
check('③ 되돌리기 한 번', [u.root.text, u.branches[0].children![0].text, u.settings!.variables![0].name, u.settings!.variables![2].value], ['합계 [&a]', '깊은 [&a]', 'a', 'a + ab']);
st().setVariables([]);
check('④ 비우면 settings.variables 없음', st().map.settings?.variables, undefined);
if (failed) { console.log(failed + '개 실패'); process.exit(1); }
console.log('variablesStore: 모두 통과');
