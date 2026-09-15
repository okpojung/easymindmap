// MD 내보내기 → 불러오기 왕복 (2026-09-15, 메타데이터 주석 폐기 뒤).
//
// MD 가 맵에 대해 말하는 것은 본문 + 제목 아래 ```emm 선언뿐이다. 이 파일은
// ① 선언이 맵 설정·레이아웃으로 돌아오고 ② 리스트 표시(mdForm)·여러 줄
// 노드가 두 번째 내보내기에서도 유지되며 ③ 선언 블록이 왕복마다 늘지
// 않는지 지킨다.
//   node scripts/run-vite-test.mjs src/utils/importMapFile.test.ts

import { buildEmmBody } from '@emm/serialize';
import { parseMarkdownMapFile } from './importMapFile';
import { declareFromMap } from './emmDeclaration';
import type { MindNode, SampleMap } from '@/editor/__samples__/types';

let failed = 0;
function check(name: string, got: unknown, want: unknown): void {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  const ok = g === w;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      받음 ${g}\n      기대 ${w}`}`);
}

const exportMd = (map: SampleMap, layout = 'tree-right', mapId?: string) =>
  buildEmmBody(map, [], { declaration: declareFromMap(map, layout as never, mapId) });
const body = (md: string) => md.split('\n').filter(Boolean);

// ── ① 선언 왕복 — 레벨별 레이아웃·도형·글자 크기 ─────────────────────
{
  const map: SampleMap = {
    title: '선언',
    root: { id: 'root', text: '선언', colorKey: 'root', side: 'center' },
    branches: [{ id: 'b1', text: '가지', colorKey: 'l1A', side: 'right', children: [{ id: 'c1', text: '하위' } as MindNode] }],
    settings: {
      levelLayouts: [null, 'process-tree-right', 'tree-right', 'tree-right', 'tree-right'],
      levelShapes: ['rounded', 'rectangle', 'rectangle', 'rectangle', 'rectangle'],
      levelFonts: [{ size: 20 }, { size: 16 }, { size: 14 }, { size: 14 }, { size: 14 }],
    },
  } as SampleMap;
  const md = exportMd(map, 'tree-right', 'map123');
  check('① 선언 블록 — 같은 값이 이어지는 레벨은 적지 않는다', body(md).slice(1, 15), [
    '```emm', 'map: map123', 'levels:',
    '  1:', '    layout: tree-right', '    shape: rounded', '    font: 16',
    '  2:', '    layout: process-tree-right', '    shape: rectangle', '    font: 14',
    '  3:', '    layout: tree-right', '```',
  ]);
  const back = parseMarkdownMapFile(md, '대체')!;
  check('① 맵 전체 레이아웃', back.editor?.layoutType, 'tree-right');
  check('① 레벨별 레이아웃 (2레벨 = [1])', back.map.settings?.levelLayouts, [null, 'process-tree-right', 'tree-right', 'tree-right', 'tree-right']);
  check('① 레벨별 도형', back.map.settings?.levelShapes, ['rounded', 'rectangle', 'rectangle', 'rectangle', 'rectangle']);
  check('① 레벨별 글자 크기 ([0]=루트는 비어 있다)', back.map.settings?.levelFonts?.map((f) => f?.size ?? null), [null, 16, 14, 14, 14]);
  // 레벨은 중심(루트)이 1레벨 — 가지가 2레벨, 그 하위가 3레벨 (levelLayouts[lv-1])
  check('① 2레벨(가지)·3레벨(하위) 노드에 레이아웃이 실제로 박힌다',
    [(back.map.branches[0] as { layoutType?: string }).layoutType, (back.map.branches[0].children![0] as { layoutType?: string }).layoutType],
    ['process-tree-right', 'tree-right']);
  check('① 선언은 루트의 emm 노트로 보인다', (back.map.root.notes ?? []).map((n) => (n as { lang?: string }).lang), ['emm']);
  const md2 = exportMd(back.map, back.editor!.layoutType, 'map123');
  check('① 두 번째 내보내기도 같은 파일 (선언 블록 1개)', md2, md);
}

// ── ② 리스트 표시·여러 줄 노드가 두 번째 내보내기에서도 유지된다 ─────────
{
  const NODE = { blockPlacement: 'node' as const };
  const first = parseMarkdownMapFile('# 목록\n\n## 절\n- a\n- b\n  - b1\n\n### 소절\n\n> 둘째 줄\n', '목록', NODE)!;
  const kids = first.map.branches[0].children!;
  check('② 리스트 출신 노드에 mdForm', kids.map((k) => (k as { mdForm?: string }).mdForm ?? '-'), ['list', 'list', '-']);
  const out1 = exportMd(first.map);
  check('② 첫 내보내기 — 리스트·인용문 그대로', body(out1).filter((l) => !l.startsWith('```') && !/^(levels:|  1:|    layout)/.test(l)),
    ['# 목록', '## 절', '- a', '- b', '  - b1', '### 소절', '> 둘째 줄']);
  const second = parseMarkdownMapFile(out1, '목록', NODE)!;
  check('② 다시 읽어도 mdForm', second.map.branches[0].children!.map((k) => (k as { mdForm?: string }).mdForm ?? '-'), ['list', 'list', '-']);
  check('② 소절의 줄바꿈', second.map.branches[0].children![2].text, '소절\n둘째 줄');
  check('② 두 번째 내보내기 동일', exportMd(second.map), out1);
}

// ── ③ 선언 없는 손글씨 MD 도 같은 길 ───────────────────────────────
{
  const back = parseMarkdownMapFile('# 손글씨\n\n## 하나\n\n## 둘\n', '손글씨')!;
  check('③ source', back.source, 'plain-md');
  check('③ 레이아웃 선언 없음 → editor 없음', back.editor, undefined);
  check('③ 가지', back.map.branches.map((b) => b.text), ['하나', '둘']);
}

if (failed) { console.log(`\n${failed} FAIL`); process.exit(1); }
console.log('\n모두 통과');
