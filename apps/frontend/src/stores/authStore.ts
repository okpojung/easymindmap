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
import { clearAllLocalDrafts, pauseLocalDrafts } from '@/hooks/useLocalDraft';

import { clearAiKeysOnLogout } from '@/services/cloud/aiKeysSync';

export interface AuthIdentity { readonly generation: number; readonly userId: string | null }
export function captureAuthIdentity(): AuthIdentity {
  const {generation, session} = useAuthStore.getState();
  return { generation, userId: session?.userId ?? null };
}
export function isAuthIdentityCurrent(id: AuthIdentity): boolean {
  const s = useAuthStore.getState();
  return s.generation === id.generation && (s.session?.userId ?? null) === id.userId;
}

// A later account may open before IndexedDB has finished clearing the old drafts.
// Keep draft writes paused through that cleanup, including guest transitions.
let clearingDrafts: Promise<void> | null = null;
function discardDrafts(): Promise<void> {
  if (clearingDrafts) return clearingDrafts;
  clearingDrafts = clearAllLocalDrafts().finally(() => {
    clearingDrafts = null;
    const s = useAuthStore.getState();
    if (s.session || s.guest) pauseLocalDrafts(false);
  });
  return clearingDrafts;
}
function resumeDrafts(): void { if (!clearingDrafts) pauseLocalDrafts(false); }

interface AuthState {
  generation: number;
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
  signUp: (email: string, password: string) => Promise<{ signedIn: boolean; identity: AuthIdentity }>;
  signOut: () => Promise<void>;
  setSession: (s: AuthSession | null) => void;
  enterGuest: () => void;
  /** Guest 종료 → 로그인 화면으로 (가입 유도 통로) */
  exitGuest: () => void;
}

/**
 * 로그인했다고 서버에 한 번 알린다 — **접속 IP 를 남기려고** (2026-08-14).
 *
 * 왜 여기인가: 일반 로그인·관리자 로그인·가입이 전부 이 스토어를 지난다.
 * 화면마다 부르면 한 곳을 빠뜨린다.
 *
 * **실패해도 로그인은 성공이다.** 기록은 곁들이지 로그인의 조건이 아니다 —
 * 그래서 await 하지 않고, 오류도 삼킨다(서버가 낡아 404 여도 마찬가지).
 */
function noteLogin(id: AuthIdentity): void {
  void import('@/services/cloud/apiClient')
    .then((m) => isAuthIdentityCurrent(id) ? m.cloudApi.recordLogin() : undefined)
    .catch(() => { /* 기록 실패가 로그인을 막지 않는다 */ });
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      session: null,
      guest: false,
      generation: 0,

      signIn: async (email, password) => {
        const generation = get().generation + 1;
        set({ generation });
        const s = await supabaseAuth.signIn(email, password);
        if (get().generation !== generation) throw new Error('Session changed');
        get().setSession(s);
        noteLogin({ generation: generation + 1, userId: s.userId });
      },

      signUp: async (email, password) => {
        const generation = get().generation + 1;
        set({ generation });
        const s = await supabaseAuth.signUp(email, password);
        if (get().generation !== generation) throw new Error('Session changed');
        if (!s) return { signedIn: false, identity: captureAuthIdentity() };
        get().setSession(s);
        const identity = { generation: generation + 1, userId: s.userId };
        noteLogin(identity);
        return { signedIn: true, identity };
      },

      signOut: async () => {
        const cur = get().session;
        const generation = get().generation + 1;
        const drafts = discardDrafts();
        set({ generation, session: null, guest: false });
        if (get().generation === generation) {
          try { clearAiKeysOnLogout(); } catch { /* best-effort local cleanup */ }
        }
        await Promise.all([drafts, cur && supabaseAuth.signOut(cur.accessToken)]);
      },

      setSession: (s) => {
        set({ generation: get().generation + 1, session: s, ...(s ? { guest: false } : {}) });
        if (s && get().session === s) resumeDrafts();
      },
      enterGuest: () => { set({ generation: get().generation + 1, guest: true, session: null }); resumeDrafts(); },
      exitGuest: () => { void discardDrafts(); set({ generation: get().generation + 1, guest: false }); },
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
let refreshing: { generation: number; result: Promise<string | null> } | null = null;
export async function getFreshAccessToken(): Promise<string | null> {
  if (!authEnabled) return null;
  const st = useAuthStore.getState();
  const s = st.session;
  if (!s) return null;
  if (Date.now() < s.expiresAt - 60_000) return s.accessToken;
  const id = captureAuthIdentity();
  if (refreshing?.generation === id.generation) return refreshing.result;
  const result = supabaseAuth.refresh(s.refreshToken).then(next => {
    if (!isAuthIdentityCurrent(id)) return null;
    if (next.userId && next.userId !== s.userId) throw new Error('Unexpected refresh identity');
    const session = { ...next, userId: s.userId, email: next.email || s.email };
    useAuthStore.setState({ session }); // credential rotation, not an account transition
    return isAuthIdentityCurrent(id) ? session.accessToken : null;
  }).catch(() => {
    if (isAuthIdentityCurrent(id)) st.setSession(null);
    return null;
  }).finally(() => { if (refreshing?.result === result) refreshing = null; });
  refreshing = { generation: id.generation, result };
  return result;
}
