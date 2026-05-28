// KanbanBoard — alternative canvas renderer when layoutType = 'kanban'.
// Spec: docs/03-editor-core/layout/08-layout.md § 7.6 (3-level board/column/card)
// Same dot-grid background as the SVG canvas for visual consistency.

import type { ThemeTokens } from '@/components/design-tokens/theme';
import type { KanbanBoardData } from '@/editor/__samples__/types';
import { I } from '@/components/icons';
import { resolveTagColor } from '@/editor/node-renderer/resolveTagColor';

interface Props {
  t: ThemeTokens;
  kanban: KanbanBoardData;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function KanbanBoard({ t, kanban, selectedId, onSelect }: Props) {
  return (
    <div style={{
      flex: 1, overflow: 'auto', position: 'relative',
      background: `${t.canvas} radial-gradient(circle at center, ${t.border}aa 1px, transparent 1px) 0 0 / 24px 24px repeat`,
      padding: '40px 30px',
    }}>
      <div style={{
        position: 'absolute', top: 14, left: 14, zIndex: 5,
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '5px 10px', borderRadius: 20,
        background: t.surface, border: `1px solid ${t.border}`,
        boxShadow: t.shadowSm,
        fontSize: 11, color: t.textMuted, fontWeight: 500,
      }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: t.primary }} />
        Kanban 보드 · 3레벨 · board/column/card
      </div>

      <div style={{ fontSize: 20, fontWeight: 700, color: t.text, marginBottom: 20, paddingLeft: 4 }}>
        📋 {kanban.title}
      </div>

      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
        {kanban.columns.map(col => (
          <div key={col.id} style={{
            width: 260, flexShrink: 0,
            background: t.surfaceAlt,
            border: `1px solid ${t.border}`,
            borderRadius: 10,
            padding: 10,
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '2px 6px 10px',
              borderBottom: `1px solid ${t.divider}`,
              marginBottom: 8,
            }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: col.color }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: t.text }}>{col.title}</span>
              <span style={{
                fontSize: 11, color: t.textMuted, marginLeft: 'auto',
                background: t.surface, padding: '1px 6px', borderRadius: 8,
              }}>
                {col.count}
              </span>
            </div>
            {col.cards.map(card => {
              const tc = resolveTagColor(card.tag, t);
              return (
                <div key={card.id} onClick={() => onSelect(card.id)}
                  style={{
                    background: t.surface,
                    border: `1px solid ${card.active || selectedId === card.id ? t.primary : t.border}`,
                    borderRadius: 8, padding: 10, marginBottom: 6,
                    cursor: 'pointer',
                    boxShadow: card.active ? `0 0 0 3px ${t.primary}22` : 'none',
                  }}>
                  <div style={{
                    fontSize: 12.5, color: t.text, fontWeight: 500,
                    marginBottom: 6, lineHeight: 1.35,
                  }}>{card.title}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{
                      fontSize: 10, padding: '1px 6px', borderRadius: 3,
                      background: tc.bg, color: tc.text,
                      border: `1px solid ${tc.border}`,
                      fontWeight: 600, letterSpacing: 0.2,
                    }}>#{card.tag}</span>
                  </div>
                </div>
              );
            })}
            <button style={{
              width: '100%', padding: '6px 8px',
              background: 'transparent', border: `1px dashed ${t.border}`,
              borderRadius: 6, color: t.textMuted, cursor: 'pointer',
              fontSize: 12, fontWeight: 500,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
            }}>
              <I.Plus size={12} /> 카드 추가
            </button>
          </div>
        ))}
        <button style={{
          width: 200, flexShrink: 0,
          padding: 14, background: 'transparent',
          border: `1px dashed ${t.borderStrong}`, borderRadius: 10,
          color: t.textMuted, cursor: 'pointer',
          fontSize: 13, fontWeight: 500,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        }}>
          <I.Plus size={14} /> 컬럼 추가
        </button>
      </div>
    </div>
  );
}
