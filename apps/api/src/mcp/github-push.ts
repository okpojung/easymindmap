/**
 * **맵 → GitHub 반영** 의 순수 부분 (2026-10-14) — `push_map_to_github`.
 * 설계: docs/04-extensions/ai/mcp-connector.md §9.15
 *
 * `import_github_docs` 로 만든 맵을 사용자가 고친 뒤, 고친 내용을 저장소의
 * 파일에 되돌려 쓴다. 이 파일은 네트워크·DB 를 모른다 — 문자열과 맵 객체만.
 *
 * ★ **파일을 맵에서 다시 만들지 않는다 — 원문의 그 자리만 고친다.**
 *   가져오기는 손실이 있다: 노트는 노드당 8개·문단 1,200자까지만 들어오고
 *   (NOTE_LIMITS), 사진·HTML 주석·수평선은 버리고, `####` 이하는 굵은 글이 된다.
 *   맵에서 파일을 통째로 다시 쓰면 그 빠진 것들이 저장소에서 지워진다. 그래서
 *   **지금 파일 원문을 다시 읽어 "가져왔다면 이렇게 됐을" 기준과 맵을 비교**하고,
 *   다른 곳만 원문 줄 단위로 바꾼다(`sectionizeRanged` 가 블록·견출의 줄 번호를 준다).
 *
 * ★ **기준이 맞는지부터 본다** — 맵의 문서 노드 노트에 적힌 `파일 <blob sha>` 가
 *   저장소의 지금 파일과 같아야 한다. 다르면 맵을 가져온 뒤 GitHub 쪽이 바뀐
 *   것이라 비교 기준이 없다 → 그 파일은 **충돌**로 건너뛴다(덮어쓰지 않는다).
 *
 * **무엇이 반영되나** (문서 노드 = 링크가 이 저장소 blob 주소인 노드)
 *   · 문서 노드의 이름 → 첫 `#` 제목
 *   · 절 노드(생성 id)의 이름 → 그 견출 줄 (`##`·`###` 개수는 원문 그대로)
 *   · 생성 노트의 글 → 그 블록 (잘려 들어온 노트는 고칠 수 없다 — 경고)
 *   · 생성 노트·절 노드를 지움 → 그 블록·절(하위 절 포함)을 지움
 *   · 사용자가 붙인 노드 → 새 절, 사용자가 붙인 노트 → 그 절 끝에 새 블록
 *   · **파일 안은 내용, 파일 밖은 메모** — 문서 노드 아래에 사용자가 붙인 것은
 *     기본이 "내용"이다. 반영하지 않을 것은 `메모` 태그 또는 `[메모]` 머리.
 *
 * **새 파일** — 문서 노드 밖(폴더 노드 아래·중심주제 아래)에 사용자가 붙인 노드는
 *   기본이 "메모"다(갱신 도구도 지우지 않고 남긴다). 새 파일로 만들 노드에만
 *   표시를 단다: 태그 `새파일` (또는 `새파일:이름.md`), 태그를 달 수 없는
 *   AI 대화에서는 노드 이름 머리 `[새파일]` · `[새파일:이름.md]`. 영문 별칭
 *   `AddFile`·`NewFile` 도 받는다. 파일 자리 = 가장 가까운 폴더 노드의 폴더.
 */
import { createHash } from 'crypto';
import type { MindNode, NoteBlock, SampleMap } from '../emm/model';
import type { Block, DocsSource, FileCommit, IdGen, RangedOutline, Section } from './github-docs';
import {
  MARKDOWN_RE, buildFileNode, ensureFolderChain, fileBaseName, fileNodePath, folderNodePath,
  isGenerated, mergeNode, sectionizeRanged, selectNoteBlocks,
} from './github-docs';

export class GithubPushError extends Error {}

// ── 표시(마커) ────────────────────────────────────────────────────────

const NEW_WORD = '(?:새\\s*파일|add\\s*-?\\s*file|new\\s*-?\\s*file)';
const MEMO_WORD = '(?:메모|memo)';
const TAG_NEW_RE = new RegExp(`^${NEW_WORD}(?:\\s*[:：]\\s*(.+))?$`, 'i');
const TAG_MEMO_RE = new RegExp(`^${MEMO_WORD}$`, 'i');
const TITLE_NEW_RE = new RegExp(`^\\s*\\[${NEW_WORD}(?:\\s*[:：]\\s*([^\\]]+))?\\]\\s*`, 'i');
const TITLE_MEMO_RE = new RegExp(`^\\s*\\[${MEMO_WORD}\\]\\s*`, 'i');
/** 노트는 태그가 없다 — 글 머리 `[메모]` 로 반영에서 뺀다 */
export const NOTE_MEMO_RE = /^\s*\[(?:메모|memo)\]/i;

export interface Marker { kind: 'newfile' | 'memo'; name?: string; via: 'tag' | 'title' }

function tagsOf(n: MindNode): string[] {
  return [...(n.tags ?? []), ...(n.tag ? [n.tag] : [])].map((t) => String(t).trim()).filter(Boolean);
}
function firstLine(s: string | undefined): string {
  return String(s ?? '').split('\n')[0];
}

/** 노드의 표시 — 태그가 이름 머리보다 앞선다. 없으면 null */
export function readMarker(node: MindNode): Marker | null {
  for (const t of tagsOf(node)) {
    const m = TAG_NEW_RE.exec(t);
    if (m) return { kind: 'newfile', name: m[1]?.trim() || undefined, via: 'tag' };
  }
  if (tagsOf(node).some((t) => TAG_MEMO_RE.test(t))) return { kind: 'memo', via: 'tag' };
  const head = firstLine(node.text);
  const m = TITLE_NEW_RE.exec(head);
  if (m) return { kind: 'newfile', name: m[1]?.trim() || undefined, via: 'title' };
  if (TITLE_MEMO_RE.test(head)) return { kind: 'memo', via: 'title' };
  return null;
}

/** 노드 이름(첫 줄) — 이름 머리의 표시는 걷는다 */
export function cleanTitle(node: MindNode): string {
  return firstLine(node.text).replace(TITLE_NEW_RE, '').replace(TITLE_MEMO_RE, '').trim();
}

/** 노드 글의 둘째 줄부터 — 절 머리말 문단으로 나간다 */
function extraTextLines(node: MindNode): string[] {
  const rest = String(node.text ?? '').split('\n').slice(1).map((l) => l.replace(/\s+$/, ''));
  while (rest.length && !rest[0].trim()) rest.shift();
  while (rest.length && !rest[rest.length - 1].trim()) rest.pop();
  return rest;
}

function isMemoNode(n: MindNode): boolean {
  return !isGenerated(n.id) && readMarker(n)?.kind === 'memo';
}
function isMemoNote(n: NoteBlock): boolean {
  return !isGenerated(n.id) && NOTE_MEMO_RE.test(String(n.text ?? ''));
}
/** 문서 노드의 갱신 시각 노트 — 반영 대상이 아니다 */
function isMetaNote(n: NoteBlock): boolean {
  return /^최종 업데이트:/.test(String(n.text ?? '').trim());
}

// ── 짝짓기 ────────────────────────────────────────────────────────────

export interface Pair { a: number | null; b: number | null }

function norm(s: string): string {
  return String(s ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * 두 목록을 짝짓는다 — 같은 글은 순서를 지키며(LCS) 묶고, 그 사이의 틈은
 * **자리대로** 짝짓는다(= 고친 것), 남는 것은 한쪽만(= 더함·지움).
 */
export function align(a: string[], b: string[]): Pair[] {
  const A = a.map(norm);
  const B = b.map(norm);
  const n = A.length, m = B.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  }
  const anchors: [number, number][] = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) { anchors.push([i, j]); i++; j++; } else if (dp[i + 1][j] >= dp[i][j + 1]) i++; else j++;
  }
  const out: Pair[] = [];
  let pa = 0, pb = 0;
  const gap = (ea: number, eb: number) => {
    const la = ea - pa, lb = eb - pb, k = Math.min(la, lb);
    for (let t = 0; t < k; t++) out.push({ a: pa + t, b: pb + t });
    for (let t = k; t < la; t++) out.push({ a: pa + t, b: null });
    for (let t = k; t < lb; t++) out.push({ a: null, b: pb + t });
  };
  for (const [x, y] of anchors) { gap(x, y); out.push({ a: x, b: y }); pa = x + 1; pb = y + 1; }
  gap(n, m);
  return out;
}

// ── 그리기 (노드·노트 → 마크다운 줄) ─────────────────────────────────

function noteLines(n: NoteBlock): string[] {
  const text = String(n.text ?? '').replace(/\r\n?/g, '\n').replace(/\s+$/, '');
  switch (n.type) {
    case 'code_block': return ['```' + (n.lang ?? ''), ...text.split('\n'), '```'];
    case 'checklist': return [`- [${n.checked ? 'x' : ' '}] ${text}`];
    default: return text.split('\n');
  }
}

/** 노트 여럿 → 블록 사이에 빈 줄. 이어진 체크리스트는 한 목록으로 붙인다 */
export function renderNotes(notes: NoteBlock[]): string[] {
  const out: string[] = [];
  notes.forEach((n, i) => {
    const prev = notes[i - 1];
    if (i > 0 && !(prev?.type === 'checklist' && n.type === 'checklist')) out.push('');
    out.push(...noteLines(n));
  });
  return out;
}

function joinChunks(chunks: string[][]): string[] {
  const out: string[] = [];
  for (const c of chunks) {
    if (!c.length) continue;
    if (out.length) out.push('');
    out.push(...c);
  }
  return out;
}

/** 깊이 경고 — `####` 이하는 다시 가져오면 노트(굵은 글)가 된다 */
export const DEEP_LEVEL_WARNING = '4단계 이하 노드는 파일에서 `####` 견출이 되고, 다시 가져오면 노드가 아니라 노트(굵은 글)로 들어갑니다.';

/** 노드 하나 → 절 (`level` 개의 `#`). 메모 노드·메모 노트는 빼고 */
export function renderSection(node: MindNode, level: number, warn?: (w: string) => void): string[] {
  const title = cleanTitle(node) || '(제목 없음)';
  if (level >= 4 && warn) warn(DEEP_LEVEL_WARNING);
  const chunks: string[][] = [[`${'#'.repeat(Math.min(level, 6))} ${title}`]];
  const extra = extraTextLines(node);
  if (extra.length) chunks.push(extra);
  const notes = (node.notes ?? []).filter((n) => !isMemoNote(n) && !isMetaNote(n));
  if (notes.length) chunks.push(renderNotes(notes));
  for (const c of node.children ?? []) {
    if (readMarker(c)?.kind === 'memo') continue;
    chunks.push(renderSection(c, level + 1, warn));
  }
  return joinChunks(chunks);
}

/** `[새파일]` 노드 → 새 문서 전체 (`#` 제목 · 머리말 · `##` 절) — 끝에 줄바꿈 */
export function renderNewFile(node: MindNode, warn?: (w: string) => void): string {
  const title = cleanTitle(node) || '(제목 없음)';
  const chunks: string[][] = [[`# ${title}`]];
  const extra = extraTextLines(node);
  if (extra.length) chunks.push(extra);
  const notes = (node.notes ?? []).filter((n) => !isMemoNote(n) && !isMetaNote(n));
  if (notes.length) chunks.push(renderNotes(notes));
  for (const c of node.children ?? []) {
    if (readMarker(c)?.kind === 'memo') continue;
    chunks.push(renderSection(c, 2, warn));
  }
  return joinChunks(chunks).join('\n') + '\n';
}

// ── 파일 이름 ─────────────────────────────────────────────────────────

const BAD_SEG_RE = /[\\:*?"<>|\u0000-\u001f]/;

/**
 * 새 파일의 이름(폴더 기준 상대 경로). 표시에 이름을 주면(`새파일:guide/install.md`)
 * 그것을, 아니면 노드 이름에서 만든다(공백 → `-`, 파일 이름에 못 쓰는 글자 제거).
 * 한글은 그대로 둔다 — 저장소에 이미 `12-AI-커넥터-MCP.md` 같은 이름이 있다.
 */
export function fileNameFor(title: string, explicit?: string): string {
  let name: string;
  if (explicit && explicit.trim()) {
    name = explicit.trim().replace(/^\.?\/+/, '');
  } else {
    const slug = String(title ?? '')
      .replace(/[\\/:*?"<>|#[\]`]/g, ' ')
      .trim()
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^[-.]+|[-.]+$/g, '')
      .slice(0, 80);
    name = slug || 'untitled';
  }
  if (!MARKDOWN_RE.test(name)) name += '.md';
  for (const seg of name.split('/')) {
    if (!seg || seg === '.' || seg === '..' || BAD_SEG_RE.test(seg)) {
      throw new GithubPushError(`새 파일 이름 "${name}" 을 쓸 수 없습니다 — 빈 이름·\`..\`·\\ : * ? " < > | 는 안 됩니다.`);
    }
  }
  return name;
}

// ── 원문 줄 고치기 ────────────────────────────────────────────────────

interface LineEdit { start: number; end: number; lines: string[]; seq: number }

class Patcher {
  private readonly edits: LineEdit[] = [];
  private readonly inserts = new Map<number, string[][]>();
  private seq = 0;
  readonly eof: number;
  constructor(readonly o: RangedOutline) {
    this.eof = o.finalNewline ? o.lines.length - 1 : o.lines.length;
  }
  private clamp(x: number): number { return Math.max(0, Math.min(x, this.eof)); }
  replace(start: number, end: number, lines: string[]): void {
    this.edits.push({ start: this.clamp(start), end: this.clamp(end), lines, seq: this.seq++ });
  }
  /** 블록 하나 지우기 — 앞뒤가 빈 줄이면 뒤 빈 줄도 함께 (빈 줄이 겹치지 않게) */
  removeBlock(start: number, end: number): void {
    const L = this.o.lines;
    let e = end;
    if (e < this.eof && !L[e]?.trim() && (start === 0 || !L[start - 1]?.trim())) e++;
    this.replace(start, e, []);
  }
  insert(pos: number, lines: string[]): void {
    const p = this.clamp(pos);
    const list = this.inserts.get(p) ?? [];
    list.push(lines);
    this.inserts.set(p, list);
  }
  /** 내용 끝 — [from, to) 에서 마지막 빈 줄 아닌 줄 다음 (없으면 from) */
  contentEnd(from: number, to: number): number {
    const L = this.o.lines;
    let last = -1;
    for (let k = from; k < Math.min(to, this.eof); k++) if (L[k].trim()) last = k;
    return last >= 0 ? last + 1 : Math.min(from, this.eof);
  }
  get changed(): boolean { return this.edits.length > 0 || this.inserts.size > 0; }

  /** 적용 — 원문 줄은 그대로 두고 고친 자리만. 고친 자리 주변의 겹친 빈 줄은 하나로 */
  apply(): { text: string; hunks: string[] } {
    const L = this.o.lines;
    const all: LineEdit[] = [...this.edits];
    for (const [pos, chunks] of this.inserts) {
      const body = joinChunks(chunks);
      const before = pos > 0 && L[pos - 1]?.trim() ? [''] : [];
      const after = pos < this.eof && L[pos]?.trim() ? [''] : [];
      all.push({ start: pos, end: pos, lines: [...before, ...body, ...after], seq: -1 });
    }
    // 같은 자리면 끼워 넣기가 먼저, 그다음 차례대로
    all.sort((x, y) => x.start - y.start || (x.end - x.start > 0 ? 1 : 0) - (y.end - y.start > 0 ? 1 : 0) || x.seq - y.seq);
    const out: { t: string; touched: boolean }[] = [];
    const hunks: string[] = [];
    let pos = 0;
    for (const e of all) {
      if (e.start < pos) continue; // 겹침 — 만들지 않게 짰지만, 생기면 원문을 지킨다
      for (let k = pos; k < e.start; k++) out.push({ t: L[k], touched: false });
      if (out.length) out[out.length - 1].touched = out[out.length - 1].touched || !out[out.length - 1].t.trim();
      for (const t of e.lines) out.push({ t, touched: true });
      hunks.push(...describeHunk(L, e));
      pos = e.end;
      if (pos < L.length && !L[pos].trim()) { out.push({ t: L[pos], touched: true }); pos++; }
    }
    for (let k = pos; k < L.length; k++) out.push({ t: L[k], touched: false });
    // 고친 자리에 생긴 빈 줄 겹침만 하나로 (먼 곳의 원래 빈 줄은 손대지 않는다)
    const cleaned: string[] = [];
    for (let k = 0; k < out.length; k++) {
      const cur = out[k];
      const prev = cleaned.length ? cleaned[cleaned.length - 1] : null;
      if (!cur.t.trim() && prev !== null && !prev.trim() && (cur.touched || (k > 0 && out[k - 1].touched))) continue;
      cleaned.push(cur.t);
    }
    // 맨 앞 빈 줄(지워서 생긴 것) 정리 — front matter 가 없을 때만
    while (this.o.startLine === 0 && cleaned.length > 1 && !cleaned[0].trim() && L[0]?.trim()) cleaned.shift();
    let text = cleaned.join('\n');
    if (this.o.finalNewline && !text.endsWith('\n')) text += '\n';
    if (this.o.eol === '\r\n') text = text.replace(/\n/g, '\r\n');
    return { text, hunks };
  }
}

const HUNK_MAX_LINES = 12;
function describeHunk(L: string[], e: LineEdit): string[] {
  const out: string[] = [`@@ ${e.start + 1}번째 줄${e.end > e.start ? `~${e.end}` : ''}`];
  const minus = L.slice(e.start, e.end).filter((l, i, a) => l.trim() || (i > 0 && i < a.length - 1));
  const plus = e.lines.filter((l, i, a) => l.trim() || (i > 0 && i < a.length - 1));
  const take = (arr: string[], sign: string) => {
    arr.slice(0, HUNK_MAX_LINES).forEach((l) => out.push(`${sign} ${l}`));
    if (arr.length > HUNK_MAX_LINES) out.push(`${sign} … (${arr.length - HUNK_MAX_LINES}줄 더)`);
  };
  take(minus, '-');
  take(plus, '+');
  return out;
}

/** 원래 블록 자리에 고친 노트 — 블록의 꼴(코드 펜스·인용·`####`)은 원문을 따른다 */
function renderEdit(b: Block, L: string[], note: NoteBlock): string[] {
  const text = String(note.text ?? '').replace(/\r\n?/g, '\n').replace(/\s+$/, '');
  const start = b.start!, end = b.end!;
  if (b.kind === 'code') {
    const open = L[start];
    const closeLine = end - 1 > start ? L[end - 1] : undefined;
    const close = closeLine !== undefined && /^[ \t]{0,3}(```+|~~~+)[ \t]*$/.test(closeLine) ? closeLine : open.replace(/^([ \t]*)(`+|~+).*/, '$1$2');
    return [open, ...text.split('\n'), close];
  }
  if (b.kind === 'quote') return text.split('\n').map((l) => (l ? `> ${l}` : '>'));
  if (b.kind === 'paragraph' && end - start === 1) {
    const h = /^(\s{0,3}#{4,6})[ \t]/.exec(L[start]);
    const bold = /^\*\*(.+)\*\*$/s.exec(text);
    if (h && bold) return [`${h[1]} ${bold[1]}`];
  }
  return text.split('\n');
}

function short(s: string, max = 40): string {
  const one = String(s ?? '').replace(/\s+/g, ' ').trim();
  return one.length > max ? one.slice(0, max - 1) + '…' : one;
}

// ── 문서 하나 비교 ────────────────────────────────────────────────────

export interface FileChange {
  path: string;
  nodeId: string;
  before: string;
  after: string;
  /** 사람이 읽는 바뀜 목록 */
  ops: string[];
  /** 반영하지 못했거나 조심할 것 */
  warnings: string[];
  /** 고친 자리 (미리보기용) */
  hunks: string[];
  changed: boolean;
}

function titleFromPath(path: string): string {
  return fileBaseName(path).replace(MARKDOWN_RE, '');
}

/**
 * 문서 노드 하나를 저장소의 지금 원문과 비교해 **고친 원문**을 만든다.
 * 원문은 맵이 가져온 그 판이어야 한다(호출하는 쪽이 blob sha 로 확인한다).
 */
export function diffFileNode(path: string, node: MindNode, markdown: string): FileChange {
  const o = sectionizeRanged(markdown);
  const L = o.lines;
  const P = new Patcher(o);
  const ops: string[] = [];
  const warnings = new Set<string>();
  const warn = (w: string) => warnings.add(w);

  // 1) 제목
  const mTitle = cleanTitle(node);
  const baseTitle = o.title ?? titleFromPath(path);
  if (mTitle && norm(mTitle) !== norm(baseTitle)) {
    if (o.titleLine !== null) P.replace(o.titleLine, o.titleLine + 1, [`# ${mTitle}`]);
    else P.insert(o.startLine, [`# ${mTitle}`]);
    ops.push(`제목: "${baseTitle}" → "${mTitle}"`);
  }

  // 2) 머리말 노트
  const introFrom = o.titleLine !== null ? o.titleLine + 1 : o.startLine;
  diffNotes(node.notes ?? [], o.intro, P.contentEnd(introFrom, o.introEnd), '(머리말)');

  // 3) 절
  diffChildren(node.children ?? [], o.sections, 1, P.contentEnd(introFrom, o.introEnd), []);

  function diffNotes(mAll: NoteBlock[], blocks: Block[], insertAt: number, where: string): void {
    const gen = mAll.filter((n) => isGenerated(n.id) && !isMetaNote(n));
    const user = mAll.filter((n) => !isGenerated(n.id) && !isMemoNote(n));
    const srcs = selectNoteBlocks(blocks);
    const fresh: NoteBlock[] = [];
    for (const p of align(gen.map((n) => n.text ?? ''), srcs.map((s) => s.note.text))) {
      if (p.a !== null && p.b !== null) {
        const mt = String(gen[p.a].text ?? '');
        const s = srcs[p.b];
        if (mt.trim() === s.note.text.trim()) continue;
        if (s.clipped) {
          warn(`${where}: 원문이 길어 잘려 들어온 노트("${short(s.note.text)}")는 맵에서 고친 내용을 반영하지 않았습니다 — GitHub 에서 직접 고쳐 주세요.`);
          continue;
        }
        const b = blocks[s.blockIndex];
        P.replace(b.start!, b.end!, renderEdit(b, L, gen[p.a]));
        ops.push(`${where}: 노트 수정 "${short(s.note.text)}" → "${short(mt)}"`);
      } else if (p.b !== null) {
        const b = blocks[srcs[p.b].blockIndex];
        P.removeBlock(b.start!, b.end!);
        ops.push(`${where}: 노트 삭제 "${short(srcs[p.b].note.text)}"`);
      } else if (p.a !== null) {
        fresh.push(gen[p.a]); // 다른 곳에서 옮겨 온 생성 노트 — 새 블록으로
      }
    }
    fresh.push(...user);
    if (fresh.length) {
      P.insert(insertAt, renderNotes(fresh));
      fresh.forEach((n) => ops.push(`${where}: 노트 추가 "${short(n.text ?? '')}"`));
    }
  }

  function diffChildren(kids: MindNode[], secs: Section[], parentLevel: number, insertBase: number, trail: string[]): void {
    const gen = kids.filter((k) => isGenerated(k.id));
    const pairs = align(gen.map(cleanTitle), secs.map((s) => s.title));
    const endOf = new Map<MindNode, number>();
    const unmatched = new Set<MindNode>();
    for (const p of pairs) {
      if (p.a !== null && p.b !== null) {
        const m = gen[p.a];
        const s = secs[p.b];
        const title = cleanTitle(m) || s.title;
        const label = [...trail, title].join(' > ');
        if (norm(title) !== norm(s.title)) {
          const hashes = /^\s{0,3}(#{1,6})/.exec(L[s.start!])?.[1] ?? '#'.repeat(s.level);
          P.replace(s.start!, s.start! + 1, [`${hashes} ${title}`]);
          ops.push(`절 이름: "${[...trail, s.title].join(' > ')}" → "${title}"`);
        }
        diffNotes(m.notes ?? [], s.blocks, P.contentEnd(s.start! + 1, s.bodyEnd!), label);
        diffChildren(m.children ?? [], s.children, s.level, P.contentEnd(s.start! + 1, s.bodyEnd!), [...trail, title]);
        endOf.set(m, s.end!);
      } else if (p.b !== null) {
        const s = secs[p.b];
        P.replace(s.start!, s.end!, []);
        const sub = s.children.length ? ` (하위 절 ${s.children.length}개 포함)` : '';
        ops.push(`⚠ 절 삭제: "${[...trail, s.title].join(' > ')}"${sub}`);
      } else if (p.a !== null) {
        unmatched.add(gen[p.a]);
      }
    }
    // 새 절 — 사용자가 붙인 노드(메모 제외) + 다른 문서에서 옮겨 온 생성 노드
    const level = parentLevel + 1;
    kids.forEach((k, idx) => {
      const isNew = unmatched.has(k) || (!isGenerated(k.id) && readMarker(k)?.kind !== 'memo');
      if (!isNew) return;
      if (readMarker(k)?.kind === 'newfile') {
        warn(`문서 노드 안의 "${cleanTitle(k)}" 에 붙은 새파일 표시는 무시하고 이 문서의 절로 넣었습니다 — 새 파일은 폴더 노드 아래에 두세요.`);
      }
      let pos = insertBase;
      for (let j = idx - 1; j >= 0; j--) { const e = endOf.get(kids[j]); if (e !== undefined) { pos = e; break; } }
      // 같은 자리에 새 절이 여럿이면 끼워 넣기 순서(=맵 순서)대로 붙는다
      P.insert(pos, renderSection(k, level, warn));
      ops.push(`절 추가: "${[...trail, cleanTitle(k)].join(' > ')}"`);
    });
  }

  const applied = P.changed ? P.apply() : { text: markdown, hunks: [] as string[] };
  return {
    path, nodeId: node.id, before: markdown, after: applied.text, ops, warnings: [...warnings],
    hunks: applied.hunks, changed: P.changed && applied.text !== markdown,
  };
}

// ── 새 파일 모으기 ────────────────────────────────────────────────────

export interface NewFile {
  path: string;
  nodeId: string;
  title: string;
  content: string;
  /** 노드가 있는 폴더 노드의 폴더 (저장소 뿌리 기준) */
  parentDir: string;
  /** 이름에 하위 폴더가 있으면 그 사슬 — 반영 뒤 맵에 폴더 노드를 만든다 */
  subDirs: string[];
  warnings: string[];
}

/**
 * 새파일 표시가 붙은 노드를 찾는다 — 문서 노드 안은 보지 않는다(그 안은 절).
 * `baseDir` = `roots` 가 들어 있는 폴더. 이미 있는 경로(`existing`)와 겹치면 오류 목록에.
 */
export function collectNewFiles(
  src: DocsSource, roots: MindNode[], baseDir: string, existing: Set<string>, errors: string[],
): NewFile[] {
  const out: NewFile[] = [];
  const seen = new Set<string>();
  const walk = (list: MindNode[], dir: string) => {
    for (const n of list) {
      if (fileNodePath(src, n)) continue;
      const mk = readMarker(n);
      if (mk?.kind === 'newfile' && !isGenerated(n.id)) {
        const title = cleanTitle(n);
        let rel: string;
        try { rel = fileNameFor(title, mk.name); } catch (err) {
          errors.push(`"${title}": ${(err as Error).message}`);
          continue;
        }
        const path = dir ? `${dir}/${rel}` : rel;
        if (existing.has(path)) { errors.push(`"${title}": 저장소에 이미 ${path} 가 있습니다 — 다른 이름을 \`새파일:이름.md\` 로 주세요.`); continue; }
        if (seen.has(path)) { errors.push(`"${title}": 같은 이름(${path})의 새 파일 노드가 둘 이상입니다.`); continue; }
        seen.add(path);
        const warnings = new Set<string>();
        out.push({
          path, nodeId: n.id, title, content: renderNewFile(n, (w) => warnings.add(w)),
          parentDir: dir, subDirs: rel.split('/').slice(0, -1), warnings: [...warnings],
        });
        continue;
      }
      if (mk?.kind === 'memo') continue;
      const fd = folderNodePath(src, n);
      walk(n.children ?? [], fd !== null ? fd : dir);
    }
  };
  walk(roots, baseDir);
  return out;
}

// ── 확인 코드 · blob sha ──────────────────────────────────────────────

/** 미리보기와 실제 반영이 **같은 계획**인지 — 저장소 기준 커밋·방식·파일 내용으로 만든 짧은 코드 */
export function planCode(parts: { headSha: string; mode: string; files: { path: string; content: string }[] }): string {
  const h = createHash('sha256');
  h.update(parts.headSha).update('\0').update(parts.mode).update('\0');
  for (const f of [...parts.files].sort((x, y) => (x.path < y.path ? -1 : 1))) h.update(f.path).update('\0').update(f.content).update('\0');
  return h.digest('hex').slice(0, 6);
}

/** git 의 blob sha — 같은 내용이면 어느 브랜치에서든 같다 */
export function gitBlobSha(content: string): string {
  const buf = Buffer.from(content, 'utf8');
  return createHash('sha1').update(`blob ${buf.length}\0`).update(buf).digest('hex');
}

// ── 허용 목록 ─────────────────────────────────────────────────────────

/**
 * 누가 어느 저장소에 쓸 수 있나 — API 서버 환경변수 `GITHUB_PUSH_ALLOW`.
 * 쓰기 토큰은 서버 하나가 쥐므로, 맵을 가져올 수 있다고 아무나 그 저장소에 쓰면
 * 안 된다. 형식: `owner/repo=사용자id,사용자id; owner/*=*` (`*` = 누구나).
 * 사용자 목록이 없는 항목은 아무도 허용하지 않는다(실수로 열리지 않게).
 */
export function pushAllowed(allowEnv: string | undefined, userId: string, owner: string, repo: string): boolean {
  for (const raw of String(allowEnv ?? '').split(/[;\n]+/)) {
    const entry = raw.trim();
    if (!entry) continue;
    const eq = entry.indexOf('=');
    if (eq < 0) continue;
    const pat = entry.slice(0, eq).trim().toLowerCase();
    const users = entry.slice(eq + 1).split(',').map((u) => u.trim()).filter(Boolean);
    const [po, pr] = pat.split('/');
    if (!po || !pr) continue;
    if (po !== owner.toLowerCase()) continue;
    if (pr !== '*' && pr !== repo.toLowerCase()) continue;
    if (users.includes('*') || users.includes(userId)) return true;
  }
  return false;
}

// ── 반영 대기(PR) 표시 ────────────────────────────────────────────────

const PENDING_RE = /\s*·\s*PR #(\d+) 대기/;

/** 문서 노드의 갱신 시각 노트에 적힌 "PR #n 대기" — 없으면 null */
export function pendingPrOf(node: MindNode): number | null {
  for (const n of node.notes ?? []) {
    if (!isMetaNote(n)) continue;
    const m = PENDING_RE.exec(String(n.text ?? ''));
    if (m) return Number(m[1]);
  }
  return null;
}

/** "PR #n 대기" 를 지운다 (원본 노드를 바꾼다 — 복사본에 쓴다) */
export function clearPending(node: MindNode): boolean {
  let hit = false;
  for (const n of node.notes ?? []) {
    if (isMetaNote(n) && PENDING_RE.test(String(n.text ?? ''))) { n.text = String(n.text).replace(PENDING_RE, ''); hit = true; }
  }
  return hit;
}

/** 맵(복사본) 안에서 이 id 들의 문서 노드 "PR #n 대기" 를 지운다 — 지운 수 */
export function clearPendingIn(map: SampleMap, nodeIds: string[]): number {
  const want = new Set(nodeIds);
  let n = 0;
  const walk = (list: MindNode[]) => list.forEach((c) => {
    if (want.has(c.id) && clearPending(c)) n++;
    if (c.children?.length) walk(c.children);
  });
  walk(map.branches as MindNode[]);
  return n;
}

// ── 미리보기 문장 ────────────────────────────────────────────────────────────────

export interface PushPreviewInput {
  mapTitle: string;
  src: DocsSource;
  headSha: string;
  mode: 'pr' | 'commit';
  edits: FileChange[];
  newFiles: NewFile[];
  conflicts: string[];
  errors: string[];
  warnings: string[];
  /** 저장소에는 있는데 맵에 문서 노드가 없는 파일 — 지우지 않는다는 안내 */
  notInMap: string[];
}

/** 사람에게 보여 줄 미리보기 — 파일별 바뀜과 고친 줄 (길면 자른다) */
export function formatPushPreview(p: PushPreviewInput, maxHunkLines = 120): string {
  const out: string[] = [];
  out.push(`"${p.mapTitle}" 맵 → ${p.src.owner}/${p.src.repo}@${p.src.ref} 반영 미리보기 (기준 커밋 ${p.headSha.slice(0, 7)}) — 아직 아무것도 쓰지 않았습니다.`);
  if (p.edits.length) {
    out.push(`\n수정할 파일 ${p.edits.length}개:`);
    for (const e of p.edits) {
      out.push(`  · ${e.path}`);
      e.ops.forEach((o) => out.push(`      - ${o}`));
    }
  }
  if (p.newFiles.length) {
    out.push(`\n새로 만들 파일 ${p.newFiles.length}개:`);
    for (const n of p.newFiles) {
      const lines = n.content.split('\n').length - 1;
      out.push(`  · ${n.path} (노드 "${n.title}", ${lines}줄)`);
    }
  }
  if (p.conflicts.length) {
    out.push(`\n건너뛴 파일 ${p.conflicts.length}개 (덮어쓰지 않음):`);
    p.conflicts.forEach((c) => out.push(`  · ${c}`));
  }
  if (p.errors.length) {
    out.push('\n만들지 못하는 새 파일:');
    p.errors.forEach((c) => out.push(`  · ${c}`));
  }
  if (p.warnings.length) {
    out.push('\n주의:');
    p.warnings.forEach((w) => out.push(`  · ${w}`));
  }
  if (p.notInMap.length) {
    out.push(`\n맵에 문서 노드가 없는 파일 ${p.notInMap.length}개는 GitHub 에서 지우지 않습니다(이 도구는 파일을 지우지 않는다).`);
  }
  const hunks: string[] = [];
  for (const e of p.edits) { hunks.push(`--- ${e.path}`); hunks.push(...e.hunks); }
  for (const n of p.newFiles) {
    hunks.push(`+++ ${n.path} (새 파일)`);
    n.content.split('\n').slice(0, 15).forEach((l) => hunks.push(`+ ${l}`));
  }
  if (hunks.length) {
    out.push('\n고칠 줄:');
    out.push(...hunks.slice(0, maxHunkLines));
    if (hunks.length > maxHunkLines) out.push(`… (${hunks.length - maxHunkLines}줄 더)`);
  }
  out.push(
    p.mode === 'pr'
      ? `\n반영 방식: 새 브랜치에 커밋하고 ${p.src.ref} 로 PR 을 엽니다(mode:"pr"). 바로 커밋하려면 mode:"commit".`
      : `\n반영 방식: ${p.src.ref} 에 바로 커밋합니다(mode:"commit").`,
  );
  return out.join('\n');
}

// ── 반영 뒤 맵 맞추기 ─────────────────────────────────────────────────

export interface PushedFile {
  path: string;
  nodeId: string;
  markdown: string;
  isNew: boolean;
  parentDir?: string;
  subDirs?: string[];
}

/** 반영한 사용자 노드·노트를 걷는다 — 메모는 남긴다 (원본 불변) */
function stripPushed(node: MindNode): MindNode {
  const notes = (node.notes ?? []).filter((n) => isGenerated(n.id) || isMemoNote(n));
  const kids = (node.children ?? [])
    .filter((c) => isGenerated(c.id) || isMemoNode(c))
    .map((c) => (isGenerated(c.id) ? stripPushed(c) : c));
  const out: MindNode = { ...node, children: kids };
  if (notes.length) out.notes = notes; else delete out.notes;
  return out;
}

/** 새 파일 노드에 딸린 메모(노드·노트) — 반영 뒤에도 남긴다 */
function memosOf(node: MindNode): { notes: NoteBlock[]; kids: MindNode[] } {
  const notes = (node.notes ?? []).filter(isMemoNote);
  const kids: MindNode[] = [];
  const walk = (list: MindNode[]) => list.forEach((c) => { if (isMemoNode(c)) kids.push(c); else walk(c.children ?? []); });
  walk(node.children ?? []);
  return { notes, kids };
}

/**
 * 반영한 파일들로 맵을 맞춘다 — 그 문서 노드를 **반영한 원문으로 다시 만든다**
 * (갱신 도구와 같은 `buildFileNode` + `mergeNode`: id 유지, 메모 보존). 그래야
 * 맵의 `파일 <sha>` 가 새 원문과 같아져 다음 갱신이 "그대로" 로 본다.
 * PR 방식이면 갱신 시각 노트에 "PR #n 대기" 를 붙인다 — 머지 전 갱신이 맵을
 * 기준 브랜치의 옛 내용으로 되돌리지 않게(§9.15). 원본 맵은 바꾸지 않는다.
 */
export function applyPushToMap(
  map: SampleMap, src: DocsSource, pushed: PushedFile[], commit: FileCommit, pendingPr: number | null,
  ids: IdGen,
): SampleMap {
  const copy: SampleMap = JSON.parse(JSON.stringify(map));
  const branches = copy.branches as MindNode[];
  const findById = (id: string, list: MindNode[]): { node: MindNode; siblings: MindNode[]; index: number } | null => {
    for (let i = 0; i < list.length; i++) {
      if (list[i].id === id) return { node: list[i], siblings: list, index: i };
      const r = list[i].children?.length ? findById(id, list[i].children!) : null;
      if (r) return r;
    }
    return null;
  };
  for (const p of pushed) {
    const hit = findById(p.nodeId, branches);
    if (!hit) continue;
    const old = hit.node;
    const fresh = buildFileNode(src, { path: p.path, blobSha: gitBlobSha(p.markdown) }, p.markdown, commit, ids, old.id);
    if (pendingPr !== null && fresh.notes?.[0]) fresh.notes[0].text += ` · PR #${pendingPr} 대기`;
    if (p.isNew) {
      const memo = memosOf(old);
      const tags = (old.tags ?? []).filter((t) => !TAG_NEW_RE.test(String(t).trim()));
      const node: MindNode = {
        ...old,
        text: fresh.text,
        links: fresh.links,
        notes: [...(fresh.notes ?? []), ...memo.notes],
        children: [...(fresh.children ?? []), ...memo.kids],
      };
      if (tags.length) node.tags = tags; else delete node.tags;
      if (node.tag && TAG_NEW_RE.test(String(node.tag).trim())) delete node.tag;
      if (p.subDirs?.length) {
        hit.siblings.splice(hit.index, 1);
        ensureFolderChain(src, hit.siblings, p.parentDir ?? '', p.subDirs, ids).push(node);
      } else {
        hit.siblings[hit.index] = node;
      }
    } else {
      hit.siblings[hit.index] = mergeNode(stripPushed(old), fresh);
    }
  }
  return copy;
}
