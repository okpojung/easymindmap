// 회원관리 — 현황 조회 · 요금제 변경 · 사용용량 · 활동 (2026-08-13).
//
// **두 가지를 나란히 보여 준다** (2026-08-13 로그인 이력 추가).
//   · 마지막 로그인 — **GoTrue** 가 아는 진짜 로그인 시각
//   · 마지막 활동   — 우리 DB 의 **저장** 기록(플랫폼·브라우저·IP)
// 둘은 다르다. 로그인만 하고 아무것도 저장하지 않을 수 있고, 반대로
// 오래 열어 둔 탭이 저장만 계속할 수도 있다. 하나로 합치면 어느 쪽인지
// 알 수 없어진다.
//
// GoTrue 를 못 부르면 **'마지막 로그인' 칸만 비고 목록은 그대로 나온다** —
// 그리고 화면이 그 이유를 밝힌다(없는 것을 있는 척하지 않는다).

import { Fragment, useEffect, useState } from 'react';
import type { ThemeTokens } from '@/components/design-tokens/theme';
import { adminApi, type AdminUserRow } from '@/services/cloud/adminApi';
import { LoginHistoryList, type LoginHistory } from '@/components/auth/LoginHistoryList';
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
/** 로그인은 **분까지** 본다 — 같은 날 여러 번 들어온 것을 가려야 한다 */
function fmtDateTime(v: string | null): string {
  if (!v) return '—';
  const d = new Date(v);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function MembersPanel({ t }: { t: ThemeTokens }) {
  const [rows, setRows] = useState<AdminUserRow[] | null>(null);
  /** GoTrue 를 불러 왔나 — false 면 '마지막 로그인'이 비어 있는 이유를 밝힌다 */
  const [loginOk, setLoginOk] = useState(true);
  const [sum, setSum] = useState<Awaited<ReturnType<typeof adminApi.summary>> | null>(null);
  const [q, setQ] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  /**
   * 펼쳐 놓은 회원의 **로그인 이력** (2026-08-13).
   * 목록 조회에 함께 싣지 않는 이유: 회원 200명이면 감사 로그를 200번
   * 뒤지게 된다. **누른 사람 것만** 그때 가져온다.
   */
  const [histFor, setHistFor] = useState<string | null>(null);
  const [hist, setHist] = useState<LoginHistory | null>(null);

  const toggleHistory = (u: AdminUserRow) => {
    if (histFor === u.id) { setHistFor(null); return; }
    setHistFor(u.id); setHist(null);
    adminApi.userLogins(u.id)
      .then(setHist)
      .catch(() => setHist({
        available: false, events: [], logins30d: 0, loginsTotal: 0, lastLoginAt: null,
      }));
  };

  const load = (query = q) => {
    setErr(null);
    Promise.all([adminApi.users(query), adminApi.summary()])
      .then(([u, s]) => { setRows(u.users); setSum(s); setLoginOk(u.loginHistoryAvailable); })
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
              <th style={th}>마지막 로그인</th>
              <th style={th}>마지막 활동(저장)</th>
              <th style={th}>가입</th>
              <th style={th}>이력</th>
            </tr>
          </thead>
          <tbody>
            {rows === null && (
              <tr><td style={{ ...td, color: t.textSubtle }} colSpan={11}>불러오는 중…</td></tr>
            )}
            {rows?.length === 0 && (
              <tr><td style={{ ...td, color: t.textSubtle }} colSpan={11}>해당하는 회원이 없습니다.</td></tr>
            )}
            {rows?.map((u) => (
              // 한 회원이 두 줄(본문 + 펼친 이력)이 될 수 있어 묶는다
              <Fragment key={u.id}>
              <tr data-testid="admin-user-row" data-email={u.email ?? ''}>
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
                  {u.lastSignInAt ? fmtDateTime(u.lastSignInAt)
                    : <span style={{ color: t.textSubtle }}>—</span>}
                  {u.bannedUntil && (
                    <span title={`차단: ${u.bannedUntil}`} style={{
                      marginLeft: 5, fontSize: 9.5, color: t.danger,
                      border: `1px solid ${t.danger}`, borderRadius: 7, padding: '1px 5px',
                    }}>차단</span>
                  )}
                </td>
                <td style={td}>
                  {fmtDate(u.lastSeenAt)}
                  {u.lastSeenAt && (
                    <span style={{ color: t.textSubtle, marginLeft: 5, fontSize: 11 }}>
                      {[u.lastPlatform, u.lastBrowser, u.lastIp].filter(Boolean).join(' · ') || ''}
                    </span>
                  )}
                </td>
                <td style={td}>{fmtDate(u.createdAt)}</td>
                <td style={td}>
                  <button
                    data-testid="admin-history-toggle"
                    onClick={() => toggleHistory(u)}
                    style={{
                      height: 24, padding: '0 8px', borderRadius: 6, cursor: 'pointer',
                      border: `1px solid ${histFor === u.id ? t.primaryBorder : t.border}`,
                      background: histFor === u.id ? t.primarySoft : t.surfaceAlt,
                      color: histFor === u.id ? t.primary : t.text,
                      fontSize: 11.5, fontWeight: 700,
                    }}
                  >{histFor === u.id ? '닫기' : '로그인 이력'}</button>
                </td>
              </tr>
              {histFor === u.id && (
                <tr data-testid="admin-history-panel">
                  <td colSpan={11} style={{ padding: '10px 12px', background: t.surfaceAlt }}>
                    <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>
                      {u.email ?? u.id} 의 로그인 이력
                    </div>
                    <LoginHistoryList t={t} data={hist} />
                  </td>
                </tr>
              )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {!loginOk && (
        <div data-testid="admin-login-unavailable" style={{
          marginTop: 10, padding: '8px 10px', borderRadius: 7, fontSize: 12,
          background: t.surfaceAlt, border: `1px solid ${t.border}`, color: t.textMuted,
          lineHeight: 1.7,
        }}>
          <b>‘마지막 로그인’을 가져오지 못했습니다.</b> 인증 서버(GoTrue)를 부르지 못한
          것이며, 목록의 나머지 값은 정상입니다. api 의 <code>GOTRUE_URL</code> 설정과
          로그를 확인해 주세요.
        </div>
      )}

      <div style={{ fontSize: 11, color: t.textSubtle, marginTop: 10, lineHeight: 1.7 }}>
        <b>‘마지막 로그인’은 인증 서버(GoTrue)가 아는 진짜 로그인 시각</b>이고,
        <b>‘마지막 활동(저장)’과 ‘최근 30일 저장’은 저장 기록</b>입니다 — 로그인만 하고
        아무것도 저장하지 않을 수도, 반대로 오래 열어 둔 탭이 저장만 계속할 수도 있어
        나눠서 보여 줍니다. 요금제를 바꾸면 저장 한도는 DB 트리거가 함께 맞춥니다 —
        그 사람이 아바타 메뉴를 다시 열면 바로 보입니다(재로그인 불필요).
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
