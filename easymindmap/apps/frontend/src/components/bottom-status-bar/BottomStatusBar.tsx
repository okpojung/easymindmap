// BottomStatusBar — zoom / save / collab / layout / cursor coords.
// Zoom controls here are the SOLE way to change viewport scale (per § 25 — affects canvas only).

import type { ThemeTokens } from '@/components/design-tokens/theme';
import type { Collaborator, LayoutType } from '@/editor/__samples__/types';
import { I } from '@/components/icons';

interface Props {
  t: ThemeTokens;
  layoutType: LayoutType;
  collabs: Collaborator[];
  zoom: number;
  onZoomChange: (v: number) => void;
}

const LAYOUT_LABELS: Record<string, string> = {
  'radial-bidirectional': '방사형 · 양쪽',
  'tree-right':           '트리 · 오른쪽',
  'tree-down':            '트리 · 아래',
  'hierarchy-right':      '계층형 · 오른쪽',
  'kanban':               'Kanban 보드',
};

export function BottomStatusBar({ t, layoutType, collabs, zoom, onZoomChange }: Props) {
  const activeCount = collabs.filter(c => c.active).length;

  return (
    <div style={{
      height: 30, flexShrink: 0,
      background: t.surfaceAlt,
      borderTop: `1px solid ${t.border}`,
      display: 'flex', alignItems: 'center',
      padding: '0 12px', gap: 14,
      fontSize: 11, color: t.textMuted, fontWeight: 500,
    }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: t.primary }} />
        20 노드 · depth 2
      </span>

      <span style={{ width: 1, height: 14, background: t.divider }} />

      <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <I.Layout size={12} /> {LAYOUT_LABELS[layoutType] || layoutType}
      </span>

      <span style={{ width: 1, height: 14, background: t.divider }} />

      <span style={{
        display: 'flex', alignItems: 'center', gap: 5,
        fontFamily: 'ui-monospace, monospace', fontSize: 10.5,
      }}>
        <I.Mouse size={12} />
        x: 742, y: 358
      </span>

      <div style={{ flex: 1 }} />

      <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <I.Users size={12} />
        협업자 {activeCount}명 ·{' '}
        <span style={{ color: t.success, fontWeight: 600 }}>● 실시간 연결됨</span>
      </span>

      <span style={{ width: 1, height: 14, background: t.divider }} />

      <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <I.Cloud size={12} />
        Supabase 동기화됨
      </span>

      <span style={{ width: 1, height: 14, background: t.divider }} />

      <ZoomControl t={t} zoom={zoom} onZoomChange={onZoomChange} />
    </div>
  );
}

function ZoomControl({ t, zoom, onZoomChange }: { t: ThemeTokens; zoom: number; onZoomChange: (v: number) => void }) {
  const stepBtn = (children: React.ReactNode, onClick?: () => void, title?: string) => (
    <button onClick={onClick} title={title} style={{
      width: 22, height: 20, background: 'transparent', border: 'none',
      color: t.text, cursor: 'pointer', borderRadius: 3,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>{children}</button>
  );

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
      {stepBtn(<I.Minus size={12} />, () => onZoomChange(Math.max(33, zoom - 10)))}
      <button style={{
        padding: '2px 10px', background: t.surface,
        border: `1px solid ${t.border}`, borderRadius: 4,
        color: t.text, cursor: 'pointer', fontSize: 11, fontWeight: 600,
        fontFamily: 'ui-monospace, monospace', minWidth: 44,
      }}>{zoom}%</button>
      {stepBtn(<I.Plus size={12} />, () => onZoomChange(Math.min(400, zoom + 10)))}
      <span style={{ marginLeft: 3 }}>{stepBtn(<I.Fit size={12} />, undefined, 'Fit Screen')}</span>
    </div>
  );
}
