// `check_items` 순수 부분 단위 테스트 (2026-09-09).
//
//   npm run build && npm run test:mcp
//
// 왜 시험하나: 이 도구는 **있는 노드를 바꾸는 유일한 도구**다. 체크 한
// 글자 말고 다른 것이 바뀌면 사용자는 "AI 가 내 글을 고쳤다" 로 겪는다.
// ① 본문 체크 줄(- [ ]/[x]/[X] · -*+ · 펜스 안 보호 · 다른 줄 불변)
// ② 체크리스트 노트 ③ `item` 좁히기 ④ 여러 노드 · 못 찾음/모호함은
// 건너뛰고 나머지 진행 ⑤ 루트 ⑥ 원본 불변 · 바뀐 것 없으면 같은 객체
// ⑦ 해제(checked:false) ⑧ listCheckable.
//
// 설계: docs/04-extensions/ai/mcp-connector.md §9.12

import { emmToSnapshot } from '../dist/mcp/emm-to-doc.js';
import { findByPath } from '../dist/mcp/append-to-map.js';
import {
  CHECK_LINE_RE, checkItems, listCheckable, setChecksInNotes, setChecksInText,
} from '../dist/mcp/check-items.js';

let failed = 0;
function check(name, got, want) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  const ok = g === w;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      받음 ${g}\n      기대 ${w}`}`);
}

// ── ① 본문 체크 줄 ─────────────────────────────────────────────────
{
  const t = '데이터스토어 구성\n- [ ] 완료';
  const r = setChecksInText(t, true);
  check('- [ ] → - [x]', r.value, '데이터스토어 구성\n- [x] 완료');
  check('셈: 바뀜 1 · 이미 0 · 대상 1 · 전체 1', [r.changed, r.already, r.matched, r.total], [1, 0, 1, 1]);
  const r2 = setChecksInText(r.value, true);
  check('이미 체크면 그대로 · 같은 문자열 객체', [r2.changed, r2.already, r2.value === r.value], [0, 1, true]);
  check('[X] 도 체크로 본다', setChecksInText('- [X] a', true).already, 1);
  check('[X] 해제 → [ ]', setChecksInText('- [X] a', false).value, '- [ ] a');
  check('* 와 + 마커도', setChecksInText('* [ ] a\n+ [ ] b', true).value, '* [x] a\n+ [x] b');
  check('들여쓴 줄도', setChecksInText('  - [ ] a', true).value, '  - [x] a');
  check('펜스 안의 - [ ] 는 세지 않는다',
    setChecksInText('제목\n```md\n- [ ] 예제\n```\n- [ ] 진짜', true).value,
    '제목\n```md\n- [ ] 예제\n```\n- [x] 진짜');
  check('체크 줄이 아닌 줄은 한 글자도 안 바뀐다',
    setChecksInText('본문 [ ] 대괄호\n- 불릿 [x]\n- [ ] 항목', true).value,
    '본문 [ ] 대괄호\n- 불릿 [x]\n- [x] 항목');
  check('체크 줄 없음 → total 0', setChecksInText('그냥 글', true).total, 0);
  check('정규식은 프런트 mdCheck.ts 와 같다', CHECK_LINE_RE.source, '^[ \\t]*[-*+][ \\t]+\\[([ xX])\\][ \\t]?(.*)$');
}

// ── ② 체크리스트 노트 ──────────────────────────────────────────────
{
  const notes = [
    { id: 'n1', type: 'checklist', text: '완료', checked: false },
    { id: 'n2', type: 'paragraph', text: '설명' },
    { id: 'n3', type: 'checklist', text: '검토' },
  ];
  const r = setChecksInNotes(notes, true);
  check('체크 노트 둘 다 체크', r.value.map((n) => n.checked), [true, undefined, true]);
  check('셈', [r.changed, r.total], [2, 2]);
  check('원본 노트 불변', notes[0].checked, false);
  check('문단 노트는 같은 객체', r.value[1] === notes[1], true);
  check('노트 없음 → undefined 그대로', setChecksInNotes(undefined, true).value, undefined);
}

// ── ③ item 좁히기 ─────────────────────────────────────────────────
{
  const t = '- [ ] 완료\n- [ ] 검토\n- [ ] 완료 보고';
  const r = setChecksInText(t, true, '완료');
  check('"완료" 가 들어간 줄만', r.value, '- [x] 완료\n- [ ] 검토\n- [x] 완료 보고');
  check('셈: 대상 2 · 전체 3', [r.matched, r.total], [2, 3]);
  check('대소문자 무시', setChecksInText('- [ ] Done', true, 'done').changed, 1);
  check('노트도 좁힌다', setChecksInNotes([{ id: 'a', type: 'checklist', text: '검토' }], true, '완료').matched, 0);
}

// ── ④ 맵에서 여러 노드 ──────────────────────────────────────────────
const MD = [
  '# easymindmap 할 일', '',
  '## 0단계 · 실측', '',
  '### 데이터스토어 구성', '', '- [ ] 완료', '',
  '### 이웃 VM 자원 점유', '', '- [ ] 완료', '',
  '## 1단계 · 스키마', '',
  '### maps.owner_id CASCADE 제거', '', '- [ ] 완료', '',
  '### FK 를 RESTRICT 로', '',
  '## 3단계 · 퍼블리싱', '',
  '### 1단계 범위', '', '- [ ] 완료', '',
].join('\n');
const base = () => emmToSnapshot(MD, 'x').map;
const textOf = (map, path) => findByPath(map, path).node.text;

{
  const m = base();
  const r = checkItems(m, ['데이터스토어 구성', 'maps.owner_id CASCADE 제거'], true);
  check('두 노드 체크', [textOf(r.map, '데이터스토어 구성'), textOf(r.map, 'maps.owner_id CASCADE 제거')],
    ['데이터스토어 구성\n- [x] 완료', 'maps.owner_id CASCADE 제거\n- [x] 완료']);
  check('전체 바뀐 수', r.changed, 2);
  check('안 부른 노드는 그대로', textOf(r.map, '이웃 VM 자원 점유'), '이웃 VM 자원 점유\n- [ ] 완료');
  check('원본 맵 불변', textOf(m, '데이터스토어 구성'), '데이터스토어 구성\n- [ ] 완료');
  check('outcome 경로', r.outcomes.map((o) => o.path), ['0단계 · 실측 > 데이터스토어 구성', '1단계 · 스키마 > maps.owner_id CASCADE 제거']);
  check('노드 수·구조 그대로', r.map.branches.map((b) => (b.children ?? []).length), [2, 2, 1]);
}
{
  // 못 찾음·모호함은 건너뛰고 나머지는 진행
  const m = base();
  const r = checkItems(m, ['없는 노드', '1단계', '이웃 VM 자원 점유'], true);
  check('없는 노드 → error', /찾지 못했습니다/.test(r.outcomes[0].error), true);
  check('"1단계" 는 둘(1단계 · 스키마 / 1단계 범위) → 모호 error', /2개/.test(r.outcomes[1].error), true);
  check('나머지는 체크됐다', [r.changed, textOf(r.map, '이웃 VM 자원 점유')], [1, '이웃 VM 자원 점유\n- [x] 완료']);
}
{
  // 경로로 모호함을 푼다
  const m = base();
  const r = checkItems(m, ['3단계 · 퍼블리싱 > 1단계 범위'], true);
  check('경로로 정확히', [r.changed, textOf(r.map, '1단계 범위')], [1, '1단계 범위\n- [x] 완료']);
}
{
  // 체크박스 없는 노드 · 바뀐 것 없음 → 같은 맵 객체
  const m = base();
  const r = checkItems(m, ['FK 를 RESTRICT 로'], true);
  check('체크박스 없음 → total 0 · error 없음', [r.outcomes[0].total, r.outcomes[0].error], [0, undefined]);
  check('바뀐 것 없으면 맵 객체 그대로', r.map === m, true);
  const r2 = checkItems(checkItems(m, ['1단계 범위'], true).map, ['1단계 범위'], true);
  check('이미 체크 → already 1 · changed 0', [r2.outcomes[0].already, r2.changed], [1, 0]);
}
{
  // 같은 노드를 두 번 적어도 한 번만
  const m = base();
  const r = checkItems(m, ['1단계 범위', '1단계 범위'], true);
  check('두 번째는 이미 체크', [r.changed, r.outcomes[1].already], [1, 1]);
}
{
  // id: 로 (앱이 알려 준 선택 노드)
  const m = base();
  const id = findByPath(m, '1단계 범위').node.id;
  const r = checkItems(m, [`id:${id}`], true);
  check('id: 로 정확한 노드', [r.changed, r.outcomes[0].path], [1, '3단계 · 퍼블리싱 > 1단계 범위']);
}
{
  // 빈 목록 거절
  let msg = '';
  try { checkItems(base(), [], true); } catch (e) { msg = e.message; }
  check('빈 nodes 거절', /비어/.test(msg), true);
}

// ── ⑤ 루트 ───────────────────────────────────────────────────────
{
  const m = base();
  m.root = { ...m.root, text: 'easymindmap 할 일\n- [ ] 전체 완료', notes: [{ id: 'r1', type: 'checklist', text: '검수', checked: false }] };
  const r = checkItems(m, ['root'], true);
  check('루트 본문·노트 둘 다', [r.map.root.text, r.map.root.notes[0].checked], ['easymindmap 할 일\n- [x] 전체 완료', true]);
  check('루트 원본 불변', [m.root.text.includes('[ ]'), m.root.notes[0].checked], [true, false]);
  check('루트 outcome 경로 = 중심 주제 이름', r.outcomes[0].path, 'easymindmap 할 일');
}

// ── ⑦ 해제 ──────────────────────────────────────────────────────
{
  const on = checkItems(base(), ['데이터스토어 구성', '1단계 범위'], true).map;
  const off = checkItems(on, ['데이터스토어 구성'], false);
  check('해제', [off.changed, textOf(off.map, '데이터스토어 구성')], [1, '데이터스토어 구성\n- [ ] 완료']);
  check('다른 체크는 그대로', textOf(off.map, '1단계 범위'), '1단계 범위\n- [x] 완료');
}

// ── ⑧ listCheckable ────────────────────────────────────────────────
{
  const m = checkItems(base(), ['1단계 범위'], true).map;
  const rows = listCheckable(m);
  check('체크박스 있는 노드 넷', rows.map((r) => r.path), [
    '0단계 · 실측 > 데이터스토어 구성', '0단계 · 실측 > 이웃 VM 자원 점유',
    '1단계 · 스키마 > maps.owner_id CASCADE 제거', '3단계 · 퍼블리싱 > 1단계 범위',
  ]);
  check('항목·상태', rows[3].items, [{ label: '완료', checked: true }]);
  check('체크박스 없는 노드는 빠진다', rows.some((r) => /RESTRICT/.test(r.path)), false);
}

console.log(failed === 0 ? '\n모두 통과' : `\n실패 ${failed}건`);
process.exit(failed === 0 ? 0 : 1);
