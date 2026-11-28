// 카카오·네이버·구글로 계속하기 (2026-11-28) — 로그인·가입 화면 공용.
// 버튼 모양은 각 회사의 디자인 가이드를 따른다:
//   카카오 = 노랑(#FEE500) 바탕 · 검정 말풍선 · 검정 85% 글자
//   네이버 = 초록(#03C75A) 바탕 · 흰 N · 흰 글자
//   구글   = 흰 바탕 · 회색(#747775) 테두리 · 4색 G · #1F1F1F 글자
// 켜지지 않은 공급자(GoTrue·API 설정 전)는 예전처럼 회색 '준비 중'으로 둔다.
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import type { ThemeTokens } from '@/components/design-tokens/theme';
import { useTr } from '@/i18n';
import { beginSocial, loadSocialAvailability, SOCIAL_IDS, type SocialAvailability, type SocialId } from '@/services/cloud/socialAuth';

export const SOCIAL_LOGOS: Record<SocialId, ReactNode> = {
  kakao: (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path fill="#000" d="M9 1.5C4.58 1.5 1 4.32 1 7.8c0 2.25 1.5 4.22 3.75 5.33l-.95 3.48c-.08.3.26.54.52.37l4.15-2.74c.17.01.35.02.53.02 4.42 0 8-2.82 8-6.3S13.42 1.5 9 1.5z" /></svg>
  ),
  naver: (
    <svg width="14" height="14" viewBox="0 0 20 20" aria-hidden="true"><path fill="#fff" d="M13.6 10.7 6.2 0H0v20h6.4V9.3L13.8 20H20V0h-6.4z" /></svg>
  ),
  google: (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  ),
};

export const SOCIAL_BRAND: Record<SocialId, { bg: string; fg: string; border: string }> = {
  kakao: { bg: '#FEE500', fg: 'rgba(0,0,0,0.85)', border: '#FEE500' },
  naver: { bg: '#03C75A', fg: '#FFFFFF', border: '#03C75A' },
  google: { bg: '#FFFFFF', fg: '#1F1F1F', border: '#747775' },
};

/** 켜진 공급자 — 첫 그림에서는 모두 꺼진 것으로 두고 읽히면 켠다 */
export function useSocialAvailability(): SocialAvailability | null {
  const [a, setA] = useState<SocialAvailability | null>(null);
  useEffect(() => {
    let alive = true;
    void loadSocialAvailability().then((v) => { if (alive) setA(v); });
    return () => { alive = false; };
  }, []);
  return a;
}

export function SocialButtons({ t, returnTo, height = 40 }: { t: ThemeTokens; returnTo?: string; height?: number }) {
  const tr = useTr();
  const avail = useSocialAvailability();
  const [busy, setBusy] = useState<SocialId | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const go = async (id: SocialId) => {
    if (busy) return;
    setBusy(id); setErr(null);
    try {
      await beginSocial(id, { mode: 'login', returnTo });
    } catch (e) {
      setErr(e instanceof Error ? e.message : tr('auth.social.failed'));
      setBusy(null);
    }
  };

  return (
    <div data-testid="social-buttons">
      {SOCIAL_IDS.map((id) => {
        const on = !!avail?.[id];
        const b = SOCIAL_BRAND[id];
        const label = tr(`auth.login.provider.${id}`);
        const style: CSSProperties = on
          ? { background: b.bg, color: b.fg, border: `1px solid ${b.border}`, cursor: busy ? 'default' : 'pointer', opacity: busy && busy !== id ? 0.6 : 1 }
          : { background: t.surface, color: t.textSubtle, border: `1px solid ${t.border}`, cursor: 'default' };
        return (
          <button
            key={id}
            type="button"
            data-testid={`login-provider-${id}`}
            data-enabled={on ? '1' : '0'}
            disabled={!on || !!busy}
            title={on ? label : tr('auth.login.providerSoon', { name: label })}
            onClick={() => void go(id)}
            style={{
              ...style, width: '100%', height, marginBottom: 7, borderRadius: 8,
              display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px',
              fontSize: 13.5, fontWeight: 600, fontFamily: id === 'google' && on ? "'Roboto', 'Pretendard Variable', sans-serif" : 'inherit',
            }}
          >
            <span style={{
              width: 20, height: 20, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              filter: on ? undefined : 'grayscale(1)', opacity: on ? 1 : 0.45,
              ...(id === 'naver' && !on ? { background: t.textSubtle, borderRadius: 3 } : {}),
            }}>{SOCIAL_LOGOS[id]}</span>
            <span style={{ flex: 1, textAlign: 'center', marginRight: 20 }}>{busy === id ? tr('auth.social.moving') : label}</span>
            {!on && avail && (
              <span style={{
                fontSize: 10, fontWeight: 600, color: t.textSubtle, marginLeft: -20,
                border: `1px solid ${t.border}`, borderRadius: 8, padding: '1px 7px', whiteSpace: 'nowrap',
              }}>{tr('common.comingSoon')}</span>
            )}
          </button>
        );
      })}
      {err && <div role="alert" data-testid="social-error" style={{ color: '#d9534f', fontSize: 12, marginTop: 2 }}>{err}</div>}
    </div>
  );
}
