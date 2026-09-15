// ```emm 선언 쓰기·첨부 줄·선언 노트 왕복 (2026-09-15, MD 메타데이터 주석 폐기).
//
// MD 가 맵에 대해 말하는 것은 제목 아래 ```emm 블록뿐이다. 내보내기가 그
// 블록을 쓰고(buildDeclaration), 불러오기가 같은 키를 읽으며(readDeclaration),
// 블록은 루트의 `emm` 코드 노트로 남되 다시 내보낼 때는 건너뛴다.

import { parseEmm } from '../src/parse';
import { buildEmmBody } from '../src/serialize';
import { buildDeclaration, readDeclaration } from '../src/declaration';
import type { MindNode, SampleMap } from '../src/model';

let failed = 0;
function check(name: string, got: unknown, want: unknown): void {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  const ok = g === w;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      받음 ${g}\n      기대 ${w}`}`);
}
const OPT = { blockPlacement: 'node' as const };
const base = (md: string): SampleMap => parseEmm(md, 'mindmap', OPT)!;

// ── ① buildDeclaration ↔ readDeclaration ──────────────────────────────
{
  const decl = { map: '7f3a9c', levels: { 1: { layout: 'tree-right' }, 2: { layout: 'process-tree-right', shape: 'rounded', font: '15' } } };
  const block = buildDeclaration(decl);
  check('① 블록 모양', block.split('\n'),
    ['```emm', 'map: 7f3a9c', 'levels:', '  1:', '    layout: tree-right', '  2:', '    layout: process-tree-right', '    shape: rounded', '    font: 15', '```']);
  check('① 다시 읽으면 같다', readDeclaration(`# 제목\n\n${block}\n\n## 가지\n`), decl);
  check('① template 만', buildDeclaration({ template: 'TP' }).split('\n'), ['```emm', 'template: TP', '```']);
  check('① levels 가 있으면 template 은 쓰지 않는다', buildDeclaration({ template: 'TP', levels: { 1: { layout: 'kanban' } } }).includes('template'), false);
  check('① 적을 것이 없으면 빈 문자열', buildDeclaration({}), '');
}

// ── ② 본문에 선언 블록 — 제목 바로 아래, 루트 노트로 읽히고, 다시 내보낼 때 중복되지 않는다 ──
{
  const m = base('# 제목\n\n## 가지\n- a\n');
  const decl = { map: 'abc', levels: { 1: { layout: 'tree-right' } } };
  const md1 = buildEmmBody(m, [], { declaration: decl });
  check('② 제목 다음 줄부터 선언 블록', md1.split('\n').slice(0, 7),
    ['# 제목', '', '```emm', 'map: abc', 'levels:', '  1:', '    layout: tree-right']);
  const back = base(md1);
  check('② 선언은 루트의 emm 코드 노트로 보인다', (back.root.notes ?? []).map((n) => [n.type, (n as { lang?: string }).lang]), [['code_block', 'emm']]);
  check('② 가지는 그대로', back.branches.map((b) => [b.text, (b.children ?? []).map((c) => c.text)]), [['가지', ['a']]]);
  const md2 = buildEmmBody(back, [], { declaration: decl });
  check('② 다시 내보내면 선언 블록이 하나뿐(노트는 건너뛴다)', (md2.match(/```emm/g) ?? []).length, 1);
  check('② 두 번 왕복 파일 동일', md2, md1);
  const md3 = buildEmmBody(back, []);
  check('② 선언 없이 내보내면 노트도 쓰지 않는다', md3.includes('```emm'), false);
}

// ── ③ 첨부 줄 📎 ──────────────────────────────────────────────────
{
  const m = base('# 제목\n\n## 가지\n\n### 하위\n');
  const node = m.branches[0].children![0];
  node.attachments = [
    { id: 'a1', name: '견적서.xlsx', url: 'blob:x', kind: 'file' },
    { id: 'a2', name: '녹음.mp3', url: 'https://example.com/r.mp3', kind: 'audio' },
    { id: 'a3', name: '세션뿐', url: 'blob:y', kind: 'file' },
  ] as MindNode['attachments'];
  const paths = new Map([['a1', 'files/견적서.xlsx']]);
  const md = buildEmmBody(m, [], { attachmentPaths: paths });
  check('③ files/ 경로는 📎 줄, http 는 URL 그대로, blob 만 있는 것은 빠진다',
    md.split('\n').filter((l) => l.startsWith('📎')), ['📎 [견적서.xlsx](files/견적서.xlsx)', '📎 [녹음.mp3](https://example.com/r.mp3)']);
  const back = base(md);
  const h = back.branches[0].children![0];
  check('③ 다시 읽으면 그 노드의 첨부 (자식 노드가 아니다)', (h.children ?? []).length, 0);
  check('③ 첨부 이름·url·종류', (h.attachments ?? []).map((a) => [a.name, a.url, a.kind]),
    [['견적서.xlsx', 'files/견적서.xlsx', 'file'], ['녹음.mp3', 'https://example.com/r.mp3', 'audio']]);
  // 루트 첨부
  m.root.attachments = [{ id: 'r1', name: '루트.pdf', url: 'blob:z', kind: 'file' }] as MindNode['attachments'];
  const md2 = buildEmmBody(m, [], { attachmentPaths: new Map([['r1', 'files/루트.pdf']]) });
  const back2 = base(md2);
  check('③ 루트 첨부는 루트에', (back2.root.attachments ?? []).map((a) => a.url), ['files/루트.pdf']);
}

// ── ④ 첨부 줄이 링크 줄(🔗)과 같이 있어도 노드가 늘지 않는다 ────────────
{
  const md = '# 제목\n\n## 가지\n\n🔗 [문서](https://example.com/doc)\n\n📎 [파일.txt](files/파일.txt)\n\n## 다음\n';
  const m = base(md);
  check('④ 가지 수', m.branches.map((b) => b.text), ['가지', '다음']);
  check('④ 링크·첨부', [m.branches[0].links?.map((l) => l.url), m.branches[0].attachments?.map((a) => a.url)],
    [['https://example.com/doc'], ['files/파일.txt']]);
}

// ── ⑤ 사진 — files/ 경로가 본문에서 노드 사진으로 돌아온다 (메타 없이) ────
{
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  const m = base('# 제목\n\n## 가지\n\n### 하위\n');
  m.branches[0].image = { src: png, w: 1, h: 1 };
  m.branches[0].children![0].images = [{ src: png, w: 1, h: 1, afterLine: 1 }];
  m.root.image = { src: png, w: 1, h: 1 };
  const images: { path: string }[] = [];
  const md = buildEmmBody(m, images as never);
  check('⑤ 같은 사진은 files/ 에 한 번', images.map((i) => i.path), ['files/img-1.png']);
  for (const bp of ['node', 'note'] as const) {
    const b = parseEmm(md, 'x', { blockPlacement: bp })!;
    check(`⑤ [${bp}] 사진 노드가 생기지 않고 트리 그대로`, b.branches.map((x) => [x.text, (x.children ?? []).map((c) => c.text)]), [['가지', ['하위']]]);
    check(`⑤ [${bp}] files/ 경로가 노드 사진으로`, [b.root.images?.[0]?.src, b.branches[0].images?.[0]?.src, b.branches[0].children![0].images?.[0]?.src],
      ['files/img-1.png', 'files/img-1.png', 'files/img-1.png']);
  }
}

if (failed) { console.log(`\n${failed} FAIL`); process.exit(1); }
console.log('\n모두 통과');
