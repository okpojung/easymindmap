// File: src/editor/inspector-panels/LayoutTab.tsx
// Version: MVP-LayoutTab-RootOnlyRules-v3.0.0
// Description:
// - Left inspector layout tab.
// - Selection-scope rules (no "맵 전체" toggle — the ROOT node IS the whole
//   map):
//   · Root selected OR nothing selected → every layout is selectable and
//     applies to the whole map. (2026-07: 선택 없음도 맵 전체 스코프 —
//     큰 맵에서 중심 노드를 찾아가지 않아도 전체 레이아웃 변경 가능)
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
import { findNodeInMap, isCenterRootId } from '@/stores/documentStore';
import { mapCenters } from '@/editor/__samples__/types';
import { useTr } from '@/i18n';

// 손가락 기기의 입력칸 16px·누를 자리 40px (data-mm-touch) — 불러오기만 하면 CSS 가 들어간다
import '@/components/ui/mobileCss';
interface LayoutOption {
  key: LayoutType;
  /** 사전 키 — 렌더할 때 번역한다 */
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
    label: 'inspector.layout.opt.radialBoth',
    glyph: 'both-radial',
    rootOnly: true,
  },
  {
    key: 'radial-right' as LayoutType,
    label: 'inspector.layout.opt.radialRight',
    glyph: 'radial-right',
  },
  {
    key: 'tree-right' as LayoutType,
    label: 'inspector.layout.opt.treeRight',
    glyph: 'tree-right',
  },
  {
    key: 'tree-down' as LayoutType,
    label: 'inspector.layout.opt.treeDown',
    glyph: 'tree-down',
    rootOnly: true,
  },
  {
    key: 'hierarchy-right' as LayoutType,
    label: 'inspector.layout.opt.hierarchyRight',
    glyph: 'hierarchy-right',
  },
  {
    key: 'process-tree-right' as LayoutType,
    label: 'inspector.layout.opt.processTreeRight',
    glyph: 'process-tree-right',
  },
  {
    // 시간배치 — **하위 노드에도 걸 수 있다** (2026-08-07 요청으로 제한
    // 해제). 고른 노드가 축의 시작점이 되고 그 자식들이 오른쪽으로
    // 늘어선다 (SubtreeStrategy 'timeline' case).
    key: 'timeline' as LayoutType,
    label: 'inspector.layout.opt.timeline',
    glyph: 'timeline',
  },
  {
    // 시간배치(중앙노드) — 축이 노드들을 관통한다. 위와 같이 서브트리 가능.
    key: 'timeline-center' as LayoutType,
    label: 'inspector.layout.opt.timelineCenter',
    glyph: 'timeline-center',
  },
  {
    key: 'kanban' as LayoutType,
    label: 'inspector.layout.opt.kanban',
    glyph: 'kanban',
    rootOnly: true,
  },
  {
    key: 'freeform' as LayoutType,
    label: 'inspector.layout.opt.freeform',
    glyph: 'freeform',
    rootOnly: true,
    neverApplies: true,
  },
];

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

  // 중심주제마다 — 그 중심 루트의 레이아웃(없으면 맵 전역)에서 출발 (2026-09-15)
  for (const c of mapCenters(map)) {
    const found = walk(c.branches, c.root.layoutType ?? fallback);
    if (found) return found;
  }
  return fallback;
}

export function LayoutTab({ t }: { t: ThemeTokens }) {
  const tr = useTr();
  const map = useDocumentStore((s) => s.map);
  const updateNodeLayoutType = useDocumentStore((s) => s.updateNodeLayoutType);
  const updateNodesLayoutType = useDocumentStore((s) => s.updateNodesLayoutType);
  // 러버밴드 다중 선택 — 고른 노드 **전부**의 하위에 적용 (2026-09-21).
  // 스타일 탭과 같은 규칙. 'root'·중심주제 루트는 빼고 센다.
  const multiSelectedIds = useInteractionStore((s) => s.multiSelectedIds);

  const selectedId = useInteractionStore((s) => s.selectedId);

  const layoutType = useEditorUiStore((s) => s.layoutType);
  const setLayoutType = useEditorUiStore((s) => s.setLayoutType);
  const spacingX = useEditorUiStore((s) => s.spacingX);
  const spacingY = useEditorUiStore((s) => s.spacingY);
  const setSpacingX = useEditorUiStore((s) => s.setSpacingX);
  const setSpacingY = useEditorUiStore((s) => s.setSpacingY);
  const resetSpacing = useEditorUiStore((s) => s.resetSpacing);

  const mapIsKanban = normalizeLayoutType(layoutType) === ('kanban' as LayoutType);

  // 선택 없음(또는 사라진 id) = "맵 전체" 스코프 (2026-07 사용성 개선):
  // 큰 맵에서 중심 노드를 찾아 선택하지 않아도, 아무것도 선택하지 않은
  // 상태에서 레이아웃을 고르면 맵 전체 레이아웃이 바뀐다.
  // (메인 노드 선택 = 동일하게 맵 전체, 하위 노드 선택 = 그 서브트리)
  const hasSelection = !!selectedId && !!findNodeInMap(map, selectedId);

  // 둘째 이후의 **중심주제 루트** 선택 = 그 중심의 레이아웃 (2026-09-15).
  // 맵 전체(첫 중심·전역)가 아니라 그 중심의 루트 layoutType 만 바꾼다 —
  // 첫 중심의 오버라이드를 지우지 않는다 (PR #493 Codex 지적).
  const centerScope =
    hasSelection && !mapIsKanban && selectedId !== 'root' && isCenterRootId(map, selectedId);
  const centerRoot = centerScope
    ? mapCenters(map).find((c) => c.root.id === selectedId)?.root
    : undefined;

  // Kanban has no per-subtree layout, so while the board is active EVERY
  // selection acts as root scope: clicking a layout changes the whole map.
  const subtreeScope =
    hasSelection && !mapIsKanban && selectedId !== 'root' && !centerScope;
  const bulkTargets =
    subtreeScope && multiSelectedIds.length > 1
      ? multiSelectedIds.filter((id) => id !== 'root' && !isCenterRootId(map, id))
      : [];

  const activeLayoutType = normalizeLayoutType(
    centerScope
      ? (centerRoot?.layoutType ?? layoutType)
      : subtreeScope ? effectiveLayoutOf(map, selectedId!, layoutType) : layoutType,
  );

  const optionDisabled = (option: LayoutOption): boolean => {
    if (!subtreeScope) return false; // 맵 전체 스코프(선택 없음·메인): 전부 선택 가능
    return !!option.rootOnly; // subtree: root-only layouts are unavailable
  };

  const disabledReason = (option: LayoutOption): string | undefined => {
    if (subtreeScope && option.rootOnly)
      return tr('inspector.layout.rootOnly');
    return undefined;
  };

  const handleLayoutClick = (option: LayoutOption) => {
    if (optionDisabled(option)) return;

    // 자유배치: 메인 노드에서만 선택할 수 있지만 맵 레이아웃은 변경하지
    // 않는다 (순서도·플로차트 등 향후 용도 — 아래 안내 참조).
    if (option.neverApplies) return;

    if (!subtreeScope && !centerScope) {
      // 맵을 먼저 바꾼다 — 히스토리 스냅샷이 "이전 레이아웃"과 함께
      // 기록되어 Ctrl+Z 한 번으로 레이아웃까지 되돌아간다.
      updateNodeLayoutType('root', option.key);
      setLayoutType(option.key);
      return;
    }

    // 러버밴드로 여럿을 골랐으면 전부 (undo 한 단계)
    if (bulkTargets.length > 1) {
      updateNodesLayoutType(bulkTargets, option.key);
      return;
    }
    // 서브트리 또는 둘째 이후의 중심주제 — 그 노드/중심만
    updateNodeLayoutType(selectedId, option.key);
  };

  return (
    <div data-mm-touch="">
      <InspectorSection t={t} title={tr('inspector.layout.title')}>
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
                  {tr(layout.label)}
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
          {bulkTargets.length > 1
            ? tr('inspector.layout.scopeBulk', { n: bulkTargets.length })
            : subtreeScope
            ? tr('inspector.layout.scopeSubtree', { id: selectedId ?? '' })
            : mapIsKanban
              ? tr('inspector.layout.scopeKanban')
              : !hasSelection
                ? tr('inspector.layout.scopeNone')
                : tr('inspector.layout.scopeRoot')}
        </div>
      </InspectorSection>

      <InspectorSection t={t} title={tr('inspector.layout.opt.freeform')}>
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
            {tr('inspector.layout.freeformNote')}
          </div>
        </div>
      </InspectorSection>

      <InspectorSection
        t={t}
        title={tr('inspector.layout.spacingTitle')}
        action={
          (spacingX !== 1 || spacingY !== 1) ? (
            <button
              onClick={resetSpacing}
              title={tr('inspector.layout.spacingResetTitle')}
              style={{
                padding: '2px 7px', borderRadius: 4, fontSize: 10, fontWeight: 600,
                background: t.surfaceAlt, color: t.textMuted,
                border: `1px solid ${t.border}`, cursor: 'pointer',
              }}
            >
              {tr('common.reset')}
            </button>
          ) : undefined
        }
      >
        <SpacingSlider
          t={t}
          label={tr('inspector.layout.spacingX')}
          value={spacingX}
          onChange={setSpacingX}
        />
        <SpacingSlider
          t={t}
          label={tr('inspector.layout.spacingY')}
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
          {tr('inspector.layout.spacingHelp')}
        </div>
      </InspectorSection>

      <InspectorSection t={t} title={tr('inspector.layout.lineStyleTitle')}>
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
            {tr('inspector.layout.lineStyleNote')}
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
