// parseOutlineLines 단위 테스트 — 다중 노드 추가의 들여쓰기 계층 (2026-09-08).
//
//   npx tsx src/utils/outlineLines.test.ts

import { countOutline, parseOutlineLines } from './outlineLines';

let failed = 0;
function check(name: string, got: unknown, want: unknown): void {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  const ok = g === w;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      받음 ${g}\n      기대 ${w}`}`);
}
const shape = (items: ReturnType<typeof parseOutlineLines>): unknown =>
  items.map((it) => (it.children.length ? [it.text, shape(it.children)] : it.text));

// ── ① 사용자가 붙여 넣은 발표 목차 (2칸 들여쓰기 + '- ' 불릿) ───────────
{
  const text = [
    '- I. 문제정의',
    '  - 10. 연 128억 건 발급, 60%는 즉시 폐기 (1P)',
    '  - 11. 국가 데이터 공백 (13.5조 원의 사각지대) (2P)',
    '- II. 해결구조',
    '  - 20. 간편인증 한 번으로 영수증 통합 (5P)',
    '  - 21. 작동 원리 (3단계 자동 발행) (6P)',
    '- III. 편익',
    '  - 30. 국민 — 연말정산·환불·스미싱 차단 (8P)',
  ].join('\n');
  const r = parseOutlineLines(text);
  check('① 최상위 셋', r.map((x) => x.text), ['I. 문제정의', 'II. 해결구조', 'III. 편익']);
  check('① 들여쓴 줄은 바로 위 항목의 자식', r[0].children.map((x) => x.text),
    ['10. 연 128억 건 발급, 60%는 즉시 폐기 (1P)', '11. 국가 데이터 공백 (13.5조 원의 사각지대) (2P)']);
  check('① 번호는 남기고 불릿만 뗀다', r[1].children[0].text, '20. 간편인증 한 번으로 영수증 통합 (5P)');
  check('① 전체 8개', countOutline(r), 8);
}

// ── ② 들여쓰기 폭은 상대적 — 4칸·탭·2칸 섞여도 된다 ───────────────────
{
  const r = parseOutlineLines('a\n    b\n\tc\n        d\n  e\nf');
  check('② 4칸 → 자식, 탭(4) → 형제, 8칸 → 손자, 2칸 → 다시 a 의 자식', shape(r),
    [['a', ['b', ['c', ['d']], 'e']], 'f']);
}

// ── ③ 불릿 종류 · 빈 줄 · 첫 줄이 들여쓰인 경우 ─────────────────────────
{
  const r = parseOutlineLines('\n  * 하나\n\n  + 둘\n    • 둘-1\n  · 셋\n');
  check('③ 첫 줄이 들여쓰여도 최상위, 빈 줄 무시', r.map((x) => x.text), ['하나', '둘', '셋']);
  check('③ • 불릿도 뗀다', r[1].children.map((x) => x.text), ['둘-1']);
  check('③ 불릿만 있는 줄은 버린다', parseOutlineLines('- \n-\n  -  ').length, 0);
  check('③ 빈 글', parseOutlineLines(''), []);
}

// ── ④ 들여쓰기 없는 예전 입력은 예전처럼 전부 형제 ────────────────────
{
  const r = parseOutlineLines('시장 조사\n경쟁사 분석\n사용자 인터뷰');
  check('④ 평면 목록', shape(r), ['시장 조사', '경쟁사 분석', '사용자 인터뷰']);
}

console.log(failed ? `\n${failed}건 실패` : '\n전부 통과');
process.exit(failed ? 1 : 0);
