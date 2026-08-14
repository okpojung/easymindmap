// 관리자 로그인 — **2단계** (2026-08-13 사용자 지시).
//
//   ① 이메일 + 비밀번호 → GoTrue 로 **직접** 로그인한다.
//      비밀번호가 우리 API 를 지나가지 않는다.
//   ② 그 세션으로 인증번호를 받아 확인 → 관리자 표(8시간)
//
// **①만으로는 아무것도 못 한다.** 관리자 API 는 전부 ②의 표를 요구한다.
// 관리자가 아닌 계정은 ①은 되지만 ②에서 "관리자 계정이 아닙니다"로 막힌다
// — 관리자 명단은 알려 주지 않는다.

import { useState } from 'react';
import type { ThemeTokens } from '@/components/design-tokens/theme';
import { useAuthStore } from '@/stores/authStore';
import { AuthError } from '@/services/cloud/supabaseAuth';
import { CloudError } from '@/services/cloud/apiClient';
import { adminApi, adminToken } from '@/services/cloud/adminApi';
import { EnvBadge } from './EnvBadge';

export function AdminLogin({ t, onDone }: { t: ThemeTokens; onDone: (email: string) => void }) {
  const [step, setStep] = useState<'password' | 'code'>('password');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);

  const fail = (e: unknown, fallback: string) =>
    setErr(e instanceof CloudError || e instanceof AuthError ? e.message : fallback);

  const doPassword = async () => {
    setBusy(true); setErr(null); setNote(null);
    try {
      await useAuthStore.getState().signIn(email.trim(), pw);
      const r = await adminApi.loginStart();
      setStep('code');
      setDevCode(r.devCode ?? null);
      setNote(r.devCode
        ? (r.message ?? '개발 모드 — 아래 번호를 입력하세요.')
        : `인증번호를 ${r.email} 로 보냈습니다. ${r.expiresInMin}분 안에 입력해 주세요.`);
    } catch (e) {
      // 관리자가 아니면 여기서 끊긴다 — 로그인 세션은 남지만 표는 못 받는다
      fail(e, '로그인하지 못했습니다.');
    } finally { setBusy(false); }
  };

  const doCode = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await adminApi.loginVerify(code.trim());
      adminToken.set(r.adminToken);
      onDone(r.email);
    } catch (e) {
      fail(e, '인증번호를 확인하지 못했습니다.');
    } finally { setBusy(false); }
  };

  const input = {
    width: '100%', boxSizing: 'border-box' as const, height: 38, padding: '0 10px',
    borderRadius: 7, border: `1px solid ${t.border}`, background: t.surfaceAlt,
    color: t.text, fontSize: 13.5,
  };
  // **라벨을 붙인다** (2026-08-13 사용자 지적: "아이디 밑의 란은 무엇인가?").
  // placeholder 만 두면 브라우저 자동완성이 채우는 순간 사라져, 그 칸이
  // 무엇인지 알 방법이 없어진다. 가입 화면과 같은 규칙으로 맞춘다.
  const label = {
    fontSize: 11.5, fontWeight: 700, color: t.textMuted,
    margin: '0 0 5px', display: 'block' as const,
  };
  const field = { marginBottom: 12 };

  return (
    // 로그인 카드도 같은 이유로 자기 안에서 구른다 — 창이 낮으면
    // (노트북 + 브라우저 개발자도구 등) 카드 아래가 잘려 버튼을 못 누른다.
    // `alignItems: center` 는 넘칠 때 **위쪽을 잘라먹으므로** 쓰지 않고,
    // 여백으로 가운데에 놓는다.
    <div style={{
      height: '100vh', overflowY: 'auto', background: t.bg, color: t.text,
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
      padding: '20px 20px 40px',
    }}>
      <div style={{ margin: 'auto 0' }}>
      <div data-testid="admin-login" style={{
        width: 'min(380px, 94vw)', background: t.surface, borderRadius: 12,
        border: `1px solid ${t.border}`, padding: 24, boxShadow: t.shadowLg,
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4,
        }}>
          <div style={{ fontSize: 19, fontWeight: 800 }}>EasyMindMap 관리자</div>
          <EnvBadge />
        </div>
        <div style={{ fontSize: 12, color: t.textMuted, marginBottom: 18, lineHeight: 1.6 }}>
          {step === 'password'
            ? '① 계정 확인 — 이메일과 비밀번호를 입력하세요.'
            : '② 본인 확인 — 메일로 받은 인증번호를 입력하세요.'}
        </div>

        {step === 'password' ? (
          <>
            <div style={field}>
              <label style={label} htmlFor="admin-email">아이디 (이메일)</label>
              <input
                id="admin-email" data-testid="admin-email" style={input}
                type="email" autoComplete="username"
                placeholder="name@example.com" value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div style={field}>
              <label style={label} htmlFor="admin-password">비밀번호</label>
              <div style={{ position: 'relative' }}>
                <input
                  id="admin-password" data-testid="admin-password"
                  style={{ ...input, paddingRight: 36 }}
                  type={showPw ? 'text' : 'password'} autoComplete="current-password"
                  placeholder="비밀번호" value={pw}
                  onChange={(e) => setPw(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !busy) void doPassword(); }}
                />
                {/* 자동완성이 채운 값이 맞는지 눈으로 확인할 길을 둔다 */}
                <button
                  data-testid="admin-pw-toggle" type="button"
                  onClick={() => setShowPw((v) => !v)}
                  title={showPw ? '숨기기' : '보기'}
                  style={{
                    position: 'absolute', right: 6, top: 6, width: 26, height: 26,
                    borderRadius: 6, border: 'none', background: 'transparent',
                    color: t.textSubtle, cursor: 'pointer', fontSize: 13,
                  }}
                >{showPw ? '🙈' : '👁'}</button>
              </div>
            </div>
            <button
              data-testid="admin-next" disabled={busy || !email.trim() || !pw}
              onClick={() => void doPassword()}
              style={{
                width: '100%', height: 42, borderRadius: 8, border: 'none',
                background: t.primary, color: '#fff', fontSize: 14, fontWeight: 800,
                cursor: busy ? 'default' : 'pointer',
                opacity: busy || !email.trim() || !pw ? 0.5 : 1,
              }}
            >{busy ? '확인하는 중…' : '다음 — 인증번호 받기'}</button>
          </>
        ) : (
          <>
            <div style={field}>
              <label style={label} htmlFor="admin-code">인증번호</label>
              <input
                id="admin-code" data-testid="admin-code"
                style={{ ...input, letterSpacing: 4, fontSize: 16 }}
                placeholder="6자리 숫자" inputMode="numeric" autoFocus value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                onKeyDown={(e) => { if (e.key === 'Enter' && !busy) void doCode(); }}
              />
            </div>
            {devCode && (
              <div data-testid="admin-dev-code" style={{
                fontSize: 12, color: t.warning, marginBottom: 10,
              }}>개발 모드 인증번호: <b>{devCode}</b></div>
            )}
            <button
              data-testid="admin-verify" disabled={busy || code.length < 4}
              onClick={() => void doCode()}
              style={{
                width: '100%', height: 42, borderRadius: 8, border: 'none',
                background: t.primary, color: '#fff', fontSize: 14, fontWeight: 800,
                cursor: busy ? 'default' : 'pointer', opacity: busy || code.length < 4 ? 0.5 : 1,
              }}
            >{busy ? '확인하는 중…' : '관리자 콘솔 열기'}</button>
            <button
              data-testid="admin-back" onClick={() => { setStep('password'); setErr(null); setNote(null); }}
              style={{
                width: '100%', height: 34, marginTop: 8, borderRadius: 7,
                border: `1px solid ${t.border}`, background: t.surfaceAlt,
                color: t.text, fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
              }}
            >처음부터 다시</button>
          </>
        )}

        {note && !err && (
          <div data-testid="admin-note" style={{
            marginTop: 12, fontSize: 12, color: t.primary, lineHeight: 1.6,
          }}>{note}</div>
        )}
        {err && (
          <div data-testid="admin-error" style={{
            marginTop: 12, fontSize: 12, color: t.danger, lineHeight: 1.6,
          }}>{err}</div>
        )}
      </div>
      </div>
    </div>
  );
}
