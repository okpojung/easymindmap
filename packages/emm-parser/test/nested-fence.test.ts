// 코드 안의 ``` 를 살려 내보내고 되읽는다 (2026-09-29 실제 보고).
//
// 용어집처럼 "```emm … ```" 예시를 코드블록으로 담은 문서를 mmd 로 내보냈다
// 되읽으면, 안쪽 ``` 이 바깥 펜스를 먼저 닫아 뒤의 코드가 본문으로 새고
// `# 제목` 줄마다 중심주제가 생겼다(2847 노드 맵 → 중심 209개·노드 1521개).
// 지키는 것: ① 긴 펜스(````)로 감싼 코드는 안쪽 ``` 까지 통째로 한 노트다
// ② 내보내기는 코드 안의 백틱 줄보다 긴 펜스를 고른다 ③ 왕복해도 중심·노드
// 수와 노트 본문이 그대로다 ④ 노드 본문(노드로 배치)의 코드도 같다.
//   npx tsx test/nested-fence.test.ts

import { parseMarkdownToMap } from '../src/parse';
import { buildEmmBody, splitNodeBody } from '../src/serialize';
import { fenceFor, fencedBlock } from '../src/fence';
import { countMapNodes } from '../src/meta';
import { mapCenters } from '../src/model';

let failed = 0;
function check(name: string, got: unknown, want: unknown): void {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) { console.log(`  ok  ${name}`); return; }
  failed++;
  console.log(`  FAIL ${name}\n       got  ${g}\n       want ${w}`);
}

const inner = ['```emm', 'map: 7f3a9c', 'levels:', '  1:', '    layout: tree-right', '```'].join('\n');

// ── ① 긴 펜스로 감싼 코드 — 안쪽 ``` 은 코드다 ───────────────────────
{
  const md = ['# 용어집', '', '## 가지', '', '````', inner, '````', '', '# 프로젝트 A', ''].join('\n');
  const map = parseMarkdownToMap(md, 'x', { codeToNote: true })!;
  check('① 중심주제는 둘(용어집·프로젝트 A) — 코드 안 줄로 늘지 않는다', mapCenters(map).length, 2);
  const note = map.branches[0].notes?.find((n) => n.type === 'code_block');
  check('① 코드 노트 본문에 안쪽 ```emm … ``` 이 그대로', note?.text, inner);
}

// ── ② 내보내기 펜스 길이 ────────────────────────────────────────────
check('② 백틱 없는 코드 → ```', fenceFor('a\nb'), '```');
check('② ``` 이 든 코드 → ````', fenceFor(inner), '````');
check('② ```` 이 든 코드 → `````', fenceFor('````\nx\n````'), '`````');
check('② fencedBlock 은 언어 뒤에 코드, 같은 길이로 닫는다', fencedBlock('x', 'sql'), '```sql\nx\n```');

// ── ③ 왕복 — 노트 코드 ───────────────────────────────────────────────
{
  const map = {
    title: '용어집',
    root: { id: 'root', text: '용어집' },
    branches: [{
      id: 'b1', text: '가지',
      notes: [{ id: 'n1', type: 'code_block' as const, text: inner, lang: 'markdown' }],
    }],
  };
  const md = buildEmmBody(map as never, []);
  check('③ 내보낸 문서는 ````markdown 펜스를 쓴다', md.includes('````markdown\n' + inner + '\n````'), true);
  const back = parseMarkdownToMap(md, 'x', { codeToNote: true })!;
  check('③ 되읽은 중심 수 1', mapCenters(back).length, 1);
  check('③ 되읽은 노드 수 2', countMapNodes(back), 2);
  check('③ 되읽은 코드 노트 본문 그대로', back.branches[0].notes?.[0]?.text, inner);
  check('③ 되읽은 코드 노트 언어 그대로', back.branches[0].notes?.[0]?.lang, 'markdown');
  const md2 = buildEmmBody(back as never, []);
  check('③ 두 번째 내보내기도 같다', md2, md);
}

// ── ④ 노드 본문의 코드(노드로 배치) ─────────────────────────────────
{
  const body = '설명\n\n' + fencedBlock(inner, 'markdown');
  const parts = splitNodeBody(body);
  check('④ 노드 본문에서 코드 블록 하나로 읽힌다', parts.blocks.filter((b) => b.kind === 'code').length, 1);
  check('④ 그 코드에 안쪽 ``` 이 그대로', parts.blocks.find((b) => b.kind === 'code')?.body, inner);
  const md = ['# 제목', '', '## 가지', '', '````markdown', inner, '````', '', '# 둘째', ''].join('\n');
  const map = parseMarkdownToMap(md, 'x', { blockPlacement: 'node' })!;
  check('④ 노드로 배치해도 중심은 둘', mapCenters(map).length, 2);
  const child = map.branches[0].children?.[0];
  check('④ 자식 노드 본문이 ````markdown 블록', child?.text, fencedBlock(inner, 'markdown'));
}

if (failed) { console.log(`\n${failed} FAIL`); process.exit(1); }
console.log('\nnested-fence: all ok');
