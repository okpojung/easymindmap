// 소셜 로그인에서 돌아오는 자리 `/auth/callback` (2026-11-28).
//
// GoTrue 가 공급자(카카오·네이버·구글) 로그인을 마치고 `?code=…` 를 붙여 여기로 보낸다.
// 처음에 이 탭에 둔 검증 문자열(PKCE)과 함께 세션으로 바꾸고, 시작했던 자리로 돌아간다.
//   · 로그인·가입: 세션을 들인다 → 첫 가입이면 편집 화면이 이름·만 14세 확인을 받는다
//   · 계정 연결: 같은 계정인지 확인하고 세션만 새로 고친다 → 계정 프로필로
// 주소창에 코드가 남지 않게 replace 로 떠난다.
import { useEffect, useRef, useState } from 'react';
import { THEMES } from '@/components/design-tokens/theme';
import { useTr } from '@/i18n';
import { useAuthStore } from '@/stores/authStore';
import { supabaseAuth, AuthError } from '@/services/cloud/supabaseAuth';
import { callbackErrorMessage, LINK_NOTICE_KEY, parseCallback, takePending } from '@/services/cloud/socialAuth';
import { collectPhoneHint } from '@/services/cloud/socialPhone';
import { cloudApi } from '@/services/cloud/apiClient';

export function SocialCallbackPage() {
  const tr = useTr();
  const dark = typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  const t = THEMES[dark ? 'dark' : 'light'];
  const [err, setErr] = useState<string | null>(null);
  const once = useRef(false);

  useEffect(() => {
    if (once.current) return;
    once.current = true;
    const params = parseCallback(window.location.search, window.location.hash);
    // 코드는 한 번만 쓰인다 — 주소창·방문 기록에서 곧바로 지운다
    window.history.replaceState(null, '', '/auth/callback');
    const pending = takePending();
    void (async () => {
      if (params.error || !params.code) {
        setErr(params.error || params.errorCode ? callbackErrorMessage(params) : tr('auth.social.failed'));
        return;
      }
      if (!pending) { setErr(tr('auth.social.expired')); return; }
      try {
        const { session: s, providerToken } = await supabaseAuth.exchangeSocialCode(params.code, pending.v);
        if (pending.mode === 'link') {
          const cur = useAuthStore.getState().session;
          if (!cur || cur.userId !== s.userId || (pending.userId && pending.userId !== s.userId)) {
            setErr(tr('auth.social.linkOtherAccount'));
            return;
          }
          useAuthStore.getState().setSession({ ...s, email: s.email || cur.email });
          try { sessionStorage.setItem(LINK_NOTICE_KEY, JSON.stringify({ provider: pending.provider, at: Date.now() })); } catch { /* 안내만 빠진다 */ }
        } else {
          useAuthStore.getState().adoptSocialSession(s);
        }
        // 카카오·네이버 휴대폰 번호 — 가입 창·프로필을 미리 채울 뿐(저장·인증 아님). 짧게만 기다린다
        await collectPhoneHint(pending.provider, providerToken, s.userId, cloudApi.socialPhone);
        window.location.replace(pending.returnTo || '/');
      } catch (e) {
        setErr(e instanceof AuthError ? e.message : tr('auth.social.failed'));
      }
    })();
  }, [tr]);

  return (
    <div data-testid="social-callback" style={{
      position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: t.bg, color: t.text, fontFamily: 'inherit', padding: 20,
    }}>
      <div style={{ width: 'min(420px, 100%)', background: t.surface, border: `1px solid ${t.border}`, borderRadius: 12, padding: 24, textAlign: 'center' }}>
        {err ? (
          <>
            <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 10 }}>{tr('auth.social.failedTitle')}</div>
            <div data-testid="social-callback-error" role="alert" style={{ fontSize: 13, color: t.textMuted, lineHeight: 1.6, marginBottom: 18 }}>{err}</div>
            <button type="button" data-testid="social-callback-home" onClick={() => window.location.replace('/')}
              style={{ height: 38, padding: '0 18px', borderRadius: 8, border: 'none', background: t.primary, color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
              {tr('auth.backToLogin')}
            </button>
          </>
        ) : (
          <div style={{ fontSize: 14, color: t.textMuted }}>{tr('auth.social.finishing')}</div>
        )}
      </div>
    </div>
  );
}
