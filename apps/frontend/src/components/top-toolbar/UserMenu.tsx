// UserMenu — 우상단 아바타(원형) 메뉴 (2026-08-02).
//
// 계정에 딸린 모든 것이 여기로 모인다 (사용자 지시):
//   · 개인 설정 (언어 등 — B10 i18n)
//   · 계정 프로필
//   · 구독 상태 / 저장 용량 (B9 첨부 저장소 · 요금제)
//   · 로그아웃
// 아직 구현 전인 항목은 **자리를 미리 만들어** '준비 중'으로 표시한다 —
// 메뉴 구조가 나중에 흔들리지 않도록.
// 개인 설정은 B10(i18n, 2026-10-05)에서 열렸다 — 언어 고르기.

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
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
import { ProShareDialog, ProSalesPanel, ProPurchasesPanel } from '@pro';
import { useProFeature } from '@/pro/contract';
import { useProfileStore } from '@/stores/profileStore';
import { AccountProfileForm } from '@/components/account/AccountProfileForm';
import { displayNameOf, formatPhone } from '@/utils/profileName';
import { AvatarBadge } from '@/components/account/AvatarBadge';
import { DialogCloseButton, DialogFrame } from '@/components/ui/DialogFrame';
import { LanguagePicker } from '@/components/ui/LanguagePicker';
import { useLang, useTr } from '@/i18n';
import { useCoarse, usePhoneLayout } from '@/hooks/useViewport';
import { rich } from '@/i18n/rich';

interface MenuEntry {
  id: string;
  icon: string;
  /** 사전 키 — 모듈 상수라 렌더 때 번역한다 */
  labelKey: string;
  /** 아직 구현 전 — '준비 중' 배지 + 안내 (사전 키) */
  soonKey?: string;
}

const ENTRIES: MenuEntry[] = [
  // 개인 설정 — 언어 고르기 (B10 i18n, 2026-10-05). 더는 '준비 중' 이 아니다.
  { id: 'settings', icon: '⚙', labelKey: 'shell.user.settings' },
  // 비밀번호 변경은 **'준비 중'이 아니라 실제로 동작한다** — soon 이 없으면
  // 클릭이 안내가 아니라 기능으로 간다 (2026-08-13 사용자 요청).
  { id: 'password', icon: '🔑', labelKey: 'shell.user.password' },
  // AI 설정 — 키(암호화)·우선순위·모델·프롬프트 템플릿, 계정에 저장돼 어디서
  // 로그인하든 따라온다 (2026-09-04 — AI 탭의 '설정' 을 여기로 옮겼다)
  { id: 'aisettings', icon: '🤖', labelKey: 'shell.user.aiSettings' },
  // AI 커넥터(MCP) — Claude·ChatGPT 대화에서 바로 맵을 만드는 연결.
  // 토큰 발급과 **폐기가 한 화면**에 있어야 한다 (mcp-connector.md §3)
  { id: 'mcp', icon: '🔌', labelKey: 'shell.user.mcp' },
  // 내 로그인 기록 — 남의 것은 볼 수 없다(서버가 토큰 주인만 조회한다)
  { id: 'logins', icon: '🕘', labelKey: 'shell.user.logins' },
  // 계정 프로필 — 이름·이메일·휴대폰, 이름 수정 (2026-09-08 사용자 요청)
  { id: 'profile', icon: '👤', labelKey: 'shell.user.profile' },
  { id: 'subscription', icon: '💳', labelKey: 'shell.user.subscription', soonKey: 'shell.user.subscriptionSoon' },
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

export function UserMenu({ t, onFlash }: { t: ThemeTokens; onFlash?: (m: string) => void }) {
  const tr = useTr();
  // 폰 — 메뉴는 화면 오른쪽에 붙여 띄우고(넘치면 안에서 스크롤), 손가락
  // 입력이면 아바타·항목을 누르기 좋은 크기로 (모바일 웹 2026-10-05)
  const phone = usePhoneLayout();
  const coarse = useCoarse();
  const [open, setOpen] = useState(false);
  const [soon, setSoon] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const session = useAuthStore((s) => s.session);
  const guest = useAuthStore((s) => s.guest);
  const isGuest = authEnabled && guest && !session;

  // 계정 프로필(성명·휴대폰) — 아바타 글자와 메뉴 머리, 협업 이름표가 쓴다
  const profile = useProfileStore((s) => s.profile);
  const loadProfile = useProfileStore((s) => s.load);
  useEffect(() => {
    if (authEnabled && !session) return;
    void loadProfile();
  }, [session, loadProfile]);
  const myName = session ? displayNameOf(profile?.fullName, session.email) : null;
  const myPhone = formatPhone(profile?.phoneCountry, profile?.phoneNumber);
  /** 계정 프로필 창 (2026-09-08) */
  const [profileOpen, setProfileOpen] = useState(false);
  /** 개인 설정 창 — 언어 (B10 i18n, 2026-10-05) */
  const [settingsOpen, setSettingsOpen] = useState(false);

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
    // pointerdown — 손가락으로 캔버스를 눌러도 닫히게 (캔버스가 터치의
    // 기본 동작을 막으면 mousedown 은 오지 않는다)
    const onDoc = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) { setOpen(false); setSoon(null); }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); setSoon(null); }
    };
    document.addEventListener('pointerdown', onDoc);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDoc);
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
  /** 💰 판매·정산 창 (2026-09-22, 27b §8.1) */
  const [salesOpen, setSalesOpen] = useState(false);
  /** 🧾 내 구매 창 (2026-09-29) — 산 맵을 언제든 다시 받는다 */
  const [buysOpen, setBuysOpen] = useState(false);
  /**
   * **파는 기능이 켜진 서버에서만** 이 줄을 낸다.
   *
   * ★ 다른 미구현 항목처럼 '준비 중' 으로 두지 않는다. 그것들은 언젠가
   *   이 빌드에서 열리지만, 판매는 **유료 모듈이 꽂힌 서버에서만** 열린다 —
   *   공개판에서는 눌러도 영영 같은 안내뿐인 줄이 된다. 유료공개가 왜
   *   아직인지는 퍼블리싱 대화상자가 그 자리에서 말한다(`PriceRow`).
   *
   * ★ 서버에 못 물었을 때(`unknown`)도 내지 않는다 — 없는 줄은 나중에
   *   생기면 그만이지만, 열리지 않는 줄은 고장으로 보인다.
   */
  const salesOn = useProFeature('map-sales').status === 'on';
  /**
   * ★ **산 사람과 파는 사람은 다른 사람이다** (2026-09-29 사용자 요청).
   *   한 줄에 묶으면 맵을 사기만 한 사람이 '판매·정산' 을 열어 자기와
   *   상관없는 정산 얘기를 읽게 된다. 줄을 갈라 각자 자기 것만 본다.
   */
  const entries = salesOn
    ? ENTRIES.flatMap<MenuEntry>((e) => (e.id === 'subscription'
      ? [
        { id: 'purchases', icon: '🧾', labelKey: 'shell.user.purchases' },
        { id: 'sales', icon: '💰', labelKey: 'shell.user.sales' },
        e,
      ]
      : [e]))
    : ENTRIES;
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
      onFlash?.(tr('shell.user.loggedOut'));
      return;
    }
    void useAuthStore.getState().signOut().then(() => {
      useCloudStore.getState().unlink();
      onFlash?.(tr('shell.user.loggedOut'));
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
  // 확인 문구 — 한국어 화면은 서버가 준 문구, 그 밖의 언어는 'DELETE'
  // (서버가 둘 다 받는다 · account.service.ts DELETE_CONFIRM_PHRASES)
  const lang = useLang();
  const phrase = del ? (lang === 'ko' ? del.confirmPhrase : 'DELETE') : '';

  const openDelete = () => {
    setOpen(false);
    setDelText(''); setDelErr(null);
    // 숫자를 못 가져와도 탈퇴 자체는 막지 않는다 — 문구는 서버가 정한
    // 값이 기본이고, 조회가 실패하면 '—' 로 보여 준다.
    cloudApi.deletePreview()
      .then((p) => setDel(p))
      .catch(() => setDel({
        // 확인 문구는 서버가 검사하는 값(데이터)이라 번역하지 않는다
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
          const base = tr('shell.user.deleteDone', { maps: r.maps, attachments: r.attachments });
          // 로그인 계정이 남았으면 **숨기지 않는다.** 사용자는 그 사실을
          // 재가입을 시도할 때가 아니라 지금 알아야 한다.
          onFlash?.(r.loginAccountRemoved
            ? base
            : tr('shell.user.deleteLoginLeft', { base }));
        });
      })
      .catch((e: unknown) => {
        setDelErr(e instanceof Error ? e.message : tr('shell.user.deleteFailed'));
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
        title={session
          ? [myName, session.email !== myName ? session.email : null, myPhone, tr('shell.user.menu')]
            .filter(Boolean).join(' — ')
          : tr('shell.user.menu')}
        onClick={() => setOpen((v) => !v)}
        style={{
          width: coarse ? 40 : 30, height: coarse ? 40 : 30, borderRadius: '50%', padding: 0,
          flexShrink: 0,
          background: t.surface,
          color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 12, fontWeight: 700,
          border: `2px solid ${open ? t.primaryBorder : t.surface}`, cursor: 'pointer',
        }}
      >
        <AvatarBadge t={t} avatar={profile?.avatar} fullName={profile?.fullName} email={session?.email} size={coarse ? 32 : 26} guest={isGuest} />
      </button>

      {open && (
        <div
          data-testid="user-menu-panel"
          style={{
            ...(phone
              ? {
                position: 'fixed',
                top: 'calc(52px + env(safe-area-inset-top, 0px))',
                right: 'max(6px, env(safe-area-inset-right, 0px))',
                width: 'min(280px, calc(100vw - 12px))',
                maxHeight: 'calc(100dvh - 64px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px))',
                overflowY: 'auto', overscrollBehavior: 'contain',
              } as const
              : { position: 'absolute', top: 38, right: 0, width: 240 } as const),
            zIndex: 60,
            background: t.surface, border: `1px solid ${t.border}`, borderRadius: 10,
            boxShadow: '0 10px 28px rgba(0,0,0,0.20)', padding: 6,
          }}
        >
          <div style={{
            padding: '8px 10px 9px', borderBottom: `1px solid ${t.divider}`, marginBottom: 5,
          }}>
            <div
              data-testid="user-menu-name"
              title={session ? [session.email, myPhone].filter(Boolean).join(' · ') : undefined}
              style={{
                fontSize: 12.5, fontWeight: 700, overflow: 'hidden',
                textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}
            >
              {myName ?? (isGuest ? tr('shell.user.guestTrial') : tr('shell.user.localMode'))}
            </div>
            {session && profile?.fullName && (
              <div data-testid="user-menu-email" style={{
                fontSize: 10.5, color: t.textMuted, marginTop: 1, overflow: 'hidden',
                textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {session.email}{myPhone ? ` · ${myPhone}` : ''}
              </div>
            )}
            <div style={{ fontSize: 10.5, color: t.textSubtle, marginTop: 2 }}>
              {authEnabled
                ? (session ? tr('shell.user.signedIn')
                  : isGuest ? tr('shell.user.guestHint')
                    : tr('shell.user.notSignedIn'))
                : tr('shell.user.devMode')}
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
                  {tr('shell.user.storage')}
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
                {tr('shell.user.storageBreakdown', { doc: fmtBytes(quota.dbBytes), files: fmtBytes(quota.fileBytes) })}
              </div>
            </div>
          )}

          {/* 개인 설정·계정 프로필·구독 상태 — Guest 에게는 의미가 없어
              아예 숨긴다 (2026-08-04 사용자 결정) */}
          {!isGuest && entries.map((e) => (
            <button
              key={e.id}
              data-testid={`user-menu-${e.id}`}
              title={e.soonKey ? tr(e.soonKey) : tr(e.labelKey)}
              onClick={() => {
                if (e.id === 'settings') { setOpen(false); setSettingsOpen(true); return; }
                if (e.id === 'password') { setOpen(false); setPwOpen(true); return; }
                if (e.id === 'aisettings') { setOpen(false); setAiSettingsOpen(true); return; }
                if (e.id === 'mcp') { setOpen(false); setMcpOpen(true); return; }
                if (e.id === 'logins') { openLogins(); return; }
                if (e.id === 'profile') { setOpen(false); setProfileOpen(true); return; }
                if (e.id === 'sales') { setOpen(false); setSalesOpen(true); return; }
                if (e.id === 'purchases') { setOpen(false); setBuysOpen(true); return; }
                setSoon(soon === e.id ? null : e.id);
              }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                textAlign: 'left', padding: '8px 10px', borderRadius: 6, minHeight: coarse ? 44 : undefined,
                background: 'transparent', border: 'none', color: t.text,
                cursor: 'pointer', fontSize: 13,
              }}
              onMouseEnter={(ev) => { ev.currentTarget.style.background = t.surfaceAlt; }}
              onMouseLeave={(ev) => { ev.currentTarget.style.background = 'transparent'; }}
            >
              <span style={{ width: 16, textAlign: 'center' }}>{e.icon}</span>
              <span style={{ flex: 1 }}>{tr(e.labelKey)}</span>
              {e.soonKey && (
                <span style={{
                  fontSize: 9.5, fontWeight: 600, color: t.textSubtle,
                  border: `1px solid ${t.border}`, borderRadius: 8, padding: '1px 6px',
                }}>{tr('common.comingSoon')}</span>
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
              {(() => {
                const k = ENTRIES.find((e) => e.id === soon)?.soonKey;
                return k ? tr(k) : null;
              })()}
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
                  textAlign: 'left', padding: '8px 10px', borderRadius: 6, minHeight: coarse ? 44 : undefined,
                  background: 'transparent', border: 'none', color: t.text,
                  cursor: 'pointer', fontSize: 13,
                }}
                onMouseEnter={(ev) => { ev.currentTarget.style.background = t.surfaceAlt; }}
                onMouseLeave={(ev) => { ev.currentTarget.style.background = 'transparent'; }}
              >
                <span style={{ width: 16, textAlign: 'center' }}>🚪</span>
                <span style={{ flex: 1 }}>{tr('shell.user.logout')}</span>
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
                  textAlign: 'left', padding: '8px 10px', borderRadius: 6, minHeight: coarse ? 44 : undefined,
                  background: 'transparent', border: 'none', color: t.text,
                  cursor: 'pointer', fontSize: 13,
                }}
                onMouseEnter={(ev) => { ev.currentTarget.style.background = t.surfaceAlt; }}
                onMouseLeave={(ev) => { ev.currentTarget.style.background = 'transparent'; }}
              >
                <span style={{ width: 16, textAlign: 'center' }}>🚪</span>
                <span style={{ flex: 1 }}>{tr('shell.user.logout')}</span>
              </button>
              {/* 회원탈퇴는 **계정 프로필 창 맨 아래**로 옮겼다 (2026-09-08 사용자
                  요청 — 로그아웃 바로 밑에 있어 잘못 누를 수 있었다). */}
            </>
          )}
        </div>
      )}

      {/* 회원탈퇴 확인 — 숫자로 보여 주고, 문구를 직접 입력해야 열린다 */}
      {del && (
        <DialogFrame
          t={t}
          testId="delete-account-dialog"
          zIndex={250}
          width="min(460px, 92vw)"
          closeDisabled={delBusy}
          onClose={() => setDel(null)}
          title={<span style={{ color: t.danger }}>{tr('shell.user.deleteTitle')}</span>}
        >
            <div style={{ fontSize: 12.5, color: t.textMuted, lineHeight: 1.7 }}>
              {rich(tr('shell.user.deleteIntro', { email: session?.email ?? '' }))}
            </div>

            <div
              data-testid="delete-account-summary"
              style={{
                margin: '12px 0', padding: '9px 11px', borderRadius: 7,
                background: t.surfaceAlt, border: `1px solid ${t.border}`,
                fontSize: 12, lineHeight: 1.9,
              }}
            >
              <div>{rich(tr('shell.user.deleteMaps', { n: del.maps < 0 ? '—' : tr('shell.user.countItems', { n: del.maps }) }))}</div>
              <div>{rich(tr('shell.user.deleteAttach', { n: del.attachments < 0 ? '—' : tr('shell.user.countItems', { n: del.attachments }) }))}
                {del.usedBytes >= 0 && <> · <b>{fmtBytes(del.usedBytes)}</b></>}
              </div>
              <div style={{ color: t.textSubtle, fontSize: 11 }}>
                {tr('shell.user.deleteDraftsToo')}
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
                  {tr('shell.user.blockedTitle', { n: del.collabMaps.length })}
                </div>
                <div style={{ color: t.textMuted, fontSize: 11.5 }}>
                  {tr('shell.user.blockedBody')}
                </div>
                {del.collabMaps.map((m) => (
                  <div key={m.mapId} data-testid="delete-account-blocked-map"
                    style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      · {m.title}
                      <span style={{ color: t.textSubtle, fontSize: 11 }}>
                        {' '}{m.memberCount === null ? tr('shell.user.membersUnknown') : tr('shell.user.members', { n: m.memberCount })}
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
                    >{tr('shell.user.shareSettings')}</button>
                  </div>
                ))}
              </div>
            )}

            <div style={{ fontSize: 12, marginBottom: 6 }}>
              {rich(tr('shell.user.confirmPrompt', { phrase }), undefined, { color: t.danger })}
            </div>
            <input
              data-testid="delete-account-confirm"
              value={delText}
              autoFocus
              onChange={(e) => { setDelText(e.target.value); setDelErr(null); }}
              placeholder={phrase}
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
              >{tr('shell.user.deleteCancel')}</button>
              <button
                data-testid="delete-account-submit"
                onClick={doDelete}
                disabled={delBusy || del.blocked || delText.trim() !== phrase}
                style={{
                  height: 34, borderRadius: 7,
                  cursor: delText.trim() === phrase && !delBusy ? 'pointer' : 'default',
                  border: `1px solid ${t.border}`,
                  background: t.surfaceAlt,
                  color: delText.trim() === phrase ? t.danger : t.textSubtle,
                  fontSize: 12.5, fontWeight: 700,
                  opacity: delText.trim() === phrase && !delBusy ? 1 : 0.6,
                }}
              >{delBusy ? tr('shell.user.deleting') : del.blocked ? tr('shell.user.deleteBlockedBtn') : tr('shell.user.deleteSubmit')}</button>
            </div>
        </DialogFrame>
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
        <DialogFrame
          t={t}
          testId="mcp-dialog"
          width="min(560px, 94vw)"
          onClose={() => setMcpOpen(false)}
          title={`🔌 ${tr('shell.user.mcp')}`}
          subtitle={tr('shell.user.mcpSubtitle')}
          footer={<DialogCloseButton t={t} onClick={() => setMcpOpen(false)} testId="mcp-close" />}
        >
            <McpTokensView t={t} />
        </DialogFrame>
      )}

      {/* 🧾 내 구매 — 산 맵 목록과 [다시 받기] (2026-09-29).
          결제 직후의 링크는 30일짜리 열쇠 하나였다 — 여기서는 계정에 붙은
          구매로 **언제든** 새 열쇠를 받아 다시 내려받는다. */}
      {buysOpen && (
        <DialogFrame
          t={t}
          testId="purchases-dialog"
          width="min(560px, 94vw)"
          onClose={() => setBuysOpen(false)}
          title={`🧾 ${tr('shell.user.purchases')}`}
          subtitle={tr('shell.user.purchasesSubtitle')}
          footer={<DialogCloseButton t={t} onClick={() => setBuysOpen(false)} testId="purchases-close" />}
        >
            <ProPurchasesPanel t={t} />
        </DialogFrame>
      )}

      {/* 💰 판매·정산 — 계좌 등록 · 판매 내역 · 정산 회차 (27b §8.1).
          알맹이는 유료 모듈이 채운다 — 요율도 원장도 그쪽에 있다. */}
      {salesOpen && (
        <DialogFrame
          t={t}
          testId="sales-dialog"
          width="min(580px, 94vw)"
          onClose={() => setSalesOpen(false)}
          title={`💰 ${tr('shell.user.sales')}`}
          subtitle={tr('shell.user.salesSubtitle')}
          footer={<DialogCloseButton t={t} onClick={() => setSalesOpen(false)} testId="sales-close" />}
        >
            <ProSalesPanel t={t} />
        </DialogFrame>
      )}

      {/* 로그인 기록 — 관리자 콘솔과 **같은 목록**을 쓴다 */}
      {logOpen && (
        <DialogFrame
          t={t}
          testId="logins-dialog"
          width="min(520px, 94vw)"
          onClose={() => setLogOpen(false)}
          title={`🕘 ${tr('shell.user.loginsTitle')}`}
          subtitle={tr('shell.user.loginsSubtitle', { email: session?.email ?? '' })}
          footer={<DialogCloseButton t={t} onClick={() => setLogOpen(false)} testId="logins-close" />}
        >
            <LoginHistoryList t={t} data={logs} compact />
        </DialogFrame>
      )}

      {/* 계정 프로필 — 이름·이메일·휴대폰, 이름 수정 (2026-09-08) */}
      {profileOpen && (
        <DialogFrame
          t={t}
          testId="profile-dialog"
          width="min(430px, 92vw)"
          onClose={() => setProfileOpen(false)}
          title={`👤 ${tr('shell.user.profile')}`}
          footer={<DialogCloseButton t={t} onClick={() => setProfileOpen(false)} testId="profile-close" />}
        >
            <AccountProfileForm
              t={t}
              onSaved={(m) => onFlash?.(m)}
              onDeleteAccount={authEnabled && session ? () => { setProfileOpen(false); openDelete(); } : undefined}
            />
        </DialogFrame>
      )}

      {/* 개인 설정 — 화면 언어 (B10 i18n, 2026-10-05). 고르는 즉시 바뀌고
          이 브라우저에 기억된다(localStorage `emm.lang`). */}
      {settingsOpen && (
        <DialogFrame
          t={t}
          testId="settings-dialog"
          width="min(430px, 92vw)"
          onClose={() => setSettingsOpen(false)}
          title={`⚙ ${tr('shell.user.settings')}`}
          subtitle={tr('shell.user.settingsSubtitle')}
          footer={<DialogCloseButton t={t} onClick={() => setSettingsOpen(false)} testId="settings-close" />}
        >
            <LanguagePicker t={t} />
            <div style={{ fontSize: 11.5, color: t.textMuted, lineHeight: 1.6, marginTop: 8 }}>
              {tr(profile?.languageReady ? 'common.languageHintAccount' : 'common.languageHint')}
            </div>
        </DialogFrame>
      )}

      {/* 비밀번호 변경 — 관리자 콘솔과 **같은 폼**을 쓴다 */}
      {pwOpen && (
        <DialogFrame
          t={t}
          testId="password-dialog"
          width="min(430px, 92vw)"
          onClose={() => setPwOpen(false)}
          title={`🔑 ${tr('shell.user.password')}`}
          footer={<DialogCloseButton t={t} onClick={() => setPwOpen(false)} testId="password-close" />}
        >
            <ChangePasswordForm t={t} email={session?.email ?? ''} />
        </DialogFrame>
      )}

      {aiSettingsOpen && (
        <DialogFrame
          t={t}
          testId="ai-settings-dialog"
          width="min(560px, 94vw)"
          onClose={() => setAiSettingsOpen(false)}
          title={`🤖 ${tr('shell.user.aiSettings')}`}
          subtitle={tr('shell.user.aiSettingsSubtitle')}
          footer={<DialogCloseButton t={t} onClick={() => setAiSettingsOpen(false)} testId="ai-settings-close" />}
        >
            <AiSettingsView t={t} />
        </DialogFrame>
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
              {tr('shell.user.unsavedDraftsTitle')}
            </div>
            <div style={{ fontSize: 12.5, color: t.textMuted, lineHeight: 1.7, marginBottom: 16 }}>
              {rich(tr('shell.user.unsavedDraftsBody', { n: warnDrafts }))}
              <br />
              {rich(tr('shell.user.unsavedDraftsHint'))}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <button
                data-testid="logout-cancel"
                onClick={() => setWarnDrafts(null)}
                style={{
                  height: 36, borderRadius: 7, border: 'none', cursor: 'pointer',
                  background: t.primary, color: '#fff', fontSize: 13, fontWeight: 700,
                }}
              >{tr('shell.user.logoutCancel')}</button>
              <button
                data-testid="logout-anyway"
                onClick={doLogout}
                style={{
                  height: 34, borderRadius: 7, cursor: 'pointer',
                  border: `1px solid ${t.border}`, background: t.surfaceAlt,
                  color: t.text, fontSize: 12.5, fontWeight: 600,
                }}
              >{tr('shell.user.logoutAnyway')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
