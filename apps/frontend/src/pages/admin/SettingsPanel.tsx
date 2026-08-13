// 설정관리 — **1차는 조회 전용** (2026-08-13).
//
// "개발하면서 정한 값들이 어떤 것이 있는지 조사하고 관리" 요청의 앞부분.
// 먼저 **무엇이 어디에 있는지 한 화면에 모으는 것**이 먼저다 — 목록 없이
// 바꾸는 기능부터 만들면 무엇을 바꾸는지 모른 채 바꾸게 된다.
//
// 값은 서버(실제 env·DB)와 화면(실제 상수 import)에서 각각 **살아 있는
// 값을 가져와** 합친다. 어느 쪽도 베껴 적지 않는다.
//
// 바꾸는 방법은 값마다 다르고, 그 차이가 중요해서 배지로 구분한다.
//   env  — 서버 환경변수 (Coolify 에서 고치고 재배포)
//   db   — DB 가 정한다 (SQL 로 고친다)
//   code — 코드에 박혀 있다 (고치려면 배포가 필요하다)

import { useEffect, useState } from 'react';
import type { ThemeTokens } from '@/components/design-tokens/theme';
import { adminApi, type SettingGroup } from '@/services/cloud/adminApi';
import { CloudError } from '@/services/cloud/apiClient';
import { frontendSettings } from './settingsCatalog';

const SOURCE_LABEL: Record<string, string> = {
  env: '환경변수', db: 'DB', code: '코드',
};

export function SettingsPanel({ t }: { t: ThemeTokens }) {
  const [groups, setGroups] = useState<SettingGroup[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    adminApi.settings()
      // 서버 값 먼저, 화면 값 뒤 — 읽는 사람이 서버부터 보게 된다
      .then((r) => setGroups([...r.groups, ...frontendSettings()]))
      .catch((e: unknown) => setErr(e instanceof CloudError ? e.message : '불러오지 못했습니다.'));
  }, []);

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
        지금은 <b>조회 전용</b>입니다. 값은 서버의 실제 환경변수·DB 와 화면의 실제 상수에서
        가져오므로 <b>화면에 보이는 것이 지금 돌고 있는 값</b>입니다.
        바꾸는 방법은 값마다 달라 <b>어디를 고치는지</b>를 항목마다 적어 두었습니다.
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
                  <tr key={it.key} data-testid="admin-setting-row" data-key={it.key}>
                    <td style={td}>
                      {it.label}
                      <div style={{ fontSize: 10, color: t.textSubtle, fontFamily: 'monospace' }}>{it.key}</div>
                    </td>
                    <td style={{ ...td, whiteSpace: 'nowrap', fontWeight: 700 }}>
                      {String(it.value)}{it.unit ? ` ${it.unit}` : ''}
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
