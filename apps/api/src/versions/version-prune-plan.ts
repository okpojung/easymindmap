// 버전 정리 계획 — **순수 함수** (2026-09-06, 13a §2).
//
// DB 도 시계도 모른다. 버전 목록과 "지금" 을 받아 **무엇을 지울지** 만
// 돌려준다. 그래서 단위 테스트가 DB 없이 돈다(test/version-prune-plan.test.mjs).
//
// 규칙 (13a §2 "시간이 지날수록 성기게"):
//
//   | 나이          | 남기는 밀도                 |
//   |---------------|-----------------------------|
//   | 24시간 안     | 전부, 다만 최대 20개        |
//   | 7일 안        | 하루 3개 (8시간 칸마다 1개) |
//   | 30일 안       | 하루 1개                    |
//   | 그 뒤         | 주 1개                      |
//   | 보관 기간 지남 | 지운다 — 다만 **유예 7일** 뒤에 |
//
// 칸마다 **가장 새것**을 남긴다 (Time Machine·borg·restic 과 같다).
//
// 절대 지우지 않는 것 셋:
//   · 영구보관(pinned) — 여기 들어오지도 않는다(호출하는 쪽이 뺀다)
//   · 맵의 **최신 버전** — 복원의 기준점. 오래됐어도 남긴다
//   · `since` 이전 것 — 13a §6 "소급 적용하지 않는다". 워커가 생기기 전에
//     쌓인 버전은 사용자가 몰랐던 규칙으로 사라지면 안 된다

export interface PruneCandidate {
  id: string;
  version: number;
  createdAt: Date;
}

export interface PruneOptions {
  /** 보관 일수. null = 무제한(기간 삭제 없음, 솎아내기는 한다) */
  versionDays: number | null;
  /** 보관 기간이 지난 뒤 실제로 지우기까지의 유예(일). 13a §3.2 ③ */
  graceDays: number;
  /** 이 시각 이전에 만들어진 버전은 건드리지 않는다 (13a §6) */
  since: Date | null;
}

export interface PrunePlan {
  /** 보관 기간 + 유예를 넘겨 지운다 */
  expired: PruneCandidate[];
  /** 밀도 규칙으로 솎아낸다 */
  thinned: PruneCandidate[];
  /** 보관 기간은 지났지만 아직 유예 중 — 화면이 "곧 정리됩니다" 로 쓴다 */
  expiring: Array<PruneCandidate & { deleteAt: Date }>;
  kept: PruneCandidate[];
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
export const RECENT_MAX = 20;

/** 나이(ms)를 보고 "이 버전이 속하는 칸" 의 이름을 만든다. 같은 칸 = 하나만 남는다 */
function slotOf(ageMs: number): string | null {
  if (ageMs < DAY) return null; // 최근 24시간은 칸이 없다 — 개수로만 제한
  if (ageMs < 7 * DAY) return `8h:${Math.floor(ageMs / (8 * HOUR))}`;
  if (ageMs < 30 * DAY) return `1d:${Math.floor(ageMs / DAY)}`;
  return `7d:${Math.floor(ageMs / (7 * DAY))}`;
}

/**
 * @param candidates 영구보관이 **아닌** 버전 전부 (순서 무관)
 * @param latestVersion 맵의 최신 버전 번호 — 영구보관이든 아니든 맵 전체의 최댓값
 */
export function planPrune(
  candidates: PruneCandidate[], latestVersion: number, now: Date, opts: PruneOptions,
): PrunePlan {
  const plan: PrunePlan = { expired: [], thinned: [], expiring: [], kept: [] };
  const nowMs = now.getTime();
  const sinceMs = opts.since ? opts.since.getTime() : -Infinity;
  const retainMs = opts.versionDays === null ? Infinity : opts.versionDays * DAY;
  const graceMs = Math.max(0, opts.graceDays) * DAY;

  // 새것부터 — 칸마다 처음 만나는 것(= 가장 새것)을 남긴다
  const sorted = [...candidates].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const seenSlot = new Set<string>();
  let recent = 0;

  for (const v of sorted) {
    const created = v.createdAt.getTime();
    const age = nowMs - created;
    if (v.version === latestVersion || created < sinceMs) { plan.kept.push(v); continue; }
    if (age >= retainMs + graceMs) { plan.expired.push(v); continue; }
    if (age >= retainMs) {
      plan.expiring.push({ ...v, deleteAt: new Date(created + retainMs + graceMs) });
      // 유예 중인 것도 밀도 규칙은 그대로 받는다 — 어차피 곧 지워질 것을
      // 20개씩 남겨 둘 이유가 없다. 아래로 흘려보낸다.
    }
    const slot = slotOf(age);
    if (slot === null) {
      recent += 1;
      if (recent > RECENT_MAX) plan.thinned.push(v); else plan.kept.push(v);
      continue;
    }
    if (seenSlot.has(slot)) plan.thinned.push(v);
    else { seenSlot.add(slot); plan.kept.push(v); }
  }
  // expiring 은 kept/thinned 와 겹친다(안내용) — 지워질 것은 빼서 돌려준다
  const gone = new Set([...plan.thinned].map((v) => v.id));
  plan.expiring = plan.expiring.filter((v) => !gone.has(v.id));
  return plan;
}
