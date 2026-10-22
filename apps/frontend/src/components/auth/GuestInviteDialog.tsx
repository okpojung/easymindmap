// GuestInviteDialog — 홈페이지에서 'Guest로 체험해보기'로 들어온 방문자에게 띄우는 안내
// (2026-10-22 사용자 결정). 로그인 화면 위에 뜬다.
//
//   [Guest로 체험하기]  → 로그인 화면의 게스트 버튼과 똑같이 enterGuest()
//   [로그인·회원가입]   → 팝업만 닫는다 (뒤의 로그인 화면을 그대로 쓴다)
//
// 게스트 작업이 이 브라우저에만 남는다는 경고를 함께 보여 준다 — 공용 PC 에서
// 다음 사람이 볼 수 있다.

import { useEffect, useRef } from 'react';
import type { ThemeTokens } from '@/components/design-tokens/theme';
import { I } from '@/components/icons';
import { useAuthStore } from '@/stores/authStore';
import { useTr } from '@/i18n';

export function GuestInviteDialog({ t, onClose }: { t: ThemeTokens; onClose: () => void }) {
  const tr = useTr();
  const guestBtn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    guestBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div
      data-testid="guest-invite"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.38)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="guest-invite-title"
        style={{
          width: '100%', maxWidth: 400, boxSizing: 'border-box',
          background: t.surface, color: t.text, border: `1px solid ${t.border}`,
          borderRadius: 14, padding: '26px 24px 20px', textAlign: 'center',
          boxShadow: '0 18px 48px rgba(0,0,0,0.22)',
        }}
      >
        <div style={{ marginBottom: 12 }}><I.Logo size={44} /></div>
        <div id="guest-invite-title" style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>
          {tr('auth.invite.title')}
        </div>
        <div style={{ fontSize: 13.5, color: t.textMuted, lineHeight: 1.6, marginBottom: 18 }}>
          {tr('auth.invite.body')}
        </div>
        <button
          ref={guestBtn}
          data-testid="guest-invite-start"
          onClick={() => { onClose(); useAuthStore.getState().enterGuest(); }}
          style={{
            width: '100%', height: 42, borderRadius: 8, border: 'none',
            background: t.primary, color: '#FFF', fontSize: 14, fontWeight: 700,
            cursor: 'pointer', marginBottom: 8,
          }}
        >{tr('auth.invite.guest')}</button>
        <button
          data-testid="guest-invite-login"
          onClick={onClose}
          style={{
            width: '100%', height: 40, borderRadius: 8, border: `1px solid ${t.border}`,
            background: t.surfaceAlt, color: t.text, fontSize: 13.5, fontWeight: 600,
            cursor: 'pointer',
          }}
        >{tr('auth.invite.login')}</button>
        <div
          data-testid="guest-invite-notice"
          style={{ marginTop: 14, fontSize: 11.5, color: t.textMuted, lineHeight: 1.6, textAlign: 'left' }}
        >※ {tr('auth.invite.notice')}</div>
      </div>
    </div>
  );
}
