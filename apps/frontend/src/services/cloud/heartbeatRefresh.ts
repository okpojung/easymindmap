// 하트비트 응답을 보고 **화면을 다시 읽을지** 정한다 (2026-09-08).
//
// 하트비트(5초)는 서버 문서의 `updatedAt` 을 실어 온다. 이 탭이 아는 시각보다
// 새로우면 지금까지는 무조건 `mapSession.refreshFromServer` 로 통째 다시
// 읽었다(AI 대화가 붙인 것을 보여 주려고 — 2026-09-05).
//
// ★ **협업 중에는 다시 읽지 않는다.** 협업맵은 방이 5초마다 정본을
//   물질화하므로 `updatedAt` 이 늘 앞서 나간다. 그것을 "다른 곳의 갱신"으로
//   보고 다시 읽으면, 낡은 정본(물질화 시점의 것)을 스토어에 갈아 끼우고,
//   협업 클라이언트가 그것을 **내 편집**으로 계산해 CRDT 에 밀어 넣는다 —
//   남의 확정을 지우고, 두 화면이 같은 물질화를 거의 동시에 다시 읽으면
//   같은 글자를 두 번 넣어 `III. III. 해결방안` · `해결방안방안` 처럼
//   불어난다(2026-09-08 실사용 보고, e2e237 에서 재현). 협업 중 화면은
//   소켓으로 이미 그 내용을 받았으니 **시각만 따라간다**('follow').
//
// 순수 함수 — 단위 테스트(heartbeatRefresh.test.ts)가 표를 그대로 본다.

export type HeartbeatPlan =
  /** 서버가 더 새롭고 협업 중이 아니다 — 다시 읽는다 */
  | 'refresh'
  /** 서버가 더 새롭지만 협업이 몰고 있다 — 시각만 따라간다 */
  | 'follow'
  /** 할 것 없음 */
  | 'none';

export function heartbeatRefreshPlan(
  r: { held?: boolean; updatedAt?: string | null } | null | undefined,
  known: string | null | undefined,
  collabDriving: boolean,
): HeartbeatPlan {
  if (!r || r.held === false || !r.updatedAt || !known) return 'none';
  const server = Date.parse(r.updatedAt);
  const mine = Date.parse(known);
  if (!(server > mine)) return 'none';
  return collabDriving ? 'follow' : 'refresh';
}
