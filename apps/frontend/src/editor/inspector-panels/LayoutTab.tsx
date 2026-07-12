// File: src/editor/inspector-panels/LayoutTab.tsx
// Version: MVP-LayoutTab-RootOnlyRules-v3.0.0
// Description:
// - Left inspector layout tab.
// - Selection-scope rules (no "맵 전체" toggle — the ROOT node IS the whole
//   map):
//   · Root selected (or nothing selected) → every layout is selectable and
//     applies to the whole map.
//   · A depth ≥ 1 node selected → the layout applies to that node's subtree,
//     and root-only layouts (방사형·양쪽 / 트리·아래 / Kanban / 자유배치) are
//     shown disabled.
//   · While the map layout is Kanban there is no per-subtree layout (cards
//     follow the board), so EVERY selection acts as root scope: all layouts
//     stay selectable and clicking one changes the WHOLE map layout — this is
//     also the escape hatch out of Kanban.
// - 자유배치(freeform) is selectable at the root but does NOT change the map
//   layout — it is reserved for future flowchart/diagram authoring. Clicking
//   it only shows the explanation; the current map layout stays.

import type { ThemeTokens } from '@/components/design-tokens/theme';
import type { LayoutType } from '@/types/mindmap';
import type { MindNode, SampleMap } from '@/editor/__samples__/types';
import { I } from '@/components/icons';
import { LayoutGlyph, type LayoutGlyphType } from '@/components/icons/LayoutGlyph';
import { normalizeLayoutType } from '@/layout/normalizeLayoutType';
import { InspectorSection } from './InspectorSection';
import { useDocumentStore, useEditorUiStore, useInteractionStore } from '@/stores';

interface LayoutOption {
  key: LayoutType;
  label: string;
  glyph: LayoutGlyphType;
  // Only applicable to the ROOT node (= the whole map): layouts that place
  // branches on both sides of / all around the root, board views, and manual
  // placement. A subtree hanging off one side cannot use them.
  rootOnly?: boolean;
  // Selecting it never changes the map layout (future flowchart use).
  neverApplies?: boolean;
}

const LAYOUTS: LayoutOption[] = [
  {
    key: 'radial-bidirectional' as LayoutType,
    label: '방사형 · 양쪽',
    glyph: 'both-radial',
    rootOnly: true,
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
    rootOnly: true,
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
    rootOnly: true,
  },
  {
    key: 'freeform' as LayoutType,
    label: '자유 배치',
    glyph: 'freeform',
    rootOnly: true,
    neverApplies: true,
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
  const spacingX = useEditorUiStore((s) => s.spacingX);
  const spacingY = useEditorUiStore((s) => s.spacingY);
  const setSpacingX = useEditorUiStore((s) => s.setSpacingX);
  const setSpacingY = useEditorUiStore((s) => s.setSpacingY);
  const resetSpacing = useEditorUiStore((s) => s.resetSpacing);

  const mapIsKanban = normalizeLayoutType(layoutType) === ('kanban' as LayoutType);

  // No selection (or a stale id) → the layout grid is fully DISABLED: the
  // user must pick a node first so it is always explicit what the layout
  // will apply to (main node = whole map, other node = its subtree).
  const hasSelection =
    !!selectedId &&
    (selectedId === 'root' || !!findNode(map.branches, selectedId));

  // Kanban has no per-subtree layout, so while the board is active EVERY
  // selection acts as root scope: clicking a layout changes the whole map.
  const subtreeScope =
    hasSelection && !mapIsKanban && selectedId !== 'root';

  const activeLayoutType = normalizeLayoutType(
    subtreeScope ? effectiveLayoutOf(map, selectedId!, layoutType) : layoutType,
  );

  const optionDisabled = (option: LayoutOption): boolean => {
    if (!hasSelection) return true; // nothing selected: everything disabled
    if (!subtreeScope) return false; // root scope: everything selectable
    return !!option.rootOnly; // subtree: root-only layouts are unavailable
  };

  const disabledReason = (option: LayoutOption): string | undefined => {
    if (!hasSelection) return '노드를 먼저 선택하세요.';
    if (subtreeScope && option.rootOnly)
      return '메인 노드에서만 적용할 수 있는 레이아웃입니다.';
    return undefined;
  };

  const handleLayoutClick = (option: LayoutOption) => {
    if (optionDisabled(option)) return;

    // 자유배치: 메인 노드에서만 선택할 수 있지만 맵 레이아웃은 변경하지
    // 않는다 (순서도·플로차트 등 향후 용도 — 아래 안내 참조).
    if (option.neverApplies) return;

    if (!subtreeScope) {
      setLayoutType(option.key);
      updateNodeLayoutType('root', option.key);
      return;
    }

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
            const disabled = optionDisabled(layout);

            return (
              <button
                key={layout.key}
                onClick={() => handleLayoutClick(layout)}
                disabled={disabled}
                title={disabledReason(layout)}
                style={{
                  padding: '8px 8px 6px',
                  background: active ? t.primarySoft : t.surfaceAlt,
                  border: `1.5px solid ${active ? t.primary : t.border}`,
                  borderRadius: 7,
                  cursor: disabled ? 'default' : 'pointer',
                  opacity: disabled ? 0.4 : 1,
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

        <div
          style={{
            fontSize: 10.5,
            color: t.textSubtle,
            marginTop: 8,
            lineHeight: 1.55,
          }}
        >
          {!hasSelection
            ? '노드를 선택하면 레이아웃을 변경할 수 있습니다. 메인 노드 선택 시 맵 전체, 하위 노드 선택 시 해당 서브트리에 적용됩니다.'
            : subtreeScope
              ? `선택한 노드(${selectedId}) 하위 서브트리에 레이아웃이 적용됩니다. 흐리게 표시된 레이아웃은 메인 노드 전용입니다.`
              : mapIsKanban
                ? 'Kanban 보드에는 하위 노드별 레이아웃이 없습니다. 어떤 노드를 선택해도 선택한 레이아웃이 맵 전체에 적용됩니다.'
                : '메인 노드 기준 — 선택한 레이아웃이 맵 전체에 적용됩니다.'}
        </div>
      </InspectorSection>

      <InspectorSection t={t} title="자유 배치">
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
            자유 배치는 순서도·플로차트 등 자유형 문서를 위한 모드로 향후
            제공됩니다. 선택해도 현재 맵 레이아웃은 변경되지 않습니다.
          </div>
        </div>
      </InspectorSection>

      <InspectorSection
        t={t}
        title="간격 · 정렬"
        action={
          (spacingX !== 1 || spacingY !== 1) ? (
            <button
              onClick={resetSpacing}
              title="간격을 기본값(100%)으로 되돌립니다"
              style={{
                padding: '2px 7px', borderRadius: 4, fontSize: 10, fontWeight: 600,
                background: t.surfaceAlt, color: t.textMuted,
                border: `1px solid ${t.border}`, cursor: 'pointer',
              }}
            >
              초기화
            </button>
          ) : undefined
        }
      >
        <SpacingSlider
          t={t}
          label="가로 간격"
          value={spacingX}
          onChange={setSpacingX}
        />
        <SpacingSlider
          t={t}
          label="세로 간격"
          value={spacingY}
          onChange={setSpacingY}
        />
        <div
          style={{
            fontSize: 10.5,
            color: t.textSubtle,
            marginTop: 6,
            lineHeight: 1.5,
          }}
        >
          맵 전체의 노드 사이 거리를 조정합니다 (노드 크기는 유지). 모든
          레이아웃과 서브트리 오버라이드에 함께 적용됩니다.
        </div>
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

// 간격 슬라이더 — 70%~200%, 기본 100%. 값은 레이아웃 배율(0.7~2.0)로 저장.
function SpacingSlider({
  t, label, value, onChange,
}: {
  t: ThemeTokens;
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  const pct = Math.round(value * 100);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
      <span style={{ fontSize: 11, color: t.text, width: 54, flexShrink: 0 }}>{label}</span>
      <input
        type="range"
        min={90}
        max={200}
        step={5}
        value={pct}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        style={{ flex: 1, accentColor: t.primary, cursor: 'pointer' }}
      />
      <span
        style={{
          fontSize: 10.5, fontVariantNumeric: 'tabular-nums',
          color: pct === 100 ? t.textMuted : t.primary,
          fontWeight: pct === 100 ? 500 : 700,
          width: 36, textAlign: 'right', flexShrink: 0,
        }}
      >
        {pct}%
      </span>
    </div>
  );
}
