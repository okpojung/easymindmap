import { strict as a } from 'node:assert';
import { test } from 'node:test';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const access = require('../dist/maps/map-access.js');
const { PublishService } = require('../dist/publish/publish.service.js');
const { PublishController } = require('../dist/publish/publish.controller.js');
const meta = { description: 'fixture description', tags: ['fixture'], commentsEnabled: true };
async function statusFixture({ role = 'owner', registered = false, kind = 'solo', ready = true, metaReady = true, dashboard = false } = {}) {
  const old = access.findAccessibleMap;
  let reads = 0;
  access.findAccessibleMap = async () => { reads++; return { id: 'map-fixture', access_role: role, kind, view_mode: dashboard ? 'dashboard' : 'map' }; };
  const service = new PublishService({ query: () => { throw Error('unexpected database request'); } }, {}, { metaFor: async () => meta, metaReady: async () => metaReady });
  service.ready = async () => ready;
  service.hasVisibility = service.hasListed = service.hasPrice = async () => true;
  service.activeRow = async () => registered ? {} : null;
  service.toStatus = () => ({ available: true, publishId: 'pub-fixture', publishedAt: '2026-11-24T00:00:00Z', visibility: 'private', listed: false });
  try { return { status: await service.status('user-fixture', 'map-fixture'), reads }; }
  finally { access.findAccessibleMap = old; }
}
test('unregistered owner receives metadata capability and canonical empty values', async () => {
  const { status: s } = await statusFixture();
  a.equal(s.canManageLibrary, true); a.equal(s.canSetMeta, true); a.equal(s.publishId, null);
  a.equal(s.description, null); a.deepEqual(s.tags, []); a.equal(s.commentsEnabled, false);
});
test('registered owner receives the same metadata capability and saved values', async () => {
  const { status: s } = await statusFixture({ registered: true });
  a.equal(s.canManageLibrary, true); a.equal(s.canSetMeta, true); a.equal(s.description, meta.description); a.deepEqual(s.tags, meta.tags);
});
for (const role of ['editor', 'viewer']) test(`${role} can read status but cannot manage library settings`, async () => {
  const { status: s } = await statusFixture({ role, registered: true });
  a.equal(s.publishable, true); a.equal(s.canSetMeta, true); a.equal(s.canManageLibrary, false);
});
test('collaborative maps remain ineligible for publication', async () => {
  const { status: s } = await statusFixture({ kind: 'collab' }); a.equal(s.publishable, false);
});
test('missing optional metadata columns remain fail closed', async () => {
  const { status: s } = await statusFixture({ metaReady: false }); a.equal(s.canSetMeta, false); a.equal(s.canManageLibrary, true);
});
test('unavailable publishing does not look up map data', async () => {
  const { status: s, reads } = await statusFixture({ ready: false }); a.equal(s.available, false); a.equal(reads, 0);
});
function listingFixture(rows = [{ publish_id: 'pub-fixture', listed: true, visibility: 'public' }]) {
  const calls = [];
  const service = new PublishService({ query: async (sql, params) => { calls.push({ sql, params }); return { rows }; } }, {}, {});
  service.requireReady = service.requireOwner = service.requirePublishable = async () => {};
  service.hasVisibility = service.hasListed = service.hasPrice = async () => true;
  service.isDashboard = async () => false;
  service.activeRow = service.publish = service.setVisibility = async () => { throw Error('guarded save must not recreate or separately expose a registration'); };
  service.toStatus = row => ({ available: true, publishId: row.publish_id, listed: row.listed, visibility: row.visibility, priceKrw: row.price_krw });
  service.withDash = async (_id, s) => s;
  return { service, calls };
}
test('guarded listing atomically changes listing and private visibility for the exact registration', async () => {
  const { service, calls } = listingFixture();
  const s = await service.setListed('user-fixture', 'map-fixture', true, 'pub-fixture');
  a.equal(s.listed, true); a.equal(calls.length, 1); a.deepEqual(calls[0].params, ['map-fixture', true, 'pub-fixture']);
  a.match(calls[0].sql, /publish_id = \$3/); a.match(calls[0].sql, /CASE WHEN visibility = 'private' THEN 'public' ELSE visibility END/);
});
test('withdrawn/replaced registration cannot be recreated or exposed by a stale settings save', async () => {
  const { service, calls } = listingFixture([]);
  await a.rejects(() => service.setListed('user-fixture', 'map-fixture', true, 'pub-withdrawn'), e => e.getStatus() === 409);
  a.equal(calls.length, 1); a.deepEqual(calls[0].params, ['map-fixture', true, 'pub-withdrawn']);
});
test('guarded unlisting preserves link, public visibility and price', async () => {
  const { service, calls } = listingFixture([{ publish_id: 'pub-fixture', listed: false, visibility: 'paid', price_krw: 4900 }]);
  const s = await service.setListed('user-fixture', 'map-fixture', false, 'pub-fixture');
  a.equal(s.publishId, 'pub-fixture'); a.equal(s.visibility, 'paid'); a.equal(s.priceKrw, 4900);
  a.ok(!calls[0].sql.includes('visibility = CASE')); a.ok(!calls[0].sql.includes('SET price'));
});
test('guarded paid listing never converts paid visibility to free', async () => {
  const { service, calls } = listingFixture([{ publish_id: 'pub-fixture', listed: true, visibility: 'paid', price_krw: 4900 }]);
  const s = await service.setListed('user-fixture', 'map-fixture', true, 'pub-fixture');
  a.equal(s.visibility, 'paid'); a.equal(s.priceKrw, 4900); a.match(calls[0].sql, /ELSE visibility END/);
});
test('ownership rejection happens before a guarded update', async () => {
  const { service, calls } = listingFixture(); service.requireOwner = async () => { throw Error('owner required'); };
  await a.rejects(() => service.setListed('other-user', 'map-fixture', true, 'pub-fixture'), /owner required/); a.equal(calls.length, 0);
});
test('legacy unlisting remains compatible without a conditional registration parameter', async () => {
  const { service, calls } = listingFixture([{ publish_id: 'pub-fixture', listed: false, visibility: 'public' }]);
  await service.setListed('user-fixture', 'map-fixture', false); a.deepEqual(calls[0].params, ['map-fixture', false]);
});
test('controller passes the expected registration and rejects malformed preconditions', () => {
  const calls = []; const controller = new PublishController({ setListed: (...args) => calls.push(args) }, {});
  controller.setListed({ id: 'user-fixture' }, 'map-fixture', { listed: true, expectedPublishId: 'pub-fixture' });
  a.deepEqual(calls[0], ['user-fixture', 'map-fixture', true, 'pub-fixture']);
  for (const expectedPublishId of [null, false, 42, '', 'x'.repeat(257)]) a.throws(() => controller.setListed({ id: 'u' }, 'm', { listed: true, expectedPublishId }));
  a.equal(calls.length, 1);
});
