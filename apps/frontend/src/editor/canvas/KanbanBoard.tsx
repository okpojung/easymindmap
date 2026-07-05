// KanbanBoard — alternative canvas renderer when layoutType = 'kanban'.
// Spec: docs/03-editor-core/layout/08-layout.md § 7.6, updated:
// - The 3-level (board/column/card) depth LIMIT is removed. depth-1 nodes are
//   columns and depth-2 nodes are cards, and depth-3+ descendants render
//   INSIDE the column as an indented tree-right outline under their card
//   (small elbow connector on the left, like nested cards).
// Same dot-grid background as the SVG canvas for visual consistency.

import type { ThemeTokens } from '@/components/design-tokens/theme';
import type { KanbanBoardData, KanbanCard } from '@/editor/__samples__/types';
import { I } from '@/components/icons';
import { resolveTagColor } from '@/editor/node-renderer/resolveTagColor';

interface Props {
  t: ThemeTokens;
  kanban: KanbanBoardData;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

const CHILD_INDENT = 16; // px per depth level inside a column (tree-right feel)

// One card box + its descendants, indented tree-right style. `depth` is the
// nesting level inside the column (0 = the card itself, 1+ = its subtree).
function CardNode({
  t,
  card,
  depth,
  selectedId,
  onSelect,
}: {
  t: ThemeTokens;
  card: KanbanCard;
  depth: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const tc = card.tag ? resolveTagColor(card.tag, t) : null;
  const hasChildren = (card.children?.length ?? 0) > 0;

  return (
    <div style={{ position: 'relative' }}>
      <div
        onClick={() => onSelect(card.id)}
        style={{
          background: t.surface,
          border: `1px solid ${card.active || selectedId === card.id ? t.primary : t.border}`,
          borderRadius: 8,
          padding: depth === 0 ? 10 : '7px 9px',
          marginBottom: 6,
          cursor: 'pointer',
          boxShadow: card.active ? `0 0 0 3px ${t.primary}22` : 'none',
        }}
      >
        <div
          style={{
            fontSize: depth === 0 ? 12.5 : 11.5,
            color: t.text,
            fontWeight: 500,
            marginBottom: tc ? 6 : 0,
            lineHeight: 1.35,
          }}
        >
          {card.title}
        </div>
        {tc && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span
              style={{
                fontSize: 10,
                padding: '1px 6px',
                borderRadius: 3,
                background: tc.bg,
                color: tc.text,
                border: `1px solid ${tc.border}`,
                fontWeight: 600,
                letterSpacing: 0.2,
              }}
            >
              #{card.tag}
            </span>
          </div>
        )}
      </div>

      {hasChildren && (
        <div style={{ position: 'relative', marginLeft: CHILD_INDENT }}>
          {/* tree-right elbow: a vertical spine down the parent card's left
              inset; each child gets a short horizontal tick into its box. */}
          <div
            style={{
              position: 'absolute',
              left: -CHILD_INDENT + 6,
              top: -6,
              bottom: 12,
              width: 1.5,
              background: t.borderStrong,
              borderRadius: 1,
            }}
          />
          {card.children!.map((child) => (
            <div key={child.id} style={{ position: 'relative' }}>
              <div
                style={{
                  position: 'absolute',
                  left: -CHILD_INDENT + 6,
                  top: 14,
                  width: CHILD_INDENT - 8,
                  height: 1.5,
                  background: t.borderStrong,
                  borderRadius: 1,
                }}
              />
              <CardNode
                t={t}
                card={child}
                depth={depth + 1}
                selectedId={selectedId}
                onSelect={onSelect}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
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
        Kanban 보드 · 하위 레벨은 카드 아래 트리로 표시
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
            {col.cards.map(card => (
              <CardNode
                key={card.id}
                t={t}
                card={card}
                depth={0}
                selectedId={selectedId}
                onSelect={onSelect}
              />
            ))}
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
