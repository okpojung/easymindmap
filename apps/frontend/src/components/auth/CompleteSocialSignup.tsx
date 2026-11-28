// 소셜 가입 마무리 (2026-11-28) — 카카오·네이버·구글로 **처음** 들어온 사람에게 한 번.
//
// 이메일 가입 화면이 받는 것 중 공급자가 대신 주지 않는 것을 받는다:
//   · 이름 (공급자가 준 이름을 미리 채운다 — 고칠 수 있다)
//   · 만 14세 이상 확인 — 개인정보 보호법·처리방침 §9. 이메일 가입과 **같은 규칙**이라
//     확인 전에는 [시작하기]를 막는다. 원하지 않으면 로그아웃할 수 있다.
// 휴대폰은 선택 — 카카오·네이버가 번호를 주었으면(socialPhone.ts) 미리 채워 보여 주고 고치거나
// 지울 수 있다. 인증은 여전히 계정 프로필의 ARS. 번호가 없으면 칸을 보이지 않는다(나중에 프로필에서).
// 띄우는 조건(SocialSignupGate): 로그인 수단이 소셜 · 프로필을 읽었고 이름이 비어 있다.
import { Fragment, useEffect, useState, type ReactNode } from 'react';
import type { ThemeTokens } from '@/components/design-tokens/theme';
import { useTr } from '@/i18n';
import { rich } from '@/i18n/rich';
import { useAuthStore, captureAuthIdentity, isAuthIdentityCurrent } from '@/stores/authStore';
import { useProfileStore } from '@/stores/profileStore';
import { nameProblem } from '@/utils/profileName';
import { cloudApi, CloudError } from '@/services/cloud/apiClient';
import { supabaseAuth, authEnabled } from '@/services/cloud/supabaseAuth';
import { sessionProvider, socialIdOf } from '@/services/cloud/socialAuth';
import { clearPhoneHint, readPhoneHint } from '@/services/cloud/socialPhone';
import { DEFAULT_COUNTRY, formatPhone } from '@/utils/countryCodes';

/** 문장 속 [글](https://…) 를 링크로 — 사전 문장이 언어마다 어순이 달라 조각내지 않는다 */
export function withLinks(text: string, color: string): ReactNode[] {
  return text.split(/(\[[^\]]+\]\(https:\/\/[^)\s]+\))/).filter(Boolean).map((part, i) => {
    const m = /^\[([^\]]+)\]\((https:\/\/[^)\s]+)\)$/.exec(part);
    return m
      ? <a key={i} href={m[2]} target="_blank" rel="noopener noreferrer" style={{ color, textDecoration: 'underline' }}>{m[1]}</a>
      : <Fragment key={i}>{part}</Fragment>;
  });
}

/** 공급자가 준 이름 — full_name → name → nickname */
export function suggestedName(meta: { full_name?: string; name?: string; nickname?: string } | undefined): string {
  const v = meta?.full_name || meta?.name || meta?.nickname || '';
  return String(v).trim().slice(0, 100);
}

export function needsSocialCompletion(provider: string | null, profile: { complete?: boolean } | null, loaded: boolean): boolean {
  return !!socialIdOf(provider ?? undefined) && loaded && !!profile && profile.complete === false;
}

export function SocialSignupGate({ t }: { t: ThemeTokens }) {
  const session = useAuthStore((s) => s.session);
  const profile = useProfileStore((s) => s.profile);
  const loaded = useProfileStore((s) => s.loaded);
  const forUser = useProfileStore((s) => s.forUser);
  const provider = session ? sessionProvider(session.accessToken) : null;
  const social = !!socialIdOf(provider ?? undefined);
  useEffect(() => {
    if (authEnabled && session && social && (!loaded || forUser !== session.userId)) void useProfileStore.getState().load();
  }, [session, social, loaded, forUser]);
  if (!authEnabled || !session || forUser !== session.userId) return null;
  if (!needsSocialCompletion(provider, profile as { complete?: boolean } | null, loaded)) return null;
  return <CompleteSocialSignup t={t} />;
}

export function CompleteSocialSignup({ t }: { t: ThemeTokens }) {
  const tr = useTr();
  const session = useAuthStore((s) => s.session);
  const [name, setName] = useState('');
  const [ageOk, setAgeOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const provider = socialIdOf(sessionProvider(session?.accessToken) ?? undefined);
  // 공급자가 준 번호(있을 때만) — 처음 한 번 읽는다
  const [hint] = useState(() => readPhoneHint(session?.userId));
  const hintDial = (hint?.country ?? '').replace(/\D/g, '') || DEFAULT_COUNTRY.dial;
  const [phone, setPhone] = useState(() => (hint ? formatPhone(hintDial, hint.number) : ''));
  const phoneDigits = phone.replace(/\D/g, '');

  useEffect(() => {
    if (!session) return;
    let alive = true;
    void supabaseAuth.getUser(session.accessToken)
      .then((u) => { if (alive) setName((cur) => cur || suggestedName(u.user_metadata)); })
      .catch(() => { /* 이름은 직접 넣는다 */ });
    return () => { alive = false; };
  }, [session]);

  const problem = nameProblem(name);
  const can = !problem && ageOk && !busy;
  const submit = async () => {
    if (!can) { if (problem) setErr(problem); return; }
    if (phoneDigits && phoneDigits.length < 6) { setErr(tr('auth.profile.phoneTooShort')); return; }
    setBusy(true); setErr(null);
    const id = captureAuthIdentity();
    try {
      const saved = await cloudApi.saveProfile({
        fullName: name.trim(),
        ...(hint && phoneDigits ? { phoneCountry: `+${hintDial}`, phoneNumber: phoneDigits } : {}),
      });
      clearPhoneHint();
      if (isAuthIdentityCurrent(id)) useProfileStore.getState().setProfile(saved, id);
    } catch (e) {
      if (isAuthIdentityCurrent(id)) setErr(e instanceof CloudError ? e.message : tr('auth.social.completeFailed'));
    } finally { if (isAuthIdentityCurrent(id)) setBusy(false); }
  };

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="social-complete-title" data-testid="social-complete"
      style={{ position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(20,16,10,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ width: 'min(420px, 100%)', background: t.surface, color: t.text, border: `1px solid ${t.border}`, borderRadius: 12, padding: 22, boxShadow: '0 12px 36px rgba(0,0,0,0.25)' }}>
        <div id="social-complete-title" style={{ fontSize: 17, fontWeight: 800, marginBottom: 6 }}>{tr('auth.social.completeTitle')}</div>
        <div style={{ fontSize: 12.5, color: t.textMuted, lineHeight: 1.6, marginBottom: 16 }}>
          {tr('auth.social.completeIntro', { provider: provider ? tr(`auth.social.name.${provider}`) : '' })}
          {session?.email && <div style={{ marginTop: 4 }}>{tr('auth.social.completeEmail', { email: session.email })}</div>}
        </div>
        <label htmlFor="social-complete-name" style={{ fontSize: 11.5, fontWeight: 700, color: t.textMuted, display: 'block', marginBottom: 5 }}>{tr('auth.signup.fullName')}</label>
        <input id="social-complete-name" data-testid="social-complete-name" value={name} maxLength={100}
          placeholder={tr('auth.signup.fullNamePh')} onChange={(e) => { setName(e.target.value); setErr(null); }}
          onKeyDown={(e) => { if (e.key === 'Enter') void submit(); }}
          style={{ width: '100%', boxSizing: 'border-box', height: 38, padding: '0 10px', borderRadius: 7, border: `1px solid ${t.border}`, background: t.surfaceAlt, color: t.text, fontSize: 13.5, marginBottom: 12 }} />
        {hint && (
          <div data-testid="social-complete-phone-box" style={{ marginBottom: 12 }}>
            <label htmlFor="social-complete-phone" style={{ fontSize: 11.5, fontWeight: 700, color: t.textMuted, display: 'block', marginBottom: 5 }}>{tr('auth.social.phoneLabel')}</label>
            <div style={{ display: 'flex', gap: 6 }}>
              <div style={{ flex: '0 0 auto', height: 38, display: 'flex', alignItems: 'center', padding: '0 10px', borderRadius: 7, border: `1px solid ${t.border}`, background: t.surfaceAlt, color: t.textMuted, fontSize: 13 }}>+{hintDial}</div>
              <input id="social-complete-phone" data-testid="social-complete-phone" value={phone} inputMode="tel" autoComplete="tel"
                onChange={(e) => { setPhone(formatPhone(hintDial, e.target.value)); setErr(null); }}
                style={{ flex: 1, minWidth: 0, boxSizing: 'border-box', height: 38, padding: '0 10px', borderRadius: 7, border: `1px solid ${t.border}`, background: t.surfaceAlt, color: t.text, fontSize: 13.5 }} />
            </div>
            <div style={{ fontSize: 11, color: t.textSubtle, lineHeight: 1.5, marginTop: 4 }}>
              {tr('auth.social.phoneFrom', { provider: tr(`auth.social.name.${hint.provider}`) })}
            </div>
          </div>
        )}
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12, lineHeight: 1.5, cursor: 'pointer', marginBottom: 6 }}>
          <input type="checkbox" data-testid="social-complete-age" checked={ageOk} onChange={(e) => setAgeOk(e.target.checked)} style={{ marginTop: 2 }} />
          <span>{rich(tr('auth.signup.age'))} <span style={{ opacity: 0.7 }}>{tr('auth.signup.ageNote')}</span></span>
        </label>
        <div style={{ fontSize: 11.5, color: t.textSubtle, lineHeight: 1.6, margin: '6px 0 14px' }}>{withLinks(tr('auth.social.completeTerms'), t.primary)}</div>
        {err && <div role="alert" data-testid="social-complete-error" style={{ color: '#d9534f', fontSize: 12, marginBottom: 10 }}>{err}</div>}
        <button type="button" data-testid="social-complete-submit" disabled={!can} onClick={() => void submit()}
          title={!ageOk ? tr('auth.signup.ageHint') : problem ?? undefined}
          style={{ width: '100%', height: 42, borderRadius: 8, border: 'none', background: t.primary, color: '#fff', fontSize: 14, fontWeight: 800, cursor: can ? 'pointer' : 'default', opacity: can ? 1 : 0.5 }}>
          {busy ? tr('auth.signup.submitting') : tr('auth.social.completeSubmit')}
        </button>
        <button type="button" data-testid="social-complete-logout" onClick={() => void useAuthStore.getState().signOut()}
          style={{ width: '100%', height: 36, marginTop: 8, borderRadius: 8, border: `1px solid ${t.border}`, background: t.surfaceAlt, color: t.text, fontSize: 12.5, cursor: 'pointer' }}>
          {tr('auth.social.completeLogout')}
        </button>
      </div>
    </div>
  );
}
