// AI API 키 암호화 단위 테스트 (2026-09-04).
//
//   npm run build && npm run test:ai-keys
//
// 서버가 남의 API 키를 보관하는 유일한 자리다. 되풀이 왕복·비밀 불일치·
// 손상된 행에서 **예외로 앱을 세우지 않고 null** 을 주는지까지 본다.
import { strict as assert } from 'node:assert';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { encryptAiKey, decryptAiKey, aiKeyHint } = require('../dist/account/ai-key-crypto.js');

let n = 0;
const ok = (name, cond, extra = '') => { n++; console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`); if (!cond) process.exitCode = 1; };

const SECRET = 'unit-test-secret-0123456789';
const KEY = 'sk-ant-api03-abcDEF1234567890_xyz';
const enc = encryptAiKey(KEY, SECRET);
ok('① 저장 형식 v1:iv:tag:ct', /^v1:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/.test(enc), enc.slice(0, 20));
ok('② 평문이 그대로 들어 있지 않다', !enc.includes('sk-ant') && !enc.includes('abcDEF'));
ok('③ 같은 비밀로 되돌아온다', decryptAiKey(enc, SECRET) === KEY);
ok('④ 같은 키도 매번 다른 암호문(iv 무작위)', encryptAiKey(KEY, SECRET) !== enc);
ok('⑤ 비밀이 다르면 null (예외 아님)', decryptAiKey(enc, 'another-secret-9876543210') === null);
const tampered = enc.slice(0, -4) + (enc.endsWith('AAAA') ? 'BBBB' : 'AAAA');
ok('⑥ 암호문이 손상되면 null (GCM 태그)', decryptAiKey(tampered, SECRET) === null);
ok('⑦ 형식이 아니면 null', decryptAiKey('garbage', SECRET) === null && decryptAiKey('', SECRET) === null);
ok('⑧ 한글·긴 키도 왕복', decryptAiKey(encryptAiKey('키 テスト ' + 'x'.repeat(400), SECRET), SECRET) === '키 テスト ' + 'x'.repeat(400));
ok('⑨ 끝자리 힌트 4글자', aiKeyHint(KEY) === '…_xyz' && aiKeyHint('ab') === '••••', aiKeyHint(KEY));
assert.ok(n === 9);
console.log(process.exitCode ? '\n실패 있음' : '\n전체 통과 (9/9)');
