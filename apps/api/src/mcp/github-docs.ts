/**
 * **GitHub 저장소 문서 → 맵** 의 순수 부분 (2026-09-21).
 * 설계: docs/04-extensions/ai/mcp-connector.md §9.14
 *
 * 두 도구가 이 파일을 쓴다.
 *   · `import_github_docs` — 저장소의 문서 폴더(대개 `docs/`)를 **새 맵**으로.
 *     폴더 트리를 그대로 가지로, 문서 하나는 노드 하나(제목 = 첫 `#`,
 *     GitHub 주소는 그 노드의 링크), 문서 안의 `##`·`###` 는 그 아래 노드,
 *     표·문단·코드는 그 노드의 노트. 문서 노드에는 마지막 커밋 시각을 노트로.
 *   · `update_map_from_github` — 그렇게 만든 맵을 저장소의 지금 상태에 맞춘다.
 *     사라진 문서는 노드를 지우고, 새 문서는 노드를 더하고, 바뀐 문서는 그
 *     노드의 내용(제목·하위·노트)을 다시 만든다. 범위를 폴더·문서 노드 하나로
 *     좁힐 수 있다 ("OOO 맵의 OOO 노드를 업데이트 해줘").
 *
 * 이 파일은 네트워크·DB 를 모른다 — 문자열과 맵 객체만 다룬다. GitHub 호출은
 * `github-client.ts`, 저장·잠금은 `mcp-tools.ts` 가 한다.
 *
 * **맵이 출처를 기억하는 방법** — 셋 다 사람이 읽는 글이라 앱에서 그대로 보인다.
 *   · 루트 노트 문단: `출처: github:owner/repo@ref:docs (가져옴 2026-09-21T…)`
 *   · 폴더 노드 링크: `https://github.com/owner/repo/tree/ref/docs/sub`
 *   · 문서 노드 링크: `https://github.com/owner/repo/blob/ref/docs/sub/a.md`
 *     + 노트 문단: `최종 업데이트: 2026-09-18T01:23:45Z · 커밋 abc1234 · 파일 9f8e7d6`
 *   갱신 도구는 링크 주소로 노드와 파일을 짝짓고, `파일 <blob sha>` 가 같으면
 *   내용이 그대로인 것이라 커밋 조회도 하지 않는다.
 */
import type { MindNode, NodeColorKey, NoteBlock, SampleMap } from '../emm/model';

export class GithubDocsError extends Error {}

/** 저장소 지정 — "owner/repo" · "https://github.com/owner/repo" · ".../tree/main/docs" */
export interface RepoRef {
  owner: string;
  repo: string;
  ref?: string;
  path?: string;
}

/** 맵이 기억하는 출처 (루트 노트에서 읽는다) */
export interface DocsSource {
  owner: string;
  repo: string;
  ref: string;
  /** 문서 폴더 — 저장소 뿌리면 '' */
  path: string;
}

/** 저장소에 지금 있는 문서 파일 하나 */
export interface RemoteFile {
  path: string;
  /** git blob sha — 내용이 같으면 같다 */
  blobSha: string;
}

/** 파일의 마지막 커밋 */
export interface FileCommit {
  sha: string;
  /** ISO 8601 (UTC) */
  date: string;
}

const NAME_RE = /^[A-Za-z0-9_.-]+$/;

export function parseRepoRef(input: string): RepoRef {
  let s = String(input ?? '').trim();
  if (!s) throw new GithubDocsError('`repo` 가 비어 있습니다 — "owner/repo" 또는 GitHub 주소를 넣어 주세요.');
  s = s.replace(/^(https?:\/\/)?(www\.)?github\.com\//i, '').replace(/^git@github\.com:/i, '');
  s = s.replace(/[?#].*$/, '').replace(/\/+$/, '');
  const parts = s.split('/');
  if (parts.length < 2) {
    throw new GithubDocsError(`\`repo\` 를 알아보지 못했습니다: "${input}" — "owner/repo" 또는 "https://github.com/owner/repo/tree/main/docs" 모양으로 넣어 주세요.`);
  }
  const owner = parts[0];
  const repo = parts[1].replace(/\.git$/i, '');
  if (!NAME_RE.test(owner) || !NAME_RE.test(repo)) {
    throw new GithubDocsError(`저장소 이름이 이상합니다: "${owner}/${repo}"`);
  }
  const out: RepoRef = { owner, repo };
  // …/tree/<ref>/<path…>  또는 …/blob/<ref>/<path…>
  if ((parts[2] === 'tree' || parts[2] === 'blob') && parts[3]) {
    out.ref = parts[3];
    if (parts.length > 4) out.path = parts.slice(4).join('/');
  }
  return out;
}

/** 문서 폴더 자동 판정 — 저장소 뿌리에 있는 흔한 이름을 차례로 본다 */
export const DOC_DIR_CANDIDATES = ['docs', 'doc', 'documentation', 'documents', 'wiki'];

export function detectDocsDir(treePaths: { path: string; type: string }[]): string {
  const dirs = new Set(treePaths.filter((e) => e.type === 'tree').map((e) => e.path));
  for (const c of DOC_DIR_CANDIDATES) {
    for (const d of dirs) if (d.toLowerCase() === c) return d;
  }
  return '';
}

export const MARKDOWN_RE = /\.(md|mdx|markdown)$/i;

/** 문서 폴더 아래의 마크다운 파일만 — 폴더 경로 접두를 붙여 거른다 */
export function selectDocFiles(
  tree: { path: string; type: string; sha: string }[], docsDir: string,
): RemoteFile[] {
  const prefix = docsDir ? docsDir.replace(/\/+$/, '') + '/' : '';
  return tree
    .filter((e) => e.type === 'blob' && MARKDOWN_RE.test(e.path) && (!prefix || e.path.startsWith(prefix)))
    .map((e) => ({ path: e.path, blobSha: e.sha }))
    // 바이트순(로캘 무관) — 어느 서버에서 돌려도 같은 순서·같은 "앞 N개"
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

// ── 주소·노트 형식 ────────────────────────────────────────────────────

export function blobUrl(src: DocsSource, path: string): string {
  return `https://github.com/${src.owner}/${src.repo}/blob/${encodeURIComponent(src.ref)}/${path.split('/').map(encodeURIComponent).join('/')}`;
}
export function treeUrl(src: DocsSource, dir: string): string {
  const base = `https://github.com/${src.owner}/${src.repo}/tree/${encodeURIComponent(src.ref)}`;
  return dir ? `${base}/${dir.split('/').map(encodeURIComponent).join('/')}` : base;
}

// ref 는 git 규칙상 공백·':' 이 없다. **경로는 공백이 있을 수 있다**(#531 Codex 지적) —
// 그래서 경로는 고정 접미 ` (가져옴 …)` 앞까지 통째로 받는다.
const SOURCE_RE = /^출처:\s*github:([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)@([^\s:]+):(.*?)(?:\s+\(가져옴\s+(\S+)\))?\s*$/;

export function sourceNoteText(src: DocsSource, fetchedAt: string): string {
  return `출처: github:${src.owner}/${src.repo}@${src.ref}:${src.path || '/'} (가져옴 ${fetchedAt})`;
}

/** 루트 노트에서 출처를 읽는다 — 없으면 null (= 이 도구로 만든 맵이 아니다) */
export function readSource(map: SampleMap): (DocsSource & { fetchedAt?: string; noteId: string }) | null {
  for (const n of map.root.notes ?? []) {
    const m = SOURCE_RE.exec(String(n.text ?? '').trim());
    if (!m) continue;
    return { owner: m[1], repo: m[2], ref: m[3], path: m[4] === '/' ? '' : m[4], fetchedAt: m[5], noteId: n.id };
  }
  return null;
}

const FILE_META_RE = /^최종 업데이트:\s*(\S+)(?:\s*·\s*커밋\s+([0-9a-f]+))?(?:\s*·\s*파일\s+([0-9a-f]+))?/;

export function fileMetaText(commit: FileCommit | null, blobSha: string): string {
  const when = commit?.date ?? '(알 수 없음)';
  const c = commit?.sha ? ` · 커밋 ${commit.sha.slice(0, 7)}` : '';
  return `최종 업데이트: ${when}${c} · 파일 ${blobSha.slice(0, 7)}`;
}

export interface FileMeta { updatedAt: string; commitSha?: string; blobSha?: string }

export function readFileMeta(node: MindNode): FileMeta | null {
  for (const n of node.notes ?? []) {
    const m = FILE_META_RE.exec(String(n.text ?? '').trim());
    if (m) return { updatedAt: m[1], commitSha: m[2], blobSha: m[3] };
  }
  return null;
}

// ── 마크다운 절 나누기 ────────────────────────────────────────────────

export type BlockKind = 'paragraph' | 'list' | 'table' | 'code' | 'quote';
export interface Block { kind: BlockKind; text: string; lang?: string }
export interface Section { level: number; title: string; blocks: Block[]; children: Section[] }
export interface DocOutline { title: string | null; intro: Block[]; sections: Section[] }

const HEADING_RE = /^(#{1,6})[ \t]+(.+?)[ \t]*#*[ \t]*$/;
const FENCE_RE = /^[ \t]{0,3}(```+|~~~+)[ \t]*([^\s`]*)/;
const TABLE_SEP_RE = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;
const LIST_RE = /^\s*(?:[-*+]|\d+[.)])\s+/;

/** 인라인 마크다운 강조를 걷어 노드 이름으로 쓸 글 */
export function plainTitle(s: string): string {
  return s
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/(^|\s)[*_]([^*_]+)[*_](?=\s|$)/g, '$1$2')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 문서를 제목(첫 `#`) · 머리말 · `##` 절(그 아래 `###` 절) 로 나눈다.
 * `####` 이하는 절을 만들지 않고 그 자리의 글로 남긴다(**굵은 줄**). 코드 펜스
 * 안의 `#` 은 견출이 아니다. front matter(`---`)는 걷어낸다.
 */
export function sectionize(markdown: string): DocOutline {
  let md = String(markdown ?? '').replace(/\r\n?/g, '\n');
  if (/^---\n/.test(md)) {
    const end = md.indexOf('\n---', 4);
    if (end > 0) md = md.slice(md.indexOf('\n', end + 1) + 1);
  }
  const lines = md.split('\n');
  const out: DocOutline = { title: null, intro: [], sections: [] };
  let cur: Section | null = null;   // 지금 글이 들어가는 절 (null = 머리말)
  let h2: Section | null = null;
  const target = (): Block[] => (cur ? cur.blocks : out.intro);

  let i = 0;
  const pushPara = (buf: string[], kind: BlockKind) => {
    const text = kind === 'paragraph' ? buf.join(' ').replace(/\s+/g, ' ').trim() : buf.join('\n').trim();
    if (text) target().push({ kind, text });
  };
  while (i < lines.length) {
    const line = lines[i];
    const fence = FENCE_RE.exec(line);
    if (fence) {
      const mark = fence[1][0];
      const body: string[] = [];
      i++;
      while (i < lines.length && !new RegExp(`^[ \\t]{0,3}${mark}{3,}[ \\t]*$`).test(lines[i])) { body.push(lines[i]); i++; }
      i++; // 닫는 펜스
      const text = body.join('\n').replace(/\s+$/, '');
      if (text.trim()) target().push({ kind: 'code', text, lang: fence[2] || undefined });
      continue;
    }
    const h = HEADING_RE.exec(line);
    if (h) {
      const level = h[1].length;
      const title = plainTitle(h[2]);
      if (level === 1 && out.title === null && out.sections.length === 0 && cur === null) {
        out.title = title;
      } else if (level <= 2) {
        h2 = { level: 2, title, blocks: [], children: [] };
        out.sections.push(h2);
        cur = h2;
      } else if (level === 3) {
        const sec: Section = { level: 3, title, blocks: [], children: [] };
        if (h2) h2.children.push(sec); else out.sections.push(sec);
        cur = sec;
      } else {
        target().push({ kind: 'paragraph', text: `**${title}**` });
      }
      i++;
      continue;
    }
    // 표 — `|` 줄이 이어지고 둘째 줄이 구분선
    if (/^\s*\|/.test(line) && i + 1 < lines.length && TABLE_SEP_RE.test(lines[i + 1])) {
      const rows: string[] = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) { rows.push(lines[i].trim()); i++; }
      target().push({ kind: 'table', text: rows.join('\n') });
      continue;
    }
    if (!line.trim()) { i++; continue; }
    if (/^\s*<!--/.test(line)) { // HTML 주석 — 끝까지 건너뛴다
      while (i < lines.length && !/-->/.test(lines[i])) i++;
      i++;
      continue;
    }
    if (/^\s*!\[[^\]]*\]\([^)]*\)\s*$/.test(line)) { i++; continue; } // 사진만 있는 줄
    if (/^\s*(---+|\*\*\*+|___+)\s*$/.test(line)) { i++; continue; } // 수평선
    if (/^\s*>/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) { buf.push(lines[i].replace(/^\s*>\s?/, '')); i++; }
      pushPara(buf.filter((l) => l.trim()), 'quote');
      continue;
    }
    if (LIST_RE.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && lines[i].trim() && !HEADING_RE.test(lines[i]) && !FENCE_RE.test(lines[i])) { buf.push(lines[i].replace(/\s+$/, '')); i++; }
      pushPara(buf, 'list');
      continue;
    }
    const buf: string[] = [];
    while (
      i < lines.length && lines[i].trim() && !HEADING_RE.test(lines[i]) && !FENCE_RE.test(lines[i])
      && !LIST_RE.test(lines[i]) && !/^\s*>/.test(lines[i]) && !/^\s*\|/.test(lines[i])
    ) { buf.push(lines[i].trim()); i++; }
    if (buf.length === 0) { i++; continue; }
    pushPara(buf, 'paragraph');
  }
  return out;
}

// ── 노트 만들기 ───────────────────────────────────────────────────────

/** 노드 하나에 붙는 노트의 상한 — 문서 전체를 옮기는 것이 아니라 "중요한 것"만 */
export const NOTE_LIMITS = {
  maxNotes: 8,
  maxTables: 4,
  maxCodes: 2,
  /** 문단·목록 노트의 글자 합계 */
  maxProseChars: 1200,
  maxCodeChars: 1500,
  maxTableChars: 2500,
};

function clip(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1).replace(/\s+\S*$/, '') + '…' : s;
}

export function notesFromBlocks(blocks: Block[], ids: IdGen): NoteBlock[] {
  const out: NoteBlock[] = [];
  let tables = 0, codes = 0, prose = 0;
  for (const b of blocks) {
    if (out.length >= NOTE_LIMITS.maxNotes) break;
    if (b.kind === 'table') {
      if (tables >= NOTE_LIMITS.maxTables) continue;
      tables++;
      out.push({ id: ids.next('nt'), type: 'table', text: clip(b.text, NOTE_LIMITS.maxTableChars) });
    } else if (b.kind === 'code') {
      if (codes >= NOTE_LIMITS.maxCodes) continue;
      codes++;
      out.push({ id: ids.next('nt'), type: 'code_block', text: clip(b.text, NOTE_LIMITS.maxCodeChars), ...(b.lang ? { lang: b.lang } : {}) });
    } else {
      if (prose >= NOTE_LIMITS.maxProseChars) continue;
      const room = NOTE_LIMITS.maxProseChars - prose;
      const text = clip(b.text, room);
      prose += text.length;
      out.push({ id: ids.next('nt'), type: 'paragraph', text });
    }
  }
  return out;
}

// ── 노드 만들기 ───────────────────────────────────────────────────────

/** id 는 맵 안에서 유일해야 한다 — 시각 + 순번 + 난수 */
export class IdGen {
  private seq = 0;
  private readonly stamp = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  next(prefix = 'gh'): string { return `${prefix}-${this.stamp}-${(this.seq++).toString(36)}`; }
}

const BRANCH_COLORS: NodeColorKey[] = ['l1A', 'l1B', 'l1C', 'l1D', 'l1E'];

export function fileBaseName(path: string): string {
  return path.split('/').pop() ?? path;
}
function titleFromPath(path: string): string {
  return fileBaseName(path).replace(MARKDOWN_RE, '');
}

function sectionNode(sec: Section, ids: IdGen): MindNode {
  const n: MindNode = { id: ids.next(), text: sec.title || '(제목 없음)' };
  const notes = notesFromBlocks(sec.blocks, ids);
  if (notes.length) n.notes = notes;
  const kids = sec.children.map((c) => sectionNode(c, ids));
  n.children = kids;
  return n;
}

/**
 * 문서 파일 하나 → 노드. 제목은 첫 `#`(없으면 파일 이름), 링크는 GitHub 주소,
 * 노트는 [갱신 시각] + 머리말의 표·문단, 하위는 `##` → `###`.
 * `keepId` 를 주면 그 id 를 유지한다(갱신 때 자리·링크 보존).
 */
export function buildFileNode(
  src: DocsSource, file: RemoteFile, markdown: string, commit: FileCommit | null, ids: IdGen, keepId?: string,
): MindNode {
  const doc = sectionize(markdown);
  const node: MindNode = {
    id: keepId ?? ids.next(),
    text: doc.title || titleFromPath(file.path),
    links: [{ id: ids.next('lk'), url: blobUrl(src, file.path), label: fileBaseName(file.path) }],
    notes: [
      { id: ids.next('nt'), type: 'paragraph', text: fileMetaText(commit, file.blobSha) },
      ...notesFromBlocks(doc.intro, ids),
    ],
    children: doc.sections.map((s) => sectionNode(s, ids)),
  };
  return node;
}

export interface DocInput { file: RemoteFile; markdown: string; commit: FileCommit | null }

interface DirTree { dirs: Map<string, DirTree>; files: DocInput[] }

function insertIntoTree(root: DirTree, relPath: string, doc: DocInput): void {
  const segs = relPath.split('/');
  let cur = root;
  for (const seg of segs.slice(0, -1)) {
    let next = cur.dirs.get(seg);
    if (!next) { next = { dirs: new Map(), files: [] }; cur.dirs.set(seg, next); }
    cur = next;
  }
  cur.files.push(doc);
}

/** README 가 맨 앞, 나머지는 이름순 — 폴더는 파일보다 앞 */
function sortedFiles(files: DocInput[]): DocInput[] {
  return [...files].sort((a, b) => {
    const ra = /^readme\./i.test(fileBaseName(a.file.path)) ? 0 : 1;
    const rb = /^readme\./i.test(fileBaseName(b.file.path)) ? 0 : 1;
    return ra - rb || a.file.path.localeCompare(b.file.path);
  });
}

function folderNode(src: DocsSource, dirPath: string, name: string, tree: DirTree, ids: IdGen): MindNode {
  return {
    id: ids.next('dir'),
    text: name,
    links: [{ id: ids.next('lk'), url: treeUrl(src, dirPath), label: name + '/' }],
    children: childrenOfTree(src, dirPath, tree, ids),
  };
}

function childrenOfTree(src: DocsSource, dirPath: string, tree: DirTree, ids: IdGen): MindNode[] {
  const dirs = [...tree.dirs.keys()].sort((a, b) => a.localeCompare(b));
  const out: MindNode[] = dirs.map((d) => folderNode(src, dirPath ? `${dirPath}/${d}` : d, d, tree.dirs.get(d)!, ids));
  for (const doc of sortedFiles(tree.files)) out.push(buildFileNode(src, doc.file, doc.markdown, doc.commit, ids));
  return out;
}

/** 1레벨 가지에 앱 규칙대로 색·방향을 준다 (파서·append_to_map 과 같은 순환) */
export function decorateBranches(branches: MindNode[], startIndex = 0): MindNode[] {
  return branches.map((b, i) => ({
    ...b,
    colorKey: BRANCH_COLORS[(startIndex + i) % BRANCH_COLORS.length],
    side: 'right' as const,
  }));
}

/** 저장소 문서 폴더 전체 → 새 맵 */
export function buildDocsMap(
  src: DocsSource, docs: DocInput[], title: string, fetchedAt: string, ids = new IdGen(),
): SampleMap {
  const prefix = src.path ? src.path.replace(/\/+$/, '') + '/' : '';
  const tree: DirTree = { dirs: new Map(), files: [] };
  for (const d of docs) {
    const rel = prefix && d.file.path.startsWith(prefix) ? d.file.path.slice(prefix.length) : d.file.path;
    insertIntoTree(tree, rel, d);
  }
  const branches = decorateBranches(childrenOfTree(src, src.path, tree, ids));
  return {
    title,
    root: {
      id: 'root',
      text: title,
      colorKey: 'root',
      side: 'center',
      links: [{ id: ids.next('lk'), url: treeUrl(src, src.path), label: `${src.owner}/${src.repo}` + (src.path ? `/${src.path}` : '') }],
      notes: [{ id: ids.next('nt'), type: 'paragraph', text: sourceNoteText(src, fetchedAt) }],
    } as SampleMap['root'],
    branches: branches as SampleMap['branches'],
  };
}

// ── 갱신 ─────────────────────────────────────────────────────────────

/** 맵 안의 문서 노드 — 링크 주소가 이 출처의 blob 주소인 노드 */
export interface FileNodeRef {
  node: MindNode;
  /** 이 노드가 들어 있는 배열(형제 목록)과 자리 */
  siblings: MindNode[];
  index: number;
  path: string;
  meta: FileMeta | null;
}

function pathFromUrl(url: string, base: string): string | null {
  if (!url.startsWith(base)) return null;
  const rest = url.slice(base.length).replace(/[?#].*$/, '');
  try { return rest.split('/').map(decodeURIComponent).join('/'); } catch { return rest; }
}

export function fileNodePath(src: DocsSource, node: MindNode): string | null {
  const base = `https://github.com/${src.owner}/${src.repo}/blob/${encodeURIComponent(src.ref)}/`;
  for (const l of node.links ?? []) {
    const p = pathFromUrl(l.url, base);
    if (p) return p;
  }
  return null;
}

export function folderNodePath(src: DocsSource, node: MindNode): string | null {
  const base = `https://github.com/${src.owner}/${src.repo}/tree/${encodeURIComponent(src.ref)}`;
  for (const l of node.links ?? []) {
    if (l.url === base) return '';
    const p = pathFromUrl(l.url, base + '/');
    if (p !== null) return p;
  }
  return null;
}

export function collectFileNodes(src: DocsSource, siblings: MindNode[], out: FileNodeRef[] = []): FileNodeRef[] {
  siblings.forEach((n, index) => {
    const path = fileNodePath(src, n);
    if (path) {
      out.push({ node: n, siblings, index, path, meta: readFileMeta(n) });
      return; // 문서 노드 아래는 절 노드 — 더 내려가지 않는다
    }
    if (n.children?.length) collectFileNodes(src, n.children, out);
  });
  return out;
}

export type UpdateScope =
  | { kind: 'all' }
  | { kind: 'folder'; dir: string; node: MindNode }
  | { kind: 'file'; path: string; node: MindNode }
  /** 문서 안의 절 노드 하나 (`##` 또는 `###`) — 그 절만 다시 만든다 */
  | { kind: 'section'; path: string; fileNode: MindNode; node: MindNode; titles: string[] };

/** 이 노드가 생성한 것인가(도구가 붙인 id 접두) — 사용자가 손으로 만든 노드·노트는 보존한다 */
export function isGenerated(id: string | undefined): boolean {
  return /^(gh|dir|nt|lk)-/.test(String(id ?? ''));
}

/**
 * 노드가 이 출처의 무엇인가 — 전체(루트) · 폴더 · 문서 · 문서 안의 절 · 아니면 null.
 * 절은 링크가 없으므로 **조상 가운데 문서 노드**를 찾아 판정한다.
 */
export function resolveScope(src: DocsSource, map: SampleMap, node: MindNode | null): UpdateScope | null {
  if (node === null) return { kind: 'all' };
  const f = fileNodePath(src, node);
  if (f) return { kind: 'file', path: f, node };
  const d = folderNodePath(src, node);
  if (d !== null) return { kind: 'folder', dir: d, node };
  // 조상 사슬
  const chain = (list: MindNode[], acc: MindNode[]): MindNode[] | null => {
    for (const n of list) {
      if (n.id === node.id) return [...acc, n];
      const r = n.children?.length ? chain(n.children, [...acc, n]) : null;
      if (r) return r;
    }
    return null;
  };
  const path = chain(map.branches as MindNode[], []);
  if (!path) return null;
  for (let i = path.length - 2; i >= 0; i--) {
    const fp = fileNodePath(src, path[i]);
    if (fp) {
      return { kind: 'section', path: fp, fileNode: path[i], node, titles: path.slice(i + 1).map((n) => nodeName(n)) };
    }
  }
  return null;
}

function nodeName(n: MindNode): string {
  return String(n.text ?? '').split('\n')[0].trim();
}
function sameTitle(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** 새로 만든 절 노드들을 옛 절 노드들에 **제목으로 짝지어** 합친다 — id·사용자 추가분 보존 */
export function mergeChildren(oldKids: MindNode[], freshKids: MindNode[]): MindNode[] {
  const used = new Set<number>();
  const out: MindNode[] = freshKids.map((fresh) => {
    const idx = oldKids.findIndex((o, i) => !used.has(i) && isGenerated(o.id) && sameTitle(nodeName(o), nodeName(fresh)));
    if (idx < 0) return fresh;
    used.add(idx);
    return mergeNode(oldKids[idx], fresh);
  });
  // 사용자가 손으로 붙인 노드(생성 id 가 아닌 것)는 뒤에 그대로 남긴다
  oldKids.forEach((o, i) => { if (!used.has(i) && !isGenerated(o.id)) out.push(o); });
  return out;
}

/** 옛 노드의 자리에 새 내용을 — 글·링크·생성 노트는 새것, 사용자 노트·사용자 하위는 보존, id 유지 */
export function mergeNode(oldNode: MindNode, fresh: MindNode): MindNode {
  const userNotes = (oldNode.notes ?? []).filter((n) => !isGenerated(n.id));
  const notes = [...(fresh.notes ?? []), ...userNotes];
  const merged: MindNode = {
    ...oldNode,
    text: fresh.text,
    ...(fresh.links ? { links: fresh.links } : {}),
    children: mergeChildren(oldNode.children ?? [], fresh.children ?? []),
  };
  if (notes.length) merged.notes = notes; else delete merged.notes;
  return merged;
}

/** 절 제목 사슬로 문서 개요에서 절을 찾는다 (`##` → `###`) */
export function findSection(doc: DocOutline, titles: string[]): Section | null {
  let list = doc.sections;
  let found: Section | null = null;
  for (const t of titles) {
    found = list.find((s) => sameTitle(s.title, t)) ?? null;
    if (!found) return null;
    list = found.children;
  }
  return found;
}

function inScope(scope: UpdateScope, path: string): boolean {
  if (scope.kind === 'all') return true;
  if (scope.kind === 'file' || scope.kind === 'section') return path === scope.path;
  return scope.dir === '' ? true : path.startsWith(scope.dir.replace(/\/+$/, '') + '/');
}

export interface UpdatePlan {
  added: RemoteFile[];
  updated: { ref: FileNodeRef; file: RemoteFile }[];
  removed: FileNodeRef[];
  unchanged: number;
}

/**
 * 무엇을 할지 정한다 — 네트워크 없이. 내용이 바뀐 판정은 **blob sha** 로
 * (다르면 바뀐 것, 같으면 그대로). 옛 맵에 `파일` sha 가 없으면 갱신 시각으로
 * 비교하는데 그것은 커밋 조회가 필요하므로 `needsCommitCheck` 로 돌려준다.
 */
export function planUpdate(
  map: SampleMap, src: DocsSource, scope: UpdateScope, remote: RemoteFile[],
): UpdatePlan & { needsCommitCheck: { ref: FileNodeRef; file: RemoteFile }[] } {
  const roots: MindNode[] = scope.kind === 'all' ? (map.branches as MindNode[])
    : scope.kind === 'folder' ? (scope.node.children ?? []) : [scope.node];
  const existing = scope.kind === 'file'
    ? [{ node: scope.node, siblings: [scope.node], index: 0, path: scope.path, meta: readFileMeta(scope.node) }]
    : scope.kind === 'section'
      ? [{ node: scope.fileNode, siblings: [scope.fileNode], index: 0, path: scope.path, meta: readFileMeta(scope.fileNode) }]
      : collectFileNodes(src, roots);
  const remoteIn = remote.filter((f) => inScope(scope, f.path));
  const byPath = new Map(remoteIn.map((f) => [f.path, f]));
  const have = new Map(existing.map((e) => [e.path, e]));

  const plan: UpdatePlan & { needsCommitCheck: { ref: FileNodeRef; file: RemoteFile }[] } = {
    added: remoteIn.filter((f) => !have.has(f.path)),
    updated: [], removed: [], unchanged: 0, needsCommitCheck: [],
  };
  for (const e of existing) {
    const f = byPath.get(e.path);
    if (!f) { plan.removed.push(e); continue; }
    if (e.meta?.blobSha) {
      if (f.blobSha.startsWith(e.meta.blobSha)) plan.unchanged++;
      else plan.updated.push({ ref: e, file: f });
    } else {
      plan.needsCommitCheck.push({ ref: e, file: f });
    }
  }
  return plan;
}

/** `needsCommitCheck` 를 커밋 시각으로 판정한다 — 저장된 시각보다 뒤면 바뀐 것 */
export function settleByCommit(
  plan: UpdatePlan & { needsCommitCheck: { ref: FileNodeRef; file: RemoteFile }[] },
  commits: Map<string, FileCommit | null>,
): UpdatePlan {
  for (const c of plan.needsCommitCheck) {
    const commit = commits.get(c.file.path);
    const stored = c.ref.meta?.updatedAt ?? '';
    if (commit && stored && commit.date <= stored) plan.unchanged++;
    else plan.updated.push(c);
  }
  return { added: plan.added, updated: plan.updated, removed: plan.removed, unchanged: plan.unchanged };
}

export interface ApplyResult {
  map: SampleMap;
  added: string[];
  updated: string[];
  removed: string[];
  /** 문서가 없어져 함께 지운 빈 폴더 노드 수 */
  removedFolders: number;
  /** 절 범위 갱신인데 저장소 문서에 그 절이 더 이상 없다 — 제목 사슬 */
  sectionGone?: string;
}

/** 폴더 노드 안에 relPath 의 폴더 사슬을 찾거나 만들어 그 형제 목록을 돌려준다 */
function ensureFolderChain(
  src: DocsSource, siblings: MindNode[], baseDir: string, relDirSegs: string[], ids: IdGen,
): MindNode[] {
  let cur = siblings;
  let dir = baseDir;
  for (const seg of relDirSegs) {
    dir = dir ? `${dir}/${seg}` : seg;
    let node = cur.find((n) => folderNodePath(src, n) === dir);
    if (!node) {
      node = { id: ids.next('dir'), text: seg, links: [{ id: ids.next('lk'), url: treeUrl(src, dir), label: seg + '/' }], children: [] };
      // 폴더는 문서보다 앞에 — 마지막 폴더 뒤에 끼운다
      let at = 0;
      while (at < cur.length && folderNodePath(src, cur[at]) !== null) at++;
      cur.splice(at, 0, node);
    }
    if (!node.children) node.children = [];
    cur = node.children;
  }
  return cur;
}

/** 문서가 하나도 남지 않은 폴더 노드를 지운다 — 사용자가 손으로 만든 노드는 링크가 없어 안 건드린다 */
function pruneEmptyFolders(src: DocsSource, siblings: MindNode[]): number {
  let removed = 0;
  for (let i = siblings.length - 1; i >= 0; i--) {
    const n = siblings[i];
    if (folderNodePath(src, n) === null) continue;
    removed += pruneEmptyFolders(src, n.children ?? []);
    if ((n.children ?? []).length === 0 && !(n.notes?.length)) { siblings.splice(i, 1); removed++; }
  }
  return removed;
}

/**
 * 계획을 맵에 적용한다. **원본 맵 객체를 바꾸지 않는다**(깊은 복사 뒤 작업).
 * 바뀐 문서는 같은 id 로 노드를 새로 만들어 그 자리에 놓는다. 새 문서는 폴더
 * 사슬을 찾거나 만들어 그 끝에 붙인다. 지운 문서 때문에 빈 폴더는 지운다.
 */
export async function applyUpdate(
  map: SampleMap, src: DocsSource, scope: UpdateScope, plan: UpdatePlan,
  load: (file: RemoteFile) => Promise<{ markdown: string; commit: FileCommit | null }>,
  fetchedAt: string, ids = new IdGen(),
): Promise<ApplyResult> {
  const copy: SampleMap = JSON.parse(JSON.stringify(map));
  // 복사본에서 같은 자리 찾기 — id 로
  const findById = (id: string, list: MindNode[]): { node: MindNode; siblings: MindNode[]; index: number } | null => {
    for (let i = 0; i < list.length; i++) {
      if (list[i].id === id) return { node: list[i], siblings: list, index: i };
      const r = list[i].children?.length ? findById(id, list[i].children!) : null;
      if (r) return r;
    }
    return null;
  };
  const result: ApplyResult = { map: copy, added: [], updated: [], removed: [], removedFolders: 0 };
  const branches = copy.branches as MindNode[];

  // 1) 지우기 — 뒤에서부터 (자리가 밀리지 않게)
  for (const r of plan.removed) {
    const hit = findById(r.node.id, branches);
    if (!hit) continue;
    hit.siblings.splice(hit.index, 1);
    result.removed.push(r.path);
  }

  // 2) 바뀐 것 — 같은 id, 같은 자리
  for (const u of plan.updated) {
    const hit = findById(u.ref.node.id, branches);
    if (!hit) continue;
    const { markdown, commit } = await load(u.file);
    if (scope.kind === 'section') {
      // 절 하나만 — 문서 개요에서 같은 제목 사슬의 절을 찾아 그 노드만 합친다.
      // 문서 노드의 갱신 시각 노트는 손대지 않는다(문서 전체를 맞춘 것이 아니다).
      const doc = sectionize(markdown);
      const sec = findSection(doc, scope.titles);
      const secHit = findById(scope.node.id, branches);
      if (!secHit) continue;
      if (!sec) {
        result.sectionGone = scope.titles.join(' > ');
        continue;
      }
      secHit.siblings[secHit.index] = mergeNode(secHit.node, sectionNode(sec, ids));
      result.updated.push(`${u.file.path} › ${scope.titles.join(' > ')}`);
      continue;
    }
    const fresh = buildFileNode(src, u.file, markdown, commit, ids, hit.node.id);
    // 절 노드는 제목으로 짝지어 id 를 유지하고, 사용자가 손으로 붙인 노드·노트는 남긴다
    hit.siblings[hit.index] = mergeNode(hit.node, fresh);
    result.updated.push(u.file.path);
  }

  // 3) 새 문서 — 폴더 사슬을 찾거나 만들어서
  const prefix = src.path ? src.path.replace(/\/+$/, '') + '/' : '';
  const scopeRoot: { siblings: MindNode[]; baseDir: string } = scope.kind === 'folder'
    ? (() => { const hit = findById(scope.node.id, branches); return { siblings: hit?.node.children ?? (hit!.node.children = []), baseDir: scope.dir }; })()
    : { siblings: branches, baseDir: src.path };
  for (const f of plan.added) {
    const rel = f.path.startsWith(prefix) ? f.path.slice(prefix.length) : f.path;
    const baseRel = scopeRoot.baseDir && scopeRoot.baseDir !== src.path
      ? f.path.slice(scopeRoot.baseDir.length + 1) : rel;
    const segs = baseRel.split('/');
    const list = ensureFolderChain(src, scopeRoot.siblings, scopeRoot.baseDir, segs.slice(0, -1), ids);
    const { markdown, commit } = await load(f);
    list.push(buildFileNode(src, f, markdown, commit, ids));
    result.added.push(f.path);
  }

  // 4) 빈 폴더 정리 (지운 것이 있을 때만)
  if (plan.removed.length) {
    result.removedFolders = pruneEmptyFolders(src, scope.kind === 'folder' ? scopeRoot.siblings : branches);
  }

  // 5) 1레벨 가지의 색·방향 — 새로 생긴 최상위 노드는 아직 없으므로 채운다
  branches.forEach((b, i) => {
    if (!b.colorKey) b.colorKey = BRANCH_COLORS[i % BRANCH_COLORS.length];
    if (!b.side) b.side = 'right';
  });

  // 6) 루트 노트의 "가져옴" 시각 (전체 갱신일 때만 — 부분 갱신은 그 문서만 최신이다)
  if (scope.kind === 'all') {
    const s = readSource(copy);
    if (s) {
      const note = (copy.root.notes ?? []).find((n) => n.id === s.noteId);
      if (note) note.text = sourceNoteText(src, fetchedAt);
    }
  }
  return result;
}

/** 결과 문장에 쓸 짧은 목록 — 많으면 앞 몇 개만 */
export function listSome(paths: string[], max = 8): string {
  if (paths.length === 0) return '';
  const shown = paths.slice(0, max).map((p) => `  · ${p}`).join('\n');
  return paths.length > max ? `${shown}\n  · … 외 ${paths.length - max}개` : shown;
}
