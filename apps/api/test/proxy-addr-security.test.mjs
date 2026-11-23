// Offline regression for GHSA-jqcg-44mw-7w3h. No server, DB, env, or network use.
// Run: node test/proxy-addr-security.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const proxyaddr = require('proxy-addr');
const { compileTrust } = require('express/lib/utils');

test('installed proxy-addr is exactly patched 2.0.8', () => {
  assert.equal(require('proxy-addr/package.json').version, '2.0.8');
});

const cases = [
  ['short mapped prefix rejects public IPv4', '::ffff:10.0.0.0/8', '203.0.113.8', false],
  ['short mapped prefix rejects private IPv4 too', '::ffff:10.0.0.0/8', '10.2.3.4', false],
  ['short mapped prefix rejects mapped public IPv4', '::ffff:10.0.0.0/8', '::ffff:203.0.113.8', false],
  ['zero-leading IPv6 subnet rejects IPv4', '::/1', '203.0.113.8', false],
  ['IPv6 loopback rejects public IPv4', '::1', '203.0.113.8', false],
  ['IPv6 loopback rejects IPv4 loopback', '::1', '127.0.0.1', false],
  ['IPv6 loopback accepts itself', '::1', '::1', true],
  ['valid IPv4 subnet accepts member', '10.0.0.0/8', '10.2.3.4', true],
  ['valid IPv4 subnet accepts mapped member', '10.0.0.0/8', '::ffff:10.2.3.4', true],
  ['valid IPv4 subnet rejects nonmember', '10.0.0.0/8', '203.0.113.8', false],
  ['valid mapped /104 accepts IPv4 member', '::ffff:10.0.0.0/104', '10.2.3.4', true],
  ['valid mapped /104 rejects IPv4 nonmember', '::ffff:10.0.0.0/104', '203.0.113.8', false],
  ['valid mapped /104 accepts mapped member', '::ffff:10.0.0.0/104', '::ffff:10.2.3.4', true],
  ['valid IPv6 subnet accepts member', '2001:db8::/32', '2001:db8::1234', true],
  ['valid IPv6 subnet rejects nonmember', '2001:db8::/32', '2001:db9::1234', false],
  ['valid IPv6 subnet rejects IPv4', '2001:db8::/32', '203.0.113.8', false],
  ['loopback alias accepts IPv4', 'loopback', '127.0.0.1', true],
  ['loopback alias accepts IPv6', 'loopback', '::1', true],
  ['loopback alias rejects public IPv4', 'loopback', '203.0.113.8', false],
  ['private aliases accept private IPv4', ['loopback', 'linklocal', 'uniquelocal'], '192.168.1.2', true],
  ['private aliases accept private IPv6', ['loopback', 'linklocal', 'uniquelocal'], 'fd00::2', true],
  ['private aliases reject public IPv4', ['loopback', 'linklocal', 'uniquelocal'], '203.0.113.8', false],
];
for (const [name, subnet, address, expected] of cases) {
  test(name, () => assert.equal(proxyaddr.compile(subnet)(address, 0), expected));
}

const request = (remoteAddress, forwarded) => ({
  socket: { remoteAddress },
  headers: { 'x-forwarded-for': forwarded },
});
test('bad mapped trust cannot promote attacker X-Forwarded-For', () => {
  assert.equal(proxyaddr(request('203.0.113.8', '198.51.100.44'), proxyaddr.compile('::ffff:10.0.0.0/8')), '203.0.113.8');
});
test('zero-leading IPv6 trust cannot promote attacker X-Forwarded-For', () => {
  assert.equal(proxyaddr(request('203.0.113.8', '198.51.100.44'), proxyaddr.compile('::/1')), '203.0.113.8');
});
test('private proxy chain stops at first public client', () => {
  assert.equal(proxyaddr(request('10.0.0.2', '198.51.100.44, 203.0.113.8, 192.168.1.2'), proxyaddr.compile(['loopback', 'linklocal', 'uniquelocal'])), '203.0.113.8');
});
// main.ts also permits numeric hop counts and boolean trust values. These are
// Express compileTrust semantics, NOT proxy-addr.compile(number) semantics.
test('Express numeric hop trust remains index bounded', () => {
  const trust = compileTrust(2);
  assert.equal(trust('203.0.113.8', 0), true);
  assert.equal(trust('203.0.113.8', 1), true);
  assert.equal(trust('203.0.113.8', 2), false);
  assert.equal(proxyaddr(request('10.0.0.2', '198.51.100.44, 203.0.113.8, 192.168.1.2'), trust), '203.0.113.8');
});
test('Express zero hops and false preserve socket address', () => {
  for (const option of [0, false]) assert.equal(proxyaddr(request('203.0.113.8', '198.51.100.44'), compileTrust(option)), '203.0.113.8');
});
test('Express true remains unrestricted, not made safe by this patch', () => {
  assert.equal(proxyaddr(request('203.0.113.8', '198.51.100.44'), compileTrust(true)), '198.51.100.44');
});
