// 2단계 인증 생략 IP 규칙 단위 테스트 (2026-10-24, `admin/trusted-networks.ts`).
//
//   npm run build && node test/trusted-networks.test.mjs
//
// 지키는 것: 등록 형식(IP 하나 / 끝자리 0 = C클래스), 사설망만, 맞춤 판정, 공인 IP 로는
// 절대 생략하지 않음, 저장값을 다시 검사함.

import {
  parseTrustedAddress, cidrContains, matchTrusted, describeCidr, sanitizeStored, isPrivateIpv4, ipv4ToInt,
} from '../dist/admin/trusted-networks.js';

let failed = 0;
function check(name, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  const ok = g === w;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      받음 ${g}\n      기대 ${w}`}`);
}
const cidr = (v) => { const r = parseTrustedAddress(v); return r.ok ? r.cidr : 'ERR'; };

check('IP 하나', cidr('192.168.94.100'), '192.168.94.100/32');
check('끝자리 0 = C클래스', cidr('192.168.94.0'), '192.168.94.0/24');
check('/24 명시', cidr('192.168.94.0/24'), '192.168.94.0/24');
check('/32 명시', cidr('10.1.2.3/32'), '10.1.2.3/32');
check('공백 정리', cidr('  172.16.5.7 '), '172.16.5.7/32');
check('거절: 공인 IP', [cidr('8.8.8.8'), cidr('121.134.237.0'), cidr('172.32.0.1'), cidr('192.169.1.1')], ['ERR', 'ERR', 'ERR', 'ERR']);
check('거절: 형식', [cidr(''), cidr('192.168.94'), cidr('192.168.94.256'), cidr('192.168.094.1x'), cidr('abc'), cidr('192.168.94.0/16'), cidr('192.168.94.5/24'), cidr('::1')], ['ERR', 'ERR', 'ERR', 'ERR', 'ERR', 'ERR', 'ERR', 'ERR']);
check('거절 문구는 한국어', parseTrustedAddress('8.8.8.8').message.includes('내부망'), true);

check('C클래스 안', [cidrContains('192.168.94.0/24', '192.168.94.1'), cidrContains('192.168.94.0/24', '192.168.94.254'), cidrContains('192.168.94.0/24', '192.168.95.1')], [true, true, false]);
check('IP 하나', [cidrContains('192.168.94.100/32', '192.168.94.100'), cidrContains('192.168.94.100/32', '192.168.94.101')], [true, false]);
check('IPv4-mapped 표기', cidrContains('192.168.94.0/24', '::ffff:192.168.94.1'), true);
check('범위 글자', [describeCidr('192.168.94.0/24'), describeCidr('192.168.94.100/32')], ['192.168.94.0 ~ 192.168.94.255', '192.168.94.100']);

const list = [
  { id: 'a1b2c3d4-0000-4000-8000-000000000001', cidr: '192.168.94.0/24', label: '사무실', createdAt: '', createdBy: '', updatedAt: '', updatedBy: '' },
  { id: 'a1b2c3d4-0000-4000-8000-000000000002', cidr: '10.0.0.5/32', label: '', createdAt: '', createdBy: '', updatedAt: '', updatedBy: '' },
];
check('맞춤: 공유기 주소', matchTrusted(list, '192.168.94.1')?.cidr, '192.168.94.0/24');
check('맞춤: IP 하나', matchTrusted(list, '10.0.0.5')?.cidr, '10.0.0.5/32');
check('안 맞음', [matchTrusted(list, '10.0.0.6'), matchTrusted(list, undefined), matchTrusted(list, ''), matchTrusted(list, 'unknown')], [null, null, null, null]);
// 저장값이 조작돼 공인 망이 들어 있어도 공인 IP 로는 생략하지 않는다
check('공인 IP 로는 절대 생략 안 함', matchTrusted([{ ...list[0], cidr: '8.8.8.0/24' }], '8.8.8.8'), null);

check('저장값 재검사: 잘못된 항목 버림', sanitizeStored([
  list[0],
  { ...list[1], cidr: '8.8.8.8/32' },
  { ...list[1], cidr: '10.0.0.5' },
  { ...list[1], id: 'x' },
  null, 'str',
]).map((e) => e.cidr), ['192.168.94.0/24']);
check('저장값이 배열이 아니면 빈 목록', [sanitizeStored(null), sanitizeStored({}), sanitizeStored('x')], [[], [], []]);
check('사설 판정', [isPrivateIpv4(ipv4ToInt('192.168.0.1')), isPrivateIpv4(ipv4ToInt('172.31.255.255')), isPrivateIpv4(ipv4ToInt('172.15.0.1')), isPrivateIpv4(ipv4ToInt('127.0.0.1'))], [true, true, false, true]);

if (failed) { console.log(`\n${failed}개 실패`); process.exit(1); }
console.log('\ntrusted-networks: 모두 통과');
