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
import { authEnabled, useAuthStore } from '@/stores/authStore';

interface ProfileState {
  profile: AccountProfile | null;
  /** 어느 사용자의 것인가 */
  forUser: string | null;
  /** 읽기 시도가 끝났다(실패 포함) */
  loaded: boolean;
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

  load: async ({ force } = {}) => {
    const uid = currentUserId();
    if (!uid) {
      set({ profile: null, forUser: null, loaded: true });
      return null;
    }
    if (!force && get().loaded && get().forUser === uid) return get().profile;
    if (inflight && !force) return inflight;
    inflight = cloudApi.getProfile()
      .then((p) => {
        // 기다리는 사이 계정이 바뀌었으면 버린다
        if (currentUserId() !== uid) return null;
        set({ profile: p, forUser: uid, loaded: true });
        return p;
      })
      .catch(() => {
        set({ profile: null, forUser: uid, loaded: true });
        return null;
      })
      .finally(() => { inflight = null; });
    return inflight;
  },

  setProfile: (profile) => set({ profile }),
  clear: () => set({ profile: null, forUser: null, loaded: false }),
}));

// 계정이 바뀌면(로그아웃·다른 계정 로그인) 비운다
useAuthStore.subscribe((s, prev) => {
  if (s.session?.userId !== prev.session?.userId) useProfileStore.getState().clear();
});
