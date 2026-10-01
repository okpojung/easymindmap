// 문서 세대(docEpoch) — 문서 경계를 넘을 때만 오른다 (2026-10-01, e2e324 보강).
//   npx tsx src/stores/docEpoch.test.ts
//
// 첨부 업로드가 끝난 뒤 "아직 같은 문서인가" 를 이 숫자로 묻는다 (Canvas 의
// 붙여넣기·드롭, ContentTab 의 addFiles). 같은 문서 안의 편집·되돌리기에는
// 오르지 않아야 하고, 다른 맵을 열거나(loadMap resetHistory) 닫으면 올라야 한다.
import { useDocumentStore } from './documentStore';
import type { SampleMap } from '@/editor/__samples__/types';

let failed = 0;
const check = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : ` — 받음 ${JSON.stringify(got)}`}`);
};

const st = () => useDocumentStore.getState();
const sample = (title: string): SampleMap => ({
  title, root: { id: 'root', text: title }, branches: [],
} as unknown as SampleMap);

const e0 = st().docEpoch;
check('① 처음은 숫자', typeof e0, 'number');

st().loadMap(sample('A'), { resetHistory: true });
const e1 = st().docEpoch;
check('② 맵을 열면 +1', e1, e0 + 1);

st().updateNodeText('root', 'A 고침');
check('③ 같은 문서 편집은 그대로', st().docEpoch, e1);

st().loadMap(sample('A2'));
check('④ resetHistory 없는 loadMap(같은 문서 바꾸기)은 그대로', st().docEpoch, e1);

st().loadMap(sample('B'), { resetHistory: true });
check('⑤ 다른 맵을 열면 또 +1', st().docEpoch, e1 + 1);

if (failed) { console.log(`\n${failed} FAIL`); process.exit(1); }
console.log('\n모두 통과');
