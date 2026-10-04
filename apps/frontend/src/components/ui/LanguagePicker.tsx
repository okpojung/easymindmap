// LanguagePicker — 화면 언어 고르기 (B10 i18n, 2026-10-05).
//
// 로그인 화면(로그인 전에도 바꿀 수 있어야 한다)과 계정 메뉴 ▸ 개인 설정,
// 공개 링크 화면에서 쓴다. 각 언어 이름은 **그 언어로** 적는다 —
// 지금 화면 말을 못 읽는 사람도 자기 언어는 알아본다.

import type { ThemeTokens } from '@/components/design-tokens/theme';
import { LANGS, LANG_LABELS, useLangStore, useTr, type Lang } from '@/i18n';
import { useCoarse } from '@/hooks/useViewport';

export function LanguagePicker({
  t, compact = false, testId = 'language-picker',
}: {
  t: ThemeTokens;
  /** 아이콘 + 짧은 선택 상자만 (머리말 줄용) */
  compact?: boolean;
  testId?: string;
}) {
  const tr = useTr();
  const lang = useLangStore((s) => s.lang);
  const setLang = useLangStore((s) => s.setLang);
  // 손가락 기기 — 누를 자리 36px 이상, 글자 16px(iOS 는 더 작은 칸을 누르면 화면을 확대한다)
  const coarse = useCoarse();
  return (
    <label
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        fontSize: compact ? 12 : 13, color: t.textMuted,
      }}
      title={tr('common.language')}
    >
      <span aria-hidden>🌐</span>
      {!compact && <span>{tr('common.language')}</span>}
      <select
        data-testid={testId}
        aria-label={tr('common.language')}
        value={lang}
        onChange={(e) => setLang(e.target.value as Lang)}
        style={{
          font: 'inherit', fontSize: coarse ? 16 : compact ? 12 : 13,
          padding: compact ? '3px 6px' : '6px 8px', minHeight: coarse ? 38 : compact ? 28 : 34,
          borderRadius: 7, border: `1px solid ${t.border}`,
          background: t.surface, color: t.text, cursor: 'pointer',
        }}
      >
        {LANGS.map((l) => <option key={l} value={l}>{LANG_LABELS[l]}</option>)}
      </select>
    </label>
  );
}
