// vault-path 단위 테스트 (2026-08-21, vault 미러 슬라이스 1).
//
//   npm run build && npm run test:vault
//
// 왜 이렇게까지 시험하나: vault 미러는 **사용자 폴더에 우리가 파일을 쓰는**
// 기능이다. 이름 규칙이 틀리면 유령 파일이 쌓이거나 **남의 파일을 덮어쓴다.**
// 디스크에 손대기 전에 규칙부터 못 박는 것이 이 슬라이스의 전부다.
//
// 설계: docs/04-extensions/vault-mirror.md §3.1 · §4

import {
  MAX_FILE_NAME_BYTES,
  truncateUtf8,
  vaultName,
  vaultMapFileName,
  vaultFolderName,
  assignMapFileNames,
  vaultAttachmentName,
  vaultRelPath,
  shortId,
  VAULT_OWN_NAMES,
} from '../dist/vault/vault-path.js';

let failed = 0;
function check(name, got, want) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  const ok = g === w;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      받음 ${g}\n      기대 ${w}`}`);
}
const bytes = (s) => Buffer.byteLength(s, 'utf8');
const MID = '11111111-2222-3333-4444-555555555555';

// ── ① 금지문자 ─────────────────────────────────────────────────────
check('① 경로 구분자가 이름에 남으면 안 된다 (하위 폴더가 생겨 버린다)',
  vaultMapFileName('연구/RAG 인덱싱', MID), '연구-RAG 인덱싱.md');
check('① 금지문자 전부',
  vaultName('a/b\\c:d*e?f"g<h>i|j'), 'a-b-c-d-e-f-g-h-i-j');
check('① 줄바꿈·탭은 공백으로 (붙여넣은 제목에 실제로 들어온다)',
  vaultName('앞\n뒤\t끝'), '앞 뒤 끝');
check('① 공백이 이어지면 하나로', vaultName('a    b'), 'a b');

// ── ② Windows 예약어 ──────────────────────────────────────────────
check('② CON', vaultMapFileName('CON', MID), 'CON_.md');
check('② 소문자 con 도 예약이다', vaultMapFileName('con', MID), 'con_.md');
check('② COM1', vaultName('COM1'), 'COM1_');
check('② LPT9', vaultName('LPT9'), 'LPT9_');
check('② COM0 은 예약이 아니다', vaultName('COM0'), 'COM0');
check('② CONSOLE 은 예약이 아니다 (앞부분만 같다)', vaultName('CONSOLE'), 'CONSOLE');

// ── ③ 앞뒤 공백·끝의 점 ───────────────────────────────────────────
check('③ 앞뒤 공백', vaultMapFileName('  회의록  ', MID), '회의록.md');
check('③ 끝의 점', vaultMapFileName('회의록...', MID), '회의록.md');
check('③ 점과 공백이 섞여 끝날 때', vaultName('회의록. . .'), '회의록');
check('③ 가운데 점은 그대로', vaultName('v1.2.3'), 'v1.2.3');

// ── ④ ★ 앞의 점 — 설계에 없던 위험 ────────────────────────────────
// 폴더 이름이 `.attachments` 가 되면 **vault 가 자기 폴더를 덮어쓴다.**
check('④ 앞의 점은 _ 로 (숨김 파일·우리 폴더 충돌 방지)',
  vaultFolderName('.attachments', MID), '_attachments');
check('④ .trash 도', vaultFolderName('.trash', MID), '_trash');
check('④ 점이 여러 개여도 개수를 지킨다', vaultFolderName('..비밀', MID), '__비밀');
check('④ 우리가 쓰는 이름 목록',
  VAULT_OWN_NAMES, ['.attachments', '.trash', '.easymindmap-vault']);
check('④ 우리 이름 중 어느 것도 정규화 결과로 나올 수 없다',
  VAULT_OWN_NAMES.filter((n) => vaultFolderName(n, MID) === n), []);

// ── ⑤ 255바이트 — 글자 수가 아니다 ────────────────────────────────
{
  const long = '가'.repeat(200); // 600바이트
  const out = vaultMapFileName(long, MID);
  check('⑤ 상한을 넘지 않는다', bytes(out) <= MAX_FILE_NAME_BYTES, true);
  // 이름 전체가 255바이트다 — 몸통 252 + `.md` 3. 확장자를 빼고 재면
  // 리눅스에서 `ENAMETOOLONG` 이 난다
  check('⑤ .md 를 포함해서 딱 상한까지', bytes(out), 255);
  check('⑤ 몸통은 252바이트', bytes(out.replace(/\.md$/, '')), 252);
  check('⑤ 글자가 안 깨졌다 (3바이트 한글이 온전하다)', out.endsWith('가.md'), true);
  check('⑤ 84자 담김 (252 = 84×3 + 3)', out.replace('.md', '').length, 84);
}
check('⑤ 이모지를 반으로 자르지 않는다',
  bytes(truncateUtf8('a'.repeat(253) + '가', 255)), 253);
{
  // 자른 끝이 공백이 되면 Windows 가 거부한다 — 자른 **뒤** 다시 다듬어야 한다
  const t = 'a'.repeat(251) + ' 뒤';
  const out = vaultMapFileName(t, MID);
  check('⑤ 자른 끝의 공백을 다시 없앤다', out.endsWith(' .md'), false);
  check('⑤ 그래도 상한 안', bytes(out) <= MAX_FILE_NAME_BYTES, true);
}

// ── ⑥ 빈 제목 ─────────────────────────────────────────────────────
check('⑥ 빈 문자열', vaultMapFileName('', MID), 'Untitled-11111111.md');
check('⑥ 공백만', vaultMapFileName('   ', MID), 'Untitled-11111111.md');
check('⑥ 금지문자만 있어도 이름이 남는다', vaultMapFileName('///', MID), '---.md');
check('⑥ 점만', vaultMapFileName('...', MID), 'Untitled-11111111.md');
check('⑥ id 도 없으면', vaultName('', { ext: '.md' }), 'Untitled.md');
check('⑥ shortId 는 하이픈을 뺀 앞 8자', shortId(MID), '11111111');

// ── ⑦ NFC — macOS 가 NFD 로 준다 ──────────────────────────────────
{
  const nfc = '\uAC00';                     // '가' — 완성형 한 글자(3바이트)
  const nfd = '\u1100\u1161';              // 'ㄱ'+'ㅏ' — 분리형 두 글자(6바이트)
  check('⑦ 입력이 NFD 여도 결과는 NFC', vaultName(nfd), nfc);
  check('⑦ NFC·NFD 가 같은 파일 이름이 된다',
    vaultMapFileName(nfd, MID), vaultMapFileName(nfc, MID));
  check('⑦ NFD 는 원래 더 길다 (그래서 길이 계산 전에 맞춰야 한다)',
    [bytes(nfd), bytes(nfc)], [6, 3]);
}

// ── ⑧ 같은 폴더 안의 제목 중복 ────────────────────────────────────
{
  const A = 'aaaaaaaa-0000-0000-0000-000000000000';
  const B = 'bbbbbbbb-0000-0000-0000-000000000000';
  const early = { mapId: A, title: '연구', createdAt: '2026-01-01T00:00:00Z' };
  const late = { mapId: B, title: '연구', createdAt: '2026-02-01T00:00:00Z' };

  const r1 = assignMapFileNames([early, late]);
  check('⑧ 먼저 만든 맵이 원래 이름을 지킨다', r1.get(A), '연구.md');
  check('⑧ 나중 것이 id 를 단다', r1.get(B), '연구-bbbbbbbb.md');

  // ★ 순서를 바꿔 넣어도 답이 같아야 한다 — 아니면 자동저장마다 두 파일이
  //   이름을 바꿔 가며 지워졌다 다시 쓰인다
  const r2 = assignMapFileNames([late, early]);
  check('⑧ ★ 입력 순서가 달라도 답이 같다', [r2.get(A), r2.get(B)], [r1.get(A), r1.get(B)]);

  // 만든 시각이 같으면 id 로 가른다 (그래도 결정적이어야 한다)
  const sameTime = [
    { mapId: B, title: '회의', createdAt: '2026-01-01T00:00:00Z' },
    { mapId: A, title: '회의', createdAt: '2026-01-01T00:00:00Z' },
  ];
  const r3 = assignMapFileNames(sameTime);
  check('⑧ 시각이 같으면 id 순 — a 가 지킨다', [r3.get(A), r3.get(B)],
    ['회의.md', '회의-bbbbbbbb.md']);
  check('⑧ 시각이 같아도 순서를 뒤집으면 답이 같다',
    JSON.stringify([...assignMapFileNames([...sameTime].reverse())].sort()),
    JSON.stringify([...r3].sort()));

  // 대소문자만 다른 제목 — macOS·Windows 에서는 같은 파일이다
  const c1 = { mapId: A, title: 'Report', createdAt: '2026-01-01T00:00:00Z' };
  const c2 = { mapId: B, title: 'report', createdAt: '2026-02-01T00:00:00Z' };
  const r4 = assignMapFileNames([c1, c2]);
  check('⑧ ★ 대소문자만 다른 제목도 겹치는 것으로 본다',
    [r4.get(A), r4.get(B)], ['Report.md', 'report-bbbbbbbb.md']);

  check('⑧ 겹치지 않으면 그대로', [...assignMapFileNames([
    { mapId: A, title: '가', createdAt: '2026-01-01T00:00:00Z' },
    { mapId: B, title: '나', createdAt: '2026-02-01T00:00:00Z' },
  ]).values()], ['가.md', '나.md']);
  check('⑧ 빈 목록', [...assignMapFileNames([]).keys()], []);
}

// ── ⑨ 첨부 — 내용 해시 (§4) ───────────────────────────────────────
const H = '3f7a2b91c4d05e68' + 'a'.repeat(48);
check('⑨ 앞 16자 + 원본 확장자', vaultAttachmentName(H, '설계 초안.png'), '3f7a2b91c4d05e68.png');
check('⑨ 확장자는 소문자로', vaultAttachmentName(H, 'A.PNG'), '3f7a2b91c4d05e68.png');
check('⑨ 확장자가 없으면 bin', vaultAttachmentName(H, 'README'), '3f7a2b91c4d05e68.bin');
check('⑨ ★ 경로가 섞인 이름에서 확장자만 (폴더 밖으로 못 나간다)',
  vaultAttachmentName(H, '../../etc/passwd.png'), '3f7a2b91c4d05e68.png');
check('⑨ 이중 확장자는 마지막만', vaultAttachmentName(H, '보고서.md.exe'), '3f7a2b91c4d05e68.exe');
check('⑨ 너무 긴 확장자는 안 믿는다', vaultAttachmentName(H, 'x.verylongextension'), '3f7a2b91c4d05e68.bin');
check('⑨ 같은 사진은 같은 이름 (맵이 달라도 한 벌)',
  vaultAttachmentName(H, 'a.png') === vaultAttachmentName(H, 'b.png'), true);
{
  let threw = false;
  try { vaultAttachmentName('짧다', 'a.png'); } catch { threw = true; }
  check('⑨ 해시가 모자라면 이름을 만들지 않는다 (조용히 뭉개지 않는다)', threw, true);
}

// ── ⑩ 상대 경로 ──────────────────────────────────────────────────
check('⑩ 폴더 트리 그대로', vaultRelPath(['연구', '2026'], 'RAG.md'), '연구/2026/RAG.md');
check('⑩ 홈(폴더 없음)은 루트', vaultRelPath([], 'RAG.md'), 'RAG.md');
check('⑩ 구분자는 항상 / (DB 에 들어가는 값이다)',
  vaultRelPath(['a'], 'b.md').includes('\\'), false);
check('⑩ 빈 폴더 이름은 건너뛴다', vaultRelPath(['', '연구'], 'x.md'), '연구/x.md');

console.log(failed ? `\n${failed}건 실패` : '\n전부 통과');
process.exit(failed ? 1 : 0);
