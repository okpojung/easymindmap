// StyleTab — node style controls (NS-01/02/04).
// Per design feedback: removed the "node color palette" multiplexer (not in spec),
// removed per-node fontSize slider (font sizes are level-based map setting),
// and replaced typography sliders with markdown-only emphasis toggles + a
// reference level→font preview block. Spec: 10-canvas.md § 28.3, NS-04 / NS-01 / NS-02.

import type { ThemeTokens } from '@/components/design-tokens/theme';
import type { ShapeType, NodeStyle, TextAlign } from '@/editor/__samples__/types';
import { I } from '@/components/icons';
import { useDocumentStore, findNodeInMap } from '@/stores/documentStore';
import { useInteractionStore } from '@/stores/interactionStore';
import { InspectorSection, InspectorRow, ColorSwatchInput } from './InspectorSection';

const SHAPES: { key: ShapeType; label: string; shape: React.ReactNode }[] = [
  { key: 'rounded',       label: '둥근',  shape: <span style={{display:'inline-block', width:22, height:14, border:'1.5px solid currentColor', borderRadius:6}} /> },
  { key: 'rectangle',     label: '사각',  shape: <span style={{display:'inline-block', width:22, height:14, border:'1.5px solid currentColor', borderRadius:2}} /> },
  { key: 'pill',          label: '캡슐',  shape: <span style={{display:'inline-block', width:22, height:14, border:'1.5px solid currentColor', borderRadius:999}} /> },
  { key: 'ellipse',       label: '원',    shape: <span style={{display:'inline-block', width:18, height:14, border:'1.5px solid currentColor', borderRadius:'50%'}} /> },
  { key: 'hexagon',       label: '육각',  shape: <I.Hexagon size={15} /> },
  { key: 'diamond',       label: '다이아', shape: <I.Diamond size={13} /> },
  { key: 'parallelogram', label: '평행', shape: <span style={{display:'inline-block', width:22, height:14, border:'1.5px solid currentColor', transform:'skewX(-18deg)'}} /> },
  { key: 'arrow-left',  label: '화살◀', shape: (
    <svg width="24" height="14" viewBox="0 0 24 14"><polygon points="1,7 7,1 23,1 23,13 7,13" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
  ) },
  { key: 'arrow-right', label: '화살▶', shape: (
    <svg width="24" height="14" viewBox="0 0 24 14"><polygon points="23,7 17,13 1,13 1,1 17,1" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
  ) },
  { key: 'cylinder',    label: '원통', shape: (
    <svg width="20" height="16" viewBox="0 0 20 16"><path d="M1 4 V12 A9 3 0 0 0 19 12 V4" fill="none" stroke="currentColor" strokeWidth="1.5" /><ellipse cx="10" cy="4" rx="9" ry="3" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
  ) },
  { key: 'star',        label: '별', shape: (
    <svg width="18" height="17" viewBox="0 0 18 17"><polygon points="9,1 11.2,6.2 17,6.6 12.6,10.3 14,16 9,12.9 4,16 5.4,10.3 1,6.6 6.8,6.2" fill="none" stroke="currentColor" strokeWidth="1.3" /></svg>
  ) },
];

const DEFAULT_COLORS = { fillColor: '#FEF3C7', borderColor: '#F59E0B', textColor: '#78350F' };

const ALIGNS: { key: TextAlign; label: string }[] = [
  { key: 'left',   label: '왼쪽' },
  { key: 'center', label: '중앙' }, // 기본값
  { key: 'right',  label: '오른쪽' },
];

export function StyleTab({ t, selectedId }: { t: ThemeTokens; selectedId: string | null }) {
  const map = useDocumentStore((s) => s.map);
  const updateNodesStyle = useDocumentStore((s) => s.updateNodesStyle);
  const updateNodesTextAlign = useDocumentStore((s) => s.updateNodesTextAlign);
  // 러버밴드 다중 선택 — 2개 이상이면 모든 컨트롤이 선택된 노드 전체에
  // 일괄 적용된다 (한 번의 undo 단계). 표시 상태는 대표(첫) 노드 기준.
  const multiSelectedIds = useInteractionStore((s) => s.multiSelectedIds);
  const targets =
    multiSelectedIds.length > 1 ? multiSelectedIds : selectedId ? [selectedId] : [];

  const node = findNodeInMap(map, selectedId);
  const style: NodeStyle = node?.style ?? {};
  const shape: ShapeType = style.shapeType ?? 'rounded';
  const textAlign: TextAlign = node?.textAlign ?? 'center'; // 기본 = 중앙

  const disabled = targets.length === 0 || !node;
  const set = (patch: Partial<NodeStyle>) => {
    if (targets.length) updateNodesStyle(targets, patch);
  };

  return (
    <div style={disabled ? { opacity: 0.5, pointerEvents: 'none' } : undefined}>
      {targets.length > 1 && (
        <div style={{
          margin: '10px 14px 0', padding: '7px 10px', borderRadius: 7,
          background: t.primarySoft, border: `1px solid ${t.primaryBorder}`,
          color: t.primary, fontSize: 11.5, fontWeight: 700,
        }}>
          {targets.length}개 노드 선택 — 스타일이 일괄 적용됩니다
        </div>
      )}
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
          {(['solid', 'dashed', 'dotted', 'double'] as const).map((bs) => {
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
                {bs === 'solid' ? '실선' : bs === 'dashed' ? '파선' : bs === 'dotted' ? '점선' : '이중선'}
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
          <StyleToggle t={t} label="취소선" strike
            active={!!style.strike}
            onClick={() => set({ strike: !style.strike })} />
          <StyleToggle t={t} label="하이라이트" highlightSwatch
            active={!!style.highlight}
            onClick={() => set({ highlight: !style.highlight })} />
        </div>
      </InspectorSection>

      <InspectorSection t={t} title="텍스트 정렬">
        <div style={{ display: 'flex', gap: 4 }}>
          {ALIGNS.map((a) => {
            const active = textAlign === a.key;
            return (
              <button key={a.key}
                onClick={() => targets.length && updateNodesTextAlign(targets, a.key)}
                style={{
                  flex: 1, padding: '6px 0', borderRadius: 5, fontSize: 11,
                  background: active ? t.primarySoft : t.surfaceAlt,
                  color: active ? t.primary : t.textMuted,
                  border: `1px solid ${active ? t.primaryBorder : t.border}`,
                  cursor: 'pointer', fontWeight: active ? 600 : 500,
                }}>
                {a.label}{a.key === 'center' ? ' (기본)' : ''}
              </button>
            );
          })}
        </div>
      </InspectorSection>

      {/* 레벨별 폰트(맵 전체 설정)는 좌측 상단 '맵 설정' 메뉴로 이동 —
          MapSettingsPanel에서 크기·글꼴을 실제로 변경할 수 있다. */}
    </div>
  );
}

function StyleToggle({
  t, label, active, onClick, weight, italic, strike, highlightSwatch,
}: {
  t: ThemeTokens;
  label: string;
  active: boolean;
  onClick: () => void;
  weight?: number;
  italic?: boolean;
  strike?: boolean;
  highlightSwatch?: boolean;
}) {
  return (
    <button onClick={onClick} style={{
      flex: 1, padding: '6px 4px', borderRadius: 5,
      background: active ? t.primarySoft : t.surfaceAlt,
      color: active ? t.primary : t.text,
      border: `1px solid ${active ? t.primaryBorder : t.border}`,
      cursor: 'pointer',
      fontSize: 11,
      fontWeight: weight || 500,
      fontStyle: italic ? 'italic' : 'normal',
      textDecoration: strike ? 'line-through' : 'none',
      whiteSpace: 'nowrap',
    }}>
      {highlightSwatch
        ? <span style={{ background: '#FFE066', borderRadius: 2, padding: '0 3px', color: '#5B4A12' }}>{label}</span>
        : label}
    </button>
  );
}
