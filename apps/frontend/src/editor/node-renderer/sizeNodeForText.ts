// Auto-size + auto-wrap for node text — spec NR-03 / NR-04 (see 10-canvas.md § 23)
// Returns the SVG box dimensions and wrapped line list given a node's text
// and depth. Honors manual line breaks (\n) first, then wraps by word, then
// breaks long unbreakable words by character.
//
// 레벨별 폰트(맵 설정): setLevelFontConfig()로 주입된 맵 전체 설정이
// 깊이별 글자 크기·글꼴을 결정한다 (기본 18/14/13…). Canvas가 레이아웃
// 계산 직전에 map.settings.levelFonts를 주입하므로 모든 레이아웃 전략의
// 측정과 NodeRenderer의 그리기가 항상 같은 값을 쓴다.

import type { LevelFontSetting } from '@/editor/__samples__/types';
import { layoutMdTable, type MdTableLayout } from './mdTable';

export interface SizeOpts {
  minW?: number;
  maxW?: number;
  hasIcon?: boolean;
  // Content-indicator icons (🔗📝📎▶️) drawn INSIDE the box right of the
  // text — the box widens so they all fit (contentIndicatorCount()).
  indicators?: number;
}

export interface NodeSize {
  w: number;
  h: number;
  lines: string[];
  fontSize: number;
  fontWeight: number;
  lineHeight: number;
  padX: number;
  padY: number;
  // 노드 텍스트에 Markdown 표가 있으면 그 측정 결과 — lines에는 표를 뺀
  // 나머지 텍스트만 남는다. NodeRenderer가 같은 값으로 표를 그린다.
  mdTable?: MdTableLayout;
}

// --- 레벨별 폰트 (맵 전체 설정) ---------------------------------------------
// index 0=Root, 1=Level1, 2=Level2, 3=Level3, 4=Level4+
export const LEVEL_FONT_DEFAULT_SIZES = [18, 14, 13, 13, 13];

let levelFontConfig: LevelFontSetting[] = [];

export function setLevelFontConfig(cfg?: LevelFontSetting[]): void {
  levelFontConfig = cfg ?? [];
}

export function levelIndex(depth: number): number {
  return Math.max(0, Math.min(depth, 4));
}

export function levelFontSize(depth: number): number {
  const li = levelIndex(depth);
  const s = levelFontConfig[li]?.size;
  return s && s > 0 ? s : LEVEL_FONT_DEFAULT_SIZES[li];
}

export function levelFontFamily(depth: number): string | undefined {
  const f = levelFontConfig[levelIndex(depth)]?.family;
  return f && f.trim() ? f : undefined;
}

const CJK_RE = /[\u3000-\u9FFF\uAC00-\uD7AF]/;

export function sizeNodeForText(text: string, depth: number, opts: SizeOpts = {}): NodeSize {
  const fontSize   = levelFontSize(depth);
  const fontWeight = depth === 0 ? 700 : depth === 1 ? 600 : 500;
  // 기본 줄 높이(루트 24, 이하 18)를 유지하되, 맵 설정으로 글자 크기가
  // 바뀌면 그 차이만큼 따라 움직인다 (기본값일 땐 기존과 완전히 동일).
  const baseLineH  = depth === 0 ? 24 : 18;
  const lineHeight = baseLineH + (fontSize - LEVEL_FONT_DEFAULT_SIZES[levelIndex(depth)]);
  const padX       = depth === 0 ? 22 : 14;
  const padY       = depth === 0 ? 14 : 9;

  // Per-char width estimate. CJK chars are wider; mix of latin+CJK averages ~0.62*fontSize.
  const charW = (ch: string): number => {
    if (CJK_RE.test(ch)) return fontSize * 1.0;
    if (/[ ]/.test(ch)) return fontSize * 0.34;
    if (/[\d]/.test(ch)) return fontSize * 0.58;
    return fontSize * 0.55;
  };
  const measure = (s: string): number =>
    Array.from(s).reduce((acc, ch) => acc + charW(ch), 0);

  const minW = opts.minW ?? (depth === 0 ? 160 : 130);
  const maxW = opts.maxW ?? (depth === 0 ? 260 : 320);
  // Reserve space for branch icon (NS-05) when present
  const iconReserve = (depth === 1 && opts.hasIcon) ? 22 : 0;
  // Reserve space for content-indicator icons inside the right edge
  const indicatorReserve = (opts.indicators ?? 0) > 0
    ? (opts.indicators ?? 0) * (fontSize + 5) + 4
    : 0;

  // Markdown 표가 있으면 표 부분을 빼고 나머지 텍스트만 줄바꿈한다.
  // (파이프 원문을 자동 줄바꿈하면 표가 망가지므로)
  const mdTable = layoutMdTable(String(text || ''), fontSize) ?? undefined;
  const plainText = mdTable
    ? [mdTable.before, mdTable.after].filter(Boolean).join('\n')
    : String(text || '');

  // Honor manual breaks first, then word-wrap each segment.
  // (표만 있는 노드는 텍스트 줄이 없다 — 빈 줄 하나를 만들지 않는다)
  const manualLines = mdTable && plainText === '' ? [] : plainText.split('\n');
  const wrappedLines: string[] = [];
  const innerMaxW = maxW - padX * 2 - iconReserve;

  manualLines.forEach((seg) => {
    if (seg === '') {
      wrappedLines.push('');
      return;
    }
    const words = seg.split(/(\s+)/); // keep spaces
    let cur = '';
    let curW = 0;
    for (const w of words) {
      const wLen = measure(w);
      if (cur === '' && wLen > innerMaxW) {
        // Single word too long — break by char
        let buf = '';
        let bufW = 0;
        for (const ch of Array.from(w)) {
          const cw = charW(ch);
          if (bufW + cw > innerMaxW && buf) {
            wrappedLines.push(buf);
            buf = ch; bufW = cw;
          } else {
            buf += ch; bufW += cw;
          }
        }
        cur = buf; curW = bufW;
        continue;
      }
      if (curW + wLen > innerMaxW) {
        wrappedLines.push(cur.trimEnd());
        cur = w.replace(/^\s+/, '');
        curW = measure(cur);
      } else {
        cur += w;
        curW += wLen;
      }
    }
    if (cur) wrappedLines.push(cur.trimEnd());
  });
  if (!mdTable && wrappedLines.length === 0) wrappedLines.push('');

  // Width = widest wrapped line + padding (clamped between min and max).
  // 표가 있으면 표 폭만큼은 항상 확보한다 (maxW보다 넓어도 잘리지 않게).
  const widest = wrappedLines.reduce((m, l) => Math.max(m, measure(l)), 0);
  const contentW = Math.max(widest, mdTable ? mdTable.w : 0);
  const wCap = Math.max(maxW, mdTable ? mdTable.w + padX * 2 : 0) + indicatorReserve;
  const w = Math.min(
    wCap,
    Math.max(minW, Math.ceil(contentW + padX * 2 + iconReserve + indicatorReserve)),
  );
  const textH = wrappedLines.length * lineHeight;
  const tableH = mdTable ? mdTable.h + (wrappedLines.length > 0 ? 6 : 0) : 0;
  const h = textH + tableH + padY * 2;

  return { w, h, lines: wrappedLines, fontSize, fontWeight, lineHeight, padX, padY, mdTable };
}
