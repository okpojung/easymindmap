// 레이아웃 불변식 시험 (2026-09-22) — **어떤 레이아웃·서브트리 오버라이드 조합에서도
// 노드 상자가 겹치지 않는다.** 사용자 보고("[36주] 노드에 진행트리를 걸었더니 맵이
// 엉망")를 조사하며 만든 재발 방지 장치다. 세 층으로 본다.
//   ① 고정 사례 — 조사에서 찾은 결함 종류마다 하나 (아래 주석이 결함 설명)
//   ② 사슬 행렬 — 보고와 같은 모양(1레벨 → 2레벨 → 주 노드 → 날짜 7개)에 1·2·3레벨
//      오버라이드를 조합해 전부 검사 (진행트리 맵, 1레벨 4종 × 2·3레벨 전체)
//   ③ 무작위 맵 — 고정 씨앗으로 만든 맵(글 길이·표·코드·깊이·오버라이드 무작위)
// 더 넓게 돌리려면 scripts/layout/fuzz.ts · matrix.ts (같은 생성기, 씨앗·기준 자유).
//   npx tsx src/layout/layoutInvariants.test.ts
import { computeLayout } from '@/layout/LayoutEngine';
import { SUBTREE_SUPPORTED } from '@/layout/strategies/SubtreeStrategy';
import { calendarTable } from '@/utils/calendarNodes';
import { checkIdentity, findOverlaps, genMap, chainMap, BASES } from './invariantGen';

let failed = 0, ran = 0;
function check(name: string, out: ReturnType<typeof computeLayout>, extra?: () => string | null, map?: any): void {
  ran++;
  const bad = findOverlaps(out);
  const msg = extra?.() ?? (map ? checkIdentity(map, out) : null);
  const ok = bad.length === 0 && !msg;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${bad.length ? ` — 겹침 ${bad.length} (예: ${bad.slice(0, 2).map(([a, b]) => `${a.id}×${b.id}`).join(', ')})` : ''}${msg ? ` — ${msg}` : ''}`);
}
const t0 = Date.now();

// ① 고정 사례
{
  // 계층형: 첫 자식이 부모보다 크면(표) 부모 윗변에 맞춘다 — 중심을 맞추면 앞 형제와 겹쳤다
  const m = chainMap({ a1Text: '짧게', b2Text: '표\n\n' + calendarTable(2026, 9), extraBefore: 2 });
  check('① 계층형 맵 · 큰 첫 자식(표)', computeLayout(m, 'hierarchy-right' as never, 800, 500));
  // 방사형 맵의 위쪽 가지에 진행트리 — 자식 행이 루트에 닿아 **위로** 올라가 앵커와 겹쳤다
  const r = genMap(51); // 조사 씨앗
  check('① 방사형·왼쪽 맵 · 1레벨 진행트리(루트 충돌 → 옆으로 비킴)', computeLayout(r.map, r.base as never, 800, 500));
  // 계층형 아래 트리·아래 — 가운데 정렬 행이 부모(표 두 개) 위로 삐져나왔다
  check('① 진행트리 맵 · 2레벨 계층형 · 3레벨 트리·아래', computeLayout(chainMap({ o2: 'hierarchy-right', o3: 'tree-down' }), 'process-tree-right' as never, 800, 500));
  // 보고된 모양: 1레벨 계층형 → 2레벨 트리·오른쪽 → [36주] 진행트리
  const reported = computeLayout(chainMap({ o1: 'hierarchy-right', o2: 'tree-right', o3: 'process-tree-right' }), 'process-tree-right' as never, 800, 500);
  check('① 보고 모양: 계층형 → 트리·오른쪽 → 진행트리', reported, () => (reported.length < 60 ? `노드 수 ${reported.length} — 생성기가 비었다` : !reported.some((n) => n.text.startsWith('[36주]') && n.layoutType === 'process-tree-right') ? '36주 오버라이드가 적용되지 않았다' : null));
  // 시간배치 안의 오버라이드: 축 위 노드의 자식이 부모 상자로 들어가지 않는다 · 뒤 주제가 밀린다
  check('① 진행트리 맵 · 2레벨 시간배치 · 3레벨 트리·아래', computeLayout(chainMap({ o2: 'timeline', o3: 'tree-down' }), 'process-tree-right' as never, 800, 500));
  check('① 진행트리 맵 · 2레벨 시간배치 · 3레벨 방사형·왼쪽', computeLayout(chainMap({ o2: 'timeline', o3: 'radial-left' }), 'process-tree-right' as never, 800, 500));
  // 시간배치 위쪽 가지에 아래로 늘어지는 오버라이드 → 위로 뒤집힌다
  check('① 진행트리 맵 · 1레벨 시간배치 · 3레벨 트리·오른쪽', computeLayout(chainMap({ o1: 'timeline', o3: 'tree-right' }), 'process-tree-right' as never, 800, 500));
  // 방사형·왼쪽 아래 계층형 — 자식을 왼쪽으로 편다 (오른쪽이면 부모·루트로 되돌아간다)
  check('① 진행트리 맵 · 2레벨 방사형·왼쪽 · 3레벨 계층형', computeLayout(chainMap({ o2: 'radial-left', o3: 'hierarchy-right' }), 'process-tree-right' as never, 800, 500));
  // 트리·오른쪽 맵의 1레벨 시간배치(중앙) — 앞 가지가 루트 위로 밀리지 않는다
  const s784 = genMap(784);
  check('① 트리·오른쪽 맵 · 1레벨 시간배치(중앙) (앞 가지·루트)', computeLayout(s784.map, s784.base as never, 800, 500));
  // id 가 겹친 문서에서도 멈추지 않는다 (parent 사슬 guard)
  {
    const dup: any = { root: { id: 'root', text: '중심' }, branches: [
      { id: 'x', text: 'A', layoutType: 'tree-right', children: [{ id: 'x', text: 'A1', children: [{ id: 'x', text: 'A2', children: [] }] }] },
      { id: 'y', text: 'B', children: [{ id: 'x', text: 'B1', children: [] }] },
    ] };
    const t = Date.now();
    computeLayout(dup, 'radial-right' as never, 800, 500);
    ran++; const ms = Date.now() - t; const ok = ms < 2000; if (!ok) failed++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ① 중복 id 문서 — 멈추지 않는다 (${ms}ms)`);
  }
}

// ② 사슬 행렬 — 진행트리 맵, 1레벨 4종 × 2·3레벨 전체 (없음 포함)
{
  const OV = ['', ...[...SUBTREE_SUPPORTED]] as string[];
  const L1 = ['', 'hierarchy-right', 'radial-left', 'timeline'];
  let bad = 0, total = 0; const examples: string[] = [];
  for (const o1 of L1) for (const o2 of OV) for (const o3 of OV) {
    total++;
    const m = chainMap({ o1, o2, o3 });
    const out = computeLayout(m, 'process-tree-right' as never, 800, 500);
    const ov = findOverlaps(out); const idm = checkIdentity(m, out);
    if (ov.length || idm) { bad++; if (examples.length < 5) examples.push(`${o1 || '-'}/${o2 || '-'}/${o3 || '-'}${idm ? ' (' + idm + ')' : ''}`); }
  }
  ran++; if (bad) failed++;
  console.log(`${bad ? 'FAIL' : 'PASS'}  ② 사슬 행렬 ${total}조합 — 겹침 ${bad}${bad ? ` (${examples.join(' ')})` : ''}`);
}

// ③ 무작위 맵 — 씨앗 1..200, 모든 기준 레이아웃
{
  let bad = 0; const examples: string[] = [];
  for (let seed = 1; seed <= 200; seed++) {
    const g = genMap(seed);
    let out: ReturnType<typeof computeLayout>;
    try { out = computeLayout(g.map, g.base as never, 800, 500); } catch (e) { bad++; examples.push(`seed ${seed} 예외 ${(e as Error).message}`); continue; }
    const ov = findOverlaps(out); const idm = checkIdentity(g.map, out);
    if (ov.length || idm) { bad++; if (examples.length < 5) examples.push(`seed ${seed} ${g.base} ${g.overrides.join(' ')}${idm ? ' (' + idm + ')' : ''}`); }
  }
  ran++; if (bad) failed++;
  console.log(`${bad ? 'FAIL' : 'PASS'}  ③ 무작위 200맵 (${BASES.length}개 기준 레이아웃) — 겹침 ${bad}${bad ? ` (${examples.join(' ; ')})` : ''}`);
}

console.log(`\n${ran}항목 · ${Date.now() - t0}ms`);
if (failed) { console.log(`${failed} FAIL`); process.exit(1); }
console.log('모두 통과');
