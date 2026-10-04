// GuestBrowserNotice — Guest 체험 모드에서 '내 문서'(문서함)를 열었을 때
// 빈 목록 대신 보여 주는 안내 화면 (2026-08-04).
//
// 빈 화면은 버그처럼 보인다 — "왜 안 되는지 + 가입하면 무엇이 되는지"를
// 말해 주고 가입으로 안내하는 것이 체험 모드의 목적(전환)에 맞다.

import type { ThemeTokens } from '@/components/design-tokens/theme';
import { I } from '@/components/icons';
import { useAuthStore } from '@/stores/authStore';
import { useEditorUiStore } from '@/stores/editorUiStore';
import { useTr } from '@/i18n';
import { rich } from '@/i18n/rich';

export function GuestBrowserNotice({ t }: { t: ThemeTokens }) {
  const tr = useTr();
  return (
    <div
      data-testid="guest-browser-notice"
      style={{
        flex: 1, minWidth: 0, display: 'flex', alignItems: 'center',
        justifyContent: 'center', background: t.bg,
      }}
    >
      <div style={{
        maxWidth: 420, textAlign: 'center', padding: '40px 28px',
        border: `1px solid ${t.border}`, borderRadius: 12, background: t.surface,
      }}>
        <div style={{ marginBottom: 14 }}><I.Logo size={44} /></div>
        <div style={{ fontSize: 16, fontWeight: 800, color: t.text, marginBottom: 8 }}>
          {tr('auth.guest.title')}
        </div>
        <div style={{ fontSize: 12.5, color: t.textMuted, lineHeight: 1.7, marginBottom: 18 }}>
          {rich(tr('auth.guest.body1'))}<br />
          {rich(tr('auth.guest.body2'))}
        </div>
        <button
          data-testid="guest-signup"
          onClick={() => {
            // Guest 종료 → 로그인/가입 화면 (편집 중이던 맵은 로컬 체험
            // 데이터 — 세션 전환 리셋 규칙대로 비워진다)
            useAuthStore.getState().exitGuest();
          }}
          style={{
            width: '100%', padding: '10px 0', borderRadius: 8, border: 'none',
            background: t.primary, color: '#FFF', fontSize: 13.5,
            fontWeight: 700, cursor: 'pointer', marginBottom: 8,
          }}>{tr('auth.guest.signup')}</button>
        <button
          data-testid="guest-browser-close"
          onClick={() => useEditorUiStore.getState().setBrowserOpen(false)}
          style={{
            width: '100%', padding: '9px 0', borderRadius: 8,
            border: `1px solid ${t.border}`, background: t.surfaceAlt,
            color: t.text, fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
          }}>{tr('auth.guest.keepTrying')}</button>
      </div>
    </div>
  );
}
