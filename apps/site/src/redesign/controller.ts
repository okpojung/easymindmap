import { BRAND_FAVICON_URL, BRAND_LOGO_URL } from './brand';
import { GUIDES, PATHS } from './content';
import { PRESETS } from './demo';
import { APP_LOGIN_URL } from '../config';
import { mountOutlineDemo, setDemoText } from './outline-demo.js';
import { CURRENT_LANG, splitLang, href, localizeLinks, bindLangLinks, appLoginUrl } from '../i18n';
import { siteText, DEMO_TEXT_BY_LANG, PRESETS_BY_LANG, GUIDES_BY_LANG } from '../site-text';

/** Trusted build-time markup only. User input is rendered exclusively via textContent. */
export function mountHomepage(root: HTMLElement, _appUrl: string): () => void {
 const q = <T extends Element = HTMLElement>(selector: string): T => { const found = root.querySelector<T>(selector); if (!found) throw new Error('Missing homepage element: ' + selector); return found; };
 const all = <T extends Element = HTMLElement>(selector: string) => Array.from(root.querySelectorAll<T>(selector));
 const menu = q<HTMLButtonElement>('.menu'); const nav = q('#nav');
 let demoPath = location.pathname;
 let frame = 0; let disposed = false;
 document.documentElement.classList.add('emm-home-page');
 function bindAppLinks() { all<HTMLAnchorElement>('[data-open-app]').forEach(a => { a.href = appLoginUrl(APP_LOGIN_URL); }); }
 const T = siteText();
 localizeLinks(root); bindLangLinks(root);
 bindAppLinks();
 all<HTMLImageElement>('[data-brand-icon]').forEach(image => { image.src = BRAND_FAVICON_URL; });
 all<HTMLImageElement>('[data-brand-logo]').forEach(image => { image.src = BRAND_LOGO_URL; });
 setDemoText(DEMO_TEXT_BY_LANG[CURRENT_LANG]);
 const demo = mountOutlineDemo(q('#experience'), PRESETS_BY_LANG[CURRENT_LANG] ?? PRESETS);
 function closeMenu() { all<HTMLDetailsElement>('.emm-dropdown').forEach(d => d.open = false); menu.setAttribute('aria-expanded', 'false'); menu.setAttribute('aria-label', T.menuOpen); nav.classList.remove('open'); }
 function route(focus: boolean) {
  if (disposed) return;
  if (location.hash.startsWith('#/')) { const [legacy, anchor] = location.hash.slice(2).split('#'); history.replaceState(null, '', href((PATHS[legacy] ?? '/') + (anchor ? '#' + anchor : ''))); }
  const rest = splitLang(location.pathname).rest;
  const key = Object.keys(PATHS).find(name => PATHS[name] === rest); const content = key ? (GUIDES_BY_LANG[CURRENT_LANG]?.[key] ?? GUIDES[key]) : undefined;
  q('#home').hidden = Boolean(content); q('#detail').hidden = !content; closeMenu();
  if (demoPath !== location.pathname) { demo.reset(true); demoPath = location.pathname; }
  let title = T.homeTitle;
  let description = T.homeDescription;
  if (content) {
   q('#detail-category').textContent = content.category; q('#detail-eyebrow').textContent = content.eyebrow; q('#detail-title').textContent = content.title; q('#detail-description').textContent = content.description;
   // Only checked-in curated copy is HTML; account/API/AI/user data must never enter this sink.
   q('#detail-body').innerHTML = content.body + '<div class="detail-next"><a class="btn light" href="/"></a></div>';
   q('#detail-body .detail-next a').textContent = T.backHome; localizeLinks(q('#detail-body'));
   bindAppLinks();
   all<HTMLAnchorElement>('[data-route]').forEach(a => { if (a.dataset.route === key) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
   title = content.title + T.titleSuffix; description = content.description; window.scrollTo({ top: 0, behavior: 'instant' }); if (focus) q('#detail-title').focus({ preventScroll: true });
  } else if (location.hash) {
   cancelAnimationFrame(frame); frame = requestAnimationFrame(() => { if (disposed) return; let id: string; try { id = decodeURIComponent(location.hash.slice(1)); } catch { return; }
    const target = Array.from(root.querySelectorAll<HTMLElement>('[id]')).find(e => e.id === id); if (!target) return; target.scrollIntoView({ behavior: 'instant' });
    if (focus) { const heading = target.querySelector<HTMLElement>('h2'); if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); } }
   });
  } else if (focus) window.scrollTo({ top: 0, behavior: 'instant' });
  bindLangLinks(root); document.title = title; document.querySelector('meta[name="description"]')?.setAttribute('content', description); document.querySelector('meta[property="og:title"]')?.setAttribute('content', title); document.querySelector('meta[property="og:description"]')?.setAttribute('content', description);
 }
 function navigate(to: string) { history.pushState(null, '', to); window.dispatchEvent(new PopStateEvent('popstate')); }
 function onClick(event: MouseEvent) {
  if (!(event.target instanceof Element)) return;
  if (event.target.closest('.menu')) { const open = menu.getAttribute('aria-expanded') !== 'true'; menu.setAttribute('aria-expanded', String(open)); menu.setAttribute('aria-label', open ? T.menuClose : T.menuOpen); nav.classList.toggle('open', open); return; }
  const example = event.target.closest<HTMLButtonElement>('[data-try]'); if (example) { navigate(href('/#experience')); demo.choosePreset(example.dataset.try ?? 'questions'); return; }
  const anchor = event.target.closest<HTMLAnchorElement>('a[href]'); if (!anchor || anchor.target || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
  const url = new URL(anchor.href, location.href);
  if (url.origin === location.origin && url.pathname === location.pathname && url.hash === '#main') {
   event.preventDefault(); const target = q('#main'); target.tabIndex = -1; target.scrollIntoView({ behavior: 'instant' }); target.focus({ preventScroll: true }); return;
  }
  if (anchor.dataset.lang !== undefined) return;
  const target = splitLang(url.pathname);
  if (url.origin === location.origin && target.lang === CURRENT_LANG && (target.rest === '/' || Object.values(PATHS).includes(target.rest))) { event.preventDefault(); navigate(url.pathname + url.search + url.hash); }
 }
 function onToggle(event: Event) { const current = event.target; if (current instanceof HTMLDetailsElement && current.classList.contains('question') && current.open) all<HTMLDetailsElement>('.question').forEach(other => { if (other !== current) other.open = false; }); }
 const onOutside = (event: Event) => { if (event.target instanceof Element && !event.target.closest('.emm-dropdown')) all<HTMLDetailsElement>('.emm-dropdown').forEach(d => d.open = false); };
 const onEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') { const active = all<HTMLDetailsElement>('.emm-dropdown').find(d => d.open); active?.querySelector('summary')?.focus(); closeMenu(); } };
 document.addEventListener('click', onOutside); document.addEventListener('keydown', onEscape);
 const onRoute = () => route(true);
 root.addEventListener('click', onClick); root.addEventListener('toggle', onToggle, true); window.addEventListener('popstate', onRoute); window.addEventListener('hashchange', onRoute);
 route(false);
 return () => { document.removeEventListener("click", onOutside); document.removeEventListener("keydown", onEscape); disposed = true; demo.destroy(); cancelAnimationFrame(frame); root.removeEventListener('click', onClick); root.removeEventListener('toggle', onToggle, true); window.removeEventListener('popstate', onRoute); window.removeEventListener('hashchange', onRoute); document.documentElement.classList.remove('emm-home-page'); };
}
