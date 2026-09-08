// profileName 단위 테스트 (2026-09-08).
//
//   npx tsx src/utils/profileName.test.ts

import { avatarInitialOf, displayNameOf, formatPhone, nameProblem } from './profileName';

let failed = 0;
function check(name: string, got: unknown, want: unknown): void {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      받음 ${JSON.stringify(got)}\n      기대 ${JSON.stringify(want)}`}`);
}

check('① 이름이 있으면 이름', displayNameOf('김영수', 'yskim@egtron.com'), '김영수');
check('② 이름이 비면 이메일', displayNameOf('  ', 'yskim@egtron.com'), 'yskim@egtron.com');
check('③ 둘 다 없으면 나', displayNameOf(null, undefined), '나');
check('④ 한글 성명 → 성', avatarInitialOf('김영수', 'yskim@egtron.com'), '김');
check('⑤ 로마자 → 첫 자 대문자', avatarInitialOf('john doe', 'j@x.com'), 'J');
check('⑥ 이름 없으면 이메일 첫 글자', avatarInitialOf(null, 'yskim@egtron.com'), 'Y');
check('⑦ 아무것도 없으면 ·', avatarInitialOf(undefined, ''), '·');
check('⑧ +82 11자리 → 3-4-4', formatPhone('+82', '01012345678'), '010-1234-5678');
check('⑨ +82 앞 0 빠진 저장값', formatPhone('82', '1012345678'), '010-1234-5678');
check('⑩ +82 10자리 → 3-3-4', formatPhone('+82', '0212345678'), '021-234-5678');
check('⑪ 다른 나라', formatPhone('+1', '2125551234'), '+1 2125551234');
check('⑫ 번호 없음 → null', formatPhone('+82', null), null);
check('⑬ 하이픈 섞인 값도 숫자만', formatPhone('+82', '010-1234-5678'), '010-1234-5678');

check('⑭ 성명 규칙: 한글 2자 OK', nameProblem('홍길'), null);
check('⑮ 영문 공백 OK', nameProblem('John Doe'), null);
check('⑯ 한 글자는 안 된다', nameProblem('홍'), '성명은 2자 이상 입력해 주세요.');
check('⑰ 숫자·기호는 안 된다', nameProblem('홍길동1'), '성명은 한글 또는 영문(대소문자)만 쓸 수 있습니다.');
check('⑱ 빈 값', nameProblem('  '), '성명을 입력해 주세요.');
check('⑲ 공백만 두 개는 글자 수에 안 든다', nameProblem('a b'), null);
check('⑳ 자모만은 안 된다', nameProblem('ㅎㄱ'), '성명은 한글 또는 영문(대소문자)만 쓸 수 있습니다.');

console.log(failed ? `\n${failed}건 실패` : '\n전부 통과');
process.exit(failed ? 1 : 0);
