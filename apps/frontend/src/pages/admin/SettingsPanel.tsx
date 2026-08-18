// 설정관리 — **DB 값만 편집, 나머지는 조회** (2026-08-13 조회 → 08-14 편집).
//
// "개발하면서 정한 값들이 어떤 것이 있는지 조사하고 관리" 요청의 뒷부분.
// 먼저 무엇이 어디에 있는지 모았고(1차), 이제 **바꿔도 되는 것만** 연다.
//
// 값은 서버(실제 env·DB)와 화면(실제 상수 import)에서 각각 **살아 있는
// 값을 가져와** 합친다. 어느 쪽도 베껴 적지 않는다.
//
// 바꾸는 방법은 값마다 다르고, 그 차이가 중요해서 배지로 구분한다.
//   db   — **여기서 바꾼다** (2026-08-14 사용자 결정)
//   env  — 서버 환경변수 (Coolify 에서 고치고 재배포)
//   code — 코드에 박혀 있다 (고치려면 배포가 필요하다)
//
// **환경변수를 화면에서 바꾸게 만들지 않은 이유**: 관리자 콘솔이 서버를
// 멈출 수 있는 도구가 된다. `CORS_ORIGIN` 하나만 잘못 넣어도 전원이
// 로그인하지 못하고, 그 상태를 화면에서 되돌릴 수도 없다(콘솔도 같이
// 막힌다). 코드 상수는 애초에 빌드에 박혀 있어 못 바꾼다.
//
// **편집 가능 여부는 서버가 정한다**(`item.editable`). 화면이
// `source === 'db'` 로 짐작하면, 나중에 못 고치는 DB 값이 생겼을 때
// 입력칸이 먼저 생기고 저장에서 터진다.

import { useEffect, useState } from 'react';
import type { ThemeTokens } from '@/components/design-tokens/theme';
import { adminApi, type SettingGroup, type SettingItem } from '@/services/cloud/adminApi';
import { CloudError } from '@/services/cloud/apiClient';
import { frontendSettings } from './settingsCatalog';

const SOURCE_LABEL: Record<string, string> = {
  env: '환경변수', db: 'DB', code: '코드',
};

/** MB 를 사람이 읽는 크기로 — 10240 MB 보다 10 GB 가 낫다 */
function human(mb: number): string {
  if (mb >= 1024 * 1024) return `${+(mb / 1024 / 1024).toFixed(2)} TB`;
  if (mb >= 1024) return `${+(mb / 1024).toFixed(2)} GB`;
  return `${mb} MB`;
}

export function SettingsPanel({ t }: { t: ThemeTokens }) {
  const [groups, setGroups] = useState<SettingGroup[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = () => adminApi.settings()
    // 서버 값 먼저, 화면 값 뒤 — 읽는 사람이 서버부터 보게 된다
    .then((r) => { setGroups([...r.groups, ...frontendSettings()]); setErr(null); })
    .catch((e: unknown) => setErr(e instanceof CloudError ? e.message : '불러오지 못했습니다.'));

  useEffect(() => { void load(); }, []);

  const th = {
    textAlign: 'left' as const, padding: '7px 10px', fontSize: 11, fontWeight: 700,
    color: t.textMuted, borderBottom: `1px solid ${t.border}`,
  };
  const td = { padding: '7px 10px', fontSize: 12.5, borderBottom: `1px solid ${t.divider}` };

  return (
    <div data-testid="admin-settings">
      <div style={{
        fontSize: 12, color: t.textMuted, lineHeight: 1.7, marginBottom: 14,
        padding: '10px 12px', borderRadius: 8,
        background: t.surfaceAlt, border: `1px solid ${t.border}`,
      }}>
        값은 서버의 실제 환경변수·DB 와 화면의 실제 상수에서 가져오므로
        <b> 화면에 보이는 것이 지금 돌고 있는 값</b>입니다.
        <br />
        <b>여기서 바꿀 수 있는 것은 DB 값뿐입니다.</b> 환경변수는 Coolify 에서 고치고
        재배포해야 하고 — 화면에서 바꾸게 하면 관리자 콘솔이 <b>서버를 멈출 수 있는
        도구</b>가 됩니다 — 코드 상수는 빌드에 박혀 있어 바꿀 수 없습니다.
        항목마다 <b>어디를 고치는지</b> 적어 두었습니다.
      </div>

      {err && <div data-testid="admin-settings-error" style={{ color: t.danger, fontSize: 12.5 }}>{err}</div>}
      {groups === null && !err && <div style={{ color: t.textSubtle, fontSize: 12.5 }}>불러오는 중…</div>}

      {groups?.map((g) => (
        <div key={g.id} data-testid="admin-settings-group" style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 2 }}>{g.title}</div>
          <div style={{ fontSize: 11.5, color: t.textMuted, marginBottom: 8, lineHeight: 1.6 }}>{g.why}</div>
          <div style={{ overflowX: 'auto', border: `1px solid ${t.border}`, borderRadius: 9 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', background: t.surface }}>
              <thead>
                <tr>
                  <th style={th}>항목</th>
                  <th style={{ ...th, whiteSpace: 'nowrap' }}>지금 값</th>
                  <th style={{ ...th, whiteSpace: 'nowrap' }}>주인</th>
                  <th style={th}>바꾸려면</th>
                </tr>
              </thead>
              <tbody>
                {g.items.map((it) => (
                  <tr key={it.key} data-testid="admin-setting-row" data-key={it.key}
                    data-editable={it.editable ? 'yes' : 'no'}>
                    <td style={td}>
                      {it.label}
                      <div style={{ fontSize: 10, color: t.textSubtle, fontFamily: 'monospace' }}>{it.key}</div>
                    </td>
                    <td style={{ ...td, whiteSpace: 'nowrap', fontWeight: 700 }}>
                      {it.editable?.kind === 'planQuotaMb'
                        ? <QuotaEditor t={t} item={it} onSaved={load} />
                        : it.editable?.kind === 'planPriceKrw'
                          ? <PriceEditor t={t} item={it} onSaved={load} />
                          : <>{String(it.value)}{it.unit ? ` ${it.unit}` : ''}</>}
                    </td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 7,
                        border: `1px solid ${it.source === 'code' ? t.border : t.primaryBorder}`,
                        background: it.source === 'code' ? t.surfaceAlt : t.primarySoft,
                        color: it.source === 'code' ? t.textMuted : t.primary,
                      }}>{SOURCE_LABEL[it.source] ?? it.source}</span>
                    </td>
                    <td style={{ ...td, fontSize: 11.5, color: t.textMuted, lineHeight: 1.6 }}>
                      {it.where}
                      {it.note && <div style={{ color: t.textSubtle, marginTop: 2 }}>{it.note}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      <div style={{ fontSize: 11, color: t.textSubtle, lineHeight: 1.7 }}>
        레이아웃 치수(노드 간격 같은 픽셀 값)는 일부러 담지 않았습니다 — 디자인이라 코드가
        주인이고, 목록에 섞이면 정작 봐야 할 정책 값이 묻힙니다.
      </div>
    </div>
  );
}

/**
 * 요금제 **구독 요금** 편집 (2026-08-18).
 *
 * 한도와 달리 **이미 결제한 사람에게는 아무 일도 일어나지 않는다** —
 * 원장이 그때의 청구액을 이미 들고 있다. 그래서 확인 문구도 다르다:
 * "회원 한도가 바뀝니다"가 아니라 **"앞으로의 결제에 적용된다"**이다.
 */
function PriceEditor({ t, item, onSaved }: {
  t: ThemeTokens; item: SettingItem; onSaved: () => Promise<void> | void;
}) {
  const e = item.editable!;
  const current = Number(item.value) || 0;
  const [krw, setKrw] = useState(String(current));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { setKrw(String(current)); }, [current]);

  const n = Number(krw);
  // 0(무료) 이거나 1,000원 이상. **1~999 를 여기서 막는다** — PG 최소
  // 결제 금액이라, 통과시키면 저장은 되는데 결제창에서 거절된다.
  const valid = Number.isInteger(n) && n >= 0 && n <= e.max && (n === 0 || n >= 1000);
  const changed = valid && n !== current;
  const won = (v: number) => v.toLocaleString('ko-KR') + '원';

  const save = async () => {
    if (!changed) return;
    const ok = window.confirm(
      `${e.plan} 요금제 구독 요금을 ${won(current)} → ${won(n)} 로 바꿉니다.\n\n`
      + '**앞으로의 결제**에 적용됩니다. 이미 결제한 건은 그대로입니다.\n'
      + (n === 0 ? '0 원은 "결제하지 않는 요금제"라는 뜻입니다.\n' : '')
      + '\n계속할까요?',
    );
    if (!ok) return;
    setBusy(true); setErr(null); setMsg(null);
    try {
      const r = await adminApi.setPlanPrice(e.plan, n);
      setMsg(`${won(current)} → ${won(r.krw)} · 앞으로의 결제에 적용`);
      await onSaved();
    } catch (x) {
      setErr(x instanceof CloudError ? x.message : '바꾸지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <input
          data-testid="price-input" data-plan={e.plan}
          type="number" min={0} max={e.max} step={100} value={krw} disabled={busy}
          onChange={(ev) => setKrw(ev.target.value)}
          onKeyDown={(ev) => { if (ev.key === 'Enter') void save(); }}
          style={{
            width: 110, height: 28, padding: '0 7px', fontSize: 12.5, fontWeight: 700,
            borderRadius: 6, textAlign: 'right',
            border: `1px solid ${valid ? t.border : t.danger}`,
            background: t.surface, color: t.text,
          }}
        />
        <span style={{ fontSize: 11.5, color: t.textMuted, fontWeight: 400 }}>원/월</span>
        <button
          data-testid="price-save" data-plan={e.plan}
          onClick={() => void save()} disabled={!changed || busy}
          style={{
            height: 28, padding: '0 10px', borderRadius: 6, fontSize: 11.5, fontWeight: 700,
            cursor: changed && !busy ? 'pointer' : 'default',
            border: `1px solid ${changed ? t.primaryBorder : t.border}`,
            background: changed ? t.primary : t.surfaceAlt,
            color: changed ? '#fff' : t.textSubtle,
          }}
        >{busy ? '저장 중…' : '저장'}</button>
      </div>
      <div style={{ fontSize: 10.5, color: t.textSubtle, fontWeight: 400 }}>
        {valid
          ? (n === 0 ? '무료 — 결제하지 않습니다' : `= ${won(n)} / 월`)
          : '0(무료) 이거나 1,000원 이상 — PG 최소 결제 금액입니다'}
      </div>
      {msg && <div data-testid="price-result" style={{ fontSize: 10.5, color: t.primary, fontWeight: 400 }}>{msg}</div>}
      {err && <div data-testid="price-error" style={{ fontSize: 10.5, color: t.danger, fontWeight: 400 }}>{err}</div>}
    </div>
  );
}

/** 요금제 한도 편집 — **남의 계정 한도를 바꾸는 일**이라 한 번 묻는다 */
function QuotaEditor({ t, item, onSaved }: {
  t: ThemeTokens; item: SettingItem; onSaved: () => Promise<void> | void;
}) {
  const e = item.editable!;
  const current = Number(item.value);
  const [mb, setMb] = useState(String(current));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // 서버가 새 값을 주면 입력칸도 따라간다 (다른 항목을 저장해 목록을 다시
  // 받았을 때, 이 칸만 옛 값으로 남아 있으면 무엇이 참인지 알 수 없다)
  useEffect(() => { setMb(String(current)); }, [current]);

  const n = Number(mb);
  const valid = Number.isInteger(n) && n >= e.min && n <= e.max;
  const changed = valid && n !== current;

  const save = async () => {
    if (!changed) return;
    const ok = window.confirm(
      `${e.plan} 요금제 한도를 ${human(current)} → ${human(n)} 로 바꿉니다.\n\n`
      + '이 요금제를 쓰는 회원의 한도가 함께 바뀝니다.\n'
      + '한도를 따로 올려 둔 계정(특별 계약)은 그대로 둡니다.\n\n계속할까요?',
    );
    if (!ok) return;
    setBusy(true); setErr(null); setMsg(null);
    try {
      const r = await adminApi.setPlanQuota(e.plan, n);
      setMsg(`${human(r.previousMb)} → ${human(r.mb)} · 회원 ${r.usersUpdated}명 반영`
        + (r.usersKept > 0 ? ` · ${r.usersKept}명은 특별 계약이라 그대로` : ''));
      await onSaved();
    } catch (x) {
      setErr(x instanceof CloudError ? x.message : '바꾸지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <input
          data-testid="quota-input"
          data-plan={e.plan}
          type="number" min={e.min} max={e.max} step={1} value={mb} disabled={busy}
          onChange={(ev) => setMb(ev.target.value)}
          onKeyDown={(ev) => { if (ev.key === 'Enter') void save(); }}
          style={{
            width: 92, height: 28, padding: '0 7px', fontSize: 12.5, fontWeight: 700,
            borderRadius: 6, textAlign: 'right',
            border: `1px solid ${valid ? t.border : t.danger}`,
            background: t.surface, color: t.text,
          }}
        />
        <span style={{ fontSize: 11.5, color: t.textMuted, fontWeight: 400 }}>MB</span>
        <button
          data-testid="quota-save" data-plan={e.plan}
          onClick={() => void save()} disabled={!changed || busy}
          style={{
            height: 28, padding: '0 10px', borderRadius: 6, fontSize: 11.5, fontWeight: 700,
            cursor: changed && !busy ? 'pointer' : 'default',
            border: `1px solid ${changed ? t.primaryBorder : t.border}`,
            background: changed ? t.primary : t.surfaceAlt,
            color: changed ? '#fff' : t.textSubtle,
          }}
        >{busy ? '저장 중…' : '저장'}</button>
      </div>

      {/* 숫자만 보면 자릿수를 놓친다 — 10240 MB 옆에 10 GB 를 같이 둔다 */}
      <div style={{ fontSize: 10.5, color: t.textSubtle, fontWeight: 400 }}>
        {valid ? `= ${human(n)}` : `${e.min} ~ ${e.max} 사이의 정수`}
      </div>
      {msg && (
        <div data-testid="quota-result" style={{ fontSize: 10.5, color: t.primary, fontWeight: 400, lineHeight: 1.6 }}>
          {msg}
        </div>
      )}
      {err && (
        <div data-testid="quota-error" style={{ fontSize: 10.5, color: t.danger, fontWeight: 400 }}>
          {err}
        </div>
      )}
    </div>
  );
}
