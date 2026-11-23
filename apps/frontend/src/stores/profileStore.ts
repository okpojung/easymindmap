// profileStore — 로그인한 사람의 **계정 프로필**(성명·휴대폰) (2026-09-08).
//
// 세션(`authStore`)에는 이메일과 토큰뿐이다. 성명·휴대폰은 가입 때 서버
// `users` 표에 저장되므로(`/account/profile`), 로그인 뒤 한 번 읽어 여기 둔다.
// 쓰는 곳: 우상단 아바타 글자·계정 메뉴·계정 프로필 창(코어), 협업의
// 이름표·프레즌스(유료 `@pro` — 코어가 자리를 내고 그쪽이 읽는다).
//
//   · `load()` 는 멱등 — 같은 사용자면 다시 읽지 않는다(`force` 로 강제).
//   · 실패해도 `loaded=true` — 기다리는 쪽(협업 시작)이 영영 멈추지 않게.
//   · 다른 계정으로 바뀌면 비운다(앞사람 이름이 남지 않게).

import { create } from 'zustand';
import { cloudApi, type AccountProfile } from '@/services/cloud/apiClient';
import { authEnabled, captureAuthIdentity, isAuthIdentityCurrent, useAuthStore, type AuthIdentity } from '@/stores/authStore';
import { LANGS, tr, useLangStore, type Lang, takeUrlLangChoice } from '@/i18n';
import { clearPendingProfile, markClaimAttempted, readPendingProfile, type PendingProfile } from './pendingProfile';

export function profileOwner(id: AuthIdentity): string | null {
  return id.userId || (authEnabled ? null : 'dev');
}
function expectedPhone(p: AccountProfile, expected: PendingProfile): boolean {
  return !!expected.phoneNumber && p.phoneCountry === expected.phoneCountry && p.phoneNumber === expected.phoneNumber;
}

// The claim can commit even if its response was lost. Only a fresh GET proves status.
export async function reconcileSignupPhone(expected: PendingProfile, current: () => boolean, claim: () => Promise<void>) {
  if (!current()) return null;
  let ambiguous = false;
  try { await claim(); } catch { ambiguous = true; }
  if (!current()) return null;
  try {
    const profile = await cloudApi.getProfile();
    const verified = expectedPhone(profile, expected) && !!profile.phoneVerifiedAt;
    // A timeout can precede COMMIT: a different connection may still read the old row.
    return current() && (!ambiguous || verified) ? { profile, verified } : null;
  } catch { return null; }
}

interface ProfileState {
  profile: AccountProfile | null;
  forUser: string | null;
  loaded: boolean;
  error: string | null;
  load: (opts?: { force?: boolean }) => Promise<AccountProfile | null>;
  setProfile: (p: AccountProfile | null, identity: AuthIdentity, error?: string) => void;
  clear: () => void;
}
let inflight: { id: AuthIdentity; result: Promise<AccountProfile | null> } | null = null;
let revision = 0;
export const useProfileStore = create<ProfileState>((set, get) => ({
  profile: null, forUser: null, loaded: false, error: null,
  load: async ({ force } = {}) => {
    const id = captureAuthIdentity();
    const uid = profileOwner(id);
    if (!uid) { set({ profile: null, forUser: null, loaded: true, error: null }); return null; }
    if (inflight && isAuthIdentityCurrent(inflight.id)) {
      if (!force) return inflight.result;
      // A post-verification refresh must read AFTER any older snapshot or claim.
      await inflight.result;
      return isAuthIdentityCurrent(id) ? get().load({ force: true }) : null;
    }
    if (!force && get().loaded && get().forUser === uid) return get().profile;
    const version = ++revision;
    const current = () => isAuthIdentityCurrent(id) && revision === version;
    const result = (async () => {
      const email = (useAuthStore.getState().session?.email ?? '').trim().toLowerCase();
      const own = email ? readPendingProfile(email) : null;
      let unknown = !!own?.data.readOnly && Number(own.data.expiresAt) > Date.now();
      try {
        let p = await cloudApi.getProfile();
        if (!current()) return null;
        let error: string | null = null;
        if (own && readPendingProfile(email)?.key === own.key) {
          const data = own.data;
          if (!p.fullName && !data.readOnly) {
            p = await cloudApi.saveProfile({ fullName: data.fullName, phoneCountry: data.phoneCountry, phoneNumber: data.phoneNumber });
            if (!current()) return null;
          }
          if (data.phoneIntent && !(expectedPhone(p, data) && p.phoneVerifiedAt)) {
            if (unknown) throw new Error(); // read-only pending: only a positive GET settles it before expiry
            if (!data.readOnly && Number(data.expiresAt) > Date.now() && expectedPhone(p, data)) {
              const pro = await import('@pro');
              if (!current()) return null;
              if (markClaimAttempted(own)) {
                unknown = true;
                const r = await reconcileSignupPhone(data, current, () => pro.claimSignupPhone(data.phoneIntent!));
                if (!current()) return null;
                if (!r) throw new Error();
                p = r.profile;
              } else if (readPendingProfile(email)?.key === own.key && readPendingProfile(email)?.data.readOnly) {
                unknown = true; // another tab already started this claim
                throw new Error();
              }
            }
            if (!(expectedPhone(p, data) && p.phoneVerifiedAt)) error = tr('auth.signup.phoneFallback');
          }
          if (current()) clearPendingProfile(own);
        }
        if (!current()) return null;
        set({ profile: p, forUser: uid, loaded: true, error });
        if (current()) syncLanguageFromProfile(p, id);
        return p;
      } catch (err) {
        if (!current()) return null;
        if (own?.data.readOnly && Number(own.data.expiresAt) <= Date.now()) clearPendingProfile(own);
        const why = unknown ? tr('auth.signup.phoneUnknown') : err instanceof Error ? err.message : tr('auth.profile.readFailed');
        set({ profile: null, forUser: uid, loaded: true, error: why });
        return null;
      }
    })().finally(() => { if (inflight?.result === result) inflight = null; });
    inflight = { id, result };
    return result;
  },
  setProfile: (profile, id, error = null) => {
    if (!isAuthIdentityCurrent(id)) return;
    ++revision; inflight = null;
    set({ profile, forUser: profileOwner(id), loaded: true, error });
  },
  clear: () => {
    ++revision; inflight = null;
    set({ profile: null, forUser: null, loaded: false, error: null });
  },
}));
useAuthStore.subscribe((s, prev) => {
  if (s.generation !== prev.generation || s.session?.userId !== prev.session?.userId) useProfileStore.getState().clear();
});

// ── 화면 언어를 계정에 (2026-10-05, i18n.md P3) ─────────────────────────
//
// 어느 기기에서 로그인해도 같은 언어로 뜨게 한다. 순서(i18n.md §1):
//   ① 프로필을 읽었을 때 계정에 언어가 있으면 **그것을 따른다**(서버가 이긴다)
//   ② 계정에 아직 없으면(처음) 지금 이 브라우저의 언어를 계정에 올린다
//   ③ 로그인한 채 언어를 바꾸면 계정에도 저장한다
// 서버에 열이 없으면(델타 전, `languageReady:false`) 아무것도 올리지 않는다 —
// 언어는 지금처럼 이 브라우저에만 기억된다.

/** ① 을 적용하는 동안 ③ 이 그 변경을 다시 서버로 올리지 않게 */
let applyingFromServer = false;

function isLang(v: unknown): v is Lang {
  return typeof v === 'string' && (LANGS as readonly string[]).includes(v);
}

function pushLanguage(lang: Lang, id: AuthIdentity): void {
  if (!isAuthIdentityCurrent(id)) return;
  void cloudApi.saveLanguage(lang)
    .then((r) => {
      const st = useProfileStore.getState();
      if (r.saved && isAuthIdentityCurrent(id) && st.forUser === profileOwner(id) && st.profile) {
        useProfileStore.setState({ profile: { ...st.profile, language: lang } });
      }
    })
    .catch(() => { /* 못 올려도 이 브라우저에는 기억돼 있다 — 다음 변경 때 다시 */ });
}

function syncLanguageFromProfile(p: AccountProfile, id: AuthIdentity): void {
  if (!isAuthIdentityCurrent(id) || !p.languageReady) return;
  const local = useLangStore.getState().lang;
  // 주소로 언어를 골라 들어왔다(홈페이지 'EMM 로그인' ?lang=, 2026-10-28) — 방금 고른 것이 이긴다.
  // 계정 언어를 따르지 않고, 계정을 그 언어로 바꾼다
  const urlChoice = takeUrlLangChoice();
  if (urlChoice) {
    if (p.language !== urlChoice) pushLanguage(urlChoice, id);
    return;
  }
  if (isLang(p.language)) {
    if (p.language !== local) {
      applyingFromServer = true;
      try { useLangStore.getState().setLang(p.language); } finally { applyingFromServer = false; }
    }
  } else {
    pushLanguage(local, id);
  }
}

useLangStore.subscribe((s, prev) => {
  if (s.lang === prev.lang || applyingFromServer) return;
  if (!useAuthStore.getState().session) return; // 게스트·로그인 전 — 브라우저에만
  const st = useProfileStore.getState();
  if (!st.profile?.languageReady) return;
  pushLanguage(s.lang, captureAuthIdentity());
});
