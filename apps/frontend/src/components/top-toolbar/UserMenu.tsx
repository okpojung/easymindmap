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
import { cloudApi } from '@/services/cloud/apiClient';
import { authEnabled, useAuthStore } from '@/stores/authStore';
import { useCloudStore } from '@/stores/cloudStore';
import { writeLocalDraftNow } from '@/hooks/useLocalDraft';
import { listDrafts } from '@/utils/localDraft';

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
  { id: 'subscription', icon: '💳', label: '구독 상태', soon: '요금제 변경 — Free 10MB · Basic 10GB · Pro 30GB · Team 20GB/사용자. 결제 단계에서 열립니다(현재 요금제와 사용량은 위에 표시됩니다).' },
];

/** 요금제 이름 — 용량 숫자는 서버가 준다(여기 적어 두면 어긋난다) */
const PLAN_LABEL: Record<string, string> = {
  free: 'Free', basic: 'Basic', pro: 'Pro', team: 'Team',
};

interface QuotaInfo {
  dbBytes: number; fileBytes: number; usedBytes: number; quotaBytes: number;
  /** 'free' | 'basic' | 'pro' | 'team' — 서버가 준다 */
  plan?: string;
}

function fmtBytes(b: number): string {
  const gb = b / 1024 ** 3;
  if (gb >= 1) return `${Math.round(gb * 100) / 100}GB`;
  const mb = b / 1024 ** 2;
  if (mb >= 1) return `${Math.round(mb * 10) / 10}MB`;
  return `${Math.max(1, Math.round(b / 1024))}KB`;
}

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
  const guest = useAuthStore((s) => s.guest);
  const isGuest = authEnabled && guest && !session;

  // 저장 용량 (B9) — 메뉴를 열 때마다 조회. DB(문서)+첨부 합산 / 한도.
  const [quota, setQuota] = useState<QuotaInfo | null>(null);
  useEffect(() => {
    if (!open) return;
    // 인증 켠 배포에서 로그인 전이면 조회하지 않는다
    if (authEnabled && !session) return;
    let alive = true;
    cloudApi.quota()
      .then((q) => { if (alive) setQuota(q); })
      .catch(() => { if (alive) setQuota(null); });
    return () => { alive = false; };
  }, [open, session]);

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

  /**
   * **로그아웃 확인 게이트** (2026-08-07).
   *
   * 로그아웃은 이제 이 브라우저의 로컬 초안을 **전부 지운다**(공용 PC 에서
   * 앞사람 문서가 복구 배너로 뜨지 않도록). 그래서 미저장 편집이 남아
   * 있으면 그것이 **되돌릴 수 없이 사라진다** — 묻지 않고 지우면 '맵 닫기'
   * 가 경고하는 것과 같은 유실을 로그아웃이 조용히 저지르는 셈이다.
   *
   * 남은 초안이 없으면(= 잃을 것이 없으면) 묻지 않고 바로 로그아웃한다.
   */
  const [warnDrafts, setWarnDrafts] = useState<number | null>(null);

  const doLogout = () => {
    setWarnDrafts(null);
    if (isGuest) {
      // Guest 종료 → 로그인/가입 화면. 초안 삭제는 exitGuest 안에서 한다.
      useAuthStore.getState().exitGuest();
      onFlash?.('로그아웃했습니다.');
      return;
    }
    void useAuthStore.getState().signOut().then(() => {
      useCloudStore.getState().unlink();
      onFlash?.('로그아웃했습니다.');
    });
  };

  const logout = () => {
    setOpen(false);
    // 화면의 최신 편집까지 초안에 반영한 뒤 세어야 정확하다 —
    // 마지막 1초(디바운스) 안의 편집이 빠지면 "잃을 것 없음"으로 오판한다.
    void writeLocalDraftNow()
      .then(() => listDrafts())
      .then((all) => {
        if (all.length === 0) { doLogout(); return; }
        setWarnDrafts(all.length);
      })
      .catch(() => doLogout()); // 셀 수 없으면 막지 않는다
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
        {isGuest ? 'G' : initialOf(session?.email)}
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
              {session?.email ?? (isGuest ? 'Guest 체험 중' : '로컬 모드')}
            </div>
            <div style={{ fontSize: 10.5, color: t.textSubtle, marginTop: 2 }}>
              {authEnabled
                ? (session ? '로그인됨'
                  : isGuest ? '가입하면 저장·첨부·히스토리를 쓸 수 있습니다'
                    : '로그인하지 않음')
                : '서버 인증이 꺼진 개발 모드'}
            </div>
          </div>

          {quota && (
            <div
              data-testid="user-menu-quota"
              style={{
                margin: '0 6px 6px', padding: '7px 9px', borderRadius: 6,
                background: t.surfaceAlt, border: `1px solid ${t.border}`,
              }}
            >
              <div style={{
                display: 'flex', justifyContent: 'space-between',
                fontSize: 10.5, color: t.textMuted, marginBottom: 4,
              }}>
                <span>
                  저장 용량 (문서+첨부)
                  {/* **어느 요금제의 한도인지 함께 보여 준다** — 숫자만
                      보면 "왜 10MB 인가"를 알 수 없다 (2026-08-06) */}
                  {quota.plan && (
                    <span data-testid="user-menu-plan" style={{
                      marginLeft: 5, padding: '1px 5px', borderRadius: 4,
                      background: quota.plan === 'free' ? t.border : t.primary,
                      color: quota.plan === 'free' ? t.textMuted : '#fff',
                      fontSize: 9, fontWeight: 700, letterSpacing: 0.2,
                    }}>{PLAN_LABEL[quota.plan] ?? quota.plan}</span>
                  )}
                </span>
                <span style={{ fontWeight: 700, color: t.text }}>
                  {fmtBytes(quota.usedBytes)} / {fmtBytes(quota.quotaBytes)}
                </span>
              </div>
              <div style={{ height: 5, borderRadius: 3, background: t.border, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: 3,
                  width: `${Math.min(100, Math.round((quota.usedBytes / quota.quotaBytes) * 100))}%`,
                  background: quota.usedBytes / quota.quotaBytes > 0.9 ? t.danger : t.primary,
                }} />
              </div>
              <div style={{ fontSize: 9.5, color: t.textSubtle, marginTop: 4 }}>
                문서 {fmtBytes(quota.dbBytes)} · 첨부 {fmtBytes(quota.fileBytes)}
              </div>
            </div>
          )}

          {/* 개인 설정·계정 프로필·구독 상태 — Guest 에게는 의미가 없어
              아예 숨긴다 (2026-08-04 사용자 결정) */}
          {!isGuest && ENTRIES.map((e) => (
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

          {/* Guest 도 일반 회원과 같은 '로그아웃' 항목 (2026-08-04 사용자
              결정 — 동작 = Guest 종료 → 로그인/가입 화면) */}
          {isGuest && (
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

      {/* 로그아웃 = 이 브라우저의 초안 전체 삭제 → 잃을 것이 있으면 먼저 묻는다 */}
      {warnDrafts !== null && (
        <div
          onClick={() => setWarnDrafts(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 240, background: 'rgba(0,0,0,0.35)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            data-testid="logout-draft-warning"
            style={{
              width: 'min(430px, 92vw)', background: t.surface, color: t.text,
              border: `1px solid ${t.border}`, borderRadius: 12, padding: 20,
              boxShadow: '0 16px 48px rgba(0,0,0,0.3)',
            }}
          >
            <div style={{ fontSize: 15.5, fontWeight: 800, marginBottom: 6 }}>
              ⚠ 저장되지 않은 편집이 있습니다
            </div>
            <div style={{ fontSize: 12.5, color: t.textMuted, lineHeight: 1.7, marginBottom: 16 }}>
              아직 서버에 저장되지 않은 맵이 <b>{warnDrafts}개</b> 이 브라우저에
              남아 있습니다. 로그아웃하면 <b>이 브라우저에서 함께 삭제</b>되어
              되돌릴 수 없습니다(공용 PC 에서 다음 사람에게 남지 않도록 하는
              동작입니다).
              <br />
              계속 쓰시려면 <b>취소</b> 후 ☁ 저장을 먼저 하세요.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <button
                data-testid="logout-cancel"
                onClick={() => setWarnDrafts(null)}
                style={{
                  height: 36, borderRadius: 7, border: 'none', cursor: 'pointer',
                  background: t.primary, color: '#fff', fontSize: 13, fontWeight: 700,
                }}
              >취소 — 먼저 저장하기</button>
              <button
                data-testid="logout-anyway"
                onClick={doLogout}
                style={{
                  height: 34, borderRadius: 7, cursor: 'pointer',
                  border: `1px solid ${t.border}`, background: t.surfaceAlt,
                  color: t.text, fontSize: 12.5, fontWeight: 600,
                }}
              >그대로 로그아웃 (초안 삭제)</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
