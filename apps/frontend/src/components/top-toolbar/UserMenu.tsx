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
import { ChangePasswordForm } from '@/components/auth/ChangePasswordForm';
import { AiSettingsView } from '@/editor/inspector-panels/AiSettingsView';
import { useEditorUiStore } from '@/stores/editorUiStore';
import { LoginHistoryList, type LoginHistory } from '@/components/auth/LoginHistoryList';
import { McpTokensView } from '@/components/auth/McpTokensView';
import { ProShareDialog } from '@pro';

interface MenuEntry {
  id: string;
  icon: string;
  label: string;
  /** 아직 구현 전 — '준비 중' 배지 + 안내 */
  soon?: string;
}

const ENTRIES: MenuEntry[] = [
  { id: 'settings', icon: '⚙', label: '개인 설정', soon: '언어(한국어·English)·기본 저장 위치 등 — 다국어(B10) 단계에서 열립니다.' },
  // 비밀번호 변경은 **'준비 중'이 아니라 실제로 동작한다** — soon 이 없으면
  // 클릭이 안내가 아니라 기능으로 간다 (2026-08-13 사용자 요청).
  { id: 'password', icon: '🔑', label: '비밀번호 변경' },
  // AI 설정 — 키(암호화)·우선순위·모델·프롬프트 템플릿, 계정에 저장돼 어디서
  // 로그인하든 따라온다 (2026-09-04 — AI 탭의 '설정' 을 여기로 옮겼다)
  { id: 'aisettings', icon: '🤖', label: 'AI 설정' },
  // AI 커넥터(MCP) — Claude·ChatGPT 대화에서 바로 맵을 만드는 연결.
  // 토큰 발급과 **폐기가 한 화면**에 있어야 한다 (mcp-connector.md §3)
  { id: 'mcp', icon: '🔌', label: 'AI 커넥터(MCP)' },
  // 내 로그인 기록 — 남의 것은 볼 수 없다(서버가 토큰 주인만 조회한다)
  { id: 'logins', icon: '🕘', label: '로그인 기록' },
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
  /** 비밀번호 변경 창 (2026-08-13) */
  const [pwOpen, setPwOpen] = useState(false);
  // AI 설정 대화상자 — AI 탭의 '키 등록' 버튼도 켜므로 스토어에 있다
  const aiSettingsOpen = useEditorUiStore((s) => s.aiSettingsOpen);
  const setAiSettingsOpen = useEditorUiStore((s) => s.setAiSettingsOpen);
  /** AI 커넥터(MCP) 토큰 창 (2026-09-04) */
  const [mcpOpen, setMcpOpen] = useState(false);
  /** 내 로그인 기록 창 (2026-08-13) */
  const [logOpen, setLogOpen] = useState(false);
  const [logs, setLogs] = useState<LoginHistory | null>(null);

  const openLogins = () => {
    setOpen(false); setLogOpen(true); setLogs(null);
    cloudApi.myLogins()
      .then(setLogs)
      .catch(() => setLogs({
        available: false, events: [], limit: 0, logins30d: 0, loginsTotal: 0, lastLoginAt: null,
      }));
  };

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

  /**
   * **회원탈퇴** (2026-08-11 사용자 요청).
   *
   * 로그아웃과 달리 **서버의 계정과 자료가 사라진다** — 맵·히스토리·
   * 첨부까지 전부, 되돌릴 수 없이. 그래서 두 겹을 둔다:
   *   ① 무엇이 사라지는지 **숫자로 먼저 보여 준다** (맵 n개·첨부 n개)
   *   ② 확인 문구를 **직접 입력**해야 버튼이 열린다 (서버도 같은 검사)
   */
  const [del, setDel] = useState<null | {
    maps: number; attachments: number; usedBytes: number; confirmPhrase: string;
    /** 내가 개설자인 활성 협업맵 — 있으면 탈퇴가 막힌다 (2026-09-04 스키마 정비 A) */
    collabMaps: { mapId: string; title: string; memberCount: number | null }[];
    blocked: boolean;
  }>(null);
  /**
   * 탈퇴 차단 목록의 **[공유 설정]** — 그 맵의 공유 대화상자를 연다
   * (2026-09-05, collaboration/29 §8.3). 거기에 [소유권 넘기기]가 있다
   * (유료). 공개판에서는 협업맵이 생기지 않으므로 이 목록이 비어 있다.
   */
  const [shareMap, setShareMap] = useState<string | null>(null);
  const [delText, setDelText] = useState('');
  const [delBusy, setDelBusy] = useState(false);
  const [delErr, setDelErr] = useState<string | null>(null);

  const openDelete = () => {
    setOpen(false);
    setDelText(''); setDelErr(null);
    // 숫자를 못 가져와도 탈퇴 자체는 막지 않는다 — 문구는 서버가 정한
    // 값이 기본이고, 조회가 실패하면 '—' 로 보여 준다.
    cloudApi.deletePreview()
      .then((p) => setDel(p))
      .catch(() => setDel({
        maps: -1, attachments: -1, usedBytes: -1, confirmPhrase: '회원탈퇴',
        collabMaps: [], blocked: false,
      }));
  };

  const doDelete = () => {
    if (!del || delBusy) return;
    setDelBusy(true); setDelErr(null);
    cloudApi.deleteAccount(delText.trim())
      .then((r) => {
        setDel(null);
        useCloudStore.getState().unlink();
        // 계정이 사라졌으니 이 브라우저의 세션·초안도 함께 정리한다
        return useAuthStore.getState().signOut().then(() => {
          const base =
            `회원탈퇴가 완료되었습니다 — 맵 ${r.maps}개 · 첨부 ${r.attachments}개를 삭제했습니다.`;
          // 로그인 계정이 남았으면 **숨기지 않는다.** 사용자는 그 사실을
          // 재가입을 시도할 때가 아니라 지금 알아야 한다.
          onFlash?.(r.loginAccountRemoved
            ? base
            : `${base} 다만 로그인 계정 삭제가 끝나지 않아 같은 이메일로 다시 가입하지 못할 수 있습니다 — 관리자에게 문의해 주세요.`);
        });
      })
      .catch((e: unknown) => {
        setDelErr(e instanceof Error ? e.message : '탈퇴에 실패했습니다.');
      })
      .finally(() => setDelBusy(false));
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
              onClick={() => {
                if (e.id === 'password') { setOpen(false); setPwOpen(true); return; }
                if (e.id === 'aisettings') { setOpen(false); setAiSettingsOpen(true); return; }
                if (e.id === 'mcp') { setOpen(false); setMcpOpen(true); return; }
                if (e.id === 'logins') { openLogins(); return; }
                setSoon(soon === e.id ? null : e.id);
              }}
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
              {/* 회원탈퇴 — 로그아웃 **아래**, 색으로 구분한다. 되돌릴 수
                  없는 동작이라 실수로 로그아웃 대신 눌리지 않게 한다. */}
              <button
                data-testid="user-menu-delete-account"
                onClick={openDelete}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                  textAlign: 'left', padding: '8px 10px', borderRadius: 6,
                  background: 'transparent', border: 'none', color: t.danger,
                  cursor: 'pointer', fontSize: 12.5,
                }}
                onMouseEnter={(ev) => { ev.currentTarget.style.background = t.surfaceAlt; }}
                onMouseLeave={(ev) => { ev.currentTarget.style.background = 'transparent'; }}
              >
                <span style={{ width: 16, textAlign: 'center' }}>⚠</span>
                <span style={{ flex: 1 }}>회원탈퇴</span>
              </button>
            </>
          )}
        </div>
      )}

      {/* 회원탈퇴 확인 — 숫자로 보여 주고, 문구를 직접 입력해야 열린다 */}
      {del && (
        <div
          onClick={() => { if (!delBusy) setDel(null); }}
          style={{
            position: 'fixed', inset: 0, zIndex: 250, background: 'rgba(0,0,0,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            data-testid="delete-account-dialog"
            style={{
              width: 'min(460px, 92vw)', background: t.surface, color: t.text,
              border: `1px solid ${t.border}`, borderRadius: 12, padding: 20,
              boxShadow: '0 16px 48px rgba(0,0,0,0.3)',
            }}
          >
            <div style={{ fontSize: 15.5, fontWeight: 800, marginBottom: 6, color: t.danger }}>
              ⚠ 회원탈퇴 — 되돌릴 수 없습니다
            </div>
            <div style={{ fontSize: 12.5, color: t.textMuted, lineHeight: 1.7 }}>
              <b>{session?.email}</b> 계정과 서버에 저장된 자료가 <b>모두 삭제</b>됩니다.
              삭제한 뒤에는 복구할 방법이 없습니다.
            </div>

            <div
              data-testid="delete-account-summary"
              style={{
                margin: '12px 0', padding: '9px 11px', borderRadius: 7,
                background: t.surfaceAlt, border: `1px solid ${t.border}`,
                fontSize: 12, lineHeight: 1.9,
              }}
            >
              <div>맵 <b>{del.maps < 0 ? '—' : `${del.maps}개`}</b> (히스토리 포함)</div>
              <div>첨부 <b>{del.attachments < 0 ? '—' : `${del.attachments}개`}</b>
                {del.usedBytes >= 0 && <> · <b>{fmtBytes(del.usedBytes)}</b></>}
              </div>
              <div style={{ color: t.textSubtle, fontSize: 11 }}>
                이 브라우저에 남은 임시 초안도 함께 지워집니다.
              </div>
            </div>

            {/* 협업맵 개설자면 **막힌다** — 서버가 409 로 답하기 전에 여기서
                미리 보여 준다(확인 문구까지 치고 막히면 헛수고다). 참여자의
                작업이 걸려 있어서다 — schema-overhaul-plan.md §2.3.
                [공유 설정] 은 그 맵의 공유 대화상자 — 유료판이면 거기서
                소유권을 넘긴다(collaboration/29). */}
            {del.blocked && del.collabMaps.length > 0 && (
              <div
                data-testid="delete-account-blocked"
                style={{
                  margin: '0 0 12px', padding: '9px 11px', borderRadius: 7,
                  background: t.surfaceAlt, border: `1px solid ${t.danger}`,
                  fontSize: 12, lineHeight: 1.7,
                }}
              >
                <div style={{ fontWeight: 700, color: t.danger }}>
                  함께 쓰는 맵 {del.collabMaps.length}개의 개설자라 아직 탈퇴할 수 없습니다.
                </div>
                <div style={{ color: t.textMuted, fontSize: 11.5 }}>
                  탈퇴하면 참여자의 작업도 함께 사라집니다. 먼저 그 맵을 삭제하거나
                  소유권을 넘겨 주세요.
                </div>
                {del.collabMaps.map((m) => (
                  <div key={m.mapId} data-testid="delete-account-blocked-map"
                    style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      · {m.title}
                      <span style={{ color: t.textSubtle, fontSize: 11 }}>
                        {' '}(참여자 {m.memberCount === null ? '수 알 수 없음' : `${m.memberCount}명`})
                      </span>
                    </span>
                    <button
                      data-testid="delete-account-share-settings"
                      onClick={() => setShareMap(m.mapId)}
                      style={{
                        height: 24, padding: '0 9px', borderRadius: 6, cursor: 'pointer',
                        border: `1px solid ${t.border}`, background: t.surface, color: t.text,
                        fontSize: 11.5, fontWeight: 600, whiteSpace: 'nowrap',
                      }}
                    >공유 설정</button>
                  </div>
                ))}
              </div>
            )}

            <div style={{ fontSize: 12, marginBottom: 6 }}>
              계속하려면 <b style={{ color: t.danger }}>{del.confirmPhrase}</b> 를 입력하세요.
            </div>
            <input
              data-testid="delete-account-confirm"
              value={delText}
              autoFocus
              onChange={(e) => { setDelText(e.target.value); setDelErr(null); }}
              placeholder={del.confirmPhrase}
              style={{
                width: '100%', height: 36, borderRadius: 7, padding: '0 10px',
                border: `1px solid ${t.border}`, background: t.surfaceAlt,
                color: t.text, fontSize: 13, boxSizing: 'border-box',
              }}
            />

            {delErr && (
              <div data-testid="delete-account-error" style={{
                marginTop: 8, fontSize: 12, color: t.danger, lineHeight: 1.6,
              }}>{delErr}</div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 14 }}>
              <button
                data-testid="delete-account-cancel"
                onClick={() => setDel(null)}
                disabled={delBusy}
                style={{
                  height: 36, borderRadius: 7, border: 'none',
                  cursor: delBusy ? 'default' : 'pointer',
                  background: t.primary, color: '#fff', fontSize: 13, fontWeight: 700,
                }}
              >취소 — 계정을 유지합니다</button>
              <button
                data-testid="delete-account-submit"
                onClick={doDelete}
                disabled={delBusy || del.blocked || delText.trim() !== del.confirmPhrase}
                style={{
                  height: 34, borderRadius: 7,
                  cursor: delText.trim() === del.confirmPhrase && !delBusy ? 'pointer' : 'default',
                  border: `1px solid ${t.border}`,
                  background: t.surfaceAlt,
                  color: delText.trim() === del.confirmPhrase ? t.danger : t.textSubtle,
                  fontSize: 12.5, fontWeight: 700,
                  opacity: delText.trim() === del.confirmPhrase && !delBusy ? 1 : 0.6,
                }}
              >{delBusy ? '삭제하는 중…' : del.blocked ? '협업맵을 먼저 정리해 주세요' : '탈퇴하고 모든 자료 삭제'}</button>
            </div>
          </div>
        </div>
      )}

      {/* 탈퇴 차단 목록에서 연 공유 대화상자 — 탈퇴 대화상자(z 245) **위**에
          떠야 하므로 더 높은 층에 감싼다(자리 자체의 z 는 그 안에서 센다). */}
      {shareMap && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 300 }}>
          <ProShareDialog t={t} mapId={shareMap} onClose={() => {
            setShareMap(null);
            // 소유권을 넘겼거나 맵을 지웠을 수 있다 — 차단 목록을 다시 읽는다
            if (del) {
              cloudApi.deletePreview().then((p) => setDel(p)).catch(() => undefined);
            }
          }} />
        </div>
      )}

      {/* AI 커넥터(MCP) — 토큰 발급·폐기가 **한 화면**에 있다 (mcp-connector.md §3) */}
      {mcpOpen && (
        <div
          onClick={() => setMcpOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 245, background: 'rgba(0,0,0,0.35)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            data-testid="mcp-dialog"
            style={{
              width: 'min(560px, 94vw)', maxHeight: '86vh', overflowY: 'auto',
              background: t.surface, color: t.text,
              border: `1px solid ${t.border}`, borderRadius: 12, padding: 20,
              boxShadow: '0 16px 48px rgba(0,0,0,0.3)',
            }}
          >
            <div style={{ fontSize: 15.5, fontWeight: 800, marginBottom: 4 }}>
              🔌 AI 커넥터(MCP)
            </div>
            <div style={{ fontSize: 12, color: t.textMuted, marginBottom: 12 }}>
              AI 대화에서 바로 이 문서함에 맵을 만듭니다.
            </div>
            <McpTokensView t={t} />
            <button
              data-testid="mcp-close" onClick={() => setMcpOpen(false)}
              style={{
                width: '100%', height: 34, marginTop: 12, borderRadius: 7,
                border: `1px solid ${t.border}`, background: t.surfaceAlt,
                color: t.text, fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
              }}
            >닫기</button>
          </div>
        </div>
      )}

      {/* 로그인 기록 — 관리자 콘솔과 **같은 목록**을 쓴다 */}
      {logOpen && (
        <div
          onClick={() => setLogOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 245, background: 'rgba(0,0,0,0.35)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            data-testid="logins-dialog"
            style={{
              width: 'min(520px, 94vw)', background: t.surface, color: t.text,
              border: `1px solid ${t.border}`, borderRadius: 12, padding: 20,
              boxShadow: '0 16px 48px rgba(0,0,0,0.3)',
            }}
          >
            <div style={{ fontSize: 15.5, fontWeight: 800, marginBottom: 4 }}>
              🕘 내 로그인 기록
            </div>
            <div style={{ fontSize: 12, color: t.textMuted, marginBottom: 12 }}>
              {session?.email} — 모르는 접속이 있으면 비밀번호를 바꿔 주세요.
            </div>
            <LoginHistoryList t={t} data={logs} compact />
            <button
              data-testid="logins-close" onClick={() => setLogOpen(false)}
              style={{
                width: '100%', height: 34, marginTop: 12, borderRadius: 7,
                border: `1px solid ${t.border}`, background: t.surfaceAlt,
                color: t.text, fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
              }}
            >닫기</button>
          </div>
        </div>
      )}

      {/* 비밀번호 변경 — 관리자 콘솔과 **같은 폼**을 쓴다 */}
      {pwOpen && (
        <div
          onClick={() => setPwOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 245, background: 'rgba(0,0,0,0.35)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            data-testid="password-dialog"
            style={{
              width: 'min(430px, 92vw)', background: t.surface, color: t.text,
              border: `1px solid ${t.border}`, borderRadius: 12, padding: 20,
              boxShadow: '0 16px 48px rgba(0,0,0,0.3)',
            }}
          >
            <div style={{ fontSize: 15.5, fontWeight: 800, marginBottom: 12 }}>
              🔑 비밀번호 변경
            </div>
            <ChangePasswordForm t={t} email={session?.email ?? ''} />
            <button
              data-testid="password-close"
              onClick={() => setPwOpen(false)}
              style={{
                width: '100%', height: 34, marginTop: 10, borderRadius: 7,
                border: `1px solid ${t.border}`, background: t.surfaceAlt,
                color: t.text, fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
              }}
            >닫기</button>
          </div>
        </div>
      )}

      {aiSettingsOpen && (
        <div
          onClick={() => setAiSettingsOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 245, background: 'rgba(0,0,0,0.35)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            data-testid="ai-settings-dialog"
            style={{
              width: 'min(560px, 94vw)', maxHeight: '88vh', overflowY: 'auto',
              background: t.surface, color: t.text,
              border: `1px solid ${t.border}`, borderRadius: 12, padding: 20,
              boxShadow: '0 16px 48px rgba(0,0,0,0.3)',
            }}
          >
            <div style={{ fontSize: 15.5, fontWeight: 800, marginBottom: 4 }}>
              🤖 AI 설정
            </div>
            <div style={{ fontSize: 11.5, color: t.textMuted, lineHeight: 1.6, marginBottom: 8 }}>
              API 키 · 사용 우선순위 · 모델 · EMM 프롬프트 템플릿 — 계정에 저장되어
              다른 PC·브라우저에서 로그인해도 따라옵니다.
            </div>
            <AiSettingsView t={t} />
            <button
              data-testid="ai-settings-close"
              onClick={() => setAiSettingsOpen(false)}
              style={{
                width: '100%', height: 34, marginTop: 10, borderRadius: 7,
                border: `1px solid ${t.border}`, background: t.surfaceAlt,
                color: t.text, fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
              }}
            >닫기</button>
          </div>
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
