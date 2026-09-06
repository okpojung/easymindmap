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


// ── ④ 종류별 노트 배치 (2026-09-05, "코드는 노트코드로" · "긴 문장은 노트 문단으로") ──
{
  const LONG = '가'.repeat(320);
  const md = ['# T', '', '## 설치', '', '```bash', 'npm i', '```', '', '짧은 설명', '', LONG, ''].join('\n');
  const plain = emmToSnapshot(md, 'x');
  const kids = (m) => m.map.branches[0].children.map((c) => c.text.split('\n')[0].slice(0, 12));
  check('기본(말 없음): 코드·문단 전부 자식 노드', kids(plain), ['```bash', '짧은 설명', '가'.repeat(12)]);
  check('기본: 노트 없음', plain.map.branches[0].notes, undefined);
  const code = emmToSnapshot(md, 'x', { codeToNote: true });
  check('code_to_note: 코드는 자식 노드가 아니라', kids(code), ['짧은 설명', '가'.repeat(12)]);
  check('code_to_note: 그 노드의 코드 노트(lang 포함)', code.map.branches[0].notes.map((n) => [n.type, n.lang, n.text]), [['code_block', 'bash', 'npm i']]);
  const long = emmToSnapshot(md, 'x', { longParagraphToNote: 300 });
  check('long 300: 짧은 문단은 자식 노드, 긴 문단은 아니다', kids(long), ['```bash', '짧은 설명']);
  check('long 300: 긴 문단이 문단 노트로', long.map.branches[0].notes.map((n) => [n.type, n.text.length]), [['paragraph', 320]]);
  const both = emmToSnapshot(md, 'x', { codeToNote: true, longParagraphToNote: 300 });
  check('둘 다: 노트 둘, 자식은 짧은 문단만', [kids(both), both.map.branches[0].notes.map((n) => n.type)], [['짧은 설명'], ['code_block', 'paragraph']]);
  check('long 1000: 320자는 그대로 노드', emmToSnapshot(md, 'x', { longParagraphToNote: 1000 }).map.branches[0].notes, undefined);
  check("문자열 'node' 호출도 그대로", kids(emmToSnapshot(md, 'x', 'node')), kids(plain));
}


// ── 내장 사진 (data URL) — 노드 사진 + 실제 크기 (2026-09-06, image-size.ts) ──
{
  const { dataUrlImageSize, displaySize, MAX_IMAGE_BYTES } = await import('../dist/mcp/image-size.js');
  const b64 = (buf) => buf.toString('base64');
  // PNG 머리(IHDR)만 — 디코더가 아니라 머리만 읽는다
  const pngHead = (w, h) => {
    const b = Buffer.alloc(33);
    b.writeUInt32BE(0x89504e47, 0); b.writeUInt32BE(0x0d0a1a0a, 4); b.writeUInt32BE(13, 8);
    b.write('IHDR', 12, 'ascii'); b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20);
    return `data:image/png;base64,${b64(b)}`;
  };
  const gifHead = (w, h) => {
    const b = Buffer.alloc(13); b.write('GIF89a', 0, 'ascii'); b.writeUInt16LE(w, 6); b.writeUInt16LE(h, 8);
    return `data:image/gif;base64,${b64(b)}`;
  };
  const jpegHead = (w, h) => {
    // SOI · APP0(짧게) · SOF0(h, w) · EOI
    const b = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00,
      0xff, 0xc0, 0x00, 0x0b, 0x08, (h >> 8) & 0xff, h & 0xff, (w >> 8) & 0xff, w & 0xff, 0x01, 0x01, 0x11, 0x00,
      0xff, 0xd9]);
    return `data:image/jpeg;base64,${b64(b)}`;
  };
  const tiny = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  check('크기 읽기: 진짜 1×1 PNG', dataUrlImageSize(tiny), { w: 1, h: 1 });
  check('크기 읽기: PNG 1920×1080', dataUrlImageSize(pngHead(1920, 1080)), { w: 1920, h: 1080 });
  check('크기 읽기: GIF 300×120', dataUrlImageSize(gifHead(300, 120)), { w: 300, h: 120 });
  check('크기 읽기: JPEG 800×600', dataUrlImageSize(jpegHead(800, 600)), { w: 800, h: 600 });
  check('크기 읽기: 모르는 것 → null', dataUrlImageSize('data:image/png;base64,QUJD'), null);
  check('표시 폭 640 상한 · 비율 유지', displaySize(1920, 1080), { w: 640, h: 360 });
  check('작은 것은 그대로', displaySize(300, 120), { w: 300, h: 120 });

  const snap = emmToSnapshot(`# 오류\n\n## 3단계\n\n![오류 화면](${pngHead(1920, 1080)})\n\n- 원인\n`, 'x');
  const n = snap.map.branches[0];
  // 'node' 배치: 사진뿐인 문단은 독립 블록이라 **자식 노드**가 된다 (표·코드와 같은 규칙)
  check('사진 문단 → 자식 노드 (대체 텍스트가 이름) + 뒤의 목록은 형제', n.children.map((c) => c.text), ['오류 화면', '원인']);
  const pic = n.children[0];
  check('![](data:) → 그 노드의 사진 src 가 data URL', pic.images?.[0]?.src?.slice(0, 15), 'data:image/png;');
  check('사진 표시 크기 = 640×360 (자리표시 320×200 이 아니다)', [pic.images[0].w, pic.images[0].h], [640, 360]);
  check('견출 노드 자체에는 사진이 없다', n.images ?? null, null);
  const only = emmToSnapshot(`# T\n\n## ![](${tiny})\n`, 'x');
  check('대체 텍스트 없는 사진만 있는 노드 → 이름 "사진"', only.map.branches[0].text, '사진');
  check('1×1 은 자연 크기', [only.map.branches[0].images[0].w, only.map.branches[0].images[0].h], [1, 1]);
  const big = `data:image/png;base64,${'A'.repeat(Math.ceil((MAX_IMAGE_BYTES + 100) / 3) * 4)}`;
  throws('2.5MB 넘는 사진은 거절', () => emmToSnapshot(`# T\n\n## a\n\n![x](${big})\n`, 'x'), '2.5MB');
  check('원격 http 사진은 예전과 같다 (자리표시 크기)',
    (() => { const s = emmToSnapshot('# T\n\n## a\n\n![p](https://x.test/p.png)\n', 'x'); const im = s.map.branches[0].children[0].images[0]; return [im.src, im.w, im.h]; })(),
    ['https://x.test/p.png', 320, 200]);
}

console.log(failed ? `\n${failed}개 실패` : '\n전부 통과');
process.exit(failed ? 1 : 0);
