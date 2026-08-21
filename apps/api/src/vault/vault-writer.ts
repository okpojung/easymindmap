// vault-writer — vault 폴더에 **안전하게** 파일을 쓴다.
//
// 설계: docs/04-extensions/vault-mirror.md §7 (덮어쓰기 안전장치) · §3.2 · §3.3
//
// ─────────────────────────────────────────────────────────────────────
// ★ 여기가 이 기능에서 가장 위험한 곳이다.
//
// "단방향 미러" 라는 말은 **vault 폴더를 우리가 마음대로 덮어쓴다**는 뜻이다.
// 사용자가 Obsidian 으로 그 파일을 고쳤다면 **그 편집이 사라진다.**
//
// 그래서 네 겹으로 막는다.
//   ① **마커 파일이 없는 디렉터리에는 아무것도 쓰지 않는다.** 볼륨 경로를
//      잘못 지정했을 때 남의 폴더를 덮어쓰는 사고를 막는다 (§7).
//   ② **경로가 vault 밖으로 나가지 못하게 한다.** `..` 도, 심볼릭 링크도.
//      (설계 문서에 없는 위험 — 폴더 이름이 링크면 `/etc` 에 쓸 수 있다)
//   ③ **쓰기 전에 디스크의 해시를 우리가 마지막에 쓴 해시와 비교한다.**
//      다르면 사용자가 고친 것이므로 **덮어쓰지 않고** `.conflict.md` 로 비킨다.
//   ④ **지우지 않는다. `.trash/` 로 옮긴다** (§3.3).
//
// 그리고 쓰기는 **원자적**이다 — 임시 파일에 쓰고 rename 한다. 도중에 죽어도
// 반쯤 쓰인 `.md` 가 남지 않는다(그게 남으면 다음 번 해시 비교가 "사용자가
// 고쳤다" 로 읽어 `.conflict.md` 를 만들어 낸다).
// ─────────────────────────────────────────────────────────────────────

import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';

/** vault 루트임을 알리는 마커 (§7) */
export const VAULT_MARKER = '.easymindmap-vault';

/** 우리가 만들어 두는 안내문 — 사용자가 직접 고치지 않게 (§7 ①) */
export const VAULT_README = 'README.md';

/** 지운 파일이 가는 자리 (§3.3) */
export const TRASH_DIR = '.trash';

const README_BODY = `# 이 폴더는 easymindmap 이 자동으로 만듭니다

\`.md\` 파일을 직접 고치지 마세요. 다음 동기화 때 덮어쓰입니다.
편집은 easymindmap 에서 하세요.

고친 것이 있으면 덮어쓰지 않고 \`*.conflict.md\` 로 남깁니다 —
그 파일은 우리가 다시 건드리지 않으니 직접 정리하세요.
`;

export function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

export class VaultError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VaultError';
  }
}

async function exists(p: string): Promise<boolean> {
  try { await fs.access(p); return true; } catch { return false; }
}

/**
 * 이 디렉터리가 **우리 vault 인가** — 마커 파일이 있는가 (§7).
 *
 * 없으면 쓰지 않는다. 사용자가 `VAULT_DIR` 을 홈 디렉터리나 프로젝트 폴더로
 * 잘못 잡았을 때 **그 폴더를 우리가 채워 버리는** 사고를 막는 유일한 장치다.
 */
export async function isVaultRoot(root: string): Promise<boolean> {
  return exists(path.join(root, VAULT_MARKER));
}

/**
 * vault 루트를 준비한다 — 마커와 README 를 만든다.
 *
 * ★ **빈 디렉터리(또는 이미 우리 vault)일 때만 마커를 만든다.** 남의 파일이
 *   이미 있는 폴더를 vault 로 삼겠다고 하면 **거절한다.** 잘못 지정한 경로를
 *   되돌릴 방법이 없기 때문이다 — 사용자가 빈 폴더를 만들어 지정하게 한다.
 */
export async function ensureVaultRoot(root: string): Promise<void> {
  await fs.mkdir(root, { recursive: true });
  if (await isVaultRoot(root)) {
    // README 가 지워졌으면 다시 만든다 (안내가 사라지면 ①이 무력해진다)
    const readme = path.join(root, VAULT_README);
    if (!await exists(readme)) await fs.writeFile(readme, README_BODY, 'utf8');
    return;
  }
  const entries = await fs.readdir(root);
  if (entries.length > 0) {
    throw new VaultError(
      `vault 로 쓸 폴더가 비어 있지 않습니다: ${root}\n` +
      `이미 파일이 ${entries.length}개 있습니다. 빈 폴더를 지정해 주세요 — ` +
      `남의 파일이 있는 폴더를 vault 로 삼으면 우리가 그것을 덮어쓸 수 있습니다.`,
    );
  }
  await fs.writeFile(path.join(root, VAULT_MARKER), '', 'utf8');
  await fs.writeFile(path.join(root, VAULT_README), README_BODY, 'utf8');
}

/**
 * 상대 경로를 vault 안의 **실제 경로**로 바꾼다 — 밖으로 나가면 거절한다.
 *
 * 설계 문서에 없는 위험이라 여기서 막는다. 막아야 하는 것 둘:
 *   · `..` 이 섞인 경로 (`../../etc/passwd`)
 *   · **심볼릭 링크** — 폴더 이름 자리가 링크면 `연구/x.md` 가 `/etc/x.md` 가
 *     된다. 경로 문자열만 봐서는 절대 못 잡는다. 이미 있는 조상 디렉터리를
 *     `realpath` 로 풀어 확인한다.
 */
export async function resolveInside(root: string, relPath: string): Promise<string> {
  const rel = String(relPath ?? '').normalize('NFC');
  if (!rel || path.isAbsolute(rel)) {
    throw new VaultError(`vault 경로가 아닙니다: ${relPath}`);
  }
  const rootReal = await fs.realpath(root);
  const full = path.resolve(rootReal, rel);
  if (full !== rootReal && !full.startsWith(rootReal + path.sep)) {
    throw new VaultError(`vault 밖으로 나가는 경로입니다: ${relPath}`);
  }
  // 이미 있는 가장 가까운 조상을 realpath 로 풀어 **링크로 새는지** 본다
  let probe = path.dirname(full);
  for (;;) {
    if (await exists(probe)) {
      const real = await fs.realpath(probe);
      if (real !== rootReal && !real.startsWith(rootReal + path.sep)) {
        throw new VaultError(`심볼릭 링크가 vault 밖을 가리킵니다: ${relPath}`);
      }
      break;
    }
    const up = path.dirname(probe);
    if (up === probe) break;
    probe = up;
  }
  return full;
}

/** 임시 파일에 쓰고 rename — 도중에 죽어도 반쯤 쓰인 파일이 안 남는다 */
async function writeAtomic(full: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(full), { recursive: true });
  // 같은 디렉터리에 둬야 rename 이 원자적이다 (다른 파일시스템이면 복사가 된다)
  const tmp = path.join(path.dirname(full), `.${path.basename(full)}.${randomUUID().slice(0, 8)}.tmp`);
  await fs.writeFile(tmp, content, 'utf8');
  try {
    await fs.rename(tmp, full);
  } catch (err) {
    await fs.rm(tmp, { force: true });
    throw err;
  }
}

export type VaultWriteStatus =
  /** 새로 썼거나 내용이 바뀌어 다시 썼다 */
  | 'written'
  /** 디스크 내용이 이미 우리가 쓰려던 것과 같다 — 손대지 않았다 */
  | 'unchanged'
  /** 사용자가 고쳤다 — 원본을 두고 `.conflict.md` 로 비켜 썼다 */
  | 'conflict';

export interface VaultWriteResult {
  status: VaultWriteStatus;
  /** 우리가 쓴(또는 쓰려던) 내용의 sha256 — `vault_files.content_hash` 에 넣는다 */
  hash: string;
  /** conflict 일 때 **실제로 쓴** 상대 경로 */
  conflictPath?: string;
}

/**
 * 맵 파일 하나를 쓴다 (§7 ②③).
 *
 * @param prevHash 우리가 **마지막에 쓴** 내용의 해시(`vault_files.content_hash`).
 *   `null` 이면 "우리가 쓴 적 없다" — 그 자리에 파일이 있으면 **남의 것**이므로
 *   덮어쓰지 않는다.
 */
export async function writeVaultFile(
  root: string, relPath: string, content: string, prevHash: string | null,
): Promise<VaultWriteResult> {
  if (!await isVaultRoot(root)) {
    throw new VaultError(`vault 마커(${VAULT_MARKER})가 없는 폴더에는 쓰지 않습니다: ${root}`);
  }
  const full = await resolveInside(root, relPath);
  const hash = sha256(content);

  let onDisk: string | null = null;
  try {
    onDisk = await fs.readFile(full, 'utf8');
  } catch {
    onDisk = null; // 없다 — 새로 쓴다
  }

  if (onDisk === null) {
    await writeAtomic(full, content);
    return { status: 'written', hash };
  }

  const diskHash = sha256(onDisk);
  if (diskHash === hash) {
    // 이미 같다 — **건드리지 않는다.** 같은 내용을 다시 쓰면 mtime 이 바뀌어
    // Obsidian·Git 이 "바뀐 파일" 로 본다.
    return { status: 'unchanged', hash };
  }

  // ★ 우리가 쓴 그대로가 아니다 = 사용자가 고쳤다. **덮어쓰지 않는다.**
  if (prevHash === null || diskHash !== prevHash) {
    const conflictRel = await pickConflictPath(root, relPath);
    await writeAtomic(await resolveInside(root, conflictRel), content);
    return { status: 'conflict', hash, conflictPath: conflictRel };
  }

  await writeAtomic(full, content);
  return { status: 'written', hash };
}

/**
 * 충돌 파일 자리를 고른다 — `연구/RAG.md` → `연구/RAG.conflict.md`.
 *
 * 그 자리도 이미 있으면 **덮어쓰지 않고** 번호를 올린다. 사용자가 지난번
 * 충돌본을 아직 정리하지 않았을 수 있는데, 그걸 덮으면 §7 의 "사용자가 쓴
 * 것을 우리가 지우지 않는다" 가 깨진다.
 */
async function pickConflictPath(root: string, relPath: string): Promise<string> {
  const dir = path.posix.dirname(relPath) === '.' ? '' : `${path.posix.dirname(relPath)}/`;
  const base = path.posix.basename(relPath).replace(/\.md$/i, '');
  for (let i = 0; i < 1000; i += 1) {
    const rel = i === 0 ? `${dir}${base}.conflict.md` : `${dir}${base}.conflict-${i}.md`;
    if (!await exists(await resolveInside(root, rel))) return rel;
  }
  throw new VaultError(`충돌 파일 자리를 못 찾았습니다: ${relPath}`);
}

/**
 * 파일을 **지우지 않고 `.trash/` 로 옮긴다** (§3.3).
 *
 * `maps.deleted_at` 이 soft delete 이므로 vault 도 같게 한다 — 복원했는데
 * 파일이 없으면 사용자는 데이터를 잃었다고 생각한다.
 *
 * @returns 옮겼으면 `.trash` 안의 상대 경로, 원래 파일이 없었으면 `null`
 */
export async function trashVaultFile(root: string, relPath: string): Promise<string | null> {
  if (!await isVaultRoot(root)) {
    throw new VaultError(`vault 마커(${VAULT_MARKER})가 없는 폴더에는 손대지 않습니다: ${root}`);
  }
  const full = await resolveInside(root, relPath);
  if (!await exists(full)) return null;

  const base = path.posix.basename(relPath);
  const stem = base.replace(/\.md$/i, '');
  const ext = base.slice(stem.length);
  await fs.mkdir(await resolveInside(root, TRASH_DIR), { recursive: true });
  for (let i = 0; i < 1000; i += 1) {
    const rel = i === 0 ? `${TRASH_DIR}/${base}` : `${TRASH_DIR}/${stem}-${i}${ext}`;
    const dest = await resolveInside(root, rel);
    if (await exists(dest)) continue;   // 휴지통 안의 것도 덮어쓰지 않는다
    await fs.rename(full, dest);
    return rel;
  }
  throw new VaultError(`휴지통 자리를 못 찾았습니다: ${relPath}`);
}

/**
 * 제목 변경·폴더 이동 — **옛 파일을 지우고 새 자리에 쓴다** (§3.2).
 *
 * rename 을 쓰지 않는 이유는 설계 문서에 있다: 대소문자만 바뀐 경우 일부
 * 파일시스템에서 실패한다. 여기서는 한 가지를 더한다 — **새 자리를 먼저
 * 쓰고 옛 자리를 치운다.** 거꾸로 하면 중간에 죽었을 때 **파일이 사라진
 * 상태**로 남는다.
 *
 * 옛 파일은 지우지 않고 휴지통으로 보낸다. 새 자리가 충돌로 비켜 쓰였다면
 * **옛 파일을 건드리지 않는다** — 사용자가 고친 내용이 원본에 남아 있는데
 * 옛 자리까지 치우면 그 편집을 찾을 길이 없다.
 */
export async function moveVaultFile(
  root: string, oldRel: string | null, newRel: string,
  content: string, prevHash: string | null,
): Promise<VaultWriteResult & { trashedOld?: string | null }> {
  const wrote = await writeVaultFile(root, newRel, content, prevHash);
  if (!oldRel || oldRel === newRel) return wrote;
  if (wrote.status === 'conflict') return { ...wrote, trashedOld: null };
  const trashedOld = await trashVaultFile(root, oldRel);
  return { ...wrote, trashedOld };
}
