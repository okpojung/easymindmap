// File: src/editor/inspector-panels/LayoutTab.tsx
// Version: MVP-LayoutTab-Use-LayoutGlyph-v1.0.1
// Description:
// - Left inspector layout tab
// - Uses src/components/icons/LayoutGlyph.tsx for layout icons
// - Layout change is applied to the whole map in current MVP stage

import type { ThemeTokens } from '@/components/design-tokens/theme';
import type { LayoutType } from '@/types/mindmap';
import { I } from '@/components/icons';
import { LayoutGlyph, type LayoutGlyphType } from '@/components/icons/LayoutGlyph';
import { InspectorSection, InspectorRow, Toggle } from './InspectorSection';
import { useDocumentStore, useEditorUiStore, useInteractionStore } from '@/stores';

interface LayoutOption {
  key: LayoutType;
  label: string;
  glyph: LayoutGlyphType;
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
  },
  {
    key: 'freeform' as LayoutType,
    label: '자유 배치',
    glyph: 'freeform',
  },
];

function normalizeLayoutType(layoutType?: LayoutType): LayoutType {
  if (!layoutType) return 'radial-bidirectional' as LayoutType;

  if (layoutType === 'radial') return 'radial-right' as LayoutType;
  if (layoutType === 'both-radial') return 'radial-bidirectional' as LayoutType;
  if (layoutType === 'tree') return 'tree-right' as LayoutType;
  if (layoutType === 'hierarchy') return 'hierarchy-right' as LayoutType;
  if (layoutType === 'progress-tree') return 'process-tree-right' as LayoutType;
  if (layoutType === 'free') return 'freeform' as LayoutType;

  return layoutType;
}

export function LayoutTab({ t }: { t: ThemeTokens }) {
  const updateNodeLayoutType = useDocumentStore((s) => s.updateNodeLayoutType);

  const selectedId = useInteractionStore((s) => s.selectedId);

  const layoutType = useEditorUiStore((s) => s.layoutType);
  const setLayoutType = useEditorUiStore((s) => s.setLayoutType);

  const activeLayoutType = normalizeLayoutType(layoutType);

  const handleLayoutClick = (nextLayoutType: LayoutType) => {
    setLayoutType(nextLayoutType);
    updateNodeLayoutType('root', nextLayoutType);
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

            return (
              <button
                key={layout.key}
                onClick={() => handleLayoutClick(layout.key)}
                style={{
                  padding: '8px 8px 6px',
                  background: active ? t.primarySoft : t.surfaceAlt,
                  border: `1.5px solid ${active ? t.primary : t.border}`,
                  borderRadius: 7,
                  cursor: 'pointer',
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
          <Toggle t={t} on />
        </InspectorRow>

        <div
          style={{
            fontSize: 10.5,
            color: t.textSubtle,
            marginTop: 4,
            lineHeight: 1.5,
          }}
        >
          MVP 현재 단계에서는 전체 맵 레이아웃만 변경합니다. 선택 노드:{' '}
          {selectedId ?? '없음'}
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