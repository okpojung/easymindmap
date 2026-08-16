// 유료 확장점 — **계약만** 공개 코어에 둔다 (2026-08-16).
//
// 유료 기능(MVP 이외 제품 기능 전부)의 구현은 별도 private 저장소에 있다
// (docs/04-extensions/open-core-boundary.md). 코어는 **구현의 타입을
// import 하지 않는다** — 계약만 보고, 구현은 런타임에 꽂힌다.
// 그래야 공개 저장소만으로 타입체크가 통과한다.

/**
 * 주입 토큰 — **문자열**이다. 클래스나 심볼이면 유료 패키지가 코어의
 * 그 값을 import 해야 같은 토큰으로 인정되는데, 문자열은 값이 같으면
 * 같은 토큰이다. 두 저장소가 서로의 타입을 몰라도 DI 가 이어진다.
 */
export const PRO = 'PRO_CONTRACT';

/** 유료 모듈이 꽂혀 있는지 — 기동 로그가 쓴다 */
export const PRO_INSTALLED = 'PRO_INSTALLED';

export interface ProFeature {
  /** 'collab' · 'translate' … — 화면이 이 값으로 자리를 찾는다 */
  id: string;
  /** 사람이 읽는 이름 */
  name: string;
  /** 이 서버에서 지금 쓸 수 있는가 */
  enabled: boolean;
  /** 꺼져 있으면 **왜** — 화면이 그대로 보여 준다. 켜져 있으면 null */
  reason: string | null;
}

export interface ProContract {
  /**
   * 유료 기능의 **목록과 상태**. 코어가 유료 모듈에 묻는 것은 이것뿐이다.
   *
   * 기능별 경로는 유료 모듈이 자기가 가져온다 — 그래야 유료 기능이 늘어도
   * 공개 코어에 커밋이 생기지 않는다(open-core-boundary.md §4.1).
   */
  features(): ProFeature[] | Promise<ProFeature[]>;
}

/**
 * **유료 기능 목록은 코어가 안다.** 로드맵에 이미 공개돼 있는 정보이고,
 * 화면이 **꺼진 기능의 자리도 그려야** 하기 때문이다 — 목록까지 유료
 * 모듈이 들고 있으면, 모듈이 없을 때 화면은 자리를 그릴 근거를 잃는다
 * (open-core-boundary.md §3.1 ③ "화면의 자리는 공개").
 *
 * 비공개인 것은 **무엇이 있는가**가 아니라 **어떻게 동작하는가**다.
 */
export const PRO_FEATURE_CATALOG: ReadonlyArray<{ id: string; name: string }> = [
  { id: 'collab', name: '실시간 협업' },
  { id: 'translate', name: '실시간 번역' },
  { id: 'plugins', name: '외부 연동 플러그인' },
  { id: 'wbs', name: 'WBS · 리소스 할당' },
  { id: 'dashboard', name: '대시보드 맵' },
  { id: 'ai-workflow', name: 'AI 실행형 절차' },
];
