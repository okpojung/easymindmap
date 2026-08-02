// 로그인/가입 폼 — 이메일+비밀번호 (Phase 3).
//
// 로그인 방식은 앞으로 늘어난다(SNS·SSO). 그래서 **제공자 목록**을
// 데이터(SOCIAL_PROVIDERS)로 두고, 새 방식은 항목 하나를 추가하고
// `enabled: true` 로 바꾸는 것만으로 붙도록 했다. 지금은 이메일 하나만
// 실제로 동작하고 나머지는 '준비 중'으로 표시된다.

import { useState } from 'react';
import type { ThemeTokens } from '@/components/design-tokens/theme';
import { useAuthStore } from '@/stores/authStore';
import { AuthError } from '@/services/cloud/supabaseAuth';

export interface SocialProvider {
  id: string;
  label: string;
  /** 버튼 앞 글리프 — 실제 브랜드 로고는 붙일 때 교체 */
  mark: string;
  /** 브랜드 색 (테두리·글리프) */
  color: string;
  enabled: boolean;
}

/** 앞으로 붙일 로그인 방식 — 붙을 때 enabled 만 켜면 된다 */
export const SOCIAL_PROVIDERS: SocialProvider[] = [
  { id: 'google', label: 'Google로 계속하기', mark: 'G', color: '#4285F4', enabled: false },
  { id: 'kakao', label: '카카오로 계속하기', mark: 'K', color: '#FEE500', enabled: false },
  // mark 는 브랜드 로고를 붙이기 전의 임시 글리프 — 어느 폰트에서나
  // 보이도록 영문 대문자를 쓴다 (Apple 심볼 는 대부분의 리눅스·안드
  // 로이드 폰트에 없어 빈칸으로 보인다)
  { id: 'apple', label: 'Apple로 계속하기', mark: 'A', color: '#111111', enabled: false },
];

export function LoginForm({
  t, onDone, compact = false,
}: {
  t: ThemeTokens;
  /** 로그인/가입이 끝났을 때 (안내 문구 전달) */
  onDone?: (msg: string) => void;
  /** 메뉴 팝업 안에 넣는 좁은 형태 */
  compact?: boolean;
}) {
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const run = async (kind: 'in' | 'up') => {
    if (!email.trim() || !pw) {
      setErr('이메일과 비밀번호를 입력하세요.');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      if (kind === 'in') {
        await useAuthStore.getState().signIn(email.trim(), pw);
        onDone?.('로그인했습니다.');
      } else {
        const done = await useAuthStore.getState().signUp(email.trim(), pw);
        onDone?.(done
          ? '가입하고 로그인했습니다.'
          : '가입 확인 메일을 보냈습니다. 메일함을 확인하세요.');
      }
    } catch (e) {
      setErr(e instanceof AuthError ? e.message : '인증 중 오류가 발생했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const h = compact ? 30 : 38;
  const inputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', height: h, padding: '0 10px',
    borderRadius: 7, border: `1px solid ${t.border}`, background: t.surfaceAlt,
    color: t.text, fontSize: compact ? 12 : 13.5, marginBottom: 7,
  };

  return (
    <div
      data-testid="login-form"
      style={{ padding: compact ? '8px 10px' : 0, width: compact ? 230 : '100%' }}
    >
      {compact && (
        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>클라우드 로그인</div>
      )}
      <input
        data-testid="login-email"
        type="email" placeholder="이메일" value={email} autoComplete="username"
        onChange={(e) => setEmail(e.target.value)} style={inputStyle}
        onKeyDown={(e) => { if (e.key === 'Enter') void run('in'); }}
      />
      <input
        data-testid="login-password"
        type="password" placeholder="비밀번호" value={pw} autoComplete="current-password"
        onChange={(e) => setPw(e.target.value)} style={inputStyle}
        onKeyDown={(e) => { if (e.key === 'Enter') void run('in'); }}
      />
      {err && (
        <div data-testid="login-error"
          style={{ color: '#d9534f', fontSize: compact ? 11 : 12, marginBottom: 7 }}>
          {err}
        </div>
      )}
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          data-testid="login-submit" disabled={busy} onClick={() => void run('in')}
          style={{
            flex: 1, height: h, borderRadius: 7, border: 'none', cursor: 'pointer',
            background: t.primary, color: '#fff',
            fontSize: compact ? 12 : 13.5, fontWeight: 700,
            opacity: busy ? 0.6 : 1,
          }}
        >{busy ? '처리 중…' : '로그인'}</button>
        <button
          data-testid="signup-submit" disabled={busy} onClick={() => void run('up')}
          style={{
            flex: 1, height: h, borderRadius: 7, cursor: 'pointer',
            border: `1px solid ${t.border}`, background: t.surfaceAlt,
            color: t.text, fontSize: compact ? 12 : 13.5, fontWeight: 600,
            opacity: busy ? 0.6 : 1,
          }}
        >가입</button>
      </div>

      {/* 준비 중인 로그인 방식 — 자리를 미리 보여 준다 (넓은 형태에서만) */}
      {!compact && (
        <div data-testid="login-providers" style={{ marginTop: 18 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            color: t.textSubtle, fontSize: 11, marginBottom: 10,
          }}>
            <span style={{ flex: 1, height: 1, background: t.divider }} />
            다른 방법으로 로그인
            <span style={{ flex: 1, height: 1, background: t.divider }} />
          </div>
          {SOCIAL_PROVIDERS.map((p) => (
            <button
              key={p.id}
              data-testid={`login-provider-${p.id}`}
              disabled={!p.enabled}
              title={p.enabled ? p.label : `${p.label} — 준비 중입니다`}
              style={{
                width: '100%', height: 38, marginBottom: 7, borderRadius: 7,
                border: `1px solid ${t.border}`, background: t.surface,
                color: p.enabled ? t.text : t.textSubtle,
                cursor: p.enabled ? 'pointer' : 'default',
                display: 'flex', alignItems: 'center', gap: 10, padding: '0 12px',
                fontSize: 13, fontWeight: 600,
              }}
            >
              <span style={{
                width: 20, textAlign: 'center', fontWeight: 800,
                color: p.enabled ? p.color : t.textSubtle,
              }}>{p.mark}</span>
              <span style={{ flex: 1, textAlign: 'left' }}>{p.label}</span>
              {!p.enabled && (
                <span style={{
                  fontSize: 10, fontWeight: 600, color: t.textSubtle,
                  border: `1px solid ${t.border}`, borderRadius: 8, padding: '1px 7px',
                }}>준비 중</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
