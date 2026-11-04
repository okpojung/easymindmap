// npx tsx src/utils/variables/variables.test.ts — 변수 문법·엑셀 서식·수식 (2026-10-29)
import { formatCell, formatPhone, partsToSerial } from './excelFormat';
import { evalFormula, FErr, formulaRefs, renameInFormula } from './formula';
import { nameProblem, varsInText, renameInText, fillText } from './varSyntax';
import { evaluateVariables, applyVariableView, variableUsage, parseRaw, variableResults, nodeFirstLine } from './mapVariables';
let failed = 0;
const check = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (ok ? '' : ' — 받음 ' + JSON.stringify(got) + ', 기대 ' + JSON.stringify(want)));
};
// 서식
check('#,##0', formatCell(1234567, '#,##0'), '1,234,567');
check('#,##0 반올림', formatCell(1234.5, '#,##0'), '1,235');
check('#,##0.00', formatCell(1234.5, '#,##0.00'), '1,234.50');
check('₩#,##0', formatCell(2345678000, '₩#,##0'), '₩2,345,678,000');
check('#,##0"원"', formatCell(15000, '#,##0"원"'), '15,000원');
check('음수', formatCell(-1500, '#,##0'), '-1,500');
check('구역 음수', formatCell(-1500, '#,##0;[Red](#,##0)'), '(1,500)');
check('0 구역', formatCell(0, '#,##0;-#,##0;"-"'), '-');
check('0%', formatCell(0.256, '0%'), '26%');
check('0.0%', formatCell(0.256, '0.0%'), '25.6%');
check('끝 쉼표 천 단위', formatCell(1234567, '#,##0,"천"'), '1,235천');
check('#.##', formatCell(3.1, '#.##'), '3.1');
check('0.00E+00', formatCell(12345, '0.00E+00'), '1.23E+04');
check('General', formatCell(1234.5, 'General'), '1234.5');
check('G/표준', formatCell(42, 'G/표준'), '42');
check('날짜', formatCell(partsToSerial(2026, 10, 29), 'yyyy-mm-dd'), '2026-10-29');
check('날짜 한글', formatCell(partsToSerial(2026, 10, 29), 'yyyy"년" m"월" d"일" (aaa)'), '2026년 10월 29일 (목)');
check('시간', formatCell(partsToSerial(2026, 10, 29, 14, 5), 'hh:mm'), '14:05');
check('오전/오후', formatCell(partsToSerial(2026, 10, 29, 14, 5), '오전/오후 h:mm'), '오후 2:05');
check('AM/PM', formatCell(partsToSerial(2026, 10, 29, 9, 30), 'h:mm AM/PM'), '9:30 AM');
check('[h]:mm', formatCell(1.5, '[h]:mm'), '36:00');
check('DBNum4', formatCell(12345, '[DBNum4]G/표준'), '일만이천삼백사십오');
check('DBNum4 일금', formatCell(1500000, '"일금 "[DBNum4]G/표준"원정"'), '일금 백오십만원정');
check('DBNum1', formatCell(2026, '[DBNum1]G/표준'), '二千二十六');
check('글자 @', formatCell('홍길동', '@"님"'), '홍길동님');
check('전화 자동', formatPhone('01012345678'), '010-1234-5678');
check('전화 02', formatPhone('0212345678'), '02-1234-5678');
check('전화 서식', formatPhone('01012345678', '000-0000-0000'), '010-1234-5678');
// 수식
const vals: Record<string, number | string> = { a: 2, b: 3, c: 4, price: 15000, 이름: '정' };
const R = (n: string) => (n in vals ? vals[n] : new FErr('#NAME?'));
check('a*(b+c)', evalFormula('a * (b + c)', R), 14);
check('sum', evalFormula('sum(a,b,c)', R), 9);
check('price*10%', evalFormula('price * 10%', R), 1500);
check('= 앞붙임', evalFormula('=ROUND(10/3, 2)', R), 3.33);
check('IF', evalFormula('IF(a>b, "크다", "작다")', R), '작다');
check('& 잇기', evalFormula('이름 & "님"', R), '정님');
check('0 나누기', String(evalFormula('a/0', R)), '#DIV/0!');
check('모르는 이름', String(evalFormula('zz+1', R)), '#NAME?');
check('0.1+0.2', evalFormula('0.1+0.2', R), 0.3);
check('^ 우선순위', evalFormula('-2^2', R), 4);
check('refs', formulaRefs('sum(a, b) * price + "c"'), ['a', 'b', 'price']);
check('rename 수식', renameInFormula('a + sum(a, ab) & "a"', 'a', 'x'), 'x + sum(x, ab) & "a"');
// 문법
check('이름 공백', nameProblem('a b', []), 'var.err.space');
check('함수 이름', nameProblem('Sum', []), 'var.err.reserved');
check('대소문자만 다름', nameProblem('AMT', ['amt']), 'var.err.caseDup');
check('한글 이름', nameProblem('매출.오늘', []), null);
check('코드 안은 변수 아님', varsInText('a [&x] \`[&y]\`\n\`\`\`\n[&z]\n\`\`\`'), ['x']);
check('이름 바꾸기', renameInText('[&x] 와 [&xy] \`[&x]\`', 'x', 'q'), '[&q] 와 [&xy] \`[&x]\`');
check('채우기', fillText('매출 [&amt]원 [&none]', new Map([['amt', '1,000']])), '매출 1,000원 [&none]');
// 변수 계산
const defs = [
  { name: 'price', type: 'currency' as const, value: '15,000' },
  { name: 'qty', type: 'number' as const, value: '3' },
  { name: 'total', type: 'formula' as const, value: 'price*qty', format: '₩#,##0' },
  { name: 'rate', type: 'percent' as const, value: '25' },
  { name: 'loop', type: 'formula' as const, value: 'loop+1' },
  { name: 'day', type: 'date' as const, value: '2026-10-29', format: 'yyyy.mm.dd' },
  { name: 'empty', type: 'number' as const, value: '' },
];
const ev = evaluateVariables(defs);
check('통화 값', ev.get('price')?.display, '₩15,000');
check('수식 결과', ev.get('total')?.display, '₩45,000');
check('백분율 25 → 25%', ev.get('rate')?.display, '25%');
check('순환 참조', ev.get('loop')?.display, '#REF!');
check('날짜 서식', ev.get('day')?.display, '2026.10.29');
check('빈 값은 그대로', ev.get('empty')?.display, undefined);
check('파싱 실패', String(parseRaw('number', 'abc')), '#VALUE!');
const map = { title: 't', root: { id: 'r', text: '합계 [&total]' }, branches: [{ id: 'a', text: '[&price] x [&qty]' }, { id: 'b', text: '없음 [&empty]' }], settings: { variables: defs } };
const view = applyVariableView(map) as unknown as { root: { text: string; _rawText?: string }; branches: { text: string }[] };
check('값으로 보기', [view.root.text, view.root._rawText, view.branches[0].text, view.branches[1].text], ['합계 ₩45,000', '합계 [&total]', '₩15,000 x 3', '없음 [&empty]']);
const use = variableUsage(map);
check('사용처', [use.get('price'), use.get('qty')?.nodes], [{ nodes: 1, formulas: ['total'] }, 1]);
// 노드 참조 (2026-11-04) — 첫 줄 · 전체 · 원본 속 변수 · 고리 · 없는 노드 · 수식
{
  const ndefs = [
    { name: 'price', type: 'currency' as const, value: '15000' },
    { name: 'nd_1', type: 'node' as const, value: 'A' },
    { name: 'nd_2', type: 'node' as const, value: 'A', format: 'all' },
    { name: 'nd_3', type: 'node' as const, value: 'C' },
    { name: 'nd_4', type: 'node' as const, value: 'GONE' },
    { name: 'nd_5', type: 'node' as const, value: 'N' },
    { name: 'tot', type: 'formula' as const, value: 'nd_5 * 2' },
  ];
  const nmap = { title: 't', root: { id: 'root', text: '참조 [&nd_1] / [&nd_4]' },
    branches: [
      { id: 'A', text: '## **매출** [&price]\n둘째 줄' },
      { id: 'C', text: '고리 [&nd_3]' },
      { id: 'N', text: '1,234' },
      { id: 'D', text: '[&nd_2]' },
    ], settings: { variables: ndefs } };
  const nres = variableResults(nmap);
  check('노드 첫 줄 (제목 표시 떼고 원본 변수 값으로)', nres.get('nd_1')?.display, '**매출** ₩15,000');
  check('노드 전체', nres.get('nd_2')?.display, '## **매출** ₩15,000\n둘째 줄');
  check('자기 자신을 부르는 고리 → #REF!', nres.get('nd_3')?.display, '#REF!');
  check('없는 노드 → #REF!', nres.get('nd_4')?.display, '#REF!');
  check('숫자 모양 노드는 수식에서 숫자', nres.get('tot')?.display, '2468');
  const nview = applyVariableView(nmap) as unknown as { root: { text: string } };
  check('값으로 보기 — 노드 서식은 그대로', nview.root.text, '참조 **매출** ₩15,000 / #REF!');
  check('첫 줄 고르기', nodeFirstLine('\n- [x] 할 일\n다음'), '할 일');
  check('맵 없이 계산하면 노드 참조는 값 없음', evaluateVariables(ndefs).get('nd_1')?.display, undefined);
}
if (failed) { console.log('\n' + failed + '개 실패'); process.exit(1); }
console.log('\nvariables: 모두 통과');
