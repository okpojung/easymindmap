import { useState } from 'react';
import type { ThemeTokens } from '@/components/design-tokens/theme';
import type { OutlineNode as OutlineNodeData } from '@/editor/__samples__/types';
import { I } from '@/components/icons';
import { useInteractionStore } from '@/stores/interactionStore';

interface PanelProps {
  t: ThemeTokens;
  outline: OutlineNodeData[];
}

export function OutlinePanel({ t, outline }: PanelProps) {
  return (
    <div style={{ padding: '10px 6px 12px' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '4px 10px 8px',
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: t.textSubtle,
            textTransform: 'uppercase',
            letterSpacing: 0.5,
          }}
        >
          전체 구조
        </div>

        <button
          style={{
            background: 'none',
            border: 'none',
            color: t.textMuted,
            cursor: 'pointer',
            display: 'flex',
            padding: 2,
          }}
        >
          <I.MoreH size={14} />
        </button>
      </div>

      {outline.map((node) => (
        <OutlineRow key={node.id} t={t} node={node} />
      ))}
    </div>
  );
}

function OutlineRow({ t, node }: { t: ThemeTokens; node: OutlineNodeData }) {
  const [expanded, setExpanded] = useState(node.expanded !== false);
  const hasChildren = !!node.children && node.children.length > 0;
  // 아웃라인 행 클릭 = 캔버스의 노드 선택과 연동
  const setSelectedId = useInteractionStore((s) => s.setSelectedId);

  return (
    <div>
      <div
        data-outline-id={node.id}
        onClick={() => setSelectedId(node.id)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '5px 6px 5px',
          paddingLeft: 8 + node.depth * 14,
          borderRadius: 6,
          background: node.selected ? t.primarySoft : 'transparent',
          color: node.selected ? t.primary : t.text,
          fontSize: 13,
          fontWeight: node.depth === 0 ? 600 : node.selected ? 600 : 400,
          cursor: 'pointer',
          position: 'relative',
          marginBottom: 1,
        }}
      >
        <button
          onClick={(e) => { e.stopPropagation(); setExpanded((x) => !x); }}
          style={{
            width: 16,
            height: 16,
            background: 'none',
            border: 'none',
            color: t.textMuted,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            visibility: hasChildren ? 'visible' : 'hidden',
            padding: 0,
          }}
        >
          {expanded ? (
            <I.ChevronDown size={12} strokeWidth={2} />
          ) : (
            <I.ChevronRight size={12} strokeWidth={2} />
          )}
        </button>

        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: '50%',
            background:
              node.depth === 0
                ? t.primary
                : node.selected
                  ? t.primary
                  : t.borderStrong,
            flexShrink: 0,
            border: node.depth === 0 ? `2px solid ${t.primary}` : 'none',
          }}
        />

        <span
          style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {node.text}
        </span>

        {node.selected && (
          <span
            style={{
              marginLeft: 'auto',
              fontSize: 9,
              color: t.primary,
              fontWeight: 700,
            }}
          >
            ●
          </span>
        )}
      </div>

      {expanded &&
        hasChildren &&
        node.children!.map((c) => <OutlineRow key={c.id} t={t} node={c} />)}
    </div>
  );
}