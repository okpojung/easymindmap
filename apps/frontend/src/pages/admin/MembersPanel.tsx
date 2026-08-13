// 회원관리 — 현황 조회 · 요금제 변경 · 사용용량 · 활동 (2026-08-13).
//
// ⚠️ **"로그인 정보"라고 부르지 않는다.** GoTrue 는 별도 DB 라 우리에게
// 로그인 기록이 없다. 우리가 아는 것은 **저장할 때 남는 기록**(시각·
// 플랫폼·브라우저·IP)뿐이다. 화면도 '마지막 활동'·'최근 30일 저장'으로
// 적어, 없는 것을 있는 것처럼 보이지 않게 한다.

import { useEffect, useState } from 'react';
import type { ThemeTokens } from '@/components/design-tokens/theme';
import { adminApi, type AdminUserRow } from '@/services/cloud/adminApi';
import { CloudError } from '@/services/cloud/apiClient';

const PLANS = ['free', 'basic', 'pro', 'team'] as const;

function fmtBytes(b: number): string {
  if (!b) return '0';
  const gb = b / 1024 ** 3;
  if (gb >= 1) return `${Math.round(gb * 100) / 100}GB`;
  const mb = b / 1024 ** 2;
  if (mb >= 1) return `${Math.round(mb * 10) / 10}MB`;
  return `${Math.max(1, Math.round(b / 1024))}KB`;
}
function fmtDate(v: string | null): string {
  if (!v) return '—';
  const d = new Date(v);
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
}

export function MembersPanel({ t }: { t: ThemeTokens }) {
  const [rows, setRows] = useState<AdminUserRow[] | null>(null);
  const [sum, setSum] = useState<Awaited<ReturnType<typeof adminApi.summary>> | null>(null);
  const [q, setQ] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const load = (query = q) => {
    setErr(null);
    Promise.all([adminApi.users(query), adminApi.summary()])
      .then(([u, s]) => { setRows(u.users); setSum(s); })
      .catch((e: unknown) => setErr(e instanceof CloudError ? e.message : '불러오지 못했습니다.'));
  };
  useEffect(() => { load(''); /* 첫 진입 1회 */ }, []);

  const changePlan = (u: AdminUserRow, plan: string) => {
    if (plan === u.plan) return;
    // 되돌릴 수 있는 변경이지만 **남의 계정**이다 — 한 번 묻는다.
    if (!window.confirm(`${u.email ?? u.id} 님의 요금제를 ${u.plan} → ${plan} 으로 바꿉니다.`)) return;
    setBusyId(u.id); setErr(null);
    adminApi.setPlan(u.id, plan)
      .then((r) => {
        setRows((prev) => prev?.map((x) => (
          x.id === u.id ? { ...x, plan: r.plan, quotaBytes: r.quotaBytes } : x
        )) ?? null);
        setFlash(`${r.email ?? u.id} → ${r.plan} (${fmtBytes(r.quotaBytes)})`);
        window.setTimeout(() => setFlash(null), 4000);
      })
      .catch((e: unknown) => setErr(e instanceof CloudError ? e.message : '바꾸지 못했습니다.'))
      .finally(() => setBusyId(null));
  };

  const th = {
    textAlign: 'left' as const, padding: '8px 10px', fontSize: 11.5, fontWeight: 700,
    color: t.textMuted, borderBottom: `1px solid ${t.border}`, whiteSpace: 'nowrap' as const,
  };
  const td = {
    padding: '8px 10px', fontSize: 12.5, borderBottom: `1px solid ${t.divider}`,
    whiteSpace: 'nowrap' as const,
  };

  return (
    <div data-testid="admin-members">
      {/* 요약 */}
      {sum && (
        <div data-testid="admin-summary" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
          <Card t={t} label="전체 회원" value={`${sum.total}명`} />
          <Card t={t} label="최근 7일 가입" value={`${sum.new7d}명`} />
          <Card t={t} label="최근 30일 가입" value={`${sum.new30d}명`} />
          {sum.byPlan.map((p) => (
            <Card key={p.plan} t={t} label={p.plan} value={`${p.users}명`} sub={fmtBytes(p.fileBytes)} />
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input
          data-testid="admin-search" value={q} placeholder="이메일 · 성명으로 찾기"
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') load(); }}
          style={{
            flex: 1, height: 34, padding: '0 10px', borderRadius: 7, boxSizing: 'border-box',
            border: `1px solid ${t.border}`, background: t.surfaceAlt, color: t.text, fontSize: 13,
          }}
        />
        <button
          data-testid="admin-reload" onClick={() => load()}
          style={{
            height: 34, padding: '0 14px', borderRadius: 7, cursor: 'pointer',
            border: `1px solid ${t.border}`, background: t.surfaceAlt, color: t.text,
            fontSize: 12.5, fontWeight: 700,
          }}
        >새로고침</button>
      </div>

      {flash && (
        <div data-testid="admin-flash" style={{
          marginBottom: 10, padding: '8px 10px', borderRadius: 7, fontSize: 12.5,
          background: t.primarySoft, border: `1px solid ${t.primaryBorder}`, color: t.primary,
        }}>바꿨습니다 — {flash}</div>
      )}
      {err && (
        <div data-testid="admin-members-error" style={{
          marginBottom: 10, fontSize: 12.5, color: t.danger,
        }}>{err}</div>
      )}

      <div style={{ overflowX: 'auto', border: `1px solid ${t.border}`, borderRadius: 10 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', background: t.surface }}>
          <thead>
            <tr>
              <th style={th}>이메일</th>
              <th style={th}>성명</th>
              <th style={th}>요금제</th>
              <th style={th}>사용량 / 한도</th>
              <th style={th}>맵</th>
              <th style={th}>첨부</th>
              <th style={th}>최근 30일 저장</th>
              <th style={th}>마지막 활동</th>
              <th style={th}>가입</th>
            </tr>
          </thead>
          <tbody>
            {rows === null && (
              <tr><td style={{ ...td, color: t.textSubtle }} colSpan={9}>불러오는 중…</td></tr>
            )}
            {rows?.length === 0 && (
              <tr><td style={{ ...td, color: t.textSubtle }} colSpan={9}>해당하는 회원이 없습니다.</td></tr>
            )}
            {rows?.map((u) => (
              <tr key={u.id} data-testid="admin-user-row" data-email={u.email ?? ''}>
                <td style={td}>
                  {u.email ?? <span style={{ color: t.textSubtle }}>(이메일 없음)</span>}
                  {!u.emailVerifiedAt && (
                    <span title="이메일 인증 기록이 없습니다" style={{
                      marginLeft: 5, fontSize: 9.5, color: t.textSubtle,
                      border: `1px solid ${t.border}`, borderRadius: 7, padding: '1px 5px',
                    }}>미인증</span>
                  )}
                </td>
                <td style={td}>{u.fullName ?? '—'}</td>
                <td style={td}>
                  <select
                    data-testid="admin-plan-select"
                    value={u.plan} disabled={busyId === u.id}
                    onChange={(e) => changePlan(u, e.target.value)}
                    style={{
                      height: 26, borderRadius: 6, padding: '0 6px', fontSize: 12,
                      border: `1px solid ${u.plan === 'free' ? t.border : t.primaryBorder}`,
                      background: u.plan === 'free' ? t.surfaceAlt : t.primarySoft,
                      color: u.plan === 'free' ? t.text : t.primary, fontWeight: 700,
                      cursor: busyId === u.id ? 'default' : 'pointer',
                    }}
                  >
                    {PLANS.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </td>
                <td style={td}>
                  {fmtBytes(u.usedBytes)} / {fmtBytes(u.quotaBytes)}
                  <span style={{ color: t.textSubtle, marginLeft: 5, fontSize: 11 }}>
                    (문서 {fmtBytes(u.docBytes)} · 첨부 {fmtBytes(u.fileBytes)})
                  </span>
                </td>
                <td style={td}>{u.maps}</td>
                <td style={td}>{u.attachments}</td>
                <td style={td}>{u.saves30d}</td>
                <td style={td}>
                  {fmtDate(u.lastSeenAt)}
                  {u.lastSeenAt && (
                    <span style={{ color: t.textSubtle, marginLeft: 5, fontSize: 11 }}>
                      {[u.lastPlatform, u.lastBrowser, u.lastIp].filter(Boolean).join(' · ') || ''}
                    </span>
                  )}
                </td>
                <td style={td}>{fmtDate(u.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ fontSize: 11, color: t.textSubtle, marginTop: 10, lineHeight: 1.7 }}>
        <b>‘마지막 활동’과 ‘최근 30일 저장’은 로그인 기록이 아니라 저장 기록입니다.</b>
        {' '}로그인은 인증 서버(GoTrue)가 별도 DB 에 관리해 우리 쪽에 기록이 남지 않습니다.
        요금제를 바꾸면 저장 한도는 DB 트리거가 함께 맞춥니다 — 그 사람이 아바타 메뉴를
        다시 열면 바로 보입니다(재로그인 불필요).
      </div>
    </div>
  );
}

function Card({ t, label, value, sub }: {
  t: ThemeTokens; label: string; value: string; sub?: string;
}) {
  return (
    <div style={{
      padding: '9px 13px', borderRadius: 9, background: t.surface,
      border: `1px solid ${t.border}`, minWidth: 96,
    }}>
      <div style={{ fontSize: 10.5, color: t.textMuted, marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 800 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: t.textSubtle, marginTop: 2 }}>첨부 {sub}</div>}
    </div>
  );
}
