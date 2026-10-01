// 선택 노드에 Ctrl+V — 그림만이면 첨부, 그 밖에는 하위 노드 (2026-10-01, e2e324).
//   npx tsx src/utils/pasteIntent.test.ts
import { clipboardImageName, pasteIntent } from './pasteIntent';

let failed = 0;
const check = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : ` — 받음 ${JSON.stringify(got)}`}`);
};

const base = { hasImageFile: false, text: '', htmlHasTable: false, htmlImageCount: 0 };

// ① 캡처만 — 첨부
check('① 그림 파일만', pasteIntent({ ...base, hasImageFile: true }), 'attach-image');
check('① 그림 + 공백뿐인 글자', pasteIntent({ ...base, hasImageFile: true, text: ' \n\t' }), 'attach-image');

// ② 글자가 같이 오면 하위 노드 (기사·설명이 붙은 그림)
check('② 그림 + 글자', pasteIntent({ ...base, hasImageFile: true, text: '설명' }), 'child-node');
check('② 글자만', pasteIntent({ ...base, text: '한 줄' }), 'child-node');
check('② 기사 사진(html)만', pasteIntent({ ...base, htmlImageCount: 2 }), 'child-node');

// ③ 표는 그림보다 우선 — 엑셀이 표 비트맵을 같이 넣어도 하위 노드(표)
check('③ 표 + 그림 비트맵', pasteIntent({ ...base, hasImageFile: true, htmlHasTable: true, text: '| a |' }), 'child-node');
check('③ 표 + 그림, 글자 없음', pasteIntent({ ...base, hasImageFile: true, htmlHasTable: true }), 'child-node');

// ④ 아무것도 없다
check('④ 빈 클립보드', pasteIntent(base), 'nothing');
check('④ 공백만', pasteIntent({ ...base, text: '   ' }), 'nothing');

// ⑤ 첨부 이름 — 브라우저의 `image.png` 는 시각으로, 진짜 파일 이름은 그대로
const at = new Date(2026, 9, 1, 15, 30, 7); // 2026-10-01 15:30:07 (로컬)
check('⑤ image.png → 캡처-시각.png', clipboardImageName({ name: 'image.png', type: 'image/png' }, at), '캡처-20261001-153007.png');
check('⑤ 이름 없음 + jpeg → .jpg', clipboardImageName({ name: '', type: 'image/jpeg' }, at), '캡처-20261001-153007.jpg');
check('⑤ 이름 없음 + mime 없음 → .png', clipboardImageName({ name: '', type: '' }, at), '캡처-20261001-153007.png');
check('⑤ 실제 파일 이름은 지킨다', clipboardImageName({ name: '회의록-사진.png', type: 'image/png' }, at), '회의록-사진.png');
check('⑤ blob.webp 도 일반 이름', clipboardImageName({ name: 'blob.webp', type: 'image/webp' }, at), '캡처-20261001-153007.webp');
check('⑤ svg+xml → .svg', clipboardImageName({ name: 'image', type: 'image/svg+xml' }, at), '캡처-20261001-153007.svg');

if (failed) { console.log(`\n${failed} FAIL`); process.exit(1); }
console.log('\n모두 통과');
