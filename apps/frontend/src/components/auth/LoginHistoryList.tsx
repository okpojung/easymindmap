// 로그인 이력 목록 — **관리자와 사용자가 같은 것을 본다** (2026-08-14).
//   · 관리자 : 회원관리에서 아무 회원이나 (GET /v1/admin/users/:id/logins)
//   · 사용자 : 아바타 메뉴에서 **자기 것만** (GET /v1/account/logins)
//
// 한 벌로 두는 이유: 사건 이름·시간 표기·"기록이 없다"의 문구가 두 곳에서
// 갈리면, 같은 화면을 보고도 다르게 읽힌다.
//
// 기록의 주인은 **GoTrue 의 감사 로그**다. 우리가 만들지 않는다 —
// 그래서 설정이 없으면 **빈 목록이 아니라 "볼 수 없다"** 고 말한다.
// 빈 목록은 "로그인한 적이 없다"로 읽히기 때문이다.

import type { ThemeTokens } from '@/components/design-tokens/theme';

export interface LoginEvent {
  at: string;
  action: string;
  label: string;
  ip: string | null;
}
export interface LoginHistory {
  available: boolean;
  events: LoginEvent[];
  /** 이 목록의 상한 (서버가 준다) — "전부"와 "잘렸다"를 구분하려고 */
  limit: number;
  logins30d: number;
  loginsTotal: number;
  lastLoginAt: string | null;
}

/** 로그인은 **초까지** 본다 — 짧은 사이에 여러 번 들어온 것을 가려야 한다 */
export function fmtWhen(v: string | null): string {
  if (!v) return '—';
  const d = new Date(v);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} `
    + `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** 사건마다 색을 달리해 **로그인만 눈으로 훑을 수 있게** 한다 */
function actionColor(action: string, t: ThemeTokens): string {
  if (action === 'login') return t.primary;
  if (action === 'logout') return t.textSubtle;
  return t.textMuted;
}

export function LoginHistoryList({ t, data, compact = false }: {
  t: ThemeTokens;
  data: LoginHistory | null;
  /** 좁은 창(사용자 쪽)에서 쓰는 형태 */
  compact?: boolean;
}) {
  if (data === null) {
    return <div style={{ fontSize: 12.5, color: t.textSubtle }}>불러오는 중…</div>;
  }
  if (!data.available) {
    return (
      <div data-testid="login-history-unavailable" style={{
        fontSize: 12, color: t.textMuted, lineHeight: 1.8,
        padding: '10px 12px', borderRadius: 8,
        background: t.surfaceAlt, border: `1px solid ${t.border}`,
      }}>
        <b>로그인 기록을 볼 수 없습니다.</b>
        <br />
        로그인은 인증 서버(GoTrue)가 기록하며, 서버에 그 기록을 읽는 설정
        (<code>GOTRUE_DATABASE_URL</code>)이 아직 없습니다.
        {' '}<b>기록이 없다는 뜻이 아닙니다.</b>
      </div>
    );
  }

  const th = {
    textAlign: 'left' as const, padding: '6px 9px', fontSize: 11, fontWeight: 700,
    color: t.textMuted, borderBottom: `1px solid ${t.border}`, whiteSpace: 'nowrap' as const,
  };
  const td = {
    padding: '6px 9px', fontSize: compact ? 11.5 : 12.5,
    borderBottom: `1px solid ${t.divider}`, whiteSpace: 'nowrap' as const,
  };

  // **IP 칸은 값이 있을 때만 만든다** (2026-08-14 사용자 지적).
  // GoTrue 가 로그인 IP 를 기록하지 않아 칸이 통째로 '—' 로 찬다.
  // 줄줄이 '—' 를 보여 주는 것은 "기록이 없다"가 아니라 "고장 났다"로 읽힌다 —
  // 칸을 없애고 **왜 없는지 한 줄로** 말하는 편이 정직하다.
  const hasIp = data.events.some((e) => e.ip);

  return (
    <div data-testid="login-history">
      <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        <Stat t={t} label="최근 30일 로그인" value={`${data.logins30d}회`} />
        <Stat t={t} label="전체 로그인" value={`${data.loginsTotal}회`} />
        <Stat t={t} label="마지막 로그인" value={fmtWhen(data.lastLoginAt)} wide />
      </div>

      {data.events.length === 0 ? (
        <div data-testid="login-history-empty" style={{
          fontSize: 12, color: t.textSubtle, padding: '10px 12px',
          borderRadius: 8, background: t.surfaceAlt, border: `1px solid ${t.border}`,
        }}>아직 기록이 없습니다.</div>
      ) : (
        <div style={{
          overflow: 'auto', maxHeight: compact ? 300 : 460,
          border: `1px solid ${t.border}`, borderRadius: 9,
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', background: t.surface }}>
            <thead><tr>
              <th style={th}>시각</th><th style={th}>사건</th>
              {hasIp && <th style={th}>IP</th>}
            </tr></thead>
            <tbody>
              {data.events.map((e, i) => (
                <tr key={`${e.at}-${i}`} data-testid="login-history-row" data-action={e.action}>
                  <td style={td}>{fmtWhen(e.at)}</td>
                  <td style={{ ...td, color: actionColor(e.action, t), fontWeight: 700 }}>
                    {e.label}
                  </td>
                  {hasIp && <td style={{ ...td, color: t.textMuted }}>{e.ip ?? '—'}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div data-testid="login-history-note"
        style={{ fontSize: 10.5, color: t.textSubtle, marginTop: 8, lineHeight: 1.7 }}>
        {/* **몇 건까지 보이는지 규칙을 밝힌다** (2026-08-14 사용자 질문:
            "일부만 나오는데 규칙은 어떤건가?"). 그냥 "최근 N건"이라고만 쓰면
            그것이 전부인지 잘린 것인지 알 수 없다. */}
        {data.events.length >= data.limit && data.limit > 0
          ? <>이 목록은 <b>최근 {data.limit}건까지</b>만 보여 줍니다
              (전체 로그인 {data.loginsTotal}회).</>
          : <>기록 <b>전체 {data.events.length}건</b>입니다.</>}
        {' '}자동 토큰 갱신은 하루에도 수십 건씩 쌓여 <b>목록에서 뺐습니다</b> —
        사람이 한 일이 묻히지 않도록.
        {!hasIp && (
          <div data-testid="login-history-noip" style={{ marginTop: 4 }}>
            <b>IP 는 보여 드릴 수 없습니다.</b> 로그인을 기록하는 인증 서버(GoTrue)가
            접속 IP 를 남기지 않습니다(빈 값으로 저장합니다) — 우리 쪽에서 채울 수
            있는 값이 아닙니다.
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ t, label, value, wide }: {
  t: ThemeTokens; label: string; value: string; wide?: boolean;
}) {
  return (
    <div style={{
      padding: '7px 11px', borderRadius: 8, background: t.surfaceAlt,
      border: `1px solid ${t.border}`, minWidth: wide ? 170 : 84,
    }}>
      <div style={{ fontSize: 10, color: t.textMuted, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13.5, fontWeight: 800 }}>{value}</div>
    </div>
  );
}
