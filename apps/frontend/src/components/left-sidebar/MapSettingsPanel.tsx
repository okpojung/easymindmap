// MapSettingsPanel — 좌측 상단 '맵 설정' 메뉴.
// 맵 전체에 일괄 적용되는 설정을 관리한다. 현재 항목: 레벨(깊이)별 기본
// 폰트(크기 + 글꼴). 스타일 탭에 있던 읽기 전용 미리보기를 이곳으로 옮겨
// 실제로 변경 가능하게 했다 — 값은 map.settings.levelFonts에 저장되고
// sizeNodeForText / NodeRenderer가 측정·그리기에 동일하게 사용한다.
//
// [서버 연결 예정] Supabase 연동 시 maps.settings_json.levelFonts 로 저장.

import type { CSSProperties } from 'react';
import {
  useAppSettingsStore, AUTOSAVE_INTERVAL_CHOICES,
} from '@/stores/appSettingsStore';
import type { ThemeTokens } from '@/components/design-tokens/theme';
import type { LayoutType, ShapeType, TextAlign } from '@/editor/__samples__/types';
import { useEditorUiStore } from '@/stores/editorUiStore';
import { useDocumentStore } from '@/stores/documentStore';
import {
  LEVEL_FONT_DEFAULT_SIZES,
} from '@/editor/node-renderer/sizeNodeForText';
import { useTr } from '@/i18n';
import { rich } from '@/i18n/rich';

// 손가락 기기의 입력칸 16px·누를 자리 40px (data-mm-touch) — 불러오기만 하면 CSS 가 들어간다
import '@/components/ui/mobileCss';
import { useCoarse } from '@/hooks/useViewport';
// 레벨 표기 = 중심 주제가 1레벨 (내부 depth 0=중심 → 표시 레벨 = depth+1)
// (화면 글자는 사전 키 — 그릴 때 tr() 로 바꾼다)
const LEVEL_LABELS = ['panel.settings.level1', 'panel.settings.level2', 'panel.settings.level3', 'panel.settings.level4', 'panel.settings.level5'];
const LEVEL_WEIGHTS = [700, 600, 500, 500, 500];

const FONT_SIZES = [10, 11, 12, 13, 14, 15, 16, 17, 18, 20, 22, 24, 26, 28];

// 글꼴 목록 — value에 CSS font-family 문자열을 그대로 저장한다.
// [서버 연결 예정] 코드 언어 목록처럼 시스템 관리자 카탈로그로 이관 예정.
const FONT_FAMILIES: { labelKey: string; css: string }[] = [
  { labelKey: 'panel.settings.font.system', css: '' },
  { labelKey: 'panel.settings.font.malgun', css: '"Malgun Gothic", "맑은 고딕", sans-serif' },
  { labelKey: 'panel.settings.font.nanum', css: '"NanumGothic", "나눔고딕", "Malgun Gothic", sans-serif' },
  { labelKey: 'panel.settings.font.noto', css: '"Noto Sans KR", "Malgun Gothic", sans-serif' },
  { labelKey: 'panel.settings.font.serif', css: '"Nanum Myeongjo", Batang, "바탕", serif' },
  { labelKey: 'panel.settings.font.mono', css: 'ui-monospace, Consolas, "Nanum Gothic Coding", monospace' },
];

// 레벨별 레이아웃 선택지 — 서브트리에 적용 가능한 레이아웃만
// (방사형·양쪽 / 트리·아래 / Kanban / 자유배치는 루트 전용이라 제외.
//  레이아웃 탭의 rootOnly 규칙과 동일 — 08-layout.md §6.3.1)
const LEVEL_LAYOUTS: { key: LayoutType | ''; labelKey: string }[] = [
  { key: '',                    labelKey: 'panel.settings.layout.inherit' },
  { key: 'radial-right' as LayoutType,       labelKey: 'panel.settings.layout.radialRight' },
  { key: 'tree-right' as LayoutType,         labelKey: 'panel.settings.layout.treeRight' },
  { key: 'hierarchy-right' as LayoutType,    labelKey: 'panel.settings.layout.hierarchyRight' },
  { key: 'process-tree-right' as LayoutType, labelKey: 'panel.settings.layout.processTreeRight' },
];

const LAYOUT_LEVEL_LABELS = ['panel.settings.level2', 'panel.settings.level3', 'panel.settings.level4', 'panel.settings.level5'];

// 1레벨(중심) = 맵 전체 레이아웃 — 레이아웃 탭과 동일한 선택지
const ROOT_LAYOUTS: { key: LayoutType; labelKey: string }[] = [
  { key: 'radial-bidirectional' as LayoutType, labelKey: 'panel.settings.layout.radialBoth' },
  { key: 'radial-right' as LayoutType,         labelKey: 'panel.settings.layout.radialRight' },
  { key: 'tree-right' as LayoutType,           labelKey: 'panel.settings.layout.treeRight' },
  { key: 'tree-down' as LayoutType,            labelKey: 'panel.settings.layout.treeDown' },
  { key: 'hierarchy-right' as LayoutType,      labelKey: 'panel.settings.layout.hierarchyRight' },
  { key: 'process-tree-right' as LayoutType,   labelKey: 'panel.settings.layout.processTreeRight' },
  { key: 'timeline' as LayoutType,             labelKey: 'panel.settings.layout.timeline' },
  { key: 'timeline-center' as LayoutType,      labelKey: 'panel.settings.layout.timelineCenter' },
];

// 텍스트 맞춤 선택지 — '' = 기본(중앙)
const ALIGN_OPTIONS: { key: TextAlign | ''; labelKey: string }[] = [
  { key: '',       labelKey: 'panel.settings.align.default' },
  { key: 'left',   labelKey: 'panel.settings.align.left' },
  { key: 'center', labelKey: 'panel.settings.align.center' },
  { key: 'right',  labelKey: 'panel.settings.align.right' },
];

// 레벨별 도형 선택지 — '' = 기본(둥근)
const SHAPE_OPTIONS: { key: ShapeType | ''; labelKey: string }[] = [
  { key: '',              labelKey: 'panel.settings.shape.default' },
  { key: 'none',          labelKey: 'panel.settings.shape.none' },
  { key: 'rounded',       labelKey: 'panel.settings.shape.rounded' },
  { key: 'rectangle',     labelKey: 'panel.settings.shape.rectangle' },
  { key: 'pill',          labelKey: 'panel.settings.shape.pill' },
  { key: 'ellipse',       labelKey: 'panel.settings.shape.ellipse' },
  { key: 'hexagon',       labelKey: 'panel.settings.shape.hexagon' },
  { key: 'diamond',       labelKey: 'panel.settings.shape.diamond' },
  { key: 'parallelogram', labelKey: 'panel.settings.shape.parallelogram' },
  { key: 'arrow-left',    labelKey: 'panel.settings.shape.arrowLeft' },
  { key: 'arrow-right',   labelKey: 'panel.settings.shape.arrowRight' },
  { key: 'cylinder',      labelKey: 'panel.settings.shape.cylinder' },
  { key: 'star',          labelKey: 'panel.settings.shape.star' },
];

export function MapSettingsPanel({ t }: { t: ThemeTokens }) {
  const tr = useTr();
  const levelFonts = useDocumentStore((s) => s.map.settings?.levelFonts);
  const levelLayouts = useDocumentStore((s) => s.map.settings?.levelLayouts);
  const updateLevelFont = useDocumentStore((s) => s.updateLevelFont);
  const resetLevelFonts = useDocumentStore((s) => s.resetLevelFonts);
  const setLevelLayout = useDocumentStore((s) => s.setLevelLayout);
  const levelShapes = useDocumentStore((s) => s.map.settings?.levelShapes);
  const setLevelShape = useDocumentStore((s) => s.setLevelShape);
  const noteFont = useDocumentStore((s) => s.map.settings?.noteFont);
  const setNoteFont = useDocumentStore((s) => s.setNoteFont);
  const updateNodeLayoutType = useDocumentStore((s) => s.updateNodeLayoutType);
  const mapLayoutType = useEditorUiStore((s) => s.layoutType);
  const setLayoutType = useEditorUiStore((s) => s.setLayoutType);

  const hasCustom = (levelFonts ?? []).some(
    (f) => f && ((f.size && f.size > 0) || (f.family && f.family.trim())),
  );

  const autosaveIntervalMin = useAppSettingsStore((s) => s.autosaveIntervalMin);
  const setAutosaveIntervalMin = useAppSettingsStore((s) => s.setAutosaveIntervalMin);

  const coarse = useCoarse();
  const selectStyle: CSSProperties = {
    fontSize: 10.5, padding: '3px 4px', borderRadius: 4,
    border: `1px solid ${t.border}`, background: t.surface, color: t.text,
    outline: 'none', cursor: 'pointer',
  };

  return (
    <div data-mm-touch="" style={{ padding: '12px 14px' }}>
      {/* ── 저장 (개인 설정) ─────────────────────────────────────────
          맵이 아니라 **이 브라우저**의 설정이다. 2026-08-06 저장 모델
          개편 — 실시간 저장(디바운스)을 없애고 이 주기로만 서버에 올린다.
          그 사이 편집은 브라우저(IndexedDB)가 지킨다. */}
      <div style={{
        fontSize: 11, fontWeight: 700, color: t.textSubtle,
        textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6,
      }}>{tr('panel.settings.saveHeader')}</div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6,
      }}>
        <span style={{ fontSize: 11.5, color: t.text }}>{tr('panel.settings.autosaveInterval')}</span>
        <select
          data-testid="autosave-interval"
          value={autosaveIntervalMin}
          onChange={(e) => setAutosaveIntervalMin(Number(e.target.value))}
          style={{ ...selectStyle, marginLeft: 'auto' }}
        >
          {AUTOSAVE_INTERVAL_CHOICES.map((m) => (
            <option key={m} value={m}>{tr('panel.settings.everyNMin', { n: m })}</option>
          ))}
        </select>
      </div>
      <div style={{
        fontSize: 10.5, color: t.textSubtle, lineHeight: 1.5, marginBottom: 14,
      }}>
        {rich(tr('panel.settings.saveHelp'))}
      </div>

      <div style={{
        display: 'flex', alignItems: 'center', marginBottom: 6,
      }}>
        <div style={{
          fontSize: 11, fontWeight: 700, color: t.textSubtle,
          textTransform: 'uppercase', letterSpacing: 0.5,
        }}>{tr('panel.settings.levelFonts')}</div>
        {hasCustom && (
          <button onClick={resetLevelFonts} title={tr('panel.settings.resetFontsTip')}
            style={{
              marginLeft: 'auto', fontSize: 10, padding: '2px 7px', borderRadius: 4,
              border: `1px solid ${t.border}`, background: t.surfaceAlt,
              color: t.textMuted, cursor: 'pointer', fontWeight: 600,
            }}>{tr('panel.settings.resetFonts')}</button>
        )}
      </div>
      <div style={{ fontSize: 10.5, color: t.textSubtle, marginBottom: 10, lineHeight: 1.5 }}>
        {tr('panel.settings.levelFontsHelp')}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {LEVEL_LABELS.map((label, li) => {
          const setting = levelFonts?.[li];
          const size = setting?.size && setting.size > 0
            ? setting.size
            : LEVEL_FONT_DEFAULT_SIZES[li];
          const family = setting?.family ?? '';
          return (
            <div key={label} style={{
              padding: '6px 8px', borderRadius: 5,
              background: t.surfaceAlt, border: `1px solid ${t.border}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 5 }}>
                <span style={{ fontSize: 10.5, color: t.textMuted, width: 52, fontWeight: 600 }}>
                  {tr(label)}
                </span>
                <span style={{
                  fontSize: size, fontWeight: LEVEL_WEIGHTS[li], color: t.text,
                  flex: 1, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden',
                  fontFamily: family || 'inherit',
                }}>{tr('panel.settings.sampleText')}</span>
              </div>
              {/* 손가락 기기 — 글자가 16px 로 커지므로 정렬 칸은 다음 줄로 (좁은 서랍에서 잘리지 않게) */}
              <div style={{ display: 'flex', flexWrap: coarse ? 'wrap' : undefined, gap: 5 }}>
                <select
                  value={size}
                  onChange={(e) => updateLevelFont(li, { size: Number(e.target.value) })}
                  title={tr('panel.settings.fontSizeTip')}
                  style={{ ...selectStyle, width: coarse ? 84 : 62 }}
                >
                  {(FONT_SIZES.includes(size) ? FONT_SIZES : [...FONT_SIZES, size].sort((a, b) => a - b))
                    .map((s) => (
                      <option key={s} value={s}>
                        {s}pt{s === LEVEL_FONT_DEFAULT_SIZES[li] ? tr('panel.settings.defaultSuffix') : ''}
                      </option>
                    ))}
                </select>
                <select
                  value={family}
                  onChange={(e) => updateLevelFont(li, { family: e.target.value })}
                  title={tr('panel.settings.fontTip')}
                  style={{ ...selectStyle, flex: 1, minWidth: 0 }}
                >
                  {FONT_FAMILIES.map((f) => (
                    <option key={f.labelKey} value={f.css}>{tr(f.labelKey)}</option>
                  ))}
                </select>
                <select
                  value={setting?.align ?? ''}
                  onChange={(e) =>
                    updateLevelFont(li, { align: (e.target.value || undefined) as TextAlign | undefined })}
                  title={tr('panel.settings.alignTip')}
                  style={{ ...selectStyle, width: coarse ? undefined : 96, flex: coarse ? '1 1 100%' : undefined }}
                >
                  {ALIGN_OPTIONS.map((a) => (
                    <option key={a.key} value={a.key}>{tr(a.labelKey)}</option>
                  ))}
                </select>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{
        fontSize: 11, fontWeight: 700, color: t.textSubtle,
        textTransform: 'uppercase', letterSpacing: 0.5,
        margin: '16px 0 6px',
      }}>{tr('panel.settings.levelLayouts')}</div>
      <div style={{ fontSize: 10.5, color: t.textSubtle, marginBottom: 10, lineHeight: 1.5 }}>
        {rich(tr('panel.settings.levelLayoutsHelp'))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {/* 1레벨(중심) = 맵 전체 레이아웃 (레이아웃 탭과 동일 동작) */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '6px 8px', borderRadius: 5,
          background: t.surfaceAlt, border: `1px solid ${t.border}`,
        }}>
          <span style={{ fontSize: 10.5, color: t.textMuted, width: 52, fontWeight: 600 }}>
            {tr('panel.settings.level1')}
          </span>
          <select
            value={mapLayoutType}
            onChange={(e) => {
              const lt = e.target.value as LayoutType;
              // 맵 먼저 → UI 레이아웃: 히스토리가 이전 레이아웃과 함께 기록됨
              updateNodeLayoutType('root', lt);
              setLayoutType(lt);
            }}
            title={tr('panel.settings.rootLayoutTip')}
            style={{ ...selectStyle, flex: 1, minWidth: 0 }}
          >
            {ROOT_LAYOUTS.map((o) => (
              <option key={o.key} value={o.key}>{tr(o.labelKey)}</option>
            ))}
          </select>
        </div>
        {LAYOUT_LEVEL_LABELS.map((label, i) => {
          const level = i + 1; // 1~4 (4 = Level 4+)
          const value = levelLayouts?.[level] ?? '';
          return (
            <div key={label} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '6px 8px', borderRadius: 5,
              background: t.surfaceAlt, border: `1px solid ${t.border}`,
            }}>
              <span style={{ fontSize: 10.5, color: t.textMuted, width: 52, fontWeight: 600 }}>
                {tr(label)}
              </span>
              <select
                value={value}
                onChange={(e) =>
                  setLevelLayout(level, (e.target.value || null) as LayoutType | null)}
                title={tr('panel.settings.levelLayoutTip', { level: tr(label) })}
                style={{ ...selectStyle, flex: 1, minWidth: 0 }}
              >
                {LEVEL_LAYOUTS.map((o) => (
                  <option key={o.key} value={o.key}>{tr(o.labelKey)}</option>
                ))}
              </select>
            </div>
          );
        })}
      </div>

      <div style={{
        fontSize: 11, fontWeight: 700, color: t.textSubtle,
        textTransform: 'uppercase', letterSpacing: 0.5,
        margin: '16px 0 6px',
      }}>{tr('panel.settings.noteFont')}</div>
      <div style={{ fontSize: 10.5, color: t.textSubtle, marginBottom: 10, lineHeight: 1.5 }}>
        {tr('panel.settings.noteFontHelp')}
      </div>
      <div style={{
        display: 'flex', gap: 5, padding: '6px 8px', borderRadius: 5,
        background: t.surfaceAlt, border: `1px solid ${t.border}`,
        marginBottom: 4,
      }}>
        <select
          value={noteFont?.size && noteFont.size > 0 ? noteFont.size : 13}
          onChange={(e) => setNoteFont({ size: Number(e.target.value) })}
          title={tr('panel.settings.noteSizeTip')}
          style={{ ...selectStyle, width: coarse ? 100 : 74 }}
        >
          {[10, 11, 12, 13, 14, 15, 16, 18, 20, 22, 24].map((sz) => (
            <option key={sz} value={sz}>{sz}pt{sz === 13 ? tr('panel.settings.defaultSuffix') : ''}</option>
          ))}
        </select>
        <select
          value={noteFont?.family ?? ''}
          onChange={(e) => setNoteFont({ family: e.target.value })}
          title={tr('panel.settings.noteFontTip')}
          style={{ ...selectStyle, flex: 1, minWidth: 0 }}
        >
          {FONT_FAMILIES.map((f) => (
            <option key={f.labelKey} value={f.css}>{tr(f.labelKey)}</option>
          ))}
        </select>
      </div>

      <div style={{
        fontSize: 11, fontWeight: 700, color: t.textSubtle,
        textTransform: 'uppercase', letterSpacing: 0.5,
        margin: '16px 0 6px',
      }}>{tr('panel.settings.levelShapes')}</div>
      <div style={{ fontSize: 10.5, color: t.textSubtle, marginBottom: 10, lineHeight: 1.5 }}>
        {tr('panel.settings.levelShapesHelp')}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {LEVEL_LABELS.map((label, li) => (
          <div key={`shape-${label}`} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '6px 8px', borderRadius: 5,
            background: t.surfaceAlt, border: `1px solid ${t.border}`,
          }}>
            <span style={{ fontSize: 10.5, color: t.textMuted, width: 52, fontWeight: 600 }}>
              {tr(label)}
            </span>
            <select
              value={levelShapes?.[li] ?? ''}
              onChange={(e) =>
                setLevelShape(li, (e.target.value || null) as ShapeType | null)}
              title={tr('panel.settings.shapeTip', { level: tr(label) })}
              style={{ ...selectStyle, flex: 1, minWidth: 0 }}
            >
              {SHAPE_OPTIONS.map((o) => (
                <option key={o.key} value={o.key}>{tr(o.labelKey)}</option>
              ))}
            </select>
          </div>
        ))}
      </div>
    </div>
  );
}
