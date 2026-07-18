// BottomStatusBar — zoom / save / collab / layout / cursor coords.
// Zoom controls here are the SOLE way to change viewport scale (per § 25 — affects canvas only).

import type { ThemeTokens } from '@/components/design-tokens/theme';
import type { Collaborator, LayoutType } from '@/editor/__samples__/types';
import { I } from '@/components/icons';
import { COLLAB_PRESENCE_UI } from '@/config/featureFlags';

interface Props {
  t: ThemeTokens;
  layoutType: LayoutType;
  collabs: Collaborator[];
  zoom: number;
  onZoomChange: (v: number) => void;
}

const LAYOUT_LABELS: Record<string, string> = {
  'radial-bidirectional': '방사형 · 양쪽',
  'radial-right':         '방사형 · 오른쪽',
  'tree-right':           '트리 · 오른쪽',
  'tree-down':            '트리 · 아래',
  'hierarchy-right':      '계층형 · 오른쪽',
  'process-tree-right':   '진행트리 · 오른쪽',
  'freeform':             '자유 배치',
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

      {/* [협업 UI 숨김 — MVP] "협업자 N명 · 실시간 연결됨" 안내.
          협업 기능(V2) 개발 시 featureFlags.ts의 COLLAB_PRESENCE_UI를 true로
          바꾸면 다시 표시된다. 코드는 삭제하지 않고 보존. */}
      {COLLAB_PRESENCE_UI && (
        <>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <I.Users size={12} />
            협업자 {activeCount}명 ·{' '}
            <span style={{ color: t.success, fontWeight: 600 }}>● 실시간 연결됨</span>
          </span>

          <span style={{ width: 1, height: 14, background: t.divider }} />
        </>
      )}

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
      {stepBtn(<I.Minus size={12} />, () => onZoomChange(Math.max(2, zoom - 10)))}
      <button onClick={() => onZoomChange(100)} title="100%로 재설정" style={{
        padding: '2px 10px', background: t.surface,
        border: `1px solid ${t.border}`, borderRadius: 4,
        color: t.text, cursor: 'pointer', fontSize: 11, fontWeight: 600,
        fontFamily: 'ui-monospace, monospace', minWidth: 44,
      }}>{Math.round(zoom)}%</button>
      {stepBtn(<I.Plus size={12} />, () => onZoomChange(Math.min(400, zoom + 10)))}
      <span style={{ marginLeft: 3 }}>{stepBtn(<I.Zoom100 size={13} />, () => onZoomChange(100), '100%로 보기')}</span>
    </div>
  );
}
