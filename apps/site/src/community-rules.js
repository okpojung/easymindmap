/**
 * 게시판·문의 화면의 규칙 — API 계약 v0.3 (homepage-app-api-20261022) 과 같은 값.
 * 화면 검사는 편의일 뿐이고 최종 판정은 서버가 한다.
 */
export const APP_ORIGIN = 'https://web.easymindmap.org';

export const BOARDS = [
  { id: 'review', label: '사용 소감', writable: true },
  { id: 'free', label: '자유 의견', writable: true },
  { id: 'bug', label: '버그 리포트', writable: true },
  { id: 'notice', label: '공지사항', writable: false },
];

export const INQUIRY_CATEGORIES = [
  { id: 'usage', label: '사용 방법' },
  { id: 'bug', label: '오류·버그' },
  { id: 'billing', label: '요금·결제' },
  { id: 'partnership', label: '제휴·협업' },
  { id: 'other', label: '기타' },
];

export const INQUIRY_LIMITS = { nameMax: 50, bodyMin: 20, bodyMax: 5000, linksMax: 2 };

/** 알 수 없는 값은 사용 소감으로 — 주소창에 아무 값이나 넣어도 화면이 깨지지 않게 */
export function normalizeBoard(value) {
  return BOARDS.some(b => b.id === value) ? value : 'review';
}

export function boardLabel(id) {
  return BOARDS.find(b => b.id === id)?.label ?? '';
}

/** 계약 §1 앱 링크. 게시판 링크에는 from=www 를 붙이지 않는다(게스트 팝업은 체험 버튼 전용). */
export function appBoardUrl(board, opts = {}) {
  const q = new URLSearchParams({ board: normalizeBoard(board) });
  if (opts.write && board !== 'notice') q.set('write', '1');
  if (opts.post) q.set('post', String(opts.post));
  return `${APP_ORIGIN}/?${q.toString()}${opts.post ? '#comments' : ''}`;
}

/** www 안의 게시판 주소 */
export function boardPath(board, opts = {}) {
  const q = new URLSearchParams({ b: normalizeBoard(board) });
  if (opts.post) q.set('post', String(opts.post));
  if (opts.q) q.set('q', String(opts.q));
  return `/board?${q.toString()}`;
}

export function countLinks(text) {
  return (String(text).match(/https?:\/\/|www\./gi) || []).length;
}

/** 첫 번째로 걸리는 칸의 안내 문장을 돌려준다. 문제 없으면 null. */
export function validateInquiry(form) {
  const name = String(form.name ?? '').trim();
  const email = String(form.email ?? '').trim();
  const body = String(form.body ?? '').trim();
  if (!name) return { field: 'name', message: '이름을 입력해 주세요.' };
  if (name.length > INQUIRY_LIMITS.nameMax) return { field: 'name', message: `이름은 ${INQUIRY_LIMITS.nameMax}자까지 쓸 수 있습니다.` };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { field: 'email', message: '회신받을 이메일 주소를 정확히 입력해 주세요.' };
  if (!INQUIRY_CATEGORIES.some(c => c.id === form.category)) return { field: 'category', message: '문의 종류를 골라 주세요.' };
  if (body.length < INQUIRY_LIMITS.bodyMin) return { field: 'body', message: `문의 내용을 ${INQUIRY_LIMITS.bodyMin}자 이상 적어 주세요.` };
  if (body.length > INQUIRY_LIMITS.bodyMax) return { field: 'body', message: `문의 내용은 ${INQUIRY_LIMITS.bodyMax}자까지 쓸 수 있습니다.` };
  if (countLinks(body) > INQUIRY_LIMITS.linksMax) return { field: 'body', message: `링크는 ${INQUIRY_LIMITS.linksMax}개까지 넣을 수 있습니다.` };
  if (form.privacyConsent !== true) return { field: 'privacyConsent', message: '개인정보 수집·이용에 동의해 주세요.' };
  return null;
}

/** 서버로 보낼 요청 본문. 숨은 칸(website)은 사람이 비워 둔 값을 그대로 보낸다. */
export function inquiryPayload(form, formOpenedAt, turnstileToken) {
  return {
    name: String(form.name).trim(),
    email: String(form.email).trim(),
    category: form.category,
    body: String(form.body).trim(),
    privacyConsent: true,
    website: String(form.website ?? ''),
    formOpenedAt,
    turnstileToken: String(turnstileToken ?? ''),
  };
}

export function formatDate(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`;
}

/** 게시판 본문 링크: http(s)·mailto 만 허용. 그 밖은 null(글자로만 보인다). */
export function safeLinkHref(url) {
  try {
    const u = new URL(String(url));
    return ['http:', 'https:', 'mailto:'].includes(u.protocol) ? u.href : null;
  } catch { return null; }
}

/** 같은 API 의 게시판 첨부 주소일 때만 첨부 id 를 돌려준다(그때만 <img> 로 그린다). */
export function boardAttachmentId(url, apiUrl) {
  try {
    const u = new URL(String(url));
    const api = new URL(String(apiUrl));
    if (u.origin !== api.origin || u.search || u.hash) return null;
    const m = /^\/v1\/board\/attachments\/([A-Za-z0-9-]{1,64})$/.exec(u.pathname);
    return m ? m[1] : null;
  } catch { return null; }
}

/**
 * Cloudflare Turnstile 사이트 키 (공개 값). 운영 도메인에서만 운영 키를 쓰고,
 * 로컬·개발 미리보기는 Cloudflare 공식 시험 키(항상 통과)를 쓴다.
 */
export const TURNSTILE_SITE_KEYS = { production: '0x4AAAAAAFkEbyZmsEwI_cRN', test: '1x00000000000000000000AA' };
export const PRODUCTION_HOSTS = ['www.easymindmap.org', 'easymindmap.org'];
export function turnstileSiteKey(hostname, override) {
  if (override && String(override).trim()) return String(override).trim();
  return PRODUCTION_HOSTS.includes(String(hostname).toLowerCase()) ? TURNSTILE_SITE_KEYS.production : TURNSTILE_SITE_KEYS.test;
}
