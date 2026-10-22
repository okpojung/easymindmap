// entryIntent — 홈페이지에서 온 방문 판정과 주소 정리.
import assert from 'node:assert/strict';
import { parseEntry, hasStoredSession } from './entryIntent';

const base = 'https://web.easymindmap.org';

// 홈페이지 버튼
assert.deepEqual(parseEntry(`${base}/?from=www`), { fromWww: true, cleanUrl: '/' });
// 다른 쿼리·해시는 지키고 표시만 지운다
assert.deepEqual(parseEntry(`${base}/?map=abc&from=www#x`), { fromWww: true, cleanUrl: '/?map=abc#x' });
// 다른 값의 from 은 팝업 없이 지우기만
assert.deepEqual(parseEntry(`${base}/?from=mail`), { fromWww: false, cleanUrl: '/' });
// 옛 체험 주소 /try, /try/ → 게스트 안내
assert.deepEqual(parseEntry(`${base}/try`), { fromWww: true, cleanUrl: '/' });
assert.deepEqual(parseEntry(`${base}/try/?x=1`), { fromWww: true, cleanUrl: '/?x=1' });
// 아무 표시 없는 방문은 건드리지 않는다
assert.deepEqual(parseEntry(`${base}/`), { fromWww: false, cleanUrl: null });
assert.deepEqual(parseEntry(`${base}/p/abc123`), { fromWww: false, cleanUrl: null });
assert.deepEqual(parseEntry(`${base}/trying`), { fromWww: false, cleanUrl: null });

// 저장된 세션 판정
assert.equal(hasStoredSession(null), false);
assert.equal(hasStoredSession('not json'), false);
assert.equal(hasStoredSession(JSON.stringify({ state: { session: null, guest: true } })), false);
assert.equal(hasStoredSession(JSON.stringify({ state: { session: { accessToken: 'x' }, guest: false } })), true);

console.log('entryIntent.test: PASS');
