/**
 * 검색엔진용 언어 표시 (다국어 4단계, 2026-10-29).
 *
 * 같은 내용의 언어별 주소를 `<link rel="alternate" hreflang>` 로 알리고,
 * 지금 주소를 `canonical` 로 둔다. 기본(x-default)은 한국어 주소다.
 * 주소가 바뀔 때(같은 페이지 안 이동)마다 다시 단다.
 */
import { LANGS, localize, splitLang, CURRENT_LANG, type Lang } from './i18n';

const ORIGIN = 'https://www.easymindmap.org';
const HREFLANG: Record<Lang, string> = { ko: 'ko', en: 'en', ja: 'ja', zh: 'zh-Hans' };
const OG_LOCALE: Record<Lang, string> = { ko: 'ko_KR', en: 'en_US', ja: 'ja_JP', zh: 'zh_CN' };

function setLink(rel: string, href: string, hreflang?: string) {
  const sel = hreflang ? `link[rel="${rel}"][hreflang="${hreflang}"]` : `link[rel="${rel}"]:not([hreflang])`;
  let el = document.head.querySelector<HTMLLinkElement>(sel);
  if (!el) { el = document.createElement('link'); el.rel = rel; if (hreflang) el.hreflang = hreflang; document.head.append(el); }
  el.href = href;
}

function setMeta(property: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[property="${property}"]`);
  if (!el) { el = document.createElement('meta'); el.setAttribute('property', property); document.head.append(el); }
  el.content = content;
}

export function updateAlternates(): void {
  const { rest } = splitLang(location.pathname);
  if (rest.startsWith('/p/')) return;
  for (const lang of LANGS) setLink('alternate', ORIGIN + localize(lang, rest), HREFLANG[lang]);
  setLink('alternate', ORIGIN + localize('ko', rest), 'x-default');
  setLink('canonical', ORIGIN + location.pathname);
  setMeta('og:locale', OG_LOCALE[CURRENT_LANG]);
  setMeta('og:url', ORIGIN + location.pathname);
}

export function installAlternates(): void {
  updateAlternates();
  window.addEventListener('popstate', updateAlternates);
}
