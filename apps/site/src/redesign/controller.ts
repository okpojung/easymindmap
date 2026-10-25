import { BRAND_FAVICON_URL, BRAND_LOGO_URL } from './brand';
import { GUIDES, PATHS } from './content';
import { PRESETS } from './demo';
import { APP_LOGIN_URL } from '../config';
import { mountOutlineDemo } from './outline-demo.js';

/** Trusted build-time markup only. User input is rendered exclusively via textContent. */
export function mountHomepage(root: HTMLElement, _appUrl: string): () => void {
 const q = <T extends Element = HTMLElement>(selector: string): T => { const found = root.querySelector<T>(selector); if (!found) throw new Error('Missing homepage element: ' + selector); return found; };
 const all = <T extends Element = HTMLElement>(selector: string) => Array.from(root.querySelectorAll<T>(selector));
 const menu = q<HTMLButtonElement>('.menu'); const nav = q('#nav');
 let demoPath = location.pathname;
 let frame = 0; let disposed = false;
 document.documentElement.classList.add('emm-home-page');
 function bindAppLinks() { all<HTMLAnchorElement>('[data-open-app]').forEach(a => { a.href = APP_LOGIN_URL; }); }
 bindAppLinks();
 all<HTMLImageElement>('[data-brand-icon]').forEach(image => { image.src = BRAND_FAVICON_URL; });
 all<HTMLImageElement>('[data-brand-logo]').forEach(image => { image.src = BRAND_LOGO_URL; });
 const demo = mountOutlineDemo(q('#experience'), PRESETS);
 function closeMenu() { all<HTMLDetailsElement>('.emm-dropdown').forEach(d => d.open = false); menu.setAttribute('aria-expanded', 'false'); menu.setAttribute('aria-label', '메뉴 열기'); nav.classList.remove('open'); }
 function route(focus: boolean) {
  if (disposed) return;
  if (location.hash.startsWith('#/')) { const [legacy, anchor] = location.hash.slice(2).split('#'); history.replaceState(null, '', (PATHS[legacy] ?? '/') + (anchor ? '#' + anchor : '')); }
  const key = Object.keys(PATHS).find(name => PATHS[name] === location.pathname); const content = key ? GUIDES[key] : undefined;
  q('#home').hidden = Boolean(content); q('#detail').hidden = !content; closeMenu();
  if (demoPath !== location.pathname) { demo.reset(true); demoPath = location.pathname; }
  let title = 'EasyMindMap | AI가 답하는 시대, 질문이 나의 힘.';
  let description = '질문을 펼치고 연결하며 다음 질문을 찾아가는 작업 공간. Markdown과 마인드맵을 EasyMindMap에서 만나 보세요.';
  if (content) {
   q('#detail-category').textContent = content.category; q('#detail-eyebrow').textContent = content.eyebrow; q('#detail-title').textContent = content.title; q('#detail-description').textContent = content.description;
   // Only checked-in curated copy is HTML; account/API/AI/user data must never enter this sink.
   q('#detail-body').innerHTML = content.body + '<div class="detail-next"><a class="btn light" href="/">첫 화면으로</a></div>';
   bindAppLinks();
   all<HTMLAnchorElement>('[data-route]').forEach(a => { if (a.dataset.route === key) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
   title = content.title + ' | EasyMindMap'; description = content.description; window.scrollTo({ top: 0, behavior: 'instant' }); if (focus) q('#detail-title').focus({ preventScroll: true });
  } else if (location.hash) {
   cancelAnimationFrame(frame); frame = requestAnimationFrame(() => { if (disposed) return; let id: string; try { id = decodeURIComponent(location.hash.slice(1)); } catch { return; }
    const target = Array.from(root.querySelectorAll<HTMLElement>('[id]')).find(e => e.id === id); if (!target) return; target.scrollIntoView({ behavior: 'instant' });
    if (focus) { const heading = target.querySelector<HTMLElement>('h2'); if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); } }
   });
  } else if (focus) window.scrollTo({ top: 0, behavior: 'instant' });
  document.title = title; document.querySelector('meta[name="description"]')?.setAttribute('content', description); document.querySelector('meta[property="og:title"]')?.setAttribute('content', title); document.querySelector('meta[property="og:description"]')?.setAttribute('content', description);
 }
 function navigate(to: string) { history.pushState(null, '', to); window.dispatchEvent(new PopStateEvent('popstate')); }
 function onClick(event: MouseEvent) {
  if (!(event.target instanceof Element)) return;
  if (event.target.closest('.menu')) { const open = menu.getAttribute('aria-expanded') !== 'true'; menu.setAttribute('aria-expanded', String(open)); menu.setAttribute('aria-label', open ? '메뉴 닫기' : '메뉴 열기'); nav.classList.toggle('open', open); return; }
  const example = event.target.closest<HTMLButtonElement>('[data-try]'); if (example) { navigate('/#experience'); demo.choosePreset(example.dataset.try ?? 'questions'); return; }
  const anchor = event.target.closest<HTMLAnchorElement>('a[href]'); if (!anchor || anchor.target || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
  const url = new URL(anchor.href, location.href);
  if (url.origin === location.origin && url.pathname === location.pathname && url.hash === '#main') {
   event.preventDefault(); const target = q('#main'); target.tabIndex = -1; target.scrollIntoView({ behavior: 'instant' }); target.focus({ preventScroll: true }); return;
  }
  if (url.origin === location.origin && (url.pathname === '/' || Object.values(PATHS).includes(url.pathname))) { event.preventDefault(); navigate(url.pathname + url.search + url.hash); }
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
