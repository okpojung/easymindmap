// 비밀번호 변경 폼 — **두 곳이 같은 것을 쓴다** (2026-08-13 사용자 요청).
//   · 일반 앱  : 우상단 아바타 메뉴 → 비밀번호 변경
//   · 관리자   : 관리자 콘솔 → 비밀번호 탭
//
// 한 벌로 두는 이유: 최소 길이·확인 입력·오류 문구가 두 곳에서 갈리면
// 어느 쪽이 맞는지 알 수 없게 된다.
//
// **지금 로그인한 사람의 것만** 바뀐다(GoTrue 가 액세스 토큰의 주인을
// 본다). 남의 비밀번호를 관리자가 바꾸는 기능은 **일부러 만들지
// 않았다** — 계정 탈취 통로가 되고, 필요하면 사용자에게 재설정 메일을
// 보내는 쪽이 맞다(재설정 메일은 아직 없다).

import { useState } from 'react';
import type React from 'react';
import type { ThemeTokens } from '@/components/design-tokens/theme';
import { getFreshAccessToken } from '@/stores/authStore';
import { AuthError, supabaseAuth } from '@/services/cloud/supabaseAuth';

const MIN_PW = 6; // GoTrue GOTRUE_PASSWORD_MIN_LENGTH 와 맞춘다

export function ChangePasswordForm({ t, email, note }: {
  t: ThemeTokens;
  email: string;
  /** 화면마다 다른 안내 한 줄 (관리자 콘솔은 "별도 비밀번호가 없다"를 밝힌다) */
  note?: React.ReactNode;
}) {
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const canSubmit = pw.length >= MIN_PW && pw === pw2 && !busy;

  const submit = async () => {
    setBusy(true); setErr(null); setDone(false);
    try {
      // 1단계 로그인의 세션을 그대로 쓴다 — 만료됐으면 갱신된다
      const token = await getFreshAccessToken();
      if (!token) throw new AuthError(401, '세션이 만료되었습니다. 다시 로그인해 주세요.');
      await supabaseAuth.updatePassword(token, pw);
      setPw(''); setPw2(''); setDone(true);
    } catch (e) {
      setErr(e instanceof AuthError ? e.message : '비밀번호를 바꾸지 못했습니다.');
    } finally { setBusy(false); }
  };

  const input = {
    width: '100%', boxSizing: 'border-box' as const, height: 38, padding: '0 10px',
    borderRadius: 7, border: `1px solid ${t.border}`, background: t.surfaceAlt,
    color: t.text, fontSize: 13.5,
  };
  const label = {
    fontSize: 11.5, fontWeight: 700, color: t.textMuted,
    margin: '0 0 5px', display: 'block' as const,
  };

  return (
    <div data-testid="change-password-form" style={{ maxWidth: 420 }}>
      <div style={{
        fontSize: 12.5, color: t.textMuted, lineHeight: 1.8, marginBottom: 16,
        padding: '10px 12px', borderRadius: 8,
        background: t.surfaceAlt, border: `1px solid ${t.border}`,
      }}>
        <b>{email}</b> 의 비밀번호를 바꿉니다.
        {note && <><br />{note}</>}
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={label} htmlFor="change-pw">새 비밀번호 ({MIN_PW}자 이상)</label>
        <div style={{ position: 'relative' }}>
          <input
            id="change-pw" data-testid="change-pw"
            style={{ ...input, paddingRight: 36 }}
            type={show ? 'text' : 'password'} autoComplete="new-password"
            value={pw} onChange={(e) => { setPw(e.target.value); setDone(false); setErr(null); }}
          />
          <button
            data-testid="change-pw-toggle" type="button" onClick={() => setShow((v) => !v)}
            title={show ? '숨기기' : '보기'}
            style={{
              position: 'absolute', right: 6, top: 6, width: 26, height: 26,
              borderRadius: 6, border: 'none', background: 'transparent',
              color: t.textSubtle, cursor: 'pointer', fontSize: 13,
            }}
          >{show ? '🙈' : '👁'}</button>
        </div>
      </div>

      <div style={{ marginBottom: 14 }}>
        <label style={label} htmlFor="change-pw2">새 비밀번호 확인</label>
        <input
          id="change-pw2" data-testid="change-pw2"
          style={{
            ...input,
            borderColor: pw2 && pw !== pw2 ? t.danger : t.border,
          }}
          type={show ? 'text' : 'password'} autoComplete="new-password"
          value={pw2} onChange={(e) => { setPw2(e.target.value); setDone(false); setErr(null); }}
          onKeyDown={(e) => { if (e.key === 'Enter' && canSubmit) void submit(); }}
        />
        {pw2 && pw !== pw2 && (
          <div style={{ fontSize: 11.5, color: t.danger, marginTop: 4 }}>
            두 번 입력한 비밀번호가 다릅니다.
          </div>
        )}
      </div>

      <button
        data-testid="change-pw-submit" disabled={!canSubmit} onClick={() => void submit()}
        style={{
          width: '100%', height: 42, borderRadius: 8, border: 'none',
          background: t.primary, color: '#fff', fontSize: 14, fontWeight: 800,
          cursor: canSubmit ? 'pointer' : 'default', opacity: canSubmit ? 1 : 0.5,
        }}
      >{busy ? '바꾸는 중…' : '비밀번호 바꾸기'}</button>

      {done && (
        <div data-testid="change-pw-done" style={{
          marginTop: 12, fontSize: 12.5, color: t.primary, lineHeight: 1.7,
        }}>
          바꿨습니다. <b>다음 로그인부터 새 비밀번호</b>를 씁니다 — 지금 열린
          창은 그대로 쓰셔도 됩니다.
        </div>
      )}
      {err && (
        <div data-testid="change-pw-error" style={{
          marginTop: 12, fontSize: 12.5, color: t.danger, lineHeight: 1.7,
        }}>{err}</div>
      )}
    </div>
  );
}
