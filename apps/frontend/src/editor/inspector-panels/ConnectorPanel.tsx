// ConnectorPanel — 고른 **연결선**의 속성 (2026-09-22 사용자 요청). 스타일 탭이
// 노드 대신 이 패널을 보인다 (`selectedConnectorId` 가 있을 때).
//   · 모양: 각진 선 / 모서리 둥근 선
//   · 선 두께 · 선 종류(실선·파선·점선) · 화살표(없음·끝·시작·양쪽) · 선 색
//   · 라벨: 글(여러 줄) · 자리(가운데·위·아래·곁가지) · 도형(없음·둥근·사각·캡슐·원)
//   · 삭제
// 값은 `updateConnector` 한 번 = undo 한 단계. 규칙: 10-canvas.md §31.

import type { ThemeTokens } from '@/components/design-tokens/theme';
import type { Connector, ConnectorArrows, ConnectorDash, ConnectorLabelPlace, ConnectorLabelShape, ConnectorShape } from '@/editor/__samples__/types';
import { findNodeInMap, useDocumentStore } from '@/stores/documentStore';
import { useInteractionStore } from '@/stores/interactionStore';
import { CONNECTOR_DEFAULTS, CONNECTOR_WIDTH_MAX, connectorArrowsOf, connectorColorOf, connectorDashOf, connectorShapeOf, connectorWidthOf } from '@/editor/canvas/ConnectorLayer';
import { InspectorSection, InspectorRow, ColorSwatchInput } from './InspectorSection';

const SHAPES: { key: ConnectorShape; label: string; icon: React.ReactNode }[] = [
  { key: 'elbow', label: '각진 선', icon: (
    <svg width="34" height="18" viewBox="0 0 34 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 4 H17 V14 H32" />
    </svg>
  ) },
  { key: 'rounded', label: '모서리 둥근', icon: (
    <svg width="34" height="18" viewBox="0 0 34 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 4 H13 Q17 4 17 8 V10 Q17 14 21 14 H32" />
    </svg>
  ) },
];

const DASHES: { key: ConnectorDash; label: string; dash?: string }[] = [
  { key: 'solid', label: '실선' },
  { key: 'dashed', label: '파선', dash: '6 4' },
  { key: 'dotted', label: '점선', dash: '1 4' },
];

const ARROWS: { key: ConnectorArrows; label: string }[] = [
  { key: 'none', label: '없음' },
  { key: 'end', label: '끝 ▶' },
  { key: 'start', label: '◀ 시작' },
  { key: 'both', label: '◀ 양쪽 ▶' },
];

const PLACES: { key: ConnectorLabelPlace; label: string; hint: string }[] = [
  { key: 'center', label: '가운데', hint: '선 한가운데 위에 얹는다' },
  { key: 'above', label: '위', hint: '선 위(세로 변이면 왼쪽)' },
  { key: 'below', label: '아래', hint: '선 아래(세로 변이면 오른쪽)' },
  { key: 'branch', label: '곁가지', hint: '짧은 줄기로 매단 상자' },
];

const LABEL_SHAPES: { key: ConnectorLabelShape; label: string; icon: React.ReactNode }[] = [
  { key: 'none', label: '없음', icon: <span style={{ display: 'inline-block', width: 22, height: 14, border: '1.5px dashed currentColor', borderRadius: 3, opacity: 0.4 }} /> },
  { key: 'rounded', label: '둥근', icon: <span style={{ display: 'inline-block', width: 22, height: 14, border: '1.5px solid currentColor', borderRadius: 6 }} /> },
  { key: 'rectangle', label: '사각', icon: <span style={{ display: 'inline-block', width: 22, height: 14, border: '1.5px solid currentColor', borderRadius: 2 }} /> },
  { key: 'pill', label: '캡슐', icon: <span style={{ display: 'inline-block', width: 22, height: 14, border: '1.5px solid currentColor', borderRadius: 999 }} /> },
  { key: 'ellipse', label: '원', icon: <span style={{ display: 'inline-block', width: 18, height: 14, border: '1.5px solid currentColor', borderRadius: '50%' }} /> },
];

export function ConnectorPanel({ t, connector }: { t: ThemeTokens; connector: Connector }) {
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
      }} title={`${firstLine(from?.text)} → ${firstLine(to?.text)}`}>
        연결선 · {firstLine(from?.text)} → {firstLine(to?.text)}
      </div>

      <InspectorSection t={t} title="연결선 모양">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 4 }}>
          {SHAPES.map((s) => (
            <button key={s.key} title={s.label} data-testid={`connector-shape-${s.key}`}
              onClick={() => patch({ shape: s.key })} style={chip(shape === s.key)}>
              {s.icon}
              <span style={{ fontSize: 9.5 }}>{s.label}</span>
            </button>
          ))}
        </div>
      </InspectorSection>

      <InspectorSection t={t} title="선">
        <InspectorRow t={t} label="두께">
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
        <InspectorRow t={t} label="종류">
          <div style={{ display: 'flex', gap: 4 }}>
            {DASHES.map((d) => (
              <button key={d.key} data-testid={`connector-dash-${d.key}`} onClick={() => patch({ dash: d.key })}
                style={{ ...chip(dash === d.key), flex: 1 }}>
                <svg width="30" height="8" viewBox="0 0 30 8"><line x1="1" y1="4" x2="29" y2="4" stroke="currentColor" strokeWidth="1.8" strokeDasharray={d.dash} strokeLinecap="round" /></svg>
                <span style={{ fontSize: 9.5 }}>{d.label}</span>
              </button>
            ))}
          </div>
        </InspectorRow>
        <InspectorRow t={t} label="화살표">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
            {ARROWS.map((a) => (
              <button key={a.key} data-testid={`connector-arrows-${a.key}`} onClick={() => patch({ arrows: a.key })}
                style={{ ...chip(arrows === a.key), padding: '6px 0', whiteSpace: 'nowrap', fontSize: 10.5 }}>
                {a.label}
              </button>
            ))}
          </div>
        </InspectorRow>
        <InspectorRow t={t} label="선 색">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <ColorSwatchInput t={t} value={color} onChange={(v) => patch({ color: v })} />
            {color.toUpperCase() !== CONNECTOR_DEFAULTS.color && (
              <button data-testid="connector-color-reset" onClick={() => patch({ color: undefined })}
                style={{ fontSize: 10.5, padding: '3px 8px', borderRadius: 5, border: `1px solid ${t.border}`, background: t.surfaceAlt, color: t.textMuted, cursor: 'pointer' }}>
                기본(파랑)
              </button>
            )}
          </div>
        </InspectorRow>
      </InspectorSection>

      <InspectorSection t={t} title="라벨 (선 위 글)">
        <textarea
          data-testid="connector-label-text"
          value={labelText}
          placeholder="선에 붙일 글 (비우면 없음 · 여러 줄 가능)"
          rows={2}
          onChange={(e) => patchLabel({ text: e.target.value })}
          style={{
            width: '100%', boxSizing: 'border-box', resize: 'vertical', minHeight: 44,
            padding: '6px 8px', borderRadius: 6, border: `1px solid ${t.border}`,
            background: t.surfaceAlt, color: t.text, fontSize: 12.5, fontFamily: 'inherit', outline: 'none',
            marginBottom: 8,
          }}
        />
        <InspectorRow t={t} label="자리">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
            {PLACES.map((p) => (
              <button key={p.key} title={p.hint} data-testid={`connector-place-${p.key}`} onClick={() => patchLabel({ place: p.key })}
                style={{ ...chip(place === p.key), padding: '6px 0', fontSize: 10.5 }}>
                {p.label}
              </button>
            ))}
          </div>
        </InspectorRow>
        <InspectorRow t={t} label="도형">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4 }}>
            {LABEL_SHAPES.map((s) => (
              <button key={s.key} title={s.label} data-testid={`connector-label-shape-${s.key}`} onClick={() => patchLabel({ shape: s.key })}
                style={chip(labelShape === s.key)}>
                {s.icon}
                <span style={{ fontSize: 9.5 }}>{s.label}</span>
              </button>
            ))}
          </div>
        </InspectorRow>
      </InspectorSection>

      <InspectorSection t={t} title="삭제">
        <button
          data-testid="connector-delete"
          onClick={() => { removeConnector(c.id); setSelectedConnectorId(null); }}
          style={{
            width: '100%', height: 32, borderRadius: 7, cursor: 'pointer', fontSize: 12.5, fontWeight: 600,
            border: `1px solid ${t.danger}55`, background: `${t.danger}12`, color: t.danger,
          }}
        >
          이 연결선 삭제 (Del)
        </button>
        <div style={{ fontSize: 11, color: t.textMuted, marginTop: 8, lineHeight: 1.5 }}>
          끝 노드를 지우면 연결선도 함께 사라집니다. 끝 노드가 접혀 있으면 선은 잠시 감춰집니다.
        </div>
      </InspectorSection>
    </div>
  );
}

function firstLine(text: string | undefined): string {
  const s = String(text ?? '').split('\n')[0].trim();
  return s || '(빈 노드)';
}
