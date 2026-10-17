// 문서 스냅샷 → EMM 마크다운 단위 테스트 (2026-09-05, MCP 2단계 get_map).
//
//   npm run build && npm run test:mcp
//
// 왜 시험하나: `get_map` 이 돌려주는 마크다운을 AI 가 고쳐 `create_map` 으로
// 되돌린다. **왕복이 어긋나면** 사용자는 "읽어서 조금 고쳤을 뿐인데 가지가
// 사라졌다/합쳐졌다" 로 겪는다. 그래서 ① create_map 이 만든 스냅샷을 그대로
// 되돌리면 같은 트리가 나오는지 ② 메타 주석(base64)을 싣지 않는지 ③ 앱이
// 못 여는 문서는 같은 이유로 거절하는지 ④ 사진 바이트를 대화에 싣지 않는지.
//
// 설계: docs/04-extensions/ai/mcp-connector.md §2-1 · §9.5

import { emmToSnapshot } from '../dist/mcp/emm-to-doc.js';
import { parseFragment } from '../dist/mcp/append-to-map.js';
import { docToEmm, mapFromDoc, DocShapeError } from '../dist/mcp/doc-to-emm.js';

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
  try { fn(); } catch (e) { msg = e instanceof DocShapeError ? e.message : `다른 오류: ${e}`; }
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
  '### 퍼블리싱',
  '',
  '| 상태 | 뜻 |',
  '|---|---|',
  '| private | 보관 |',
  '| public | 무료공개 |',
  '',
].join('\n');

// ── ① 왕복 — create_map 스냅샷 → get_map 본문 → 다시 파싱하면 같은 트리 ──
{
  const snap = emmToSnapshot(MD, '무시됨');
  const out = docToEmm(snap);
  check('노드 수 = 루트 + 가지 트리', out.nodeCount, 8);
  check('사진 없음', out.imageCount, 0);
  check('본문은 첫 H1 로 시작', out.markdown.split('\n')[0], '# 2026 제품 계획');
  check('끝은 개행 하나', out.markdown.endsWith('\n') && !out.markdown.endsWith('\n\n'), true);

  // **왕복은 "같은 트리"가 아니라 "같은 내용"까지다** — emm-Basic 본문에는
  // 메타 주석이 없어 직렬화기 규칙대로 모양이 바뀐다: 목록 항목은 하위
  // 견출로, 여러 줄 노드는 한 줄로, 표만 있는 노드는 `#### 표` 견출 아래
  // 표로. 앱의 [내보내기 ▸ Markdown] 도 본문은 같은 규칙이다. 여기서는
  // ⑴ 견출 가지의 트리는 그대로 ⑵ 표 내용은 글자 그대로 남는지를 본다.
  const again = emmToSnapshot(out.markdown, '무시됨');
  const tree = (nodes) => nodes.map((n) => [n.text.split('\n')[0], tree(n.children ?? [])]);
  check('견출 가지 트리(1분기)는 그대로', tree(again.map.branches)[0], tree(snap.map.branches)[0]);
  check('가지 이름 순서 그대로', again.map.branches.map((b) => b.text), ['1분기', '2분기']);
  check('표 내용이 본문에 글자 그대로', out.markdown.includes('| private | 보관 |'), true);
  const texts = (nodes) => nodes.flatMap((n) => [n.text, ...texts(n.children ?? [])]);
  const flat = texts(again.map.branches).join('\n');
  check('되읽어도 표 행이 남는다', flat.includes('private | 보관'), true);
  check('되읽어도 인용문 글이 남는다', flat.includes('편집 잠금을 먼저 정한다'), true);
}

// ── ② 메타 주석을 싣지 않는다 — AI 에게는 읽을 수 없는 base64 덩어리다 ──
{
  const out = docToEmm(emmToSnapshot(MD, 'x'));
  check('easymindmap:v 주석 없음', /easymindmap:v\d+:/.test(out.markdown), false);
  check('HTML 주석 자체가 없음', out.markdown.includes('<!--'), false);
}

// ── ③ 앱이 못 여는 문서는 **같은 이유로** 거절한다 (mapSession.ts openCloudMap) ──
throws('map 이 없으면 거절', () => mapFromDoc({ v: 2, editor: {} }), '형식을 인식할 수 없습니다');
throws('null 문서도 거절', () => mapFromDoc(null), '형식을 인식할 수 없습니다');
throws('root 없는 map 도 거절', () => mapFromDoc({ v: 2, map: { title: 'x', branches: [] } }), '형식을 인식할 수 없습니다');
check('현행 형식은 그대로 연다', mapFromDoc(emmToSnapshot(MD, 'x')).title, '2026 제품 계획');

// ── ④ 사진 — data URL 은 files/ 경로로 바뀌고 바이트는 본문에 없다 ──────
{
  const snap = emmToSnapshot(MD, 'x');
  const png = 'data:image/png;base64,' + Buffer.from('not-really-a-png-but-bytes').toString('base64');
  snap.map.branches[0].image = { src: png, w: 10, h: 10 };
  const out = docToEmm(snap);
  check('사진 1장으로 센다', out.imageCount, 1);
  check('본문에 base64 가 없다', out.markdown.includes('base64,'), false);
  check('본문은 files/ 경로를 가리킨다', /\(files\/img-1\.png\)/.test(out.markdown), true);
}

// ── 저장소로 옮긴 사진·첨부 (2026-10-17) — 저장 때 서버가 data URL 사진을 `/v1/attachments/<id>` 로 바꾼다.
// 예전에는 직렬화기가 이 상대 경로를 몰라 get_map 에서 사진이 빠졌다(import_pdf 실측: 12장 중 5장만 보임)
{
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const doc = { v: 2, map: { title: 'T', root: { id: 'root', text: 'T' }, branches: [
    { id: 'a', text: '그림 (p.1)', images: [{ src: '/v1/attachments/abc-1', w: 10, h: 10, afterLine: 1 }] },
    { id: 'b', text: '작은 그림', images: [{ src: png, w: 1, h: 1, afterLine: 1 }] },
    { id: 'c', text: '단일', image: { src: '/v1/attachments/abc-2', w: 5, h: 5 }, children: [
      { id: 'd', text: '같은 사진', images: [{ src: '/v1/attachments/abc-1', w: 10, h: 10, afterLine: 1 }] },
    ] },
    { id: 'e', text: '첨부', attachments: [{ id: 'f1', name: '보고서.pdf', url: '/v1/attachments/pdf-9' }] },
  ] } };
  // 옛 단일 image 와 images 가 함께 있는 노드 — 직렬화기는 images 만 내보낸다
  doc.map.branches.push({ id: 'g', text: '둘 다', image: { src: '/v1/attachments/legacy-9', w: 5, h: 5 }, images: [{ src: '/v1/attachments/abc-1', w: 10, h: 10, afterLine: 1 }] });
  const before = JSON.stringify(doc);
  const out = docToEmm(doc, { origin: 'https://api.example.kr/' });
  check('저장소 사진 → 서버 주소로 보인다(같은 사진이 두 노드면 두 번)', (out.markdown.match(/\]\(https:\/\/api\.example\.kr\/v1\/attachments\/abc-[12]#emm=\d+x\d+\)/g) ?? []).length, 4);
  check('표시 크기를 주소 끝 조각에 단다', [out.markdown.includes('/v1/attachments/abc-1#emm=10x10)'), out.markdown.includes('/v1/attachments/abc-2#emm=5x5)')], [true, true]);
  check('문서 안 사진은 그대로 files/ 경로', /\(files\/img-1\.png\)/.test(out.markdown), true);
  check('첨부(상대 경로)도 서버 주소로', out.markdown.includes('📎 [보고서.pdf](https://api.example.kr/v1/attachments/pdf-9)'), true);
  check('사진 수 — 문서 안 1 · 저장소 2(같은 사진은 한 번, images 가 있으면 옛 image 는 안 셈)', [out.imageCount, out.storedImageCount, out.markdown.includes('legacy-9')], [1, 2, false]);
  check('원본 문서는 바꾸지 않는다', JSON.stringify(doc), before);
  const plain = docToEmm(doc);
  check('origin 이 없으면 예전 그대로(저장소 사진 없음)', [/attachments/.test(plain.markdown), plain.storedImageCount], [false, 0]);
  // 왕복 — AI 가 이 본문을 create_map 으로 되돌리면 같은 저장소 사진이 **원래 크기로**, 서버가 저장하는 상대 경로로 들어간다
  const back = emmToSnapshot(out.markdown, 'T');
  const imgsOf = (ns, acc = []) => { for (const n of ns ?? []) { for (const im of n.images ?? []) acc.push([n.text, im.src, im.w, im.h]); imgsOf(n.children, acc); } return acc; };
  check('왕복 — create_map: 같은 저장소 사진 · 원래 표시 크기 · 상대 경로', imgsOf(back.map.branches).filter((x) => /attachments/.test(x[1])),
    [['그림 (p.1)', '/v1/attachments/abc-1', 10, 10], ['단일', '/v1/attachments/abc-2', 5, 5], ['같은 사진', '/v1/attachments/abc-1', 10, 10], ['둘 다', '/v1/attachments/abc-1', 10, 10]]);
  // append_to_map 도 같은 규칙
  const app = parseFragment('## 붙인 그림\n\n![x](https://api.example.kr/v1/attachments/zz-1#emm=320x96)\n');
  check('왕복 — append_to_map 도 원래 크기 · 상대 경로', imgsOf(app.nodes).map((x) => [x[1], x[2], x[3]]), [['/v1/attachments/zz-1', 320, 96]]);
  // 조각이 없으면(남의 서버일 수 있다) 손대지 않는다
  const other = emmToSnapshot('# T\n\n## 남의 첨부\n\n![x](https://other.example/v1/attachments/q-1)\n', 'T');
  check('조각 없는 주소는 그대로(자리표시 크기)', imgsOf(other.map.branches).map((x) => [x[1], x[2], x[3]]), [['https://other.example/v1/attachments/q-1', 320, 200]]);
}

console.log(failed === 0 ? '\n모두 통과' : `\n실패 ${failed}건`);
process.exit(failed === 0 ? 0 : 1);
