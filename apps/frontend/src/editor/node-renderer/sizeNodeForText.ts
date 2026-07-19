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
  // 노드 우하단 핸들로 수동 조절한 박스 크기 — 폭은 고정(텍스트가 이 폭에
  // 맞춰 다시 줄바꿈), 높이는 최소값으로 취급 (내용이 더 크면 내용 우선).
  manualW?: number;
  manualH?: number;
  // 노드 안에 붙여넣은 사진의 원본 크기 — 노드 폭에 맞춰 축소한 높이만큼
  // 박스가 커진다 (표시는 NodeRenderer의 scaleNodeImage와 동일 공식).
  image?: { w: number; h: number };
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
  // 수동 줄바꿈(\n) 세그먼트가 시작하는 lines 인덱스 — 인라인 마커 상태
  // 이월의 리셋 지점 (자동 줄바꿈 줄에는 상태가 이어진다)
  manualStarts?: number[];
}

// 노드 폭(w)에 맞춘 사진 표시 크기 — 측정과 그리기가 같은 공식을 쓴다.
export function scaleNodeImage(
  image: { w: number; h: number },
  nodeW: number,
  padX: number,
): { w: number; h: number } {
  const innerW = Math.max(40, nodeW - padX * 2);
  const scale = Math.min(1, innerW / Math.max(1, image.w));
  return { w: Math.round(image.w * scale), h: Math.round(image.h * scale) };
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

// 레벨 기본 텍스트 맞춤 (맵 설정) — 노드별 textAlign이 없을 때 적용
export function levelTextAlign(depth: number): 'left' | 'center' | 'right' | undefined {
  return levelFontConfig[levelIndex(depth)]?.align ?? undefined;
}

// 레벨 기본 도형 (맵 설정) — 노드별 shapeType이 없을 때 적용
let levelShapeConfig: (string | null | undefined)[] = [];
export function setLevelShapeConfig(cfg?: (string | null | undefined)[]): void {
  levelShapeConfig = cfg ?? [];
}
export function levelShape(depth: number): string | undefined {
  const v = levelShapeConfig[levelIndex(depth)];
  return v ?? undefined;
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
    if (/[\d]/.test(ch)) return fontSize * 0.62;
    // 대문자 라틴은 소문자보다 넓다 (KISTI·NHN·POS 등 약어가 많은 줄이
    // 과소측정되어 텍스트가 테두리를 넘던 문제 보정 — mdTable.ts와 동일)
    if (/[A-Z]/.test(ch)) return fontSize * 0.72;
    return fontSize * 0.55;
  };
  const measure = (s: string): number =>
    Array.from(s).reduce((acc, ch) => acc + charW(ch), 0);

  // 수동 폭(우하단 핸들)이 있으면 그 폭에 고정 — 텍스트는 이 폭에 맞춰
  // 다시 줄바꿈된다.
  const manualW = opts.manualW && opts.manualW >= 90
    ? Math.min(900, Math.round(opts.manualW))
    : undefined;
  // 사진이 있으면 기본 최소 폭을 조금 넉넉하게 (너무 작게 축소되지 않게)
  const imageMin = opts.image ? 170 : 0;
  const minW = manualW ?? Math.max(imageMin, opts.minW ?? (depth === 0 ? 160 : 130));
  const maxW = manualW ?? Math.max(minW, opts.maxW ?? (depth === 0 ? 260 : 320));
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
  const manualStarts: number[] = [];
  const innerMaxW = maxW - padX * 2 - iconReserve;

  manualLines.forEach((seg) => {
    manualStarts.push(wrappedLines.length);
    if (seg === '') {
      wrappedLines.push('');
      return;
    }
    const words = seg.split(/(\s+)/); // keep spaces
    let cur = '';
    let curW = 0;
    for (const w of words) {
      const wLen = measure(w);
      if (wLen > innerMaxW) {
        // 한 단어가 줄 폭보다 길다 — 줄 어디에서 나와도(줄 처음뿐 아니라
        // 중간에서도) 지금 줄을 끊고 문자 단위로 분해한다. 그러지 않으면
        // '과기정통부·…·나이스정보통신이' 같은 무공백 토큰이 한 줄로
        // 밀려 들어가 테두리를 넘는다.
        if (cur.trim()) wrappedLines.push(cur.trimEnd());
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
  // 수동 폭이면 그 값 그대로 (표가 더 넓을 때만 예외적으로 확장).
  const widest = wrappedLines.reduce((m, l) => Math.max(m, measure(l)), 0);
  const contentW = Math.max(widest, mdTable ? mdTable.w : 0);
  const wCap = Math.max(maxW, mdTable ? mdTable.w + padX * 2 : 0) + indicatorReserve;
  const w = manualW
    ? Math.max(manualW, mdTable ? mdTable.w + padX * 2 : 0)
    : Math.min(
        wCap,
        Math.max(minW, Math.ceil(contentW + padX * 2 + iconReserve + indicatorReserve)),
      );
  const textH = wrappedLines.length * lineHeight;
  const tableH = mdTable ? mdTable.h + (wrappedLines.length > 0 ? 6 : 0) : 0;
  // 붙여넣은 사진 — 노드 폭에 맞춰 축소한 높이만큼 박스가 커진다
  const imgH = opts.image
    ? scaleNodeImage(opts.image, w, padX).h + (wrappedLines.length > 0 || mdTable ? 6 : 0)
    : 0;
  let h = textH + tableH + imgH + padY * 2;
  // 수동 높이는 최소값 — 내용이 더 크면 내용에 맞춘다
  if (opts.manualH && opts.manualH > h) h = Math.min(1200, Math.round(opts.manualH));

  return {
    w, h, lines: wrappedLines, fontSize, fontWeight, lineHeight,
    padX, padY, mdTable, manualStarts,
  };
}
