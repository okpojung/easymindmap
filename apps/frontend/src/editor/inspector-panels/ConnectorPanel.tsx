// ConnectorPanel — 고른 **연결선**의 속성 (2026-09-22 사용자 요청). 스타일 탭이
// 노드 대신 이 패널을 보인다 (`selectedConnectorId` 가 있을 때).
//   · 모양: 각진 선 / 모서리 둥근 선
//   · 선 두께 · 선 종류(실선·파선·점선) · 화살표(없음·끝·시작·양쪽) · 선 색
//   · 라벨: 글(여러 줄) · 자리(가운데·위·아래·곁가지) · 도형(없음·둥근·사각·캡슐·원)
//   · 삭제
// 값은 `updateConnector` 한 번 = undo 한 단계. 규칙: 10-canvas.md §31.

import type { ThemeTokens } from '@/components/design-tokens/theme';
import type { Connector, ConnectorArrows, ConnectorDash, ConnectorLabelPlace, ConnectorLabelShape, ConnectorShape, ConnectorSide } from '@/editor/__samples__/types';
import { findNodeInMap, useDocumentStore } from '@/stores/documentStore';
import { useInteractionStore } from '@/stores/interactionStore';
import { CONNECTOR_DEFAULTS, CONNECTOR_WIDTH_MAX, connectorArrowsOf, connectorColorOf, connectorDashOf, connectorShapeOf, connectorWidthOf } from '@/editor/canvas/ConnectorLayer';
import { InspectorSection, InspectorRow, ColorSwatchInput } from './InspectorSection';
import { useTr, type TrVars } from '@/i18n';

// 아래 표의 label·hint 는 사전 키 — 렌더할 때 번역한다

const SHAPES: { key: ConnectorShape; label: string; icon: React.ReactNode }[] = [
  { key: 'elbow', label: 'inspector.conn.shape.elbow', icon: (
    <svg width="34" height="18" viewBox="0 0 34 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 4 H17 V14 H32" />
    </svg>
  ) },
  { key: 'rounded', label: 'inspector.conn.shape.rounded', icon: (
    <svg width="34" height="18" viewBox="0 0 34 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 4 H13 Q17 4 17 8 V10 Q17 14 21 14 H32" />
    </svg>
  ) },
];

const DASHES: { key: ConnectorDash; label: string; dash?: string }[] = [
  { key: 'solid', label: 'inspector.style.border.solid' },
  { key: 'dashed', label: 'inspector.style.border.dashed', dash: '6 4' },
  { key: 'dotted', label: 'inspector.style.border.dotted', dash: '1 4' },
];

const ARROWS: { key: ConnectorArrows; label: string }[] = [
  { key: 'none', label: 'inspector.style.shape.none' },
  { key: 'end', label: 'inspector.conn.arrow.end' },
  { key: 'start', label: 'inspector.conn.arrow.start' },
  { key: 'both', label: 'inspector.conn.arrow.both' },
];

// 닿는 면 (2026-09-23 사용자 요청: "시작 면과 끝 면을 설정할 수 있게") — auto 는 상대 노드 쪽
const SIDES: { key: ConnectorSide; label: string; hint: string }[] = [
  { key: 'auto', label: 'inspector.conn.side.auto', hint: 'inspector.conn.side.autoHint' },
  { key: 'top', label: 'inspector.conn.side.top', hint: 'inspector.conn.side.topHint' },
  { key: 'bottom', label: 'inspector.conn.side.bottom', hint: 'inspector.conn.side.bottomHint' },
  { key: 'left', label: 'inspector.style.align.left', hint: 'inspector.conn.side.leftHint' },
  { key: 'right', label: 'inspector.style.align.right', hint: 'inspector.conn.side.rightHint' },
];

const PLACES: { key: ConnectorLabelPlace; label: string; hint: string }[] = [
  { key: 'center', label: 'inspector.conn.place.center', hint: 'inspector.conn.place.centerHint' },
  { key: 'above', label: 'inspector.conn.side.top', hint: 'inspector.conn.place.aboveHint' },
  { key: 'below', label: 'inspector.conn.side.bottom', hint: 'inspector.conn.place.belowHint' },
  { key: 'branch', label: 'inspector.conn.place.branch', hint: 'inspector.conn.place.branchHint' },
];

const LABEL_SHAPES: { key: ConnectorLabelShape; label: string; icon: React.ReactNode }[] = [
  { key: 'none', label: 'inspector.style.shape.none', icon: <span style={{ display: 'inline-block', width: 22, height: 14, border: '1.5px dashed currentColor', borderRadius: 3, opacity: 0.4 }} /> },
  { key: 'rounded', label: 'inspector.style.shape.rounded', icon: <span style={{ display: 'inline-block', width: 22, height: 14, border: '1.5px solid currentColor', borderRadius: 6 }} /> },
  { key: 'rectangle', label: 'inspector.style.shape.rectangle', icon: <span style={{ display: 'inline-block', width: 22, height: 14, border: '1.5px solid currentColor', borderRadius: 2 }} /> },
  { key: 'pill', label: 'inspector.style.shape.pill', icon: <span style={{ display: 'inline-block', width: 22, height: 14, border: '1.5px solid currentColor', borderRadius: 999 }} /> },
  { key: 'ellipse', label: 'inspector.style.shape.ellipse', icon: <span style={{ display: 'inline-block', width: 18, height: 14, border: '1.5px solid currentColor', borderRadius: '50%' }} /> },
];

export function ConnectorPanel({ t, connector }: { t: ThemeTokens; connector: Connector }) {
  const tr = useTr();
  const map = useDocumentStore((s) => s.map);
  const updateConnector = useDocumentStore((s) => s.updateConnector);
  const removeConnector = useDocumentStore((s) => s.removeConnector);
  const setSelectedConnectorId = useInteractionStore((s) => s.setSelectedConnectorId);

  const c = connector;
  const patch = (p: Partial<Omit<Connector, 'id'>>) => updateConnector(c.id, p);
  const patchLabel = (p: Partial<NonNullable<Connector['label']>>) => {
    const next = { text: c.label?.text ?? '', ...c.label, ...p };
    patch({ label: next });
  };
  const from = findNodeInMap(map, c.from);
  const to = findNodeInMap(map, c.to);
  const shape = connectorShapeOf(c);
  const width = connectorWidthOf(c);
  const dash = connectorDashOf(c);
  const arrows = connectorArrowsOf(c);
  const color = connectorColorOf(c);
  const labelText = c.label?.text ?? '';
  const fromSide = c.fromSide ?? 'auto';
  const toSide = c.toSide ?? 'auto';
  const place = c.label?.place ?? 'center';
  const labelShape = c.label?.shape ?? 'rounded';

  const chip = (active: boolean): React.CSSProperties => ({
    padding: '6px 0 5px', borderRadius: 6, fontSize: 11, cursor: 'pointer',
    background: active ? t.primarySoft : t.surfaceAlt,
    color: active ? t.primary : t.textMuted,
    border: `1px solid ${active ? t.primaryBorder : t.border}`,
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
    fontWeight: active ? 600 : 500,
  });

  return (
    <div data-testid="connector-panel">
      <div style={{
        margin: '10px 14px 0', padding: '7px 10px', borderRadius: 7,
        background: t.primarySoft, border: `1px solid ${t.primaryBorder}`,
        color: t.primary, fontSize: 11.5, fontWeight: 700, lineHeight: 1.5,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }} title={`${firstLine(from?.text, tr)} → ${firstLine(to?.text, tr)}`}>
        {tr('inspector.conn.header', { from: firstLine(from?.text, tr), to: firstLine(to?.text, tr) })}
      </div>

      <InspectorSection t={t} title={tr('inspector.conn.shapeTitle')}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 4 }}>
          {SHAPES.map((s) => (
            <button key={s.key} title={tr(s.label)} data-testid={`connector-shape-${s.key}`}
              onClick={() => patch({ shape: s.key })} style={chip(shape === s.key)}>
              {s.icon}
              <span style={{ fontSize: 9.5 }}>{tr(s.label)}</span>
            </button>
          ))}
        </div>
      </InspectorSection>

      <InspectorSection t={t} title={tr('inspector.conn.sidesTitle')}>
        <InspectorRow t={t} label={tr('inspector.conn.fromSide')}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 3 }}>
            {SIDES.map((s) => (
              <button key={s.key} title={tr(s.hint)} data-testid={`connector-from-side-${s.key}`} onClick={() => patch({ fromSide: s.key === 'auto' ? undefined : s.key })}
                style={{ ...chip(fromSide === s.key), padding: '6px 0', fontSize: 10.5 }}>
                {tr(s.label)}
              </button>
            ))}
          </div>
        </InspectorRow>
        <InspectorRow t={t} label={tr('inspector.conn.toSide')}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 3 }}>
            {SIDES.map((s) => (
              <button key={s.key} title={tr(s.hint)} data-testid={`connector-to-side-${s.key}`} onClick={() => patch({ toSide: s.key === 'auto' ? undefined : s.key })}
                style={{ ...chip(toSide === s.key), padding: '6px 0', fontSize: 10.5 }}>
                {tr(s.label)}
              </button>
            ))}
          </div>
        </InspectorRow>
        <div style={{ fontSize: 10.5, color: t.textMuted, lineHeight: 1.5, marginBottom: 8 }}>
          {tr('inspector.conn.sidesHelp')}
        </div>
        <InspectorRow t={t} label={tr('inspector.conn.offset')}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: t.textMuted, flexWrap: 'wrap' }}>
            <span data-testid="connector-offset" style={{ fontVariantNumeric: 'tabular-nums', minWidth: 44, color: t.text }}>
              {c.offset ? `${c.offset > 0 ? '+' : ''}${c.offset}px` : tr('inspector.conn.offsetDefault')}
            </span>
            {!!c.offset && (
              <button data-testid="connector-offset-reset" onClick={() => patch({ offset: undefined })}
                style={{ fontSize: 10.5, padding: '3px 8px', borderRadius: 5, border: `1px solid ${t.border}`, background: t.surfaceAlt, color: t.textMuted, cursor: 'pointer' }}>
                {tr('inspector.conn.offsetReset')}
              </button>
            )}
            <span style={{ fontSize: 10.5 }}>{tr('inspector.conn.offsetHelp')}</span>
          </div>
        </InspectorRow>
      </InspectorSection>

      <InspectorSection t={t} title={tr('inspector.conn.lineTitle')}>
        <InspectorRow t={t} label={tr('inspector.conn.width')}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="range" min={0.5} max={CONNECTOR_WIDTH_MAX} step={0.5} value={width}
              data-testid="connector-width"
              onChange={(e) => patch({ width: Number(e.target.value) })}
              style={{ flex: 1, accentColor: t.primary }}
            />
            <span style={{ fontSize: 11, color: t.textMuted, width: 34, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{width}px</span>
          </div>
        </InspectorRow>
        <InspectorRow t={t} label={tr('inspector.conn.dash')}>
          <div style={{ display: 'flex', gap: 4 }}>
            {DASHES.map((d) => (
              <button key={d.key} data-testid={`connector-dash-${d.key}`} onClick={() => patch({ dash: d.key })}
                style={{ ...chip(dash === d.key), flex: 1 }}>
                <svg width="30" height="8" viewBox="0 0 30 8"><line x1="1" y1="4" x2="29" y2="4" stroke="currentColor" strokeWidth="1.8" strokeDasharray={d.dash} strokeLinecap="round" /></svg>
                <span style={{ fontSize: 9.5 }}>{tr(d.label)}</span>
              </button>
            ))}
          </div>
        </InspectorRow>
        <InspectorRow t={t} label={tr('inspector.conn.arrows')}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
            {ARROWS.map((a) => (
              <button key={a.key} data-testid={`connector-arrows-${a.key}`} onClick={() => patch({ arrows: a.key })}
                style={{ ...chip(arrows === a.key), padding: '6px 0', whiteSpace: 'nowrap', fontSize: 10.5 }}>
                {tr(a.label)}
              </button>
            ))}
          </div>
        </InspectorRow>
        <InspectorRow t={t} label={tr('inspector.conn.color')}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <ColorSwatchInput t={t} value={color} onChange={(v) => patch({ color: v })} />
            {color.toUpperCase() !== CONNECTOR_DEFAULTS.color && (
              <button data-testid="connector-color-reset" onClick={() => patch({ color: undefined })}
                style={{ fontSize: 10.5, padding: '3px 8px', borderRadius: 5, border: `1px solid ${t.border}`, background: t.surfaceAlt, color: t.textMuted, cursor: 'pointer' }}>
                {tr('inspector.conn.colorDefault')}
              </button>
            )}
          </div>
        </InspectorRow>
      </InspectorSection>

      <InspectorSection t={t} title={tr('inspector.conn.labelTitle')}>
        <textarea
          data-testid="connector-label-text"
          value={labelText}
          placeholder={tr('inspector.conn.labelPlaceholder')}
          rows={2}
          onChange={(e) => patchLabel({ text: e.target.value })}
          style={{
            width: '100%', boxSizing: 'border-box', resize: 'vertical', minHeight: 44,
            padding: '6px 8px', borderRadius: 6, border: `1px solid ${t.border}`,
            background: t.surfaceAlt, color: t.text, fontSize: 12.5, fontFamily: 'inherit', outline: 'none',
            marginBottom: 8,
          }}
        />
        <InspectorRow t={t} label={tr('inspector.conn.place')}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
            {PLACES.map((p) => (
              <button key={p.key} title={tr(p.hint)} data-testid={`connector-place-${p.key}`} onClick={() => patchLabel({ place: p.key })}
                style={{ ...chip(place === p.key), padding: '6px 0', fontSize: 10.5 }}>
                {tr(p.label)}
              </button>
            ))}
          </div>
        </InspectorRow>
        <InspectorRow t={t} label={tr('inspector.conn.labelShape')}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4 }}>
            {LABEL_SHAPES.map((s) => (
              <button key={s.key} title={tr(s.label)} data-testid={`connector-label-shape-${s.key}`} onClick={() => patchLabel({ shape: s.key })}
                style={chip(labelShape === s.key)}>
                {s.icon}
                <span style={{ fontSize: 9.5 }}>{tr(s.label)}</span>
              </button>
            ))}
          </div>
        </InspectorRow>
      </InspectorSection>

      <InspectorSection t={t} title={tr('common.delete')}>
        <button
          data-testid="connector-delete"
          onClick={() => { removeConnector(c.id); setSelectedConnectorId(null); }}
          style={{
            width: '100%', height: 32, borderRadius: 7, cursor: 'pointer', fontSize: 12.5, fontWeight: 600,
            border: `1px solid ${t.danger}55`, background: `${t.danger}12`, color: t.danger,
          }}
        >
          {tr('inspector.conn.delete')}
        </button>
        <div style={{ fontSize: 11, color: t.textMuted, marginTop: 8, lineHeight: 1.5 }}>
          {tr('inspector.conn.deleteHelp')}
        </div>
      </InspectorSection>
    </div>
  );
}

function firstLine(text: string | undefined, tr: (key: string, vars?: TrVars) => string): string {
  const s = String(text ?? '').split('\n')[0].trim();
  return s || tr('inspector.conn.emptyNode');
}
