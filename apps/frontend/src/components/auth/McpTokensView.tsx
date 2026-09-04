// MCP 커넥터 토큰 화면 — 발급 · 목록 · 폐기 (2026-09-04).
//
// 설계: docs/04-extensions/ai/mcp-connector.md §3
//
// 이 화면이 지켜야 하는 것 두 가지가 있다.
//
//  ① **폐기가 발급과 같은 화면에 있어야 한다** (§3 마지막 줄). 발급은
//     쉬운데 끄는 자리는 어디 있는지 모르는 것이 흔한 사고다 — 잃어버린
//     토큰을 끄지 못하면 그 토큰은 영원히 살아 있다.
//  ② **원문은 발급 직후 한 번뿐**이라는 것을 사용자가 **복사하기 전에**
//     알아야 한다. 창을 닫고 나서 알려 주면 이미 늦다. 그래서 원문 상자
//     위에 그 문장이 먼저 온다.

import { useEffect, useRef, useState } from 'react';
import type { ThemeTokens } from '@/components/design-tokens/theme';
import { cloudApi, CloudError, type McpToken } from '@/services/cloud/apiClient';

function fmtDate(v: string | null): string {
  if (!v) return '—';
  const d = new Date(v);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
}

export function McpTokensView({ t }: { t: ThemeTokens }) {
  const [avail, setAvail] = useState<boolean | null>(null);
  /** 델타 SQL(`api_tokens` 표)이 서버에 적용됐는가 */
  const [ready, setReady] = useState(true);
  const [tokens, setTokens] = useState<McpToken[] | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  /** 방금 발급된 원문 — **다시 볼 수 없다**. 창을 닫으면 사라진다 */
  const [fresh, setFresh] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  /** 폐기 확인 대기 중인 토큰 — 한 번 더 묻는다(되돌릴 수 없다) */
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    void reload();
    return () => { alive.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function reload() {
    try {
      const r = await cloudApi.mcpTokens();
      if (!alive.current) return;
      setAvail(r.available);
      setReady(r.ready !== false);
      setTokens(r.tokens);
    } catch (e) {
      if (!alive.current) return;
      setAvail(false);
      setTokens([]);
      setErr(e instanceof CloudError ? e.message : '토큰을 불러오지 못했습니다.');
    }
  }

  async function issue() {
    if (busy || !ready || !name.trim()) return;
    setBusy(true); setErr(null); setCopied(false);
    try {
      const r = await cloudApi.issueMcpToken(name.trim());
      if (!alive.current) return;
      setFresh(r.token);
      setName('');
      await reload();
    } catch (e) {
      if (alive.current) setErr(e instanceof CloudError ? e.message : '발급하지 못했습니다.');
    } finally {
      if (alive.current) setBusy(false);
    }
  }

  async function revoke(id: string) {
    setBusy(true); setErr(null); setConfirmId(null);
    try {
      await cloudApi.revokeMcpToken(id);
      await reload();
    } catch (e) {
      if (alive.current) setErr(e instanceof CloudError ? e.message : '폐기하지 못했습니다.');
    } finally {
      if (alive.current) setBusy(false);
    }
  }

  const box: React.CSSProperties = {
    fontSize: 12, color: t.textMuted, lineHeight: 1.75,
    padding: '10px 12px', borderRadius: 8,
    background: t.surfaceAlt, border: `1px solid ${t.border}`,
  };

  if (tokens === null) {
    return <div style={{ fontSize: 12.5, color: t.textSubtle }}>불러오는 중…</div>;
  }

  return (
    <div data-testid="mcp-tokens-view">
      <div style={{ ...box, marginBottom: 12 }}>
        Claude·ChatGPT 대화에서 <b>“이 내용을 맵으로 저장해줘”</b> 라고 하면
        문서함에 맵이 생기게 하는 연결입니다. 아래에서 토큰을 발급해
        AI 쪽 <b>커넥터 설정</b>에 붙여넣으세요.
        <br />
        연결 주소: <code style={{ userSelect: 'all' }}>{apiOrigin()}/v1/mcp</code>
      </div>

      {/* 서버에 표가 아직 없다 — **누르기 전에** 말한다. 발급을 눌러 500 을
          받으면 사용자는 자기 잘못인지 서버 사정인지 알 수 없다 */}
      {!ready && (
        <div data-testid="mcp-not-ready" style={{ ...box, marginBottom: 12 }}>
          <b>서버 준비가 아직 끝나지 않았습니다.</b>
          <br />
          토큰을 담을 표(<code>api_tokens</code>)가 서버에 없습니다 —
          운영자가 델타 SQL 을 한 번 적용하면 바로 쓸 수 있습니다.
          다른 기능에는 영향이 없습니다.
        </div>
      )}

      {/* **이 배포에서 쓸 수 있는가** — 발급받고 나서야 안 되는 것을 아는 것보다 낫다 */}
      {avail === false && (
        <div
          data-testid="mcp-unavailable"
          style={{ ...box, marginBottom: 12, borderColor: t.border, color: t.textMuted }}
        >
          <b>이 서버에서는 MCP 커넥터를 열지 않습니다.</b>
          <br />
          로그인 없이 쓰는 개발 모드(<code>AUTH_MODE=dev</code>)로 돌고 있어서,
          외부에 열면 토큰 없이도 남의 문서함에 맵을 만들 수 있습니다.
          토큰을 발급해 두더라도 연결은 거절됩니다.
        </div>
      )}

      {/* 방금 발급된 원문 — 경고가 **상자보다 위에** 온다 */}
      {fresh && (
        <div
          data-testid="mcp-fresh-token"
          style={{ ...box, marginBottom: 12, borderColor: t.primary }}
        >
          <b style={{ color: t.text }}>지금 복사해 두세요 — 이 값은 다시 볼 수 없습니다.</b>
          <br />
          서버에도 남지 않습니다(해시만 저장). 잃어버리면 폐기하고 새로 발급하면 됩니다.
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <code
              style={{
                flex: 1, userSelect: 'all', wordBreak: 'break-all',
                background: t.surface, border: `1px solid ${t.border}`,
                borderRadius: 6, padding: '7px 8px', fontSize: 11.5, color: t.text,
              }}
            >{fresh}</code>
            <button
              data-testid="mcp-copy"
              onClick={() => {
                void navigator.clipboard.writeText(fresh).then(
                  () => setCopied(true),
                  // 클립보드가 막힌 브라우저 — 위 상자를 직접 고르면 된다
                  () => setErr('복사가 막혀 있습니다 — 위 값을 직접 선택해 복사하세요.'),
                );
              }}
              style={{
                height: 34, padding: '0 12px', borderRadius: 7, cursor: 'pointer',
                border: `1px solid ${t.border}`, background: t.surfaceAlt,
                color: t.text, fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap',
              }}
            >{copied ? '복사됨' : '복사'}</button>
          </div>
        </div>
      )}

      {/* 발급 */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        <input
          data-testid="mcp-token-name"
          value={name}
          maxLength={60}
          placeholder="토큰 이름 (예: 집 노트북 Claude)"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void issue(); }}
          style={{
            flex: 1, height: 34, borderRadius: 7, padding: '0 10px',
            border: `1px solid ${t.border}`, background: t.surface,
            color: t.text, fontSize: 12.5,
          }}
        />
        <button
          data-testid="mcp-issue"
          onClick={() => void issue()}
          disabled={busy || !ready || !name.trim()}
          style={{
            height: 34, padding: '0 14px', borderRadius: 7,
            border: `1px solid ${t.border}`, background: t.surfaceAlt, color: t.text,
            fontSize: 12.5, fontWeight: 700,
            cursor: busy || !ready || !name.trim() ? 'default' : 'pointer',
            opacity: busy || !ready || !name.trim() ? 0.6 : 1,
          }}
        >{busy ? '…' : '발급'}</button>
      </div>

      {err && (
        <div data-testid="mcp-error" style={{ fontSize: 12, color: t.danger, marginBottom: 10 }}>
          {err}
        </div>
      )}

      {/* 목록 + 폐기 — **같은 화면**이다 (§3) */}
      {tokens.length === 0 ? (
        <div style={{ fontSize: 12, color: t.textSubtle, padding: '8px 2px' }}>
          아직 발급한 토큰이 없습니다.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {tokens.map((tok) => {
            const dead = !!tok.revokedAt;
            return (
              <div
                key={tok.id}
                data-testid="mcp-token-row"
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 10px', borderRadius: 8,
                  border: `1px solid ${t.border}`, background: t.surfaceAlt,
                  opacity: dead ? 0.55 : 1,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 12.5, fontWeight: 700, color: t.text,
                    textDecoration: dead ? 'line-through' : 'none',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>{tok.name}</div>
                  <div style={{ fontSize: 11, color: t.textMuted }}>
                    <code>{tok.prefix}…</code>
                    {' · '}발급 {fmtDate(tok.createdAt)}
                    {' · '}마지막 사용 {fmtDate(tok.lastUsedAt)}
                    {dead && <> · <b>폐기됨 {fmtDate(tok.revokedAt)}</b></>}
                  </div>
                </div>
                {!dead && (
                  confirmId === tok.id ? (
                    <button
                      data-testid="mcp-revoke-confirm"
                      onClick={() => void revoke(tok.id)}
                      disabled={busy}
                      style={{
                        height: 28, padding: '0 10px', borderRadius: 6, cursor: 'pointer',
                        border: `1px solid ${t.danger}`, background: 'transparent',
                        color: t.danger, fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap',
                      }}
                    >정말 폐기</button>
                  ) : (
                    <button
                      data-testid="mcp-revoke"
                      onClick={() => setConfirmId(tok.id)}
                      style={{
                        height: 28, padding: '0 10px', borderRadius: 6, cursor: 'pointer',
                        border: `1px solid ${t.border}`, background: t.surface,
                        color: t.textMuted, fontSize: 11.5, fontWeight: 600, whiteSpace: 'nowrap',
                      }}
                    >폐기</button>
                  )
                )}
              </div>
            );
          })}
        </div>
      )}

      <div style={{ fontSize: 11.5, color: t.textSubtle, marginTop: 12, lineHeight: 1.7 }}>
        토큰으로 할 수 있는 것은 <b>새 맵 만들기 하나</b>입니다 — 맵을 지우거나
        계정을 건드릴 수는 없습니다. 만든 맵도 평소와 같이 저장 용량을 씁니다.
      </div>
    </div>
  );
}

/** 연결 주소는 **API 주소**다 — 앱 주소가 아니다(사용자가 가장 자주 헷갈리는 곳) */
function apiOrigin(): string {
  return (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/$/, '');
}
