// `import_github_docs` · `update_map_from_github` 순수 부분 단위 테스트 (2026-09-21).
//
//   npm run build && npm run test:mcp
//
// 왜 시험하나: 갱신 도구는 **사용자의 기존 맵에서 노드를 지우고 바꾼다.**
// 엉뚱한 노드가 지워지거나(링크가 다른 저장소의 것인데 우리 것으로 보거나),
// 사용자가 손으로 붙인 노드·노트가 사라지거나, 절 하나만 갱신하랬는데 문서
// 전체가 바뀌면 사용자는 "AI 가 맵을 망쳤다" 로 겪는다. 네트워크 없이:
// ① 저장소 지정 해석 ② 문서 폴더 판정·파일 고르기 ③ 절 나누기(펜스 안 `#`,
// 표, 코드, front matter, `####` 이하) ④ 맵 만들기(폴더 트리·링크·노트·색)
// ⑤ 계획(추가·수정·삭제·그대로 — blob sha / 커밋 시각) ⑥ 적용(id 유지·사용자
// 추가분 보존·빈 폴더 정리·범위: 폴더·문서·절) ⑦ 원본 불변.
//
// 설계: docs/04-extensions/ai/mcp-connector.md §9.14

import {
  IdGen, applyUpdate, buildDocsMap, buildFileNode, collectFileNodes, detectDocsDir, fileNodePath,
  folderNodePath, mergeNode, parseRepoRef, planUpdate, readFileMeta, readSource, resolveScope,
  sectionize, selectDocFiles, settleByCommit, GithubDocsError,
} from '../dist/mcp/github-docs.js';

let failed = 0;
function check(name, got, want) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  const ok = g === w;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      받음 ${g}\n      기대 ${w}`}`);
}
function throws(name, fn, wantMsgPart) {
  let msg = null;
  try { fn(); } catch (e) { msg = e instanceof GithubDocsError ? e.message : `다른 오류: ${e}`; }
  const ok = msg !== null && msg.includes(wantMsgPart);
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      받음 ${msg}\n      기대 …${wantMsgPart}…`}`);
}

console.log('── ① 저장소 지정 해석');
check('owner/repo', parseRepoRef('okpojung/easymindmap'), { owner: 'okpojung', repo: 'easymindmap' });
check('https 주소', parseRepoRef('https://github.com/okpojung/easymindmap'), { owner: 'okpojung', repo: 'easymindmap' });
check('.git 꼬리', parseRepoRef('https://github.com/okpojung/easymindmap.git'), { owner: 'okpojung', repo: 'easymindmap' });
check('tree/브랜치/경로', parseRepoRef('https://github.com/okpojung/easymindmap/tree/main/docs/guide'), { owner: 'okpojung', repo: 'easymindmap', ref: 'main', path: 'docs/guide' });
check('tree/브랜치 만', parseRepoRef('github.com/a/b/tree/dev/'), { owner: 'a', repo: 'b', ref: 'dev' });
throws('빈 값', () => parseRepoRef(''), '비어');
throws('owner 만', () => parseRepoRef('okpojung'), '알아보지');
throws('이상한 글자', () => parseRepoRef('a b/c'), '이상');

console.log('── ② 문서 폴더 판정 · 파일 고르기');
const tree = [
  { path: 'README.md', type: 'blob', sha: 'r1' },
  { path: 'docs', type: 'tree', sha: 't1' },
  { path: 'docs/README.md', type: 'blob', sha: 'd0' },
  { path: 'docs/guide', type: 'tree', sha: 't2' },
  { path: 'docs/guide/a.md', type: 'blob', sha: 'a1' },
  { path: 'docs/guide/b.MD', type: 'blob', sha: 'b1' },
  { path: 'docs/guide/img.png', type: 'blob', sha: 'p1' },
  { path: 'docs/z.markdown', type: 'blob', sha: 'z1' },
  { path: 'src/x.md', type: 'blob', sha: 'x1' },
];
check('docs 폴더 자동', detectDocsDir(tree), 'docs');
check('없으면 뿌리', detectDocsDir([{ path: 'src', type: 'tree' }]), '');
check('Doc 대소문자', detectDocsDir([{ path: 'Doc', type: 'tree' }]), 'Doc');
check('docs 아래 마크다운만, 경로순', selectDocFiles(tree, 'docs').map((f) => f.path), ['docs/README.md', 'docs/guide/a.md', 'docs/guide/b.MD', 'docs/z.markdown']);
check('뿌리면 전부', selectDocFiles(tree, '').map((f) => f.path).length, 6);
check('blob sha 보존', selectDocFiles(tree, 'docs/guide')[0], { path: 'docs/guide/a.md', blobSha: 'a1' });

console.log('── ③ 절 나누기');
const MD = `---
title: front
---
# 설치 안내

첫 문단이다.
둘째 줄.

| 항목 | 값 |
|---|---|
| a | 1 |

## 요구 사항

- Node 22
- npm

### 선택

\`\`\`bash
# 이것은 견출이 아니다
npm ci
\`\`\`

#### 더 깊은 제목

> 인용문 한 줄

## 실행

![그림](x.png)

문단.
`;
const doc = sectionize(MD);
check('제목 = 첫 #', doc.title, '설치 안내');
check('머리말 블록 종류', doc.intro.map((b) => b.kind), ['paragraph', 'table']);
check('문단 줄 합침', doc.intro[0].text, '첫 문단이다. 둘째 줄.');
check('표 원문', doc.intro[1].text.split('\n').length, 3);
check('## 절 둘', doc.sections.map((s) => s.title), ['요구 사항', '실행']);
check('목록은 list 블록', doc.sections[0].blocks[0], { kind: 'list', text: '- Node 22\n- npm' });
check('### 는 ## 의 자식', doc.sections[0].children.map((s) => s.title), ['선택']);
const sel = doc.sections[0].children[0];
check('펜스 안 # 은 견출 아님 · 코드 블록 · 언어', [sel.blocks[0].kind, sel.blocks[0].lang, sel.blocks[0].text], ['code', 'bash', '# 이것은 견출이 아니다\nnpm ci']);
check('#### 는 절이 아니라 굵은 글', sel.blocks[1], { kind: 'paragraph', text: '**더 깊은 제목**' });
check('인용문', sel.blocks[2], { kind: 'quote', text: '인용문 한 줄' });
check('사진만 있는 줄은 버림', doc.sections[1].blocks, [{ kind: 'paragraph', text: '문단.' }]);
check('제목 없는 문서', sectionize('그냥 글\n\n## a\n').title, null);
check('## 없이 ### 만이면 최상위 절', sectionize('# t\n\n### only\n').sections.map((s) => [s.level, s.title]), [[3, 'only']]);
check('인라인 강조 걷기', sectionize('# **굵은** `코드` [링크](u)\n').title, '굵은 코드 링크');

console.log('── ④ 맵 만들기');
const src = { owner: 'o', repo: 'r', ref: 'main', path: 'docs' };
const docs = [
  { file: { path: 'docs/README.md', blobSha: 'd0000000' }, markdown: '# 개요\n\n소개.\n', commit: { sha: 'c0000000', date: '2026-09-01T00:00:00.000Z' } },
  { file: { path: 'docs/guide/a.md', blobSha: 'a1111111' }, markdown: MD, commit: { sha: 'c1111111', date: '2026-09-02T00:00:00.000Z' } },
  { file: { path: 'docs/guide/b.md', blobSha: 'b1111111' }, markdown: '본문만.\n', commit: null },
  { file: { path: 'docs/z.md', blobSha: 'z1111111' }, markdown: '# Z\n', commit: { sha: 'c2222222', date: '2026-09-03T00:00:00.000Z' } },
];
const map = buildDocsMap(src, docs, 'r 문서', '2026-09-21T00:00:00.000Z', new IdGen());
check('루트 이름·출처 노트', [map.root.text, map.root.notes[0].text], ['r 문서', '출처: github:o/r@main:docs (가져옴 2026-09-21T00:00:00.000Z)']);
check('출처 되읽기', (({ owner, repo, ref, path, fetchedAt }) => ({ owner, repo, ref, path, fetchedAt }))(readSource(map)), { ...src, fetchedAt: '2026-09-21T00:00:00.000Z' });
check('루트 링크 = 폴더 주소', map.root.links[0].url, 'https://github.com/o/r/tree/main/docs');
check('1레벨: 폴더 먼저, README 먼저, 이름순', map.branches.map((b) => b.text), ['guide', '개요', 'Z']);
check('1레벨 색·방향', map.branches.map((b) => [b.colorKey, b.side]), [['l1A', 'right'], ['l1B', 'right'], ['l1C', 'right']]);
const guide = map.branches[0];
check('폴더 링크', [folderNodePath(src, guide), guide.links[0].label], ['docs/guide', 'guide/']);
check('폴더 아래 문서 둘', guide.children.map((n) => n.text), ['설치 안내', 'b']);
const a = guide.children[0];
check('문서 링크 = blob 주소 · 라벨 = 파일 이름', [a.links[0].url, a.links[0].label], ['https://github.com/o/r/blob/main/docs/guide/a.md', 'a.md']);
check('문서 경로 되읽기', fileNodePath(src, a), 'docs/guide/a.md');
check('첫 노트 = 갱신 시각·커밋·파일', a.notes[0].text, '최종 업데이트: 2026-09-02T00:00:00.000Z · 커밋 c111111 · 파일 a111111');
check('노트 되읽기', readFileMeta(a), { updatedAt: '2026-09-02T00:00:00.000Z', commitSha: 'c111111', blobSha: 'a111111' });
check('머리말 문단·표가 노트로', a.notes.slice(1).map((n) => n.type), ['paragraph', 'table']);
check('## → 자식 노드, ### → 손자', [a.children.map((n) => n.text), a.children[0].children.map((n) => n.text)], [['요구 사항', '실행'], ['선택']]);
check('절 노트: 목록 문단 · 코드 노트에 lang', [a.children[0].notes[0].type, a.children[0].children[0].notes[0].type, a.children[0].children[0].notes[0].lang], ['paragraph', 'code_block', 'bash']);
check('커밋 모르면 "(알 수 없음)"', guide.children[1].notes[0].text, '최종 업데이트: (알 수 없음) · 파일 b111111');
check('제목 없는 문서는 파일 이름', guide.children[1].text, 'b');
const ids = [];
(function walk(ns) { for (const n of ns) { ids.push(n.id); (n.notes ?? []).forEach((x) => ids.push(x.id)); (n.links ?? []).forEach((x) => ids.push(x.id)); walk(n.children ?? []); } })(map.branches);
check('id 전부 유일', new Set(ids).size, ids.length);
check('문서 노드 모으기 (절 노드 안으로는 안 내려감)', collectFileNodes(src, map.branches).map((r) => r.path), ['docs/guide/a.md', 'docs/guide/b.md', 'docs/README.md', 'docs/z.md']);

console.log('── ⑤ 계획');
const remote1 = [
  { path: 'docs/README.md', blobSha: 'd0000000' },          // 그대로
  { path: 'docs/guide/a.md', blobSha: 'a2222222' },         // 바뀜
  { path: 'docs/guide/c.md', blobSha: 'c3333333' },         // 새 문서
  // docs/guide/b.md 사라짐, docs/z.md 사라짐
];
const plan1 = planUpdate(map, src, { kind: 'all' }, remote1);
check('추가·수정·삭제·그대로', [plan1.added.map((f) => f.path), plan1.updated.map((u) => u.file.path), plan1.removed.map((r) => r.path), plan1.unchanged, plan1.needsCommitCheck.length],
  [['docs/guide/c.md'], ['docs/guide/a.md'], ['docs/guide/b.md', 'docs/z.md'], 1, 0]);
{
  // 옛 맵(파일 sha 없음)은 커밋 시각으로
  const old = JSON.parse(JSON.stringify(map));
  old.branches[1].notes[0].text = '최종 업데이트: 2026-09-01T00:00:00.000Z · 커밋 c000000';
  const p = planUpdate(old, src, { kind: 'all' }, [{ path: 'docs/README.md', blobSha: 'dXXXXXXX' }]);
  check('sha 없으면 커밋 확인 대상', p.needsCommitCheck.map((c) => c.file.path), ['docs/README.md']);
  const settled = settleByCommit(p, new Map([['docs/README.md', { sha: 'n', date: '2026-09-05T00:00:00.000Z' }]]));
  check('커밋이 더 뒤면 수정', settled.updated.map((u) => u.file.path), ['docs/README.md']);
  const p2 = planUpdate(old, src, { kind: 'all' }, [{ path: 'docs/README.md', blobSha: 'dXXXXXXX' }]);
  const settled2 = settleByCommit(p2, new Map([['docs/README.md', { sha: 'n', date: '2026-08-30T00:00:00.000Z' }]]));
  check('커밋이 더 앞이면 그대로', [settled2.updated.length, settled2.unchanged], [0, 1]);
}
check('폴더 범위: 그 폴더 아래만', (() => { const p = planUpdate(map, src, { kind: 'folder', dir: 'docs/guide', node: guide }, remote1); return [p.added.map((f) => f.path), p.removed.map((r) => r.path), p.updated.length]; })(), [['docs/guide/c.md'], ['docs/guide/b.md'], 1]);
check('문서 범위: 그 문서만', (() => { const p = planUpdate(map, src, { kind: 'file', path: 'docs/guide/a.md', node: a }, remote1); return [p.added.length, p.removed.length, p.updated.map((u) => u.file.path)]; })(), [0, 0, ['docs/guide/a.md']]);
check('범위 판정: 폴더·문서·절·아님', [
  resolveScope(src, map, guide).kind, resolveScope(src, map, a).kind,
  resolveScope(src, map, a.children[0].children[0]).kind, resolveScope(src, map, null).kind,
  resolveScope(src, map, { id: 'user-x', text: '내 메모' }),
], ['folder', 'file', 'section', 'all', null]);
check('절 범위의 제목 사슬·문서', (({ path, titles }) => ({ path, titles }))(resolveScope(src, map, a.children[0].children[0])), { path: 'docs/guide/a.md', titles: ['요구 사항', '선택'] });

console.log('── ⑥ 적용');
const newA = `# 설치 안내 (개정)

새 머리말.

## 요구 사항

- Node 24

## 새 절

내용.
`;
const loads = {
  'docs/guide/a.md': { markdown: newA, commit: { sha: 'c9999999', date: '2026-09-20T00:00:00.000Z' } },
  'docs/guide/c.md': { markdown: '# C 문서\n\n## 하나\n', commit: { sha: 'c8888888', date: '2026-09-19T00:00:00.000Z' } },
};
const load = async (f) => loads[f.path];
// 사용자가 손으로 붙인 노드·노트 — 남아야 한다
const withUser = JSON.parse(JSON.stringify(map));
const ua = withUser.branches[0].children[0];
ua.children[0].children.push({ id: 'user-node-1', text: '내가 붙인 메모', children: [] });
ua.children[0].notes.push({ id: 'user-note-1', type: 'paragraph', text: '내 노트' });
withUser.branches[0].children.push({ id: 'user-node-2', text: '폴더 안 내 노드', children: [] });
const before = JSON.stringify(withUser);
const plan2 = planUpdate(withUser, src, { kind: 'all' }, remote1);
const applied = await applyUpdate(withUser, src, { kind: 'all' }, plan2, load, '2026-09-21T09:00:00.000Z', new IdGen());
check('원본 불변', JSON.stringify(withUser), before);
check('결과 목록', [applied.added, applied.updated, applied.removed, applied.removedFolders], [['docs/guide/c.md'], ['docs/guide/a.md'], ['docs/guide/b.md', 'docs/z.md'], 0]);
const g2 = applied.map.branches[0];
check('사라진 b · z 노드 없음, c 추가, 사용자 노드 남음', [g2.children.map((n) => n.text), applied.map.branches.map((b) => b.text)], [['설치 안내 (개정)', '폴더 안 내 노드', 'C 문서'], ['guide', '개요']]);
const a2 = g2.children[0];
check('수정된 문서 노드 id 유지', a2.id, a.id);
check('갱신 시각 노트 새것', a2.notes[0].text, '최종 업데이트: 2026-09-20T00:00:00.000Z · 커밋 c999999 · 파일 a222222');
check('절: 같은 제목은 id 유지, 없어진 절(실행) 삭제, 새 절 추가', [a2.children.map((n) => n.text), a2.children[0].id === a.children[0].id], [['요구 사항', '새 절'], true]);
check('절의 생성 노트는 새것으로, 사용자 노트는 보존', a2.children[0].notes.map((n) => [n.type, n.text]), [['paragraph', '- Node 24'], ['paragraph', '내 노트']]);
check('절 아래 사용자 노드 보존, 없어진 ### 선택 삭제', a2.children[0].children.map((n) => n.text), ['내가 붙인 메모']);
check('루트 "가져옴" 시각 갱신', applied.map.root.notes[0].text, '출처: github:o/r@main:docs (가져옴 2026-09-21T09:00:00.000Z)');
check('1레벨 색 유지', applied.map.branches.map((b) => b.colorKey), ['l1A', 'l1B']);
{
  // 빈 폴더 정리 — guide 의 문서가 전부 사라지면 guide 노드도 (사용자 노드가 없을 때)
  const p = planUpdate(map, src, { kind: 'all' }, [{ path: 'docs/README.md', blobSha: 'd0000000' }]);
  const r = await applyUpdate(map, src, { kind: 'all' }, p, load, 'now', new IdGen());
  check('빈 폴더 함께 삭제', [r.map.branches.map((b) => b.text), r.removedFolders], [['개요'], 1]);
}
{
  // 새 문서가 새 폴더에 — 폴더 사슬을 만든다 (폴더는 문서보다 앞에)
  const p = planUpdate(map, src, { kind: 'all' }, [...remote1, { path: 'docs/new/deep/x.md', blobSha: 'x1' }]);
  const r = await applyUpdate(map, src, { kind: 'all' }, p, async (f) => f.path === 'docs/new/deep/x.md' ? { markdown: '# X', commit: null } : loads[f.path], 'now', new IdGen());
  const nw = r.map.branches.find((b) => b.text === 'new');
  check('새 폴더 사슬', [Boolean(nw), nw.children[0].text, nw.children[0].children[0].text, folderNodePath(src, nw.children[0])], [true, 'deep', 'X', 'docs/new/deep']);
  check('새 1레벨 폴더도 색·방향', [nw.colorKey !== undefined, nw.side], [true, 'right']);
}
{
  // 절 범위 — 그 절만 바뀌고 문서의 다른 절·갱신 노트는 그대로
  const scope = resolveScope(src, map, a.children[0]);   // "요구 사항"
  const p = planUpdate(map, src, scope, remote1);
  const r = await applyUpdate(map, src, scope, p, load, 'now', new IdGen());
  const a3 = r.map.branches[0].children[0];
  check('절 범위: 제목 그대로(설치 안내), 갱신 노트 그대로', [a3.text, a3.notes[0].text === a.notes[0].text], ['설치 안내', true]);
  check('절 범위: 그 절만 새 내용, 다른 절(실행) 유지', [a3.children.map((n) => n.text), a3.children[0].notes[0].text, a3.children[0].children.length], [['요구 사항', '실행'], '- Node 24', 0]);
  check('절 범위 결과 표기', r.updated, ['docs/guide/a.md › 요구 사항']);
  // 저장소에서 사라진 절
  const scope2 = resolveScope(src, map, a.children[1]);  // "실행" — newA 에 없다
  const p2 = planUpdate(map, src, scope2, remote1);
  const r2 = await applyUpdate(map, src, scope2, p2, load, 'now', new IdGen());
  check('없어진 절은 알리고 그대로 둔다', [r2.sectionGone, r2.updated.length, r2.map.branches[0].children[0].children.length], ['실행', 0, 2]);
}
{
  // mergeNode 단독 — 생성 노트만 교체
  const m = mergeNode({ id: 'gh-1', text: 'old', notes: [{ id: 'nt-x', type: 'paragraph', text: 'gen' }, { id: 'u1', type: 'paragraph', text: 'mine' }], children: [] },
    { id: 'gh-2', text: 'new', notes: [{ id: 'nt-y', type: 'table', text: '|a|' }], children: [] });
  check('mergeNode', [m.id, m.text, m.notes.map((n) => n.id)], ['gh-1', 'new', ['nt-y', 'u1']]);
}
{
  // 다른 저장소의 링크는 우리 문서 노드가 아니다
  const other = buildFileNode({ owner: 'x', repo: 'y', ref: 'main', path: '' }, { path: 'a.md', blobSha: '1' }, '# t', null, new IdGen());
  check('다른 저장소 링크 무시', [fileNodePath(src, other), collectFileNodes(src, [other]).length], [null, 0]);
}

if (failed) { console.log(`\n${failed} failed`); process.exit(1); }
console.log('\nall passed');
