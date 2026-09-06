// 노드 사진 파싱 — ![](url) 의 src 판정 (2026-09-06).
//
//   ① 원격 http(s) → 노드 사진(images), 본문에는 대체 텍스트만 (예전 그대로)
//   ② 내장 data:image/* → 노드 사진 (새로 — AI(MCP)가 바이트를 직접 싣는다)
//   ③ 그 밖의 경로(files/img-1.png 같은 상대 경로)는 예전처럼 사진이 아니다
//      (ZIP 불러오기가 따로 처리한다)
//
//   npx tsx test/inline-images.test.ts

import { parseMarkdownToMap } from '../src/parse';

let failed = 0;
function check(name: string, got: unknown, want: unknown): void {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  const ok = g === w;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      받음 ${g}\n      기대 ${w}`}`);
}

const TINY = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

{
  const m = parseMarkdownToMap('# T\n\n## 사진 있는 가지\n\n![캡처](https://x.test/a.png)\n', 'T')!;
  const n = m.branches[0];
  check('① 원격 사진 → images', n.images?.map((i) => i.src), ['https://x.test/a.png']);
  check('① 본문은 견출 그대로', n.text, '사진 있는 가지');
}
{
  const m = parseMarkdownToMap(`# T\n\n## 오류\n\n![오류 화면](${TINY})\n\n- 원인\n`, 'T')!;
  const n = m.branches[0];
  check('② data URL 사진 → images', n.images?.map((i) => i.src.slice(0, 22)), ['data:image/png;base64,']);
  check('② 자리표시 크기 (실측은 앱/API 몫)', [n.images![0].w, n.images![0].h], [320, 200]);
  check('② 기본 배치: 사진뿐인 문단은 견출 노드에 합쳐지고 대체 텍스트는 버린다 (http 와 같다)', n.text, '오류');
  check('② 사진 뒤 목록은 자식', n.children?.map((c) => c.text), ['원인']);
}
{
  const m = parseMarkdownToMap(`# T\n\n## ![](${TINY})\n`, 'T')!;
  check('② 대체 텍스트 없는 사진만 → 노드 이름 "사진"', m.branches[0].text, '사진');
}
{
  const m = parseMarkdownToMap('# T\n\n## 가지\n\n![p](files/img-1.png)\n', 'T')!;
  check('③ 상대 경로는 사진이 아니다 (대체 텍스트만)', m.branches[0].images ?? [], []);
  check('③ 본문은 견출 그대로', m.branches[0].text, '가지');
}
{
  const m = parseMarkdownToMap('# T\n\n## 가지\n\n![p](data:text/plain;base64,QUJD)\n', 'T')!;
  check('data: 이어도 image/* 가 아니면 사진이 아니다', m.branches[0].images ?? [], []);
}

console.log(failed ? `\n${failed}건 실패` : '\n전부 통과');
process.exit(failed ? 1 : 0);
