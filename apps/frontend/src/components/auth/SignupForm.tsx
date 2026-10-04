// SignupForm — 회원가입 (2026-08-09 사용자 요청).
//
// 예전에는 로그인 화면에서 이메일·비밀번호만 넣고 [가입]을 누르면 그대로
// 계정이 만들어졌다. 이제 **이메일 인증 + 성명 + 휴대폰번호**를 받는다.
// 요금제는 free — 서버 `users.plan` 기본값이라 따로 보내지 않는다.
//
// 흐름
//   ① 이메일 입력 → [이메일 인증] → 6자리 인증번호가 메일로 간다
//   ② 인증번호 입력 → [확인] → 인증표(emailToken)를 받아 둔다
//   ③ 성명·국가번호+휴대폰·비밀번호 입력 → [가입하기]
//      → GoTrue 로 계정 생성·로그인 → 프로필 저장(인증표 첨부)
//
// **인증을 마쳐야 가입 버튼이 열린다** — 순서를 화면이 강제한다.
// 메일 발송이 아직 설정되지 않은 서버에서는 개발 모드에 한해 인증번호를
// 화면에 보여 주고 그 사실을 밝힌다(운영에서는 나오지 않는다).
//
// 휴대폰은 **국가번호와 번호를 나눠** 받는다 — 글로벌 서비스를 염두에 둔
// 결정이고, 나중에 SMS 인증을 붙일 때 국가를 되짚지 않아도 된다.
// 지금은 저장만 하고 인증은 하지 않는다.

import { useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { ThemeTokens } from '@/components/design-tokens/theme';
import { useAuthStore } from '@/stores/authStore';
import { stashPendingProfile, useProfileStore } from '@/stores/profileStore';
import { nameProblem } from '@/utils/profileName';
import { AuthError } from '@/services/cloud/supabaseAuth';
import { cloudApi, CloudError } from '@/services/cloud/apiClient';
import {
  COUNTRIES, DEFAULT_COUNTRY, countryName, findCountries, formatPhone, type Country,
} from '@/utils/countryCodes';
import { useLang, useTr } from '@/i18n';
import { rich } from '@/i18n/rich';

const MIN_PW = 6; // GoTrue 기본값(GOTRUE_PASSWORD_MIN_LENGTH=6)과 맞춘다

export function SignupForm({
  t, onDone, onCancel,
}: {
  t: ThemeTokens;
  /** 가입이 끝났을 때 (안내 문구 전달) */
  onDone?: (msg: string) => void;
  /** 로그인 화면으로 돌아가기 */
  onCancel?: () => void;
}) {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  /** 인증표 — 이게 있어야 가입할 수 있다 */
  const [emailToken, setEmailToken] = useState<string | null>(null);
  const [codeSent, setCodeSent] = useState(false);
  const [devCode, setDevCode] = useState<string | null>(null);

  const [fullName, setFullName] = useState('');
  const [country, setCountry] = useState<Country>(DEFAULT_COUNTRY);
  const [countryOpen, setCountryOpen] = useState(false);
  const [countryQuery, setCountryQuery] = useState('');
  const [phone, setPhone] = useState('');

  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [showPw, setShowPw] = useState(false);

  // 만 14세 이상 확인. 개인정보 보호법상 만 14세 미만은 법정대리인 동의
  // 없이 가입시킬 수 없고, 우리는 그 절차를 두지 않기로 했다(처리방침 §9).
  // **처리방침에만 적고 화면에 두지 않으면 제품이 지키지 않는 약속이 된다** —
  // 그래서 [가입하기] 를 막는다. 보여주기만 하는 문구가 아니다.
  const [ageOk, setAgeOk] = useState(false);

  const [busy, setBusy] = useState<'code' | 'verify' | 'signup' | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const codeRef = useRef<HTMLInputElement | null>(null);
  const tr = useTr();
  const lang = useLang(); // 나라 이름 검색이 지금 언어를 따르도록

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
  const countryList = useMemo(() => findCountries(countryQuery), [countryQuery, lang]); // eslint-disable-line react-hooks/exhaustive-deps
  const phoneDigits = phone.replace(/\D/g, '');
  const canSubmit =
    !!emailToken && !nameProblem(fullName)
    && pw.length >= MIN_PW && pw === pw2 && ageOk && !busy;

  const fail = (e: unknown, fallback: string) => {
    setErr(e instanceof CloudError || e instanceof AuthError ? e.message : fallback);
  };

  // ① 인증번호 발송
  const sendCode = async () => {
    if (!emailOk) { setErr(tr('auth.signup.badEmail')); return; }
    setBusy('code'); setErr(null); setNote(null); setDevCode(null);
    try {
      const r = await cloudApi.sendEmailCode(email.trim());
      setCodeSent(true);
      // 이미 인증했던 이메일을 고쳤을 수 있다 — 표는 버린다
      setEmailToken(null);
      setCode('');
      if (r.devCode) {
        setDevCode(r.devCode);
        setNote(r.message ?? tr('auth.code.devMode'));
      } else {
        setNote(tr('auth.signup.codeSent', { n: r.expiresInMin }));
      }
      window.setTimeout(() => codeRef.current?.focus(), 50);
    } catch (e) {
      fail(e, tr('auth.code.sendFailed'));
    } finally { setBusy(null); }
  };

  // ② 인증번호 확인
  const verifyCode = async () => {
    if (!code.trim()) { setErr(tr('auth.signup.needCode')); return; }
    setBusy('verify'); setErr(null);
    try {
      const r = await cloudApi.verifyEmailCode(email.trim(), code.trim());
      setEmailToken(r.emailToken);
      setNote(tr('auth.signup.emailVerified'));
    } catch (e) {
      fail(e, tr('auth.code.verifyFailed'));
    } finally { setBusy(null); }
  };

  // ③ 가입
  const submit = async () => {
    if (!emailToken) { setErr(tr('auth.signup.verifyFirst')); return; }
    { const bad = nameProblem(fullName); if (bad) { setErr(bad); return; } }
    if (pw.length < MIN_PW) { setErr(tr('auth.signup.pwTooShort', { n: MIN_PW })); return; }
    if (pw !== pw2) { setErr(tr('auth.signup.pwMismatch')); return; }
    setBusy('signup'); setErr(null);
    try {
      // 계정 생성 + 로그인 (GoTrue). 메일 확인이 켜진 서버면 세션이 없다.
      const signedIn = await useAuthStore.getState().signUp(email.trim(), pw);
      if (!signedIn) {
        // 세션이 없으면 프로필을 지금 저장할 수 없다 — 적어 두었다가 첫
        // 로그인 때 넣는다(profileStore). 예전에는 여기서 성명·휴대폰이 사라졌다.
        stashPendingProfile({
          email: email.trim(),
          fullName: fullName.trim(),
          phoneCountry: phoneDigits ? `+${country.dial}` : undefined,
          phoneNumber: phoneDigits || undefined,
        });
        onDone?.(tr('auth.signup.confirmMailSent'));
        return;
      }
      // 프로필 저장 — 여기서 성명·휴대폰이 계정에 붙는다
      const saved = await cloudApi.saveProfile({
        fullName: fullName.trim(),
        phoneCountry: phoneDigits ? `+${country.dial}` : undefined,
        phoneNumber: phoneDigits || undefined,
        emailToken,
      });
      // 아바타 글자·협업 이름표가 곧바로 새 이름을 쓰게 (세션이 먼저 생겨
      // 프로필 스토어가 빈 성명을 읽어 둔 상태일 수 있다)
      useProfileStore.getState().setProfile(saved);
      onDone?.(tr('auth.signup.done'));
    } catch (e) {
      fail(e, tr('auth.signup.failed'));
    } finally { setBusy(null); }
  };

  // ── 스타일 ──────────────────────────────────────────────────
  const H = 38;
  const input: CSSProperties = {
    width: '100%', boxSizing: 'border-box', height: H, padding: '0 10px',
    borderRadius: 7, border: `1px solid ${t.border}`, background: t.surfaceAlt,
    color: t.text, fontSize: 13.5,
  };
  const label: CSSProperties = {
    fontSize: 11.5, fontWeight: 700, color: t.textMuted,
    margin: '0 0 5px', display: 'block',
  };
  const field: CSSProperties = { marginBottom: 12 };
  const smallBtn: CSSProperties = {
    height: H, padding: '0 12px', borderRadius: 7, cursor: 'pointer',
    border: `1px solid ${t.primaryBorder}`, background: t.primarySoft,
    color: t.primary, fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap',
  };

  return (
    <div data-testid="signup-form">
      <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 6 }}>{tr('auth.signup.title')}</div>
      <div style={{ fontSize: 12.5, color: t.textMuted, lineHeight: 1.6, marginBottom: 18 }}>
        {rich(tr('auth.signup.intro'))}
      </div>

      {/* ① 이메일 + 인증 */}
      <div style={field}>
        <label style={label}>{tr('auth.signup.email')}</label>
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            data-testid="signup-email"
            type="email" value={email} placeholder="name@example.com"
            autoComplete="username"
            disabled={!!emailToken}
            onChange={(e) => { setEmail(e.target.value); setEmailToken(null); setCodeSent(false); }}
            style={{ ...input, flex: 1, opacity: emailToken ? 0.7 : 1 }}
          />
          <button
            data-testid="signup-send-code"
            type="button" onClick={() => void sendCode()}
            disabled={!emailOk || !!emailToken || busy === 'code'}
            style={{
              ...smallBtn,
              opacity: !emailOk || emailToken || busy === 'code' ? 0.55 : 1,
              cursor: !emailOk || emailToken ? 'default' : 'pointer',
            }}
          >{busy === 'code' ? tr('auth.code.sending') : codeSent ? tr('auth.signup.resend') : tr('auth.signup.verifyEmail')}</button>
        </div>
      </div>

      {/* ② 인증번호 — 발송한 뒤에만 보인다 */}
      {codeSent && (
        <div style={field}>
          <label style={label}>{tr('auth.code.label')}</label>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              data-testid="signup-code"
              ref={codeRef}
              value={code} placeholder={tr('auth.code.placeholder')} inputMode="numeric"
              disabled={!!emailToken}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              onKeyDown={(e) => { if (e.key === 'Enter') void verifyCode(); }}
              style={{
                ...input, flex: 1, letterSpacing: 4, fontWeight: 700,
                opacity: emailToken ? 0.7 : 1,
              }}
            />
            <button
              data-testid="signup-verify-code"
              type="button" onClick={() => void verifyCode()}
              disabled={!!emailToken || busy === 'verify'}
              style={{
                ...smallBtn,
                ...(emailToken
                  ? { background: '#22A06B', borderColor: '#22A06B', color: '#fff', cursor: 'default' }
                  : {}),
              }}
            >{emailToken ? tr('auth.signup.verified') : busy === 'verify' ? tr('auth.signup.verifying') : tr('common.ok')}</button>
          </div>
          {/* 메일 발송이 아직 설정되지 않은 서버 — 개발 모드에서만 */}
          {devCode && !emailToken && (
            <div data-testid="signup-dev-code" style={{
              marginTop: 6, padding: '7px 10px', borderRadius: 6,
              background: t.surfaceAlt, border: `1px dashed ${t.borderStrong}`,
              fontSize: 11.5, color: t.textMuted,
            }}>
              {tr('auth.signup.devCode')}{' '}
              <b style={{ color: t.primary, fontSize: 14, letterSpacing: 2 }}>{devCode}</b>
            </div>
          )}
        </div>
      )}

      {/* ③ 성명 */}
      <div style={field}>
        <label style={label}>{tr('auth.signup.fullName')}</label>
        <input
          data-testid="signup-name"
          value={fullName} placeholder={tr('auth.signup.fullNamePh')} autoComplete="name"
          onChange={(e) => setFullName(e.target.value)}
          style={input}
        />
      </div>

      {/* ④ 휴대폰 — 국가번호 + 번호 */}
      <div style={{ ...field, position: 'relative' }}>
        <label style={label}>
          {tr('auth.signup.phone')} <span style={{ fontWeight: 500, color: t.textSubtle }}>{tr('auth.signup.optional')}</span>
        </label>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            data-testid="signup-country"
            type="button"
            onClick={() => { setCountryOpen((v) => !v); setCountryQuery(''); }}
            style={{
              ...input, width: 118, flexShrink: 0, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6, textAlign: 'left',
            }}
          >
            <span style={{ fontSize: 15 }}>{country.flag}</span>
            <span style={{ flex: 1, fontWeight: 600 }}>+{country.dial}</span>
            <span style={{ color: t.textSubtle, fontSize: 10 }}>▼</span>
          </button>
          <input
            data-testid="signup-phone"
            value={phone} placeholder="010-1234-5678" inputMode="tel" autoComplete="tel"
            onChange={(e) => setPhone(formatPhone(country.dial, e.target.value))}
            style={{ ...input, flex: 1 }}
          />
        </div>
        {countryOpen && (
          <div
            data-testid="signup-country-list"
            style={{
              position: 'absolute', zIndex: 20, top: 64, left: 0, width: 260,
              maxHeight: 260, overflowY: 'auto', borderRadius: 8,
              background: t.surface, border: `1px solid ${t.borderStrong}`,
              boxShadow: '0 12px 30px rgba(0,0,0,0.18)', padding: 6,
            }}
          >
            <input
              autoFocus
              value={countryQuery}
              onChange={(e) => setCountryQuery(e.target.value)}
              placeholder={tr('auth.signup.countrySearch')}
              style={{ ...input, height: 30, fontSize: 12, marginBottom: 4 }}
            />
            {countryList.length === 0 && (
              <div style={{ padding: '8px 6px', fontSize: 11.5, color: t.textSubtle }}>
                {tr('auth.signup.noCountry')}
              </div>
            )}
            {countryList.map((c) => (
              <button
                key={c.iso}
                type="button"
                className="mm-list-row"
                onClick={() => {
                  setCountry(c);
                  setCountryOpen(false);
                  setPhone((p) => formatPhone(c.dial, p));
                }}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                  padding: '6px 8px', border: 'none', background: 'transparent',
                  color: t.text, cursor: 'pointer', fontSize: 12.5, borderRadius: 6,
                  ['--row-hover' as string]: t.primarySoft,
                }}
              >
                <span style={{ fontSize: 15 }}>{c.flag}</span>
                <span style={{ flex: 1, textAlign: 'left' }}>{countryName(c)}</span>
                <span style={{ color: t.textMuted, fontWeight: 600 }}>+{c.dial}</span>
              </button>
            ))}
          </div>
        )}
        <div style={{ fontSize: 10.5, color: t.textSubtle, marginTop: 5, lineHeight: 1.5 }}>
          {tr('auth.signup.phoneNote')}
        </div>
      </div>

      {/* ⑤ 비밀번호 */}
      <div style={field}>
        <label style={label}>{tr('auth.field.password')} <span style={{ fontWeight: 500, color: t.textSubtle }}>{tr('auth.signup.pwMin', { n: MIN_PW })}</span></label>
        <div style={{ position: 'relative' }}>
          <input
            data-testid="signup-password"
            type={showPw ? 'text' : 'password'} value={pw} autoComplete="new-password"
            onChange={(e) => setPw(e.target.value)}
            style={{ ...input, paddingRight: 36 }}
          />
          <button
            type="button"
            data-testid="signup-pw-toggle"
            onClick={() => setShowPw((v) => !v)}
            title={showPw ? tr('auth.pw.hide') : tr('auth.pw.show')}
            style={{
              position: 'absolute', right: 4, top: (H - 26) / 2,
              width: 30, height: 26, padding: 0, border: 'none',
              background: 'transparent', cursor: 'pointer',
              color: showPw ? t.primary : t.textSubtle,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="1.8"
              strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" />
              <circle cx="12" cy="12" r="3" />
              {!showPw && <line x1="4" y1="4" x2="20" y2="20" />}
            </svg>
          </button>
        </div>
      </div>
      <div style={field}>
        <label style={label}>{tr('auth.signup.pwConfirm')}</label>
        <input
          data-testid="signup-password2"
          type={showPw ? 'text' : 'password'} value={pw2} autoComplete="new-password"
          onChange={(e) => setPw2(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && canSubmit) void submit(); }}
          style={{
            ...input,
            borderColor: pw2 && pw !== pw2 ? '#d9534f' : t.border,
          }}
        />
        {pw2 && pw !== pw2 && (
          <div style={{ color: '#d9534f', fontSize: 11.5, marginTop: 4 }}>
            {tr('auth.signup.pwMismatch')}
          </div>
        )}
      </div>

      {err && (
        <div data-testid="signup-error"
          style={{ color: '#d9534f', fontSize: 12, marginBottom: 10, lineHeight: 1.5 }}>
          {err}
        </div>
      )}
      {note && !err && (
        <div data-testid="signup-note"
          style={{ color: t.primary, fontSize: 12, marginBottom: 10, lineHeight: 1.5 }}>
          {note}
        </div>
      )}

      <label
        data-testid="signup-age-check"
        style={{
          display: 'flex', alignItems: 'flex-start', gap: 8,
          margin: '2px 0 12px', fontSize: 12, lineHeight: 1.5,
          color: t.text, cursor: 'pointer',
        }}
      >
        <input
          type="checkbox"
          checked={ageOk}
          onChange={(e) => setAgeOk(e.target.checked)}
          style={{ marginTop: 2, cursor: 'pointer' }}
        />
        <span>
          {rich(tr('auth.signup.age'))}{' '}
          <span style={{ opacity: 0.7 }}>
            {tr('auth.signup.ageNote')}
          </span>
        </span>
      </label>

      <button
        data-testid="signup-submit"
        onClick={() => void submit()}
        disabled={!canSubmit}
        title={
          !emailToken ? tr('auth.signup.verifyFirstHint')
            : !ageOk ? tr('auth.signup.ageHint')
              : undefined
        }
        style={{
          width: '100%', height: 42, borderRadius: 8, border: 'none',
          background: t.primary, color: '#fff', fontSize: 14, fontWeight: 800,
          cursor: canSubmit ? 'pointer' : 'default', opacity: canSubmit ? 1 : 0.5,
        }}
      >{busy === 'signup' ? tr('auth.signup.submitting') : tr('auth.signup.submit')}</button>

      {/* 돌아가는 길 — **버튼으로 보여야 한다** (2026-08-11 사용자 지적).
          테두리도 배경도 없으면 안내문으로 읽혀, 누를 수 있다는 것을
          모른다. 문구도 "이미 계정이 있습니다 — 로그인"은 상태 설명에
          가까웠다. 지금 화면에서 **무엇을 하는 버튼인지**로 바꾼다. */}
      <button
        data-testid="signup-cancel"
        type="button" onClick={onCancel}
        style={{
          width: '100%', height: 38, marginTop: 10, borderRadius: 8,
          border: `1px solid ${t.border}`, background: t.surfaceAlt,
          color: t.text, fontSize: 13, fontWeight: 600, cursor: 'pointer',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = t.surface; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = t.surfaceAlt; }}
      >{tr('auth.backToLogin')}</button>

      <div style={{ fontSize: 10.5, color: t.textSubtle, marginTop: 10, lineHeight: 1.6 }}>
        {tr('auth.signup.countryNote', { n: COUNTRIES.length })}
      </div>
    </div>
  );
}
