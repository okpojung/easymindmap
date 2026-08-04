// 인증 상태 (Phase 3 — Supabase Auth 이메일/비밀번호).
//
// 세션(access/refresh 토큰)은 localStorage 에 영속되어 새로고침해도
// 로그인이 유지된다. VITE_SUPABASE_URL 미설정(개발 모드)이면 authEnabled
// = false — 로그인 UI 를 숨기고 기존처럼 토큰 없이 호출한다(백엔드
// AUTH_MODE=dev 가 처리).

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  authEnabled,
  supabaseAuth,
  type AuthSession,
} from '@/services/cloud/supabaseAuth';

interface AuthState {
  session: AuthSession | null;
  /**
   * Guest 체험 모드 (2026-08-04) — 가입 없이 로컬 에디터만 쓴다.
   * 서버 저장·불러오기·첨부·API 키 AI 는 막히고(각 화면이 이 플래그로
   * 판단), MD/HTML 내보내기와 웹 AI 붙여넣기는 된다. 세션과 배타적 —
   * 로그인·가입하면 자동 해제된다.
   */
  guest: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  /** 가입 — 세션이 곧바로 오면 로그인까지 완료. false = 이메일 확인 필요 */
  signUp: (email: string, password: string) => Promise<boolean>;
  signOut: () => Promise<void>;
  setSession: (s: AuthSession | null) => void;
  enterGuest: () => void;
  /** Guest 종료 → 로그인 화면으로 (가입 유도 통로) */
  exitGuest: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      session: null,
      guest: false,

      signIn: async (email, password) => {
        const s = await supabaseAuth.signIn(email, password);
        set({ session: s, guest: false });
      },

      signUp: async (email, password) => {
        const s = await supabaseAuth.signUp(email, password);
        if (s) {
          set({ session: s, guest: false });
          return true;
        }
        return false;
      },

      signOut: async () => {
        const cur = get().session;
        set({ session: null, guest: false });
        if (cur) await supabaseAuth.signOut(cur.accessToken);
      },

      setSession: (s) => set({ session: s, ...(s ? { guest: false } : {}) }),
      enterGuest: () => set({ guest: true, session: null }),
      exitGuest: () => set({ guest: false }),
    }),
    {
      name: 'emm.auth',
      partialize: (s) => ({ session: s.session, guest: s.guest }),
    },
  ),
);

export { authEnabled };

/**
 * API 호출 직전에 부르는 헬퍼 — 유효한 액세스 토큰을 돌려준다.
 * 만료(60초 여유)면 refresh 토큰으로 갱신을 시도하고, 갱신 실패 시
 * 세션을 지우고 null(= 재로그인 필요)을 반환한다.
 */
export async function getFreshAccessToken(): Promise<string | null> {
  if (!authEnabled) return null;
  const st = useAuthStore.getState();
  const s = st.session;
  if (!s) return null;
  if (Date.now() < s.expiresAt - 60_000) return s.accessToken;
  try {
    const next = await supabaseAuth.refresh(s.refreshToken);
    // refresh 응답에는 user 가 없을 수 있다 — 기존 식별 정보 유지
    const merged = {
      ...next,
      userId: next.userId || s.userId,
      email: next.email || s.email,
    };
    st.setSession(merged);
    return merged.accessToken;
  } catch {
    st.setSession(null);
    return null;
  }
}
