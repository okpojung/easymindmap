// 관리자 콘솔 (2026-08-13 사용자 요청).
//
// **에디터와 아무것도 공유하지 않는다.** 지금은 같은 앱의 `/admin` 경로에
// 얹혀 있지만, 운영 전환 때 admin.easymindmap.org 로 분리하기로 했다
// (사용자 결정). 그때 **이 폴더와 services/cloud/adminApi.ts 만 옮기면**
// 끝나도록, 에디터 스토어를 건드리지 않고 자기 상태만 쓴다.
//
// 메뉴는 세 개다(사용자 지시).
//   · 회원관리 — 현황·요금제 변경·사용용량·활동            ← 1차 구현
//   · 결제관리 — 구독 결제                                  ← 결제 시스템 이후
//   · 설정관리 — 개발하며 정한 값들의 조사·관리            ← 1차는 조회

import { useEffect, useState } from 'react';
import { THEMES } from '@/components/design-tokens/theme';
import { adminApi, adminToken } from '@/services/cloud/adminApi';
import { AdminLogin } from './AdminLogin';
import { MembersPanel } from './MembersPanel';
import { SettingsPanel } from './SettingsPanel';
import { ChangePasswordForm } from '@/components/auth/ChangePasswordForm';

type Tab = 'members' | 'billing' | 'settings' | 'password';

const TABS: { id: Tab; label: string; soon?: string }[] = [
  { id: 'members', label: '회원관리' },
  {
    id: 'billing',
    label: '결제관리',
    soon: '구독 결제는 결제 시스템(PG 연동)을 붙인 뒤 열립니다. 지금은 요금제를 '
      + '회원관리에서 직접 바꿉니다 — 결제 기록이 없어 보여 줄 데이터가 없습니다.',
  },
  { id: 'settings', label: '설정관리' },
  { id: 'password', label: '비밀번호 변경' },
];

export function AdminPage() {
  // 관리자 화면은 **항상 밝은 테마**로 둔다 — 에디터의 테마 설정과 얽히면
  // 분리할 때 스토어를 끌고 가야 한다.
  const t = THEMES.light;

  const [email, setEmail] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [tab, setTab] = useState<Tab>('members');

  // 새로고침해도 표가 살아 있으면 그대로 들어간다 (표는 sessionStorage)
  useEffect(() => {
    if (!adminToken.get()) { setChecking(false); return; }
    adminApi.me()
      .then((r) => setEmail(r.email))
      .catch(() => adminToken.clear())
      .finally(() => setChecking(false));
  }, []);

  if (checking) {
    return (
      <div style={{
        minHeight: '100vh', background: t.bg, color: t.textSubtle,
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13,
      }}>확인하는 중…</div>
    );
  }
  if (!email) return <AdminLogin t={t} onDone={setEmail} />;

  const logout = () => { adminToken.clear(); setEmail(null); };

  return (
    <div data-testid="admin-page" style={{ minHeight: '100vh', background: t.bg, color: t.text }}>
      <header style={{
        display: 'flex', alignItems: 'center', gap: 14, padding: '0 18px', height: 52,
        background: t.surface, borderBottom: `1px solid ${t.border}`,
      }}>
        <div style={{ fontSize: 14.5, fontWeight: 800 }}>EasyMindMap 관리자</div>
        <nav style={{ display: 'flex', gap: 4, flex: 1 }}>
          {TABS.map((x) => (
            <button
              key={x.id}
              data-testid={`admin-tab-${x.id}`}
              onClick={() => setTab(x.id)}
              style={{
                height: 32, padding: '0 12px', borderRadius: 7, cursor: 'pointer',
                border: `1px solid ${tab === x.id ? t.primaryBorder : 'transparent'}`,
                background: tab === x.id ? t.primarySoft : 'transparent',
                color: tab === x.id ? t.primary : t.textMuted,
                fontSize: 13, fontWeight: 700,
              }}
            >
              {x.label}
              {x.soon && (
                <span style={{
                  marginLeft: 5, fontSize: 9, fontWeight: 600, color: t.textSubtle,
                  border: `1px solid ${t.border}`, borderRadius: 7, padding: '1px 5px',
                }}>준비 중</span>
              )}
            </button>
          ))}
        </nav>
        <div style={{ fontSize: 11.5, color: t.textMuted }} data-testid="admin-who">{email}</div>
        <button
          data-testid="admin-logout" onClick={logout}
          style={{
            height: 30, padding: '0 11px', borderRadius: 7, cursor: 'pointer',
            border: `1px solid ${t.border}`, background: t.surfaceAlt, color: t.text,
            fontSize: 12, fontWeight: 600,
          }}
        >로그아웃</button>
      </header>

      <main style={{ padding: 18, maxWidth: 1280, margin: '0 auto' }}>
        {tab === 'members' && <MembersPanel t={t} />}
        {tab === 'settings' && <SettingsPanel t={t} />}
        {tab === 'password' && (
          <ChangePasswordForm
            t={t} email={email}
            note={<>
              관리자 콘솔에는 <b>별도 비밀번호가 없습니다</b> — 이 계정의 앱
              비밀번호가 곧 관리자 1단계 비밀번호입니다. 바꾸면 <b>앱 로그인도
              새 비밀번호</b>로 바뀝니다.
            </>}
          />
        )}
        {tab === 'billing' && (
          <div data-testid="admin-billing" style={{
            padding: '16px 18px', borderRadius: 10, lineHeight: 1.8, fontSize: 13,
            background: t.surface, border: `1px solid ${t.border}`, color: t.textMuted,
          }}>
            <div style={{ fontSize: 14.5, fontWeight: 800, color: t.text, marginBottom: 6 }}>
              결제관리 — 준비 중
            </div>
            {TABS.find((x) => x.id === 'billing')?.soon}
            <div style={{ marginTop: 10, fontSize: 12, color: t.textSubtle }}>
              붙일 때 필요한 것: 결제 수단 등록·구독 상태·결제 이력·실패 시 유예와 강등 정책
              (attachment-storage.md §8.2).
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
