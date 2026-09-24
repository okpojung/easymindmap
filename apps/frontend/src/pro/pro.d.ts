// `@pro` 별칭의 타입 — 유료 UI 가 없을 때는 코어의 스텁이 이 모양을 지킨다.
// tsconfig 의 paths 로 해결되지만, 유료 UI 로 바꿔 끼워도 화면 쪽 코드가
// 그대로 돌아야 하므로 **기대하는 모양을 여기 적어 둔다.**
declare module '@pro' {
  import type { ThemeTokens } from '@/components/design-tokens/theme';
  import type { LaidOutNode } from '@/layout/types';
  export function ProFeaturePanel(p: { t: ThemeTokens; featureId: string }): JSX.Element;

  // ── 협업 자리 (2026-08-18) ──
  // 공개판에서는 셋 다 아무것도 그리지 않는다(그것이 정상 동작이다).
  export function ProCollabSession(p: { mapId: string | null; kind?: string }): JSX.Element | null;
  export function ProPresenceBar(p: { t: ThemeTokens }): JSX.Element | null;
  export function ProShareDialog(p: {
    t: ThemeTokens; mapId: string | null; onClose: () => void;
  }): JSX.Element | null;
  /**
   * 문서함의 **협업맵 유형 칸**을 감싼다 (2026-08-20).
   * 공개판은 `children` 을 그대로 돌려준다 — 자리만 있고 내용은 없다.
   * 유료판은 여기에 대고 참가자 목록을 보여 준다.
   */
  export function ProMapMembersTip(p: {
    t: ThemeTokens; mapId: string; children: JSX.Element;
  }): JSX.Element;
  export function ProCursorLayer(p: {
    t: ThemeTokens; W: number; H: number; nodes: LaidOutNode[];
    scale?: number; CX: number; CY: number; panX?: number; panY?: number;
  }): JSX.Element | null;

  // ── 초대·소유권 이전 자리 (2026-09-05, collaboration/29 §8.3) ──
  // 공개판에서는 둘 다 아무것도 그리지 않는다.
  /**
   * 문서함 상단 **받은함** — 받은 소유권 제안(수락/거절)과 새로 공유된 맵.
   * 유료 모듈이 `GET /collab/inbox` 로 채운다. `onOpenMap` 은 문서함이
   * 맵을 여는 길 그대로(`?map=` 새 탭이 아니라 이 탭에서 연다).
   */
  export function ProInbox(p: {
    t: ThemeTokens; onOpenMap: (mapId: string) => void;
  }): JSX.Element | null;
  /**
   * '공유받은 맵' 행의 동작 자리 — **[나가기]** 가 여기 들어간다.
   * 나간 뒤 `onLeft` 로 목록을 다시 읽게 한다.
   */
  export function ProSharedMapActions(p: {
    t: ThemeTokens; mapId: string; onLeft: () => void;
  }): JSX.Element | null;

  // ── 맵 판매 자리 (2026-09-22, 27b §8.1) ──
  /**
   * 퍼블리싱 대화상자의 **값 칸 아래**. 하는 일이 둘이다.
   *
   *   ① **받을 준비가 됐는지** 유료 모듈에 묻고 `onReady` 로 답한다 —
   *      코어는 그 답으로 값 칸을 잠그고 푼다. 모드 A 에서 "준비" 는
   *      정산 계좌가 확인됐다는 뜻이다.
   *   ② 지금 친 값에서 **수수료·원천징수·받는 금액을 갈라서** 보여 준다
   *      (27a §6.4 — 합치지 않는다). 요율은 유료 모듈의 설정값이라 코어가
   *      모른다.
   *
   * ★ `onReady` 를 **반드시 한 번은 부른다.** 부르지 않으면 코어는 "아직
   *   모른다" 로 보고 칸을 잠근 채 둔다 — 그것이 안전한 쪽이지만, 영영
   *   잠긴 칸이 되면 안 된다.
   */
  export function ProSalesGate(p: {
    t: ThemeTokens;
    /** 지금 칸에 쳐 넣은 값(원) — 숫자가 아니면 null */
    priceKrw: number | null;
    onReady: (ready: boolean) => void;
  }): JSX.Element | null;
  /**
   * 계정 메뉴 ▸ **💰 판매·정산** 창의 알맹이 — 정산 계좌 등록 · 판매 내역
   * (수수료·저자몫) · 아직 못 받은 돈 · 정산 회차.
   *
   * 공개판에는 이 창을 여는 자리 자체가 없다(`map-sales` 가 꺼져 있다).
   */
  export function ProSalesPanel(p: { t: ThemeTokens }): JSX.Element | null;
  /**
   * 관리자 콘솔 ▸ **판매관리** 탭의 알맹이 (2026-09-22).
   *
   * 요율·값 범위·환불 기간·최소 정산액 · 정산 계좌 확인/반려 · 정산 회차
   * 돌리기와 보냄 표시. 표도 판정도 유료 모듈 것이라, 코어는 **탭 자리**만
   * 낸다 (`map-sales` 가 켜진 서버에서만 그린다).
   *
   * ★ 관리자 표(`X-Admin-Token`)는 코어의 `adminToken` 에 있다 — 유료
   *   모듈이 그것을 읽어 싣는다. 표를 두 벌로 만들면 한쪽이 언젠가
   *   어긋난다.
   */
  export function ProSalesAdminPanel(p: { t: ThemeTokens }): JSX.Element | null;
  /**
   * 유료 맵 뷰어(`/p/{publishId}`)의 **[구매하기] 자리** (2026-09-24).
   *
   * 하는 일이 둘이다.
   *   ① 손님에게 **[구매하기]** 를 내주고 결제창으로 보낸다
   *   ② 결제 뒤 `?sale=<id>` 를 달고 돌아오면 그것을 읽어 **열쇠를 받아
   *      파일을 내준다** (27b §7 ①~③)
   *
   * ★ 테마 토큰을 받지 않는다 — 이 화면은 에디터가 아니라 **뷰어**라
   *   자기 색(`#FFF7E6` 계열)을 쓴다. 자리도 그 색에 맞춰 그린다.
   *
   * ★ 코어는 **무엇을 파는지**만 넘긴다. 값 판정·결제·환불·전문 서빙은
   *   전부 유료 모듈 안에서 끝난다.
   */
  export function ProBuyPanel(p: {
    publishId: string; title: string; priceKrw: number | null;
  }): JSX.Element | null;
}
