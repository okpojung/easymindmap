import { useState } from 'react';
import type { ThemeTokens } from '@/components/design-tokens/theme';
import type { LayoutType } from '@/editor/__samples__/types';
import { I } from '@/components/icons';
import { LayoutGlyph } from './LayoutGlyph';

interface Props {
  t: ThemeTokens;
  layoutType: LayoutType;
  labels: Record<string, string>;
  onChange: (v: LayoutType) => void;
}

export function LayoutPicker({ t, layoutType, labels, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const items = [
    { key: 'radial-bidirectional' as LayoutType, label: '방사형 · 양쪽',  icon: <LayoutGlyph type="radial" /> },
    { key: 'tree-right'           as LayoutType, label: '트리 · 오른쪽',  icon: <LayoutGlyph type="tree" />   },
    { key: 'hierarchy-right'      as LayoutType, label: '계층형 · 오른쪽', icon: <LayoutGlyph type="hier" />   },
    { key: 'kanban'               as LayoutType, label: 'Kanban 보드',    icon: <LayoutGlyph type="kanban" /> },
  ];

  const glyphType =
    layoutType === 'radial-bidirectional' ? 'radial' :
    layoutType === 'tree-right'           ? 'tree'   :
    layoutType === 'hierarchy-right'      ? 'hier'   :
    'kanban';

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 7,
          padding: '6px 10px 6px 8px', borderRadius: 7,
          background: open ? t.primarySoft : t.surfaceAlt,
          color: t.text,
          border: `1px solid ${open ? t.primaryBorder : t.border}`,
          cursor: 'pointer', fontSize: 12.5, fontWeight: 500,
        }}>
        <LayoutGlyph type={glyphType} />
        {labels[layoutType]}
        <I.ChevronDown size={13} style={{ opacity: 0.6 }} />
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)}
               style={{ position: 'fixed', inset: 0, zIndex: 30 }} />
          <div style={{
            position: 'absolute', top: 'calc(100% + 4px)', left: 0,
            minWidth: 220,
            background: t.surface, border: `1px solid ${t.border}`,
            borderRadius: 10, boxShadow: t.shadowLg, padding: 6, zIndex: 31,
          }}>
            <div style={{
              fontSize: 10.5, fontWeight: 600, color: t.textSubtle,
              padding: '6px 10px 4px',
              textTransform: 'uppercase', letterSpacing: 0.5,
            }}>레이아웃 전환</div>
            {items.map(it => (
              <button key={it.key}
                onClick={() => { onChange(it.key); setOpen(false); }}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 10px', borderRadius: 6,
                  background: it.key === layoutType ? t.primarySoft : 'transparent',
                  color:      it.key === layoutType ? t.primary     : t.text,
                  border: 'none', cursor: 'pointer',
                  fontSize: 13, textAlign: 'left',
                  fontWeight: it.key === layoutType ? 600 : 500,
                }}>
                {it.icon} {it.label}
                {it.key === layoutType && (
                  <span style={{ marginLeft: 'auto' }}><I.Check size={14} /></span>
                )}
              </button>
            ))}
            <div style={{
              fontSize: 11, color: t.textSubtle,
              padding: '8px 10px 6px',
              borderTop: `1px solid ${t.divider}`,
              marginTop: 4,
            }}>+11가지 레이아웃 더…</div>
          </div>
        </>
      )}
    </div>
  );
}
