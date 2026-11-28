// 계정 프로필 > 로그인 연결 (2026-11-28) — 카카오·네이버·구글을 이 계정에 잇고 끊는다.
//
//   · [연결]  → 공급자 로그인 → 돌아오면 이 계정에 그 로그인 수단이 붙는다(GoTrue 수동 연결)
//   · [해제]  → 그 수단으로는 더 이상 이 계정에 들어오지 못한다
//   · **마지막 로그인 수단은 끊지 못한다** — 비밀번호 없는 소셜 전용 계정이 잠기지 않게.
//     GoTrue 도 거절하지만(single_identity_not_deletable) 화면에서 먼저 막는다.
// 연결 목록은 GoTrue /user 의 identities 를 그대로 보여 준다(EMM 이 따로 들고 있지 않는다).
import { useCallback, useEffect, useState } from 'react';
import type { ThemeTokens } from '@/components/design-tokens/theme';
import { useTr } from '@/i18n';
import { getFreshAccessToken, useAuthStore } from '@/stores/authStore';
import { supabaseAuth, AuthError, type GoTrueIdentity } from '@/services/cloud/supabaseAuth';
import { beginSocial, LINK_NOTICE_KEY, SOCIAL_IDS, socialIdOf, type SocialId } from '@/services/cloud/socialAuth';
import { SOCIAL_BRAND, SOCIAL_LOGOS, useSocialAvailability } from '@/components/auth/SocialButtons';

/** 해제할 수 있나 — 남는 로그인 수단이 하나 이상 있어야 한다 */
export function canUnlink(identities: Pick<GoTrueIdentity, 'provider'>[], provider: SocialId): boolean {
  return identities.some((i) => socialIdOf(i.provider) === provider) && identities.length > 1;
}

export function LinkedAccounts({ t }: { t: ThemeTokens }) {
  const tr = useTr();
  const session = useAuthStore((s) => s.session);
  const avail = useSocialAvailability();
  const [ids, setIds] = useState<GoTrueIdentity[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const token = await getFreshAccessToken();
    if (!token) return;
    try { setIds((await supabaseAuth.getUser(token)).identities ?? []); }
    catch (e) { setErr(e instanceof AuthError ? e.message : tr('auth.social.failed')); }
  }, [tr]);

  useEffect(() => { if (session) void reload(); }, [session?.userId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(LINK_NOTICE_KEY);
      if (!raw) return;
      sessionStorage.removeItem(LINK_NOTICE_KEY);
      const n = JSON.parse(raw) as { provider?: SocialId; at?: number };
      if (n.provider && SOCIAL_IDS.includes(n.provider) && Date.now() - (n.at ?? 0) < 120_000) {
        setNote(tr('auth.social.linked', { provider: tr(`auth.social.name.${n.provider}`) }));
      }
    } catch { /* 안내만 빠진다 */ }
  }, [tr]);

  if (!session) return null;
  const link = async (p: SocialId) => {
    setBusy(p); setErr(null); setNote(null);
    try {
      const token = await getFreshAccessToken();
      await beginSocial(p, { mode: 'link', accessToken: token ?? undefined, userId: session.userId, returnTo: window.location.pathname + window.location.search });
    } catch (e) {
      setErr(e instanceof Error ? e.message : tr('auth.social.failed'));
      setBusy(null);
    }
  };
  const unlink = async (identity: GoTrueIdentity, p: SocialId) => {
    if (!ids || !canUnlink(ids, p)) return;
    if (!window.confirm(tr('auth.social.unlinkConfirm', { provider: tr(`auth.social.name.${p}`) }))) return;
    setBusy(p); setErr(null); setNote(null);
    try {
      const token = await getFreshAccessToken();
      if (!token) throw new AuthError(401, tr('cloud.err.loginRequired'));
      await supabaseAuth.unlinkIdentity(token, identity.identity_id);
      setNote(tr('auth.social.unlinked', { provider: tr(`auth.social.name.${p}`) }));
      await reload();
    } catch (e) {
      setErr(e instanceof AuthError && /single.?identity/i.test(e.message) ? tr('auth.social.lastMethod') : e instanceof Error ? e.message : tr('auth.social.failed'));
    } finally { setBusy(null); }
  };

  const row: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', border: `1px solid ${t.border}`, borderRadius: 8, background: t.surfaceAlt, minHeight: 40 };
  const btn = (primary: boolean): React.CSSProperties => ({
    height: 30, padding: '0 12px', borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
    border: `1px solid ${primary ? t.primaryBorder : t.border}`, background: primary ? t.primarySoft : t.surface, color: primary ? t.primary : t.text,
  });
  return (
    <div data-testid="linked-accounts" style={{ display: 'grid', gap: 6 }}>
      <div style={{ fontSize: 11.5, fontWeight: 700, color: t.textMuted }}>{tr('auth.social.sectionTitle')}</div>
      {SOCIAL_IDS.map((p) => {
        const identity = ids?.find((i) => socialIdOf(i.provider) === p);
        const on = !!avail?.[p];
        const b = SOCIAL_BRAND[p];
        return (
          <div key={p} data-testid={`linked-${p}`} data-linked={identity ? '1' : '0'} style={row}>
            <span style={{ width: 26, height: 26, borderRadius: 6, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: b.bg, border: `1px solid ${b.border}` }}>{SOCIAL_LOGOS[p]}</span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{tr(`auth.social.name.${p}`)}</span>
              <span style={{ display: 'block', fontSize: 11.5, color: identity ? t.text : t.textSubtle, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {identity ? (identity.identity_data?.email || tr('auth.social.connected')) : on ? tr('auth.social.notConnected') : tr('common.comingSoon')}
              </span>
            </span>
            {identity ? (
              <button type="button" data-testid={`unlink-${p}`} disabled={!!busy || !ids || !canUnlink(ids, p)}
                title={ids && !canUnlink(ids, p) ? tr('auth.social.lastMethod') : undefined}
                onClick={() => void unlink(identity, p)} style={{ ...btn(false), opacity: ids && canUnlink(ids, p) && !busy ? 1 : 0.5 }}>
                {busy === p ? tr('auth.busy') : tr('auth.social.unlink')}
              </button>
            ) : on ? (
              <button type="button" data-testid={`link-${p}`} disabled={!!busy || !ids} onClick={() => void link(p)} style={{ ...btn(true), opacity: busy ? 0.5 : 1 }}>
                {busy === p ? tr('auth.social.moving') : tr('auth.social.link')}
              </button>
            ) : null}
          </div>
        );
      })}
      <div style={{ fontSize: 11, color: t.textSubtle, lineHeight: 1.5 }}>{tr('auth.social.sectionHint')}</div>
      {note && <div role="status" data-testid="linked-note" style={{ fontSize: 12, color: t.success }}>{note}</div>}
      {err && <div role="alert" data-testid="linked-error" style={{ fontSize: 12, color: '#d9534f' }}>{err}</div>}
    </div>
  );
}
