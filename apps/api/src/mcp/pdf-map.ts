/**
 * **PDF → 맵 구조** (2026-10-14) — `import_pdf`. 설계: mcp-connector.md §9.17
 *
 * ★ **요약하지 않는다 — PDF 의 글을 모두 담는다** (2026-10-14 사용자 결정). 바꾸는 것은 배치뿐:
 *   제목은 가지, 문단·목록 항목은 그 아래 노드(또는 긴 문단은 노트), 원문 글자는 그대로.
 *   빼는 것은 **반복 머리글·바닥글·쪽 번호**와 **겹쳐 그린 글자**(굵게 보이려고 두세 번 찍은 것)뿐이고,
 *   뺀 양은 결과에 숫자로 알린다.
 *
 * 구조를 정하는 차례 (`structure: "auto"`)
 *   ① 책갈피(Outlines)가 있으면 그것이 가지 — 제목·쪽·위치(/XYZ top)로 본문을 나눈다.
 *   ② 없으면 글자 크기 — 본문보다 12% 이상 큰 짧은 줄이 제목, 크기 순으로 1~3단계.
 *   ③ 그것도 없으면 번호 꼴 — `Ⅰ.`·`제1장` / `1.` / `1.1`·`가.` 로 시작하는 짧은 줄.
 *   ④ 아무것도 없으면 쪽마다 가지(`p.3`).
 * 목록(•·○·□·-·①…)은 들여쓰기로 단계를 만든다.
 */
import type { MindNode, NoteBlock, SampleMap } from '../emm/model';
import { decorateBranches, IdGen } from './github-docs';
import type { OutlineItem, PageText, Run } from './pdf-parse';

export type Structure = 'auto' | 'outline' | 'fontsize' | 'numbering' | 'pages';

/** `lead` = 줄 머리에 빈칸이 찍혀 있다(들여쓰기 — 많은 한국어 문서가 새 문단·항목을 이렇게 연다) */
export interface Line {
  page: number; y: number; x0: number; x1: number; size: number; bold: boolean; text: string; lead?: boolean; rot?: boolean;
  /** 원래 마지막 조각이 빈칸으로 끝났는가 — 다음 줄과 이을 때 낱말 경계인지 가르는 데 쓴다 */
  trail?: boolean;
}
/** `rot` = 돌아간 글씨(여백의 세로 글씨) — 글은 담되 제목·맵 이름 후보에서는 뺀다 */
export interface Block { page: number; y: number; x0: number; size: number; bold: boolean; text: string; lines: number; bullet: boolean; endPage: number; rot?: boolean }

// ── 1. 조각 → 줄 ─────────────────────────────────────────────────────

/** 겹쳐 그린 같은 글자(굵게 보이기·그림자) — 같은 글이 거의 같은 자리에 또 있으면 하나만 */
export function dedupeRuns(runs: Run[]): { runs: Run[]; dropped: number } {
  const seen = new Set<string>();
  const out: Run[] = [];
  let dropped = 0;
  for (const r of runs) {
    const g = Math.max(0.6, r.size * 0.12);
    const gx = Math.round(r.x0 / g), gy = Math.round(r.y / g);
    let dup = false;
    for (let dx = -1; dx <= 1 && !dup; dx++) for (let dy = -1; dy <= 1 && !dup; dy++) if (seen.has(`${r.text}|${gx + dx}|${gy + dy}`)) dup = true;
    // 겹친 것도 표시해 둔다 — 그림자처럼 0.1pt 씩 비켜 수십 번 찍은 사슬을 끝까지 따라가려고
    if (dup && r.text.trim()) { dropped += r.text.length; seen.add(`${r.text}|${gx}|${gy}`); continue; }
    seen.add(`${r.text}|${gx}|${gy}`);
    out.push(r);
  }
  return { runs: out, dropped };
}

const SPACE_RE = /\s$/;

function joinRuns(rs: Run[]): { text: string; size: number; bold: boolean; trail: boolean } {
  let text = '';
  let prev: Run | null = null;
  const bySize = new Map<number, number>();
  let boldChars = 0, chars = 0;
  for (const r of rs) {
    if (prev) {
      const gap = r.x0 - prev.x1;
      const sz = Math.max(r.size, prev.size);
      if (gap > sz * 0.18 && !SPACE_RE.test(text) && !/^\s/.test(r.text)) text += ' ';
    }
    text += r.text;
    const n = r.text.replace(/\s/g, '').length;
    const k = Math.round(r.size * 2) / 2;
    bySize.set(k, (bySize.get(k) ?? 0) + n);
    chars += n;
    if (r.bold) boldChars += n;
    prev = r;
  }
  let size = rs[0]?.size ?? 0, best = -1;
  for (const [k, n] of bySize) if (n > best) { best = n; size = k; }
  // 줄 머리의 보이지 않는 하이픈(U+00AD)은 한글 문서의 글머리표 '-' 다. 줄 가운데 것은 지운다.
  const t = text.replace(/\s+/g, ' ').trim().replace(/^\u00ad/, '-').replace(/\u00ad/g, '');
  return { text: t, size, bold: chars > 0 && boldChars / chars > 0.6, trail: SPACE_RE.test(text) };
}

/**
 * 한 쪽의 조각을 읽는 순서의 줄로. 가로 글자만 줄을 만들고, 돌아간 글자(여백의 세로 글씨)는
 * 쪽 끝에 따로 붙인다(버리지 않는다). 두 단 편집이면 왼쪽 단 → 오른쪽 단.
 */
export function pageLines(page: PageText, index: number): Line[] {
  const flat = page.runs.filter((r) => !r.rot && r.text.length);
  const rotated = page.runs.filter((r) => r.rot && r.text.trim());
  flat.sort((a, b) => b.y - a.y || a.x0 - b.x0);
  const rows: Run[][] = [];
  for (const r of flat) {
    const row = rows[rows.length - 1];
    if (row) {
      const ref = row[0];
      if (Math.abs(r.y - ref.y) <= Math.max(1, 0.45 * Math.min(r.size, ref.size))) { row.push(r); continue; }
    }
    rows.push([r]);
  }
  // 두 단 — 넓은 틈이 같은 x 에 되풀이되면
  const split = columnSplit(rows, page.width);
  const segs: { runs: Run[]; col: number }[] = [];
  for (const row of rows) {
    row.sort((a, b) => a.x0 - b.x0);
    if (split === null) { segs.push({ runs: row, col: 0 }); continue; }
    const left = row.filter((r) => r.x1 <= split + 1), right = row.filter((r) => r.x0 >= split - 1);
    if (left.length + right.length < row.length) segs.push({ runs: row, col: 0 }); // 단을 가로지르는 줄
    else { if (left.length) segs.push({ runs: left, col: 0 }); if (right.length) segs.push({ runs: right, col: 1 }); }
  }
  const toLine = (rs: Run[]): Line => {
    const j = joinRuns(rs);
    const vis = rs.filter((r) => r.text.trim());
    return {
      page: index, y: rs[0].y, x0: Math.min(...(vis.length ? vis : rs).map((r) => r.x0)), x1: Math.max(...rs.map((r) => r.x1)),
      size: j.size, bold: j.bold, text: j.text, lead: /^\s/.test(rs[0].text), ...(j.trail ? { trail: true } : {}),
    };
  };
  const lines = [...segs.filter((s) => s.col === 0), ...segs.filter((s) => s.col === 1)].map((s) => toLine(s.runs)).filter((l) => l.text);
  for (const r of rotated) lines.push({ page: index, y: r.y, x0: r.x0, x1: r.x1, size: r.size, bold: r.bold, text: r.text.replace(/\s+/g, ' ').trim(), rot: true });
  return lines;
}

function columnSplit(rows: Run[][], width: number): number | null {
  if (rows.length < 8) return null;
  const hits: number[] = [];
  for (const row of rows) {
    const rs = [...row].sort((a, b) => a.x0 - b.x0);
    for (let i = 1; i < rs.length; i++) {
      const gap = rs[i].x0 - rs[i - 1].x1;
      if (gap > Math.max(rs[i].size, rs[i - 1].size) * 2) { hits.push((rs[i].x0 + rs[i - 1].x1) / 2); break; }
    }
  }
  if (hits.length < rows.length * 0.35) return null;
  hits.sort((a, b) => a - b);
  const mid = hits[Math.floor(hits.length / 2)];
  const near = hits.filter((h) => Math.abs(h - mid) < width * 0.04).length;
  return near >= hits.length * 0.7 && mid > width * 0.3 && mid < width * 0.7 ? mid : null;
}

// ── 2. 머리글·바닥글·쪽 번호 ─────────────────────────────────────────

const PAGE_NO_RE = /^[-–—\s(]*(?:page\s*)?\d{1,4}(?:\s*(?:\/|of)\s*\d{1,4})?[-–—\s)]*$/i;

/**
 * 쪽 위·아래 여백(높이의 8%)에서 여러 쪽에 되풀이되는 줄(숫자는 같게 본다)과 쪽 번호만 뺀다.
 * 본문 안의 숫자 줄은 건드리지 않는다.
 */
export function stripMargins(pages: { lines: Line[]; height: number }[]): { removed: Line[] } {
  const zone = (l: Line, h: number) => l.y > h * 0.92 || l.y < h * 0.08;
  const norm = (t: string) => t.replace(/\d+/g, '#').replace(/\s+/g, '');
  const count = new Map<string, number>();
  for (const p of pages) {
    const seen = new Set<string>();
    for (const l of p.lines) if (zone(l, p.height)) seen.add(norm(l.text));
    for (const k of seen) count.set(k, (count.get(k) ?? 0) + 1);
  }
  const need = Math.max(3, Math.ceil(pages.length * 0.25));
  const PAGE_EDGE_RE = /^\d{1,4}\s*[❘|·\-–]|[❘|·\-–]\s*\d{1,4}$/;
  const removed: Line[] = [];
  for (const p of pages) {
    p.lines = p.lines.filter((l) => {
      if (!zone(l, p.height)) return true;
      const c = count.get(norm(l.text)) ?? 0;
      // 장마다 바뀌는 바닥글("5 ❘ Ⅰ. 장 제목 ❘ 보고서 이름")은 두 쪽 이상이면 — 쪽 번호가 붙어 있을 때만
      const rep = l.text.length <= 120 && (c >= need || (c >= 2 && PAGE_EDGE_RE.test(l.text)));
      if (rep || PAGE_NO_RE.test(l.text)) { removed.push(l); return false; }
      return true;
    });
  }
  return { removed };
}

// ── 3. 줄 → 문단 ─────────────────────────────────────────────────────

export const BULLET_RE = /^\s*(?:[•●○◦▪▫■□◆◇▶▷►‣⁃∙·※☞✓✔➢➤\-–—*]|\(?\d{1,2}\)|[①-⑳]|[㉠-㉭]|\(?[가-하]\)|[a-z]\)|\d{1,2}\.(?!\d))\s*/;
const END_RE = /[.!?。．다요음함됨임:;)\]」』"”'’]$/;

/**
 * 한글 줄바꿈이 낱말 가운데에서 났을 때 다음 줄 머리에 오는 조사·어미 조각 (2026-10-15 dev 실측).
 * 다음 줄 **첫 토큰 전체**가 이 중 하나일 때만 붙인다 — "이은경"·"가능성" 처럼 이 글자로 시작하는 낱말은 안 붙는다.
 */
const KO_TAIL = new Set((
  '은 는 이 가 을 를 의 에 에서 에게 에는 에도 으로 로 로서 로써 와 과 도 만 까지 부터 처럼 보다 게 께 여 써 해 해야 하여 히 ' +
  '록 도록 되 된 될 됨 되어 되며 되고 되는 된다 며 면 서 어 아 야 지 기 음 함 한다 하는 하고 했다 니다 습니다 있다 없다'
).split(' '));

/**
 * 조사·어미 조각이면서 **혼자 쓰이는 낱말**이기도 한 것 — "느리지만|이 방식은"(관형사 이)·"해"·"도"·"하는" (#645 Codex).
 * 줄 끝 빈칸으로 낱말 경계를 표시하지 않는 문서에서는 이것들을 붙이지 않는다(띄어 쓴 채로 두는 쪽이 덜 해롭다).
 */
const KO_AMBIG = new Set((
  '이 가 도 만 서 지 기 음 함 해 해야 하여 하는 하고 한다 했다 되 된 될 됨 되어 되며 되고 되는 된다 있다 없다 어 아 야 여 게 께 로 와 과 며 면 은 는 ' +
  '보다 써 록' // "결과를|보다 쉽게"·"글을|써 보았다"·"그는|록 음악을" (#645 Codex 2·3차)
).split(' '));

/**
 * 줄 잇기. ① 앞 줄이 빈칸으로 끝났으면 언제나 띄운다. ② 한글 음절로 끝나고 다음 줄 첫 토큰 전체가 조사·어미
 * 조각이면 붙인다("제시함으로|써" → "제시함으로써") — 단 `marks`(이 문서가 낱말 경계 줄바꿈에 줄 끝 빈칸을 남기는가)가
 * 아니면 혼자 쓰이는 낱말일 수 있는 조각(`KO_AMBIG`)은 붙이지 않는다. 줄 끝 빈칸이 없어도 낱말 경계인 문서가 있어
 * ("보고서는|국가") 빈칸 유무만으로는 못 가른다. ③ 영어 줄 끝 하이픈은 잇는다. ④ 그 밖은 띄운다.
 */
export function joinLine(a: string, b: string, trail = false, marks = false): string {
  // 영어 줄 끝 하이픈이 먼저 — 하이픈 뒤에 빈칸 글자가 붙어 와도(`exam- `) 잇는다 (#645 Codex 2차)
  if (/[A-Za-z]-$/.test(a) && /^[a-z]/.test(b)) return a.slice(0, -1) + b;
  if (trail) return `${a} ${b}`;
  const tok = /^[가-힣]+/.exec(b)?.[0];
  if (tok && /[가-힣]$/.test(a) && KO_TAIL.has(tok) && (marks || !KO_AMBIG.has(tok))) return a + b;
  return `${a} ${b}`;
}

/**
 * 이 문서는 한글 낱말 사이 줄바꿈에 줄 끝 빈칸을 남기는가 — 문단 안에서 잇는 줄 짝 가운데, 한글로 끝나 한글로 시작하는 같은 쪽 줄바꿈 중
 * 줄 끝 빈칸이 있는 것이 3개 이상이고 30% 이상이면 그렇다고 본다(고려대 PDF 43/60, NIA 보고서 0/34).
 * 그런 문서에서 빈칸 없는 한글 줄바꿈은 낱말 가운데다.
 */
export function marksWordWraps(pairs: [Line, Line][]): boolean {
  let n = 0, t = 0;
  for (const [a, b] of pairs) {
    if (a.page !== b.page || !/[가-힣]$/.test(a.text) || !/^[가-힣]/.test(b.text)) continue;
    n++; if (a.trail) t++;
  }
  return t >= 3 && t / n >= 0.3;
}

export function toBlocks(lines: Line[]): Block[] {
  const pitches: number[] = [];
  for (let i = 1; i < lines.length; i++) {
    const a = lines[i - 1], b = lines[i];
    if (a.page === b.page && Math.abs(a.size - b.size) < 0.5 && a.y > b.y) pitches.push((a.y - b.y) / a.size);
  }
  pitches.sort((x, y) => x - y);
  const pitch = pitches.length ? pitches[Math.floor(pitches.length / 2)] : 1.25;
  // 쪽을 넘어 이어 붙이는 것은 본문 크기 문단만 — 제목·표지 글씨는 쪽이 바뀌면 끊는다
  const sizeW = new Map<number, number>();
  for (const l of lines) { const k = Math.round(l.size * 2) / 2; sizeW.set(k, (sizeW.get(k) ?? 0) + l.text.length); }
  let body = 10, bw = -1;
  for (const [k, n] of sizeW) if (n > bw) { bw = n; body = k; }
  const out: Block[] = [];
  // 이어 붙일 줄 짝 — 문서 표시(marks)는 **실제로 잇는 줄바꿈만** 보고 정한다. 제목·표 줄·문단 끝처럼 끊기는
  // 자리의 줄 끝 빈칸을 세면 문서 전체가 '표시하는 문서' 로 잘못 잡힌다 (#645 Codex 3차)
  const joins: { block: Block; prev: Line; line: Line }[] = [];
  let cur: Block | null = null;
  let prev: Line | null = null;
  for (const l of lines) {
    const bullet = BULLET_RE.test(l.text);
    let fresh = !cur || !prev || Boolean(l.rot) || Boolean(prev?.rot);
    if (cur && prev) {
      const sizeJump = Math.abs(l.size - prev.size) > Math.max(prev.size, l.size) * 0.08;
      const boldJump = l.bold !== prev.bold;
      const samePage = l.page === prev.page;
      const gap = samePage ? (prev.y - l.y) / prev.size : 0;
      const bigGap = samePage && (gap > pitch * 1.3 + 0.1 || gap < -0.5);
      // 쪽을 넘어 잇는 것은 바로 다음 쪽일 때만 — pages "1,100" 처럼 건너뛴 사이를 잇지 않는다 (#642 Codex)
      const pageBreak = !samePage && (l.page !== prev.page + 1 || END_RE.test(prev.text) || Math.abs(l.size - body) > body * 0.08);
      // 글머리표 항목 뒤의 줄이 항목 글자보다 들여 있지 않으면 항목이 끝난 것이다
      const afterItem = cur.bullet && !bullet && l.x0 <= cur.x0 + l.size * 0.5;
      fresh = sizeJump || boldJump || bigGap || bullet || pageBreak || Boolean(l.lead) || afterItem;
    }
    if (fresh || !cur) {
      cur = { page: l.page, y: l.y, x0: l.x0, size: l.size, bold: l.bold, text: l.text, lines: 1, bullet, endPage: l.page, ...(l.rot ? { rot: true } : {}) };
      out.push(cur);
    } else {
      joins.push({ block: cur, prev: prev!, line: l });
      cur.lines++;
      cur.endPage = l.page;
    }
    prev = l;
  }
  const marks = marksWordWraps(joins.map((j): [Line, Line] => [j.prev, j.line]));
  for (const j of joins) j.block.text = joinLine(j.block.text, j.line.text, Boolean(j.prev.trail), marks);
  return out;
}

// ── 4. 제목 고르기 ───────────────────────────────────────────────────

export interface Heading { level: number; title: string; page: number; top: number | null; fromBlock?: Block }

function bodySize(blocks: Block[]): number {
  const w = new Map<number, number>();
  for (const b of blocks) { const k = Math.round(b.size * 2) / 2; w.set(k, (w.get(k) ?? 0) + b.text.length); }
  let best = 0, size = 10;
  for (const [k, n] of w) if (n > best) { best = n; size = k; }
  return size;
}

/** 글자 크기로 제목 고르기 — 본문보다 12% 이상 큰 짧은 문단, 크기 순 1~3단계 */
export function headingsBySize(blocks: Block[]): { headings: Map<Block, number>; cover: Block | null } {
  const body = bodySize(blocks);
  const cands = blocks.filter((b) => !b.rot && b.size >= body * 1.12 && b.text.length <= 150 && b.lines <= 3 && /\p{L}/u.test(b.text));
  const sizes = [...new Set(cands.map((b) => Math.round(b.size * 2) / 2))].sort((a, b) => b - a);
  let cover: Block | null = null;
  // 가장 큰 글자가 첫 쪽에 한 번뿐이면 표지 제목 — 맵 이름으로 쓰고 단계에서 뺀다
  // (속표지가 같은 제목을 한 번 더 찍는 일이 흔하다 — 같은 글이면 하나로 본다)
  const echoes = new Set<Block>();
  if (sizes.length >= 2) {
    const top = cands.filter((b) => Math.round(b.size * 2) / 2 === sizes[0]);
    const same = top.every((b) => normTitle(b.text) === normTitle(top[0].text));
    if (same && top[0].page === blocks[0]?.page) { cover = top[0]; sizes.shift(); top.slice(1).forEach((b) => echoes.add(b)); }
  }
  const level = new Map<number, number>();
  sizes.forEach((s, i) => level.set(s, Math.min(3, i + 1)));
  const headings = new Map<Block, number>();
  for (const b of cands) { if (b === cover || echoes.has(b)) continue; headings.set(b, level.get(Math.round(b.size * 2) / 2) ?? 3); }
  return { headings, cover };
}

const NUM_L1 = /^(제\s*\d+\s*[편장부]|[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]+\s*[.．]?\s|[IVX]{1,4}\.\s|chapter\s+\d+|part\s+\d+)/i;
const NUM_L2 = /^(제\s*\d+\s*절|\d{1,2}[.．]\s*(?=\S))/;
const NUM_L3 = /^(\d{1,2}\.\d{1,2}\.?\s|[가-하][.．]\s)/;

/** 번호 꼴로 제목 고르기 — 짧은 한 줄, 본문 크기 이상, 문장 끝이 아닌 것 */
export function headingsByNumbering(blocks: Block[]): Map<Block, number> {
  const body = bodySize(blocks);
  const out = new Map<Block, number>();
  for (const b of blocks) {
    if (b.lines > 1 || b.text.length > 80 || b.size < body * 0.98 || /[.。다]$/.test(b.text)) continue;
    const lv = NUM_L1.test(b.text) ? 1 : NUM_L3.test(b.text) ? 3 : NUM_L2.test(b.text) && (b.bold || b.size > body * 1.02) ? 2 : 0;
    if (lv) out.set(b, lv);
  }
  return [...out.values()].filter((v) => v <= 2).length >= 2 ? out : new Map();
}

// ── 5. 맵 만들기 ─────────────────────────────────────────────────────

export interface PdfMapInput {
  title: string;
  fileName: string;
  pageCount: number;
  /** 읽은 쪽 (0부터) — pages 범위를 주면 일부 */
  pages: { index: number; lines: Line[] }[];
  outline: OutlineItem[];
  structure?: Structure;
  /** 이 글자 수 이상 문단은 노드가 아니라 부모의 노트로 (0 = 끔) */
  longTextToNote?: number;
  fetchedAt: string;
  source: string;
}

export interface PdfMapResult {
  map: SampleMap;
  structureUsed: Exclude<Structure, 'auto'>;
  headings: number;
  paragraphs: number;
  nodes: number;
  charsInMap: number;
}

function normTitle(s: string): string { return s.replace(/[\s.．·:\-–—]/g, '').toLowerCase(); }

function flattenOutline(items: OutlineItem[], level = 1, out: Heading[] = []): Heading[] {
  for (const it of items) {
    if (it.title && it.page !== null) out.push({ level, title: it.title, page: it.page, top: it.top });
    flattenOutline(it.children, Math.min(level + 1, 6), out);
  }
  return out;
}

export function buildPdfMap(inp: PdfMapInput, ids = new IdGen()): PdfMapResult {
  const lines = inp.pages.flatMap((p) => p.lines);
  const blocks = toBlocks(lines);
  const pageNos = (a: number, b: number) => (a === b ? `p.${a + 1}` : `p.${a + 1}–${b + 1}`);

  // 구조 정하기
  let used: Exclude<Structure, 'auto'> = 'pages';
  const want = inp.structure ?? 'auto';
  const readPages = new Set(inp.pages.map((p) => p.index));
  const outlineHeads = flattenOutline(inp.outline).filter((h) => h.page !== null && readPages.has(h.page));
  let bySize = headingsBySize(blocks);
  let byNum = new Map<Block, number>();
  if ((want === 'auto' || want === 'outline') && outlineHeads.length >= 2) used = 'outline';
  else if ((want === 'auto' || want === 'fontsize') && (bySize.headings.size >= 2 || (bySize.headings.size === 1 && bySize.cover)) && bySize.headings.size <= blocks.length * 0.5) used = 'fontsize';
  else if (want === 'auto' || want === 'numbering') {
    byNum = headingsByNumbering(blocks);
    if (byNum.size >= 2) used = 'numbering';
  }
  if (want === 'fontsize' && used !== 'fontsize' && bySize.headings.size) used = 'fontsize';
  if (want === 'numbering' && used !== 'numbering') { byNum = headingsByNumbering(blocks); if (byNum.size) used = 'numbering'; }
  if (used !== 'fontsize') bySize = { headings: new Map(), cover: bySize.cover };
  // 크기로 고른 제목 아래, 본문 크기의 번호 소제목(`1.1.`·`가.`) — 한 단계 아래로
  if (used === 'fontsize') {
    const deepest = Math.max(...bySize.headings.values());
    const body = bodySize(blocks);
    const subs = blocks.filter((b) => !bySize.headings.has(b) && b !== bySize.cover && b.lines === 1 && b.text.length <= 80
      && Math.abs(b.size - body) <= body * 0.08 && !/[.。다]$/.test(b.text) && NUM_L3.test(b.text));
    if (subs.length >= 2) for (const b of subs) bySize.headings.set(b, Math.min(4, deepest + 1));
  }

  // 차례대로 펼친 항목 — 제목(단계) 또는 본문 문단
  type Item = { kind: 'h'; level: number; title: string; page: number } | { kind: 'p'; block: Block };
  const items: Item[] = [];
  if (used === 'outline') {
    // 책갈피 차례(= 문서 차례)를 지키고, 본문 위치로 끼워 넣는다
    let hi = 0;
    const pending = [...outlineHeads];
    const before = (h: Heading, b: Block) => h.page < b.page || (h.page === b.page && (h.top === null || b.y <= h.top + b.size * 0.5));
    for (const b of blocks) {
      while (hi < pending.length && before(pending[hi], b)) { const h = pending[hi++]; items.push({ kind: 'h', level: h.level, title: h.title, page: h.page }); }
      // 책갈피 제목과 같은 줄은 제목의 메아리 — 본문에서 뺀다
      const last = [...items].reverse().find((x) => x.kind === 'h') as { kind: 'h'; title: string; page: number } | undefined;
      if (last && b.lines <= 2 && b.page - last.page <= 1 && normTitle(b.text).endsWith(normTitle(last.title)) && normTitle(b.text).length <= normTitle(last.title).length + 8) continue;
      items.push({ kind: 'p', block: b });
    }
    while (hi < pending.length) { const h = pending[hi++]; items.push({ kind: 'h', level: h.level, title: h.title, page: h.page }); }
  } else if (used === 'fontsize' || used === 'numbering') {
    const lv = used === 'fontsize' ? bySize.headings : byNum;
    for (const b of blocks) {
      if (b === bySize.cover) continue;
      const l = lv.get(b);
      items.push(l ? { kind: 'h', level: l, title: b.text, page: b.page } : { kind: 'p', block: b });
    }
  } else {
    let page = -1;
    for (const b of blocks) {
      if (b.page !== page) { page = b.page; items.push({ kind: 'h', level: 1, title: `p.${page + 1}`, page }); }
      items.push({ kind: 'p', block: b });
    }
  }

  // 트리
  const root: MindNode = { id: 'root', text: '', children: [] };
  type Frame = { node: MindNode; level: number; first: number; last: number };
  const stack: Frame[] = [{ node: root, level: 0, first: -1, last: -1 }];
  const pageSpan = new Map<MindNode, [number, number]>();
  let front: MindNode | null = null;
  let headings = 0, paragraphs = 0, chars = 0;
  const longN = inp.longTextToNote && inp.longTextToNote > 0 ? inp.longTextToNote : 0;
  // 목록 들여쓰기 — 제목 노드마다 (x0, 노드) 사다리
  let ladder: { x0: number; node: MindNode }[] = [];
  const touch = (n: MindNode, p: number) => { const s = pageSpan.get(n); pageSpan.set(n, s ? [Math.min(s[0], p), Math.max(s[1], p)] : [p, p]); };
  const anyHeading = items.some((x) => x.kind === 'h');
  for (const it of items) {
    if (it.kind === 'h') {
      while (stack.length > 1 && stack[stack.length - 1].level >= it.level) stack.pop();
      const node: MindNode = { id: ids.next('pdf'), text: it.title, children: [] };
      stack[stack.length - 1].node.children!.push(node);
      stack.push({ node, level: it.level, first: it.page, last: it.page });
      touch(node, it.page);
      ladder = [];
      headings++;
      chars += it.title.length;
      continue;
    }
    const b = it.block;
    let parent = stack[stack.length - 1].node;
    if (parent === root && anyHeading) {
      if (!front) { front = { id: ids.next('pdf'), text: '앞부분', children: [] }; root.children!.push(front); }
      parent = front;
    }
    for (const f of stack) touch(f.node, b.endPage);
    if (parent === front) touch(front, b.endPage);
    paragraphs++;
    chars += b.text.length;
    if (longN && b.text.length >= longN && !b.bullet) {
      const note: NoteBlock = { id: ids.next('nt'), type: 'paragraph', text: b.text };
      parent.notes = [...(parent.notes ?? []), note];
      continue;
    }
    const node: MindNode = { id: ids.next('pdf'), text: b.text, children: [] };
    if (b.bullet) {
      while (ladder.length && ladder[ladder.length - 1].x0 >= b.x0 - b.size * 0.6) ladder.pop();
      (ladder.length ? ladder[ladder.length - 1].node : parent).children!.push(node);
      ladder.push({ x0: b.x0, node });
    } else {
      ladder = [];
      parent.children!.push(node);
    }
  }

  // 제목 노드에 쪽 범위 노트, 빈 children 정리
  const finish = (n: MindNode, isRoot: boolean) => {
    if (!isRoot && pageSpan.has(n) && n.children && n.children.length) {
      const [a, b] = pageSpan.get(n)!;
      n.notes = [{ id: ids.next('nt'), type: 'paragraph', text: pageNos(a, b) }, ...(n.notes ?? [])];
    }
    if (n.children) { n.children.forEach((c) => finish(c, false)); if (!n.children.length) delete n.children; }
  };
  finish(root, true);

  // 맵 이름: 문서 정보 제목 → 표지 제목 → 첫 쪽의 가장 큰 글씨(본문의 1.3배 이상) → 파일 이름
  const firstPage = blocks.length ? blocks[0].page : -1;
  const body0 = bodySize(blocks);
  const big = blocks.filter((b) => !b.rot && b.page === firstPage && b.size >= body0 * 1.3 && b.text.length <= 150 && /\p{L}/u.test(b.text)).sort((a, b) => b.size - a.size)[0];
  const title = (inp.title || bySize.cover?.text || big?.text || inp.fileName.replace(/\.pdf$/i, '') || 'PDF').slice(0, 255);
  const read = inp.pages.length === inp.pageCount ? `${inp.pageCount}쪽` : `${inp.pageCount}쪽 중 ${inp.pages.length}쪽`;
  const count = (ns: MindNode[] | undefined): number => (ns ?? []).reduce((s, n) => s + 1 + count(n.children), 0);
  const branches = decorateBranches(root.children ?? []);
  const map: SampleMap = {
    title,
    root: {
      id: 'root', text: title, colorKey: 'root', side: 'center',
      notes: [{ id: ids.next('nt'), type: 'paragraph', text: `출처: PDF "${inp.fileName}" · ${read} · ${inp.source} (가져옴 ${inp.fetchedAt})` }],
    } as SampleMap['root'],
    branches: branches as SampleMap['branches'],
  };
  return { map, structureUsed: used, headings, paragraphs, nodes: 1 + count(branches), charsInMap: chars };
}

/** 문서 정보의 제목이 쓸 만한가 — "Microsoft Word - a.docx" · "untitled" · 파일 이름 꼴은 버린다 */
export function cleanPdfTitle(t: string): string {
  const s = String(t ?? '').replace(/^Microsoft (Word|PowerPoint|Excel) - /i, '').replace(/\.(docx?|pptx?|xlsx?|hwpx?|pdf)$/i, '').trim();
  if (!s || /^(untitled|제목 없음|無題)$/i.test(s) || /^[\w-]+$/.test(s) && s.length < 4) return '';
  return s;
}

/** 쪽마다 줄을 만들고 머리글·바닥글을 뺀다 — `readPdf` 결과에서 바로 */
export function linesFromPages(pages: (PageText & { index: number })[]): {
  pages: { index: number; lines: Line[] }[]; removedMargin: Line[]; droppedDup: number; emptyPages: number[]; rawChars: number;
} {
  let droppedDup = 0, rawChars = 0;
  const withLines = pages.map((p) => {
    const d = dedupeRuns(p.runs);
    droppedDup += d.dropped;
    const lines = pageLines({ ...p, runs: d.runs }, p.index);
    rawChars += lines.reduce((s, l) => s + l.text.length, 0);
    return { index: p.index, lines, height: p.height };
  });
  const { removed } = stripMargins(withLines);
  const emptyPages = withLines.filter((p) => p.lines.length === 0).map((p) => p.index + 1);
  return { pages: withLines.map((p) => ({ index: p.index, lines: p.lines })), removedMargin: removed, droppedDup, emptyPages, rawChars };
}
