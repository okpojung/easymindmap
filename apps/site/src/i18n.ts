/**
 * 홈페이지 다국어 (2026-10-28) — 앱(web.easymindmap.org)과 같은 4개 언어.
 *
 *   한국어   /…        (지금 주소 그대로, 기존 링크 유지)
 *   English  /en/…
 *   日本語   /ja/…
 *   简体中文 /zh/…
 *
 * ★ 브라우저 언어로 **자동 이동하지 않는다**. 사용자가 언어 버튼으로 고른 값만
 *   기억하고(localStorage), 다음에 접두어 없는 주소로 오면 그 언어로 옮긴다.
 * ★ 언어를 바꾸면 페이지를 새로 읽는다(템플릿이 언어마다 따로라서).
 */
export const LANGS = ['ko', 'en', 'ja', 'zh'] as const;
export type Lang = (typeof LANGS)[number];

/** 언어 목록은 각 언어를 그 언어로 적는다 (앱과 같은 표기) */
export const LANG_LABELS: Record<Lang, string> = { ko: '한국어', en: 'English', ja: '日本語', zh: '简体中文' };
export const LANG_SHORT: Record<Lang, string> = { ko: 'KO', en: 'EN', ja: 'JA', zh: 'ZH' };
export const LANG_LOCALE: Record<Lang, string> = { ko: 'ko-KR', en: 'en-US', ja: 'ja-JP', zh: 'zh-CN' };
export const LANG_PREF_KEY = 'emm.site.lang';

export function isLang(v: unknown): v is Lang {
  return typeof v === 'string' && (LANGS as readonly string[]).includes(v);
}

/** `/en/library` → { lang: 'en', rest: '/library' } · `/library` → { lang: 'ko', rest: '/library' } */
export function splitLang(pathname: string): { lang: Lang; rest: string } {
  const m = /^\/(en|ja|zh)(\/.*)?$/.exec(pathname);
  if (!m) return { lang: 'ko', rest: pathname || '/' };
  return { lang: m[1] as Lang, rest: m[2] && m[2] !== '' ? m[2] : '/' };
}

/** 언어 + 언어 없는 경로 → 실제 주소 */
export function localize(lang: Lang, rest: string): string {
  const path = rest.startsWith('/') ? rest : '/' + rest;
  if (lang === 'ko') return path;
  return '/' + lang + (path === '/' ? '/' : path);
}

/** 페이지를 읽을 때 정해지는 현재 언어 (언어 전환은 새로 읽기라 바뀌지 않는다) */
export const CURRENT_LANG: Lang = typeof location === 'undefined' ? 'ko' : splitLang(location.pathname).lang;

/** 현재 언어 기준 주소 — `href('/library')` → `/en/library` */
export function href(rest: string): string {
  const hashAt = rest.indexOf('#');
  const path = hashAt >= 0 ? rest.slice(0, hashAt) : rest;
  const hash = hashAt >= 0 ? rest.slice(hashAt) : '';
  return localize(CURRENT_LANG, path || '/') + hash;
}

export function savedLang(): Lang | null {
  try { const v = localStorage.getItem(LANG_PREF_KEY); return isLang(v) ? v : null; } catch { return null; }
}
export function saveLang(lang: Lang): void {
  try { localStorage.setItem(LANG_PREF_KEY, lang); } catch { /* 저장소를 못 쓰면 기억만 못 한다 */ }
}

/**
 * 접두어 없는 주소로 왔고, 사용자가 전에 다른 언어를 골랐다면 그 언어 주소로 바꾼다.
 * 바꿨으면 true (호출한 쪽은 그리지 않는다).
 */
export function redirectToSavedLang(): boolean {
  if (typeof location === 'undefined') return false;
  const { lang, rest } = splitLang(location.pathname);
  if (lang !== 'ko') return false;
  const saved = savedLang();
  if (!saved || saved === 'ko') return false;
  // 공개 맵 뷰어(/p/)·번들 경로는 언어와 무관하다
  if (rest.startsWith('/p/') || rest.startsWith('/site-assets/') || rest.startsWith('/assets/')) return false;
  location.replace(localize(saved, rest) + location.search + location.hash);
  return true;
}

/**
 * 머리말의 언어 버튼 — 지금 보고 있는 페이지의 다른 언어 주소를 단다.
 * 고르면 기억하고, 주소 이동은 브라우저에 맡긴다(새로 읽기).
 */
export function bindLangLinks(root: ParentNode): void {
  const { rest } = splitLang(location.pathname);
  root.querySelectorAll<HTMLAnchorElement>('a[data-lang]').forEach(a => {
    const code = a.dataset.lang;
    if (!isLang(code)) return;
    a.href = localize(code, rest) + location.hash;
    a.hreflang = code;
    if (code === CURRENT_LANG) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
    a.onclick = () => saveLang(code);
  });
}

/**
 * 템플릿·본문 안의 사이트 내부 링크(`/why`, `/#learn` …)를 현재 언어 주소로 바꾼다.
 * 언어 버튼, 공개 맵 뷰어(/p/), 이미 언어가 붙은 주소는 건드리지 않는다.
 */
export function localizeLinks(root: ParentNode, lang: Lang = CURRENT_LANG): void {
  if (lang === 'ko') return;
  root.querySelectorAll<HTMLAnchorElement>('a[href^="/"]').forEach(a => {
    if (a.dataset.lang !== undefined) return;
    const raw = a.getAttribute('href') ?? '';
    if (raw.startsWith('//') || raw.startsWith('/p/') || raw.startsWith('/site-assets/')) return;
    const hashAt = raw.indexOf('#');
    const path = hashAt >= 0 ? raw.slice(0, hashAt) : raw;
    if (splitLang(path || '/').lang !== 'ko') return;
    a.setAttribute('href', localize(lang, path || '/') + (hashAt >= 0 ? raw.slice(hashAt) : ''));
  });
}

/**
 * 앱 로그인 주소 — 고른 언어를 함께 넘긴다.
 * 앱(2026-10-28 운영 반영)은 `?lang=` 을 읽어 그 언어로 열고 emm.lang·계정 언어에 저장한 뒤 주소에서 지운다.
 * 한국어 페이지는 사용자가 언어 버튼으로 한국어를 **직접 골랐을 때만** `lang=ko` 를 붙인다 —
 * 기본 주소로 그냥 들어온 사람의 앱·계정 언어를 임의로 바꾸지 않기 위해서다.
 */
export function appLoginUrl(base: string): string {
  if (CURRENT_LANG === 'ko') {
    if (savedLang() !== 'ko') return base;
    const k = new URL(base); k.searchParams.set('lang', 'ko'); return k.toString();
  }
  const u = new URL(base);
  u.searchParams.set('lang', CURRENT_LANG);
  return u.toString();
}
