// EMM 마크다운 → 문서 스냅샷 단위 테스트 (2026-09-04, MCP 1단계).
//
//   npm run build && npm run test:mcp
//
// 왜 시험하나: `create_map` 이 만드는 것은 **사용자 문서함에 남는 맵**이다.
// 스냅샷 모양이 프런트엔드가 저장하는 것과 다르면, 맵은 생겼는데 **열리지
// 않거나 빈 화면**으로 보인다 — 사용자는 "저장했는데 없다" 로 겪는다.
// 그래서 ① 껍데기 모양 ② 견출이 없을 때 거절 ③ 블록 배치 선택을 못 박는다.
//
// 설계: docs/04-extensions/ai/mcp-connector.md §2-1

import { emmToSnapshot, titleFromSnapshot, SNAPSHOT_VERSION, EmmParseError }
  from '../dist/mcp/emm-to-doc.js';

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
  try { fn(); } catch (e) { msg = e instanceof EmmParseError ? e.message : `다른 오류: ${e}`; }
  const ok = msg !== null && msg.includes(wantMsgPart);
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      받음 ${msg}`}`);
}

const MD = [
  '# 2026 제품 계획',
  '',
  '## 1분기',
  '',
  '- 검색 개선',
  '- 첨부 용량',
  '',
  '## 2분기',
  '',
  '### 협업',
  '',
  '> 편집 잠금을 먼저 정한다',
  '',
].join('\n');

// ── ① 껍데기 모양 — 프런트엔드 buildSnapshot() 과 같아야 한다 ──────
{
  const snap = emmToSnapshot(MD, '무시됨');
  check('스냅샷 버전', snap.v, SNAPSHOT_VERSION);
  check('스냅샷 버전은 2', snap.v, 2);
  check('editor 기본값', snap.editor,
    { layoutType: 'radial-bidirectional', spacingX: 1, spacingY: 1 });
  check('키는 셋뿐', Object.keys(snap).sort(), ['editor', 'map', 'v']);
  check('제목은 첫 H1', snap.map.title, '2026 제품 계획');
  check('가지 2개', snap.map.branches.map((b) => b.text), ['1분기', '2분기']);
  check('목록은 하위 노드', snap.map.branches[0].children.map((c) => c.text),
    ['검색 개선', '첨부 용량']);
  // 기본 배치가 'node' 라 인용문이 그 노드의 **본문**으로 들어간다
  // (rich-node-content.md §2.2) — 노트로 빼려면 blockPlacement:'note'
  check('### 는 한 단계 더', snap.map.branches[1].children.map((c) => c.text),
    ['협업\n편집 잠금을 먼저 정한다']);
}

// ── ② 맵으로 만들 수 없는 글은 **거절한다** ────────────────────────
throws('견출이 없으면 거절', () => emmToSnapshot('그냥 줄글입니다.\n두 번째 줄.', '제목'), '견출');
throws('중심 주제만 있으면 거절', () => emmToSnapshot('# 제목뿐', '제목'), '가지가 없습니다');
throws('빈 문서는 거절', () => emmToSnapshot('', '제목'), '견출');

// ── ③ 블록 배치 — 앱의 '불러오기' 선택지와 같은 두 갈래 ─────────────
{
  const md = '# 제목\n\n## 가지\n\n> 인용문입니다\n';
  const asNote = emmToSnapshot(md, 'x', 'note');
  const asNode = emmToSnapshot(md, 'x', 'node');
  const noteBlocks = (asNote.map.branches[0].notes ?? []).length;
  const nodeBlocks = (asNode.map.branches[0].notes ?? []).length;
  check("'note' 는 노트로 담는다", noteBlocks > 0, true);
  check("'node' 는 노트로 담지 않는다", nodeBlocks, 0);
}

// ── ④ 제목 — 사용자가 준 이름이 언제나 이긴다 ──────────────────────
{
  const snap = emmToSnapshot(MD, '내가 정한 이름');
  check('문서에 H1 이 있으면 그것', titleFromSnapshot(snap, '대체'), '2026 제품 계획');
  const noH1 = emmToSnapshot('## 가지만 있는 문서\n\n- 항목\n', '대체 제목');
  check('H1 이 없으면 fallback', titleFromSnapshot(noH1, '대체 제목'), '대체 제목');
  check('제목은 255자로 자른다',
    titleFromSnapshot({ map: { title: 'ㄱ'.repeat(300) } }, 'x').length, 255);
}

console.log(failed ? `\n${failed}개 실패` : '\n전부 통과');
process.exit(failed ? 1 : 0);
