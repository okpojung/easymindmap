// LayoutTab — subtree layout picker.
// Per design feedback: "간격/방향" controls moved out (they are MAP-level settings),
// "연결선" was demoted to a V1+ informational card (not user-editable in MVP).

import type { ThemeTokens } from '@/components/design-tokens/theme';
import { I } from '@/components/icons';
import { InspectorSection, InspectorRow, Toggle } from './InspectorSection';

const LAYOUTS = [
  { key: 'radial-bidirectional', label: '방사형 · 양쪽',  glyph: 'radial',    active: true  },
  { key: 'radial-right',         label: '방사형 · 오른쪽', glyph: 'radial',    active: false },
  { key: 'tree-right',           label: '트리 · 오른쪽',   glyph: 'tree',      active: false },
  { key: 'tree-down',            label: '트리 · 아래',     glyph: 'tree-down', active: false },
  { key: 'hierarchy-right',      label: '계층형 · 오른쪽', glyph: 'hier',      active: false },
  { key: 'process-tree-right',   label: '진행트리 · 오른쪽', glyph: 'process',  active: false },
  { key: 'kanban',               label: 'Kanban 보드',    glyph: 'kanban',    active: false },
  { key: 'freeform',             label: '자유 배치',       glyph: 'free',      active: false },
] as const;

export function LayoutTab({ t }: { t: ThemeTokens }) {
  return (
    <div>
      <InspectorSection t={t} title="서브트리 레이아웃">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          {LAYOUTS.map(l => (
            <button key={l.key} style={{
              padding: '8px 8px 6px',
              background: l.active ? t.primarySoft : t.surfaceAlt,
              border: `1.5px solid ${l.active ? t.primary : t.border}`,
              borderRadius: 7, cursor: 'pointer',
              display: 'flex', flexDirection: 'column', gap: 5,
              alignItems: 'flex-start', textAlign: 'left',
            }}>
              <MiniLayoutGlyph type={l.glyph} t={t} active={l.active} />
              <span style={{ fontSize: 11, fontWeight: l.active ? 600 : 500, color: l.active ? t.primary : t.text }}>
                {l.label}
              </span>
            </button>
          ))}
        </div>
      </InspectorSection>

      <InspectorSection t={t} title="서브트리 적용">
        <InspectorRow t={t} label="이 노드부터"><Toggle t={t} on={false} /></InspectorRow>
        <div style={{ fontSize: 10.5, color: t.textSubtle, marginTop: 4, lineHeight: 1.5 }}>
          켜면 선택 노드 이하의 서브트리만 별도 레이아웃으로 표시합니다 (LT-02).
        </div>
      </InspectorSection>

      <InspectorSection t={t} title="간격 · 정렬 (맵 전체 설정)">
        <div style={{ fontSize: 10.5, color: t.textSubtle, marginBottom: 8, lineHeight: 1.5 }}>
          노드 간격 / 레벨 간격은 맵 전체 단위로 적용됩니다. 변경은 <b>맵 설정 → 레이아웃</b>에서.
        </div>
        <button style={{
          width: '100%', padding: '7px 10px', borderRadius: 6,
          background: t.surfaceAlt, border: `1px solid ${t.border}`,
          color: t.text, cursor: 'pointer', fontSize: 12, fontWeight: 500,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        }}>
          <I.Settings size={13} /> 맵 설정 열기
        </button>
      </InspectorSection>

      <InspectorSection t={t} title="연결선 스타일">
        <div style={{
          padding: '10px 12px', borderRadius: 7,
          background: t.surfaceAlt, border: `1px dashed ${t.border}`,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span style={{
            fontSize: 9.5, fontWeight: 700,
            padding: '2px 6px', borderRadius: 3,
            background: t.accent + '22', color: t.accent,
            letterSpacing: 0.4, flexShrink: 0,
          }}>V1+</span>
          <div style={{ fontSize: 11, color: t.textMuted, lineHeight: 1.5 }}>
            연결선 스타일·두께·색상 사용자 지정은 향후 단계에서 제공됩니다. MVP에서는 레이아웃 종류에 따라 자동 결정됩니다.
          </div>
        </div>
      </InspectorSection>
    </div>
  );
}

interface GlyphProps {
  type: 'radial' | 'tree' | 'tree-down' | 'hier' | 'process' | 'kanban' | 'free';
  t: ThemeTokens;
  active: boolean;
}

function MiniLayoutGlyph({ type, t, active }: GlyphProps) {
  const color = active ? t.primary : t.textMuted;
  const W = 40, H = 22;
  const common = { stroke: color, strokeWidth: 1.2, fill: 'none', strokeLinecap: 'round' as const };

  if (type === 'radial') return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      <circle cx={W/2} cy={H/2} r="3" fill={color} />
      <circle cx="5"  cy="5"  r="2" fill={color} opacity="0.5"/>
      <circle cx="5"  cy="17" r="2" fill={color} opacity="0.5"/>
      <circle cx="35" cy="5"  r="2" fill={color} opacity="0.5"/>
      <circle cx="35" cy="17" r="2" fill={color} opacity="0.5"/>
      <path d="M18 11 C14 11, 10 6, 7 6 M18 11 C14 11, 10 16, 7 16 M22 11 C26 11, 30 6, 33 6 M22 11 C26 11, 30 16, 33 16" {...common}/>
    </svg>
  );
  if (type === 'tree') return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      <rect x="2"  y="9"  width="7"  height="4" rx="1" fill={color} opacity="0.8"/>
      <rect x="27" y="2"  width="10" height="3" rx="1" fill={color} opacity="0.5"/>
      <rect x="27" y="9"  width="10" height="3" rx="1" fill={color} opacity="0.5"/>
      <rect x="27" y="16" width="10" height="3" rx="1" fill={color} opacity="0.5"/>
      <path d="M9 11 H18 V3.5 H27 M18 11 H27 M18 11 V17.5 H27" {...common}/>
    </svg>
  );
  if (type === 'tree-down') return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      <rect x="16" y="2"  width="8" height="4" rx="1" fill={color} opacity="0.8"/>
      <rect x="4"  y="15" width="8" height="4" rx="1" fill={color} opacity="0.5"/>
      <rect x="16" y="15" width="8" height="4" rx="1" fill={color} opacity="0.5"/>
      <rect x="28" y="15" width="8" height="4" rx="1" fill={color} opacity="0.5"/>
      <path d="M20 6 V10 H8 V15 M20 10 V15 M20 10 H32 V15" {...common}/>
    </svg>
  );
  if (type === 'hier') return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      <rect x="14" y="2"  width="12" height="5" rx="1" fill={color} opacity="0.8"/>
      <rect x="2"  y="15" width="9"  height="4" rx="1" fill={color} opacity="0.5"/>
      <rect x="15" y="15" width="10" height="4" rx="1" fill={color} opacity="0.5"/>
      <rect x="29" y="15" width="9"  height="4" rx="1" fill={color} opacity="0.5"/>
      <path d="M20 7 V11 H6 V15 M20 11 V15 M20 11 H33 V15" {...common}/>
    </svg>
  );
  if (type === 'process') return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      <rect x="2"  y="4" width="8" height="4" rx="1" fill={color}/>
      <rect x="14" y="4" width="8" height="4" rx="1" fill={color} opacity="0.6"/>
      <rect x="26" y="4" width="8" height="4" rx="1" fill={color} opacity="0.6"/>
      <path d="M10 6 H14 M22 6 H26" {...common}/>
      <path d="M12 6 L14 5 L14 7 Z M24 6 L26 5 L26 7 Z" fill={color}/>
      <rect x="14" y="14" width="8" height="4" rx="1" fill={color} opacity="0.4"/>
      <rect x="26" y="14" width="8" height="4" rx="1" fill={color} opacity="0.4"/>
    </svg>
  );
  if (type === 'kanban') return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      <rect x="2"  y="3" width="10" height="16" rx="1.5" stroke={color} strokeWidth="1" fill="none" opacity="0.6"/>
      <rect x="15" y="3" width="10" height="16" rx="1.5" stroke={color} strokeWidth="1" fill="none" opacity="0.6"/>
      <rect x="28" y="3" width="10" height="16" rx="1.5" stroke={color} strokeWidth="1" fill="none" opacity="0.6"/>
      <rect x="4"  y="5" width="6" height="2.5" fill={color}/>
      <rect x="4"  y="9" width="6" height="2.5" fill={color} opacity="0.6"/>
      <rect x="17" y="5" width="6" height="2.5" fill={color}/>
      <rect x="30" y="5" width="6" height="2.5" fill={color} opacity="0.6"/>
    </svg>
  );
  // free
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      <rect x="4"  y="3"  width="8" height="4" rx="1" fill={color} opacity="0.6"/>
      <rect x="18" y="13" width="8" height="4" rx="1" fill={color} opacity="0.6"/>
      <rect x="28" y="5"  width="8" height="4" rx="1" fill={color} opacity="0.6"/>
      <rect x="2"  y="15" width="8" height="4" rx="1" fill={color} opacity="0.6"/>
    </svg>
  );
}
