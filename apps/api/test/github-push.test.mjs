// `push_map_to_github` 순수 부분 단위 테스트 (2026-10-14).
//
//   npm run build && npm run test:mcp
//
// 왜 시험하나: 이 도구는 **사용자의 GitHub 저장소 파일을 고친다.** 맵에 안 들어온
// 원문(사진·주석·잘린 긴 글)이 사라지거나, 고치지 않은 절이 바뀌거나, 메모가 문서에
// 섞여 들어가거나, 새 파일이 엉뚱한 경로에 생기면 사용자는 "AI 가 문서를 망쳤다" 로
// 겪는다. 네트워크 없이: ① 표시(새파일·메모) ② 파일 이름 ③ 줄 번호 있는 절 나누기
// ④ 비교·원문 고치기(바뀐 자리만) ⑤ 새 파일 모으기·그리기 ⑥ 반영 뒤 맵 맞추기
// (중복 없음·메모 보존·PR 대기 표시) ⑦ 확인 코드·blob sha·허용 목록 ⑧ 쓰기 클라이언트.
//
// 설계: docs/04-extensions/ai/mcp-connector.md §9.15

import {
  IdGen, buildDocsMap, buildFileNode, collectFileNodes, fileNodePath, folderNodePath, planUpdate, readFileMeta,
  sectionize, sectionizeRanged,
} from '../dist/mcp/github-docs.js';
import {
  GithubPushError, align, applyPushToMap, cleanTitle, clearPending, collectNewFiles, diffFileNode, fileNameFor,
  formatPushPreview, gitBlobSha, pendingPrOf, planCode, pushAllowed, readMarker, renderNewFile,
} from '../dist/mcp/github-push.js';
import { GithubError, GithubWriter } from '../dist/mcp/github-client.js';

let failed = 0;
function check(name, got, want) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  const ok = g === w;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      받음 ${g}\n      기대 ${w}`}`);
}
function throws(name, fn, Cls, wantMsgPart) {
  let msg = null;
  try { fn(); } catch (e) { msg = e instanceof Cls ? e.message : `다른 오류: ${e}`; }
  const ok = msg !== null && msg.includes(wantMsgPart);
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      받음 ${msg}\n      기대 …${wantMsgPart}…`}`);
}
const clone = (x) => JSON.parse(JSON.stringify(x));

console.log('── ① 표시 (새파일 · 메모)');
check('태그 새파일', readMarker({ id: 'a', text: 'x', tags: ['새파일'] }), { kind: 'newfile', via: 'tag' });
check('태그 새파일:이름', readMarker({ id: 'a', text: 'x', tags: ['새파일: install.md'] }), { kind: 'newfile', name: 'install.md', via: 'tag' });
check('태그 AddFile (대소문자 무관)', readMarker({ id: 'a', text: 'x', tags: ['addfile'] })?.kind, 'newfile');
check('옛 단일 tag 필드', readMarker({ id: 'a', text: 'x', tag: 'NewFile' })?.kind, 'newfile');
check('이름 머리 [새파일]', readMarker({ id: 'a', text: '[새파일] 설치' }), { kind: 'newfile', via: 'title' });
check('이름 머리 [새파일:경로]', readMarker({ id: 'a', text: '[새파일:guide/a.md] 설치' }), { kind: 'newfile', name: 'guide/a.md', via: 'title' });
check('이름 머리 [메모]', readMarker({ id: 'a', text: '[메모] 할 일' }), { kind: 'memo', via: 'title' });
check('태그 메모', readMarker({ id: 'a', text: '할 일', tags: ['메모'] }), { kind: 'memo', via: 'tag' });
check('표시 없음', readMarker({ id: 'a', text: '그냥 노드', tags: ['MVP'] }), null);
check('본문 중간의 [새파일] 은 표시 아님', readMarker({ id: 'a', text: '설명 [새파일] 참고' }), null);
check('이름에서 표시 걷기', [cleanTitle({ id: 'a', text: '[새파일:x.md]  설치 가이드\n둘째 줄' }), cleanTitle({ id: 'b', text: '[메모] 할 일' })], ['설치 가이드', '할 일']);

console.log('── ② 파일 이름');
check('노드 이름에서 — 공백은 -, 한글 유지', fileNameFor('설치 가이드'), '설치-가이드.md');
check('못 쓰는 글자 제거', fileNameFor('a/b: c?*'), 'a-b-c.md');
check('지정 이름에 확장자 붙이기', fileNameFor('무시', 'install'), 'install.md');
check('지정 이름의 하위 폴더', fileNameFor('무시', 'guide/install.md'), 'guide/install.md');
check('빈 이름이면 untitled', fileNameFor('  '), 'untitled.md');
throws('.. 는 거절', () => fileNameFor('x', '../escape.md'), GithubPushError, '쓸 수 없습니다');
throws('빈 경로 조각 거절', () => fileNameFor('x', 'a//b.md'), GithubPushError, '쓸 수 없습니다');

console.log('── ③ 줄 번호 있는 절 나누기');
const MDF = `---
title: front
---
# 설치 안내

첫 문단이다.

## 요구 사항

- Node 22

### 선택

\`\`\`bash
npm ci
\`\`\`

## 실행

문단.
`;
const o = sectionizeRanged(MDF);
check('front matter 다음부터', o.startLine, 3);
check('제목 줄', o.lines[o.titleLine], '# 설치 안내');
check('절 견출 줄', o.sections.map((s) => o.lines[s.start]), ['## 요구 사항', '## 실행']);
check('절 끝 = 다음 같은 단계 견출', o.lines[o.sections[0].end], '## 실행');
check('본문 끝 = 첫 하위 절', o.lines[o.sections[0].bodyEnd], '### 선택');
const codeB = o.sections[0].children[0].blocks[0];
check('코드 블록 범위 = 펜스 포함', o.lines.slice(codeB.start, codeB.end), ['```bash', 'npm ci', '```']);
check('머리말 끝 = 첫 절', o.introEnd, o.sections[0].start);
const strip = (x) => JSON.parse(JSON.stringify(x, (k, v) => (['start', 'end', 'bodyEnd'].includes(k) ? undefined : v)));
check('sectionize 와 같은 판정 (줄 번호만 다르다)', strip({ title: o.title, intro: o.intro, sections: o.sections }), sectionize(MDF));
check('sectionize 는 줄 번호를 붙이지 않는다', Object.keys(sectionize(MDF).sections[0]), ['level', 'title', 'blocks', 'children']);

console.log('── ④ 비교 · 원문 고치기');
const LONG = '긴 글 '.repeat(500).trim();
const MD = `# 설치 안내

첫 문단이다.

<!-- 편집자 주석: 지우지 마세요 -->

![구성도](img/arch.png)

## 요구 사항

- Node 22
- npm

### 선택

\`\`\`bash
npm ci
\`\`\`

> 인용문 한 줄

## 실행

문단.

## 부록

${LONG}
`;
const src = { owner: 'o', repo: 'r', ref: 'main', path: 'docs' };
const PATH = 'docs/guide/a.md';
const base = buildFileNode(src, { path: PATH, blobSha: gitBlobSha(MD) }, MD, null, new IdGen());
const kidsOf = (n) => n.children.map((c) => c.text);
check('기준 노드 모양', [base.text, kidsOf(base), kidsOf(base.children[0])], ['설치 안내', ['요구 사항', '실행', '부록'], ['선택']]);

let d = diffFileNode(PATH, base, MD);
check('고친 것 없음 → 그대로', [d.changed, d.after === MD, d.ops], [false, true, []]);

let n = clone(base); n.children[1].text = '실행 방법';
d = diffFileNode(PATH, n, MD);
check('절 이름 → 그 견출 줄만', d.after, MD.replace('## 실행\n', '## 실행 방법\n'));
check('바뀜 목록', d.ops, ['절 이름: "실행" → "실행 방법"']);

n = clone(base); n.text = '설치 가이드';
check('문서 이름 → # 제목', diffFileNode(PATH, n, MD).after, MD.replace('# 설치 안내', '# 설치 가이드'));

n = clone(base); n.children[1].notes[0].text = '바뀐 문단.';
check('문단 노트 → 그 문단', diffFileNode(PATH, n, MD).after, MD.replace('\n문단.\n', '\n바뀐 문단.\n'));

n = clone(base); n.children[0].children[0].notes[0].text = 'npm install';
check('코드 노트 → 펜스·언어 유지', diffFileNode(PATH, n, MD).after, MD.replace('```bash\nnpm ci\n```', '```bash\nnpm install\n```'));

n = clone(base); n.children[0].children[0].notes[1].text = '새 인용';
check('인용 노트 → 인용 꼴 유지', diffFileNode(PATH, n, MD).after, MD.replace('> 인용문 한 줄', '> 새 인용'));

n = clone(base); n.notes = n.notes.filter((x) => x.text !== '첫 문단이다.');
d = diffFileNode(PATH, n, MD);
check('노트 지움 → 그 블록만 지움, 주석·사진은 남는다',
  [d.after.includes('첫 문단이다.'), d.after.includes('<!-- 편집자 주석'), d.after.includes('![구성도]'), /\n\n\n/.test(d.after)],
  [false, true, true, false]);

n = clone(base); n.children.splice(1, 1);
d = diffFileNode(PATH, n, MD);
check('절 지움 → 그 절만', d.after, MD.replace('## 실행\n\n문단.\n\n', ''));
check('절 지움은 ⚠ 표시', d.ops, ['⚠ 절 삭제: "실행"']);

n = clone(base); n.children[0].children.splice(0, 1);
check('하위 절 지움', diffFileNode(PATH, n, MD).after, MD.replace('### 선택\n\n```bash\nnpm ci\n```\n\n> 인용문 한 줄\n\n', ''));

n = clone(base);
n.children[0].children.push({ id: 'u1', text: '검증', notes: [{ id: 'un1', type: 'paragraph', text: 'node -v 로 확인' }] });
d = diffFileNode(PATH, n, MD);
check('사용자 노드 → 새 하위 절 (선택 뒤, 실행 앞)', d.after, MD.replace('> 인용문 한 줄\n\n## 실행', '> 인용문 한 줄\n\n### 검증\n\nnode -v 로 확인\n\n## 실행'));
const round = buildFileNode(src, { path: PATH, blobSha: gitBlobSha(d.after) }, d.after, null, new IdGen());
check('왕복 — 다시 가져오면 같은 자리에 같은 절', kidsOf(round.children[0]), ['선택', '검증']);

n = clone(base);
n.children.splice(1, 0, { id: 'u2', text: '설정', children: [{ id: 'u3', text: '환경 변수' }] });
check('절 사이에 끼운 노드 → 그 자리', diffFileNode(PATH, n, MD).after, MD.replace('> 인용문 한 줄\n\n## 실행', '> 인용문 한 줄\n\n## 설정\n\n### 환경 변수\n\n## 실행'));

n = clone(base); n.children.push({ id: 'u4', text: '맺음' });
check('맨 끝 새 절 — 끝 줄바꿈 유지', diffFileNode(PATH, n, MD).after, MD + '\n## 맺음\n');

n = clone(base); n.children[1].notes.push({ id: 'un2', type: 'paragraph', text: '추가 문단.' });
check('사용자 노트 → 그 절 끝 새 문단', diffFileNode(PATH, n, MD).after, MD.replace('\n문단.\n', '\n문단.\n\n추가 문단.\n'));

n = clone(base);
n.children[1].notes.push({ id: 'un3', type: 'checklist', text: '확인', checked: true }, { id: 'un4', type: 'checklist', text: '배포', checked: false });
check('체크리스트 노트 → 한 목록', diffFileNode(PATH, n, MD).after, MD.replace('\n문단.\n', '\n문단.\n\n- [x] 확인\n- [ ] 배포\n'));

n = clone(base);
n.children[1].children = [{ id: 'm1', text: '할 일', tags: ['메모'] }, { id: 'm2', text: '[메모] 생각' }];
n.children[1].notes.push({ id: 'm3', type: 'paragraph', text: '[메모] 나중에 보기' });
d = diffFileNode(PATH, n, MD);
check('메모 노드·노트는 반영 안 함', [d.changed, d.after === MD], [false, true]);

n = clone(base); n.children[2].notes[0].text = '짧게 바꿈';
d = diffFileNode(PATH, n, MD);
check('잘려 들어온 노트는 고치지 않고 경고', [d.changed, d.warnings.length, d.warnings[0]?.includes('잘려')], [false, 1, true]);

n = clone(base); n.children[0].children.push({ id: 'nf', text: '[새파일] 따로' });
d = diffFileNode(PATH, n, MD);
check('문서 안의 [새파일] 은 절로 + 경고', [d.after.includes('### 따로'), d.warnings.some((w) => w.includes('새파일 표시는 무시'))], [true, true]);

const CR = MD.replace(/\n/g, '\r\n');
n = clone(base); n.children[1].text = '실행 방법';
d = diffFileNode(PATH, n, CR);
check('CRLF 문서는 CRLF 그대로', [d.after.includes('## 실행 방법\r\n'), /[^\r]\n/.test(d.after)], [true, false]);

n = clone(base);
n.children[0].children[0].children = [{ id: 'deep', text: '아주 깊은 노드' }];
d = diffFileNode(PATH, n, MD);
check('4단계 노드 → #### + 경고', [d.after.includes('#### 아주 깊은 노드'), d.warnings.some((w) => w.includes('4단계'))], [true, true]);

console.log('── ⑤ 새 파일');
const docs = [
  { file: { path: 'docs/guide/a.md', blobSha: gitBlobSha(MD) }, markdown: MD, commit: { sha: 'c1111111', date: '2026-09-02T00:00:00.000Z' } },
  { file: { path: 'docs/z.md', blobSha: gitBlobSha('# Z\n') }, markdown: '# Z\n', commit: null },
];
const map = buildDocsMap(src, docs, 'r 문서', '2026-10-14T00:00:00.000Z', new IdGen());
const guide = map.branches[0];
check('준비 — 폴더 노드', folderNodePath(src, guide), 'docs/guide');
guide.children.push({
  id: 'nf1', text: '설치 가이드', tags: ['새파일'],
  notes: [{ id: 'nn1', type: 'paragraph', text: '소개 문단' }, { id: 'nn2', type: 'paragraph', text: '[메모] 초안' }],
  children: [{ id: 'c1', text: '준비', children: [{ id: 'c2', text: '세부' }] }, { id: 'mm1', text: '[메모] 할 일' }],
});
guide.children.push({ id: 'plain', text: '그냥 메모 노드' });
guide.children.push({ id: 'dup', text: '겹침', tags: ['새파일:a.md'] });
map.branches.push({ id: 'nf2', text: '[새파일:howto/faq.md] 자주 묻는 질문', colorKey: 'l1D', side: 'right', children: [{ id: 'q1', text: '설치가 안 돼요' }] });
guide.children[0].children.push({ id: 'inside', text: '[새파일] 문서 안' });
const errs = [];
const existing = new Set(['docs/guide/a.md', 'docs/z.md', 'docs/guide/img.png']);
const nfs = collectNewFiles(src, map.branches, 'docs', existing, errs);
check('새 파일 경로 — 폴더 노드의 폴더 · 중심주제 아래는 문서 폴더', nfs.map((f) => f.path), ['docs/guide/설치-가이드.md', 'docs/howto/faq.md']);
check('표시 없는 노드·문서 안의 표시는 새 파일 아님', nfs.some((f) => ['plain', 'inside'].includes(f.nodeId)), false);
check('이미 있는 경로는 오류', errs.length === 1 && errs[0].includes('docs/guide/a.md'), true);
check('새 파일 원문 — # 제목 · 머리말 · ## · ### · 메모 제외', nfs[0].content, '# 설치 가이드\n\n소개 문단\n\n## 준비\n\n### 세부\n');
check('하위 폴더 사슬', [nfs[1].parentDir, nfs[1].subDirs], ['docs', ['howto']]);
check('renderNewFile 직접', renderNewFile({ id: 'x', text: '[새파일] T\n머리 문단', children: [] }), '# T\n\n머리 문단\n');
const errs2 = [];
const twin = [{ id: 't1', text: '같은', tags: ['새파일'] }, { id: 't2', text: '같은', tags: ['새파일'] }];
collectNewFiles(src, twin, 'docs', new Set(), errs2);
check('같은 이름 둘 → 오류', errs2.length, 1);

console.log('── ⑥ 반영 뒤 맵 맞추기');
const fileRef = collectFileNodes(src, map.branches).find((r) => r.path === 'docs/guide/a.md');
const fileNode = fileRef.node;
fileNode.children[0].children.push({ id: 'u10', text: '검증', notes: [{ id: 'u11', type: 'paragraph', text: 'node -v' }] });
fileNode.children[1].children = [{ id: 'memo1', text: '[메모] 개인 메모' }];
const ch = diffFileNode('docs/guide/a.md', fileNode, MD);
const commit = { sha: 'abcdef1234567890', date: '2026-10-14T01:02:03.000Z' };
const pushed = [
  { path: ch.path, nodeId: ch.nodeId, markdown: ch.after, isNew: false },
  ...nfs.map((f) => ({ path: f.path, nodeId: f.nodeId, markdown: f.content, isNew: true, parentDir: f.parentDir, subDirs: f.subDirs })),
];
const before = JSON.stringify(map);
const m2 = applyPushToMap(map, src, pushed, commit, null, new IdGen());
check('원본 맵 불변', JSON.stringify(map) === before, true);
const f2 = collectFileNodes(src, m2.branches).find((r) => r.path === 'docs/guide/a.md').node;
check('반영한 절은 한 번만 (사용자 노드 → 생성 절로 바뀜, 중복 없음)', kidsOf(f2.children[0]), ['선택', '검증']);
check('메모는 남는다', f2.children[1].children.map((c) => c.text), ['[메모] 개인 메모']);
check('문서 노드 id 유지', f2.id, fileNode.id);
check('파일 sha = 반영한 원문', readFileMeta(f2).blobSha, gitBlobSha(ch.after).slice(0, 7));
check('커밋 기록', readFileMeta(f2).commitSha, 'abcdef1');
const nfNode = collectFileNodes(src, m2.branches).find((r) => r.path === 'docs/guide/설치-가이드.md')?.node;
check('새 파일 노드 → 문서 노드 (링크로 짝지어진다)', nfNode ? [nfNode.id, fileNodePath(src, nfNode)] : null, ['nf1', 'docs/guide/설치-가이드.md']);
check('새파일 태그는 걷힌다', nfNode?.tags, undefined);
check('새 파일의 메모 노드·노트는 남는다', [nfNode?.children.map((c) => c.text), nfNode?.notes.some((x) => x.text === '[메모] 초안')], [['준비', '[메모] 할 일'], true]);
const howto = m2.branches.find((b) => folderNodePath(src, b) === 'docs/howto');
check('하위 폴더 노드가 생기고 그 아래로 옮긴다', howto ? [howto.text, howto.children.map((c) => c.text)] : null, ['howto', ['자주 묻는 질문']]);
check('옮긴 자리에는 남지 않는다', m2.branches.some((b) => b.id === 'nf2'), false);
// 반영 뒤 갱신 도구가 보면 전부 "그대로" 여야 한다 — 같은 원문, 같은 sha
const remote = [
  { path: 'docs/guide/a.md', blobSha: gitBlobSha(ch.after) },
  { path: 'docs/guide/설치-가이드.md', blobSha: gitBlobSha(nfs[0].content) },
  { path: 'docs/howto/faq.md', blobSha: gitBlobSha(nfs[1].content) },
  { path: 'docs/z.md', blobSha: gitBlobSha('# Z\n') },
];
// (알 수 없음) 시각이어도 파일 sha 는 읽힌다 — 예전엔 못 읽어 익명 가져오기 문서가 옛 노드 취급이었다
check('시각 "(알 수 없음)" 이어도 파일 sha',
  readFileMeta({ id: 'z', text: 'Z', notes: [{ id: 'nt-1', type: 'paragraph', text: '최종 업데이트: (알 수 없음) · 파일 03036c1' }] }),
  { updatedAt: '(알 수 없음)', blobSha: '03036c1' });
const up = planUpdate(m2, src, { kind: 'all' }, remote);
check('반영 뒤 update_map_from_github 는 그대로', [up.added.length, up.updated.length, up.removed.length, up.unchanged], [0, 0, 0, 4]);

const m3 = applyPushToMap(map, src, pushed.slice(0, 1), commit, 17, new IdGen());
const f3 = collectFileNodes(src, m3.branches).find((r) => r.path === 'docs/guide/a.md').node;
check('PR 방식 — "PR #17 대기"', pendingPrOf(f3), 17);
check('대기 표시가 있어도 파일 sha 는 읽힌다', readFileMeta(f3).blobSha, gitBlobSha(ch.after).slice(0, 7));
check('대기 지우기', [clearPending(f3), pendingPrOf(f3)], [true, null]);

console.log('── ⑨ 같은 글이 둘 · 새 절 안의 메모 (Codex 리뷰 #639)');
// 같은 문단이 둘인 절에서 첫째만 고치면 — 둘째와 짝지어 고친 것을 "추가" 로 보고, 지운 블록 뒤
// 빈 줄에 겹친 끼워 넣기가 건너뛰어져 고친 내용이 사라졌다
const DUP = '# 문서\n\n## 절\n\nsame\n\nsame\n\n## 끝\n\n끝 문단\n';
const dupNode = () => buildFileNode(src, { path: PATH, blobSha: gitBlobSha(DUP) }, DUP, null, new IdGen());
n = dupNode(); n.children[0].notes[0].text = '바뀐';
d = diffFileNode(PATH, n, DUP);
check('같은 글 둘 — 첫째 고침 → 그 자리만', [d.after, d.ops], [DUP.replace('same\n\nsame', '바뀐\n\nsame'), ['절: 노트 수정 "same" → "바뀐"']]);
n = dupNode(); n.children[0].notes[1].text = '바뀐';
check('같은 글 둘 — 둘째 고침 → 그 자리만', diffFileNode(PATH, n, DUP).after, DUP.replace('same\n\nsame', 'same\n\n바뀐'));
const ORIG = '# 문서\n\n## 절\n\norig\n\nsame\n\n## 끝\n';
n = buildFileNode(src, { path: PATH, blobSha: gitBlobSha(ORIG) }, ORIG, null, new IdGen()); n.children[0].notes[0].text = 'same';
check('고친 글이 옆 글과 같아짐 → 그 자리만', diffFileNode(PATH, n, ORIG).after, ORIG.replace('orig', 'same'));
check('짝짓기 — 같은 글은 같은 자리끼리', align(['바뀐', 'same'], ['same', 'same']), [{ a: 0, b: 0 }, { a: 1, b: 1 }]);
check('짝짓기 — 앞에 하나 더함은 그대로', align(['새', 'x', 'y'], ['x', 'y']), [{ a: 0, b: null }, { a: 1, b: 0 }, { a: 2, b: 1 }]);
check('짝짓기 — 앞을 지움은 그대로', align(['y'], ['x', 'y']), [{ a: null, b: 0 }, { a: 0, b: 1 }]);

// 사용자가 붙인 새 절 안의 메모 — 반영 뒤 맵에서 사라지면 안 된다
{
  const mm = buildDocsMap(src, docs, 'r 문서', '2026-10-14T00:00:00.000Z', new IdGen());
  const fn = collectFileNodes(src, mm.branches).find((r) => r.path === 'docs/guide/a.md').node;
  fn.children.push({
    id: 'u20', text: '새 절', notes: [{ id: 'u21', type: 'paragraph', text: '새 절 문단' }, { id: 'u22', type: 'paragraph', text: '[메모] 절 메모' }],
    children: [{ id: 'u23', text: '[메모] 절 아래 메모' }, { id: 'u24', text: '더 깊은 절', children: [{ id: 'u25', text: '[메모] 깊은 메모' }] }],
  });
  const c9 = diffFileNode('docs/guide/a.md', fn, MD);
  check('새 절 — 메모는 파일에 안 나감', [c9.after.includes('메모'), c9.after.includes('\n## 새 절\n') && c9.after.includes('\n### 더 깊은 절\n')], [false, true]);
  const m9 = applyPushToMap(mm, src, [{ path: c9.path, nodeId: c9.nodeId, markdown: c9.after, isNew: false }], commit, null, new IdGen());
  const f9 = collectFileNodes(src, m9.branches).find((r) => r.path === 'docs/guide/a.md').node;
  const sec = f9.children.find((c) => c.text === '새 절');
  check('새 절은 한 번만 (생성 절로)', [f9.children.filter((c) => c.text === '새 절').length, String(sec?.id).startsWith('u')], [1, false]);
  check('새 절의 메모 노트는 남는다', (sec?.notes ?? []).filter((x) => x.text === '[메모] 절 메모').length, 1);
  check('새 절 아래 메모 노드는 남는다', (sec?.children ?? []).map((c) => c.text), ['더 깊은 절', '[메모] 절 아래 메모']);
  const deep = sec?.children.find((c) => c.text === '더 깊은 절');
  check('더 깊은 절의 메모도 남는다', (deep?.children ?? []).map((c) => c.text), ['[메모] 깊은 메모']);
}

console.log('── ⑦ 확인 코드 · blob sha · 허용 목록 · 짝짓기');
check('git blob sha (hello\\n)', gitBlobSha('hello\n'), 'ce013625030ba8dba906f756967f9e9ca394464a');
const pc = (c) => planCode({ headSha: 'h1', mode: 'pr', files: [{ path: 'a.md', content: c }] });
check('확인 코드 — 같은 계획이면 같다', pc('x') === pc('x'), true);
check('확인 코드 — 내용이 다르면 다르다', pc('x') === pc('y'), false);
check('확인 코드 — 방식이 다르면 다르다', pc('x') === planCode({ headSha: 'h1', mode: 'commit', files: [{ path: 'a.md', content: 'x' }] }), false);
check('확인 코드 — 파일 순서와 무관', planCode({ headSha: 'h', mode: 'pr', files: [{ path: 'a', content: '1' }, { path: 'b', content: '2' }] })
  === planCode({ headSha: 'h', mode: 'pr', files: [{ path: 'b', content: '2' }, { path: 'a', content: '1' }] }), true);
const ENV = 'okpojung/easymindmap=u1,u2; org/*=*\nbare/repo';
check('허용 — 목록의 사용자', pushAllowed(ENV, 'u1', 'okpojung', 'easymindmap'), true);
check('허용 안 함 — 목록 밖 사용자', pushAllowed(ENV, 'u3', 'okpojung', 'easymindmap'), false);
check('허용 — owner/* = *', pushAllowed(ENV, 'anyone', 'org', 'whatever'), true);
check('사용자 목록 없는 항목은 아무도', pushAllowed(ENV, 'u1', 'bare', 'repo'), false);
check('빈 설정이면 아무도', pushAllowed(undefined, 'u1', 'okpojung', 'easymindmap'), false);
check('짝짓기 — 고친 것은 자리대로', align(['a', 'b', 'c'], ['a', 'x', 'c']), [{ a: 0, b: 0 }, { a: 1, b: 1 }, { a: 2, b: 2 }]);
check('짝짓기 — 지운 것', align(['a', 'c'], ['a', 'b', 'c']), [{ a: 0, b: 0 }, { a: null, b: 1 }, { a: 1, b: 2 }]);
check('짝짓기 — 더한 것', align(['a', 'n', 'b'], ['a', 'b']), [{ a: 0, b: 0 }, { a: 1, b: null }, { a: 2, b: 1 }]);

const pv = formatPushPreview({
  mapTitle: 'r 문서', src, headSha: 'abc1234567', mode: 'pr', edits: [ch], newFiles: nfs, conflicts: ['docs/x.md — 충돌'],
  errors: [], warnings: [], notInMap: ['docs/old.md'],
});
check('미리보기 — 쓰지 않았다는 말 · 파일 수 · 충돌 · 방식',
  ['아직 아무것도 쓰지 않았습니다', '수정할 파일 1개', '새로 만들 파일 2개', '건너뛴 파일 1개', 'PR 을 엽니다', '+ ### 검증'].map((s) => pv.includes(s)),
  [true, true, true, true, true, true]);

console.log('── ⑧ 쓰기 클라이언트 (가짜 fetch)');
const calls = [];
const fake = (status, body) => async (url, init) => {
  calls.push({ url, method: init?.method, body: init?.body ? JSON.parse(init.body) : undefined, auth: init?.headers?.Authorization });
  return { ok: status < 300, status, headers: { get: () => null }, json: async () => body, text: async () => JSON.stringify(body) };
};
const w = new GithubWriter('tok', fake(201, { sha: 'tree1' }));
check('configured', w.configured, true);
check('트리 sha', await w.createTree('o', 'r', 'base1', [{ path: 'docs/a.md', content: '# A\n' }]), 'tree1');
check('트리 요청 — base_tree · 100644 · 내용 · 토큰',
  [calls[0].url, calls[0].method, calls[0].body.base_tree, calls[0].body.tree[0], calls[0].auth],
  ['https://api.github.com/repos/o/r/git/trees', 'POST', 'base1', { path: 'docs/a.md', mode: '100644', type: 'blob', content: '# A\n' }, 'Bearer tok']);
calls.length = 0;
await new GithubWriter('tok', fake(200, {})).fastForward('o', 'r', 'main', 'c9');
check('브랜치 앞으로 — force:false', [calls[0].method, calls[0].url, calls[0].body], ['PATCH', 'https://api.github.com/repos/o/r/git/refs/heads/main', { sha: 'c9', force: false }]);
let msg = '';
try { await new GithubWriter('', fake(200, {})).createTree('o', 'r', 'b', []); } catch (e) { msg = e instanceof GithubError ? e.message : String(e); }
check('토큰 없으면 거절', msg.includes('GITHUB_WRITE_TOKEN'), true);
msg = '';
try { await new GithubWriter('tok', fake(422, { message: 'Update is not a fast forward' })).fastForward('o', 'r', 'main', 'c9'); } catch (e) { msg = e instanceof GithubError ? e.message : String(e); }
check('422 → 브랜치가 앞서 나감', [msg.includes('앞서'), msg.includes('fast forward')], [true, true]);

console.log(failed ? `\n실패 ${failed}개` : '\n전부 통과');
if (failed) process.exit(1);
