// 선언 `blocks: note` — 우리가 내보낸 문서는 옵션과 상관없이 노트로 되읽는다 (2026-09-30).
//
// 사용자 요청: "원래 맵의 노트를 '노드로' 옵션을 고르지 않아도 원래 맵 모양으로".
// 지키는 것: ① buildDeclaration/readDeclaration 이 `blocks` 를 왕복한다 ② 내보내기는
// 여러 줄 노드의 나머지 줄을 견출에 **붙여**(빈 줄 없이) `>` 로, 문단 노트는 빈 줄 뒤
// `>` 로 쓴다 ③ `adjacentQuoteIsBody` + 노트 배치로 되읽으면 여러 줄 노드는 본문 줄로,
// 노트는 노트로 돌아온다 ④ 옵션이 없으면(손글씨 MD) 예전처럼 노트 배치 규칙 그대로.
//   npx tsx test/blocks-note.test.ts

import { parseMarkdownToMap } from '../src/parse';
import { buildEmmBody } from '../src/serialize';
import { buildDeclaration, readDeclaration } from '../src/declaration';
import { countMapNodes } from '../src/meta';

let failed = 0;
function check(name: string, got: unknown, want: unknown): void {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) { console.log(`  ok  ${name}`); return; }
  failed++;
  console.log(`  FAIL ${name}\n       got  ${g}\n       want ${w}`);
}

// ── ① 선언 왕복
{
  const md = buildDeclaration({ map: 'abc', blocks: 'note', levels: { 1: { layout: 'tree-right' } } });
  check('① blocks 가 map 다음 줄에', md.split('\n').slice(0, 3), ['```emm', 'map: abc', 'blocks: note']);
  check('① 읽으면 blocks=note', readDeclaration(md).blocks, 'note');
  check('① 모르는 값은 무시', readDeclaration('```emm\nblocks: maybe\n```').blocks, undefined);
}

// ── ② 내보내기 모양
const map = {
  title: '맵',
  root: { id: 'root', text: '맵' },
  branches: [{
    id: 'b1', text: '가지\n둘째 줄\n셋째 줄',
    notes: [
      { id: 'n1', type: 'paragraph' as const, text: '문단 노트 첫 줄\n문단 노트 둘째 줄' },
      { id: 'n2', type: 'code_block' as const, text: 'const a = 1;', lang: 'ts' },
    ],
    children: [{ id: 'c1', text: '잎', notes: [{ id: 'n3', type: 'paragraph' as const, text: '잎의 노트' }] }],
  }],
};
const md = buildEmmBody(map as never, [], { declaration: { blocks: 'note', levels: { 1: { layout: 'tree-right' } } } });
const lines = md.split('\n');
{
  const i = lines.indexOf('## 가지');
  check('② 여러 줄 노드의 나머지 줄은 견출에 붙여서 `>`', lines.slice(i, i + 3), ['## 가지', '> 둘째 줄', '> 셋째 줄']);
  check('② 문단 노트는 빈 줄 뒤 `>`', lines.slice(i + 3, i + 6), ['', '> 문단 노트 첫 줄', '> 문단 노트 둘째 줄']);
  check('② 코드 노트는 펜스', lines.slice(i + 6, i + 10), ['', '```ts', 'const a = 1;', '```']);
}

// ── ③ 되읽기 — 노트 배치 + adjacentQuoteIsBody
{
  const back = parseMarkdownToMap(md, 'x', { blockPlacement: 'note', adjacentQuoteIsBody: true })!;
  check('③ 노드 수 그대로 (3)', countMapNodes(back), 3);
  const b = back.branches[0];
  check('③ 여러 줄 노드 본문 그대로', b.text, '가지\n둘째 줄\n셋째 줄');
  check('③ 노트 둘(문단·코드) 그대로', (b.notes ?? []).map((n) => [n.type, n.text]), [['paragraph', '문단 노트 첫 줄\n문단 노트 둘째 줄'], ['code_block', 'const a = 1;']]);
  check('③ 잎의 노트', b.children?.[0].notes?.map((n) => n.text), ['잎의 노트']);
  check('③ 두 번째 내보내기도 같은 파일', buildEmmBody(back as never, [], { declaration: { blocks: 'note', levels: { 1: { layout: 'tree-right' } } } }), md);
}

// ── ④ 옵션 없이 노트 배치(손글씨 규칙) — 견출 아래 `>` 는 여전히 노트
{
  const back = parseMarkdownToMap('# T\n\n## 가지\n> 설명\n', 'x', { blockPlacement: 'note' })!;
  check('④ adjacentQuoteIsBody 없으면 노트', back.branches[0].notes?.map((n) => n.text), ['설명']);
  check('④ 노드 본문은 제목뿐', back.branches[0].text, '가지');
  const node = parseMarkdownToMap('# T\n\n## 가지\n> 설명\n', 'x', { blockPlacement: 'node' })!;
  check('④ 노드 배치는 예전처럼 본문 줄', node.branches[0].text, '가지\n설명');
}

if (failed) { console.log(`\n${failed} FAIL`); process.exit(1); }
console.log('\nblocks-note: all ok');
