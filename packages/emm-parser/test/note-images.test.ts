// note-images 단위 테스트 (2026-08-20, 노트 HTML 슬라이스).
//
// 이 파일이 지키는 것은 하나다 — **HTML 문자열 안의 `src` 만 정확히
// 건드린다.** 정규식으로 시작했다가 두 번 틀렸고, 둘 다 "조용히 안 바뀐다"
// 로 끝나는 종류였다(내보낸 파일이 그 사진에서만 깨진다). 그래서 틀렸던
// 자리를 이름으로 박아 둔다.

import {
  collectNoteHtmlImageSrcs,
  rewriteNoteHtmlImages,
  rewriteNotesImages,
} from '../src/note-images';

let failed = 0;
function check(name: string, got: unknown, want: unknown): void {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  const ok = g === w;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      받음 ${g}\n      기대 ${w}`}`);
}

// ── ① 읽기 — 따옴표 세 가지 ────────────────────────────────────────
check('① 큰따옴표', collectNoteHtmlImageSrcs('<img src="/v1/attachments/a">'), ['/v1/attachments/a']);
check('① 홑따옴표', collectNoteHtmlImageSrcs("<img src='/v1/attachments/b'>"), ['/v1/attachments/b']);
check('① 따옴표 없음', collectNoteHtmlImageSrcs('<img src=/v1/attachments/c>'), ['/v1/attachments/c']);
check('① 대문자 태그·속성', collectNoteHtmlImageSrcs('<IMG SRC="a.png">'), ['a.png']);
check('① 자기닫음', collectNoteHtmlImageSrcs('<img src="a.png" />'), ['a.png']);

// ── ② 여러 장 · 중복 ───────────────────────────────────────────────
check('② 나온 순서대로',
  collectNoteHtmlImageSrcs('<p>글</p><img src="1.png"><br><img src="2.png">'), ['1.png', '2.png']);
check('② 같은 사진은 한 번', collectNoteHtmlImageSrcs('<img src="a"><img src="a">'), ['a']);

// ── ③ ★ 정규식이 틀렸던 자리 ──────────────────────────────────────
// `\bsrc\s*=` 는 `data-src=` 에도 걸린다 — `-` 와 `s` 사이가 단어 경계다.
// 지연 로딩 자리표시자(1px gif)의 주소를 진짜 사진으로 착각한다.
check('③ data-src 는 src 가 아니다', collectNoteHtmlImageSrcs('<img data-src="lazy.gif">'), []);
check('③ srcset 도 아니다', collectNoteHtmlImageSrcs('<img srcset="a.png 1x">'), []);
check('③ 둘이 같이 있으면 src 만',
  collectNoteHtmlImageSrcs('<img data-src="lazy.gif" src="real.png">'), ['real.png']);
// `<img[^>]*?src=` 는 속성값 안의 `>` 에서 끊긴다. HTML 직렬화는 속성값의
// `>` 를 이스케이프하지 않으므로 기사 alt 텍스트에서 실제로 나올 수 있다.
check('③ 속성값 안의 > 에 속지 않는다',
  collectNoteHtmlImageSrcs('<img alt="a>b" src="real.png">'), ['real.png']);
check('③ 그 경우에도 바꾼다',
  rewriteNoteHtmlImages('<img alt="a>b" src="real.png">', () => 'Z'), '<img alt="a>b" src="Z">');
check('③ <image> 는 <img> 가 아니다', collectNoteHtmlImageSrcs('<image src="a.png">'), []);
check('③ 값 없는 속성이 앞에 있어도', collectNoteHtmlImageSrcs('<img hidden src="a.png">'), ['a.png']);

// ── ④ 바꾸기 — 못 바꾼 것은 그대로 둔다 ───────────────────────────
check('④ 바꾼다', rewriteNoteHtmlImages('<img src="a">', () => 'Z'), '<img src="Z">');
check('④ undefined 면 원문 그대로(따옴표 모양까지)',
  rewriteNoteHtmlImages("<img src='a'>", () => undefined), "<img src='a'>");
check('④ 둘 중 하나만',
  rewriteNoteHtmlImages('<img src="a"><img src="b">', (s) => (s === 'b' ? 'B' : undefined)),
  '<img src="a"><img src="B">');
check('④ 다른 속성·본문은 건드리지 않는다',
  rewriteNoteHtmlImages('<p>기사 <b>본문</b></p><img alt="가" loading="lazy" src="a">', () => 'Z'),
  '<p>기사 <b>본문</b></p><img alt="가" loading="lazy" src="Z">');
check('④ 따옴표 없던 자리에는 큰따옴표를 씌운다',
  rewriteNoteHtmlImages('<img src=a.png>', () => 'Z'), '<img src="Z">');
check('④ 닫히지 않은 따옴표는 포기한다',
  rewriteNoteHtmlImages('<img src="a.png>', () => 'Z'), '<img src="a.png>');

// ── ⑤ 엔티티 왕복 ─────────────────────────────────────────────────
check('⑤ &amp; 는 & 로 읽는다', collectNoteHtmlImageSrcs('<img src="x?a=1&amp;b=2">'), ['x?a=1&b=2']);
check('⑤ & 는 다시 이스케이프해 쓴다',
  rewriteNoteHtmlImages('<img src="a">', () => 'x?a=1&b=2'), '<img src="x?a=1&amp;b=2">');
check('⑤ 따옴표가 든 주소도 속성을 깨지 않는다',
  rewriteNoteHtmlImages('<img src="a">', () => 'x"y'), '<img src="x&quot;y">');

// ── ⑥ 사진 없는 노트 ──────────────────────────────────────────────
check('⑥ 빈 문자열', collectNoteHtmlImageSrcs(''), []);
check('⑥ undefined', collectNoteHtmlImageSrcs(undefined), []);
check('⑥ 글만 있는 노트', collectNoteHtmlImageSrcs('<p>글만 있다</p>'), []);
check('⑥ img 아닌 태그', collectNoteHtmlImageSrcs('<video src="v.mp4">'), []);

// ── ⑦ 노트 배열 — 안 바뀌면 참조를 지킨다 (헛 리렌더 방지) ─────────
{
  const notes = [
    { id: '1', type: 'paragraph', text: 'x', html: '<img src="a">' },
    { id: '2', type: 'code_block', text: 'y' },
  ];
  const out = rewriteNotesImages(notes, () => 'Z');
  check('⑦ 바뀐 노트만 새 객체', out?.[0].html, '<img src="Z">');
  check('⑦ html 없는 노트는 참조 그대로', out?.[1] === notes[1], true);
  check('⑦ 바뀐 게 없으면 배열 참조 그대로', rewriteNotesImages(notes, () => undefined) === notes, true);
  check('⑦ 빈 배열', rewriteNotesImages([], () => 'Z'), []);
  check('⑦ undefined 배열', rewriteNotesImages(undefined, () => 'Z'), undefined);
}

console.log(failed ? `\n${failed}건 실패` : '\n전부 통과');
process.exit(failed ? 1 : 0);
