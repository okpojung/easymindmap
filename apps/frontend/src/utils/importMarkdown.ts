// importMarkdown — 로컬 Markdown 파일을 맵으로 변환한다 ('새 맵' 메뉴).
// docs/04-extensions/import-export/20-export.md의 Basic 포맷 + 완전 변환:
//
//   # 제목             → 루트(중심 주제) · 맵 제목
//   (첫 견출 전의 인용문·문단) → 루트의 문단 노트 (머리말 처리)
//   ## 견출            → 2레벨, ### → 3레벨 … (###### → 6레벨)
//   - 리스트 / 1. 순번  → 마지막 견출의 하위 (들여쓰기 2칸/탭 = 한 단계)
//   일반 문단           → 마지막 견출의 하위 노드 (연속 줄은 한 노드로)
//   | 표 | 행 |         → 표 전체를 텍스트로 담은 하위 노드
//                        (에디터가 노드 안 Markdown 표로 렌더링)
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
  NoteBlock,
} from '@/editor/__samples__/types';

const BRANCH_COLORS: NodeColorKey[] = ['l1A', 'l1B', 'l1C', 'l1D', 'l1E'];

export function parseMarkdownToMap(md: string, fallbackTitle: string): SampleMap | null {
  const lines = String(md || '').replace(/\r\n?/g, '\n').split('\n');
  let title = fallbackTitle;
  let rootText = '';
  const branches: SampleBranch[] = [];
  const rootNotes: NoteBlock[] = [];
  let seq = 0;
  const nid = () => `md-${Date.now()}-${seq++}`;

  // 현재 트리 경로 (depth 오름차순, 루트 제외 — depth 1부터)
  const stack: { depth: number; node: MindNode }[] = [];
  // 리스트/문단/표의 기준이 되는 마지막 견출 깊이 (## = 1)
  let lastHeadingDepth = 0;
  let sawHeading = false;

  const attach = (depth: number, text: string) => {
    if (depth < 1 || !text.trim()) return;
    while (stack.length && stack[stack.length - 1].depth >= depth) stack.pop();

    if (depth === 1 || stack.length === 0) {
      const branch: SampleBranch = {
        id: nid(),
        text,
        colorKey: BRANCH_COLORS[branches.length % BRANCH_COLORS.length],
        side: 'right',
      };
      branches.push(branch);
      stack.push({ depth: 1, node: branch });
      return;
    }
    const parent = stack[stack.length - 1];
    const node: MindNode = { id: nid(), text };
    parent.node.children = parent.node.children ?? [];
    parent.node.children.push(node);
    stack.push({ depth, node });
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
    attach(lastHeadingDepth + 1, text);
  };
  const flushTable = () => {
    if (!tableBuf.length) return;
    const text = tableBuf.join('\n').trim();
    tableBuf = [];
    if (!text) return;
    if (!sawHeading) {
      rootNotes.push({ id: nid(), type: 'table', text });
      return;
    }
    // 표 전체를 하위 노드 하나에 담는다 — 에디터가 노드 안 MD 표로 그림
    attach(lastHeadingDepth + 1, text);
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
      tableBuf.push(line.trim());
      continue;
    }
    if (tableBuf.length) flushTable();

    // 인용문
    const quote = line.match(/^\s*>\s?(.*)$/);
    if (quote) {
      flushPara();
      quoteBuf.push(quote[1]);
      continue;
    }
    if (quoteBuf.length) flushQuote();

    if (!line.trim()) { flushPara(); continue; }

    // 수평선
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { flushPara(); continue; }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      flushAll();
      const level = heading[1].length; // 1~6
      const text = heading[2].trim();
      if (level === 1 && !rootText) {
        rootText = text;
        title = text;
        stack.length = 0;
        lastHeadingDepth = 0;
        continue;
      }
      const depth = level - 1; // ## = depth 1 (루트 직계 = 표시 2레벨)
      attach(depth, text);
      lastHeadingDepth = depth;
      sawHeading = true;
      continue;
    }

    // 리스트(- * +) 또는 순번(1. / 1)) 항목
    const bullet = line.match(/^([ \t]*)(?:[-*+]|\d+[.)])\s+(.+)$/);
    if (bullet) {
      flushPara();
      const indent = bullet[1].replace(/\t/g, '  ').length;
      const indentLevel = Math.floor(indent / 2);
      attach(lastHeadingDepth + 1 + indentLevel, bullet[2].trim());
      continue;
    }

    // 일반 문단 — 연속 줄을 모아 한 노드로
    paraBuf.push(line.trim());
  }
  flushAll();
  if (fenceBuf !== null && fenceBuf.join('\n').trim()) {
    addNote({ id: nid(), type: 'code_block', text: fenceBuf.join('\n') });
  }

  if (!rootText && branches.length === 0) return null; // 인식할 구조 없음

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
