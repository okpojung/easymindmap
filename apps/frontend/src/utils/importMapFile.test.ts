// 빈 노드가 있는 EasyMindMap MD(메타데이터 있음) 왕복 (2026-09-15).
//
// enrich 는 본문을 다시 읽은 트리 구조를 따르고 노드 글자(nodeHeadingText /
// flatKey)로 메타데이터의 스타일·노트를 찾아 붙인다. 빈 노드가 여럿이면
// 전부 키 '' 를 공유한다 — 같은 키의 노드는 **순서대로 소비**되므로 스타일이
// 뒤바뀌지 않아야 한다. 이 파일이 그것을 지킨다.
//   npx tsx src/utils/importMapFile.test.ts

import { serializeEmm } from '@emm/serialize';
import { parseMarkdownMapFile } from './importMapFile';
import type { MindNode, SampleMap } from '@/editor/__samples__/types';

let failed = 0;
function check(name: string, got: unknown, want: unknown): void {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  const ok = g === w;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      받음 ${g}\n      기대 ${w}`}`);
}

const node = (id: string, text: string, extra: Partial<MindNode> = {}, children: MindNode[] = []): MindNode =>
  ({ id, text, children, ...extra } as MindNode);

// 빈 노드 둘 — 스타일이 서로 다르고, 하나는 노트도 있다. 사이에 이름 있는
// 노드를 끼워 순서가 섞이면 드러나게 한다.
const map: SampleMap = {
  title: '왕복',
  root: { id: 'root', text: '왕복', colorKey: 'root', side: 'center' },
  branches: [
    {
      id: 'b1', text: '가지', colorKey: 'l1A', side: 'right',
      children: [
        node('e1', '', { style: { fill: '#FF0000' } as never, notes: [{ id: 'n1', type: 'paragraph', text: '첫 빈 노드의 노트' }] as never }, [node('c1', '하위 1')]),
        node('m1', '가운데'),
        node('e2', '', { style: { fill: '#0000FF' } as never }, [node('c2', '하위 2')]),
      ],
    },
  ],
} as SampleMap;

const { markdown } = serializeEmm(map, { layoutType: 'radial-bidirectional' as never });
check('내보낸 본문에 행 끝 공백이 없다', markdown.split('\n').filter((l) => /[ \t]+$/.test(l)), []);
check('빈 노드는 `###` 로 나간다', markdown.split('\n').filter((l) => l === '###').length, 2);

const back = parseMarkdownMapFile(markdown, '대체 제목');
check('EasyMindMap MD 로 인식한다', back?.source, 'easymindmap-md');
const kids = back!.map.branches[0].children!;
check('트리 순서가 그대로다', kids.map((k) => [k.text, (k.children ?? []).map((c) => c.text)]),
  [['', ['하위 1']], ['가운데', []], ['', ['하위 2']]]);
check('첫 빈 노드의 스타일', (kids[0] as { style?: { fill?: string } }).style?.fill, '#FF0000');
check('둘째 빈 노드의 스타일 (뒤바뀌지 않는다)', (kids[2] as { style?: { fill?: string } }).style?.fill, '#0000FF');
check('첫 빈 노드의 노트', (kids[0].notes ?? []).map((n) => n.text), ['첫 빈 노드의 노트']);
check('둘째 빈 노드에는 노트가 없다', (kids[2].notes ?? []).length, 0);

// ── 리스트 항목(`- 항목`)으로 불러온 노드는 다시 리스트로 나간다 (2026-09-15) ──
// 파서가 남긴 mdForm 표시가 enrich(메타데이터 합치기)를 지나도 살아남아야
// 두 번째 내보내기에서도 `- 항목` 이 `### 항목` 으로 바뀌지 않는다.
{
  const first = parseMarkdownMapFile('# 목록\n\n## 절\n- a\n- b\n  - b1\n\n### 소절\n', '목록')!;
  const kids = first.map.branches[0].children!;
  check('리스트 출신 노드에 mdForm 이 있다', kids.map((k) => (k as { mdForm?: string }).mdForm ?? '-'), ['list', 'list', '-']);
  const out1 = serializeEmm(first.map, { layoutType: 'radial-bidirectional' as never }).markdown;
  const bodyOf = (md: string) => md.split('\n').filter((l) => l && !l.startsWith('<!--') && !/^[A-Za-z0-9+/=]+$/.test(l) && l !== '-->');
  check('첫 내보내기 — 리스트 그대로', bodyOf(out1).slice(0, 6), ['# 목록', '## 절', '- a', '- b', '  - b1', '### 소절']);
  const second = parseMarkdownMapFile(out1, '목록')!;
  check('메타데이터 있는 파일로 다시 읽어도 mdForm 이 남는다',
    second.map.branches[0].children!.map((k) => (k as { mdForm?: string }).mdForm ?? '-'), ['list', 'list', '-']);
  const out2 = serializeEmm(second.map, { layoutType: 'radial-bidirectional' as never }).markdown;
  check('두 번째 내보내기도 리스트', bodyOf(out2).slice(0, 6), bodyOf(out1).slice(0, 6));
}

// ── 여러 줄 노드 — 본문에 `>` 로 나가고, 옛 한 줄 파일도 메타데이터와 짝지어진다 (2026-09-15) ──
{
  const multi: SampleMap = {
    title: '여러 줄',
    root: { id: 'root', text: '여러 줄', colorKey: 'root', side: 'center' },
    branches: [
      { id: 'b1', text: '8. 기대 결과\n첫 줄\n\n둘째 줄', colorKey: 'l1A', side: 'right', style: { fill: '#00FF00' } as never, children: [] },
    ],
  } as SampleMap;
  const out = serializeEmm(multi, { layoutType: 'radial-bidirectional' as never }).markdown;
  const body = out.split('<!--')[0].split('\n').filter(Boolean);
  check('여러 줄 노드 — 제목 첫 줄 + `>` 인용문', body, ['# 여러 줄', '## 8. 기대 결과', '> 첫 줄', '>', '> 둘째 줄']);
  const back = parseMarkdownMapFile(out, '여러 줄')!;
  check('다시 읽으면 줄바꿈 그대로 + 스타일 복원', [back.map.branches[0].text, (back.map.branches[0] as { style?: { fill?: string } }).style?.fill],
    ['8. 기대 결과\n첫 줄\n\n둘째 줄', '#00FF00']);
  // 예전 내보내기(한 줄 견출 `## 8. 기대 결과 첫 줄 둘째 줄`)로 된 파일도 flatKey 폴백으로 짝지어진다
  const oldStyle = out.replace(/## 8\. 기대 결과\n\n> 첫 줄\n>\n> 둘째 줄/, '## 8. 기대 결과 첫 줄 둘째 줄');
  check('옛 파일 형식이 실제로 한 줄이다', oldStyle.split('<!--')[0].split('\n').filter(Boolean), ['# 여러 줄', '## 8. 기대 결과 첫 줄 둘째 줄']);
  const backOld = parseMarkdownMapFile(oldStyle, '여러 줄')!;
  check('옛 한 줄 파일도 메타데이터로 원문·스타일 복원', [backOld.map.branches[0].text, (backOld.map.branches[0] as { style?: { fill?: string } }).style?.fill],
    ['8. 기대 결과\n첫 줄\n\n둘째 줄', '#00FF00']);
}

if (failed) { console.log(`\n${failed} FAIL`); process.exit(1); }
console.log('\n모두 통과');
