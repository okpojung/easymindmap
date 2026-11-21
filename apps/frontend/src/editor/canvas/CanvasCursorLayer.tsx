import type { ThemeTokens } from '@/components/design-tokens/theme';
import type { Collaborator } from '@/editor/__samples__/types';
import type { LaidOutNode } from '@/layout/types';
import { COLLAB_PRESENCE_UI } from '@/config/featureFlags';
import { CollabCursor } from '@/editor/collaboration/CollabCursor';
import { ProCursorLayer } from '@pro';
import { useViewportStore } from '@/stores/viewportStore';

interface Props {
  t: ThemeTokens; collab: Collaborator | undefined; nodes: LaidOutNode[];
  W: number; H: number; CX: number; CY: number; basic: boolean;
  homeGuard: boolean; guardedPanX: number; guardedPanY: number;
}

/** Presence overlays follow the live camera without rerendering map contents. */
export function CanvasCursorLayer({ t, collab, nodes, W, H, CX, CY, basic,
  homeGuard, guardedPanX, guardedPanY }: Props) {
  const x = useViewportStore(s => s.panX);
  const y = useViewportStore(s => s.panY);
  const zoom = useViewportStore(s => s.zoom);
  const homeArmed = useViewportStore(s => s.homeArmed);
  const panX = homeGuard && homeArmed ? guardedPanX : x;
  const panY = homeGuard && homeArmed ? guardedPanY : y;
  const geometry = { t, nodes, W, H, CX, CY, scale: (zoom || 100) / 100, panX, panY };
  return <>
    {COLLAB_PRESENCE_UI && <CollabCursor {...geometry} collab={collab} />}
    {!basic && <ProCursorLayer {...geometry} />}
  </>;
}
