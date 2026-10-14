// folderTree 단위 테스트 (2026-10-14) — 폴더 이동에서 고를 수 없는 곳(자기·하위).
//   npx tsx src/components/cloud/folderTree.test.ts
import { folderSubtreeIds } from './folderTree';
import type { FolderItem } from '@/services/cloud/apiClient';

let failed = 0;
function check(name: string, got: unknown, want: unknown): void {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  const ok = g === w;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      받음 ${g}\n      기대 ${w}`}`);
}

const f = (folderId: string, parentId: string | null) =>
  ({ folderId, parentId, name: folderId, mapCount: 0 }) as unknown as FolderItem;
// A ─ A1 ─ A1a
//   └ A2
// B
const folders = [f('A', null), f('A1', 'A'), f('A1a', 'A1'), f('A2', 'A'), f('B', null)];

check('① 자기 + 모든 하위 (손자까지)', folderSubtreeIds(folders, 'A').sort(), ['A', 'A1', 'A1a', 'A2']);
check('② 중간 폴더 — 형제·부모는 막지 않는다', folderSubtreeIds(folders, 'A1').sort(), ['A1', 'A1a']);
check('③ 하위 없는 폴더는 자기만', folderSubtreeIds(folders, 'B'), ['B']);
// 데이터가 꼬여 고리가 있어도 끝난다
const loop = [f('X', 'Y'), f('Y', 'X')];
check('④ 고리가 있어도 무한 루프하지 않는다', folderSubtreeIds(loop, 'X').sort(), ['X', 'Y']);

if (failed) { console.error(`\n${failed}건 실패`); process.exit(1); }
console.log('\nfolderTree 전부 통과');
