// 협업 확장점 — **계약만** 공개 코어에 둔다 (2026-08-15).
//
// 협업 구현은 유료이고 별도 private 저장소에 있다
// (docs/04-extensions/open-core-boundary.md). 코어는 **구현의 타입을
// import 하지 않는다** — 계약만 보고, 구현은 런타임에 꽂힌다.
// 그래야 공개 저장소만으로 타입체크가 통과한다.

/** 주입 토큰 — 클래스가 아니라 심볼로 받는다(구현이 없을 수도 있으므로) */
export const COLLAB = 'COLLAB_CONTRACT';

export interface CollabStatus {
  /** 이 서버에 협업 구현이 꽂혀 있는가 */
  enabled: boolean;
  /** 왜 꺼져 있는지 — 화면이 그대로 보여 준다. 켜져 있으면 null */
  reason: string | null;
  /** 구현이 알리는 기능 목록 (예: presence·chat). 스텁은 빈 배열 */
  features: string[];
}

export interface CollabSession {
  mapId: string;
  /** 실시간 연결에 쓸 주소 — 구현이 정한다 */
  endpoint: string;
  token: string;
  expiresAt: string;
}

export interface CollabContract {
  /** 항상 답한다 — 꺼져 있어도 **왜 꺼졌는지** 말한다 */
  status(): CollabStatus;

  /**
   * 협업 세션에 들어간다. 구현이 없으면 **404 로 거절한다** —
   * 조용히 성공하면 사용자가 협업이 되는 줄 안다.
   */
  join(mapId: string, userId: string): Promise<CollabSession>;
}
