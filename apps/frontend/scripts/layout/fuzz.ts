// 레이아웃 무작위 검사 (개발 도구, 2026-09-22) — 씨앗 범위와 기준 레이아웃을 골라 넓게 돌린다.
//   npx tsx scripts/layout/fuzz.ts [from=1] [to=300] [base]      (VERBOSE=1 로 겹친 노드 좌표)
// 단위 시험 layoutInvariants.test.ts 는 같은 생성기로 씨앗 1..200 을 늘 돈다.
import { computeLayout } from '@/layout/LayoutEngine';
import { checkIdentity, findOverlaps, genMap } from '@/layout/invariantGen';
const from = Number(process.argv[2] ?? 1), to = Number(process.argv[3] ?? 300), base = process.argv[4] || undefined;
let fails = 0; const byKind: Record<string, number> = {};
for (let seed = from; seed <= to; seed++) {
  const g = genMap(seed, base);
  let out;
  try { out = computeLayout(g.map, g.base as never, 800, 500); } catch (e) { fails++; console.log(`ERROR seed=${seed} ${g.base} ${g.overrides.join(' ')} → ${(e as Error).message}`); continue; }
  const bad = findOverlaps(out);
  const idm = checkIdentity(g.map, out);
  if (idm) { fails++; console.log(`FAIL seed=${seed} base=${g.base} ov=[${g.overrides.join(' ')}] ${idm}`); continue; }
  if (!bad.length) continue;
  fails++;
  const kind = `${g.base} ← ${g.overrides.map((o) => o.split('=')[1]).join('+')}`;
  byKind[kind] = (byKind[kind] ?? 0) + 1;
  if (process.env.VERBOSE) for (const [a, b] of bad.slice(0, 3)) console.log(`   ${a.id} d${a.depth} p=${a.parent} x=${a.x.toFixed(0)} y=${a.y.toFixed(0)} w=${a.w.toFixed(0)} h=${a.h.toFixed(0)} lt=${a.layoutType} | ${b.id} d${b.depth} p=${b.parent} x=${b.x.toFixed(0)} y=${b.y.toFixed(0)} w=${b.w.toFixed(0)} h=${b.h.toFixed(0)} lt=${b.layoutType}`);
  console.log(`FAIL seed=${seed} base=${g.base} nodes=${out.length} ov=[${g.overrides.join(' ')}] overlaps=${bad.length} e.g. ${bad.slice(0, 2).map(([a, b]) => `${a.id}(${a.text.slice(0, 6)},d${a.depth}) × ${b.id}(${b.text.slice(0, 6)},d${b.depth})`).join(' ; ')}`);
}
console.log(`\n${to - from + 1} seeds, ${fails} failed`);
for (const [k, v] of Object.entries(byKind).sort((a, b) => b[1] - a[1])) console.log(`  ${v}× ${k}`);
if (fails) process.exit(1);
