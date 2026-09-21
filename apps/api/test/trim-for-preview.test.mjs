// 유료 맵 미리보기 자르기 단위 테스트 (2026-09-21, `publish/trim-for-preview.ts`).
//
//   npm run build && npm run test:trim
//
// 왜 시험하나: **이것이 새면 파는 물건이 공짜가 된다.** 화면으로는 확인할
// 수 없는 종류의 실수다 — 노트 한 칸이 딸려 나가도 맵은 멀쩡해 보인다.
// 그래서 "남은 것" 이 아니라 **"돌려준 JSON 어디에도 그 글자가 없다"** 로
// 센다 (27b §5.1).
//
// 설계: docs/04-extensions/publish/27b-paid-implementation.md §5

import { trimForPreview } from '../dist/publish/trim-for-preview.js';

let failed = 0;
function check(name, ok, detail = '') {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      ${detail}`}`);
}
/** 돌려준 문서 전체에서 그 글자를 찾는다 — 어디에 숨어 있어도 걸린다 */
const has = (out, s) => JSON.stringify(out).includes(s);

const node = (id, text, extra = {}) => ({ id, text, ...extra });

const doc = () => ({
  map: {
    title: '비밀 보고서',
    settings: { levelFonts: [{ size: 18 }] },
    root: node('root', '중심', {
      colorKey: 'root',
      notes: [{ kind: 'p', text: 'ROOT노트비밀' }],
      links: [{ url: 'https://example.com/ROOT링크비밀' }],
      attachments: [{ id: 'a0', name: 'ROOT첨부.pdf' }],
    }),
    branches: [
      {
        ...node('b1', '1레벨 가지', { colorKey: 'l1A', side: 'right', style: { shape: 'round' } }),
        // ★ 여기가 함정 — 2레벨 노드의 노트에 본문이 통째로 들어 있다
        notes: [{ kind: 'p', text: '본문이통째로들어있는노트' }],
        attachments: [{ id: 'a1', name: '설계도.pdf' }],
        image: { src: 'data:image/png;base64,SECRETIMG' },
        children: [
          {
            ...node('b1-1', '3레벨 — 이것은 사라져야 한다'),
            notes: [{ kind: 'code', text: '3레벨코드비밀' }],
            children: [node('b1-1-1', '4레벨 더 깊이')],
          },
          node('b1-2', '3레벨 둘째'),
        ],
      },
      {
        ...node('b2', '둘째 가지', { colorKey: 'l1B', side: 'left' }),
        children: [node('b2-1', '3레벨 셋째', { images: [{ src: 'INLINEIMG' }] })],
      },
    ],
  },
  editor: { layoutType: 'tree-right', spacingX: 1.1 },
});

// ── ① 깊이 — 중심이 1, 1레벨 가지가 2 ───────────────────────
{
  const { doc: out } = trimForPreview(doc());
  check('① 중심과 1레벨 가지는 남는다',
    has(out, '중심') && has(out, '1레벨 가지') && has(out, '둘째 가지'));
  check('① ★ 3레벨은 사라진다', !has(out, '3레벨'), JSON.stringify(out).slice(0, 200));
  check('① ★ 4레벨도 사라진다', !has(out, '4레벨 더 깊이'));
  check('① 제목은 남는다 (파는 물건의 이름이다)', out.map.title === '비밀 보고서');
  check('① 맵 설정(글꼴)은 남는다 — 겉모습이다', !!out.map.settings);
  check('① editor(레이아웃)도 남는다', out.editor?.layoutType === 'tree-right');
}

// ── ② ★ 노트·첨부·링크·사진은 **깊이와 무관하게** 전부 사라진다 ──
{
  const { doc: out } = trimForPreview(doc());
  check('② ★ 2레벨 노드의 노트가 사라진다 (가장 틀리기 쉬운 자리)',
    !has(out, '본문이통째로들어있는노트'));
  check('② ★ 중심의 노트도 사라진다', !has(out, 'ROOT노트비밀'));
  check('② ★ 중심의 링크도 사라진다', !has(out, 'ROOT링크비밀'));
  check('② ★ 첨부 이름도 사라진다', !has(out, '설계도.pdf') && !has(out, 'ROOT첨부.pdf'));
  check('② ★ 사진 원본도 사라진다', !has(out, 'SECRETIMG') && !has(out, 'INLINEIMG'));
  check('② ★ 3레벨의 코드 노트도 사라진다', !has(out, '3레벨코드비밀'));
  check('② 색·모양은 남는다', has(out, 'l1A') && has(out, 'round'));
}

// ── ③ ★ 모르는 칸은 **기본이 안 내보낸다** (allowlist) ──────
{
  const d = doc();
  d.map.branches[0].새로생긴내용칸 = '언젠가늘어날칸의비밀';
  d.map.root.또다른칸 = { deep: '중첩된비밀' };
  const { doc: out } = trimForPreview(d);
  check('③ ★ 목록에 없는 새 칸은 나가지 않는다',
    !has(out, '언젠가늘어날칸의비밀') && !has(out, '중첩된비밀'));
}

// ── ④ 숫자 — 자르기 **전**을 센다 ──────────────────────────
{
  const { stats } = trimForPreview(doc());
  // root + b1 + b1-1 + b1-1-1 + b1-2 + b2 + b2-1 = 7
  check('④ 전체 노드 수는 자르기 전 기준', stats.nodeCount === 7, String(stats.nodeCount));
  check('④ 최대 깊이 (중심=1 … b1-1-1=4)', stats.maxDepth === 4, String(stats.maxDepth));
  check('④ 첨부 2개', stats.attachmentCount === 2, String(stats.attachmentCount));
  check('④ 노트 3블록', stats.noteCount === 3, String(stats.noteCount));
  check('④ 사진 2장 (노드 1 + 인라인 1)', stats.imageCount === 2, String(stats.imageCount));
  // 남는 것 = root + b1 + b2 = 3
  check('④ ★ 가려진 노드 수 = 7 − 3', stats.hiddenCount === 4, String(stats.hiddenCount));
}

// ── ⑤ 여러 중심주제 (2026-09-15) 도 함께 잘린다 ─────────────
{
  const d = doc();
  d.map.centers = [{
    root: node('c2', '둘째 중심', { colorKey: 'root', notes: [{ kind: 'p', text: '둘째중심노트비밀' }] }),
    branches: [{
      ...node('c2-b1', '둘째 중심의 가지', { colorKey: 'l1A', side: 'right' }),
      children: [node('c2-b1-1', '둘째중심3레벨비밀')],
    }],
    pos: { dx: 900, dy: 0 },
  }];
  const { doc: out, stats } = trimForPreview(d);
  check('⑤ 둘째 중심과 그 1레벨은 남는다',
    has(out, '둘째 중심') && has(out, '둘째 중심의 가지'));
  check('⑤ ★ 둘째 중심의 3레벨은 사라진다', !has(out, '둘째중심3레벨비밀'));
  check('⑤ ★ 둘째 중심의 노트도 사라진다', !has(out, '둘째중심노트비밀'));
  check('⑤ 중심의 자리(pos)는 남는다 — 배치다', out.map.centers[0].pos?.dx === 900);
  check('⑤ 숫자도 둘째 중심을 센다 (7 + 3)', stats.nodeCount === 10, String(stats.nodeCount));
}

// ── ⑥ 깊이를 바꿔 부를 수 있다 ──────────────────────────────
{
  const { doc: d1 } = trimForPreview(doc(), 1);
  check('⑥ limit 1 이면 중심만', has(d1, '중심') && !has(d1, '1레벨 가지'));
  const { doc: d3 } = trimForPreview(doc(), 3);
  check('⑥ limit 3 이면 3레벨까지', has(d3, '3레벨 둘째') && !has(d3, '4레벨 더 깊이'));
  check('⑥ ★ 깊이를 늘려도 노트는 여전히 안 나간다', !has(d3, '3레벨코드비밀'));
}

// ── ⑦ 원본을 건드리지 않는다 ────────────────────────────────
{
  const d = doc();
  trimForPreview(d);
  check('⑦ 원본의 3레벨이 그대로 있다', d.map.branches[0].children.length === 2);
  check('⑦ 원본의 노트가 그대로 있다', !!d.map.branches[0].notes);
}

// ── ⑧ 깨진 문서 — 던지지 않는다 ─────────────────────────────
{
  for (const bad of [null, undefined, 42, 'x', []]) {
    const r = trimForPreview(bad);
    check(`⑧ ${JSON.stringify(bad) ?? 'undefined'} → 빈 미리보기`,
      r.doc === null && r.stats.nodeCount === 0);
  }
  const r = trimForPreview({ map: { title: '빈 맵' } });
  check('⑧ 가지가 없는 맵도 된다', r.doc.map.title === '빈 맵' && Array.isArray(r.doc.map.branches));
}

// ── ⑨ 래퍼가 없는 맵 그 자체도 받는다 ───────────────────────
{
  const { doc: out } = trimForPreview(doc().map);
  check('⑨ 맵을 바로 넣어도 잘린다', out.title === '비밀 보고서' && !has(out, '3레벨'));
}

console.log(failed === 0 ? '\n전부 통과' : `\n${failed}건 실패`);
process.exit(failed ? 1 : 0);
