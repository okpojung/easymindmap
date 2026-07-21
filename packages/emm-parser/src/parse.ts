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
  NodeLink,
  NoteBlock,
} from './model';

const BRANCH_COLORS: NodeColorKey[] = ['l1A', 'l1B', 'l1C', 'l1D', 'l1E'];

// Markdown 링크/이미지 — [라벨](url) / ![대체](경로). 제목("title") 허용.
const MD_LINK_RE = /(!?)\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

// 표 구분선 행 — | --- | :--: | 등
const TABLE_SEP_RE = /^[\s|:\-]+$/;

export function parseMarkdownToMap(md: string, fallbackTitle: string): SampleMap | null {
  const lines = String(md || '').replace(/\r\n?/g, '\n').split('\n');

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
  let seq = 0;
  const nid = () => `md-${Date.now()}-${seq++}`;

  // 노드 텍스트에서 [라벨](url)을 라벨로 바꾸고 URL은 링크로 모은다.
  // 이미지 문법(![..](..))은 대체 텍스트만 남긴다.
  const stripLinks = (raw: string): { text: string; links: NodeLink[] } => {
    const links: NodeLink[] = [];
    let text = String(raw);
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
        const shown = (label || url).trim();
        if (!bang && /^https?:\/\//i.test(url) && !links.some((l) => l.url === url)) {
          links.push({ id: nid(), url, label: label.trim() || undefined });
        }
        return shown;
      });
      if (next === text) break;
      text = next;
    }
    // Markdown 백슬래시 이스케이프 해제 — "1\." "\-" 같은 표기를
    // 원래 문자로 (ChatGPT 내보내기가 자주 씀)
    text = text.replace(/\\([\\`*_{}[\]()#+\-.!|~])/g, '$1');
    return { text: text.trim(), links };
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
  // "순번 문단 섹션" — 들여쓰기 없는 순번 항목("1. WEB 서버 …")은 절
  // 머리 역할을 한다: 다음 순번/견출 전까지의 문단이 그 하위로 붙는다
  // (ChatGPT 답변처럼 견출 없이 "1. 제목" + 본문 문단으로 쓰는 문서)
  let sectionDepth: number | null = null;
  // 마지막 문단 노드의 깊이 — 문단 뒤의 불릿(-,*)은 그 문단의 하위로
  let paraDepth: number | null = null;

  const attach = (depth: number, rawText: string): MindNode | null => {
    if (depth < 1 || !rawText.trim()) return null;
    const { text, links } = stripLinks(rawText);
    if (!text) return null;
    while (stack.length && stack[stack.length - 1].depth >= depth) stack.pop();

    if (depth === 1 || stack.length === 0) {
      const branch: SampleBranch = {
        id: nid(),
        text,
        colorKey: BRANCH_COLORS[branches.length % BRANCH_COLORS.length],
        side: 'right',
      };
      mergeLinks(branch, links);
      branches.push(branch);
      // 빈 스택에 깊은 견출(## 등)이 오면 그 깊이 그대로 기억해 둔다 —
      // 같은 레벨의 다음 견출이 자식이 아니라 형제가 되도록.
      stack.push({ depth, node: branch });
      return branch;
    }
    const parent = stack[stack.length - 1];
    const node: MindNode = { id: nid(), text };
    mergeLinks(node, links);
    parent.node.children = parent.node.children ?? [];
    parent.node.children.push(node);
    stack.push({ depth, node });
    return node;
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
      // 첫 견출 전의 머리말 문단 → 루트 노트
      rootNotes.push({ id: nid(), type: 'paragraph', text });
      return;
    }
    // 순번 문단 섹션이 열려 있으면 그 하위로 (아니면 견출 하위)
    const depth = sectionDepth !== null ? sectionDepth + 1 : lastHeadingDepth + 1;
    if (attach(depth, text)) paraDepth = depth;
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
    // 표는 노드 내용이 아니라 "표 노트"로 — 직전 노드(문단/견출)에 붙는다
    addNote({ id: nid(), type: 'table', text: rows.join('\n') });
  };
  const flushQuote = () => {
    if (!quoteBuf.length) return;
    const text = quoteBuf.join('\n').trim();
    quoteBuf = [];
    if (text) addNote({ id: nid(), type: 'paragraph', text });
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
          addNote({ id: nid(), type: 'code_block', text: code, lang: fenceLang || undefined });
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
      flushPara(); lastItem = null; sectionDepth = null; paraDepth = null;
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      flushAll();
      lastItem = null;
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

    // 리스트(- * +) 또는 순번(1. / 1)) 항목 — 순번은 번호를 텍스트에 유지
    const bullet = line.match(/^([ \t]*)([-*+]|\d+[.)])\s+(.+)$/);
    if (bullet) {
      flushPara();
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
      const { text, links } = stripLinks(line.trim());
      if (text) {
        lastItem.node.text += `\n${text}`;
        mergeLinks(lastItem.node, links);
      }
      continue;
    }
    if (lastItem && paraBuf.length === 0) lastItem = null;

    // 일반 문단 — 연속 줄을 모아 한 노드로
    paraBuf.push(line.trim());
  }
  flushAll();
  if (fenceBuf !== null && fenceBuf.join('\n').trim()) {
    addNote({ id: nid(), type: 'code_block', text: fenceBuf.join('\n') });
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
    } as SampleMap['root'],
    branches,
  };
}

// EMM 공개 API 별칭 — parseEmm(md) : 제목 폴백은 'mindmap'
import type { EmmMap } from './model';
export function parseEmm(md: string, fallbackTitle = 'mindmap'): EmmMap | null {
  return parseMarkdownToMap(md, fallbackTitle);
}
