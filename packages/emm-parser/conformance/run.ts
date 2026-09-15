// EMM 적합성 코퍼스 러너 (conformance test suite)
//
//   npx tsx conformance/run.ts            — 전체 케이스 검증
//   npx tsx conformance/run.ts --update   — 기대 스냅숏 재생성
//
// 케이스마다 2가지를 검증한다:
//   [P] 파싱 스냅숏  — cases/<name>.md 를 파싱한 결과(정규화 후)가
//                      expected/<name>.json 과 일치
//   [B] 본문 왕복    — buildEmmBody 로 다시 쓴 본문을 다시 파싱해도
//                      노드 수가 스냅숏의 bodyRoundTripNodes 와 일치
//                      (구조 보존 회귀)
// (예전의 [M] 메타 왕복은 MD 메타데이터 주석과 함께 2026-09-15 폐기)
//
// 정규화: 파서가 만드는 id(md-<타임스탬프>-<seq>)는 실행마다 달라지므로
// 첫 등장 순서대로 md#0, md#1 … 로 치환해 스냅숏을 결정적으로 만든다.

import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEmm, buildEmmBody, countMapNodes } from '../src/index';

const HERE = dirname(fileURLToPath(import.meta.url));
const CASES = join(HERE, 'cases');
const EXPECTED = join(HERE, 'expected');
const UPDATE = process.argv.includes('--update');

// 파서 생성 id(md-…)를 등장 순서 기반 결정적 id로 치환
function normalizeIds<T>(value: T): T {
  const seen = new Map<string, string>();
  const norm = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(norm);
    if (v && typeof v === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) out[k] = norm(val);
      return out;
    }
    if (typeof v === 'string' && /^md-\d+-\d+$/.test(v)) {
      if (!seen.has(v)) seen.set(v, `md#${seen.size}`);
      return seen.get(v);
    }
    return v;
  };
  return norm(value) as T;
}

const stable = (v: unknown) => JSON.stringify(v, null, 2);

interface CaseResult {
  name: string;
  ok: boolean;
  notes: string[];
}

function runCase(name: string): CaseResult {
  const md = readFileSync(join(CASES, name), 'utf-8');
  const notes: string[] = [];
  let ok = true;
  const fail = (msg: string) => { ok = false; notes.push(`FAIL ${msg}`); };

  const parsed = parseEmm(md, name.replace(/\.md$/, ''));
  if (!parsed) return { name, ok: false, notes: ['FAIL 파싱 결과 없음'] };

  // [B] 본문 왕복 — 다시 쓴 본문을 다시 파싱했을 때의 노드 수
  const bodyOnly = buildEmmBody(parsed, []);
  const reparsed = parseEmm(bodyOnly, 'roundtrip');
  const bodyRoundTripNodes = reparsed ? countMapNodes(reparsed) : 0;

  const snapshot = {
    nodes: countMapNodes(parsed),
    bodyRoundTripNodes,
    map: normalizeIds(parsed),
  };

  const expPath = join(EXPECTED, name.replace(/\.md$/, '.json'));
  if (UPDATE || !existsSync(expPath)) {
    writeFileSync(expPath, stable(snapshot) + '\n');
    notes.push(existsSync(expPath) ? 'snapshot updated' : 'snapshot created');
  } else {
    const expected = JSON.parse(readFileSync(expPath, 'utf-8'));
    if (stable(snapshot.map) !== stable(expected.map)) fail('[P] 파싱 스냅숏 불일치');
    if (snapshot.nodes !== expected.nodes) {
      fail(`[P] 노드 수 ${snapshot.nodes} ≠ ${expected.nodes}`);
    }
    if (snapshot.bodyRoundTripNodes !== expected.bodyRoundTripNodes) {
      fail(`[B] 본문 왕복 노드 수 ${snapshot.bodyRoundTripNodes} ≠ ${expected.bodyRoundTripNodes}`);
    }
  }

  if (ok && !notes.length) notes.push(`nodes=${snapshot.nodes} bodyRT=${bodyRoundTripNodes}`);
  return { name, ok, notes };
}

mkdirSync(EXPECTED, { recursive: true });
const files = readdirSync(CASES).filter((f) => f.endsWith('.md')).sort();
if (files.length === 0) {
  console.error('cases/ 에 코퍼스가 없습니다');
  process.exit(1);
}

let failed = 0;
for (const f of files) {
  const r = runCase(f);
  console.log(`${r.ok ? 'PASS' : 'FAIL'} ${f} — ${r.notes.join(' · ')}`);
  if (!r.ok) failed++;
}
console.log(`\n${files.length - failed}/${files.length} cases passed`);
process.exit(failed ? 1 : 0);
