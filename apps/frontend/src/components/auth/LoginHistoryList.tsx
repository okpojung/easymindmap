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
  /** 'Windows 11 · Chrome 136' — 로그인 줄에만 붙는다 (2026-08-14) */
  device?: string | null;
}
export interface LoginHistory {
  available: boolean;
  events: LoginEvent[];
  /** 이 목록의 상한 (서버가 준다) — "전부"와 "잘렸다"를 구분하려고 */
  limit: number;
  /** 접속한 곳이 왜 안 보이는가 — 서버가 정한다 (2026-08-14) */
  ipSource?: 'ok' | 'no-table' | 'no-records';
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

  // **접속한 곳 칸은 늘 보여 준다** (2026-08-14 사용자 지적).
  //
  // 처음에는 값이 하나도 없으면 칸을 숨겼다 — GoTrue 가 IP 를 아예 남기지
  // 않던 때라 칸이 **영원히** '—' 로 차 있었고, 그건 "기록이 없다"가 아니라
  // "고장 났다"로 읽혔기 때문이다.
  //
  // 이제는 우리가 직접 기록해 값이 실제로 채워진다. 그러면 숨기는 쪽이
  // 오히려 나쁘다 — **회원마다 표의 칸 수가 달라져** 같은 화면을 보고도
  // 다른 것으로 읽힌다(관리자가 두 회원을 나란히 볼 때 특히). 빈 값은
  // '—' 로 두고, **왜 비었는지는 목록 아래 한 줄**이 말한다.
  const hasIp = data.events.some((e) => e.ip || e.device);

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
              <th style={th}>접속한 곳</th>
            </tr></thead>
            <tbody>
              {data.events.map((e, i) => (
                <tr key={`${e.at}-${i}`} data-testid="login-history-row" data-action={e.action}>
                  <td style={td}>{fmtWhen(e.at)}</td>
                  <td style={{ ...td, color: actionColor(e.action, t), fontWeight: 700 }}>
                    {e.label}
                  </td>
                  <td style={{ ...td, color: t.textMuted, verticalAlign: 'top' }}>
                    {e.ip ?? '—'}
                    {/* 기기는 아래 줄로 — 옆에 붙이면 좁은 창에서 표가 넘친다 */}
                    {e.device && (
                      <div style={{ fontSize: 10, color: t.textSubtle, marginTop: 1 }}>
                        {e.device}
                      </div>
                    )}
                  </td>
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
        {/* 접속한 곳이 안 보일 때, **무엇을 하면 보이는지**까지 말한다
            (2026-08-14 사용자 지적: "이젠 이력화면에서 IP가 빠졌다").
            원인이 둘인데 한 문장으로 뭉뚱그리면, 델타 SQL 을 안 넣은 것인지
            다시 로그인을 안 한 것인지 알 수 없다. 서버가 `ipSource` 로 가른다. */}
        {!hasIp && data.ipSource === 'no-table' ? (
          <div data-testid="login-history-noip" data-why="no-table" style={{ marginTop: 4 }}>
            <b>접속한 곳을 아직 기록하지 않습니다.</b> 서버에 접속 기록 표
            (<code>login_events</code>)가 없습니다 — 관리자가 델타 SQL
            (<code>dev-server-runbook.md §1.5-0-F</code>)을 적용해야 합니다.
          </div>
        ) : !hasIp ? (
          <div data-testid="login-history-noip" data-why="no-records" style={{ marginTop: 4 }}>
            <b>접속한 곳은 다시 로그인하면 그때부터 보입니다.</b> 인증 서버(GoTrue)가
            접속 IP 를 남기지 않아 우리 서버가 직접 기록하는데, <b>기록을 시작한 뒤의
            로그인</b>부터 쌓입니다. 지난 로그인의 IP 는 남아 있지 않습니다.
          </div>
        ) : data.events.some((e) => e.action === 'login' && !e.ip) ? (
          <div data-testid="login-history-partial-ip" style={{ marginTop: 4 }}>
            접속한 곳이 <b>비어 있는 줄</b>은 우리 서버가 기록을 시작하기 전의
            로그인입니다.
          </div>
        ) : null}
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
