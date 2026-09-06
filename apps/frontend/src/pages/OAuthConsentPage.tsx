// OAuth 동의 화면 — claude.ai 커스텀 커넥터가 지나는 자리 (MCP 4단계,
// 2026-09-06). 설계·근거: docs/04-extensions/ai/mcp-connector.md §10.6
//
// ★ 어디서 오나
//   claude.ai → GoTrue `/oauth/authorize` → **여기**(`/oauth/consent
//   ?authorization_id=…`) → [허용] → GoTrue 가 준 주소로 claude.ai 복귀.
//   GoTrue 에는 이 화면이 없어서, 없으면 사용자가 404 를 만난다.
//
// ★ 에디터를 띄우지 않는다
//   여기 오는 사람은 "맵을 그리러" 온 것이 아니라 **허락하러** 왔다.
//   에디터를 띄우면 문서함·자동저장·초안 복구가 함께 뜨면서 무엇을
//   허락하는 중이었는지 묻힌다. `PublicMapPage` 를 에디터보다 먼저 가르는
//   것과 같은 이유다(`main.tsx`).

import { useCallback, useEffect, useState } from 'react';
import { THEMES } from '@/components/design-tokens/theme';
import { LoginForm } from '@/components/auth/LoginForm';
import { useAuthStore, authEnabled, getFreshAccessToken } from '@/stores/authStore';
import { AuthError } from '@/services/cloud/supabaseAuth';
import {
  authorizationIdFromSearch, oauthConsent,
  type AuthorizationDetails,
} from '@/services/cloud/oauthConsent';

// 동의 화면은 **항상 밝은 테마**다 — 관리자 콘솔과 같은 이유로, 에디터의
// 테마 스토어를 여기까지 끌고 오지 않는다.
const t = THEMES.light;

type Phase =
  | { s: 'loading' }
  | { s: 'consent'; details: AuthorizationDetails }
  | { s: 'leaving'; to: string }
  | { s: 'error'; message: string; retryable: boolean };

export function OAuthConsentPage() {
  const session = useAuthStore((x) => x.session);
  const authorizationId = authorizationIdFromSearch(window.location.search);
  const [phase, setPhase] = useState<Phase>({ s: 'loading' });
  const [busy, setBusy] = useState<'approve' | 'deny' | null>(null);

  useEffect(() => { document.title = '연결 허용 — EasyMindMap'; }, []);

  // 인가 요청 읽기 — 로그인한 뒤에야 할 수 있다(GoTrue 가 사용자 토큰을
  // 요구한다). 그래서 세션이 생기면 이 훅이 다시 돈다.
  useEffect(() => {
    if (!authorizationId || !session) return;
    let alive = true;
    setPhase({ s: 'loading' });
    void (async () => {
      const token = await getFreshAccessToken();
      if (!alive) return;
      if (!token) {
        setPhase({ s: 'error', message: '로그인이 만료되었습니다. 다시 로그인해 주세요.', retryable: false });
        return;
      }
      try {
        const r = await oauthConsent.lookup(authorizationId, token);
        if (!alive) return;
        // 전에 같은 범위를 허락했으면 GoTrue 가 이미 승인했다 — 또 묻지 않는다
        if (r.kind === 'approved') { leave(r.redirectUrl, setPhase); return; }
        setPhase({ s: 'consent', details: r.details });
      } catch (e) {
        if (!alive) return;
        setPhase({
          s: 'error',
          message: e instanceof AuthError ? e.message : '연결 요청을 읽는 중 오류가 발생했습니다.',
          retryable: false,
        });
      }
    })();
    return () => { alive = false; };
  }, [authorizationId, session]);

  const decide = useCallback(async (action: 'approve' | 'deny') => {
    if (!authorizationId || busy) return;
    setBusy(action);
    try {
      const token = await getFreshAccessToken();
      if (!token) throw new AuthError(401, '로그인이 만료되었습니다. 다시 로그인해 주세요.');
      leave(await oauthConsent.decide(authorizationId, action, token), setPhase);
    } catch (e) {
      setPhase({
        s: 'error',
        message: e instanceof AuthError ? e.message : '처리 중 오류가 발생했습니다.',
        retryable: false,
      });
    } finally {
      setBusy(null);
    }
  }, [authorizationId, busy]);

  // ── 열리지 않는 경우들. **왜 안 되는지**까지 적는다 ─────────────────

  if (!authEnabled) {
    return (
      <Shell testId="consent-auth-disabled" title="이 배포에서는 연결할 수 없습니다">
        <p style={pStyle}>
          이 화면은 계정이 있는 배포에서만 동작합니다. 지금 브라우저가 보고 있는 곳은
          로그인 없이 도는 개발용 배포입니다(<code>VITE_SUPABASE_URL</code> 이 비어
          있습니다).
        </p>
      </Shell>
    );
  }

  if (!authorizationId) {
    return (
      <Shell testId="consent-no-id" title="연결 요청이 없습니다">
        <p style={pStyle}>
          이 주소는 <b>AI 앱이 연결을 요청할 때</b> 열리는 화면입니다. 주소창에 직접
          입력해서는 열 수 없습니다.
        </p>
        <p style={pStyle}>
          연결하려면 claude.ai ▸ 설정 ▸ 커넥터에서 EasyMindMap 커넥터를 추가하세요.
        </p>
        <HomeLink />
      </Shell>
    );
  }

  if (!session) {
    return (
      <Shell testId="consent-login" title="먼저 로그인해 주세요">
        <p style={pStyle}>
          어떤 계정의 맵을 열어 줄지 정해야 합니다. 로그인하면 <b>무엇을 허락하는지</b>
          바로 다음 화면에서 보여 드립니다.
        </p>
        <div style={{ marginTop: 6 }}>
          <LoginForm t={t} />
        </div>
      </Shell>
    );
  }

  if (phase.s === 'loading') {
    return <Shell testId="consent-loading" title="확인하는 중…"><p style={pStyle}>연결 요청을 읽고 있습니다.</p></Shell>;
  }

  if (phase.s === 'leaving') {
    return (
      <Shell testId="consent-leaving" title="돌아가는 중…">
        <p style={pStyle}>요청한 앱으로 돌아갑니다. 자동으로 넘어가지 않으면 아래를 눌러 주세요.</p>
        <a href={phase.to} style={{ ...linkStyle, fontSize: 13 }}>계속하기</a>
      </Shell>
    );
  }

  if (phase.s === 'error') {
    return (
      <Shell testId="consent-error" title="연결하지 못했습니다">
        <p style={pStyle}>{phase.message}</p>
        <HomeLink />
      </Shell>
    );
  }

  const { details } = phase;

  return (
    <Shell testId="consent-ask" title={`${details.clientName} 을(를) 연결할까요?`}>
      <p style={pStyle}>
        허용하면 이 앱이 <b>{details.userEmail || '내'}</b> 계정으로 EasyMindMap 에
        접근합니다.
      </p>

      <div
        data-testid="consent-scopes"
        style={{
          border: `1px solid ${t.border}`, borderRadius: 10, background: t.surfaceAlt,
          padding: '12px 14px', margin: '14px 0 4px', textAlign: 'left',
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 700, color: t.textSubtle, marginBottom: 8 }}>
          앱이 요청한 것
        </div>
        {details.scopes.length === 0 ? (
          <div data-testid="consent-scope-none" style={{ fontSize: 13, color: t.textMuted }}>
            추가로 요청한 정보가 없습니다.
          </div>
        ) : (
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 6 }}>
            {details.scopes.map((s) => (
              <li
                key={s.id}
                data-testid={`consent-scope-${s.id}`}
                style={{ fontSize: 13, color: t.text, display: 'flex', gap: 8 }}
              >
                <span aria-hidden style={{ color: t.primary }}>·</span>
                <span>
                  {s.label}
                  {s.unknown && (
                    <span style={{ color: t.warning, marginLeft: 6, fontSize: 12 }}>
                      (우리가 모르는 항목입니다)
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ★ 맵 접근은 **범위 목록에 나타나지 않는다.** GoTrue 의 범위는
          openid/email/profile/phone/offline_access 로 고정이라(§10.3),
          "맵을 읽고 쓴다"를 범위로 표현할 수가 없다. 목록만 보고 "그럼 맵은
          못 보는구나" 로 읽히면 안 되므로 글로 밝힌다. */}
      <p data-testid="consent-maps-note" style={{ ...pStyle, fontSize: 12.5, color: t.textMuted }}>
        위 목록과 별개로, 연결된 앱은 <b>내 맵을 읽고 새 맵을 만들 수 있습니다</b>.
        연결은 계정 설정에서 언제든 끊을 수 있습니다.
      </p>

      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button
          data-testid="consent-deny"
          onClick={() => void decide('deny')}
          disabled={busy !== null}
          style={{
            flex: 1, padding: '11px 12px', borderRadius: 9, cursor: busy ? 'default' : 'pointer',
            border: `1px solid ${t.border}`, background: t.surface, color: t.text,
            fontSize: 14, fontWeight: 600,
          }}
        >{busy === 'deny' ? '처리 중…' : '거부'}</button>
        <button
          data-testid="consent-approve"
          onClick={() => void decide('approve')}
          disabled={busy !== null}
          style={{
            flex: 1, padding: '11px 12px', borderRadius: 9, cursor: busy ? 'default' : 'pointer',
            border: `1px solid ${t.primaryBorder}`, background: t.primary, color: '#1A1206',
            fontSize: 14, fontWeight: 800,
          }}
        >{busy === 'approve' ? '처리 중…' : '허용'}</button>
      </div>

      {details.clientUri && (
        <div style={{ marginTop: 12, fontSize: 12, color: t.textSubtle, wordBreak: 'break-all' }}>
          앱 주소: {details.clientUri}
        </div>
      )}
    </Shell>
  );
}

/**
 * 이동 — `replace` 를 쓴다. `assign` 이면 [뒤로]가 이 화면으로 되돌아오는데,
 * 그 인가 요청은 이미 처리되어 "찾을 수 없습니다"만 뜬다.
 *
 * 화면을 `leaving` 으로 먼저 바꾸는 이유: 이동이 막히는 브라우저(팝업 차단·
 * 확장)에서 **아무 일도 안 일어난 것처럼 보이지 않게** 눌러서 갈 링크를 남긴다.
 */
function leave(to: string, setPhase: (p: Phase) => void): void {
  setPhase({ s: 'leaving', to });
  window.location.replace(to);
}

const pStyle: React.CSSProperties = {
  margin: '6px 0 0', fontSize: 13.5, color: t.textMuted, lineHeight: 1.75,
};

const linkStyle: React.CSSProperties = { color: t.accent, textDecoration: 'none' };

function HomeLink() {
  return (
    <a href="/" style={{ ...linkStyle, display: 'inline-block', marginTop: 14, fontSize: 13 }}>
      EasyMindMap 열기
    </a>
  );
}

function Shell({
  title, children, testId,
}: { title: string; children: React.ReactNode; testId: string }) {
  return (
    <div
      data-testid={testId}
      style={{
        minHeight: '100vh', background: t.bg, color: t.text, padding: '48px 20px',
        display: 'flex', justifyContent: 'center', alignItems: 'flex-start',
        fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
      }}
    >
      <div
        style={{
          width: '100%', maxWidth: 420, background: t.surface, borderRadius: 14,
          border: `1px solid ${t.border}`, boxShadow: t.shadowSm, padding: '26px 24px 24px',
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 700, color: t.textSubtle, letterSpacing: 0.3 }}>
          EasyMindMap
        </div>
        <h1 style={{ margin: '8px 0 0', fontSize: 19, fontWeight: 800, lineHeight: 1.45 }}>
          {title}
        </h1>
        {children}
      </div>
    </div>
  );
}
