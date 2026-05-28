// StyleTab — node style controls (NS-01/02/04).
// Per design feedback: removed the "node color palette" multiplexer (not in spec),
// removed per-node fontSize slider (font sizes are level-based map setting),
// and replaced typography sliders with markdown-only emphasis toggles + a
// reference level→font preview block. Spec: 10-canvas.md § 28.3, NS-04 / NS-01 / NS-02.

import type { ThemeTokens } from '@/components/design-tokens/theme';
import { I } from '@/components/icons';
import { InspectorSection, InspectorRow, ColorSwatchInput } from './InspectorSection';

const SHAPES = [
  { key: 'rounded', label: '둥근',  shape: <span style={{display:'inline-block', width:22, height:14, border:'1.5px solid currentColor', borderRadius:6}} />, active: true },
  { key: 'square',  label: '사각',  shape: <span style={{display:'inline-block', width:22, height:14, border:'1.5px solid currentColor', borderRadius:2}} /> },
  { key: 'pill',    label: '캡슐',  shape: <span style={{display:'inline-block', width:22, height:14, border:'1.5px solid currentColor', borderRadius:999}} /> },
  { key: 'circle',  label: '원',    shape: <span style={{display:'inline-block', width:14, height:14, border:'1.5px solid currentColor', borderRadius:'50%'}} /> },
  { key: 'hex',     label: '육각',  shape: <I.Hexagon size={15} /> },
  { key: 'diamond', label: '다이아', shape: <I.Diamond size={13} /> },
  { key: 'cloud',   label: '구름',  shape: <CloudGlyph /> },
];

const LEVEL_FONTS = [
  { l: 'Root',     px: 18, w: 700 },
  { l: 'Level 1',  px: 16, w: 600 },
  { l: 'Level 2',  px: 15, w: 500 },
  { l: 'Level 3',  px: 14, w: 500 },
  { l: 'Level 4+', px: 13, w: 500 },
];

export function StyleTab({ t }: { t: ThemeTokens }) {
  return (
    <div>
      <InspectorSection t={t} title="도형 (NS-04)">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
          {SHAPES.map(s => (
            <button key={s.key} title={s.label} style={{
              padding: '7px 0 5px', borderRadius: 6,
              background: s.active ? t.primarySoft : t.surfaceAlt,
              color:      s.active ? t.primary     : t.textMuted,
              border: `1px solid ${s.active ? t.primaryBorder : t.border}`,
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
              cursor: 'pointer',
            }}>
              {s.shape}
              <span style={{ fontSize: 9.5, fontWeight: s.active ? 600 : 500 }}>{s.label}</span>
            </button>
          ))}
        </div>
      </InspectorSection>

      <InspectorSection t={t} title="채움 · 테두리 · 글자색">
        <InspectorRow t={t} label="채움색"><ColorSwatchInput t={t} value="#FEF3C7" /></InspectorRow>
        <InspectorRow t={t} label="테두리"><ColorSwatchInput t={t} value="#F59E0B" /></InspectorRow>
        <InspectorRow t={t} label="글자색"><ColorSwatchInput t={t} value="#78350F" /></InspectorRow>
        <div style={{ fontSize: 10.5, color: t.textSubtle, marginTop: 2, lineHeight: 1.5 }}>
          MVP에서는 NS-01·02·04만 노드별 지정. 나머지는 맵 기본값 따름.
        </div>
      </InspectorSection>

      <InspectorSection t={t} title="텍스트 강조">
        <div style={{ fontSize: 10.5, color: t.textSubtle, marginBottom: 8, lineHeight: 1.5 }}>
          폰트 크기는 노드 레벨에 따라 자동 결정됩니다. 강조는 markdown 문법으로 입력하세요.
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <MarkdownToggle t={t} sample="**굵게**"  rendered="굵게"   weight={700} />
          <MarkdownToggle t={t} sample="*기울임*"  rendered="기울임" italic />
          <MarkdownToggle t={t} sample="`코드`"    rendered="코드"   code />
          <MarkdownToggle t={t} sample="~~취소~~"  rendered="취소"   strike />
        </div>
        <a href="#md-policy" style={{
          display: 'inline-block', marginTop: 8,
          fontSize: 10.5, color: t.accent, textDecoration: 'none', fontWeight: 500,
        }}>마크다운 문법 가이드 →</a>
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

function CloudGlyph() {
  return (
    <svg width="22" height="14" viewBox="0 0 22 14" fill="none">
      <path d="M5 11 C 2 11, 2 7, 5 7 C 5 4, 9 4, 10 6 C 11 3, 16 3, 16 7 C 19 7, 19 11, 16 11 Z"
            stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinejoin="round" />
    </svg>
  );
}

interface MdProps {
  t: ThemeTokens;
  sample: string;
  rendered: string;
  weight?: number;
  italic?: boolean;
  code?: boolean;
  strike?: boolean;
}

function MarkdownToggle({ t, sample, rendered, weight, italic, code, strike }: MdProps) {
  return (
    <button style={{
      flex: 1, padding: '6px 4px', borderRadius: 5,
      background: t.surfaceAlt, border: `1px solid ${t.border}`,
      cursor: 'pointer',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
    }}>
      <span style={{
        fontSize: 12,
        fontWeight: weight || 500,
        fontStyle: italic ? 'italic' : 'normal',
        textDecoration: strike ? 'line-through' : 'none',
        fontFamily: code ? 'ui-monospace, monospace' : 'inherit',
        color: code ? t.accent : t.text,
        background: code ? t.surfaceSunken : 'transparent',
        padding: code ? '0 4px' : 0,
        borderRadius: 3,
      }}>{rendered}</span>
      <span style={{ fontSize: 9, color: t.textSubtle, fontFamily: 'ui-monospace, monospace' }}>{sample}</span>
    </button>
  );
}
