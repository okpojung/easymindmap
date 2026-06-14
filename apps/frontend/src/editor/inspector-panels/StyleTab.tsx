// StyleTab — node style controls (NS-01/02/04).
// Per design feedback: removed the "node color palette" multiplexer (not in spec),
// removed per-node fontSize slider (font sizes are level-based map setting),
// and replaced typography sliders with markdown-only emphasis toggles + a
// reference level→font preview block. Spec: 10-canvas.md § 28.3, NS-04 / NS-01 / NS-02.

import type { ThemeTokens } from '@/components/design-tokens/theme';
import type { ShapeType, NodeStyle } from '@/editor/__samples__/types';
import { I } from '@/components/icons';
import { useDocumentStore, findNodeInMap } from '@/stores/documentStore';
import { InspectorSection, InspectorRow, ColorSwatchInput } from './InspectorSection';

const SHAPES: { key: ShapeType; label: string; shape: React.ReactNode }[] = [
  { key: 'rounded',       label: '둥근',  shape: <span style={{display:'inline-block', width:22, height:14, border:'1.5px solid currentColor', borderRadius:6}} /> },
  { key: 'rectangle',     label: '사각',  shape: <span style={{display:'inline-block', width:22, height:14, border:'1.5px solid currentColor', borderRadius:2}} /> },
  { key: 'pill',          label: '캡슐',  shape: <span style={{display:'inline-block', width:22, height:14, border:'1.5px solid currentColor', borderRadius:999}} /> },
  { key: 'ellipse',       label: '원',    shape: <span style={{display:'inline-block', width:18, height:14, border:'1.5px solid currentColor', borderRadius:'50%'}} /> },
  { key: 'hexagon',       label: '육각',  shape: <I.Hexagon size={15} /> },
  { key: 'diamond',       label: '다이아', shape: <I.Diamond size={13} /> },
  { key: 'parallelogram', label: '평행', shape: <span style={{display:'inline-block', width:22, height:14, border:'1.5px solid currentColor', transform:'skewX(-18deg)'}} /> },
];

const DEFAULT_COLORS = { fillColor: '#FEF3C7', borderColor: '#F59E0B', textColor: '#78350F' };

const LEVEL_FONTS = [
  { l: 'Root',     px: 18, w: 700 },
  { l: 'Level 1',  px: 16, w: 600 },
  { l: 'Level 2',  px: 15, w: 500 },
  { l: 'Level 3',  px: 14, w: 500 },
  { l: 'Level 4+', px: 13, w: 500 },
];

export function StyleTab({ t, selectedId }: { t: ThemeTokens; selectedId: string | null }) {
  const map = useDocumentStore((s) => s.map);
  const updateNodeStyle = useDocumentStore((s) => s.updateNodeStyle);

  const node = findNodeInMap(map, selectedId);
  const style: NodeStyle = node?.style ?? {};
  const shape: ShapeType = style.shapeType ?? 'rounded';

  const disabled = !selectedId || !node;
  const set = (patch: Partial<NodeStyle>) => {
    if (selectedId) updateNodeStyle(selectedId, patch);
  };

  return (
    <div style={disabled ? { opacity: 0.5, pointerEvents: 'none' } : undefined}>
      <InspectorSection t={t} title="도형 (NS-04)">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
          {SHAPES.map(s => {
            const active = shape === s.key;
            return (
              <button key={s.key} title={s.label}
                onClick={() => set({ shapeType: s.key })}
                style={{
                  padding: '7px 0 5px', borderRadius: 6,
                  background: active ? t.primarySoft : t.surfaceAlt,
                  color:      active ? t.primary     : t.textMuted,
                  border: `1px solid ${active ? t.primaryBorder : t.border}`,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                  cursor: 'pointer',
                }}>
                {s.shape}
                <span style={{ fontSize: 9.5, fontWeight: active ? 600 : 500 }}>{s.label}</span>
              </button>
            );
          })}
        </div>
      </InspectorSection>

      <InspectorSection t={t} title="채움 · 테두리 · 글자색">
        <InspectorRow t={t} label="채움색">
          <ColorSwatchInput t={t} value={style.fillColor ?? DEFAULT_COLORS.fillColor}
            onChange={(v) => set({ fillColor: v })} />
        </InspectorRow>
        <InspectorRow t={t} label="테두리">
          <ColorSwatchInput t={t} value={style.borderColor ?? DEFAULT_COLORS.borderColor}
            onChange={(v) => set({ borderColor: v })} />
        </InspectorRow>
        <InspectorRow t={t} label="글자색">
          <ColorSwatchInput t={t} value={style.textColor ?? DEFAULT_COLORS.textColor}
            onChange={(v) => set({ textColor: v })} />
        </InspectorRow>
      </InspectorSection>

      <InspectorSection t={t} title="테두리 스타일">
        <div style={{ display: 'flex', gap: 4 }}>
          {(['solid', 'dashed', 'dotted'] as const).map((bs) => {
            const active = (style.borderStyle ?? 'solid') === bs;
            return (
              <button key={bs} onClick={() => set({ borderStyle: bs })}
                style={{
                  flex: 1, padding: '6px 0', borderRadius: 5, fontSize: 11,
                  background: active ? t.primarySoft : t.surfaceAlt,
                  color: active ? t.primary : t.textMuted,
                  border: `1px solid ${active ? t.primaryBorder : t.border}`,
                  cursor: 'pointer',
                }}>
                {bs === 'solid' ? '실선' : bs === 'dashed' ? '파선' : '점선'}
              </button>
            );
          })}
        </div>
      </InspectorSection>

      <InspectorSection t={t} title="텍스트 강조">
        <div style={{ display: 'flex', gap: 4 }}>
          <StyleToggle t={t} label="굵게" weight={700}
            active={style.fontWeight === 'bold'}
            onClick={() => set({ fontWeight: style.fontWeight === 'bold' ? 'normal' : 'bold' })} />
          <StyleToggle t={t} label="기울임" italic
            active={style.fontStyle === 'italic'}
            onClick={() => set({ fontStyle: style.fontStyle === 'italic' ? 'normal' : 'italic' })} />
        </div>
      </InspectorSection>

      <InspectorSection t={t} title="레벨별 폰트 (맵 전체 설정)">
        <div style={{ fontSize: 10.5, color: t.textSubtle, marginBottom: 8, lineHeight: 1.5 }}>
          노드 깊이별 기본 폰트. 모든 노드에 일괄 적용. 변경은 <b>맵 설정</b>에서.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {LEVEL_FONTS.map(r => (
            <div key={r.l} style={{
              display: 'flex', alignItems: 'baseline', gap: 8,
              padding: '4px 8px', borderRadius: 4,
              background: t.surfaceAlt, border: `1px solid ${t.border}`,
            }}>
              <span style={{ fontSize: 10.5, color: t.textMuted, width: 56, fontWeight: 500 }}>{r.l}</span>
              <span style={{ fontSize: r.px, fontWeight: r.w, color: t.text, flex: 1, lineHeight: 1.2 }}>가나다 Aa</span>
              <span style={{ fontSize: 10, color: t.textSubtle, fontFamily: 'ui-monospace, monospace' }}>{r.px}pt</span>
            </div>
          ))}
        </div>
      </InspectorSection>
    </div>
  );
}

function StyleToggle({
  t, label, active, onClick, weight, italic,
}: {
  t: ThemeTokens;
  label: string;
  active: boolean;
  onClick: () => void;
  weight?: number;
  italic?: boolean;
}) {
  return (
    <button onClick={onClick} style={{
      flex: 1, padding: '6px 4px', borderRadius: 5,
      background: active ? t.primarySoft : t.surfaceAlt,
      color: active ? t.primary : t.text,
      border: `1px solid ${active ? t.primaryBorder : t.border}`,
      cursor: 'pointer',
      fontSize: 12,
      fontWeight: weight || 500,
      fontStyle: italic ? 'italic' : 'normal',
    }}>{label}</button>
  );
}
