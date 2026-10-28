import { templateFor } from '../site-text';
import { CURRENT_LANG, localizeLinks, bindLangLinks, appLoginUrl } from '../i18n';
import { siteText } from '../site-text';
import { BRAND_LOGO_URL } from './brand';
import { APP_LOGIN_URL } from '../config';

/**
 * The one approved site header. It is cut from the homepage template at build time,
 * so product, spec and library routes can never drift back to an older header.
 */
export function extractSiteHeader(template: string): string {
 const start = template.indexOf('<header class="header">');
 const end = template.indexOf('</header>', start);
 if (start < 0 || end < 0) throw new Error('Missing homepage header in template');
 return template.slice(start, end + '</header>'.length);
}

export const SITE_HEADER_MARKUP = extractSiteHeader(templateFor(CURRENT_LANG));

/** Same behavior as the homepage header: menu toggle, EMM dropdown, Escape/outside close. */
export function mountSiteHeader(root: HTMLElement, pathname: string): () => void {
 const menu = root.querySelector<HTMLButtonElement>('.menu');
 const nav = root.querySelector<HTMLElement>('#nav');
 const dropdowns = () => Array.from(root.querySelectorAll<HTMLDetailsElement>('.emm-dropdown'));
 root.querySelectorAll<HTMLImageElement>('[data-brand-logo]').forEach(image => { image.src = BRAND_LOGO_URL; });
 root.querySelectorAll<HTMLAnchorElement>('[data-open-app]').forEach(a => { a.href = appLoginUrl(APP_LOGIN_URL); });
 localizeLinks(root); bindLangLinks(root);
 const T = siteText();
 root.querySelectorAll<HTMLAnchorElement>('#nav a[href]:not([data-lang])').forEach(a => {
  if (new URL(a.href, location.href).pathname === pathname) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
 });
 function closeMenu() {
  dropdowns().forEach(d => { d.open = false; });
  menu?.setAttribute('aria-expanded', 'false'); menu?.setAttribute('aria-label', T.menuOpen); nav?.classList.remove('open');
 }
 const onClick = (event: MouseEvent) => {
  if (!(event.target instanceof Element)) return;
  if (event.target.closest('.menu')) {
   const open = menu?.getAttribute('aria-expanded') !== 'true';
   menu?.setAttribute('aria-expanded', String(open)); menu?.setAttribute('aria-label', open ? T.menuClose : T.menuOpen); nav?.classList.toggle('open', open);
  }
 };
 const onOutside = (event: Event) => { if (event.target instanceof Element && !event.target.closest('.emm-dropdown')) dropdowns().forEach(d => { d.open = false; }); };
 const onEscape = (event: KeyboardEvent) => { if (event.key !== 'Escape') return; dropdowns().find(d => d.open)?.querySelector('summary')?.focus(); closeMenu(); };
 root.addEventListener('click', onClick);
 document.addEventListener('click', onOutside); document.addEventListener('keydown', onEscape);
 return () => { root.removeEventListener('click', onClick); document.removeEventListener('click', onOutside); document.removeEventListener('keydown', onEscape); };
}
