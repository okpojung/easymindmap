// 로그인 폼 — 이메일+비밀번호 (Phase 3).
//
// **가입은 여기서 하지 않는다** (2026-08-09) — [가입]은 회원가입 화면
// (SignupForm)으로 넘긴다. 이메일 인증·성명·휴대폰을 받기 때문이다.
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

/** 앞으로 붙일 로그인 방식 — 붙을 때 enabled 만 켜면 된다.
 *  순서·구성은 2026-08-04 사용자 결정: 카카오 → 네이버 → Google
 *  (Apple 은 제외). mark 는 브랜드 로고를 붙이기 전의 임시 글리프. */
export const SOCIAL_PROVIDERS: SocialProvider[] = [
  { id: 'kakao', label: '카카오로 계속하기', mark: 'K', color: '#FEE500', enabled: false },
  { id: 'naver', label: '네이버로 계속하기', mark: 'N', color: '#03C75A', enabled: false },
  { id: 'google', label: 'Google로 계속하기', mark: 'G', color: '#4285F4', enabled: false },
];

export function LoginForm({
  t, onDone, onSignup, onForgot, compact = false,
}: {
  t: ThemeTokens;
  /** 로그인/가입이 끝났을 때 (안내 문구 전달) */
  onDone?: (msg: string) => void;
  /**
   * [가입] — 가입 화면으로 넘긴다 (2026-08-09).
   * 예전에는 이 자리에서 이메일·비밀번호만으로 곧바로 계정이 만들어졌다.
   * 이제 이메일 인증·성명·휴대폰을 받아야 해서 화면을 따로 둔다.
   * 넘길 곳이 없는 좁은 형태(메뉴 팝업)에서는 버튼을 감춘다.
   */
  onSignup?: () => void;
  /** [비밀번호를 잊으셨나요?] — 재설정 화면으로 (2026-08-13) */
  onForgot?: () => void;
  /** 메뉴 팝업 안에 넣는 좁은 형태 */
  compact?: boolean;
}) {
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [showPw, setShowPw] = useState(false); // 👁 비밀번호 표시 (2026-08-04)
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const run = async () => {
    if (!email.trim() || !pw) {
      setErr('이메일과 비밀번호를 입력하세요.');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await useAuthStore.getState().signIn(email.trim(), pw);
      onDone?.('로그인했습니다.');
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
  // **입력란마다 라벨을 붙인다** (2026-08-13 사용자 지시).
  // placeholder 만 두면 브라우저 자동완성이 채우는 순간 사라져, 그 칸이
  // 무엇인지 알 방법이 없어진다. 가입 화면(SignupForm)과 같은 규칙이다.
  const labelStyle: React.CSSProperties = {
    fontSize: compact ? 10.5 : 11.5, fontWeight: 700, color: t.textMuted,
    margin: '0 0 4px', display: 'block',
  };

  return (
    <div
      data-testid="login-form"
      style={{ padding: compact ? '8px 10px' : 0, width: compact ? 230 : '100%' }}
    >
      {compact && (
        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>클라우드 로그인</div>
      )}
      <label style={labelStyle} htmlFor="login-email">아이디 (이메일)</label>
      <input
        id="login-email"
        data-testid="login-email"
        type="email" placeholder="name@example.com" value={email} autoComplete="username"
        onChange={(e) => setEmail(e.target.value)} style={inputStyle}
        onKeyDown={(e) => { if (e.key === 'Enter') void run(); }}
      />
      {/* 비밀번호 + 👁 표시 토글 — 아이콘이 입력창 안 오른쪽에 겹친다 */}
      <label style={labelStyle} htmlFor="login-password">비밀번호</label>
      <div style={{ position: 'relative' }}>
        <input
          id="login-password"
          data-testid="login-password"
          type={showPw ? 'text' : 'password'}
          placeholder="비밀번호" value={pw} autoComplete="current-password"
          onChange={(e) => setPw(e.target.value)}
          style={{ ...inputStyle, paddingRight: 36 }}
          onKeyDown={(e) => { if (e.key === 'Enter') void run(); }}
        />
        <button
          type="button"
          data-testid="login-pw-toggle"
          onClick={() => setShowPw((v) => !v)}
          title={showPw ? '비밀번호 숨기기' : '비밀번호 표시'}
          style={{
            position: 'absolute', right: 4, top: (h - 26) / 2,
            width: 30, height: 26, padding: 0,
            border: 'none', background: 'transparent', cursor: 'pointer',
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
      {err && (
        <div data-testid="login-error"
          style={{ color: '#d9534f', fontSize: compact ? 11 : 12, marginBottom: 7 }}>
          {err}
        </div>
      )}
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          data-testid="login-submit" disabled={busy} onClick={() => void run()}
          style={{
            flex: 1, height: h, borderRadius: 7, border: 'none', cursor: 'pointer',
            background: t.primary, color: '#fff',
            fontSize: compact ? 12 : 13.5, fontWeight: 700,
            opacity: busy ? 0.6 : 1,
          }}
        >{busy ? '처리 중…' : '로그인'}</button>
        {onSignup && (
          <button
            data-testid="login-signup" disabled={busy} onClick={onSignup}
            style={{
              flex: 1, height: h, borderRadius: 7, cursor: 'pointer',
              border: `1px solid ${t.border}`, background: t.surfaceAlt,
              color: t.text, fontSize: compact ? 12 : 13.5, fontWeight: 600,
              opacity: busy ? 0.6 : 1,
            }}
          >가입</button>
        )}
      </div>

      {/* 비밀번호 재설정 통로 — **로그인 버튼 바로 아래**에 둔다.
          비밀번호가 틀려 막힌 사람이 다음으로 찾는 자리다. */}
      {onForgot && (
        <button
          data-testid="login-forgot" type="button" onClick={onForgot}
          style={{
            width: '100%', height: compact ? 26 : 30, marginTop: 8,
            border: 'none', background: 'transparent', color: t.textMuted,
            fontSize: compact ? 11 : 12, cursor: 'pointer',
            textDecoration: 'underline', textUnderlineOffset: 3,
          }}
        >비밀번호를 잊으셨나요?</button>
      )}

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

          {/* Guest 체험 (2026-08-04) — 가입 없이 로컬 에디터만.
              서버 저장·불러오기·첨부·API 키 AI 는 막히고, MD/HTML
              내보내기와 웹 AI 붙여넣기는 된다. */}
          <button
            data-testid="login-guest"
            onClick={() => useAuthStore.getState().enterGuest()}
            title="가입 없이 에디터를 체험합니다 — 서버 저장·불러오기·첨부는 안 되고, MD/HTML 내보내기는 됩니다"
            style={{
              width: '100%', height: 38, marginTop: 4, borderRadius: 7,
              border: `1px dashed ${t.border}`, background: t.surfaceAlt,
              color: t.textMuted, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 10, padding: '0 12px',
              fontSize: 13, fontWeight: 600,
            }}
          >
            <span style={{ width: 20, textAlign: 'center', fontWeight: 800 }}>👤</span>
            <span style={{ flex: 1, textAlign: 'left' }}>Guest로 체험하기 (가입 없이)</span>
          </button>
        </div>
      )}
    </div>
  );
}
