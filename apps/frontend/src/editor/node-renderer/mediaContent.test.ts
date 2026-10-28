// npx tsx src/editor/node-renderer/mediaContent.test.ts
import { mediaKindsOf, mediaLabel } from './mediaContent';
import { applyMediaView } from './mediaView';
import { filterCodeLanguages, DEFAULT_CODE_LANGUAGES } from '../../services/cloud/codeLanguages';
let failed = 0;
const check = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : ` — 받음 ${JSON.stringify(got)}, 기대 ${JSON.stringify(want)}`}`);
};
const F = '```';
const mer = F + 'mermaid\nflowchart TD\n A-->B\n' + F;
const html = F + 'html\n<b>hi</b>\n' + F;
check('Mermaid 만', mediaKindsOf({ text: mer }), ['Mermaid']);
check('HTML + Mermaid (순서 고정)', mediaKindsOf({ text: html + '\n' + mer }), ['Mermaid', 'HTML']);
check('사진만', mediaKindsOf({ text: '', image: { src: 'x' } }), ['Image']);
check('사진 + HTML', mediaKindsOf({ text: html, image: { src: 'x' } }), ['Image', 'HTML']);
check('글이 섞이면 아님', mediaKindsOf({ text: '설명\n' + mer }), null);
check('다른 언어 코드면 아님', mediaKindsOf({ text: F + 'js\nlet a\n' + F }), null);
check('빈 노드는 아님', mediaKindsOf({ text: '' }), null);
check('표는 아님', mediaKindsOf({ text: '| a | b |\n|---|---|\n| 1 | 2 |' }), null);
check('이름', mediaLabel(['Image', 'Mermaid', 'HTML']), 'Image, Mermaid, HTML');

const map = {
  title: 't',
  root: { id: 'root', text: '중심' },
  branches: [
    { id: 'a', text: mer, tags: ['내태그'] },
    { id: 'b', text: html, contentFolded: true, tags: ['x'] },
    { id: 'c', text: '보통 노드' },
  ],
};
const v = applyMediaView(map) as unknown as { branches: Record<string, unknown>[] };
check('펼친 그림 노드 — 자동 태그는 뒤에', v.branches[0].tags, ['내태그', 'Mermaid']);
check('펼친 그림 노드 — 표시', v.branches[0]._media, ['Mermaid']);
check('접은 그림 노드 — 글은 종류 이름, 태그 숨김', [v.branches[1].text, v.branches[1].tags, v.branches[1]._mediaFolded], ['HTML', undefined, true]);
check('보통 노드는 그대로(같은 객체)', v.branches[2] === map.branches[2], true);
check('문서는 바뀌지 않는다', map.branches[0].tags, ['내태그']);
const nv = applyMediaView(map, { fold: false }) as unknown as { branches: Record<string, unknown>[] };
check('뷰어(fold:false) — 접힌 노드도 펼쳐 보인다', [nv.branches[1].text === html, nv.branches[1].tags], [true, ['x', 'HTML']]);
check('그림 노드가 없으면 맵 그대로', applyMediaView({ title: 't', root: { id: 'r', text: 'a' }, branches: [] }).branches.length, 0);

const names = (q: string) => filterCodeLanguages(DEFAULT_CODE_LANGUAGES, q).map((x) => x.name);
check('j → Java, JavaScript, JSON, JSX, Julia', names('j'), ['Java', 'JavaScript', 'JSON', 'JSX', 'Julia']);
check('표기로도 찾는다 (cs → C# 먼저)', names('cs')[0], 'C#');
check('빈 입력은 전체', names('').length, DEFAULT_CODE_LANGUAGES.length);
const sorted = DEFAULT_CODE_LANGUAGES.map((x) => x.name).slice().sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
check('기본 목록은 알파벳 순', DEFAULT_CODE_LANGUAGES.map((x) => x.name), sorted);
if (failed) { console.log(`\n${failed}개 실패`); process.exit(1); }
console.log('\nmediaContent: 모두 통과');
