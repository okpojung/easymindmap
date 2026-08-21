// vault-writer 테스트 (2026-08-21, vault 미러 슬라이스 2).
//
//   npm run build && npm run test:vault
//
// **진짜 파일시스템에 쓴다.** 흉내로는 못 잡는 것들이 여기 있다 —
// 심볼릭 링크가 vault 밖을 가리키는 것, rename 이 원자적인지, 마커 없는
// 폴더를 거절하는지.
//
// 설계: docs/04-extensions/vault-mirror.md §7 · §3.2 · §3.3

import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  VAULT_MARKER, VAULT_README, TRASH_DIR,
  sha256, isVaultRoot, ensureVaultRoot, resolveInside,
  writeVaultFile, trashVaultFile, moveVaultFile, VaultError,
} from '../dist/vault/vault-writer.js';

let failed = 0;
function check(name, got, want) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  const ok = g === w;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      받음 ${g}\n      기대 ${w}`}`);
}
async function throws(fn) {
  try { await fn(); return null; } catch (e) { return e instanceof VaultError ? 'VaultError' : e.name; }
}
const read = (p) => fs.readFile(p, 'utf8');
const has = async (p) => { try { await fs.access(p); return true; } catch { return false; } };

let seq = 0;
async function freshRoot() {
  seq += 1;
  const dir = path.join(os.tmpdir(), `vault-test-${process.pid}-${seq}`);
  await fs.rm(dir, { recursive: true, force: true });
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

// ── ① 마커 — 없는 폴더에는 아무것도 쓰지 않는다 (§7) ──────────────
{
  const root = await freshRoot();
  check('① 처음엔 vault 가 아니다', await isVaultRoot(root), false);
  check('① 마커 없는 폴더에 쓰기는 거절',
    await throws(() => writeVaultFile(root, 'a.md', 'x', null)), 'VaultError');
  check('① 마커 없는 폴더는 휴지통도 거절',
    await throws(() => trashVaultFile(root, 'a.md')), 'VaultError');

  await ensureVaultRoot(root);
  check('① 마커가 생겼다', await has(path.join(root, VAULT_MARKER)), true);
  check('① README 안내문도', (await read(path.join(root, VAULT_README))).includes('직접 고치지 마세요'), true);
  check('① 이제 vault 다', await isVaultRoot(root), true);

  // README 를 지우면 다시 만든다 — 안내가 사라지면 첫 겹이 무력해진다
  await fs.rm(path.join(root, VAULT_README));
  await ensureVaultRoot(root);
  check('① 지워진 README 를 되살린다', await has(path.join(root, VAULT_README)), true);
}
{
  // ★ 남의 파일이 있는 폴더를 vault 로 삼겠다면 거절한다
  const root = await freshRoot();
  await fs.writeFile(path.join(root, '내 문서.txt'), '소중한 것', 'utf8');
  check('① ★ 비어 있지 않은 폴더는 vault 로 안 받는다',
    await throws(() => ensureVaultRoot(root)), 'VaultError');
  check('① 그 폴더의 파일은 그대로', await read(path.join(root, '내 문서.txt')), '소중한 것');
  check('① 마커도 안 만들었다', await has(path.join(root, VAULT_MARKER)), false);
}

// ── ② 경로 탈출 — 설계에 없던 위험 ────────────────────────────────
{
  const root = await freshRoot();
  await ensureVaultRoot(root);
  check('② .. 로 나가는 경로 거절',
    await throws(() => resolveInside(root, '../밖.md')), 'VaultError');
  check('② 중간에 .. 이 섞여도',
    await throws(() => resolveInside(root, '연구/../../밖.md')), 'VaultError');
  check('② 절대 경로 거절',
    await throws(() => resolveInside(root, '/etc/passwd')), 'VaultError');
  check('② 빈 경로 거절', await throws(() => resolveInside(root, '')), 'VaultError');
  check('② 정상 경로는 통과',
    (await resolveInside(root, '연구/RAG.md')).endsWith(`연구${path.sep}RAG.md`), true);
  check('② vault 안에서의 .. 는 괜찮다(결과가 안에 있으면)',
    (await resolveInside(root, '연구/../RAG.md')).endsWith(`${path.sep}RAG.md`), true);

  // ★ 심볼릭 링크 — 경로 문자열만 봐서는 절대 못 잡는다
  const outside = await freshRoot();
  await fs.symlink(outside, path.join(root, '연구'));
  check('② ★ 폴더가 vault 밖을 가리키는 링크면 거절',
    await throws(() => resolveInside(root, '연구/x.md')), 'VaultError');
  check('② ★ 그 경로로 쓰기도 거절',
    await throws(() => writeVaultFile(root, '연구/x.md', 'x', null)), 'VaultError');
  check('② ★ 링크 너머에 파일이 안 생겼다',
    await has(path.join(outside, 'x.md')), false);
}

// ── ③ 쓰기 · 다시 쓰기 · 안 바뀐 것 ───────────────────────────────
{
  const root = await freshRoot();
  await ensureVaultRoot(root);
  const rel = '연구/RAG 증분 인덱싱.md';

  const r1 = await writeVaultFile(root, rel, '# 첫 내용', null);
  check('③ 새로 쓴다', r1.status, 'written');
  check('③ 하위 폴더가 만들어졌다', await read(path.join(root, '연구', 'RAG 증분 인덱싱.md')), '# 첫 내용');
  check('③ 해시를 돌려준다', r1.hash, sha256('# 첫 내용'));

  const r2 = await writeVaultFile(root, rel, '# 첫 내용', r1.hash);
  check('③ 내용이 같으면 안 건드린다', r2.status, 'unchanged');

  const r3 = await writeVaultFile(root, rel, '# 둘째 내용', r1.hash);
  check('③ 우리가 쓴 그대로면 다시 쓴다', r3.status, 'written');
  check('③ 내용이 바뀌었다', await read(path.join(root, '연구', 'RAG 증분 인덱싱.md')), '# 둘째 내용');

  // 임시 파일이 남지 않았다 (원자적 쓰기)
  const left = (await fs.readdir(path.join(root, '연구'))).filter((f) => f.includes('.tmp'));
  check('③ 임시 파일이 안 남는다', left, []);
}

// ── ④ ★ 사용자가 고친 파일은 덮어쓰지 않는다 (§7 ③) ──────────────
{
  const root = await freshRoot();
  await ensureVaultRoot(root);
  const rel = 'RAG.md';
  const r1 = await writeVaultFile(root, rel, '# 우리가 쓴 것', null);

  // 사용자가 Obsidian 으로 고쳤다
  await fs.writeFile(path.join(root, rel), '# 사용자가 고친 것', 'utf8');

  const r2 = await writeVaultFile(root, rel, '# 새로 쓰려던 것', r1.hash);
  check('④ ★ 충돌로 판정', r2.status, 'conflict');
  check('④ ★ 사용자가 고친 것이 그대로 있다',
    await read(path.join(root, rel)), '# 사용자가 고친 것');
  check('④ 우리가 쓰려던 것은 .conflict.md 로', r2.conflictPath, 'RAG.conflict.md');
  check('④ 그 파일 내용', await read(path.join(root, 'RAG.conflict.md')), '# 새로 쓰려던 것');

  // 지난 충돌본도 덮어쓰지 않는다
  const r3 = await writeVaultFile(root, rel, '# 또 다른 것', r1.hash);
  check('④ 지난 충돌본을 덮지 않고 번호를 올린다', r3.conflictPath, 'RAG.conflict-1.md');
  check('④ 지난 충돌본은 그대로', await read(path.join(root, 'RAG.conflict.md')), '# 새로 쓰려던 것');
}
{
  // ★ 우리가 쓴 적 없는 자리(prevHash=null)에 남의 파일이 있으면 덮지 않는다
  const root = await freshRoot();
  await ensureVaultRoot(root);
  await fs.writeFile(path.join(root, '남의 것.md'), '건드리지 마', 'utf8');
  const r = await writeVaultFile(root, '남의 것.md', '우리 것', null);
  check('④ ★ 기록에 없는 자리의 남의 파일은 덮지 않는다', r.status, 'conflict');
  check('④ ★ 원본 그대로', await read(path.join(root, '남의 것.md')), '건드리지 마');
}

// ── ⑤ 휴지통 — 지우지 않는다 (§3.3) ───────────────────────────────
{
  const root = await freshRoot();
  await ensureVaultRoot(root);
  await writeVaultFile(root, '옛 메모.md', '내용', null);

  const t1 = await trashVaultFile(root, '옛 메모.md');
  check('⑤ 휴지통으로 옮겼다', t1, `${TRASH_DIR}/옛 메모.md`);
  check('⑤ 원래 자리에는 없다', await has(path.join(root, '옛 메모.md')), false);
  check('⑤ 내용은 살아 있다', await read(path.join(root, TRASH_DIR, '옛 메모.md')), '내용');

  // 같은 이름을 또 버리면 덮어쓰지 않는다
  await writeVaultFile(root, '옛 메모.md', '두 번째', null);
  const t2 = await trashVaultFile(root, '옛 메모.md');
  check('⑤ 휴지통 안의 것도 안 덮는다', t2, `${TRASH_DIR}/옛 메모-1.md`);
  check('⑤ 첫 번째가 그대로', await read(path.join(root, TRASH_DIR, '옛 메모.md')), '내용');

  check('⑤ 없는 파일은 null', await trashVaultFile(root, '없는 것.md'), null);
}

// ── ⑥ 제목 변경·폴더 이동 (§3.2) ──────────────────────────────────
{
  const root = await freshRoot();
  await ensureVaultRoot(root);
  const r1 = await writeVaultFile(root, '옛 제목.md', '내용', null);

  const m = await moveVaultFile(root, '옛 제목.md', '연구/새 제목.md', '내용', r1.hash);
  check('⑥ 새 자리에 썼다', m.status, 'written');
  check('⑥ 새 자리 내용', await read(path.join(root, '연구', '새 제목.md')), '내용');
  check('⑥ 옛 자리는 비었다', await has(path.join(root, '옛 제목.md')), false);
  check('⑥ 옛 파일은 지우지 않고 휴지통으로', m.trashedOld, `${TRASH_DIR}/옛 제목.md`);

  // 대소문자만 바뀌는 이동 (rename 이었으면 일부 파일시스템에서 실패한다)
  const r2 = await writeVaultFile(root, 'Report.md', 'r', null);
  const m2 = await moveVaultFile(root, 'Report.md', 'report.md', 'r', r2.hash);
  check('⑥ 대소문자만 바뀌어도 된다', m2.status, 'written');
}
{
  // ★ 새 자리가 충돌이면 **옛 파일을 건드리지 않는다**
  const root = await freshRoot();
  await ensureVaultRoot(root);
  const r1 = await writeVaultFile(root, '옛.md', '내용', null);
  await fs.writeFile(path.join(root, '새.md'), '사용자가 만든 것', 'utf8');

  const m = await moveVaultFile(root, '옛.md', '새.md', '내용', r1.hash);
  check('⑥ ★ 새 자리가 충돌이면', m.status, 'conflict');
  check('⑥ ★ 옛 파일을 휴지통으로 보내지 않는다', m.trashedOld, null);
  check('⑥ ★ 옛 파일이 그대로 있다', await has(path.join(root, '옛.md')), true);
  check('⑥ ★ 사용자 파일도 그대로', await read(path.join(root, '새.md')), '사용자가 만든 것');
}

// ── ⑦ 마무리 ──────────────────────────────────────────────────────
for (let i = 1; i <= seq; i += 1) {
  await fs.rm(path.join(os.tmpdir(), `vault-test-${process.pid}-${i}`), { recursive: true, force: true });
}

console.log(failed ? `\n${failed}건 실패` : '\n전부 통과');
process.exit(failed ? 1 : 0);
