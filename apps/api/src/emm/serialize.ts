// ⚠️ 자동 복사본 — 직접 고치지 마세요.
// 원본: packages/emm-parser/src/serialize.ts
// 갱신: cd apps/api && npm run sync:emm  (CI 가 어긋남을 검사한다)
// 왜 복사하는지는 apps/api/scripts/sync-emm-parser.mjs 머리말 참조.

// serialize — 맵 JSON 모델을 EMM(Markdown) 문서로 직렬화한다.
//
// 본문은 일반 에디터에서 보고 고칠 수 있는 표준 Markdown(GFM)이다:
//   # 중심 주제 → ## 2레벨 → ### 3레벨 … ###### 6레벨, 7레벨+는 리스트
//   (parse.ts의 파서와 정확히 왕복되는 형식)
// 맵 단위 정책(맵 ID · 레벨별 레이아웃·도형·글자 크기)은 제목 바로 아래
// ```emm 선언 블록(declaration.ts)으로 쓴다. **파일 끝 메타데이터 주석은
// 2026-09-15 에 폐기했다** — 노드별 스타일·아이콘 같은 충실도는 HTML
// 내보내기와 서버가 맡고, MD 는 내용 교환 형식이다 (emm-spec.md §2.1).
//
// 이 모듈은 순수 함수만 담는다 — ZIP 패키징·첨부 fetch·다운로드 등
// 브라우저 의존 작업은 앱(apps/frontend/src/export/exportMarkdown.ts)이
// 담당한다.

import type { MindNode, SampleMap } from './model';
import { buildDeclaration, type EmmDeclaration } from './declaration';

export interface EmmImageFile {
  path: string; // files/img-1.png
  data: Uint8Array;
  /** 이 파일이 어느 `image.src` 에서 나왔는가 (보통 data URL) — 같은 사진을 한 번만 담기 위한 키 */
  src?: string;
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
  /** table — 열별 GFM 정렬(구분선 콜론). 구분선이 없거나 콜론이 없으면 '' (2026-09-17) */
  aligns?: string[];
  lines?: string[]; // check(정규화된 "- [x] …" 줄) / plain
}

const NODE_TABLE_SEP_RE = /^[\s|:\-]+$/;
// 구분선 행 → 열별 정렬 셀 (`---` · `:---` · `:---:` · `---:`) — 콜론이 없으면 ''
function sepAligns(sepLine: string, cols: number): string[] {
  const cells = nodeRowCells(sepLine);
  return Array.from({ length: cols }, (_, c) => {
    const v = (cells[c] ?? '').trim();
    const l = v.startsWith(':'), r = v.endsWith(':');
    return l && r ? ':---:' : r ? '---:' : l ? ':---' : '';
  });
}
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

export function splitNodeBody(
  text: string,
  opts?: { singleLine?: boolean },
): { title: string; blocks: NodeBodyBlock[]; labelTitle: boolean } {
  const lines = String(text || '').split('\n');
  // 첫 블록 앞의 일반 줄들 — 빈 줄도 '' 로 남긴다(줄바꿈 보존)
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
      let aligns: string[] | undefined;
      let j = i;
      while (j < lines.length) {
        const t = lines[j].trim();
        if (isNodePipeRow(lines[j])) rows.push(nodeRowCells(lines[j]));
        else if (t.includes('|') && NODE_TABLE_SEP_RE.test(t)) {
          // 구분선 — 셀로는 안 세지만 GFM 정렬 콜론은 기억한다
          if (!aligns && rows.length) aligns = sepAligns(t, rows[0].length);
        }
        else break;
        j++;
      }
      if (rows.length >= 2) {
        flushPlain();
        sawBlock = true;
        blocks.push({ kind: 'table', rows, ...(aligns && aligns.some(Boolean) ? { aligns } : {}) });
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

    if (sawBlock) {
      if (trimmed) plainRun.push(trimmed);
    } else {
      leading.push(trimmed);
    }
    i++;
  }
  flushPlain();

  // 제목 = 첫 줄. 나머지 줄은 인용문(`>`)으로 제목 아래에 쓴다 — 예전엔
  // 모든 줄을 공백으로 이어 한 줄 견출로 뭉갰다(2026-09-15 사용자 지적:
  // "줄바꿈이 사라지고 인용문 표시도 사라졌다"). 불러오기 'node' 배치는
  // 견출·리스트 항목 바로 아래 인용문을 그 노드의 본문 줄로 이어 붙이므로
  // 원문 줄바꿈(빈 줄 포함)이 그대로 돌아온다. singleLine 은 루트(`# 제목`)
  // 처럼 예전대로 한 줄로 이어야 하는 자리.
  let title: string;
  if (opts?.singleLine) {
    title = leading.filter(Boolean).join(' ').trim();
  } else {
    const firstIdx = leading.findIndex(Boolean);
    title = firstIdx >= 0 ? leading[firstIdx] : '';
    const rest = firstIdx >= 0 ? leading.slice(firstIdx + 1) : [];
    while (rest.length && !rest[0]) rest.shift();
    while (rest.length && !rest[rest.length - 1]) rest.pop();
    if (rest.some(Boolean)) blocks.unshift({ kind: 'plain', lines: rest });
  }
  let labelTitle = false;
  if (!title) {
    labelTitle = true;
    // 블록으로 시작하는 노드(표만 붙여넣은 노드 등) — 종류 라벨로 대신한다
    const first = blocks[0];
    title =
      first?.kind === 'table' ? '표'
      : first?.kind === 'code' ? '코드'
      : first?.kind === 'check' ? '체크리스트'
      : oneLine(text);
    if (!first) labelTitle = false;
  }
  return { title, blocks, labelTitle };
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
        // 구분선 — GFM 정렬 콜론 유지 (2026-09-17)
        if (ri === 0) lines.push(`|${cells.map((_, c) => b.aligns?.[c] || '---').join('|')}|`);
      });
    } else {
      // check — 그대로 · plain(블록 뒤 일반 줄) — 인용문으로 (불러오기
      // 'node' 배치가 노드 본문의 원문 순서를 복원한다)
      for (const ln of b.lines ?? []) lines.push(b.kind === 'check' ? ln : ln ? `> ${ln}` : '>');
    }
  }
}

// 표 노트("셀 | 셀" 줄들) → Markdown 파이프 표 (헤더 다음 구분선 포함)
function pushTableNote(lines: string[], text: string): void {
  const all = String(text).split('\n').filter((r) => r.trim());
  // 노트 표 원문에 남은 구분선 행(정렬 콜론 포함)은 셀 행이 아니다 — 정렬만 읽는다
  const sepRow = all.find((r) => NODE_TABLE_SEP_RE.test(r.trim()) && r.includes('|'));
  const rows = all.filter((r) => !(NODE_TABLE_SEP_RE.test(r.trim()) && r.includes('|')));
  const aligns = sepRow && rows.length ? sepAligns(sepRow, rows[0].split('|').length) : undefined;
  rows.forEach((row, i) => {
    const cells = row.split('|').map((c) => c.trim());
    lines.push(`| ${cells.join(' | ')} |`);
    if (i === 0) lines.push(`|${cells.map((_, c) => aligns?.[c] || '---').join('|')}|`);
  });
}

export interface BuildEmmBodyOptions {
  /** 제목 바로 아래 쓸 ```emm 선언 — 맵 ID · 템플릿/레벨별 정책 (declaration.ts) */
  declaration?: EmmDeclaration;
  /**
   * 첨부 id → 본문에 적을 경로(`files/이름`) 또는 URL. 있으면 그 노드 아래에
   * `📎 [이름](경로)` 줄로 쓴다 — 불러오기가 같은 줄을 첨부로 되돌리고 ZIP 의
   * files/ 에서 바이트를 잇는다. 없는 첨부는 http(s) URL 이면 그 URL, 아니면
   * 건너뛴다(blob: 은 이 세션에서만 산다).
   */
  attachmentPaths?: Map<string, string>;
}

// EMM 본문(순수 GFM) 생성 — 사진(data URL)은 files/ 경로로 치환하고
// 바이트를 images 배열에 담아 돌려준다 (패키징은 호출자 책임).
export function buildEmmBody(
  map: SampleMap,
  images: EmmImageFile[],
  opts: BuildEmmBodyOptions = {},
): string {
  const lines: string[] = [];
  // 첨부 줄 — 노드 링크(🔗)와 같은 자리·같은 모양
  const pushAttachments = (node: { attachments?: { id: string; name: string; url?: string }[] }) => {
    for (const a of node.attachments ?? []) {
      const path = opts.attachmentPaths?.get(a.id)
        ?? (a.url && /^https?:\/\//i.test(a.url) ? a.url : undefined);
      if (!path) continue;
      lines.push('');
      lines.push(`📎 [${oneLine(a.name) || a.id}](${path})`);
    }
  };
  // **같은 사진은 한 번만 담는다** — 같은 사진을 여러 노드가 쓰면 예전에는
  // files/ 에 똑같은 바이트가 여러 벌 들어갔다.
  const packedPath = new Map<string, string>();
  const packImage = (src: string): string | null => {
    const seen = packedPath.get(src);
    if (seen) return seen;
    const packed = dataUrlToBytes(src);
    if (!packed) return null;
    const path = `files/img-${images.length + 1}.${packed.ext}`;
    images.push({ path, data: packed.bytes, src });
    packedPath.set(src, path);
    return path;
  };
  // 중심주제의 머리 — `# 제목` + 본문 블록 + (첫 중심만) 선언 + 사진 + 노트
  // + 첨부. 첫 중심(map.root)과 두 번째 이후(map.centers[i].root)가 같은
  // 규칙으로 나간다 (2026-09-15) — 파서가 두 번째 `#` 를 새 중심으로 읽으므로
  // 왕복 뒤 중심 수가 그대로다.
  const pushCenterHead = (root: SampleMap['root'], isFirst: boolean) => {
    const rootBody = splitNodeBody(root.text, { singleLine: true });
    // 첫 중심은 제목이 비면 맵 이름을 쓴다. 두 번째 이후는 **빈 `#`** 로
    // 남긴다(이름 없는 노드) — 맵 이름을 넣으면 다시 읽을 때 이름이 생긴다.
    const fallback = isFirst ? map.title : '';
    const headText = (root.text.trim() ? rootBody.title : '') || fallback;
    lines.push(headText ? `# ${headText}` : '#');
    pushBodyBlocks(lines, rootBody.blocks);
    lines.push('');
    // 맵 선언 — 제목 바로 아래. 불러오면 루트의 `emm` 코드 노트로 보이고
    // (declaration.ts: 숨은 마법이 아니라 앱 안에서 보이는 노트), 다시 내보낼
    // 때는 아래에서 그 노트를 건너뛰고 **맵 설정에서 새로** 쓴다 — 두 곳에
    // 같은 정보를 두면 반드시 어긋난다. 맵에 하나뿐이므로 첫 중심 아래에만.
    const declaration = isFirst && opts.declaration ? buildDeclaration(opts.declaration) : '';
    if (declaration) {
      lines.push(declaration);
      lines.push('');
    }
    // 루트 노드의 사진 (2026-08-18, B17) — 예전에는 **빠뜨려서 루트에 붙인
    // 사진이 MD 로 내보내면 사라졌다**(HTML 내보내기는 정상이었다).
    // 가지 노드와 같은 규칙: files/ 로 담을 수 있으면 상대 경로, 아니면 URL.
    const rootImgs = root.images?.length
      ? root.images
      : root.image?.src
        ? [root.image]
        : [];
    for (const im of rootImgs) {
      const path = packImage(im.src);
      if (path) {
        lines.push(`![${oneLine(root.text).slice(0, 20)}](${path})`);
        lines.push('');
      } else if (/^https?:\/\//i.test(im.src)) {
        lines.push(`![${oneLine(root.text).slice(0, 20)}](${im.src})`);
        lines.push('');
      }
    }
    // 루트의 노트 → 제목 바로 아래 (문단=인용문, 표=파이프 표, 코드=펜스 —
    // 불러오기 시 다시 루트 노트로)
    for (const n of root.notes ?? []) {
      if (n.type === 'paragraph' && n.text.trim()) {
        for (const ln of n.text.split('\n')) lines.push(`> ${ln}`);
        lines.push('');
      } else if (n.type === 'table' && n.text.trim()) {
        pushTableNote(lines, n.text);
        lines.push('');
      } else if (n.type === 'code_block' && n.text.trim()) {
        // 불러오기가 남긴 `emm` 선언 노트는 건너뛴다 — 위에서 맵 설정으로 새로 썼다
        if ((n.lang ?? '').toLowerCase() === 'emm') continue;
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
    pushAttachments(root);
    lines.push('');
  };
  pushCenterHead(map.root, true);

  // listIndent: null 이면 견출(#) 모드, 숫자면 리스트(-) 모드의 들여쓰기 단.
  // group.headingSeen: 같은 형제 묶음에서 이미 견출을 냈는지 — 견출 뒤에
  // 오는 `-` 는 파서가 그 견출의 **자식**으로 읽으므로, 형제 묶음 안에서
  // 견출이 한 번 나오면 그 뒤 형제는 리스트 표시가 있어도 견출로 쓴다.
  const walk = (
    node: MindNode,
    depth: number,
    listIndent: number | null,
    group: { headingSeen: boolean },
  ) => {
    // depth 1(2레벨)=## … depth 5(6레벨)=###### / 그 아래는 리스트 들여쓰기
    // 노드 안의 코드·표·체크 블록은 한 줄로 뭉개지 않고 견출 아래에
    // MD 블록(펜스·파이프 표·- [x])으로 내보낸다 — splitNodeBody 참조.
    const nodeBody = splitNodeBody(node.text);
    // 빈 제목(글자를 모두 지운 노드)은 `##` / `-` 만 쓴다 — 행 끝 공백을
    // 남기면 파서·다른 앱이 견출로 안 읽거나 `###` 이름의 노드로 읽는다
    // (2026-09-15). 다시 읽으면 **이름 없는 노드**로 돌아온다.
    //
    // 리스트 항목(`- 항목`)으로 읽어 온 노드(mdForm='list')는 다시 리스트로
    // 쓴다 — 견출로 바꾸면 왕복 뒤 `- 항목` 이 `### 항목` 이 된다
    // (2026-09-15). 리스트 노드의 하위는 표시가 없어도 전부 리스트로 나간다
    // (리스트 아래에 견출을 쓰면 파서가 상위 견출의 자식으로 읽어 구조가
    // 깨진다). 7레벨(depth>5) 아래는 견출이 없으므로 예전처럼 리스트.
    const asList =
      listIndent !== null || depth > 5 || (node.mdForm === 'list' && !group.headingSeen);
    const indent = listIndent ?? 0;
    // 블록(코드·표·체크)으로 시작하는 노드는 제목이 없어 종류 라벨(`### 코드`)
    // 을 견출로 썼는데, 다시 읽으면 "코드" 노드가 끼어들어 왕복마다 한 단계
    // 깊어졌다 (2026-09-15). 하위·노트·링크·사진이 없는 잎 노드면 라벨 없이
    // 블록만 쓴다 — 'node' 배치가 블록을 상위의 자식 노드로 읽어 구조가
    // 그대로 돌아온다. 가지(depth 1)는 첫 견출 전 블록이 머리말로 읽히므로
    // 제외. 하위가 있으면 라벨을 남긴다(라벨 없이는 하위를 붙일 자리가 없다).
    const bare =
      nodeBody.labelTitle &&
      depth > 1 &&
      !(node.children?.length) &&
      !(node.notes?.length) &&
      !(node.links?.length) &&
      !(node.images?.length) &&
      !node.image?.src;
    if (bare) {
      // 제목 줄 없음 — 블록만
    } else if (asList) {
      const dash = `${'  '.repeat(indent)}-`;
      lines.push(nodeBody.title ? `${dash} ${nodeBody.title}` : dash);
    } else {
      group.headingSeen = true;
      // 리스트 항목 바로 뒤에 오는 견출은 빈 줄로 띄운다 (읽기 좋게)
      if (lines.length && lines[lines.length - 1] !== '') lines.push('');
      const hashes = '#'.repeat(depth + 1);
      lines.push(nodeBody.title ? `${hashes} ${nodeBody.title}` : hashes);
    }
    // 리스트 항목은 제목 한 줄뿐이면 빈 줄 없이 붙여 쓴다 (`- a` / `- b`) —
    // 사진·링크·노트·블록이 딸리면 예전처럼 빈 줄로 띄운다.
    const before = lines.length;
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
      const path = packImage(im.src);
      if (path) {
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
    pushAttachments(node);
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
    if (!asList || lines.length !== before) lines.push('');
    const childGroup = { headingSeen: false };
    for (const c of node.children ?? []) {
      walk(c, depth + 1, asList ? indent + 1 : null, childGroup);
    }
  };

  const topGroup = { headingSeen: false };
  for (const b of map.branches) walk(b, 1, null, topGroup);
  // 두 번째 이후의 중심주제 — 각각 `# 제목` 으로 (2026-09-15). 파서는 두 번째
  // `#` 부터를 새 중심으로 읽는다. 순서는 모델의 순서 그대로(형제 순서 보존).
  for (const c of map.centers ?? []) {
    if (lines.length && lines[lines.length - 1] !== '') lines.push('');
    pushCenterHead(c.root, false);
    const group = { headingSeen: false };
    for (const b of c.branches) walk(b, 1, null, group);
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n');
}
