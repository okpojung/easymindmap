// 사슬 행렬 검사 (개발 도구, 2026-09-22) — 보고 모양(1레벨 → 2레벨 → 주 → 날짜)에 1·2·3레벨
// 오버라이드 전체(10×10×10)를 조합해 기준 레이아웃 하나에서 겹침을 센다.
//   npx tsx scripts/layout/matrix.ts [base=process-tree-right] [o1/o2/o3]   ('-' = 없음, 주면 그 조합만 좌표까지)
import { computeLayout } from '@/layout/LayoutEngine';
import { SUBTREE_SUPPORTED } from '@/layout/strategies/SubtreeStrategy';
import { chainMap, findOverlaps } from '@/layout/invariantGen';
const OV = ['', ...[...SUBTREE_SUPPORTED]] as string[];
const base = process.argv[2] || 'process-tree-right';
const ONLY = process.argv[3] ? process.argv[3].split('/').map((x) => (x === '-' ? '' : x)) : null;
let fails = 0, total = 0; const lines: string[] = [];
for (const o1 of OV) for (const o2 of OV) for (const o3 of OV) {
  if (ONLY && (o1 !== ONLY[0] || o2 !== ONLY[1] || o3 !== ONLY[2])) continue;
  total++;
  const map = chainMap({ o1, o2, o3 });
  if (base === 'radial-bidirectional') map.branches.forEach((b: any, i: number) => { b.side = i % 2 ? 'left' : 'right'; });
  const out = computeLayout(map, base as never, 800, 500);
  if (ONLY) for (const n of out) console.log(`   ${n.id.padEnd(4)} d${n.depth} x=${n.x.toFixed(0).padStart(5)} y=${n.y.toFixed(0).padStart(5)} w=${n.w.toFixed(0).padStart(3)} h=${n.h.toFixed(0).padStart(3)} side=${n.side} lt=${n.layoutType} ${String(n.text).split('\n')[0].slice(0, 14)}`);
  const bad = findOverlaps(out);
  if (bad.length) { fails++; lines.push(`${o1 || '-'} / ${o2 || '-'} / ${o3 || '-'} → ${bad.length} (e.g. ${bad.slice(0, 2).map(([a, b]) => `${a.text.split('\n')[0].slice(0, 10)}d${a.depth}×${b.text.split('\n')[0].slice(0, 10)}d${b.depth}`).join(', ')})`); }
}
console.log(`base=${base}: ${total} combos, ${fails} with overlaps`);
for (const l of lines) console.log('  ' + l);
if (fails) process.exit(1);
