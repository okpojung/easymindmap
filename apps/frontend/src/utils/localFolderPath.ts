// 연결한 PC 첨부 폴더의 전체 경로(드라이브명 포함) — 표시 전용 (2026-11-25 사용자 요청).
//
// 브라우저(File System Access API)는 보안상 고른 폴더의 **이름만** 알려 주고 드라이브명이나
// 전체 경로는 알려 주지 않는다. 그래서 사용자가 탐색기 주소창의 경로를 한 번 붙여 넣으면,
// 연결한 폴더 이름과 맞는지 확인한 뒤 이 브라우저(localStorage)에만 기억해 표시한다.
// 서버·맵 문서로는 보내지 않는다. 파일 접근은 여전히 폴더 핸들로만 한다.

export type FolderPathCheck =
  | { ok: true; path: string }
  | { ok: false; reason: 'empty' | 'notAbsolute' | 'nameMismatch' | 'root' };

/** 드라이브(또는 파일시스템) 전체를 고른 경우 브라우저가 주는 이름 — '\\', 'D:\\', '/' 등 */
export function isRootFolderName(name: string): boolean {
  return /^([A-Za-z]:)?[\\/]?$/.test(name.trim());
}

export function normalizeFolderPath(raw: string): string {
  let s = String(raw ?? '').trim().replace(/^["']+|["']+$/g, '').trim();
  if (/^[A-Za-z]:([\\/]|$)/.test(s)) {
    s = s[0].toUpperCase() + ':' + ('\\' + s.slice(2)).replace(/[\\/]+/g, '\\');
    if (s.length > 3) s = s.replace(/\\+$/, '');
    return s;
  }
  if (/^[\\/]{2}[^\\/]/.test(s)) {
    return '\\\\' + s.replace(/^[\\/]+/, '').replace(/[\\/]+/g, '\\').replace(/\\+$/, '');
  }
  if (s.startsWith('/')) return s.length > 1 ? s.replace(/\/+/g, '/').replace(/\/+$/, '') : '/';
  return s;
}

function lastSegment(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? '';
}

export function checkFolderPath(raw: string, folderName: string): FolderPathCheck {
  const path = normalizeFolderPath(raw);
  if (!path) return { ok: false, reason: 'empty' };
  const drive = /^[A-Za-z]:(\\|$)/.test(path), unc = /^\\\\[^\\]+\\[^\\]+/.test(path), posix = path.startsWith('/');
  if (!drive && !unc && !posix) return { ok: false, reason: 'notAbsolute' };
  if (isRootFolderName(folderName)) {
    const isRoot = /^[A-Za-z]:\\?$/.test(path) || path === '/';
    return isRoot ? { ok: true, path: drive ? path.slice(0, 2) + '\\' : path } : { ok: false, reason: 'root' };
  }
  if (lastSegment(path).normalize('NFC').toLowerCase() !== folderName.trim().normalize('NFC').toLowerCase()) {
    return { ok: false, reason: 'nameMismatch' };
  }
  return { ok: true, path };
}

const KEY = 'emm.localFolderPath.v1.';
type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const store = (): Store | null => { try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; } };

export function readFolderPath(rootId: string | undefined, s: Store | null = store()): string | null {
  if (!rootId || !s) return null;
  try { return s.getItem(KEY + rootId.toLowerCase()); } catch { return null; }
}
export function writeFolderPath(rootId: string, path: string | null, s: Store | null = store()): void {
  if (!rootId || !s) return;
  try { if (path) s.setItem(KEY + rootId.toLowerCase(), path); else s.removeItem(KEY + rootId.toLowerCase()); } catch { /* storage full/blocked: display only */ }
}
