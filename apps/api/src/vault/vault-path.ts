// vault-path — 맵이 vault 폴더에서 **어떤 이름의 어느 자리**에 놓이는가.
//
// 설계: docs/04-extensions/vault-mirror.md §3.1 · §4
//
// ─────────────────────────────────────────────────────────────────────
// ★ 이 파일에는 디스크에 손대는 코드가 없다. 순수 함수뿐이다.
//
// vault 미러는 **사용자의 폴더에 우리가 파일을 쓰는** 기능이다. 이름 규칙이
// 틀리면 둘 중 하나가 일어난다 — 쓰레기가 쌓이거나(제목을 바꿀 때마다 유령
// 파일), **남의 파일을 덮어쓴다**(이름이 겹쳐서). 둘 다 되돌릴 수 없다.
//
// 그래서 규칙을 **먼저 못 박고 시험한다.** 쓰는 코드는 이 규칙 위에 얹는다.
// ─────────────────────────────────────────────────────────────────────

/**
 * 파일 이름 한 개의 바이트 상한.
 *
 * **글자 수가 아니라 바이트다.** ext4 는 255바이트, NTFS 는 255 UTF-16
 * 단위다 — 한글은 UTF-8 로 3바이트라 85자면 이미 상한이다. 글자 수로 세면
 * 리눅스에서 `ENAMETOOLONG` 이 난다. 더 빡빡한 쪽(바이트)에 맞춘다.
 */
export const MAX_FILE_NAME_BYTES = 255;

/** 파일시스템이 못 받는 글자 (§3.1) */
const FORBIDDEN = /[/\\:*?"<>|]/g;

/** 제어문자 — 어느 파일시스템에서도 못 쓴다 */
const CONTROL = /[\u0000-\u001f\u007f]/g;

/**
 * Windows 예약 이름 — 확장자를 붙여도 예약이다 (`CON.md` 도 못 만든다).
 * `COM0`·`LPT0` 은 예약이 아니다.
 */
const RESERVED = new Set([
  'CON', 'PRN', 'AUX', 'NUL',
  ...Array.from({ length: 9 }, (_, i) => `COM${i + 1}`),
  ...Array.from({ length: 9 }, (_, i) => `LPT${i + 1}`),
]);

/**
 * vault 가 자기 것으로 쓰는 이름 — 폴더가 이 이름이 되면 **우리 폴더를
 * 사용자 폴더가 덮어쓴다.** 설계 문서 §3 에 없는 위험이라 여기서 막는다.
 */
export const VAULT_OWN_NAMES = ['.attachments', '.trash', '.easymindmap-vault'];

function utf8Len(s: string): number {
  return Buffer.byteLength(s, 'utf8');
}

/**
 * UTF-8 로 `max` 바이트를 넘지 않게 자른다 — **글자 중간에서 자르지 않는다.**
 *
 * `Buffer.subarray` 로 자르면 3바이트 한글의 첫 바이트만 남아 깨진 글자가
 * 된다. 코드 포인트 단위로 넣으면서 넘치기 직전에 멈춘다.
 */
export function truncateUtf8(s: string, max: number): string {
  if (utf8Len(s) <= max) return s;
  let out = '';
  let used = 0;
  // `for...of` 는 서로게이트 쌍(이모지)을 한 덩어리로 준다 — 이모지도 안 쪼갠다
  for (const ch of s) {
    const n = utf8Len(ch);
    if (used + n > max) break;
    out += ch;
    used += n;
  }
  return out;
}

/** 이름 안의 못 쓰는 글자를 치우고 앞뒤를 다듬는다 (확장자는 붙이지 않는다) */
function scrub(raw: string): string {
  return String(raw ?? '')
    // ★ **NFC 로 먼저 맞춘다.** macOS 가 NFD 로 쓰는 경로가 있어, 그대로
    //   두면 자모가 분리돼 보이고 Git 에서 같은 파일이 둘로 보인다 (§3.1).
    //   길이 계산도 여기서 확정돼야 한다 — NFD 는 같은 글자가 더 길다.
    .normalize('NFC')
    .replace(FORBIDDEN, '-')
    // 붙여넣기한 제목에는 줄바꿈·탭이 섞여 들어온다 (§3.1 표에 없지만 실제로 온다)
    .replace(CONTROL, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 끝의 `.` 과 공백을 없앤다 — Windows 가 거부한다 (§3.1) */
function stripTrailing(s: string): string {
  return s.replace(/[. ]+$/, '');
}

/**
 * 앞의 `.` 을 `_` 로 바꾼다.
 *
 * 설계 문서에 없는 규칙인데 넣는 이유: 폴더 이름이 `.attachments` 나
 * `.trash` 가 되면 **vault 가 자기 폴더를 사용자 폴더로 덮어쓴다.** 파일도
 * 같은 규칙으로 다뤄 숨김 파일이 생기지 않게 한다 — 사용자가 자기 vault 에서
 * 문서를 못 찾는 것도 사고다.
 */
function unhide(s: string): string {
  return s.replace(/^\.+/, (m) => '_'.repeat(m.length));
}

/** 예약 이름이면 뒤에 `_` — 확장자를 뗀 몸통으로 판정한다 */
function dodgeReserved(s: string): string {
  return RESERVED.has(s.toUpperCase()) ? `${s}_` : s;
}

export interface VaultNameOptions {
  /** 이름 뒤에 붙일 확장자 (`.md`). 폴더면 생략 */
  ext?: string;
  /** 비었을 때 쓸 대체 이름의 꼬리 — 보통 map_id 앞 8자 */
  fallbackId?: string;
}

/**
 * 제목 하나 → **파일시스템에 쓸 수 있는 이름**.
 *
 * 순서가 중요하다. 자르기를 **맨 뒤에** 두면 잘린 끝이 공백이나 `.` 이 되어
 * Windows 가 거부한다. 그래서 자른 뒤 **다시** 끝을 다듬는다.
 */
export function vaultName(rawTitle: string, opts: VaultNameOptions = {}): string {
  const ext = opts.ext ?? '';
  const budget = MAX_FILE_NAME_BYTES - utf8Len(ext);

  // ★ 순서: 끝을 먼저 다듬고 **그 다음** 앞의 점을 바꾼다.
  //   거꾸로 하면 `...` 이 `___` 이 되어 **빈 제목으로 안 떨어진다** —
  //   `Untitled-<id>` 대신 `___.md` 라는 뜻 없는 파일이 생긴다.
  let base = stripTrailing(scrub(rawTitle));
  base = unhide(base);
  base = stripTrailing(truncateUtf8(base, budget));
  base = dodgeReserved(base);
  // 예약어 회피로 한 글자가 늘었을 수 있다 — 다시 재 본다
  if (utf8Len(base) > budget) base = stripTrailing(truncateUtf8(base, budget));

  if (!base) {
    const id = String(opts.fallbackId ?? '').replace(/[^0-9a-zA-Z]/g, '').slice(0, 8);
    base = id ? `Untitled-${id}` : 'Untitled';
  }
  return base + ext;
}

/** id 앞 8자 — 중복·빈 제목의 꼬리로 쓴다 */
export function shortId(id: string): string {
  return String(id ?? '').replace(/-/g, '').slice(0, 8);
}

/** 맵 하나가 vault 에서 갖는 파일 이름 (`.md` 포함) */
export function vaultMapFileName(title: string, mapId: string): string {
  return vaultName(title, { ext: '.md', fallbackId: shortId(mapId) });
}

/** 폴더 하나가 vault 에서 갖는 디렉터리 이름 */
export function vaultFolderName(name: string, folderId: string): string {
  return vaultName(name, { fallbackId: shortId(folderId) });
}

export interface MapNameInput {
  mapId: string;
  title: string;
  /** 같은 이름이 겹칠 때 **누가 원래 이름을 지키는가**를 정한다 */
  createdAt: string | Date;
}

/**
 * 한 폴더 안의 맵들에게 **겹치지 않는** 파일 이름을 나눠 준다 (§3.1 마지막 줄).
 *
 * `maps` 에 제목 unique 제약이 없어서 같은 제목이 실제로 들어온다.
 *
 * ★ **누가 원래 이름을 지키는가를 고정한다.** 먼저 만들어진 맵이 지키고
 *   나중 것이 `-<id 8자>` 를 단다. 순서를 고정하지 않으면 같은 입력에도
 *   실행할 때마다 답이 달라져, **자동저장이 돌 때마다 두 파일이 서로
 *   이름을 바꿔 가며** 지워졌다 다시 쓰인다.
 *
 * 대소문자만 다른 제목도 겹치는 것으로 본다 — macOS·Windows 는 대소문자를
 * 구분하지 않아, 구분해서 나눠 주면 **그 파일시스템에서만** 덮어쓰기가 난다.
 */
export function assignMapFileNames(maps: MapNameInput[]): Map<string, string> {
  const order = [...maps].sort((a, b) => {
    const ta = new Date(a.createdAt).getTime();
    const tb = new Date(b.createdAt).getTime();
    if (ta !== tb) return ta - tb;
    return a.mapId < b.mapId ? -1 : a.mapId > b.mapId ? 1 : 0;
  });

  const taken = new Set<string>();
  const out = new Map<string, string>();
  for (const m of order) {
    const first = vaultMapFileName(m.title, m.mapId);
    if (!taken.has(first.toLowerCase())) {
      taken.add(first.toLowerCase());
      out.set(m.mapId, first);
      continue;
    }
    // 겹친다 — 제목 뒤에 id 를 달아 다시 만든다(길이 상한도 다시 지킨다)
    const withId = vaultName(`${first.replace(/\.md$/i, '')}-${shortId(m.mapId)}`, {
      ext: '.md', fallbackId: shortId(m.mapId),
    });
    taken.add(withId.toLowerCase());
    out.set(m.mapId, withId);
  }
  return out;
}

/**
 * 첨부 파일이 `.attachments/` 에서 갖는 이름 — **내용 해시**다 (§4).
 *
 * ZIP 내보내기의 `files/img-1.png` 와 **다른 규칙**인 이유: ZIP 은 맵 하나만
 * 담지만 vault 는 **모든 맵이 한 폴더를 공유한다.** 번호는 즉시 충돌한다.
 * 해시를 쓰면 같은 사진이 열 개 맵에 있어도 한 벌만 저장된다.
 *
 * 원본 파일명은 이름에 넣지 않는다 — 금지문자·길이·중복 문제를 다시 겪는다.
 * 대신 마크다운 alt 텍스트로 남긴다(§4).
 */
export function vaultAttachmentName(sha256hex: string, originalName: string): string {
  const hash = String(sha256hex ?? '').toLowerCase().replace(/[^0-9a-f]/g, '').slice(0, 16);
  if (hash.length < 16) throw new Error('vaultAttachmentName: sha256 16자를 못 채웠다');
  return `${hash}.${extOf(originalName)}`;
}

/**
 * 원본 이름에서 확장자만 — 없거나 수상하면 `bin`.
 *
 * 확장자를 통째로 믿지 않는다. 경로가 섞인 이름(`../x.png`)을 그대로 붙이면
 * `.attachments/` 밖으로 나갈 수 있다.
 */
function extOf(originalName: string): string {
  const base = String(originalName ?? '').split(/[/\\]/).pop() ?? '';
  const m = /\.([A-Za-z0-9]{1,8})$/.exec(base);
  return m ? m[1].toLowerCase() : 'bin';
}

/**
 * 폴더 이름들 + 파일 이름 → vault 루트 기준 상대 경로.
 *
 * `folder_id IS NULL`(홈)이면 폴더가 없으니 루트에 놓인다 (§3).
 * 구분자는 항상 `/` 다 — 이 값은 DB(`vault_files.rel_path`)에 들어가므로
 * 서버 OS 가 바뀌어도 같아야 한다.
 */
export function vaultRelPath(folderNames: string[], fileName: string): string {
  return [...folderNames, fileName].filter(Boolean).join('/');
}
