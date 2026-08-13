// 비밀번호 재설정 — **로그인하지 못하는 사람**을 위한 길 (2026-08-13 요청).
//
//   ① 이메일 → 인증번호 메일
//   ② 인증번호 확인 → 재설정표(30분)
//   ③ 새 비밀번호 → GoTrue 에서 교체
//
// 로그인 상태의 '비밀번호 변경'(ChangePasswordForm)과 **다른 화면**이다.
// 그쪽은 액세스 토큰으로 자기 것을 바꾸고, 이쪽은 토큰이 없어 서버가
// 관리자 권한으로 바꾼다. 섞으면 "누구의 비밀번호를 바꾸는가"가 흐려진다.
//
// ⚠️ **계정이 있는지 알려 주지 않는다.** ①의 응답이 계정 유무에 따라
// 달라지면 아무나 가입된 주소를 알아낼 수 있다 — 서버도 같은 규칙이다.

import { useState } from 'react';
import type { CSSProperties } from 'react';
import type { ThemeTokens } from '@/components/design-tokens/theme';
import { cloudApi, CloudError } from '@/services/cloud/apiClient';

const MIN_PW = 6;

export function ResetPasswordForm({ t, onCancel, onDone }: {
  t: ThemeTokens;
  onCancel: () => void;
  /** 다 바꾼 뒤 로그인 화면으로 (안내 문구를 들고 간다) */
  onDone: (msg: string) => void;
}) {
  const [step, setStep] = useState<'email' | 'code' | 'password'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [show, setShow] = useState(false);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
  const fail = (e: unknown, f: string) =>
    setErr(e instanceof CloudError ? e.message : f);

  const send = async () => {
    setBusy(true); setErr(null); setNote(null); setDevCode(null);
    try {
      const r = await cloudApi.resetStart(email.trim());
      setStep('code');
      setDevCode(r.devCode ?? null);
      setNote(r.devCode
        ? (r.message ?? '개발 모드 — 아래 번호를 입력하세요.')
        : `가입된 계정이라면 인증번호를 보냈습니다. ${r.expiresInMin}분 안에 입력해 주세요.`);
    } catch (e) { fail(e, '인증번호를 보내지 못했습니다.'); } finally { setBusy(false); }
  };

  const verify = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await cloudApi.resetVerify(email.trim(), code.trim());
      setResetToken(r.resetToken);
      setStep('password');
      setNote('본인 확인을 마쳤습니다. 새 비밀번호를 정해 주세요.');
    } catch (e) { fail(e, '인증번호를 확인하지 못했습니다.'); } finally { setBusy(false); }
  };

  const confirm = async () => {
    setBusy(true); setErr(null);
    try {
      await cloudApi.resetConfirm(resetToken, pw);
      onDone('비밀번호를 바꿨습니다. 새 비밀번호로 로그인해 주세요.');
    } catch (e) { fail(e, '비밀번호를 바꾸지 못했습니다.'); } finally { setBusy(false); }
  };

  const input: CSSProperties = {
    width: '100%', boxSizing: 'border-box', height: 38, padding: '0 10px',
    borderRadius: 7, border: `1px solid ${t.border}`, background: t.surfaceAlt,
    color: t.text, fontSize: 13.5,
  };
  const label: CSSProperties = {
    fontSize: 11.5, fontWeight: 700, color: t.textMuted, margin: '0 0 5px', display: 'block',
  };
  const primary: CSSProperties = {
    width: '100%', height: 42, borderRadius: 8, border: 'none',
    background: t.primary, color: '#fff', fontSize: 14, fontWeight: 800, cursor: 'pointer',
  };

  const canConfirm = pw.length >= MIN_PW && pw === pw2 && !busy;

  return (
    <div data-testid="reset-form">
      <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 6 }}>비밀번호 재설정</div>
      <div style={{ fontSize: 12.5, color: t.textMuted, lineHeight: 1.6, marginBottom: 18 }}>
        {step === 'email' && '① 가입한 이메일로 인증번호를 보내 드립니다.'}
        {step === 'code' && '② 메일로 받은 인증번호를 입력하세요.'}
        {step === 'password' && '③ 새 비밀번호를 정해 주세요.'}
      </div>

      {step === 'email' && (
        <>
          <label style={label} htmlFor="reset-email">아이디 (이메일)</label>
          <input
            id="reset-email" data-testid="reset-email" style={input}
            type="email" autoComplete="username" placeholder="name@example.com"
            value={email} autoFocus
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && emailOk && !busy) void send(); }}
          />
          <button
            data-testid="reset-send" disabled={!emailOk || busy} onClick={() => void send()}
            style={{ ...primary, marginTop: 12, opacity: !emailOk || busy ? 0.5 : 1 }}
          >{busy ? '보내는 중…' : '인증번호 받기'}</button>
        </>
      )}

      {step === 'code' && (
        <>
          <label style={label} htmlFor="reset-code">인증번호</label>
          <input
            id="reset-code" data-testid="reset-code"
            style={{ ...input, letterSpacing: 4, fontSize: 16 }}
            placeholder="6자리 숫자" inputMode="numeric" autoFocus value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            onKeyDown={(e) => { if (e.key === 'Enter' && code.length >= 4 && !busy) void verify(); }}
          />
          {devCode && (
            <div data-testid="reset-dev-code" style={{ fontSize: 12, color: t.warning, marginTop: 8 }}>
              개발 모드 인증번호: <b>{devCode}</b>
            </div>
          )}
          <button
            data-testid="reset-verify" disabled={code.length < 4 || busy} onClick={() => void verify()}
            style={{ ...primary, marginTop: 12, opacity: code.length < 4 || busy ? 0.5 : 1 }}
          >{busy ? '확인하는 중…' : '확인'}</button>
        </>
      )}

      {step === 'password' && (
        <>
          <label style={label} htmlFor="reset-pw">새 비밀번호 ({MIN_PW}자 이상)</label>
          <div style={{ position: 'relative' }}>
            <input
              id="reset-pw" data-testid="reset-pw" style={{ ...input, paddingRight: 36 }}
              type={show ? 'text' : 'password'} autoComplete="new-password" autoFocus
              value={pw} onChange={(e) => setPw(e.target.value)}
            />
            <button
              data-testid="reset-pw-toggle" type="button" onClick={() => setShow((v) => !v)}
              title={show ? '숨기기' : '보기'}
              style={{
                position: 'absolute', right: 6, top: 6, width: 26, height: 26,
                borderRadius: 6, border: 'none', background: 'transparent',
                color: t.textSubtle, cursor: 'pointer', fontSize: 13,
              }}
            >{show ? '🙈' : '👁'}</button>
          </div>
          <label style={{ ...label, marginTop: 12 }} htmlFor="reset-pw2">새 비밀번호 확인</label>
          <input
            id="reset-pw2" data-testid="reset-pw2"
            style={{ ...input, borderColor: pw2 && pw !== pw2 ? t.danger : t.border }}
            type={show ? 'text' : 'password'} autoComplete="new-password"
            value={pw2} onChange={(e) => setPw2(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && canConfirm) void confirm(); }}
          />
          {pw2 && pw !== pw2 && (
            <div style={{ fontSize: 11.5, color: t.danger, marginTop: 4 }}>
              두 번 입력한 비밀번호가 다릅니다.
            </div>
          )}
          <button
            data-testid="reset-confirm" disabled={!canConfirm} onClick={() => void confirm()}
            style={{ ...primary, marginTop: 12, opacity: canConfirm ? 1 : 0.5 }}
          >{busy ? '바꾸는 중…' : '비밀번호 바꾸기'}</button>
        </>
      )}

      {note && !err && (
        <div data-testid="reset-note" style={{
          marginTop: 12, fontSize: 12, color: t.primary, lineHeight: 1.6,
        }}>{note}</div>
      )}
      {err && (
        <div data-testid="reset-error" style={{
          marginTop: 12, fontSize: 12, color: t.danger, lineHeight: 1.6,
        }}>{err}</div>
      )}

      <button
        data-testid="reset-cancel" type="button" onClick={onCancel}
        style={{
          width: '100%', height: 38, marginTop: 10, borderRadius: 8,
          border: `1px solid ${t.border}`, background: t.surfaceAlt,
          color: t.text, fontSize: 13, fontWeight: 600, cursor: 'pointer',
        }}
      >로그인 화면으로 돌아가기</button>
    </div>
  );
}
