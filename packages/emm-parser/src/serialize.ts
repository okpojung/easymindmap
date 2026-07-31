// serialize — 맵 JSON 모델을 EMM(Markdown) 문서로 직렬화한다.
//
// 본문은 일반 에디터에서 보고 고칠 수 있는 표준 Markdown(GFM)이다:
//   # 중심 주제 → ## 2레벨 → ### 3레벨 … ###### 6레벨, 7레벨+는 리스트
//   (parse.ts의 파서와 정확히 왕복되는 형식)
// 파일 끝에 맵 메타데이터 주석(<!-- easymindmap:v1:BASE64 -->)을 실어
// 원본 맵 전체(스타일·노트·사진·설정)를 보존한다.
//
// 이 모듈은 순수 함수만 담는다 — ZIP 패키징·첨부 fetch·다운로드 등
// 브라우저 의존 작업은 앱(apps/frontend/src/export/exportMarkdown.ts)이
// 담당한다.

import type { EditorSpacing, LayoutType, MindNode, SampleMap } from './model';
import { buildMapMeta, countMapNodes, encodeMetaBase64, type MapFileMeta } from './meta';

export interface EmmImageFile {
  path: string; // files/img-1.png
  data: Uint8Array;
}

export function safeFileName(s: string, fallback: string): string {
  const cleaned = String(s || '').trim().replace(/[\\/:*?"<>|]+/g, '-').slice(0, 60);
  return cleaned || fallback;
}

export function dataUrlToBytes(src: string): { bytes: Uint8Array; ext: string } | null {
  const m = src.match(/^data:image\/(png|jpe?g|gif|webp);base64,(.+)$/i);
  if (!m) return null;
  try {
    const bin = atob(m[2]);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return { bytes, ext: m[1].toLowerCase().replace('jpeg', 'jpg') };
  } catch {
    return null;
  }
}

// 노드 한 줄 텍스트 — 본문 견출/리스트는 한 줄이어야 하므로 줄바꿈은
// 공백으로 합친다 (원본 여러 줄 텍스트는 메타데이터가 보존).
function oneLine(text: string): string {
  return String(text || '').replace(/\s*\n+\s*/g, ' ').trim();
}

// ---- 노드 본문 분해 — "견출 제목 + MD 블록" ------------------------------
//
// 노드 텍스트에 코드 펜스·파이프 표·체크 줄이 섞여 있으면(리치 노드),
// 견출 한 줄로 뭉개지 않고 제목과 블록으로 나눠 내보낸다:
//   제목       = 첫 블록 앞의 일반 줄들 (공백으로 합침)
//   코드       → ``` 펜스 · 표 → 파이프 표(구분선 포함) · 체크 → - [x]
//   블록 뒤의 일반 줄 → 인용문(>) — 'node' 배치로 다시 불러오면 원문
//   순서 그대로 노드 본문에 복원된다 (표 아래 "※ 첨부 …" 등)

export interface NodeBodyBlock {
  kind: 'code' | 'table' | 'check' | 'plain';
  lang?: string; // code
  body?: string; // code — 펜스 안 원문
  rows?: string[][]; // table — 행별 셀
  lines?: string[]; // check(정규화된 "- [x] …" 줄) / plain
}

const NODE_TABLE_SEP_RE = /^[\s|:\-]+$/;
const NODE_CHECK_RE = /^[-*+]\s+\[([ xX])\]\s+(.+)$/;

function isNodePipeRow(s: string): boolean {
  const t = s.trim();
  return t.length > 1 && t.includes('|') && !NODE_TABLE_SEP_RE.test(t);
}

function nodeRowCells(s: string): string[] {
  let t = s.trim();
  if (t.startsWith('|')) t = t.slice(1);
  if (t.endsWith('|')) t = t.slice(0, -1);
  return t.split('|').map((c) => c.trim());
}

export function splitNodeBody(text: string): { title: string; blocks: NodeBodyBlock[] } {
  const lines = String(text || '').split('\n');
  const leading: string[] = [];
  const blocks: NodeBodyBlock[] = [];
  let plainRun: string[] = [];
  let sawBlock = false;
  const flushPlain = () => {
    if (plainRun.length) blocks.push({ kind: 'plain', lines: plainRun });
    plainRun = [];
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    const fence = trimmed.match(/^```(.*)$/);
    if (fence) {
      let j = i + 1;
      const body: string[] = [];
      while (j < lines.length && !/^```\s*$/.test(lines[j].trim())) { body.push(lines[j]); j++; }
      flushPlain();
      sawBlock = true;
      blocks.push({ kind: 'code', lang: fence[1].trim(), body: body.join('\n') });
      i = j + 1;
      continue;
    }

    // 표 — 파이프 행 2줄+ 연속, 첫 행 셀 2개+ (에디터 mdTable.ts와 동일 규칙)
    if (
      isNodePipeRow(line) && nodeRowCells(line).length >= 2 &&
      i + 1 < lines.length &&
      (isNodePipeRow(lines[i + 1]) || NODE_TABLE_SEP_RE.test(lines[i + 1].trim()))
    ) {
      const rows: string[][] = [];
      let j = i;
      while (j < lines.length) {
        const t = lines[j].trim();
        if (isNodePipeRow(lines[j])) rows.push(nodeRowCells(lines[j]));
        else if (t.includes('|') && NODE_TABLE_SEP_RE.test(t)) { /* 구분선 — 건너뜀 */ }
        else break;
        j++;
      }
      if (rows.length >= 2) {
        flushPlain();
        sawBlock = true;
        blocks.push({ kind: 'table', rows });
        i = j;
        continue;
      }
    }

    const check = trimmed.match(NODE_CHECK_RE);
    if (check) {
      flushPlain();
      sawBlock = true;
      blocks.push({
        kind: 'check',
        lines: [`- [${check[1].toLowerCase() === 'x' ? 'x' : ' '}] ${check[2].trim()}`],
      });
      i++;
      continue;
    }

    if (trimmed) (sawBlock ? plainRun : leading).push(trimmed);
    i++;
  }
  flushPlain();

  let title = leading.join(' ').trim();
  if (!title) {
    // 블록으로 시작하는 노드(표만 붙여넣은 노드 등) — 종류 라벨로 대신한다
    const first = blocks[0];
    title =
      first?.kind === 'table' ? '표'
      : first?.kind === 'code' ? '코드'
      : first?.kind === 'check' ? '체크리스트'
      : oneLine(text);
  }
  return { title, blocks };
}

// 노드 텍스트의 "견출 제목" — MD 본문의 견출과 메타데이터 노드를 짝짓는
// 기준 (앱 불러오기의 enrich 텍스트 매칭이 사용)
export function nodeHeadingText(text: string): string {
  return splitNodeBody(text).title;
}

// splitNodeBody의 블록들을 MD 줄로 밀어 넣는다 (견출 바로 아래)
function pushBodyBlocks(lines: string[], blocks: NodeBodyBlock[]): void {
  for (const b of blocks) {
    lines.push('');
    if (b.kind === 'code') {
      lines.push('```' + (b.lang || ''));
      if (b.body) lines.push(b.body);
      lines.push('```');
    } else if (b.kind === 'table') {
      (b.rows ?? []).forEach((cells, ri) => {
        lines.push(`| ${cells.join(' | ')} |`);
        if (ri === 0) lines.push(`|${cells.map(() => '---').join('|')}|`);
      });
    } else {
      // check — 그대로 · plain(블록 뒤 일반 줄) — 인용문으로 (불러오기
      // 'node' 배치가 노드 본문의 원문 순서를 복원한다)
      for (const ln of b.lines ?? []) lines.push(b.kind === 'check' ? ln : `> ${ln}`);
    }
  }
}

// 표 노트("셀 | 셀" 줄들) → Markdown 파이프 표 (헤더 다음 구분선 포함)
function pushTableNote(lines: string[], text: string): void {
  const rows = String(text).split('\n').filter((r) => r.trim());
  rows.forEach((row, i) => {
    const cells = row.split('|').map((c) => c.trim());
    lines.push(`| ${cells.join(' | ')} |`);
    if (i === 0) lines.push(`|${cells.map(() => '---').join('|')}|`);
  });
}

// EMM 본문(순수 GFM) 생성 — 사진(data URL)은 files/ 경로로 치환하고
// 바이트를 images 배열에 담아 돌려준다 (패키징은 호출자 책임).
export function buildEmmBody(map: SampleMap, images: EmmImageFile[]): string {
  const lines: string[] = [];
  const rootBody = splitNodeBody(map.root.text);
  lines.push(`# ${(map.root.text.trim() ? rootBody.title : '') || map.title}`);
  pushBodyBlocks(lines, rootBody.blocks);
  lines.push('');
  // 루트의 노트 → 제목 바로 아래 (문단=인용문, 표=파이프 표, 코드=펜스 —
  // 불러오기 시 다시 루트 노트로)
  for (const n of map.root.notes ?? []) {
    if (n.type === 'paragraph' && n.text.trim()) {
      for (const ln of n.text.split('\n')) lines.push(`> ${ln}`);
      lines.push('');
    } else if (n.type === 'table' && n.text.trim()) {
      pushTableNote(lines, n.text);
      lines.push('');
    } else if (n.type === 'code_block' && n.text.trim()) {
      lines.push('```' + (n.lang ?? ''));
      lines.push(n.text);
      lines.push('```');
      lines.push('');
    } else if (n.type === 'checklist' && n.text.trim()) {
      // 체크리스트 → - [x] / - [ ] (markmap 호환, 불러오기 시 다시 노트로)
      lines.push(`- [${n.checked ? 'x' : ' '}] ${oneLine(n.text)}`);
      lines.push('');
    }
  }

  const walk = (node: MindNode, depth: number) => {
    // depth 1(2레벨)=## … depth 5(6레벨)=###### / 그 아래는 리스트 들여쓰기
    // 노드 안의 코드·표·체크 블록은 한 줄로 뭉개지 않고 견출 아래에
    // MD 블록(펜스·파이프 표·- [x])으로 내보낸다 — splitNodeBody 참조.
    const nodeBody = splitNodeBody(node.text);
    if (depth <= 5) {
      lines.push(`${'#'.repeat(depth + 1)} ${nodeBody.title}`);
    } else {
      lines.push(`${'  '.repeat(depth - 6)}- ${nodeBody.title}`);
    }
    pushBodyBlocks(lines, nodeBody.blocks);

    // 사진 — files/로 패키징된 경우 상대 경로, 아니면 원본 URL.
    // 인라인 사진(images — 텍스트 중간)이 있으면 원문 순서대로 모두 내보낸다
    // (MD에서 노드는 한 줄이라 "텍스트 중간" 위치는 표현하지 못하고, 제목
    // 아래에 순서대로 나열된다 — markdown-export.md §노드 사진 참조).
    const nodeImgs = node.images?.length
      ? node.images
      : node.image?.src
        ? [node.image]
        : [];
    for (const im of nodeImgs) {
      const packed = dataUrlToBytes(im.src);
      if (packed) {
        const path = `files/img-${images.length + 1}.${packed.ext}`;
        images.push({ path, data: packed.bytes });
        lines.push('');
        lines.push(`![${oneLine(node.text).slice(0, 20)}](${path})`);
      } else if (/^https?:\/\//i.test(im.src)) {
        lines.push('');
        lines.push(`![${oneLine(node.text).slice(0, 20)}](${im.src})`);
      }
    }
    // 링크 — Markdown 링크 문법으로 (불러오기 시 다시 노드 링크로 추출)
    for (const l of node.links ?? []) {
      lines.push('');
      lines.push(`🔗 [${oneLine(l.label ?? '') || l.url}](${l.url})`);
    }
    // 문단 노트 → 인용문(>) · 코드 노트 → 펜스 · 표 노트 → 파이프 표
    // (불러오기 시 다시 노트로)
    for (const n of node.notes ?? []) {
      if (n.type === 'paragraph' && n.text.trim()) {
        lines.push('');
        for (const ln of n.text.split('\n')) lines.push(`> ${ln}`);
      } else if (n.type === 'code_block' && n.text.trim()) {
        lines.push('');
        lines.push('```' + (n.lang ?? ''));
        lines.push(n.text);
        lines.push('```');
      } else if (n.type === 'table' && n.text.trim()) {
        lines.push('');
        pushTableNote(lines, n.text);
      } else if (n.type === 'checklist' && n.text.trim()) {
        lines.push('');
        lines.push(`- [${n.checked ? 'x' : ' '}] ${oneLine(n.text)}`);
      }
    }
    lines.push('');
    for (const c of node.children ?? []) walk(c, depth + 1);
  };

  for (const b of map.branches) walk(b, 1);
  return lines.join('\n').replace(/\n{3,}/g, '\n\n');
}

// 메타데이터 주석 블록 — 일반 에디터에서 한눈에 알아볼 수 있게 머리말 +
// 100자 줄바꿈 base64 (파서는 easymindmap:v1: 토큰만 찾으므로 형식 자유)
export function buildMetaComment(
  meta: MapFileMeta,
  opts?: { exportedLocal?: string },
): string {
  const b64 = encodeMetaBase64(meta).replace(/(.{100})/g, '$1\n');
  const exportedLocal = opts?.exportedLocal ?? new Date(meta.exportedAt).toISOString();
  return [
    '',
    '<!--',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    'EasyMindMap 맵 파일 메타데이터',
    `제목: ${meta.title}`,
    `노드 수: ${meta.nodeCount}`,
    `내보낸 시각: ${exportedLocal} (${meta.exportedAt})`,
    `형식: ${meta.format} v${meta.version} · 생성기: ${meta.generator}`,
    '',
    '이 주석은 EasyMindMap이 다시 불러올 때 스타일·노트·사진·태그·맵',
    '설정을 복원하는 데 씁니다 — 지우면 구조·텍스트만 불러와집니다.',
    '위 본문(견출·리스트)은 자유롭게 수정해도 됩니다.',
    '',
    'easymindmap:v1:',
    b64,
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '-->',
    '',
  ].join('\n');
}

export interface SerializeEmmOptions {
  layoutType?: LayoutType;
  spacing?: EditorSpacing;
  // 결정적 출력이 필요할 때(테스트 등) 내보낸 시각을 고정
  exportedAt?: string;
  exportedLocal?: string;
  // false면 메타데이터 주석 생략 (EMM-Basic 본문만)
  includeMeta?: boolean;
}

export interface SerializedEmm {
  markdown: string;
  images: EmmImageFile[]; // files/… 로 참조된 사진 바이트 (없으면 [])
  meta: MapFileMeta | null;
}

// 맵 → EMM 문서 (본문 + 메타데이터 주석). ZIP 패키징은 호출자 몫.
export function serializeEmm(map: SampleMap, opts: SerializeEmmOptions = {}): SerializedEmm {
  const images: EmmImageFile[] = [];
  const body = buildEmmBody(map, images);
  if (opts.includeMeta === false) {
    return { markdown: body, images, meta: null };
  }
  const meta = buildMapMeta(map, opts.layoutType, opts.spacing);
  if (opts.exportedAt) meta.exportedAt = opts.exportedAt;
  const comment = buildMetaComment(meta, { exportedLocal: opts.exportedLocal });
  return { markdown: body + comment, images, meta };
}

export { countMapNodes };
