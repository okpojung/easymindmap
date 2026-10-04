// WelcomeScreen — 로그인하지 않은 방문자가 처음 보는 화면 (2026-08-02).
//
// 정책(사용자 결정): 인증이 켜진 배포에서 **로그인 전에는 에디터를 열지
// 않는다**. 소개(슬로건 + 핵심 가치)와 로그인만 보여 준다. 맵은 계정에
// 저장되므로, 로그인 없이 편집을 시작하면 "저장할 곳이 없는 작업"이
// 되어 내용을 잃기 쉽기 때문이다.
//
// 인증이 꺼진 개발 모드(VITE_SUPABASE_URL 없음)에서는 이 화면이 뜨지
// 않고 곧바로 에디터가 열린다 — 로컬 개발·E2E 흐름은 그대로다.

import { useState } from 'react';
import type { ThemeTokens } from '@/components/design-tokens/theme';
import { I } from '@/components/icons';
import { LoginForm } from './LoginForm';
import { SignupForm } from './SignupForm';
import { ResetPasswordForm } from './ResetPasswordForm';
import { LanguagePicker } from '@/components/ui/LanguagePicker';
import { useTr } from '@/i18n';
import { rich } from '@/i18n/rich';

// 소개 문구는 docs/01-product/product-highlights.md 의 "한 줄 소개"·
// "5가지 약속"에서 가져온다 (문서와 화면이 어긋나지 않도록).
// 문장은 사전(auth.welcome.*)에 있다 — 여기에는 키만 둔다.
const POINTS: { icon: string; key: string }[] = [
  { icon: '📄', key: 'auth.welcome.point1' },
  { icon: '✨', key: 'auth.welcome.point2' },
  { icon: '☁', key: 'auth.welcome.point3' },
];

export function WelcomeScreen({ t }: { t: ThemeTokens }) {
  // 로그인 ↔ 회원가입 (2026-08-09). flash = 가입을 마친 뒤 로그인 화면에
  // 남기는 안내 (가입 확인 메일이 필요한 서버에서 특히 중요하다).
  const [mode, setMode] = useState<'login' | 'signup' | 'reset'>('login');
  const [flash, setFlash] = useState<string | null>(null);
  const tr = useTr();
  return (
    <div
      data-testid="welcome-screen"
      style={{
        position: 'fixed', inset: 0, overflow: 'auto',
        background: t.bg, color: t.text,
        fontFamily:
          "'Pretendard Variable','Pretendard','Inter',-apple-system,BlinkMacSystemFont,system-ui,sans-serif",
      }}
    >
      {/* 언어 고르기 — 로그인 전에도 바꿀 수 있어야 한다 (B10 i18n).
          오른쪽 위 구석에 작게 둔다. 좁은 폰(360px)에서도 겹치지 않게
          본문 위쪽 여백(padding-top)을 이 줄만큼 남겼다. */}
      <div style={{ position: 'absolute', top: 10, right: 12, zIndex: 2 }}>
        <LanguagePicker t={t} compact testId="welcome-language" />
      </div>
      <div
        style={{
          minHeight: '100%', boxSizing: 'border-box',
          display: 'flex', flexWrap: 'wrap', alignItems: 'center',
          justifyContent: 'center', gap: 48, padding: '52px clamp(16px, 4vw, 32px) 48px',
        }}
      >
        {/* ── 소개 ────────────────────────────────────────── */}
        <div style={{ flex: '1 1 420px', maxWidth: 560, minWidth: 300 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24 }}>
            {/* 2026-08-04 사용자 요청 — 초기 화면 로고·워드마크 확대 */}
            <I.Logo size={72} />
            {/* 워드마크 — 브랜드 브라운 (다크 테마는 밝은 탠으로 가독 확보) */}
            <span style={{
              fontSize: 40, fontWeight: 900, letterSpacing: -1,
              color: t.name === 'dark' ? '#E8C9A6' : '#5C3B25',
            }}>
              EasyMindMap
            </span>
          </div>

          <h1 style={{
            fontSize: 34, lineHeight: 1.3, fontWeight: 800,
            margin: '0 0 14px', letterSpacing: -0.8,
          }}>
            {tr('auth.welcome.slogan')}
          </h1>
          <p style={{
            fontSize: 15, lineHeight: 1.7, color: t.textMuted, margin: '0 0 28px',
          }}>
            {tr('auth.welcome.sub')}
          </p>

          <div style={{ display: 'grid', gap: 14 }}>
            {POINTS.map((p) => (
              <div key={p.key} style={{ display: 'flex', gap: 12 }}>
                <div style={{
                  width: 34, height: 34, flexShrink: 0, borderRadius: 9,
                  background: t.primarySoft, color: t.primary,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 16,
                }}>{p.icon}</div>
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 3 }}>{tr(`${p.key}.title`)}</div>
                  <div style={{ fontSize: 12.5, color: t.textMuted, lineHeight: 1.6 }}>{tr(`${p.key}.desc`)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── 로그인 ──────────────────────────────────────── */}
        <div
          style={{
            flex: '0 1 380px', minWidth: 300, boxSizing: 'border-box',
            background: t.surface, border: `1px solid ${t.border}`,
            borderRadius: 14, padding: 28,
            boxShadow: '0 18px 48px rgba(0,0,0,0.10)',
          }}
        >
          {/* 로그인 ↔ 회원가입 (2026-08-09) — 가입은 이메일 인증·성명·
              휴대폰을 받아야 해서 같은 자리에서 화면을 갈아 끼운다.
              새 창을 띄우면 입력하던 이메일을 다시 쳐야 한다. */}
          {mode === 'signup' ? (
            <SignupForm
              t={t}
              onCancel={() => setMode('login')}
              onDone={(m) => { setMode('login'); setFlash(m); }}
            />
          ) : mode === 'reset' ? (
            <ResetPasswordForm
              t={t}
              onCancel={() => setMode('login')}
              onDone={(m) => { setMode('login'); setFlash(m); }}
            />
          ) : (
            <>
              <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 6 }}>{tr('auth.welcome.start')}</div>
              <div style={{ fontSize: 12.5, color: t.textMuted, lineHeight: 1.6, marginBottom: 20 }}>
                {rich(tr('auth.welcome.intro'))}
              </div>
              {flash && (
                <div data-testid="welcome-flash" style={{
                  marginBottom: 12, padding: '8px 10px', borderRadius: 7,
                  background: t.primarySoft, border: `1px solid ${t.primaryBorder}`,
                  color: t.primary, fontSize: 12.5, lineHeight: 1.5,
                }}>{flash}</div>
              )}
              <LoginForm
                t={t}
                onSignup={() => { setFlash(null); setMode('signup'); }}
                onForgot={() => { setFlash(null); setMode('reset'); }}
              />
            </>
          )}

        </div>
      </div>
    </div>
  );
}
