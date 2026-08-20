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
}
