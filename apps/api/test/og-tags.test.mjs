// 링크 카드 조각 단위 테스트 (2026-09-11, `og-tags.ts`).
//
//   npm run build && npm run test:og
//
// 왜 시험하나: `og:description` 은 **사용자가 쓴 마크다운**에서 만들어진다.
// 줄바꿈과 마크다운 기호가 그대로 새면 카드가 지저분하거나 소개가 아예
// 보이지 않는다 (2026-09-11 카카오톡에서 실제로 겪었다).
//
// 설계: docs/04-extensions/publish/27-publish-share.md §5.6.2

import { describe as describeDoc, esc, buildOgFragment } from '../dist/publish/og-tags.js';

let failed = 0;
function check(name, ok, detail = '') {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      ${detail}`}`);
}
const doc = (root, ...branches) => ({ map: { root: { text: root }, branches: branches.map((t) => ({ text: t })) } });

// ── ① 줄바꿈은 한 칸으로 접힌다 (카카오톡에서 소개가 사라졌던 원인)
//    중심 주제로 잰다 — 가지는 2026-09-12 부터 **이름 한 줄만** 쓰므로
//    여러 줄 처리를 가지로 재면 ⑤와 뜻이 부딪힌다.
{
  const d = describeDoc(doc('첫 줄\n둘째 줄\n\n셋째 줄', '가지1'), '맵이름');
  check('① 줄바꿈이 남지 않는다', !/[\r\n]/.test(d), `받음 ${JSON.stringify(d)}`);
  check('① 줄이 한 칸으로 이어진다', d.includes('첫 줄 둘째 줄 셋째 줄'), `받음 ${JSON.stringify(d)}`);
}

// ── ② 마크다운 기호가 새지 않는다
{
  const d = describeDoc(doc('중심', '**굵게** 와 `코드` 와 [링크](https://a.b)'), '맵이름');
  check('② 굵게 별표가 없다', !d.includes('**'), `받음 ${JSON.stringify(d)}`);
  check('② 글자는 남는다', d.includes('굵게') && d.includes('코드') && d.includes('링크'), `받음 ${JSON.stringify(d)}`);
  check('② 링크 주소는 안 실린다', !d.includes('https://a.b'), `받음 ${JSON.stringify(d)}`);
}
{
  const d = describeDoc(doc('### 견출\n- 불릿 하나\n> 인용', '가지1'), '맵이름');
  check('② 견출·불릿·인용 기호가 없다', !/(^|\s)(###|- |> )/.test(d), `받음 ${JSON.stringify(d)}`);
  check('② 그 글자는 남는다', d.includes('견출') && d.includes('불릿 하나') && d.includes('인용'), `받음 ${JSON.stringify(d)}`);
}
{
  const d = describeDoc(doc('앞\n```js\nconst a = 1;\n```\n뒤', '가지1'), '맵이름');
  check('② 코드블록 속은 안 실린다', !d.includes('const a'), `받음 ${JSON.stringify(d)}`);
  check('② 코드블록 앞뒤 글자는 남는다', d.includes('앞') && d.includes('뒤'), `받음 ${JSON.stringify(d)}`);
}
{
  const d = describeDoc(doc('중심', '사진 ![설명](data:image/png;base64,AAAA) 끝'), '맵이름');
  check('② 사진 data URL 이 안 실린다', !d.includes('base64'), `받음 ${JSON.stringify(d)}`);
}

// ── ③ 원래 하던 일은 그대로 한다 (되돌림 방지)
{
  check('③ 중심 주제가 맵 이름과 같으면 빼고 가지만', describeDoc(doc('맵이름', '가지1', '가지2'), '맵이름') === '가지1 · 가지2');
  check('③ 중심 주제가 다르면 앞에 붙인다', describeDoc(doc('중심', '가지1'), '맵이름') === '중심 — 가지1');
  check('③ 가지는 여섯까지', describeDoc(doc('맵이름', ...'1234567'.split('')), '맵이름') === '1 · 2 · 3 · 4 · 5 · 6');
  check('③ 빈 문서면 기본 문장', describeDoc({}, '맵이름') === 'EasyMindMap 으로 만든 마인드맵입니다.');
  const long = describeDoc(doc('맵이름', 'ㄱ'.repeat(500)), '맵이름');
  check('③ 180자에서 자르고 말줄임', long.length === 180 && long.endsWith('…'), `길이 ${long.length}`);
}

// ── ⑤ 소개는 **맵의 목차**다 (2026-09-12)
{
  // 첫 가지에 본문이 길게 딸려 있어도 이름만 쓴다 — 예전에는 이 한 노드가 180자를 다 먹었다
  const d = describeDoc(doc('맵이름', '개요\n' + '가'.repeat(400), '1단계', '2단계'), '맵이름');
  check('⑤ 가지 본문은 안 실린다', !d.includes('가'.repeat(20)), `받음 ${JSON.stringify(d.slice(0, 60))}`);
  check('⑤ 뒤 가지들이 보인다', d === '개요 · 1단계 · 2단계', `받음 ${JSON.stringify(d)}`);
}
{
  // 본문이 코드로 시작하는 가지 — 여는 울타리 줄이 이름이 되면 안 된다
  const d = describeDoc(doc('맵이름', '```markdown\n## 문제\n```\n실제 이름', '뒤 가지'), '맵이름');
  check('⑤ 울타리 줄이 이름이 되지 않는다', !d.includes('```') && !d.includes('markdown'), `받음 ${JSON.stringify(d)}`);
  check('⑤ 코드 뒤의 글이 이름이 된다', d === '실제 이름 · 뒤 가지', `받음 ${JSON.stringify(d)}`);
}
{
  // 사진만 있는 줄은 건너뛴다
  const d = describeDoc(doc('맵이름', '![설명](data:image/png;base64,AAAA)\n진짜 이름'), '맵이름');
  check('⑤ 사진 줄을 건너뛴다', d === '진짜 이름', `받음 ${JSON.stringify(d)}`);
}
{
  // ★ 맵 이름에 꼬리(-01)가 붙어도 중심 주제를 되풀이하지 않는다
  const d = describeDoc(doc('설계 문서', '가지1'), '설계 문서-01');
  check('⑤ 맵 이름이 중심 주제로 시작하면 뺀다', d === '가지1', `받음 ${JSON.stringify(d)}`);
  const d2 = describeDoc(doc('설계 문서 상세', '가지1'), '설계 문서');
  check('⑤ 중심 주제가 맵 이름으로 시작해도 뺀다', d2 === '가지1', `받음 ${JSON.stringify(d2)}`);
  const d3 = describeDoc(doc('전혀 다른 주제', '가지1'), '설계 문서');
  check('⑤ 정말 다르면 그대로 앞에 붙인다', d3 === '전혀 다른 주제 — 가지1', `받음 ${JSON.stringify(d3)}`);
}

// ── ④ 조각 전체에도 줄바꿈이 없다 (속성 안이 한 줄이어야 한다)
{
  const frag = buildOgFragment({
    publishId: 'abc123', title: '맵이름', doc: doc('중심', '첫 줄\n둘째 줄'),
    hasPreview: true, appOrigin: 'https://app.example.com', apiOrigin: 'https://api.example.com',
  });
  const desc = /<meta property="og:description" content="([^"]*)"/.exec(frag)?.[1] ?? '';
  check('④ og:description 속성 안에 줄바꿈이 없다', desc.length > 0 && !/[\r\n]/.test(desc), `받음 ${JSON.stringify(desc)}`);
  check('④ 따옴표는 그대로 이스케이프된다', esc('그는 "가"라 했다') === '그는 &quot;가&quot;라 했다');
}

console.log(failed ? `\n${failed}개 FAIL` : '\n전부 PASS');
process.exit(failed ? 1 : 0);
