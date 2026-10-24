// 색 고르기 창(ColorSwatchInput)의 계산 — React 없이 시험할 수 있게 따로 둔다.
// 2026-10-24 UI/UX 검토 ②③: 브라우저 기본 색 창은 Windows Chrome·Whale 에서
// RGB 칸을 먼저 보여 준다. 웹 디자인에서 흔히 쓰는 HEX 를 바로 넣고, 맵 팔레트·
// 최근 색을 고르고, 글자와 바탕의 대비를 바로 보이게 하려고 자체 창을 만들었다.

/** 맵 팔레트 16색 — 윗줄은 옅은 채움, 아랫줄은 진한 테두리·글자용 (가지 색 계열) */
export const COLOR_PALETTE: readonly string[] = [
  '#FEF3C7', '#DBEAFE', '#DCFCE7', '#FCE7F3', '#EDE9FE', '#FFE4E6', '#E0F2FE', '#F1F5F9',
  '#F59E0B', '#3B82F6', '#22C55E', '#EC4899', '#8B5CF6', '#EF4444', '#0EA5E9', '#64748B',
];

/**
 * 사람이 친 HEX 를 `#RRGGBB`(대문자)로 바꾼다. 못 읽으면 null.
 * `#abc` · `abc` · `#AABBCC` · `aabbcc` · 앞뒤 공백을 받는다.
 */
export function normalizeHex(input: string): string | null {
  const s = input.trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{3}$/.test(s)) {
    return ('#' + s.split('').map((c) => c + c).join('')).toUpperCase();
  }
  if (/^[0-9a-fA-F]{6}$/.test(s)) return ('#' + s).toUpperCase();
  return null;
}

function channel(v: number): number {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** WCAG 상대 휘도 (0~1). HEX 가 아니면 null */
export function luminance(hex: string): number | null {
  const n = normalizeHex(hex);
  if (!n) return null;
  const r = parseInt(n.slice(1, 3), 16);
  const g = parseInt(n.slice(3, 5), 16);
  const b = parseInt(n.slice(5, 7), 16);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG 대비 (1~21), 소수 한 자리. 둘 중 하나라도 HEX 가 아니면 null */
export function contrastRatio(a: string, b: string): number | null {
  const la = luminance(a);
  const lb = luminance(b);
  if (la == null || lb == null) return null;
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 10) / 10;
}

/** 대비 등급 — 4.5 이상 읽기 좋음, 3 이상 큰 글자만, 그 아래 잘 안 보임 */
export function contrastLevel(ratio: number): 'good' | 'large' | 'bad' {
  if (ratio >= 4.5) return 'good';
  if (ratio >= 3) return 'large';
  return 'bad';
}

const RECENT_KEY = 'emm.color.recent';
const RECENT_MAX = 8;

/** 최근 쓴 색 — 이 브라우저에만 둔다 (맵 데이터가 아니다) */
export function readRecentColors(storage: Pick<Storage, 'getItem'> | undefined = safeStorage()): string[] {
  try {
    const raw = storage?.getItem(RECENT_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(arr)) return [];
    return arr.map((v) => (typeof v === 'string' ? normalizeHex(v) : null))
      .filter((v): v is string => !!v).slice(0, RECENT_MAX);
  } catch {
    return [];
  }
}

/** 맨 앞에 넣고 중복은 빼고 8개까지. 새 목록을 돌려준다 */
export function pushRecentColor(
  hex: string,
  storage: Pick<Storage, 'getItem' | 'setItem'> | undefined = safeStorage(),
): string[] {
  const n = normalizeHex(hex);
  const cur = readRecentColors(storage);
  if (!n) return cur;
  const next = [n, ...cur.filter((c) => c !== n)].slice(0, RECENT_MAX);
  try { storage?.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* 저장 불가(사생활 모드 등) — 무시 */ }
  return next;
}

function safeStorage(): Storage | undefined {
  try { return typeof localStorage !== 'undefined' ? localStorage : undefined; } catch { return undefined; }
}
