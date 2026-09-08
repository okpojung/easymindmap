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
import { cloudApi, CloudError, type AccountProfile } from '@/services/cloud/apiClient';
import { authEnabled, useAuthStore } from '@/stores/authStore';

/**
 * **가입 때 적은 성명·휴대폰을 잃지 않는다** (2026-09-08 실사용 보고: 계정
 * 프로필에 가입 때 넣은 이름·휴대폰이 비어 있었다).
 *
 * 가입 흐름은 "계정 생성 → 세션 → 프로필 저장" 인데, 메일 확인이 켜진
 * 서버는 계정 생성 뒤 **세션을 주지 않는다.** 그러면 프로필 저장 차례가
 * 오지 않아 성명·휴대폰이 어디에도 남지 않았다. 그래서 그때는 이 브라우저에
 * 적어 두고, 그 이메일로 처음 로그인해 프로필을 읽을 때 성명이 비어 있으면
 * 여기 적어 둔 것을 서버에 넣는다.
 */
const PENDING_KEY = 'emm.pendingProfile';
export interface PendingProfile {
  email: string;
  fullName: string;
  phoneCountry?: string;
  phoneNumber?: string;
}
export function stashPendingProfile(p: PendingProfile): void {
  try { localStorage.setItem(PENDING_KEY, JSON.stringify({ ...p, email: p.email.trim().toLowerCase() })); } catch { /* 보관 못 해도 가입은 진행 */ }
}
export function readPendingProfile(): PendingProfile | null {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as PendingProfile;
    if (!p || typeof p.email !== 'string' || typeof p.fullName !== 'string') return null;
    return { ...p, email: p.email.trim().toLowerCase() };
  } catch { return null; }
}
export function clearPendingProfile(): void {
  try { localStorage.removeItem(PENDING_KEY); } catch { /* 없어도 그만 */ }
}

interface ProfileState {
  profile: AccountProfile | null;
  /** 어느 사용자의 것인가 */
  forUser: string | null;
  /** 읽기 시도가 끝났다(실패 포함) */
  loaded: boolean;
  /** 마지막 읽기가 실패했으면 그 이유 — 화면이 "등록되지 않음"과 구분해 보여 준다 */
  error: string | null;
  load: (opts?: { force?: boolean }) => Promise<AccountProfile | null>;
  setProfile: (p: AccountProfile | null) => void;
  clear: () => void;
}

let inflight: Promise<AccountProfile | null> | null = null;

function currentUserId(): string | null {
  const s = useAuthStore.getState().session;
  if (s?.userId) return s.userId;
  return authEnabled ? null : 'dev';
}

export const useProfileStore = create<ProfileState>((set, get) => ({
  profile: null,
  forUser: null,
  loaded: false,
  error: null,

  load: async ({ force } = {}) => {
    const uid = currentUserId();
    if (!uid) {
      set({ profile: null, forUser: null, loaded: true });
      return null;
    }
    if (!force && get().loaded && get().forUser === uid) return get().profile;
    if (inflight && !force) return inflight;
    inflight = cloudApi.getProfile()
      .then(async (p) => {
        // 기다리는 사이 계정이 바뀌었으면 버린다
        if (currentUserId() !== uid) return null;
        // 가입 때 적어 둔 성명이 있고 서버가 비어 있으면 지금 넣는다
        const pending = readPendingProfile();
        const email = (useAuthStore.getState().session?.email ?? '').trim().toLowerCase();
        if (pending && email && pending.email === email) {
          if (!p.fullName) {
            try {
              p = await cloudApi.saveProfile({
                fullName: pending.fullName,
                phoneCountry: pending.phoneCountry,
                phoneNumber: pending.phoneNumber,
              });
              clearPendingProfile();
            } catch { /* 다음 로그인 때 다시 시도한다 */ }
          } else {
            clearPendingProfile();
          }
        }
        set({ profile: p, forUser: uid, loaded: true, error: null });
        return p;
      })
      .catch((err: unknown) => {
        const why = err instanceof CloudError ? err.message : (err instanceof Error ? err.message : '프로필을 읽지 못했습니다.');
        set({ profile: null, forUser: uid, loaded: true, error: why });
        return null;
      })
      .finally(() => { inflight = null; });
    return inflight;
  },

  setProfile: (profile) => set({ profile, error: null }),
  clear: () => set({ profile: null, forUser: null, loaded: false, error: null }),
}));

// 계정이 바뀌면(로그아웃·다른 계정 로그인) 비운다
useAuthStore.subscribe((s, prev) => {
  if (s.session?.userId !== prev.session?.userId) useProfileStore.getState().clear();
});
