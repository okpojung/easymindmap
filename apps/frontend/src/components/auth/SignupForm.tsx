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
import { AuthError } from '@/services/cloud/supabaseAuth';
import { cloudApi, CloudError } from '@/services/cloud/apiClient';
import {
  COUNTRIES, DEFAULT_COUNTRY, findCountries, formatPhone, type Country,
} from '@/utils/countryCodes';

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

  const [busy, setBusy] = useState<'code' | 'verify' | 'signup' | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const codeRef = useRef<HTMLInputElement | null>(null);

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
  const countryList = useMemo(() => findCountries(countryQuery), [countryQuery]);
  const phoneDigits = phone.replace(/\D/g, '');
  const canSubmit =
    !!emailToken && fullName.trim().length > 0
    && pw.length >= MIN_PW && pw === pw2 && !busy;

  const fail = (e: unknown, fallback: string) => {
    setErr(e instanceof CloudError || e instanceof AuthError ? e.message : fallback);
  };

  // ① 인증번호 발송
  const sendCode = async () => {
    if (!emailOk) { setErr('올바른 이메일 주소를 입력해 주세요.'); return; }
    setBusy('code'); setErr(null); setNote(null); setDevCode(null);
    try {
      const r = await cloudApi.sendEmailCode(email.trim());
      setCodeSent(true);
      // 이미 인증했던 이메일을 고쳤을 수 있다 — 표는 버린다
      setEmailToken(null);
      setCode('');
      if (r.devCode) {
        setDevCode(r.devCode);
        setNote(r.message ?? '개발 모드 — 아래 번호를 입력하세요.');
      } else {
        setNote(`인증번호를 보냈습니다. ${r.expiresInMin}분 안에 입력해 주세요.`);
      }
      window.setTimeout(() => codeRef.current?.focus(), 50);
    } catch (e) {
      fail(e, '인증번호를 보내지 못했습니다.');
    } finally { setBusy(null); }
  };

  // ② 인증번호 확인
  const verifyCode = async () => {
    if (!code.trim()) { setErr('인증번호를 입력해 주세요.'); return; }
    setBusy('verify'); setErr(null);
    try {
      const r = await cloudApi.verifyEmailCode(email.trim(), code.trim());
      setEmailToken(r.emailToken);
      setNote('이메일 인증을 마쳤습니다.');
    } catch (e) {
      fail(e, '인증번호를 확인하지 못했습니다.');
    } finally { setBusy(null); }
  };

  // ③ 가입
  const submit = async () => {
    if (!emailToken) { setErr('먼저 이메일 인증을 마쳐 주세요.'); return; }
    if (!fullName.trim()) { setErr('성명을 입력해 주세요.'); return; }
    if (pw.length < MIN_PW) { setErr(`비밀번호는 ${MIN_PW}자 이상이어야 합니다.`); return; }
    if (pw !== pw2) { setErr('비밀번호가 서로 다릅니다.'); return; }
    setBusy('signup'); setErr(null);
    try {
      // 계정 생성 + 로그인 (GoTrue). 메일 확인이 켜진 서버면 세션이 없다.
      const signedIn = await useAuthStore.getState().signUp(email.trim(), pw);
      if (!signedIn) {
        onDone?.('가입 확인 메일을 보냈습니다. 메일함에서 확인한 뒤 로그인해 주세요.');
        return;
      }
      // 프로필 저장 — 여기서 성명·휴대폰이 계정에 붙는다
      await cloudApi.saveProfile({
        fullName: fullName.trim(),
        phoneCountry: phoneDigits ? `+${country.dial}` : undefined,
        phoneNumber: phoneDigits || undefined,
        emailToken,
      });
      onDone?.('가입했습니다. (무료 요금제로 시작합니다)');
    } catch (e) {
      fail(e, '가입 중 오류가 발생했습니다.');
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
      <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 6 }}>회원가입</div>
      <div style={{ fontSize: 12.5, color: t.textMuted, lineHeight: 1.6, marginBottom: 18 }}>
        이메일 인증을 마치면 <b>무료 요금제</b>로 시작합니다.
      </div>

      {/* ① 이메일 + 인증 */}
      <div style={field}>
        <label style={label}>이메일 주소</label>
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
          >{busy === 'code' ? '보내는 중…' : codeSent ? '재발송' : '이메일 인증'}</button>
        </div>
      </div>

      {/* ② 인증번호 — 발송한 뒤에만 보인다 */}
      {codeSent && (
        <div style={field}>
          <label style={label}>인증번호</label>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              data-testid="signup-code"
              ref={codeRef}
              value={code} placeholder="6자리 숫자" inputMode="numeric"
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
            >{emailToken ? '인증 완료 ✓' : busy === 'verify' ? '확인 중…' : '확인'}</button>
          </div>
          {/* 메일 발송이 아직 설정되지 않은 서버 — 개발 모드에서만 */}
          {devCode && !emailToken && (
            <div data-testid="signup-dev-code" style={{
              marginTop: 6, padding: '7px 10px', borderRadius: 6,
              background: t.surfaceAlt, border: `1px dashed ${t.borderStrong}`,
              fontSize: 11.5, color: t.textMuted,
            }}>
              메일 발송이 설정되지 않아 화면에 표시합니다 —{' '}
              <b style={{ color: t.primary, fontSize: 14, letterSpacing: 2 }}>{devCode}</b>
            </div>
          )}
        </div>
      )}

      {/* ③ 성명 */}
      <div style={field}>
        <label style={label}>성명</label>
        <input
          data-testid="signup-name"
          value={fullName} placeholder="홍길동" autoComplete="name"
          onChange={(e) => setFullName(e.target.value)}
          style={input}
        />
      </div>

      {/* ④ 휴대폰 — 국가번호 + 번호 */}
      <div style={{ ...field, position: 'relative' }}>
        <label style={label}>
          휴대폰번호 <span style={{ fontWeight: 500, color: t.textSubtle }}>(선택)</span>
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
              placeholder="나라 이름 또는 번호"
              style={{ ...input, height: 30, fontSize: 12, marginBottom: 4 }}
            />
            {countryList.length === 0 && (
              <div style={{ padding: '8px 6px', fontSize: 11.5, color: t.textSubtle }}>
                찾는 나라가 없습니다.
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
                <span style={{ flex: 1, textAlign: 'left' }}>{c.name}</span>
                <span style={{ color: t.textMuted, fontWeight: 600 }}>+{c.dial}</span>
              </button>
            ))}
          </div>
        )}
        <div style={{ fontSize: 10.5, color: t.textSubtle, marginTop: 5, lineHeight: 1.5 }}>
          휴대폰 인증은 준비 중입니다 — 지금은 번호만 저장합니다.
        </div>
      </div>

      {/* ⑤ 비밀번호 */}
      <div style={field}>
        <label style={label}>비밀번호 <span style={{ fontWeight: 500, color: t.textSubtle }}>({MIN_PW}자 이상)</span></label>
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
            title={showPw ? '비밀번호 숨기기' : '비밀번호 표시'}
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
        <label style={label}>비밀번호 확인</label>
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
            비밀번호가 서로 다릅니다.
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

      <button
        data-testid="signup-submit"
        onClick={() => void submit()}
        disabled={!canSubmit}
        title={emailToken ? undefined : '먼저 이메일 인증을 마쳐 주세요'}
        style={{
          width: '100%', height: 42, borderRadius: 8, border: 'none',
          background: t.primary, color: '#fff', fontSize: 14, fontWeight: 800,
          cursor: canSubmit ? 'pointer' : 'default', opacity: canSubmit ? 1 : 0.5,
        }}
      >{busy === 'signup' ? '가입하는 중…' : '가입하기'}</button>

      <button
        data-testid="signup-cancel"
        type="button" onClick={onCancel}
        style={{
          width: '100%', height: 34, marginTop: 8, borderRadius: 8,
          border: 'none', background: 'transparent', color: t.textMuted,
          fontSize: 12.5, cursor: 'pointer',
        }}
      >이미 계정이 있습니다 — 로그인</button>

      <div style={{ fontSize: 10.5, color: t.textSubtle, marginTop: 10, lineHeight: 1.6 }}>
        국가번호는 {COUNTRIES.length}개국을 고를 수 있습니다. 목록에서 나라 이름이나
        번호로 찾을 수 있습니다.
      </div>
    </div>
  );
}
