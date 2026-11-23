import assert from 'node:assert/strict';
import { buildMapMeta, parseMetaJson } from '@emm/meta';
import { publicMapVariables, type SampleMap } from '@emm/model';
import { VARIABLE_TYPES, COMPUTED_TYPES, DEFAULT_FORMAT, FORMAT_PRESETS, parseRaw, withDbValues, variableResults, applyVariableView } from './mapVariables';
for (const type of ['api', 'sql'] as const) {
  assert(VARIABLE_TYPES.includes(type));
  assert(!COMPUTED_TYPES.includes(type));
  assert.equal(DEFAULT_FORMAT[type], 'G/표준');
  assert(FORMAT_PRESETS[type].includes('G/표준'));
  for (const [raw, value] of [['123', 123], ['-2.5', -2.5], ['1e3', 1000], ['0', 0], ['00123', '00123'], ['-001', '-001'], ['Infinity', 'Infinity'], ['1e999', '1e999'], ['=1+1', '=1+1'], ['0x10', '0x10'], ['plain', 'plain']] as const) assert.equal(parseRaw(type, raw), value);
  assert.equal(parseRaw(type, ''), null);
  for (const raw of ['9007199254740993', '9007199254740992', '12345678901234567890.123456789', '0.100000000000000005', '1e-400']) assert.equal(parseRaw(type, raw), raw);
  assert.equal(parseRaw(type, '1.2300'), 1.23);
  assert.equal(parseRaw(type, '1e-7'), 1e-7);
}
const map = { title: 'pull', root: { id: 'r', text: '[&remote] [&total]', colorKey: 'root' }, branches: [], settings: { variables: [
  { name: 'remote', type: 'api', format: '#,##0', value: '1234', url: 'private-url', headers: { Authorization: 'secret' }, source: { password: 'secret' } },
  { name: 'sqlid', type: 'sql', value: '00123', connectionString: 'secret', query: 'private-query' },
  { name: 'manual', type: 'number', value: '3' },
  { name: 'total', type: 'formula', value: 'remote + manual' },
] } } as unknown as SampleMap;
const safe = publicMapVariables(map);
assert.deepEqual(safe.settings.variables[0], { name: 'remote', type: 'api', format: '#,##0', value: '1234' });
assert.deepEqual(safe.settings.variables[1], { name: 'sqlid', type: 'sql', value: '00123' });
const meta = buildMapMeta(map);
const json = JSON.stringify(meta);
for (const secret of ['secret', 'private-url', 'private-query', 'Authorization', 'connectionString']) assert(!json.includes(secret));
assert.deepEqual(parseMetaJson(json).map.settings.variables, safe.settings.variables);
assert.deepEqual(parseMetaJson(JSON.stringify({ ...meta, map })).map.settings.variables, safe.settings.variables);
const offline = variableResults(parseMetaJson(json).map);
assert.equal(offline.get('remote').display, '1,234');
assert.equal(offline.get('sqlid').value, '00123');
assert.equal(offline.get('total').value, 1237);
const db = { remote: '1234', sqlid: '00123' };
assert.equal(withDbValues(safe.settings.variables, db)[0].value, '1234');
const results = variableResults(safe, db);
assert.equal(results.get('remote').value, 1234);
assert.equal(results.get('remote').display, '1,234');
assert.equal(results.get('sqlid').value, '00123');
assert.equal(results.get('total').value, 1237);
assert.equal(applyVariableView(safe, results).root.text, '1,234 1237');
assert.equal(safe.root.text, '[&remote] [&total]');
const precise = { root: { text: '[&big]' }, branches: [], settings: { variables: [{ name: 'big', type: 'sql' as const, value: '', format: DEFAULT_FORMAT.sql }] } };
const exact = '9007199254740993';
const preciseResults = variableResults(precise, { big: exact });
assert.equal(preciseResults.get('big').display, exact);
assert.equal(applyVariableView(precise, preciseResults).root.text, exact);
console.log('variablePull: PASS (types, parsing, formula, DB overlay, view/export, secret stripping, roundtrip)');
