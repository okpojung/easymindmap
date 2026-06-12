// File: src/editor/inspector-panels/LayoutTab.tsx
// Version: MVP-LayoutTab-SubtreeScope-v2.0.0
// Description:
// - Left inspector layout tab
// - Uses src/components/icons/LayoutGlyph.tsx for layout icons
// - Scope: when a non-root node is selected, the layout is applied to that
//   node's subtree by default. The "맵 전체" toggle switches back to applying
//   the layout to the whole map.
// - Kanban / freeform can only be applied to the whole map.

import { useState } from 'react';
import type { ThemeTokens } from '@/components/design-tokens/theme';
import type { LayoutType } from '@/types/mindmap';
import type { MindNode, SampleMap } from '@/editor/__samples__/types';
import { I } from '@/components/icons';
import { LayoutGlyph, type LayoutGlyphType } from '@/components/icons/LayoutGlyph';
import { normalizeLayoutType } from '@/layout/normalizeLayoutType';
import { InspectorSection, InspectorRow, Toggle } from './InspectorSection';
import { useDocumentStore, useEditorUiStore, useInteractionStore } from '@/stores';

interface LayoutOption {
  key: LayoutType;
  label: string;
  glyph: LayoutGlyphType;
  mapOnly?: boolean;
}

const LAYOUTS: LayoutOption[] = [
  {
    key: 'radial-bidirectional' as LayoutType,
    label: '방사형 · 양쪽',
    glyph: 'both-radial',
  },
  {
    key: 'radial-right' as LayoutType,
    label: '방사형 · 오른쪽',
    glyph: 'radial-right',
  },
  {
    key: 'tree-right' as LayoutType,
    label: '트리 · 오른쪽',
    glyph: 'tree-right',
  },
  {
    key: 'tree-down' as LayoutType,
    label: '트리 · 아래',
    glyph: 'tree-down',
  },
  {
    key: 'hierarchy-right' as LayoutType,
    label: '계층형 · 오른쪽',
    glyph: 'hierarchy-right',
  },
  {
    key: 'process-tree-right' as LayoutType,
    label: '진행트리 · 오른쪽',
    glyph: 'process-tree-right',
  },
  {
    key: 'kanban' as LayoutType,
    label: 'Kanban 보드',
    glyph: 'kanban',
    mapOnly: true,
  },
  {
    key: 'freeform' as LayoutType,
    label: '자유 배치',
    glyph: 'freeform',
    mapOnly: true,
  },
];

function findNode(nodes: MindNode[], nodeId: string): MindNode | null {
  for (const node of nodes) {
    if (node.id === nodeId) return node;

    const found = findNode(node.children ?? [], nodeId);
    if (found) return found;
  }

  return null;
}

// Effective layout of a node = its own layoutType, or the nearest ancestor's.
function effectiveLayoutOf(
  map: SampleMap,
  nodeId: string,
  fallback: LayoutType,
): LayoutType {
  const walk = (nodes: MindNode[], inherited: LayoutType): LayoutType | null => {
    for (const node of nodes) {
      const current = node.layoutType ?? inherited;
      if (node.id === nodeId) return current;

      const found = walk(node.children ?? [], current);
      if (found) return found;
    }

    return null;
  };

  return walk(map.branches, map.root.layoutType ?? fallback) ?? fallback;
}

export function LayoutTab({ t }: { t: ThemeTokens }) {
  const map = useDocumentStore((s) => s.map);
  const updateNodeLayoutType = useDocumentStore((s) => s.updateNodeLayoutType);

  const selectedId = useInteractionStore((s) => s.selectedId);

  const layoutType = useEditorUiStore((s) => s.layoutType);
  const setLayoutType = useEditorUiStore((s) => s.setLayoutType);

  const [wholeMap, setWholeMap] = useState(false);

  const nodeScopeAvailable =
    !!selectedId && selectedId !== 'root' && !!findNode(map.branches, selectedId);
  const applyToWholeMap = wholeMap || !nodeScopeAvailable;

  const activeLayoutType = normalizeLayoutType(
    applyToWholeMap
      ? layoutType
      : effectiveLayoutOf(map, selectedId!, layoutType),
  );

  const handleLayoutClick = (option: LayoutOption) => {
    if (applyToWholeMap) {
      setLayoutType(option.key);
      updateNodeLayoutType('root', option.key);
      return;
    }

    if (option.mapOnly) return;

    updateNodeLayoutType(selectedId, option.key);
  };

  return (
    <div>
      <InspectorSection t={t} title="레이아웃">
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 6,
          }}
        >
          {LAYOUTS.map((layout) => {
            const active = normalizeLayoutType(layout.key) === activeLayoutType;
            const disabled = !applyToWholeMap && !!layout.mapOnly;

            return (
              <button
                key={layout.key}
                onClick={() => handleLayoutClick(layout)}
                disabled={disabled}
                title={
                  disabled
                    ? '맵 전체에만 적용할 수 있는 레이아웃입니다.'
                    : undefined
                }
                style={{
                  padding: '8px 8px 6px',
                  background: active ? t.primarySoft : t.surfaceAlt,
                  border: `1.5px solid ${active ? t.primary : t.border}`,
                  borderRadius: 7,
                  cursor: disabled ? 'default' : 'pointer',
                  opacity: disabled ? 0.45 : 1,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 5,
                  alignItems: 'flex-start',
                  textAlign: 'left',
                }}
              >
                <LayoutGlyph
                  type={layout.glyph}
                  color={active ? t.primary : t.textMuted}
                  width={44}
                  height={26}
                  strokeWidth={1.7}
                />

                <span
                  style={{
                    fontSize: 11,
                    fontWeight: active ? 600 : 500,
                    color: active ? t.primary : t.text,
                  }}
                >
                  {layout.label}
                </span>
              </button>
            );
          })}
        </div>
      </InspectorSection>

      <InspectorSection t={t} title="적용 범위">
        <InspectorRow t={t} label="맵 전체">
          <Toggle
            t={t}
            on={applyToWholeMap}
            onChange={(v) => {
              if (nodeScopeAvailable) setWholeMap(v);
            }}
          />
        </InspectorRow>

        <div
          style={{
            fontSize: 10.5,
            color: t.textSubtle,
            marginTop: 4,
            lineHeight: 1.5,
          }}
        >
          {nodeScopeAvailable
            ? applyToWholeMap
              ? `토글을 끄면 선택한 노드(${selectedId}) 하위에만 레이아웃이 적용됩니다.`
              : `레이아웃이 선택한 노드(${selectedId}) 하위 서브트리에만 적용됩니다.`
            : '노드를 선택하면 해당 노드 하위에만 레이아웃을 적용할 수 있습니다. 선택 노드: 없음'}
        </div>
      </InspectorSection>

      <InspectorSection t={t} title="간격 · 정렬">
        <div
          style={{
            fontSize: 10.5,
            color: t.textSubtle,
            marginBottom: 8,
            lineHeight: 1.5,
          }}
        >
          노드 간격 / 레벨 간격은 향후 맵 설정에서 조정합니다.
        </div>

        <button
          style={{
            width: '100%',
            padding: '7px 10px',
            borderRadius: 6,
            background: t.surfaceAlt,
            border: `1px solid ${t.border}`,
            color: t.text,
            cursor: 'pointer',
            fontSize: 12,
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
          }}
        >
          <I.Settings size={13} /> 맵 설정 열기
        </button>
      </InspectorSection>

      <InspectorSection t={t} title="연결선 스타일">
        <div
          style={{
            padding: '10px 12px',
            borderRadius: 7,
            background: t.surfaceAlt,
            border: `1px dashed ${t.border}`,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <span
            style={{
              fontSize: 9.5,
              fontWeight: 700,
              padding: '2px 6px',
              borderRadius: 3,
              background: t.accent + '22',
              color: t.accent,
              letterSpacing: 0.4,
              flexShrink: 0,
            }}
          >
            V1+
          </span>

          <div
            style={{
              fontSize: 11,
              color: t.textMuted,
              lineHeight: 1.5,
            }}
          >
            연결선 스타일·두께·색상 사용자 지정은 향후 단계에서 제공됩니다.
            MVP에서는 레이아웃 종류에 따라 자동 결정됩니다.
          </div>
        </div>
      </InspectorSection>
    </div>
  );
}
