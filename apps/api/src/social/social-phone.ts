/**
 * 소셜 가입 휴대폰 번호 미리 채우기 (2026-11-28 사용자 결정 "(A) 추천대로").
 *
 * 카카오·네이버에 로그인하면 그 공급자가 가진 휴대폰 번호를 **한 번** 받아
 * 가입 마무리 창·계정 프로필의 휴대폰 칸에 **미리 채운다**.
 *   · 저장은 사용자가 [시작하기]/[저장]을 누를 때만 — 여기서는 아무것도 저장하지 않는다.
 *   · '인증됨'은 여전히 EMM ARS 인증을 마쳤을 때만 — 공급자 번호를 인증된 것으로 치지 않는다.
 *   · Google 은 전화번호를 주지 않는다(민감 권한 심사 필요) — 대상이 아니다.
 *
 * 공급자별 모양
 *   · 카카오 /v2/user/me       → kakao_account.phone_number = "+82 10-1234-5678" (해외는 "+1 650-…")
 *   · 네이버 /v1/nid/me        → response.mobile = "010-1234-5678", mobile_e164 = "+821012345678"
 */
export interface PhoneHint {
  /** '+82' 모양 */
  country: string;
  /** 숫자만 — 한국 번호는 0으로 시작하는 국내 모양(01012345678) */
  number: string;
}

const digits = (s: string) => s.replace(/\D/g, '');

/** 공급자가 준 번호 문자열 → { country, number } (모양이 이상하면 null) */
export function normalizeProviderPhone(raw: unknown): PhoneHint | null {
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  if (!s || s.length > 40) return null;
  let country: string;
  let national: string;
  const intl = /^\+(\d{1,4})[\s-]+(.+)$/.exec(s);
  if (intl) {
    country = intl[1];
    national = digits(intl[2]);
  } else if (/^\+\d+$/.test(s.replace(/[\s-]/g, ''))) {
    // E.164 를 한 덩어리로 준 경우 — 한국(+82)만 나눌 수 있다
    const all = digits(s);
    if (!all.startsWith('82')) return null;
    country = '82';
    national = all.slice(2);
  } else {
    // 국가번호 없이 온 것은 국내(한국) 번호로 본다 — 네이버 mobile
    country = '82';
    national = digits(s);
  }
  if (country === '82' && national && !national.startsWith('0')) national = '0' + national;
  if (national.length < 6 || national.length > 15) return null;
  if (country === '82' && !/^01\d{8,9}$/.test(national)) return null; // 한국은 휴대폰(01x)만
  return { country: '+' + country, number: national };
}

/** 카카오 사용자 정보에서 번호 — 동의하지 않았거나 권한이 없으면 null */
export function kakaoPhoneOf(me: unknown): PhoneHint | null {
  const acc = (me as { kakao_account?: { phone_number?: unknown } } | null)?.kakao_account;
  return normalizeProviderPhone(acc?.phone_number);
}

/** 네이버 사용자 정보에서 번호 — mobile_e164 가 있으면 그것을, 없으면 mobile */
export function naverPhoneOf(me: unknown): PhoneHint | null {
  const m = me as { resultcode?: string; response?: { mobile?: unknown; mobile_e164?: unknown } } | null;
  if (!m || m.resultcode !== '00' || !m.response) return null;
  return normalizeProviderPhone(m.response.mobile_e164) ?? normalizeProviderPhone(m.response.mobile);
}
