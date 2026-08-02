// UserMenu — 우상단 아바타(원형) 메뉴 (2026-08-02).
//
// 계정에 딸린 모든 것이 여기로 모인다 (사용자 지시):
//   · 개인 설정 (언어 등 — B10 i18n)
//   · 계정 프로필
//   · 구독 상태 / 저장 용량 (B9 첨부 저장소 · 요금제)
//   · 로그아웃
// 아직 구현 전인 항목은 **자리를 미리 만들어** '준비 중'으로 표시한다 —
// 메뉴 구조가 나중에 흔들리지 않도록.

import { useEffect, useRef, useState } from 'react';
import type { ThemeTokens } from '@/components/design-tokens/theme';
import { authEnabled, useAuthStore } from '@/stores/authStore';
import { useCloudStore } from '@/stores/cloudStore';

interface MenuEntry {
  id: string;
  icon: string;
  label: string;
  /** 아직 구현 전 — '준비 중' 배지 + 안내 */
  soon?: string;
}

const ENTRIES: MenuEntry[] = [
  { id: 'settings', icon: '⚙', label: '개인 설정', soon: '언어(한국어·English)·기본 저장 위치 등 — 다국어(B10) 단계에서 열립니다.' },
  { id: 'profile', icon: '👤', label: '계정 프로필', soon: '표시 이름·비밀번호 변경 — 계정 관리 단계에서 열립니다.' },
  { id: 'subscription', icon: '💳', label: '구독 상태', soon: '요금제와 사용 중인 저장 용량(문서·첨부 각각) — 첨부 저장소(B9) 단계에서 열립니다.' },
];

/** 이메일에서 아바타 글자 1자 — 없으면 로컬 모드 표시 */
function initialOf(email: string | undefined): string {
  const c = (email ?? '').trim().charAt(0);
  return c ? c.toUpperCase() : '·';
}

export function UserMenu({ t, onFlash }: { t: ThemeTokens; onFlash?: (m: string) => void }) {
  const [open, setOpen] = useState(false);
  const [soon, setSoon] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const session = useAuthStore((s) => s.session);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) { setOpen(false); setSoon(null); }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); setSoon(null); }
    };
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const logout = () => {
    setOpen(false);
    void useAuthStore.getState().signOut().then(() => {
      useCloudStore.getState().unlink();
      onFlash?.('로그아웃했습니다.');
    });
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        data-testid="user-menu"
        title={session?.email ? `${session.email} — 계정 메뉴` : '계정 메뉴'}
        onClick={() => setOpen((v) => !v)}
        style={{
          width: 30, height: 30, borderRadius: '50%', padding: 0,
          background: `linear-gradient(135deg, ${t.primary}, ${t.primaryHover})`,
          color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 12, fontWeight: 700,
          border: `2px solid ${open ? t.primaryBorder : t.surface}`, cursor: 'pointer',
        }}
      >
        {initialOf(session?.email)}
      </button>

      {open && (
        <div
          data-testid="user-menu-panel"
          style={{
            position: 'absolute', top: 38, right: 0, zIndex: 60, width: 240,
            background: t.surface, border: `1px solid ${t.border}`, borderRadius: 10,
            boxShadow: '0 10px 28px rgba(0,0,0,0.20)', padding: 6,
          }}
        >
          <div style={{
            padding: '8px 10px 9px', borderBottom: `1px solid ${t.divider}`, marginBottom: 5,
          }}>
            <div style={{
              fontSize: 12.5, fontWeight: 700, overflow: 'hidden',
              textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {session?.email ?? '로컬 모드'}
            </div>
            <div style={{ fontSize: 10.5, color: t.textSubtle, marginTop: 2 }}>
              {authEnabled
                ? (session ? '로그인됨' : '로그인하지 않음')
                : '서버 인증이 꺼진 개발 모드'}
            </div>
          </div>

          {ENTRIES.map((e) => (
            <button
              key={e.id}
              data-testid={`user-menu-${e.id}`}
              title={e.soon ?? e.label}
              onClick={() => setSoon(soon === e.id ? null : e.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                textAlign: 'left', padding: '8px 10px', borderRadius: 6,
                background: 'transparent', border: 'none', color: t.text,
                cursor: 'pointer', fontSize: 13,
              }}
              onMouseEnter={(ev) => { ev.currentTarget.style.background = t.surfaceAlt; }}
              onMouseLeave={(ev) => { ev.currentTarget.style.background = 'transparent'; }}
            >
              <span style={{ width: 16, textAlign: 'center' }}>{e.icon}</span>
              <span style={{ flex: 1 }}>{e.label}</span>
              {e.soon && (
                <span style={{
                  fontSize: 9.5, fontWeight: 600, color: t.textSubtle,
                  border: `1px solid ${t.border}`, borderRadius: 8, padding: '1px 6px',
                }}>준비 중</span>
              )}
            </button>
          ))}

          {soon && (
            <div
              data-testid="user-menu-soon"
              style={{
                margin: '2px 6px 6px', padding: '7px 9px', borderRadius: 6,
                background: t.surfaceAlt, border: `1px solid ${t.border}`,
                fontSize: 11, color: t.textMuted, lineHeight: 1.55,
              }}
            >
              {ENTRIES.find((e) => e.id === soon)?.soon}
            </div>
          )}

          {authEnabled && session && (
            <>
              <div style={{ height: 1, background: t.divider, margin: '5px 0' }} />
              <button
                data-testid="user-menu-logout"
                onClick={logout}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                  textAlign: 'left', padding: '8px 10px', borderRadius: 6,
                  background: 'transparent', border: 'none', color: t.text,
                  cursor: 'pointer', fontSize: 13,
                }}
                onMouseEnter={(ev) => { ev.currentTarget.style.background = t.surfaceAlt; }}
                onMouseLeave={(ev) => { ev.currentTarget.style.background = 'transparent'; }}
              >
                <span style={{ width: 16, textAlign: 'center' }}>🚪</span>
                <span style={{ flex: 1 }}>로그아웃</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
