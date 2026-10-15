// `import_pdf` 순수 부분 단위 테스트 (2026-10-14).
//
//   npm run build && npm run test:mcp
//
// 왜 시험하나: 사용자는 "PDF 를 맵으로, **요약하지 말고 내용을 모두**" 를 원했다. 글자를 하나라도 잃거나
// (글꼴 해석·겹친 글자 제거·머리글 제거가 본문을 먹거나), 제목을 엉뚱하게 고르거나, 문단을 잘못 이으면
// "내용이 빠졌다" 로 겪는다. 시험 PDF 는 이 파일 안에서 만든다(네트워크·파일 없음):
// ① 글자열·이름·참조 읽기 ② 필터 ③ 문서(객체 스트림·증분 저장·암호·PDF 아님) ④ 글꼴(WinAnsi+Differences·
// Type0 ToUnicode 한글·UCS2·Wingdings) ⑤ 내용 스트림(TJ 띄어쓰기·cm 크기·Form·인라인 그림) ⑥ 책갈피(UTF-16·
// 이름 있는 목적지) ⑦ 쪽 범위 ⑧ 줄·겹친 글자·머리글 ⑨ 문단 ⑩ 제목(책갈피·크기·번호·쪽)·목록 단계·노트·글 보존.
//
// 설계: docs/04-extensions/ai/mcp-connector.md §9.17

import { deflateSync } from 'zlib';
import {
  Lexer, MAX_DOC_DECODED, MAX_RUNS_PAGE, MAX_SHOW_BYTES_PAGE, MAX_STREAM_DECODED, PStr, PName, PRef, PdfDoc, PdfError, readPdf, decodeTextString, glyphToUnicode, parseCMap, parsePageRange,
} from '../dist/mcp/pdf-parse.js';
import {
  buildPdfMap, cleanPdfTitle, dedupeRuns, linesFromPages, pageLines, stripMargins, toBlocks,
} from '../dist/mcp/pdf-map.js';

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
  try { fn(); } catch (e) { msg = e instanceof PdfError ? e.message : `다른 오류: ${e}`; }
  const ok = msg !== null && msg.includes(wantMsgPart);
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      받음 ${msg}\n      기대 …${wantMsgPart}…`}`);
}
const lat = (s) => Buffer.from(s, 'latin1');

/** 시험용 PDF — objs[i] 는 (i+1)번 객체: 문자열(본문) 또는 { dict, stream(Buffer), flate } */
function buildPdf(objs, extra = '') {
  const parts = [lat('%PDF-1.5\n%\xe2\xe3\xcf\xd3\n')];
  objs.forEach((o, i) => {
    if (typeof o === 'string') { parts.push(lat(`${i + 1} 0 obj\n${o}\nendobj\n`)); return; }
    const data = o.flate ? deflateSync(o.stream) : o.stream;
    parts.push(lat(`${i + 1} 0 obj\n<< ${o.dict} ${o.flate ? '/Filter /FlateDecode ' : ''}/Length ${data.length} >>\nstream\n`), data, lat('\nendstream\nendobj\n'));
  });
  parts.push(lat(`xref\n0 0\ntrailer\n<< /Root 1 0 R /Size ${objs.length + 1} ${extra} >>\nstartxref\n0\n%%EOF\n`));
  return Buffer.concat(parts);
}
const hex = (s) => Array.from(s).map((c) => c.codePointAt(0).toString(16).padStart(4, '0')).join('');
const TOUNI = (pairs) => lat(`/CIDInit /ProcSet findresource begin 12 dict begin begincmap
1 begincodespacerange <0000> <FFFF> endcodespacerange
${pairs.length} beginbfchar
${pairs.map(([c, u]) => `<${c.toString(16).padStart(4, '0')}> <${hex(u)}>`).join('\n')}
endbfchar
endcmap CMapName currentdict /CMap defineresource pop end end`);

/** 한 쪽짜리 문서 — 글꼴 F1(Helvetica, WinAnsi) · F2(한글 Type0 ToUnicode) */
function onePage(content, { extraObjs = [], fontsExtra = '', outline = '' } = {}) {
  const KO = '가나다라마바사아자차카타파하글자맵책갈피제목본문';
  const pairs = Array.from(KO).map((ch, i) => [i + 1, ch]);
  const objs = [
    `<< /Type /Catalog /Pages 2 0 R ${outline} >>`,
    '<< /Type /Pages /Kids [3 0 R] /Count 1 /MediaBox [0 0 600 800] >>',
    `<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R ${fontsExtra} >> >> /Contents 4 0 R >>`,
    { dict: '', stream: lat(content), flate: true },
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding /FirstChar 32 /LastChar 126 /Widths [' + new Array(95).fill(500).join(' ') + '] >>',
    '<< /Type /Font /Subtype /Type0 /BaseFont /NanumGothic /Encoding /Identity-H /DescendantFonts [7 0 R] /ToUnicode 8 0 R >>',
    '<< /Type /Font /Subtype /CIDFontType2 /BaseFont /NanumGothic /DW 1000 >>',
    { dict: '', stream: TOUNI(pairs), flate: false },
    ...extraObjs,
  ];
  return { bytes: buildPdf(objs), ko: (s) => Array.from(s).map((ch) => (KO.indexOf(ch) + 1).toString(16).padStart(4, '0')).join('') };
}
const KOENC = onePage('').ko;

console.log('── ① 글자열·이름·참조');
const lx = (s) => new Lexer(lat(s)).obj();
check('literal 글자열 이스케이프', Buffer.from(lx('(a\\(b\\) \\101\\nc\\\\)').bytes).toString('latin1'), 'a(b) A\nc\\');
check('괄호 짝', Buffer.from(lx('(a(b)c)').bytes).toString('latin1'), 'a(b)c');
check('hex 글자열 (홀수 자리)', Array.from(lx('<41 42 4>').bytes), [0x41, 0x42, 0x40]);
check('이름의 #xx', lx('/A#20B').name, 'A B');
check('참조', (() => { const r = lx('12 0 R'); return [r instanceof PRef, r.num]; })(), [true, 12]);
check('사전 · 배열 · 숫자', (() => { const d = lx('<< /K [1 -2.5 .5 (x)] /N /Y /B true >>'); return [d.get('K').slice(0, 3), d.get('N').name, d.get('B')]; })(), [[1, -2.5, 0.5], 'Y', true]);
check('UTF-16BE 글자열', decodeTextString(Uint8Array.from([0xfe, 0xff, 0xac, 0x00, 0xb0, 0x98])), '가나');
check('PDFDoc 글자열', decodeTextString(Uint8Array.from([0x41, 0x93])), 'Aﬁ');
check('글리프 이름', [glyphToUnicode('fi'), glyphToUnicode('uniAC00'), glyphToUnicode('a.sc'), glyphToUnicode('f_f'), glyphToUnicode('nosuch')], ['fi', '가', 'a', 'ff', null]);

console.log('── ② 필터');
const flateDoc = new PdfDoc(buildPdf(['<< /Type /Catalog >>', { dict: '', stream: lat('hello flate'), flate: true }, { dict: '/Filter /ASCIIHexDecode', stream: lat('68656C6C6F>') }, { dict: '/Filter /ASCII85Decode', stream: lat('<~BOu!rD]~>') }, { dict: '/Filter /RunLengthDecode', stream: Buffer.from([2, 97, 98, 99, 254, 100, 128]) }]));
const S = (n) => Buffer.from(flateDoc.stream(flateDoc.resolve(new PRef(n, 0)))).toString('latin1');
check('Flate', S(2), 'hello flate');
check('ASCIIHex', S(3), 'hello');
check('ASCII85', S(4), 'hello');
check('RunLength', S(5), 'abcddd');

console.log('── ③ 문서');
throws('PDF 아님', () => new PdfDoc(lat('<html>hi</html>')), 'PDF 파일이 아닙니다');
throws('암호 걸린 PDF', () => new PdfDoc(buildPdf(['<< /Type /Catalog >>', '<< /Filter /Standard >>'], '/Encrypt 2 0 R')), '암호');
// 객체 스트림 안의 쪽 트리 + 증분 저장(뒤의 정의가 이긴다)
// 쪽 트리(6·7번)가 객체 스트림 안에만 있다
const o6 = '<< /Type /Pages /Kids [7 0 R] /Count 1 /MediaBox [0 0 100 100] >> ', o7 = '<< /Type /Page /Parent 6 0 R /Contents 4 0 R >>';
const head = `6 0 7 ${o6.length} `;
const stm2 = buildPdf(['<< /Type /Catalog /Pages 6 0 R >>', '<< /X 1 >>', '<< /X 1 >>', { dict: '', stream: lat('BT ET'), flate: true }, { dict: `/Type /ObjStm /N 2 /First ${head.length}`, stream: lat(head + o6 + o7), flate: true }]);
check('객체 스트림 속 쪽 트리', new PdfDoc(stm2).pages().length, 1);
const incr = Buffer.concat([buildPdf(['<< /Type /Catalog /Title (old) >>']), lat('1 0 obj\n<< /Type /Catalog /Title (new) >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n')]);
check('증분 저장 — 뒤에 나온 정의가 이긴다', Buffer.from(new PdfDoc(incr).root.get('Title').bytes).toString('latin1'), 'new');

console.log('── ④ 글꼴 · ⑤ 내용 스트림');
const p1 = onePage(`BT /F1 12 Tf 72 700 Td (Hello) Tj [( Wor) -30 (ld)] TJ 0 -20 Td [(big) -900 (gap)] TJ ET
q 2 0 0 2 0 0 cm BT /F1 10 Tf 36 200 Td (scaled) Tj ET Q`);
const pp1 = readPdf(p1.bytes);
const runs1 = pp1.pages[0].runs;
check('WinAnsi 글자', runs1.slice(0, 3).map((r) => r.text), ['Hello', ' Wor', 'ld']);
const p1b = onePage(`BT /F2 20 Tf 72 600 Td <${KOENC('글자맵')}> Tj ET`);
check('ToUnicode 한글 — 글자', readPdf(p1b.bytes).pages[0].runs[0].text, '글자맵');
const sc = runs1.find((r) => r.text === 'scaled');
check('cm 배율은 글자 크기에 들어간다', [Math.round(sc.size), Math.round(sc.x0)], [20, 72]);
const lines1 = pageLines(pp1.pages[0], 0);
check('TJ 틈 — 작은 틈은 붙이고, 큰 틈은 띄운다', lines1.slice(0, 2).map((l) => l.text), ['Hello World', 'big gap']);
// Wingdings · Differences · Form XObject · 인라인 그림
const formStream = lat('BT /F1 10 Tf 0 0 Td (inform) Tj ET');
const p2 = onePage(`BT /F3 12 Tf 72 700 Td (n) Tj /F4 12 Tf 90 700 Td (A) Tj ET
q 1 0 0 1 100 300 cm /Fm1 Do Q
BI /W 2 /H 1 /BPC 8 /CS /G ID \x00\xffEI\x45 EI
BT /F1 12 Tf 72 100 Td (after) Tj ET`, {
  fontsExtra: '/F3 9 0 R /F4 10 0 R',
  extraObjs: [
    '<< /Type /Font /Subtype /TrueType /BaseFont /Wingdings-Regular /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /X /Encoding << /BaseEncoding /WinAnsiEncoding /Differences [65 /uni2192] >> >>',
    { dict: '/Type /XObject /Subtype /Form /BBox [0 0 100 100] /Resources << /Font << /F1 5 0 R >> >>', stream: formStream, flate: true },
  ],
});
// Fm1 을 쪽 자원에 붙인다
const p2fix = Buffer.from(p2.bytes.toString('latin1').replace('/Font << /F1 5 0 R /F2 6 0 R /F3 9 0 R /F4 10 0 R >> >>', '/Font << /F1 5 0 R /F2 6 0 R /F3 9 0 R /F4 10 0 R >> /XObject << /Fm1 11 0 R >> >>'), 'latin1');
const r2 = readPdf(p2fix).pages[0].runs;
check('Wingdings n → ■', r2[0].text, '■');
check('Differences 글리프 이름', r2[1].text, '→');
check('Form XObject 의 글자 (위치 = 폼 행렬)', [r2[2]?.text, Math.round(r2[2]?.x0), Math.round(r2[2]?.y)], ['inform', 100, 300]);
check('인라인 그림 건너뛰고 이어 읽기', r2[3]?.text, 'after');

console.log('── ⑥ 책갈피 · ⑦ 쪽 범위');
const two = buildPdf([
  '<< /Type /Catalog /Pages 2 0 R /Outlines 6 0 R /Dests << /sec2 [4 0 R /XYZ 0 500 0] >> >>',
  '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 /MediaBox [0 0 600 800] >>',
  '<< /Type /Page /Parent 2 0 R /Contents 5 0 R >>',
  '<< /Type /Page /Parent 2 0 R /Contents 5 0 R >>',
  { dict: '', stream: lat('BT ET'), flate: true },
  '<< /Type /Outlines /First 7 0 R /Last 8 0 R >>',
  `<< /Title <feff${hex('첫 장')}> /Dest [3 0 R /XYZ 0 700 0] /Next 8 0 R /First 9 0 R /Last 9 0 R >>`,
  '<< /Title (Chapter 2) /A << /S /GoTo /D (sec2) >> >>',
  '<< /Title (1.1 Sub) /Dest [3 0 R /FitH 400] >>',
]);
const o2 = readPdf(two).outline;
check('책갈피 — UTF-16 제목 · 쪽 · top · 하위', o2.map((o) => [o.title, o.page, o.top, o.children.map((c) => [c.title, c.top])]), [['첫 장', 0, 700, [['1.1 Sub', 400]]], ['Chapter 2', 1, 500, []]]);
check('쪽 범위', [...parsePageRange('1-3,5,9-', 10)], [1, 2, 3, 5, 9, 10]);
throws('쪽 범위 꼴', () => parsePageRange('a-b', 10), '알아보지');
throws('쪽 수 상한', () => readPdf(two, { maxPages: 1 }), '나눠 주세요');
check('pages 로 고른 쪽만', readPdf(two, { pages: '2' }).pages.map((p) => p.index), [1]);

console.log('── ⑧ 줄 · 겹친 글자 · 머리글');
const R = (text, x0, y, size = 10, extra = {}) => ({ text, x0, x1: x0 + text.length * size * 0.5, y, size, bold: false, rot: false, ...extra });
const chain = []; for (let k = 0; k < 30; k++) chain.push(R('제목', 50 + k * 0.12, 700 - k * 0.12, 30));
chain.push(R('제목', 50, 700, 30));
check('그림자 사슬(0.12pt 씩 30번) → 하나', dedupeRuns(chain).runs.length, 1);
check('다른 자리의 같은 글은 남긴다', dedupeRuns([R('가', 10, 10), R('가', 30, 10)]).runs.length, 2);
const pg = { width: 600, height: 800, unknownGlyphs: 0, runs: [R('Hello', 50, 700), R('world', 85, 700), R('next line', 50, 686), R('margin note', 10, 300, 8, { rot: true })] };
check('줄 묶기 · 세로 글자는 끝에', pageLines(pg, 0).map((l) => l.text), ['Hello world', 'next line', 'margin note']);
const pages = [1, 2, 3, 4].map((n) => ({ height: 800, lines: [
  { page: n, y: 780, x0: 50, x1: 300, size: 8, bold: false, text: '연간 보고서 2024' },
  { page: n, y: 500, x0: 50, x1: 300, size: 10, bold: false, text: `본문 ${n}` },
  { page: n, y: 20, x0: 290, x1: 300, size: 8, bold: false, text: `- ${n} -` },
  { page: n, y: 30, x0: 50, x1: 300, size: 8, bold: false, text: `${n} ❘ Ⅰ. 장 제목` },
] }));
const strip = stripMargins(pages);
check('되풀이 머리글 · 쪽 번호 · 장 바닥글만 뺀다', [strip.removed.length, pages.map((p) => p.lines.map((l) => l.text))[0]], [12, ['본문 1']]);

console.log('── ⑨ 문단');
const L = (text, y, extra = {}) => ({ page: 0, y, x0: 50, x1: 500, size: 10, bold: false, text, ...extra });
const blocks = toBlocks([
  L('첫 문단 첫 줄', 700), L('첫 문단 둘째 줄', 685), L('새 문단은 줄 간격이 크다', 650),
  L('들여쓰기로 시작하는', 635, { lead: true }), L('문단', 620), L('• 항목 하나', 605), L('• 항목 둘', 590),
  L('An exam-', 575), L('ple of hyphen', 560), L('큰 제목', 530, { size: 16 }),
]);
check('문단 나누기 — 간격·들여쓰기·글머리표·크기', blocks.map((b) => b.text), ['첫 문단 첫 줄 첫 문단 둘째 줄', '새 문단은 줄 간격이 크다', '들여쓰기로 시작하는 문단', '• 항목 하나', '• 항목 둘', 'An example of hyphen', '큰 제목']);
check('글머리표 표시', blocks.map((b) => b.bullet), [false, false, false, true, true, false, false]);

console.log('── ⑩ 맵');
const mk = (spec) => spec.map(([text, size, extra = {}], i) => ({ page: extra.page ?? 0, y: 760 - i * 20, x0: extra.x0 ?? 50, x1: 500, size, bold: false, text, lead: true }));
const fontDoc = { index: 0, lines: mk([
  ['보고서 대제목', 28], ['1. 개요', 18], ['개요 본문입니다.', 10], ['1.1 배경', 10], ['배경 본문입니다.', 10], ['1.2 목적', 10], ['목적 본문.', 10],
  ['• 항목 가', 10], ['- 세부 항목', 10, { x0: 70 }], ['• 항목 나', 10], ['2. 결론', 18], ['결론 본문.', 10],
]) };
const fr = buildPdfMap({ title: '', fileName: 'r.pdf', pageCount: 1, pages: [fontDoc], outline: [], fetchedAt: 'T', source: 's' });
const tree = (ns) => (ns ?? []).map((n) => (n.children ? [n.text, tree(n.children)] : n.text));
check('글자 크기 — 표지 제목은 맵 이름, 큰 글씨 = 가지, 번호 소제목은 한 단계 아래', [fr.structureUsed, fr.map.title, tree(fr.map.branches)], ['fontsize', '보고서 대제목', [
  ['1. 개요', ['개요 본문입니다.', ['1.1 배경', ['배경 본문입니다.']], ['1.2 목적', ['목적 본문.', ['• 항목 가', ['- 세부 항목']], '• 항목 나']]]],
  ['2. 결론', ['결론 본문.']]]]);
check('제목 노드의 첫 노트 = 원문 쪽', fr.map.branches[0].notes[0].text, 'p.1');
const allText = (ns) => (ns ?? []).flatMap((n) => [n.text, ...(n.notes ?? []).filter((x) => !/^p\.\d/.test(x.text)).map((x) => x.text), ...allText(n.children)]);
check('요약하지 않는다 — 원문 글이 모두 맵에 (표지 제목은 맵 이름)', allText(fr.map.branches).sort(), fontDoc.lines.map((l) => l.text).filter((t) => t !== '보고서 대제목').sort());
const noted = buildPdfMap({ title: 'T', fileName: 'r.pdf', pageCount: 1, pages: [fontDoc], outline: [], longTextToNote: 8, fetchedAt: 'T', source: 's' });
check('긴 문단 → 제목 노드의 노트 (글은 그대로)', noted.map.branches[0].notes.map((n) => n.text), ['p.1', '개요 본문입니다.']);
const outlineDoc = { index: 0, lines: mk([['머리말', 10], ['1 Introduction', 14], ['Intro text.', 10], ['2 Method', 14], ['Method text.', 10]]) };
const ol = [{ title: 'Introduction', page: 0, top: 745, children: [] }, { title: 'Method', page: 0, top: 705, children: [] }];
const orr = buildPdfMap({ title: 'Paper', fileName: 'p.pdf', pageCount: 1, pages: [outlineDoc], outline: ol, fetchedAt: 'T', source: 's' });
check('책갈피 — 가지 · 본문의 같은 제목 줄은 빼고 · 앞부분', [orr.structureUsed, tree(orr.map.branches)], ['outline', [['앞부분', ['머리말']], ['Introduction', ['Intro text.']], ['Method', ['Method text.']]]]);
const numDoc = { index: 0, lines: mk([['Ⅰ. 서론', 10], ['서론 내용이다.', 10], ['Ⅱ. 본론', 10], ['본론 내용이다.', 10]]) };
check('번호 꼴', [buildPdfMap({ title: 'T', fileName: 'n.pdf', pageCount: 1, pages: [numDoc], outline: [], fetchedAt: 'T', source: 's' }).structureUsed], ['numbering']);
const flat = [{ index: 0, lines: mk([['쪽 하나 글이다.', 10]]) }, { index: 1, lines: mk([['쪽 둘 글이다.', 10, { page: 1 }]]) }];
check('제목이 없으면 쪽마다', tree(buildPdfMap({ title: 'T', fileName: 'f.pdf', pageCount: 2, pages: flat, outline: [], fetchedAt: 'T', source: 's' }).map.branches), [['p.1', ['쪽 하나 글이다.']], ['p.2', ['쪽 둘 글이다.']]]);
check('출처 노트', fr.map.root.notes[0].text, '출처: PDF "r.pdf" · 1쪽 · s (가져옴 T)');
check('문서 정보 제목 다듬기', ['Microsoft Word - 계획서.docx', 'untitled', 'abc', '연구 보고서'].map(cleanPdfTitle), ['계획서', '', '', '연구 보고서']);

console.log('── #642 Codex 리뷰 — 압축 폭탄 · 뒤에 오는 간접 /Length · 쪽 회전 · 되풀이 /Contents · q 깊이 · 건너뛴 쪽 · 글자 조각 수 · 객체 스트림 /Length · Form 글꼴 상속 · 글자열 크기');
{
  // 압축 폭탄: 몇 KB 짜리 Flate 가 상한(스트림 64MB)을 넘게 풀린다 → 메모리를 다 쓰기 전에 거절
  const bomb = deflateSync(Buffer.alloc(MAX_STREAM_DECODED + 1024 * 1024));
  const bombPdf = (contents, extra) => buildPdf([
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 /MediaBox [0 0 600 800] >>',
    `<< /Type /Page /Parent 2 0 R /Resources << >> /Contents ${contents} >>`,
    ...extra,
  ]);
  const raw = (b) => ({ dict: '/Filter /FlateDecode', stream: b, flate: false });
  throws('압축 폭탄(스트림 하나가 상한 넘게) → 거절', () => readPdf(bombPdf('4 0 R', [raw(bomb)])), '압축을 푼 크기가 너무 큽니다');
  // 하나하나는 상한 아래지만 합이 문서 상한을 넘는다 — 깨진 조각으로 삼켜지지 않고 거절돼야 한다
  const part = deflateSync(Buffer.alloc(60 * 1024 * 1024, 32));
  const n = Math.ceil(MAX_DOC_DECODED / (60 * 1024 * 1024)) + 1;
  const refs = Array.from({ length: n }, (_, i) => `${i + 4} 0 R`).join(' ');
  throws('압축 폭탄(문서 합계가 상한 넘게) → 거절', () => readPdf(bombPdf(`[${refs}]`, Array.from({ length: n }, () => raw(part)))), '압축을 푼 크기가 너무 큽니다');
}
{
  // 내용 스트림의 /Length 가 뒤에 오는 객체를 가리키고, 압축 안 한 글에 'endstream' 글자가 있다
  const content = 'BT /F1 12 Tf 72 700 Td (before endstream after) Tj ET';
  const base = onePage('').bytes.toString('latin1');
  const objs4 = '4 0 obj\n<<  /Filter /FlateDecode /Length ';
  const at = base.indexOf(objs4);
  const end = base.indexOf('endobj\n', at) + 7;
  const body = `4 0 obj\n<< /Length 9 0 R >>\nstream\n${content}\nendstream\nendobj\n`;
  const pdf = lat(base.slice(0, at) + body + base.slice(end).replace('xref', `9 0 obj\n${content.length}\nendobj\nxref`));
  const t = readPdf(pdf).pages[0].runs.map((r) => r.text).join('');
  check('뒤에 오는 간접 /Length — 글 속 "endstream" 에서 자르지 않는다', t, 'before endstream after');
}
{
  // /Rotate 90 (쪽 묶음에서 상속) — 글자 행렬을 거꾸로 돌려 그린 글은 화면에서 가로다
  const base = onePage('BT /F1 12 Tf 0 1 -1 0 500 100 Tm (Hello) Tj ( world) Tj ET').bytes.toString('latin1')
    .replace('/MediaBox [0 0 600 800] >>', '/MediaBox [0 0 600 800] /Rotate 90 >>');
  const pg = readPdf(lat(base)).pages[0];
  check('/Rotate 90 상속 — 쪽 크기 바뀜 · 돌아간 글씨 아님 · 보이는 자리', [pg.width, pg.height, pg.runs.map((r) => [r.rot, Math.round(r.x0), Math.round(r.y)])], [800, 600, [[false, 100, 100], [false, 130, 100]]]);
  check('/Rotate 90 — 한 줄로 묶인다', pageLines(pg, 0).map((l) => l.text), ['Hello world']);
  const r270 = readPdf(lat(onePage('BT /F1 12 Tf 0 -1 1 0 100 700 Tm (Hi) Tj ET').bytes.toString('latin1').replace('/Contents 4 0 R >>', '/Contents 4 0 R /Rotate 270 >>'))).pages[0];
  check('/Rotate 270 (쪽에 직접) — 가로 · 보이는 자리', [r270.width, r270.runs.map((r) => [r.rot, Math.round(r.x0), Math.round(r.y)])], [800, [[false, 100, 100]]]);
}

{
  // 두 번째 리뷰: 같은 내용 스트림을 /Contents 에 되풀이 → 이어 붙인 크기로 거절 (푸는 몫은 캐시로 한 번만 세므로)
  const one = deflateSync(Buffer.alloc(1024 * 1024, 32));
  const reps = Math.ceil(MAX_STREAM_DECODED / (1024 * 1024)) + 2;
  const pdf = buildPdf([
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 /MediaBox [0 0 600 800] >>',
    `<< /Type /Page /Parent 2 0 R /Resources << >> /Contents [${Array(reps).fill('4 0 R').join(' ')}] >>`,
    { dict: '/Filter /FlateDecode', stream: one, flate: false },
  ]);
  throws('같은 스트림을 /Contents 에 되풀이 → 거절', () => readPdf(pdf), '압축을 푼 크기가 너무 큽니다');
  // q 를 깊게(상한 안) 겹쳐도 Q 뒤 좌표계는 그대로 돌아온다
  const deep = 600;
  const qq = onePage(`${'q '.repeat(deep)}2 0 0 2 0 0 cm ${'Q '.repeat(deep)}BT /F1 12 Tf 72 700 Td (Back) Tj ET`).bytes;
  check('q 600단 — Q 뒤 좌표계 복원', readPdf(qq).pages[0].runs.map((r) => [r.text, Math.round(r.x0), Math.round(r.size)]), [['Back', 72, 12]]);
  // pages "1,3" 처럼 건너뛰면 쪽을 넘어 잇지 않는다
  const jb = toBlocks([
    { page: 0, y: 700, x0: 50, x1: 500, size: 10, bold: false, text: '첫 쪽 끝 문장이 이어지는' },
    { page: 2, y: 760, x0: 50, x1: 500, size: 10, bold: false, text: '셋째 쪽 첫 줄' },
    { page: 3, y: 760, x0: 50, x1: 500, size: 10, bold: false, text: '넷째 쪽 첫 줄' },
  ]);
  check('건너뛴 쪽 사이는 잇지 않고 · 바로 다음 쪽은 잇는다', jb.map((b) => b.text), ['첫 쪽 끝 문장이 이어지는', '셋째 쪽 첫 줄 넷째 쪽 첫 줄']);
}
{
  // 세 번째 리뷰: q 깊이를 넘으면 틀린 좌표로 읽지 않고 거절 · 글자 조각 수 상한 · 객체 스트림 안의 /Length
  throws('q 가 상한(1024단)을 넘게 겹치면 거절', () => readPdf(onePage(`${'q '.repeat(1100)}BT /F1 12 Tf 72 700 Td (X) Tj ET`).bytes), '그래픽 상태(q)');
  throws('한 쪽 글자 조각이 상한을 넘으면 거절', () => readPdf(onePage(`BT /F1 12 Tf 72 700 Td ${'(a) Tj '.repeat(MAX_RUNS_PAGE + 1)}ET`).bytes), '글자 조각이');
  const content = 'BT /F1 12 Tf 72 700 Td (before endstream after) Tj ET';
  const base = onePage('').bytes.toString('latin1');
  const at = base.indexOf('4 0 obj\n');
  const end = base.indexOf('endobj\n', at) + 7;
  const body = `4 0 obj\n<< /Length 9 0 R >>\nstream\n${content}\nendstream\nendobj\n`;
  const head = '9 0 ', data = String(content.length);
  const objstm = `10 0 obj\n<< /Type /ObjStm /N 1 /First ${head.length} /Length ${head.length + data.length} >>\nstream\n${head}${data}\nendstream\nendobj\n`;
  const pdf = lat(base.slice(0, at) + body + base.slice(end).replace('xref', `${objstm}xref`));
  check('객체 스트림 안의 /Length — 글 속 "endstream" 에서 자르지 않는다', readPdf(pdf).pages[0].runs.map((r) => r.text).join(''), 'before endstream after');
}
{
  // 네 번째 리뷰: Form XObject 는 Do 때의 글꼴을 물려받는다 · 글자열 하나가 지나치게 크면 객체로 풀기 전에 거절
  const form = onePage('BT /F1 12 Tf ET /Fm1 Do', {
    fontsExtra: '>> /XObject << /Fm1 9 0 R',
    extraObjs: [{ dict: '/Type /XObject /Subtype /Form /BBox [0 0 600 800]', stream: lat('BT 72 700 Td (Inherited) Tj ET'), flate: false }],
  }).bytes;
  check('Form XObject 가 부른 쪽의 글꼴을 물려받는다', readPdf(form).pages[0].runs.map((r) => [r.text, Math.round(r.size)]), [['Inherited', 12]]);
  throws('글자열 하나가 한 쪽 상한보다 크면 거절', () => readPdf(onePage(`BT /F1 12 Tf 72 700 Td (${'a'.repeat(MAX_SHOW_BYTES_PAGE + 1)}) Tj ET`).bytes), '바이트를 넘습니다');
}
console.log('── 통째로: 한 쪽 PDF → 맵');
const whole = onePage(`BT /F2 24 Tf 72 740 Td <${KOENC('책갈피제목')}> Tj ET
BT /F2 10 Tf 72 700 Td <${KOENC('본문글자')}> Tj 0 -14 Td <${KOENC('맵')}> Tj ET
BT /F2 18 Tf 72 640 Td <${KOENC('제목')}> Tj ET
BT /F2 10 Tf 72 610 Td <${KOENC('가나다')}> Tj ET`);
const pr = readPdf(whole.bytes);
const wl = linesFromPages(pr.pages);
const wm = buildPdfMap({ title: '', fileName: 'w.pdf', pageCount: pr.pageCount, pages: wl.pages, outline: pr.outline, fetchedAt: 'T', source: 's' });
check('PDF → 맵 (표지 · 가지 · 문단 이어 붙이기)', [wm.map.title, tree(wm.map.branches)], ['책갈피제목', [['앞부분', ['본문글자 맵']], ['제목', ['가나다']]]]);

console.log(failed ? `\n실패 ${failed}개` : '\n전부 통과');
if (failed) process.exit(1);
