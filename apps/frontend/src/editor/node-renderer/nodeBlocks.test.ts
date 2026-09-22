// nodeBlocks — 노드 본문의 표·코드 블록 전부를 원문 순서대로 (2026-09-22).
//   npx tsx src/editor/node-renderer/nodeBlocks.test.ts

import { layoutNodeBlocks, plainTextOf, splitNodeParts } from './nodeBlocks';
import { parseMdCode, parseMdCodes } from './mdCode';
import { parseMdTable } from './mdTable';
import { replaceCodeBlock } from './CodeBlockDialog';
import { buildMdTable } from './TableDialog';

let failed = 0;
function check(name: string, got: unknown, want: unknown): void {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  const ok = g === w;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      받음 ${g}\n      기대 ${w}`}`);
}
const kinds = (t: string) => splitNodeParts(t).map((p) => p.kind);
const T1 = buildMdTable(['a', 'b'], [['1', '2']]);
const T2 = buildMdTable(['x', 'y'], [['7', '8'], ['4', '5']]);
const C1 = '```js\nconst a = 1;\n```';
const C2 = '```sh\necho hi\nls -la\n```';

// ① 코드 두 개 (사용자 보고: 두 번째 코드 블록이 안 그려졌다)
const two = `머리\n\n${C1}\n\n가운데\n\n${C2}\n\n끝`;
check('① 글·코드·글·코드·글 순서', kinds(two), ['text', 'code', 'text', 'code', 'text']);
const twoLay = layoutNodeBlocks(two, 14)!;
check('① 코드 2개 · lang · 줄 수', twoLay.blocks.map((b) => (b.kind === 'code' ? [b.lang, b.code.length] : null)), [['js', 1], ['sh', 2]]);
check('① plainText · beforeLines (코드1 앞 1줄, 코드2 앞 2줄)', [twoLay.plainText, twoLay.blocks.map((b) => b.beforeLines)], ['머리\n가운데\n끝', [1, 2]]);
check('① hasCode · hasTable', [twoLay.hasCode, twoLay.hasTable], [true, false]);
check('① parseMdCodes 도 순서대로 2개, before/after', parseMdCodes(two).map((c) => [c.before, c.after]), [['머리', '가운데\n\n```sh\necho hi\nls -la\n```\n\n끝'], ['가운데', '끝']]);

// ② 표와 코드가 섞인 순서 — 원문 순서 그대로 (예전엔 표·코드를 글 뒤로 몰았다)
const mixed = `제목\n${T1}\n설명\n${C1}\n${T2}\n끝말`;
check('② 글·표·글·코드·표·글', kinds(mixed), ['text', 'table', 'text', 'code', 'table', 'text']);
const mixedLay = layoutNodeBlocks(mixed, 14)!;
check('② beforeLines 1,2,2 · plainText', [mixedLay.blocks.map((b) => b.beforeLines), mixedLay.plainText], [[1, 2, 2], '제목\n설명\n끝말']);
check('② 표 blockH 는 복사 스트립(13) 포함, 코드는 h 그대로', mixedLay.blocks.map((b) => b.blockH - b.h), [13, 0, 13]);

// ③ 예전 파서와 같은 다듬기 — 표 하나 · 코드 하나일 때 plainText 가 before/after 와 같다
const oneT = `앞 글  \n\n${T1}\n\n뒤 글\n`;
const pt = parseMdTable(oneT)!;
check('③ 표 하나: plainText = before + after', plainTextOf(oneT), [pt.before, pt.after].join('\n'));
const oneC = `앞\n${C1}\n\n  뒤`;
const pc = parseMdCode(oneC)!;
check('③ 코드 하나: plainText = before + after', plainTextOf(oneC), [pc.before, pc.after].join('\n'));
check('③ 블록 없으면 원문 그대로 한 조각 (다듬지 않는다)', splitNodeParts('그냥 글  \n둘째 '), [{ kind: 'text', body: '그냥 글  \n둘째 ' }]);
check('③ 블록만 있으면 plainText 빈 문자열 · layout 있음', [plainTextOf(C1), layoutNodeBlocks(C1, 14)?.blocks.length], ['', 1]);
check('③ 블록 없으면 layout null', layoutNodeBlocks('글', 14), null);

// ④ 경계 — 펜스 안의 파이프 줄은 표가 아니다 · 닫지 않은 펜스는 끝까지 코드 · 빈 펜스는 글
check('④ 펜스 안 파이프 줄은 코드', kinds('```\n| a | b |\n| 1 | 2 |\n```'), ['code']);
check('④ 닫지 않은 펜스 → 끝까지 코드', splitNodeParts('글\n```py\nx = 1\ny = 2').map((p) => (p.kind === 'code' ? p.code : p.kind)), ['text', ['x = 1', 'y = 2']]);
check('④ 빈 펜스는 블록이 아니라 글', kinds('```\n```\n글'), ['text']);
check('④ 표 두 개 사이에 빈 줄 없이 이어 쓰면 두 번째 머리글은 첫 표의 행 (GFM 규칙)', splitNodeParts(`${T1}\n${T2}`).filter((p) => p.kind === 'table').length, 2);

// ⑤ replaceCodeBlock(index) — 그 블록만
const r1 = replaceCodeBlock(two, 'ts', 'let b = 2;', 1);
check('⑤ index 1 → 두 번째 코드만 바뀐다', parseMdCodes(r1).map((c) => [c.lang, c.code.join('|')]), [['js', 'const a = 1;'], ['ts', 'let b = 2;']]);
check('⑤ 첫 코드·글은 그대로', [r1.startsWith('머리\n\n```js\nconst a = 1;\n```\n\n가운데'), r1.endsWith('```\n\n끝')], [true, true]);
check('⑤ 기본 index 0 → 첫 코드만', parseMdCodes(replaceCodeBlock(two, 'ts', 'z', 0)).map((c) => c.lang), ['ts', 'sh']);
check('⑤ index 가 넘치면 끝에 붙인다', parseMdCodes(replaceCodeBlock(two, 'ts', 'z', 9)).length, 3);

if (failed) { console.log(`\n${failed} FAIL`); process.exit(1); }
console.log('\n모두 통과');
