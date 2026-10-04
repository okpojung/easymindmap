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
import { useTr } from '@/i18n';
import { rich } from '@/i18n/rich';

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
  /** 폐기된 토큰의 기록 삭제 확인 대기 (2026-09-07) */
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const alive = useRef(true);
  const tr = useTr();

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
      setErr(e instanceof CloudError ? e.message : tr('auth.mcp.loadFailed'));
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
      if (alive.current) setErr(e instanceof CloudError ? e.message : tr('auth.mcp.issueFailed'));
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
      if (alive.current) setErr(e instanceof CloudError ? e.message : tr('auth.mcp.revokeFailed'));
    } finally {
      if (alive.current) setBusy(false);
    }
  }

  async function removeRecord(id: string) {
    setBusy(true); setErr(null); setDeleteId(null);
    try {
      await cloudApi.deleteMcpTokenRecord(id);
      await reload();
    } catch (e) {
      if (alive.current) setErr(e instanceof CloudError ? e.message : tr('auth.mcp.deleteFailed'));
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
    return <div style={{ fontSize: 12.5, color: t.textSubtle }}>{tr('common.loading')}</div>;
  }

  return (
    <div data-testid="mcp-tokens-view">
      <div style={{ ...box, marginBottom: 12 }}>
        {rich(tr('auth.mcp.intro'))}
        <br />
        {tr('auth.mcp.endpoint')} <code style={{ userSelect: 'all' }}>{apiOrigin()}/v1/mcp</code>
      </div>

      {/* 서버에 표가 아직 없다 — **누르기 전에** 말한다. 발급을 눌러 500 을
          받으면 사용자는 자기 잘못인지 서버 사정인지 알 수 없다 */}
      {!ready && (
        <div data-testid="mcp-not-ready" style={{ ...box, marginBottom: 12 }}>
          <b>{tr('auth.mcp.notReady')}</b>
          <br />
          {rich(tr('auth.mcp.notReadyWhy'))}
        </div>
      )}

      {/* **이 배포에서 쓸 수 있는가** — 발급받고 나서야 안 되는 것을 아는 것보다 낫다 */}
      {avail === false && (
        <div
          data-testid="mcp-unavailable"
          style={{ ...box, marginBottom: 12, borderColor: t.border, color: t.textMuted }}
        >
          <b>{tr('auth.mcp.unavailable')}</b>
          <br />
          {rich(tr('auth.mcp.unavailableWhy'))}
        </div>
      )}

      {/* 방금 발급된 원문 — 경고가 **상자보다 위에** 온다 */}
      {fresh && (
        <div
          data-testid="mcp-fresh-token"
          style={{ ...box, marginBottom: 12, borderColor: t.primary }}
        >
          <b style={{ color: t.text }}>{tr('auth.mcp.copyNow')}</b>
          <br />
          {tr('auth.mcp.copyNowWhy')}
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
                  () => setErr(tr('auth.mcp.copyBlocked')),
                );
              }}
              style={{
                height: 34, padding: '0 12px', borderRadius: 7, cursor: 'pointer',
                border: `1px solid ${t.border}`, background: t.surfaceAlt,
                color: t.text, fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap',
              }}
            >{copied ? tr('auth.mcp.copied') : tr('common.copy')}</button>
          </div>
        </div>
      )}

      {/* 발급 */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        <input
          data-testid="mcp-token-name"
          value={name}
          maxLength={60}
          placeholder={tr('auth.mcp.namePh')}
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
        >{busy ? '…' : tr('auth.mcp.issue')}</button>
      </div>

      {err && (
        <div data-testid="mcp-error" style={{ fontSize: 12, color: t.danger, marginBottom: 10 }}>
          {err}
        </div>
      )}

      {/* 목록 + 폐기 — **같은 화면**이다 (§3) */}
      {tokens.length === 0 ? (
        <div style={{ fontSize: 12, color: t.textSubtle, padding: '8px 2px' }}>
          {tr('auth.mcp.none')}
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
                    {' · '}{tr('auth.mcp.issuedAt', { date: fmtDate(tok.createdAt) })}
                    {' · '}{tr('auth.mcp.lastUsed', { date: fmtDate(tok.lastUsedAt) })}
                    {dead && <> · <b>{tr('auth.mcp.revokedAt', { date: fmtDate(tok.revokedAt) })}</b></>}
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
                    >{tr('auth.mcp.revokeConfirm')}</button>
                  ) : (
                    <button
                      data-testid="mcp-revoke"
                      onClick={() => setConfirmId(tok.id)}
                      style={{
                        height: 28, padding: '0 10px', borderRadius: 6, cursor: 'pointer',
                        border: `1px solid ${t.border}`, background: t.surface,
                        color: t.textMuted, fontSize: 11.5, fontWeight: 600, whiteSpace: 'nowrap',
                      }}
                    >{tr('auth.mcp.revoke')}</button>
                  )
                )}
                {dead && (
                  // 폐기된 줄은 기록만 남은 것 — 사용자가 치울 수 있다 (2026-09-07)
                  deleteId === tok.id ? (
                    <button
                      data-testid="mcp-delete-confirm"
                      onClick={() => void removeRecord(tok.id)}
                      disabled={busy}
                      style={{
                        height: 28, padding: '0 10px', borderRadius: 6, cursor: 'pointer',
                        border: `1px solid ${t.danger}`, background: 'transparent',
                        color: t.danger, fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap',
                      }}
                    >{tr('auth.mcp.deleteConfirm')}</button>
                  ) : (
                    <button
                      data-testid="mcp-delete"
                      onClick={() => setDeleteId(tok.id)}
                      title={tr('auth.mcp.deleteHint')}
                      style={{
                        height: 28, padding: '0 10px', borderRadius: 6, cursor: 'pointer',
                        border: `1px solid ${t.border}`, background: t.surface,
                        color: t.textMuted, fontSize: 11.5, fontWeight: 600, whiteSpace: 'nowrap',
                      }}
                    >{tr('common.delete')}</button>
                  )
                )}
              </div>
            );
          })}
        </div>
      )}

      <div style={{ fontSize: 11.5, color: t.textSubtle, marginTop: 12, lineHeight: 1.7 }}>
        {rich(tr('auth.mcp.scopeNote'))}
      </div>
    </div>
  );
}

/** 연결 주소는 **API 주소**다 — 앱 주소가 아니다(사용자가 가장 자주 헷갈리는 곳) */
function apiOrigin(): string {
  return (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/$/, '');
}
