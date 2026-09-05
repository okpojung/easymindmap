// ⚠️ 자동 복사본 — 직접 고치지 마세요.
// 원본: packages/emm-parser/src/parse.ts
// 갱신: cd apps/api && npm run sync:emm  (CI 가 어긋남을 검사한다)
// 왜 복사하는지는 apps/api/scripts/sync-emm-parser.mjs 머리말 참조.

// parse — EMM(Markdown) 문서를 맵 JSON 모델로 변환한다.
// (EasyMindMap 앱의 importMarkdown이 이 모듈을 재수출해 사용한다)
// docs/04-extensions/import-export/20-export.md의 Basic 포맷 + 완전 변환:
//
//   # 제목             → 루트(중심 주제) · 맵 제목 (파일의 첫 H1만)
//   # 이후의 H1        → 2레벨 견출 (ChatGPT 내보내기처럼 본문에 #을
//                        쓰는 파일에서 견출이 사라지지 않게 — ## 과 동급)
//   (첫 견출 전의 인용문·문단) → 루트의 문단 노트 (머리말 처리)
//   ## 견출            → 2레벨, ### → 3레벨 … (###### → 6레벨)
//   - 리스트           → 마지막 견출의 하위 (들여쓰기 2칸/탭 = 한 단계)
//   1. 순번 리스트      → 하위 노드, 번호("1. ")를 텍스트에 그대로 유지
//   (리스트 항목의 들여쓴 연속 줄) → 그 항목 노드의 추가 줄(\n)로 합침
//   일반 문단           → 마지막 견출의 하위 노드 (연속 줄은 한 노드로)
//   | 표 | 행 |         → 직전 노드의 "표 노트" (구분선 |---| 제거,
//                        노트 뷰어가 격자 표로 렌더링 — 노드 내용 아님)
//   [라벨](url)        → 노드 텍스트에서는 라벨만 남기고 URL은 노드의
//                        링크(🔗)로 첨부. 노트(인용문) 안에서는 원문
//                        유지 — 노트 뷰어가 클릭 가능한 링크로 렌더링.
//   > 인용문            → 현재 노드의 문단 노트
//   ``` 코드 펜스 ```   → 현재 노드의 코드 노트
//   --- 수평선          → 무시
//
// 인라인 강조(**굵게** ==하이라이트== 등)는 노드 텍스트에 그대로 담겨
// 에디터의 인라인 마커 렌더링으로 표시된다.

import type {
  SampleMap,
  SampleBranch,
  MindNode,
  NodeColorKey,
  NodeInlineImage,
  NodeLink,
  NoteBlock,
} from './model';
import { readFrontMatter } from './frontMatter';
import { setextToAtx } from './setext';

const BRANCH_COLORS: NodeColorKey[] = ['l1A', 'l1B', 'l1C', 'l1D', 'l1E'];

// ---- 블록 배치 옵션 (리치 노드 P3 — rich-node-content.md §2.2~2.3) ----
//
// blockPlacement:
//   'note'(파서 기본) — 기존 동작: 인용문=문단 노트, ```=코드 노트,
//     표=표 노트, - [x]=체크 노트. (적합성 코퍼스·AI 생성·EasyMindMap
//     MD 왕복(enrich 텍스트 매칭)과의 호환을 위해 파서 기본은 유지)
//   'node' — 블록을 해당 위치 노드의 "본문"에 넣는다 (앱 불러오기 UI의
//     기본값). 노드가 A4 분량(NODE_A4_CHARS)을 넘으면 넘치는 블록부터
//     노트로 옮기고 stats.movedToNote 를 센다 (데이터는 잃지 않는다).
export interface ParseEmmOptions {
  blockPlacement?: 'node' | 'note';
  // 호출자가 넘긴 객체에 통계를 채워 준다 (반환 타입 호환 유지)
  stats?: { movedToNote: number };
  /**
   * **종류별 노트 배치** (2026-09-05, MCP "코드는 노트코드로 첨부해줘").
   * `blockPlacement:'node'` 일 때만 뜻이 있다 — 'note' 면 어차피 전부 노트다.
   *   · `codeToNote`: 코드 펜스를 자식 노드가 아니라 **현재 노드의 코드 노트**로
   *   · `longParagraphToNote`: 견출 아래 문단이 이 글자 수 **이상**이면 자식
   *     노드가 아니라 **현재 노드의 문단 노트**로 ("긴 문장은 노트 문단으로")
   * 둘 다 없으면 지금까지와 같다(노드 내용으로).
   */
  codeToNote?: boolean;
  longParagraphToNote?: number;
}

// "A4 한 장" 근사 — 노드 본문 제한 (텍스트 글자 수, 이미지 1장 = 600자)
export const NODE_A4_CHARS = 2500;
export const NODE_IMAGE_CHARS = 600;

// Markdown 링크/이미지 — [라벨](url) / ![대체](경로). 제목("title") 허용.
const MD_LINK_RE = /(!?)\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

// 표 구분선 행 — | --- | :--: | 등
const TABLE_SEP_RE = /^[\s|:\-]+$/;

// 이미지로 취급할 원격 URL — ![](url) 문법 또는 한 줄 전체가 이미지
// 확장자 URL이면 노드 텍스트가 아니라 노드 사진(images)으로 담는다.
// (앱은 불러온 뒤 다운로드해 data URL로 내장 — resolveRemoteImages)
const BARE_IMAGE_URL_RE =
  /^https?:\/\/\S+\.(png|jpe?g|gif|webp|svg|avif|bmp)(\?\S*)?(#\S*)?$/i;

// 원격 이미지의 표시 이름 — URL 마지막 경로 조각 (없으면 '이미지')
function imageFileName(url: string): string {
  try {
    const path = url.replace(/[?#].*$/, '');
    const seg = decodeURIComponent(path.split('/').filter(Boolean).pop() ?? '');
    return seg || '이미지';
  } catch {
    return '이미지';
  }
}

// 파서가 담는 원격 이미지의 자리 크기 — 앱이 다운로드하며 실측으로
// 바꾼다 (실패 시 이미지를 빼고 링크로 폴백하므로 0이 렌더되지 않는다)
export const REMOTE_IMAGE_PLACEHOLDER_W = 320;
export const REMOTE_IMAGE_PLACEHOLDER_H = 200;

export function parseMarkdownToMap(
  md: string,
  fallbackTitle: string,
  opts: ParseEmmOptions = {},
): SampleMap | null {
  const placeInNode = opts.blockPlacement === 'node';
  // front matter 는 CommonMark 가 아니다 — 걷어내지 않으면 수평선 + setext
  // 헤딩으로 읽혀 문서 맨 앞에 가짜 노드가 생긴다 (frontMatter.ts 참조)
  //
  // 이어서 **밑줄로 쓴 헤딩을 `#` 로 맞춘다.** 아래 헤딩 인식은 `^#{1,6}`
  // 하나뿐이라, 맞추지 않으면 setext 문서는 헤딩이 없는 것으로 읽혀 이
  // 함수가 통째로 null 을 돌려준다 (setext.ts 참조).
  const lines = setextToAtx(
    readFrontMatter(md).body.replace(/\r\n?/g, '\n').split('\n'),
  );

  // 사전 스캔: 제목(첫 H1) 외에 본문에도 H1(#)을 쓰는 파일인지 확인.
  // (ChatGPT 내보내기 등은 본문 견출에 #, 그 하위에 ##을 쓴다)
  //  - 본문 H1 있음(h1Mode): # → 2레벨, ## → 3레벨 … (한 단계씩 내림)
  //  - 없음(일반 파일):      ## → 2레벨, ### → 3레벨 … (기존과 동일)
  let h1Count = 0;
  let firstHeadingLevel = 0;
  {
    let inFence = false;
    for (const raw of lines) {
      if (/^\s*```/.test(raw)) { inFence = !inFence; continue; }
      if (inFence) continue;
      const h = raw.match(/^(#{1,6})\s+\S/);
      if (!h) continue;
      if (!firstHeadingLevel) firstHeadingLevel = h[1].length;
      if (h[1].length === 1) h1Count++;
    }
  }
  const h1Mode = h1Count - (firstHeadingLevel === 1 ? 1 : 0) > 0;

  let title = fallbackTitle;
  let rootText = '';
  const branches: SampleBranch[] = [];
  const rootNotes: NoteBlock[] = [];
  /** 첫 견출 전에 나온 루트 사진 (2026-08-18, B17) */
  const rootImages: string[] = [];
  let seq = 0;
  const nid = () => `md-${Date.now()}-${seq++}`;

  // 노드 텍스트에서 [라벨](url)을 라벨로 바꾸고 URL은 링크로 모은다.
  // 이미지 문법(![..](..))은 대체 텍스트만 남기고, 원격(http) 이미지는
  // images로 모아 노드 사진이 되게 한다 (경로·URL이 텍스트로 남지 않는다).
  const stripLinks = (
    raw: string,
  ): { text: string; links: NodeLink[]; images: string[] } => {
    const links: NodeLink[] = [];
    const images: string[] = [];
    let text = String(raw);
    // 한 줄 전체가 이미지 확장자 URL이면 이미지 문법으로 취급
    text = text
      .split('\n')
      .map((ln) => (BARE_IMAGE_URL_RE.test(ln.trim()) ? `![](${ln.trim()})` : ln))
      .join('\n');
    // 배지 등 "링크 안의 이미지"([![대체](img)](url)) — 대체 텍스트만 남기고
    // 바깥 링크 URL을 추출한다 (일반 패스는 안쪽 괄호를 잘못 짝지음)
    text = text.replace(
      /\[!\[([^\]]*)\]\([^)\s]+\)\]\((https?:\/\/[^)\s]+)(?:\s+"[^"]*")?\)/g,
      (_m, alt: string, url: string) => {
        if (!links.some((l) => l.url === url)) {
          links.push({ id: nid(), url, label: alt.trim() || undefined });
        }
        return alt.trim();
      },
    );
    // 중첩 문법이 남아도 풀리도록 안정될 때까지 반복
    for (let pass = 0; pass < 3; pass++) {
      const next = text.replace(MD_LINK_RE, (_m, bang: string, label: string, url: string) => {
        if (bang) {
          // 이미지 — 원격 URL은 노드 사진으로, 대체 텍스트만 본문에 남긴다
          if (/^https?:\/\//i.test(url) && !images.includes(url)) images.push(url);
          return label.trim();
        }
        if (/^https?:\/\//i.test(url) && !links.some((l) => l.url === url)) {
          links.push({ id: nid(), url, label: label.trim() || undefined });
        }
        return (label || url).trim();
      });
      if (next === text) break;
      text = next;
    }
    // Markdown 백슬래시 이스케이프 해제 — "1\." "\-" 같은 표기를
    // 원래 문자로 (ChatGPT 내보내기가 자주 씀)
    text = text.replace(/\\([\\`*_{}[\]()#+\-.!|~])/g, '$1');
    return { text: text.trim(), links, images };
  };

  const mergeLinks = (node: MindNode, links: NodeLink[]) => {
    if (!links.length) return;
    const cur = node.links ?? [];
    for (const l of links) if (!cur.some((c) => c.url === l.url)) cur.push(l);
    node.links = cur;
  };

  // 현재 트리 경로 (depth 오름차순, 루트 제외 — depth 1부터)
  const stack: { depth: number; node: MindNode }[] = [];
  // 리스트/문단/표의 기준이 되는 마지막 견출 깊이 (## = 1)
  let lastHeadingDepth = 0;
  let sawHeading = false;
  // 마지막 리스트 항목 — 들여쓴 연속 줄을 이 노드의 추가 줄로 합친다
  let lastItem: { node: MindNode; indent: number } | null = null;
  // 'node' 배치에서 직전에 "자식 노드로 분리"한 블록 — 바로 뒤의
  // 인용문(표 아래 "※ 첨부 …" 등)은 이 노드의 본문 줄로 이어 붙는다
  let lastBlockNode: MindNode | null = null;
  // "순번 문단 섹션" — 들여쓰기 없는 순번 항목("1. WEB 서버 …")은 절
  // 머리 역할을 한다: 다음 순번/견출 전까지의 문단이 그 하위로 붙는다
  // (ChatGPT 답변처럼 견출 없이 "1. 제목" + 본문 문단으로 쓰는 문서)
  let sectionDepth: number | null = null;
  // 마지막 문단 노드의 깊이 — 문단 뒤의 불릿(-,*)은 그 문단의 하위로
  let paraDepth: number | null = null;

  // 원격 이미지 → 노드 사진(images) — 텍스트 끝(모든 줄 뒤)에 붙인다
  const mergeImages = (node: MindNode, imageUrls: string[]) => {
    if (!imageUrls.length) return;
    const afterLine = String(node.text || '').split('\n').length;
    const cur = node.images ?? [];
    for (const src of imageUrls) {
      if (cur.some((im) => im.src === src)) continue;
      cur.push({
        src,
        w: REMOTE_IMAGE_PLACEHOLDER_W,
        h: REMOTE_IMAGE_PLACEHOLDER_H,
        afterLine,
      } satisfies NodeInlineImage);
    }
    node.images = cur;
  };

  const attach = (depth: number, rawText: string): MindNode | null => {
    if (depth < 1 || !rawText.trim()) return null;
    const { text, links, images } = stripLinks(rawText);
    if (!text && !images.length) return null;
    // 이미지뿐인 줄(![](url)) — 파일 이름을 노드 텍스트로 쓴다
    const nodeText = text || imageFileName(images[0]);
    while (stack.length && stack[stack.length - 1].depth >= depth) stack.pop();

    if (depth === 1 || stack.length === 0) {
      const branch: SampleBranch = {
        id: nid(),
        text: nodeText,
        colorKey: BRANCH_COLORS[branches.length % BRANCH_COLORS.length],
        side: 'right',
      };
      mergeLinks(branch, links);
      mergeImages(branch, images);
      branches.push(branch);
      // 빈 스택에 깊은 견출(## 등)이 오면 그 깊이 그대로 기억해 둔다 —
      // 같은 레벨의 다음 견출이 자식이 아니라 형제가 되도록.
      stack.push({ depth, node: branch });
      return branch;
    }
    const parent = stack[stack.length - 1];
    const node: MindNode = { id: nid(), text: nodeText };
    mergeLinks(node, links);
    mergeImages(node, images);
    parent.node.children = parent.node.children ?? [];
    parent.node.children.push(node);
    stack.push({ depth, node });
    return node;
  };

  // 종류별 노트 배치(codeToNote·longParagraphToNote)가 노트를 붙일 **주인** —
  // 스택 맨 위가 아니라 **문단 노드가 아닌 가장 가까운 조상**(견출·불릿).
  // 문단이 먼저 자식 노드가 된 뒤 긴 문단·코드가 오면, 그 노트는 방금 생긴
  // 문단 노드가 아니라 사용자가 말한 "그 노드"(견출)에 달려야 한다.
  const paraNodes = new WeakSet<MindNode>();
  const noteHost = (): MindNode | null => {
    for (let i = stack.length - 1; i >= 0; i--) {
      if (!paraNodes.has(stack[i].node)) return stack[i].node;
    }
    return null;
  };
  const addNoteToHost = (note: NoteBlock) => {
    const host = sawHeading ? noteHost() : null;
    if (!host) { rootNotes.push(note); return; }
    host.notes = host.notes ?? [];
    host.notes.push(note);
  };

  // 노트를 붙일 현재 노드 — 견출 전이면 루트
  const addNote = (note: NoteBlock) => {
    if (!sawHeading || stack.length === 0) rootNotes.push(note);
    else {
      const cur = stack[stack.length - 1].node;
      cur.notes = cur.notes ?? [];
      cur.notes.push(note);
    }
  };

  // ---- blockPlacement 'node': 블록을 현재 노드의 본문에 넣는다 ----------
  // A4 분량(NODE_A4_CHARS, 이미지 1장=NODE_IMAGE_CHARS 환산)을 넘기는
  // 블록은 노트로 옮기고 stats.movedToNote 를 센다. 머리말(첫 견출 전)은
  // 붙일 노드가 없으므로 기존처럼 루트 노트다.
  const nodeCharCount = (n: MindNode): number => {
    const imgs = (n.images?.length ?? 0) + (n.image ? 1 : 0);
    return String(n.text || '').length + imgs * NODE_IMAGE_CHARS;
  };
  // 블록을 노드 본문에 넣었으면 true — false면 호출자가 노트로 처리한다.
  // extractLinks(기본 true): 노드 "본문"이 되는 텍스트는 일반 노드 텍스트와
  // 같은 하이퍼링크 규칙을 따른다 — [라벨](url)은 라벨만 남기고 URL은
  // 노드의 링크(🔗)로 첨부 (2026-07 수정: 인용문·표·체크 블록이 노드에
  // 들어갈 때 링크 원문이 그대로 노출되던 문제). 코드 블록은 원문 보존.
  // A4 초과로 "노트로" 가는 경우는 원문 유지 — 노트 뷰어가 클릭 가능한
  // <a>로 렌더링한다.
  const placeBlock = (
    blockText: string,
    note: () => NoteBlock,
    extractLinks = true,
  ): boolean => {
    if (!placeInNode) return false;
    if (!sawHeading || stack.length === 0) return false; // 머리말 → 루트 노트
    const cur = stack[stack.length - 1].node;
    if (nodeCharCount(cur) + blockText.length + 1 > NODE_A4_CHARS) {
      // A4 초과 — 이 블록부터 노트로 (데이터는 잃지 않는다)
      addNote(note());
      if (opts.stats) opts.stats.movedToNote += 1;
      return true; // 처리 완료 (노트로)
    }
    let body = blockText;
    if (extractLinks) {
      const { text, links, images } = stripLinks(blockText);
      body = text;
      mergeLinks(cur, links);
      mergeImages(cur, images);
    }
    if (!body) return true; // 링크만 있던 블록 — 링크 첨부로 충분
    cur.text = cur.text ? `${cur.text}\n${body}` : body;
    return true;
  };

  // ---- blockPlacement 'node': 경계가 확실한 블록은 자식 노드로 분리 -----
  //
  // 코드 펜스·표·이미지 문단처럼 **독립 블록**으로 놓인 콘텐츠는 현재
  // 노드의 본문에 합치지 않고 각각의 자식 노드로 만든다 (markmap 등
  // 다른 마인드맵과 동일한 변환 — 2026-07-31 사용자 결정). 반면 기사
  // 붙여넣기처럼 "텍스트 중간"에 섞인 사진·표는 한 노드 유지가 원칙 —
  // MD에서 그 형태는 발생하지 않으므로 여기서는 항상 분리한다.
  // 블록 바로 뒤의 인용문은 그 블록 노드의 본문 줄로 이어 붙는다
  // (flushQuote — 표 아래 "※ 첨부 …" 주석이 표와 함께 있도록).
  const attachBlockChild = (body: string, extractLinks: boolean): MindNode | null => {
    if (!placeInNode || !sawHeading || stack.length === 0) return null;
    const parent = stack[stack.length - 1].node;
    const node: MindNode = { id: nid(), text: body };
    if (extractLinks) {
      const { text, links, images } = stripLinks(body);
      node.text = text || (images.length ? imageFileName(images[0]) : '');
      mergeLinks(node, links);
      mergeImages(node, images);
    }
    if (!node.text.trim() && !node.images?.length) return null;
    parent.children = parent.children ?? [];
    parent.children.push(node);
    lastBlockNode = node;
    return node;
  };

  // ---- 누적 버퍼 (문단·표·인용문·코드) ------------------------------------
  let paraBuf: string[] = [];
  let tableBuf: string[] = [];
  let quoteBuf: string[] = [];
  let fenceBuf: string[] | null = null; // null = 펜스 밖
  let fenceLang = '';

  const flushPara = () => {
    if (!paraBuf.length) return;
    const text = paraBuf.join('\n').trim();
    paraBuf = [];
    if (!text) return;
    if (!sawHeading) {
      // 첫 견출 전의 **사진만 있는 문단** → 루트 사진 (2026-08-18, B17).
      // 내보내기가 `# 제목` 바로 아래에 루트 사진을 쓰므로, 이 갈래가
      // 없으면 돌아올 때 **사진 문법이 그대로 담긴 루트 노트**가 된다.
      const only = text.split('\n').map((l) => l.trim()).filter(Boolean);
      if (only.length && only.every(
        (l) => /^!\[[^\]]*\]\([^)\s]+(?:\s+"[^"]*")?\)$/.test(l) || BARE_IMAGE_URL_RE.test(l),
      )) {
        const { images } = stripLinks(text);
        for (const u of images) if (!rootImages.includes(u)) rootImages.push(u);
        return;
      }
      // 첫 견출 전의 머리말 문단 → 루트 노트
      rootNotes.push({ id: nid(), type: 'paragraph', text });
      return;
    }
    // "🔗 [라벨](url)" 링크 줄 — EasyMindMap 내보내기의 노드 링크 왕복:
    // 새 자식 노드가 아니라 현재 노드의 링크(🔗)로 되돌린다
    if (/^🔗\s/.test(text) && stack.length) {
      const { links } = stripLinks(text);
      if (links.length) {
        mergeLinks(stack[stack.length - 1].node, links);
        return;
      }
    }
    // 이미지뿐인 문단 — 모든 줄이 이미지 문법(![대체](url)) 또는 이미지
    // 확장자 URL이면 자식 노드가 아니라 현재 노드의 사진으로 붙인다
    // (내보내기가 견출 바로 아래에 쓰는 ![…](…) 형식의 왕복이자, 기사
    // 붙여넣기의 "글·사진 원문 순서" 규칙과 동일)
    const IMG_ONLY_LINE_RE = /^!\[[^\]]*\]\([^)\s]+(?:\s+"[^"]*")?\)$/;
    const paraLines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    if (
      stack.length && paraLines.length &&
      paraLines.every((l) => IMG_ONLY_LINE_RE.test(l) || BARE_IMAGE_URL_RE.test(l))
    ) {
      // 'node' 배치 — 독립 이미지도 각각의 자식 노드로 분리 (markmap
      // 파리티). 'note'(EMM 메타 왕복)는 현재 노드의 사진으로 폴딩.
      if (attachBlockChild(text, true)) return;
      const { links, images } = stripLinks(text);
      mergeImages(stack[stack.length - 1].node, images);
      mergeLinks(stack[stack.length - 1].node, links);
      // 원격이 아닌 이미지(files/ 경로 등)는 메타데이터·ZIP이 실제
      // 사진을 복원한다 — 대체 텍스트로 노드를 만들지 않는다
      return;
    }
    // longParagraphToNote — 긴 문단은 자식 노드가 아니라 현재 노드의 문단 노트
    // (2026-09-05). 짧은 문단은 지금까지처럼 자식 노드다.
    if (
      opts.longParagraphToNote && opts.longParagraphToNote > 0
      && text.length >= opts.longParagraphToNote && stack.length
    ) {
      addNoteToHost({ id: nid(), type: 'paragraph', text });
      if (opts.stats) opts.stats.movedToNote += 1;
      return;
    }
    // 순번 문단 섹션이 열려 있으면 그 하위로 (아니면 견출 하위)
    lastBlockNode = null;
    const depth = sectionDepth !== null ? sectionDepth + 1 : lastHeadingDepth + 1;
    if (attach(depth, text)) {
      paraDepth = depth;
      paraNodes.add(stack[stack.length - 1].node); // 문단 노드 — 노트 주인이 되지 않는다
    }
  };
  const flushTable = () => {
    if (!tableBuf.length) return;
    // 구분선(|---|) 제거 + 앞뒤 파이프 제거 — 노트 뷰어의 표 형식
    // ("셀 | 셀" 줄들)로 정규화한다.
    const rows = tableBuf
      .filter((r) => !TABLE_SEP_RE.test(r))
      .map((r) =>
        r.replace(/^\s*\|/, '').replace(/\|\s*$/, '')
          .split('|').map((c) => c.trim()).join(' | '),
      )
      .filter((r) => r.trim());
    tableBuf = [];
    if (!rows.length) return;
    // 표 — 기본(note)은 "표 노트", blockPlacement 'node'면 **각각의
    // 자식 노드**로 분리 (격자 렌더 — markmap 파리티, 2026-07-31)
    const tableText = rows.join('\n');
    if (!attachBlockChild(tableText, true)) {
      addNote({ id: nid(), type: 'table', text: tableText });
    }
  };
  const flushQuote = () => {
    if (!quoteBuf.length) return;
    const text = quoteBuf.join('\n').trim();
    quoteBuf = [];
    if (!text) return;
    // 인용문(문단) — 'node' 배치에서 직전 블록을 자식 노드로 분리했다면
    // 그 노드의 본문 줄로 이어 붙인다 (표 아래 "※ 첨부 …"가 표와 함께).
    // 아니면 현재 노드 본문에 줄로 합친다 (A4 초과 시 노트로 — placeBlock)
    if (placeInNode && lastBlockNode && sawHeading) {
      const { text: t, links, images } = stripLinks(text);
      if (t) lastBlockNode.text += `\n${t}`;
      mergeLinks(lastBlockNode, links);
      mergeImages(lastBlockNode, images);
      return;
    }
    if (!placeBlock(text, () => ({ id: nid(), type: 'paragraph', text }))) {
      addNote({ id: nid(), type: 'paragraph', text });
    }
  };
  const flushAll = () => {
    flushPara();
    flushTable();
    flushQuote();
  };

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');

    // 코드 펜스 — 내용은 현재 노드의 코드 노트로
    const fence = line.match(/^\s*```(.*)$/);
    if (fence) {
      if (fenceBuf === null) {
        flushAll();
        lastItem = null;
        fenceBuf = [];
        fenceLang = fence[1].trim();
      } else {
        const code = fenceBuf.join('\n');
        fenceBuf = null;
        if (code.trim()) {
          // 'node'면 **각각의 자식 노드**의 ``` 펜스(코드 패널 렌더)로
          // 분리 (markmap 파리티, 2026-07-31) — 원문 보존(링크 미추출)
          const block = '```' + (fenceLang || '') + '\n' + code + '\n```';
          // codeToNote — 자식 노드 대신 **가장 가까운 견출·불릿 노드**의 코드 노트
          if (opts.codeToNote) {
            addNoteToHost({ id: nid(), type: 'code_block', text: code, lang: fenceLang || undefined });
          } else if (!attachBlockChild(block, false)) {
            addNote({ id: nid(), type: 'code_block', text: code, lang: fenceLang || undefined });
          }
        }
      }
      continue;
    }
    if (fenceBuf !== null) { fenceBuf.push(raw); continue; }

    // 표 행 (| … |) — 연속 행을 한 덩어리로
    if (/^\s*\|.*\|\s*$/.test(line)) {
      flushPara();
      flushQuote();
      lastItem = null;
      tableBuf.push(line.trim());
      continue;
    }
    if (tableBuf.length) flushTable();

    // 인용문
    const quote = line.match(/^\s*>\s?(.*)$/);
    if (quote) {
      flushPara();
      lastItem = null;
      quoteBuf.push(quote[1]);
      continue;
    }
    if (quoteBuf.length) flushQuote();

    if (!line.trim()) { flushPara(); continue; }

    // 수평선
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      flushPara(); lastItem = null; lastBlockNode = null;
      sectionDepth = null; paraDepth = null;
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      flushAll();
      lastItem = null;
      lastBlockNode = null;
      sectionDepth = null;
      paraDepth = null;
      const level = heading[1].length; // 1~6
      const text = heading[2].trim();
      if (level === 1 && !rootText && !sawHeading) {
        // 파일 첫 H1만 제목(루트) — 이후의 H1은 아래에서 2레벨 견출로
        rootText = stripLinks(text).text;
        title = rootText;
        stack.length = 0;
        lastHeadingDepth = 0;
        continue;
      }
      // 본문에 H1을 쓰는 파일(h1Mode)은 # = 2레벨, ## = 3레벨 …로 한
      // 단계씩 내려 계층을 보존한다. 일반 파일은 ## = 2레벨 (기존과 동일).
      const depth = h1Mode ? Math.min(level, 6) : Math.max(1, level - 1);
      attach(depth, text);
      lastHeadingDepth = depth;
      sawHeading = true;
      continue;
    }

    // 체크리스트(- [ ] / - [x]) — 자식 노드가 아니라 현재 노드의
    // 체크리스트 노트로. 불릿보다 먼저 검사한다 (markmap 호환 왕복).
    const check = line.match(/^[ \t]*[-*+]\s+\[([ xX])\]\s+(.+)$/);
    if (check) {
      flushPara();
      lastItem = null;
      const checked = check[1].toLowerCase() === 'x';
      const itemText = check[2].trim();
      // 'node'면 노드 본문의 체크 줄(- [x] — 체크박스 글리프 렌더)로
      const chkBlock = `- [${checked ? 'x' : ' '}] ${itemText}`;
      if (!placeBlock(chkBlock, () =>
        ({ id: nid(), type: 'checklist', text: itemText, checked }))) {
        addNote({ id: nid(), type: 'checklist', text: itemText, checked });
      }
      continue;
    }

    // 리스트(- * +) 또는 순번(1. / 1)) 항목 — 순번은 번호를 텍스트에 유지
    const bullet = line.match(/^([ \t]*)([-*+]|\d+[.)])\s+(.+)$/);
    if (bullet) {
      flushPara();
      lastBlockNode = null;
      const indent = bullet[1].replace(/\t/g, '  ').length;
      const indentLevel = Math.floor(indent / 2);
      const marker = bullet[2];
      const ordered = /^\d/.test(marker);
      const text = ordered ? `${marker} ${bullet[3].trim()}` : bullet[3].trim();
      let node: MindNode | null;
      if (ordered && indentLevel === 0) {
        // 들여쓰기 없는 순번 항목 = 절 머리 (다음 문단들이 이 하위로)
        const depth = lastHeadingDepth + 1;
        node = attach(depth, text);
        sectionDepth = node ? depth : null;
        paraDepth = null;
      } else {
        // 불릿(그리고 들여쓴 순번)은 직전 문단 → 순번 절 → 견출 순의
        // 기준에 상대적으로 붙는다 ("Apache 설정 파일 수정" 문단 아래의
        // "- DocumentRoot: …" 불릿이 그 문단의 하위가 되도록)
        const base = paraDepth ?? (sectionDepth !== null ? sectionDepth : lastHeadingDepth);
        node = attach(base + 1 + indentLevel, text);
      }
      lastItem = node ? { node, indent } : null;
      continue;
    }

    // 리스트 항목의 들여쓴 연속 줄 — 항목 노드의 추가 줄로 합친다
    // (예: "1. 원본 파일 복사" 아래의 "   예: `견적서.xlsx` → …")
    if (lastItem && /^[ \t]{2,}\S/.test(raw)) {
      const { text, links, images } = stripLinks(line.trim());
      if (text) {
        lastItem.node.text += `\n${text}`;
        mergeLinks(lastItem.node, links);
      }
      mergeImages(lastItem.node, images);
      continue;
    }
    if (lastItem && paraBuf.length === 0) lastItem = null;

    // 일반 문단 — 연속 줄을 모아 한 노드로
    paraBuf.push(line.trim());
  }
  flushAll();
  if (fenceBuf !== null && fenceBuf.join('\n').trim()) {
    // 닫는 펜스 없이 끝난 코드 — 같은 배치 규칙 적용
    const tail = fenceBuf.join('\n');
    const tailBlock = '```' + (fenceLang || '') + '\n' + tail + '\n```';
    if (!attachBlockChild(tailBlock, false)) {
      addNote({ id: nid(), type: 'code_block', text: tail });
    }
  }

  if (!rootText && branches.length === 0) return null; // 인식할 구조 없음

  // 1레벨 가지 좌/우 배분 — 문서 순서대로 앞 절반 오른쪽, 뒤 절반 왼쪽.
  // 전부 'right'로 두면 '방사형·양쪽' 레이아웃이 좌우로 나눌 가지가 없어
  // 방사형·오른쪽과 똑같이 보인다 (2026-07 버그). 트리·계층형 등 다른
  // 레이아웃은 side를 무시하므로 영향이 없다.
  if (branches.length >= 2) {
    const half = Math.ceil(branches.length / 2);
    branches.forEach((b, i) => { b.side = i < half ? 'right' : 'left'; });
  }

  return {
    title,
    root: {
      id: 'root',
      text: rootText || title,
      colorKey: 'root',
      side: 'center',
      ...(rootNotes.length ? { notes: rootNotes } : {}),
      // 루트 사진 — 내보낼 때 `# 제목` 아래에 쓴 것을 되돌린다 (B17)
      ...(rootImages.length
        ? { images: rootImages.map((src) => ({ src, w: 0, h: 0, afterLine: 0 })) }
        : {}),
    } as SampleMap['root'],
    branches,
  };
}

// EMM 공개 API 별칭 — parseEmm(md) : 제목 폴백은 'mindmap'
import type { EmmMap } from './model';
export function parseEmm(
  md: string,
  fallbackTitle = 'mindmap',
  opts: ParseEmmOptions = {},
): EmmMap | null {
  return parseMarkdownToMap(md, fallbackTitle, opts);
}
