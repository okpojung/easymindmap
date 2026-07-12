// MapSettingsPanel — 좌측 상단 '맵 설정' 메뉴.
// 맵 전체에 일괄 적용되는 설정을 관리한다. 현재 항목: 레벨(깊이)별 기본
// 폰트(크기 + 글꼴). 스타일 탭에 있던 읽기 전용 미리보기를 이곳으로 옮겨
// 실제로 변경 가능하게 했다 — 값은 map.settings.levelFonts에 저장되고
// sizeNodeForText / NodeRenderer가 측정·그리기에 동일하게 사용한다.
//
// [서버 연결 예정] Supabase 연동 시 maps.settings_json.levelFonts 로 저장.

import type { CSSProperties } from 'react';
import type { ThemeTokens } from '@/components/design-tokens/theme';
import { useDocumentStore } from '@/stores/documentStore';
import {
  LEVEL_FONT_DEFAULT_SIZES,
} from '@/editor/node-renderer/sizeNodeForText';

const LEVEL_LABELS = ['Root', 'Level 1', 'Level 2', 'Level 3', 'Level 4+'];
const LEVEL_WEIGHTS = [700, 600, 500, 500, 500];

const FONT_SIZES = [10, 11, 12, 13, 14, 15, 16, 17, 18, 20, 22, 24, 26, 28];

// 글꼴 목록 — value에 CSS font-family 문자열을 그대로 저장한다.
// [서버 연결 예정] 코드 언어 목록처럼 시스템 관리자 카탈로그로 이관 예정.
const FONT_FAMILIES: { label: string; css: string }[] = [
  { label: '기본 (시스템)', css: '' },
  { label: '맑은 고딕', css: '"Malgun Gothic", "맑은 고딕", sans-serif' },
  { label: '나눔고딕', css: '"NanumGothic", "나눔고딕", "Malgun Gothic", sans-serif' },
  { label: '본고딕 (Noto Sans KR)', css: '"Noto Sans KR", "Malgun Gothic", sans-serif' },
  { label: '명조 (바탕/세리프)', css: '"Nanum Myeongjo", Batang, "바탕", serif' },
  { label: '고정폭 (코드)', css: 'ui-monospace, Consolas, "Nanum Gothic Coding", monospace' },
];

export function MapSettingsPanel({ t }: { t: ThemeTokens }) {
  const levelFonts = useDocumentStore((s) => s.map.settings?.levelFonts);
  const updateLevelFont = useDocumentStore((s) => s.updateLevelFont);
  const resetLevelFonts = useDocumentStore((s) => s.resetLevelFonts);

  const hasCustom = (levelFonts ?? []).some(
    (f) => f && ((f.size && f.size > 0) || (f.family && f.family.trim())),
  );

  const selectStyle: CSSProperties = {
    fontSize: 10.5, padding: '3px 4px', borderRadius: 4,
    border: `1px solid ${t.border}`, background: t.surface, color: t.text,
    outline: 'none', cursor: 'pointer',
  };

  return (
    <div style={{ padding: '12px 14px' }}>
      <div style={{
        display: 'flex', alignItems: 'center', marginBottom: 6,
      }}>
        <div style={{
          fontSize: 11, fontWeight: 700, color: t.textSubtle,
          textTransform: 'uppercase', letterSpacing: 0.5,
        }}>레벨별 폰트 (맵 전체 설정)</div>
        {hasCustom && (
          <button onClick={resetLevelFonts} title="레벨별 폰트를 기본값으로 되돌립니다"
            style={{
              marginLeft: 'auto', fontSize: 10, padding: '2px 7px', borderRadius: 4,
              border: `1px solid ${t.border}`, background: t.surfaceAlt,
              color: t.textMuted, cursor: 'pointer', fontWeight: 600,
            }}>기본값</button>
        )}
      </div>
      <div style={{ fontSize: 10.5, color: t.textSubtle, marginBottom: 10, lineHeight: 1.5 }}>
        노드 깊이별 기본 글자 크기·글꼴. 변경하면 맵의 모든 노드에 일괄
        적용되고 레이아웃(노드 크기)도 함께 다시 계산됩니다.
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
                  {label}
                </span>
                <span style={{
                  fontSize: size, fontWeight: LEVEL_WEIGHTS[li], color: t.text,
                  flex: 1, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden',
                  fontFamily: family || 'inherit',
                }}>가나다 Aa</span>
              </div>
              <div style={{ display: 'flex', gap: 5 }}>
                <select
                  value={size}
                  onChange={(e) => updateLevelFont(li, { size: Number(e.target.value) })}
                  title="글자 크기"
                  style={{ ...selectStyle, width: 62 }}
                >
                  {(FONT_SIZES.includes(size) ? FONT_SIZES : [...FONT_SIZES, size].sort((a, b) => a - b))
                    .map((s) => (
                      <option key={s} value={s}>
                        {s}pt{s === LEVEL_FONT_DEFAULT_SIZES[li] ? ' ·기본' : ''}
                      </option>
                    ))}
                </select>
                <select
                  value={family}
                  onChange={(e) => updateLevelFont(li, { family: e.target.value })}
                  title="글꼴"
                  style={{ ...selectStyle, flex: 1, minWidth: 0 }}
                >
                  {FONT_FAMILIES.map((f) => (
                    <option key={f.label} value={f.css}>{f.label}</option>
                  ))}
                </select>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
