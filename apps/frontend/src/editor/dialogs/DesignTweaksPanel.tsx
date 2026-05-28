// DesignTweaksPanel — DESIGN-REVIEW-ONLY panel for switching between visual variants
// (theme / layout / inspector tab / sample topic) without rebuilding the page.
// This is NOT a production feature — it is removed from the final build.
//
// Spec: docs/03-editor-core/canvas/10-canvas.md § 29

import type { ReactNode } from 'react';
import type { ThemeName, ThemeTokens } from '@/components/design-tokens/theme';
import type { LayoutType } from '@/editor/__samples__/types';
import type { InspectorTabKey } from '@/components/unified-sidebar/UnifiedSidebar';
import { I } from '@/components/icons';

interface Props {
  t: ThemeTokens;
  themeName: ThemeName;
  setThemeName: (v: ThemeName) => void;
  layoutType: LayoutType;
  setLayoutType: (v: LayoutType) => void;
  inspectorTab: InspectorTabKey;
  setInspectorTab: (v: InspectorTabKey) => void;
  sampleTopic: 'roadmap' | 'meta';
  setSampleTopic: (v: 'roadmap' | 'meta') => void;
  onClose: () => void;
}

export function DesignTweaksPanel(props: Props) {
  const { t, themeName, setThemeName, layoutType, setLayoutType,
          inspectorTab, setInspectorTab, sampleTopic, setSampleTopic, onClose } = props;

  return (
    <div style={{
      position: 'fixed', bottom: 48, right: 20,
      width: 300,
      background: t.surface,
      border: `1px solid ${t.border}`,
      borderRadius: 12,
      boxShadow: t.shadowLg,
      zIndex: 100,
      overflow: 'hidden',
    }}>
      <div style={{
        padding: '12px 14px',
        borderBottom: `1px solid ${t.divider}`,
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <I.Settings size={15} style={{ color: t.primary }} />
        <div style={{ fontSize: 13, fontWeight: 700, color: t.text }}>Tweaks</div>
        <div style={{
          marginLeft: 6, fontSize: 9.5, fontWeight: 700,
          padding: '2px 6px', borderRadius: 3,
          background: t.warning + '22', color: t.warning,
          letterSpacing: 0.4,
        }}>시안 전용</div>
        <div style={{ marginLeft: 'auto', fontSize: 11, color: t.textSubtle }}>실시간 미리보기</div>
        <button onClick={onClose} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: t.textMuted, padding: 2, display: 'flex',
        }}>
          <I.X size={14} />
        </button>
      </div>

      <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <TweakGroup t={t} label="테마">
          <SegButton t={t} options={[
            { v: 'light', l: '라이트 (크림)' },
            { v: 'dark',  l: '다크' },
          ]} value={themeName} onChange={setThemeName as (v: string) => void} />
        </TweakGroup>

        <TweakGroup t={t} label="레이아웃 (15종 중 대표 6개)">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3 }}>
            {[
              { v: 'radial-bidirectional', l: '방사형 · 양쪽',   desc: '곡선' },
              { v: 'radial-right',         l: '방사형 · 오른쪽', desc: '곡선' },
              { v: 'tree-right',           l: '트리 · 오른쪽',   desc: '직각·균등' },
              { v: 'tree-down',            l: '트리 · 아래',     desc: '직각·종방향' },
              { v: 'hierarchy-right',      l: '계층형',          desc: '들여쓰기' },
              { v: 'kanban',               l: 'Kanban',          desc: '보드형' },
            ].map(o => {
              const active = o.v === layoutType;
              return (
                <button key={o.v} onClick={() => setLayoutType(o.v as LayoutType)} style={{
                  padding: '6px 8px', borderRadius: 5,
                  background: active ? t.surface : 'transparent',
                  color:      active ? t.text    : t.textMuted,
                  border: `1px solid ${active ? t.primary : t.border}`,
                  cursor: 'pointer', textAlign: 'left',
                  boxShadow: active ? t.shadowSm : 'none',
                  transition: 'all 120ms',
                }}>
                  <div style={{ fontSize: 11, fontWeight: active ? 600 : 500, marginBottom: 1 }}>{o.l}</div>
                  <div style={{ fontSize: 9.5, color: t.textSubtle }}>{o.desc}</div>
                </button>
              );
            })}
          </div>
        </TweakGroup>

        <TweakGroup t={t} label="Inspector 탭">
          <SegButton t={t} options={[
            { v: 'style',   l: '스타일' },
            { v: 'layout',  l: '레이아웃' },
            { v: 'content', l: '첨부' },
            { v: 'note',    l: '노트' },
            { v: 'ai',      l: 'AI' },
          ]} value={inspectorTab} onChange={setInspectorTab as (v: string) => void} />
        </TweakGroup>

        <TweakGroup t={t} label="샘플 주제">
          <SegButton t={t} options={[
            { v: 'roadmap', l: '2026 로드맵' },
            { v: 'meta',    l: 'MVP 설계' },
          ]} value={sampleTopic} onChange={setSampleTopic as (v: string) => void} />
        </TweakGroup>
      </div>
    </div>
  );
}

function TweakGroup({ t, label, children }: { t: ThemeTokens; label: string; children: ReactNode }) {
  return (
    <div>
      <div style={{
        fontSize: 10.5, fontWeight: 700, color: t.textSubtle,
        textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6,
      }}>{label}</div>
      {children}
    </div>
  );
}

interface SegOption { v: string; l: string; dot?: string }

function SegButton({ t, options, value, onChange }: {
  t: ThemeTokens;
  options: SegOption[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `repeat(${options.length}, 1fr)`,
      gap: 3,
      padding: 3, borderRadius: 7,
      background: t.surfaceAlt, border: `1px solid ${t.border}`,
    }}>
      {options.map(o => {
        const active = o.v === value;
        return (
          <button key={o.v} onClick={() => onChange(o.v)} style={{
            padding: '6px 4px', borderRadius: 5,
            background: active ? t.surface : 'transparent',
            color:      active ? t.text    : t.textMuted,
            border: 'none', cursor: 'pointer',
            fontSize: 11, fontWeight: active ? 600 : 500,
            boxShadow: active ? t.shadowSm : 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
            transition: 'all 120ms',
          }}>
            {o.dot && <span style={{ width: 7, height: 7, borderRadius: '50%', background: o.dot }} />}
            {o.l}
          </button>
        );
      })}
    </div>
  );
}
