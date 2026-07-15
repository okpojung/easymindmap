// importMarkdown — 로컬 Markdown 파일을 맵으로 변환한다 ('새 맵' 메뉴).
// docs/04-extensions/import-export/20-export.md의 Basic 포맷을 따른다:
//
//   # 제목            → 루트(중심 주제) · 맵 제목
//   ## 견출          → 2레벨, ### → 3레벨 … (###### → 6레벨)
//   - 리스트 항목     → 마지막 견출의 하위 (들여쓰기 2칸/탭 = 한 단계 아래)
//
// 코드 펜스(```) 안은 건너뛰고, 일반 문단 텍스트는 무시한다(후속: 노트로
// 수용 예정).

import type { SampleMap, SampleBranch, MindNode, NodeColorKey } from '@/editor/__samples__/types';

const BRANCH_COLORS: NodeColorKey[] = ['l1A', 'l1B', 'l1C', 'l1D', 'l1E'];

export function parseMarkdownToMap(md: string, fallbackTitle: string): SampleMap | null {
  const lines = String(md || '').replace(/\r\n?/g, '\n').split('\n');
  let title = fallbackTitle;
  let rootText = '';
  const branches: SampleBranch[] = [];
  let seq = 0;
  const nid = () => `md-${Date.now()}-${seq++}`;

  // 현재 트리 경로 (depth 오름차순, 루트 제외 — depth 1부터)
  const stack: { depth: number; node: MindNode }[] = [];
  // 리스트 항목의 기준이 되는 마지막 견출 깊이 (## = 1)
  let lastHeadingDepth = 0;

  const attach = (depth: number, text: string) => {
    if (depth < 1) return;
    while (stack.length && stack[stack.length - 1].depth >= depth) stack.pop();

    if (depth === 1) {
      const branch: SampleBranch = {
        id: nid(),
        text,
        colorKey: BRANCH_COLORS[branches.length % BRANCH_COLORS.length],
        side: 'right',
      };
      branches.push(branch);
      stack.push({ depth, node: branch });
      return;
    }
    const parent = stack[stack.length - 1];
    if (!parent) return; // 상위 견출 없이 깊은 항목이 나오면 버린다
    const node: MindNode = { id: nid(), text };
    parent.node.children = parent.node.children ?? [];
    parent.node.children.push(node);
    stack.push({ depth, node });
  };

  let inFence = false;
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    if (/^\s*```/.test(line)) { inFence = !inFence; continue; }
    if (inFence || !line.trim()) continue;

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length; // 1~6
      const text = heading[2].trim();
      if (level === 1 && !rootText) {
        rootText = text;
        title = text;
        stack.length = 0;
        lastHeadingDepth = 0;
        continue;
      }
      const depth = level - 1; // ## = 1레벨(루트의 자식)
      attach(depth, text);
      lastHeadingDepth = depth;
      continue;
    }

    const bullet = line.match(/^([ \t]*)[-*+]\s+(.+)$/);
    if (bullet) {
      const indent = bullet[1].replace(/\t/g, '  ').length;
      const indentLevel = Math.floor(indent / 2);
      attach(lastHeadingDepth + 1 + indentLevel, bullet[2].trim());
      continue;
    }
    // 일반 문단 등은 무시 (후속: 직전 노드의 노트로 수용)
  }

  if (!rootText && branches.length === 0) return null; // 인식할 구조 없음

  return {
    title,
    root: { id: 'root', text: rootText || title, colorKey: 'root', side: 'center' },
    branches,
  };
}
