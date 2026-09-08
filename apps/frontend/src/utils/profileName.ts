// profileName — 계정 프로필의 **이름·아바타 글자·휴대폰 표시** (2026-09-08).
//
// 사용자 요청: 아바타에 이메일 첫 글자 대신 **이름의 첫 글자**, 협업 화면의
// 이메일 대신 **이름**, 이름에 마우스를 올리면 이메일·휴대폰.
// 순수 함수 — 단위 테스트(profileName.test.ts)가 표를 그대로 본다.

/** 화면에 보일 이름 — 성명이 없으면 이메일, 그것도 없으면 '나' */
export function displayNameOf(
  fullName: string | null | undefined,
  email: string | null | undefined,
): string {
  const n = (fullName ?? '').trim();
  if (n) return n;
  const e = (email ?? '').trim();
  return e || '나';
}

/**
 * 아바타 한 글자.
 *   · 성명이 있으면 **첫 글자** — 한글 성명은 성(`홍길동`→`홍`), 로마자는
 *     이름 첫 자를 대문자(`john doe`→`J`).
 *   · 없으면 이메일 첫 글자(대문자), 그것도 없으면 `·`.
 */
export function avatarInitialOf(
  fullName: string | null | undefined,
  email: string | null | undefined,
): string {
  const n = (fullName ?? '').trim();
  const first = [...(n || (email ?? '').trim())][0] ?? '';
  return first ? first.toUpperCase() : '·';
}

/** 아바타 값 해석 — 사진(data URL) · 이모지('emoji:😀') · 없음 (2026-09-08) */
export type AvatarView = { kind: 'image'; src: string } | { kind: 'emoji'; ch: string } | null;
export function avatarView(avatar: string | null | undefined): AvatarView {
  const v = (avatar ?? '').trim();
  if (!v) return null;
  if (v.startsWith('emoji:')) {
    const ch = v.slice(6).trim();
    return ch ? { kind: 'emoji', ch } : null;
  }
  if (/^data:image\/(png|jpeg|webp);base64,/i.test(v)) return { kind: 'image', src: v };
  return null;
}

/** 고를 수 있는 이모지 아바타 (네이버 웨일처럼 사진 대신 캐릭터) */
export const AVATAR_EMOJIS = ['😀', '😎', '🤓', '🥸', '🦊', '🐻', '🐼', '🐯', '🦁', '🐸', '🐧', '🦉', '🌻', '🍀', '🚀', '⭐'];

/**
 * 휴대폰 표시 — 서버는 국가번호(`+82`)와 **숫자만**(`01012345678`) 따로 둔다.
 *   · 한국(+82) 은 `010-1234-5678` 꼴(11자리 3-4-4 · 10자리 3-3-4).
 *   · 다른 나라는 `+1 2125551234`.
 *   · 번호가 없으면 null — 호출한 쪽이 "등록되지 않음" 을 정한다.
 */
export function formatPhone(
  country: string | null | undefined,
  number: string | null | undefined,
): string | null {
  const digits = String(number ?? '').replace(/\D/g, '');
  if (!digits) return null;
  const cc = String(country ?? '').replace(/\D/g, '');
  if (!cc || cc === '82') {
    // 국내 표기 — 앞의 0 이 빠져 있으면(`1012345678`) 붙인다
    const local = digits.startsWith('0') ? digits : `0${digits}`;
    if (local.length === 11) return `${local.slice(0, 3)}-${local.slice(3, 7)}-${local.slice(7)}`;
    if (local.length === 10) return `${local.slice(0, 3)}-${local.slice(3, 6)}-${local.slice(6)}`;
    return local;
  }
  return `+${cc} ${digits}`;
}

/**
 * 성명 규칙 (2026-09-08 사용자 결정): **한글 또는 영문 대소문자 2자 이상**.
 * 글자 사이 공백은 허용(`홍 길동`, `John Doe`), 숫자·기호는 안 된다.
 * 서버(`SaveProfileDto`)도 같은 규칙으로 거른다.
 * @returns 문제가 없으면 null, 있으면 사용자에게 보일 문장
 */
export const NAME_LETTER_RE = /[가-힣A-Za-z]/g;
export function nameProblem(raw: string | null | undefined): string | null {
  const name = (raw ?? '').trim();
  if (!name) return '성명을 입력해 주세요.';
  if (name.length > 100) return '성명은 100자까지입니다.';
  if (!/^[가-힣A-Za-z][가-힣A-Za-z ]*$/.test(name)) return '성명은 한글 또는 영문(대소문자)만 쓸 수 있습니다.';
  if ((name.match(NAME_LETTER_RE) ?? []).length < 2) return '성명은 2자 이상 입력해 주세요.';
  return null;
}
