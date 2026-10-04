// 첨부 탭 「첨부파일로 이미지 붙여넣기」 + 첨부 종류 판정 (2026-10-01, e2e324).
//   npx tsx src/utils/clipboardRead.test.ts
import { clipboardImageFiles, clipboardReadErrorMessage, type ClipboardLike } from './clipboardRead';
import { attachmentKindFor, isImageFileName } from './attachmentKind';
import { useLangStore } from '@/i18n';

// 한국어 문구(만드는 순간의 언어로 저장되는 글)를 확인한다 — 언어를 한국어로 고정
useLangStore.getState().setLang('ko');

let failed = 0;
const check = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : ` — 받음 ${JSON.stringify(got)}`}`);
};

const at = new Date(2026, 9, 1, 9, 5, 3);
const item = (types: string[]) => ({
  types,
  getType: async (t: string) => new Blob([`<${t}>`], { type: t }),
});
const fake = (items: ReturnType<typeof item>[]): ClipboardLike => ({ read: async () => items });

const run = async () => {
  // ① 캡처 한 장 — png 와 html 이 같이 와도 그림 하나
  let files = await clipboardImageFiles(fake([item(['text/html', 'image/png'])]), at);
  check('① 그림 1개', files.map((f) => [f.name, f.type, f.size]), [['캡처-20261001-090503.png', 'image/png', 11]]);

  // ② 같은 그림이 두 형식 — png 를 고른다
  files = await clipboardImageFiles(fake([item(['image/jpeg', 'image/png'])]), at);
  check('② png 우선', files.map((f) => f.type), ['image/png']);

  // ③ 그림이 없다
  files = await clipboardImageFiles(fake([item(['text/plain'])]), at);
  check('③ 글자만 → 빈 배열', files.length, 0);
  files = await clipboardImageFiles(fake([]), at);
  check('③ 빈 클립보드 → 빈 배열', files.length, 0);

  // ④ 항목 둘 — 둘 다
  files = await clipboardImageFiles(fake([item(['image/webp']), item(['image/gif'])]), at);
  check('④ 항목 2개', files.map((f) => f.name), ['캡처-20261001-090503.webp', '캡처-20261001-090503.gif']);

  // ⑤ 오류 문장
  check('⑤ 권한 거부', clipboardReadErrorMessage({ name: 'NotAllowedError' }).startsWith('브라우저가 클립보드 읽기를 허용하지'), true);
  check('⑤ 그림 없음', clipboardReadErrorMessage({ name: 'DataError' }).startsWith('클립보드에 그림이 없습니다'), true);
  check('⑤ 그 밖', clipboardReadErrorMessage(new Error('boom')), '클립보드를 읽지 못했습니다 — boom');

  // ⑥ 첨부 종류 — 그림은 file, 목록에서는 이름으로
  check('⑥ png → file', attachmentKindFor({ type: 'image/png' }), 'file');
  check('⑥ mp3 → audio', attachmentKindFor({ type: 'audio/mpeg' }), 'audio');
  check('⑥ mp4 → video', attachmentKindFor({ type: 'video/mp4' }), 'video');
  check('⑥ pdf → file', attachmentKindFor({ type: 'application/pdf' }), 'file');
  check('⑥ 이름으로 그림', [isImageFileName('캡처-1.png'), isImageFileName('a.JPG'), isImageFileName('x.webp')], [true, true, true]);
  check('⑥ 그림 아님', [isImageFileName('보고서.pdf'), isImageFileName('a.mp4'), isImageFileName(undefined), isImageFileName('')], [false, false, false, false]);

  if (failed) { console.log(`\n${failed} FAIL`); process.exit(1); }
  console.log('\n모두 통과');
};
void run();
