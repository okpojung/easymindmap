// `append_to_map` 순수 부분 단위 테스트 (2026-09-05).
//
//   npm run build && npm run test:mcp
//
// 왜 시험하나: 이 도구는 **사용자의 기존 맵을 바꾼다.** 엉뚱한 노드에
// 붙거나, 색·방향·레이아웃이 앱 규칙과 다르거나, id 가 겹치면 사용자는
// 그것을 "AI 가 맵을 망쳤다" 로 겪는다. ① 경로 찾기(정확·포함·중복·없음)
// ② 조각 파싱(견출·목록·줄글) ③ 붙이는 모양(색 순환·방향·상속·층별
// 레이아웃·id) ④ 원본 불변 ⑤ 깊이 상한.
//
// 설계: docs/04-extensions/ai/mcp-connector.md §9.6

import { emmToSnapshot } from '../dist/mcp/emm-to-doc.js';
import {
  AppendError, MAX_DEPTH, appendSubtree, findByPath, nodeTitle, parseFragment,
} from '../dist/mcp/append-to-map.js';

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
  try { fn(); } catch (e) { msg = e instanceof AppendError ? e.message : `다른 오류: ${e}`; }
  const ok = msg !== null && msg.includes(wantMsgPart);
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      받음 ${msg}`}`);
}

const MD = [
  '# 주간 회의 정리', '',
  '## 결정 사항', '', '- 배포는 금요일', '- 회의는 격주', '',
  '## 할 일', '', '- 문서 정리', '- 배포 점검', '',
  '## 다음 회의', '', '### 안건', '', '- 회고', '',
].join('\n');
const base = () => emmToSnapshot(MD, 'x').map;
const names = (nodes) => nodes.map((n) => nodeTitle(n));
const kidsOf = (map, path) => findByPath(map, path).node.children ?? [];

// ── ① 경로 찾기 ──────────────────────────────────────────────────────
{
  const m = base();
  check('루트: 빈 문자열', findByPath(m, '').node, null);
  check('루트: root', findByPath(m, 'root').depth, 0);
  check('이름 하나로 어느 깊이든', findByPath(m, '안건').path, '다음 회의 > 안건');
  check('대소문자 무시', findByPath(m, '할 일').depth, 1);
  check('경로 "가지 > 하위"', findByPath(m, '다음 회의 > 안건').depth, 2);
  check('공백 섞인 경로도', findByPath(m, ' 다음 회의>안건 ').path, '다음 회의 > 안건');
  check('정확히 없으면 포함으로', findByPath(m, '다음').path, '다음 회의');
  throws('포함 매칭이 둘이면 고르지 않는다', () => findByPath(m, '회의'), '"다음 회의"');
  throws('없는 이름 → 최상위 가지 이름을 알려 준다', () => findByPath(m, '없는것'), '결정 사항 · 할 일 · 다음 회의');
  // 같은 이름 둘 — 고르지 않는다
  const dup = base();
  dup.branches[0].children.push({ id: 'x1', text: '회고', children: [] });
  throws('중복 이름 → 후보 경로를 전부', () => findByPath(dup, '회고'), '"결정 사항 > 회고"');
  throws('경로가 중간에서 끊기면 없음', () => findByPath(m, '할 일 > 안건'), '찾지 못했습니다');
  // `id:` — 앱이 알려 준 선택 노드로 바로 (이름이 겹쳐도 헷갈리지 않는다)
  const dup2 = base();
  dup2.branches[0].children.push({ id: 'x2', text: '회고', children: [] });
  const target = dup2.branches[2].children[0].children[0]; // 다음 회의 > 안건 > 회고
  check('id: 로 정확한 노드', findByPath(dup2, `id:${target.id}`).path, '다음 회의 > 안건 > 회고');
  check('id:root 는 루트', findByPath(dup2, 'id:root').node, null);
  throws('id 가 없으면 "다시 고르라"', () => findByPath(dup2, 'id:없는id'), '다시 고른');
}

// ── ② 조각 파싱 ──────────────────────────────────────────────────────
{
  check('목록 조각', names(parseFragment('- a\n- b\n  - b1')), ['a', 'b']);
  check('목록 들여쓰기 → 하위', names(parseFragment('- a\n- b\n  - b1')[1].children), ['b1']);
  check('## 견출 조각', names(parseFragment('## x\n### x1\n## y')), ['x', 'y']);
  check('# 로 시작해도 같은 깊이', names(parseFragment('# x\n## x1\n# y')), ['x', 'y']);
  check('견출 아래 목록은 하위', names(parseFragment('## x\n- p\n- q')[0].children), ['p', 'q']);
  throws('빈 조각 거절', () => parseFragment('   '), '비어');
  throws('줄글만 있으면 거절', () => parseFragment('그냥 문장입니다.\n둘째 줄.'), '노드가 하나도');
}

// ── ③ 붙이는 모양 ────────────────────────────────────────────────────
{
  const m = base();
  const r = appendSubtree(m, '할 일', parseFragment('- 회의록 공유\n- 일정표 갱신\n  - 담당 배정'));
  check('부모 아래 맨 뒤에 붙는다', names(kidsOf(r.map, '할 일')), ['문서 정리', '배포 점검', '회의록 공유', '일정표 갱신']);
  check('붙인 수(하위 포함)·바로 아래 수', [r.added, r.topCount], [3, 2]);
  check('경로 문장', r.parentPath, '할 일');
  const added = kidsOf(r.map, '할 일').slice(2);
  check('부모 색을 물려받는다', added.map((n) => n.colorKey), ['l1B', 'l1B']);
  check('손자도 같은 색', added[1].children[0].colorKey, 'l1B');
  check('id 는 mcp- 접두사', added.every((n) => /^mcp-\d+-\d+$/.test(n.id)), true);
  check('가지 노드에는 side 를 주지 않는다', 'side' in added[0], false);
  check('원본 맵은 그대로', names(kidsOf(m, '할 일')), ['문서 정리', '배포 점검']);
  check('다른 가지는 그대로', names(kidsOf(r.map, '결정 사항')), ['배포는 금요일', '회의는 격주']);
}
{
  // 루트 아래 — 색 순환·방향 번갈아 (기존 가지 3개 뒤라 4번째=l1D/left, 5번째=l1E/right)
  const m = base();
  const r = appendSubtree(m, '', parseFragment('## 위험\n- 일정 지연\n## 참고'));
  const b = r.map.branches;
  check('최상위 가지가 는다', names(b), ['결정 사항', '할 일', '다음 회의', '위험', '참고']);
  check('색은 자리로 순환', b.slice(3).map((x) => x.colorKey), ['l1D', 'l1E']);
  check('방향은 홀짝', b.slice(3).map((x) => x.side), ['left', 'right']);
  check('가지의 하위는 그 색', b[3].children[0].colorKey, 'l1D');
  check('원본 가지 수 그대로', m.branches.length, 3);
}
{
  // 층별 레이아웃 — settings.levelLayouts 가 있으면 새 노드에 박힌다 (#374 와 같은 규칙)
  const m = base();
  m.settings = { ...(m.settings ?? {}), levelLayouts: [null, 'radial', 'tree-right', 'tree-right'] };
  const r = appendSubtree(m, '할 일', parseFragment('- x\n  - y'));
  const x = kidsOf(r.map, '할 일')[2];
  check('깊이 2 → tree-right + tree-line', [x.layoutType, x.edgeType], ['tree-right', 'tree-line']);
  check('깊이 3 → tree-right', x.children[0].layoutType, 'tree-right');
  const r2 = appendSubtree(m, '', parseFragment('## z'));
  check('깊이 1 → radial + curve-line', [r2.map.branches[3].layoutType, r2.map.branches[3].edgeType], ['radial', 'curve-line']);
  // 선언이 없으면 같은 깊이의 첫 노드를 따른다
  const m2 = base();
  m2.branches[0].children[0].layoutType = 'tree-left';
  const r3 = appendSubtree(m2, '다음 회의', parseFragment('- w'));
  check('선언 없음 → 같은 깊이 첫 노드의 레이아웃', kidsOf(r3.map, '다음 회의')[1].layoutType, 'tree-left');
  const m3 = base();
  const r4 = appendSubtree(m3, '할 일', parseFragment('- v'));
  check('아무 정보 없으면 layoutType 을 넣지 않는다', 'layoutType' in kidsOf(r4.map, '할 일')[2], false);
}

// ── ④ id 충돌 — 기존 id 와 절대 겹치지 않는다 ────────────────────────
{
  const m = base();
  const ids = new Set();
  const walk = (ns) => ns.forEach((n) => { ids.add(n.id); walk(n.children ?? []); });
  const r = appendSubtree(m, '할 일', parseFragment('- a\n- b'));
  walk(r.map.branches);
  let total = 0; const cnt = (ns) => ns.forEach((n) => { total++; cnt(n.children ?? []); }); cnt(r.map.branches);
  check('id 전부 유일', ids.size, total);
}

// ── ⑤ 깊이 상한 ──────────────────────────────────────────────────────
{
  const m = base();
  let deep = '- d1';
  for (let i = 2; i <= MAX_DEPTH; i++) deep += '\n' + '  '.repeat(i - 1) + `- d${i}`;
  throws('상한을 넘으면 거절', () => appendSubtree(m, '다음 회의 > 안건', parseFragment(deep)), '너무 깊습니다');
}

console.log(failed === 0 ? '\n모두 통과' : `\n실패 ${failed}건`);
process.exit(failed === 0 ? 0 : 1);
