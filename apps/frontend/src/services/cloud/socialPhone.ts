// 소셜 가입 휴대폰 번호 미리 채우기 (2026-11-28 사용자 결정 "(A) 추천대로").
//
// 카카오·네이버로 로그인·연결하고 돌아온 순간(SocialCallbackPage) 공급자 토큰으로
// EMM API(POST /v1/auth/social/phone)에 **한 번** 번호를 묻고, 이 탭 sessionStorage 에 잠깐 둔다.
//   · 가입 마무리 창·계정 프로필이 그 번호로 휴대폰 칸을 **미리 채운다** — 저장은 사용자가 누를 때만.
//   · '인증됨'은 여전히 ARS 인증을 마쳤을 때만 — 공급자 번호를 인증된 것으로 치지 않는다.
//   · 공급자 토큰은 이 요청에만 쓰고 어디에도 두지 않는다.
//   · Google 은 번호를 주지 않는다 — 묻지 않는다.
import type { SocialId } from './socialAuth';

export interface PhoneHint {
  userId: string;
  provider: 'kakao' | 'naver';
  /** '+82' 모양 */
  country: string;
  /** 숫자만 */
  number: string;
  at: number;
}

export const PHONE_HINT_KEY = 'emm.social.phoneHint.v1';
const TTL = 30 * 60_000;

const ss = (): Storage | null => { try { return window.sessionStorage; } catch { return null; } };

export function savePhoneHint(h: PhoneHint, store: Storage | null = ss()): void {
  try { store?.setItem(PHONE_HINT_KEY, JSON.stringify(h)); } catch { /* 미리 채우기만 빠진다 */ }
}

export function clearPhoneHint(store: Storage | null = ss()): void {
  try { store?.removeItem(PHONE_HINT_KEY); } catch { /* 없음 */ }
}

/** 이 사용자 몫이고 30분 안의 것만 — 다른 계정·오래된 것·모양이 틀린 것은 버린다 */
export function readPhoneHint(userId: string | undefined, now = Date.now(), store: Storage | null = ss()): PhoneHint | null {
  if (!userId || !store) return null;
  let raw: string | null = null;
  try { raw = store.getItem(PHONE_HINT_KEY); } catch { return null; }
  if (!raw) return null;
  try {
    const h = JSON.parse(raw) as PhoneHint;
    const ok = h && h.userId === userId
      && (h.provider === 'kakao' || h.provider === 'naver')
      && /^\+\d{1,4}$/.test(h.country) && /^\d{6,15}$/.test(h.number)
      && typeof h.at === 'number' && now - h.at <= TTL && h.at <= now + 60_000;
    if (!ok) { clearPhoneHint(store); return null; }
    return h;
  } catch { clearPhoneHint(store); return null; }
}

/**
 * 콜백에서 한 번 — 번호를 받아 두면 true. 실패·없음·시간 초과는 조용히 false
 * (로그인 자체를 늦추지 않도록 짧게 기다린다).
 */
export async function collectPhoneHint(
  provider: SocialId, providerToken: string | null, userId: string,
  ask: (p: 'kakao' | 'naver', token: string) => Promise<{ phone: { country: string; number: string } | null }>,
  timeoutMs = 4000,
): Promise<boolean> {
  if ((provider !== 'kakao' && provider !== 'naver') || !providerToken || !userId) return false;
  try {
    const r = await Promise.race([
      ask(provider, providerToken),
      new Promise<null>((res) => setTimeout(() => res(null), timeoutMs)),
    ]);
    const p = r?.phone;
    if (!p || !/^\+\d{1,4}$/.test(p.country) || !/^\d{6,15}$/.test(p.number)) return false;
    savePhoneHint({ userId, provider, country: p.country, number: p.number, at: Date.now() });
    return true;
  } catch { return false; }
}
