import { GUIDES, PATHS } from './content';
import { PRESETS, parseMemo, fitLabel } from './demo';

/** Trusted build-time markup only. User input is rendered exclusively via textContent. */
export function mountHomepage(root: HTMLElement, appUrl: string): () => void {
 const q = <T extends Element = HTMLElement>(selector: string): T => { const found = root.querySelector<T>(selector); if (!found) throw new Error('Missing homepage element: ' + selector); return found; };
 const all = <T extends Element = HTMLElement>(selector: string) => Array.from(root.querySelectorAll<T>(selector));
 const memo = q<HTMLTextAreaElement>('#memo'); const status = q('#demo-status'); const menu = q<HTMLButtonElement>('.menu'); const nav = q('#nav');
 let frame = 0; let disposed = false;
 document.documentElement.classList.add('emm-home-page');
 all<HTMLAnchorElement>('[data-open-app]').forEach(a => { a.href = appUrl; });
 const ns = 'http://www.w3.org/2000/svg';
 function node(tag: string, attrs: Record<string, string | number> = {}, text?: string): SVGElement {
  const element = document.createElementNS(ns, tag); Object.entries(attrs).forEach(([key, value]) => element.setAttribute(key, String(value)));
  if (text !== undefined) element.textContent = text; return element;
 }
 function render() {
  const host = q('#result-graph'); host.replaceChildren();
  if (!memo.value.trim()) { const p = document.createElement('p'); p.className = 'demo-empty'; p.textContent = '제목과 목록을 입력하면 여기에 연결됩니다.'; host.append(p); status.textContent = '메모를 입력한 뒤 지도로 보기를 눌러 주세요.'; return; }
  const data = parseMemo(memo.value);
  const svg = node('svg', { viewBox: '0 0 670 310', role: 'img', 'aria-label': data.root + ' 생각 지도' });
  svg.append(node('desc', {}, [data.root, ...data.groups.flatMap(g => [g.title, ...g.items.slice(0, 2)])].join(' / ')));
  const positions = data.groups.length === 1 ? [155] : data.groups.length === 2 ? [95, 225] : [60, 155, 250];
  const palette = [['#f0f5e5', '#bdcd9c', '#59703e'], ['#fcf0e3', '#dfc7a3', '#926c3b'], ['#eaf2ed', '#b4cbb9', '#4d6d59']];
  function label(x: number, y: number, w: number, h: number, text: string, fill: string, stroke: string, color: string, size: number) {
   const group = node('g'); group.append(node('title', {}, text), node('rect', { x, y, width: w, height: h, rx: 8, fill, stroke }));
   group.append(node('text', { x: x + w / 2, y: y + h / 2 + 4.5, 'text-anchor': 'middle', fill: color, 'font-size': size, 'font-weight': 500 }, fitLabel(text, w - 18, size))); svg.append(group);
  }
  data.groups.forEach((group, index) => { const y = positions[index]; const color = palette[index];
   svg.append(node('path', { d: 'M 193 155 C 236 155, 215 ' + y + ', 267 ' + y, fill: 'none', stroke: color[1], 'stroke-width': 2 }));
   label(265, y - 20, 138, 40, group.title, color[0], color[1], color[2], 13);
   group.items.slice(0, 2).forEach((item, itemIndex) => { const yy = y + (group.items.length === 1 ? 0 : itemIndex === 0 ? -19 : 19);
    svg.append(node('path', { d: 'M 403 ' + y + ' C 436 ' + y + ', 418 ' + yy + ', 453 ' + yy, fill: 'none', stroke: color[1], 'stroke-width': 1.5 }));
    label(452, yy - 13, 186, 28, item, '#fff', color[1], '#52614b', 12);
   });
  });
  label(25, 129, 169, 52, data.root, '#2d5842', '#2d5842', '#fff', 15); host.append(svg);
  status.textContent = data.skipped ? '지도로 연결했습니다. 간단 체험은 큰 가지 3개, 각 작은 가지 2개까지만 표시합니다. 원문은 왼쪽에 그대로 남아 있습니다.' : '지도로 연결했습니다. 왼쪽 메모를 고치고 다시 눌러 보세요.';
 }
 function choosePreset(key: string) { if (!PRESETS[key]) return; memo.value = PRESETS[key]; all<HTMLButtonElement>('[data-preset]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.preset === key))); render(); }
 function closeMenu() { menu.setAttribute('aria-expanded', 'false'); menu.setAttribute('aria-label', '메뉴 열기'); nav.classList.remove('open'); }
 function route(focus: boolean) {
  if (disposed) return;
  if (location.hash.startsWith('#/')) { const [legacy, anchor] = location.hash.slice(2).split('#'); history.replaceState(null, '', (PATHS[legacy] ?? '/') + (anchor ? '#' + anchor : '')); }
  const key = Object.keys(PATHS).find(name => PATHS[name] === location.pathname); const content = key ? GUIDES[key] : undefined;
  q('#home').hidden = Boolean(content); q('#detail').hidden = !content; closeMenu();
  let title = 'EasyMindMap | AI가 답하는 시대, 질문이 나의 힘.';
  let description = '질문을 펼치고 연결하며 다음 질문을 찾아가는 작업 공간. Markdown과 마인드맵을 EasyMindMap에서 만나 보세요.';
  if (content) {
   q('#detail-category').textContent = content.category; q('#detail-eyebrow').textContent = content.eyebrow; q('#detail-title').textContent = content.title; q('#detail-description').textContent = content.description;
   // Only checked-in curated copy is HTML; account/API/AI/user data must never enter this sink.
   q('#detail-body').innerHTML = content.body + '<div class="detail-next"><a class="btn" href="/#experience">직접 체험하기 ↗</a><a class="btn light" href="/">첫 화면으로</a></div>';
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
  const preset = event.target.closest<HTMLButtonElement>('[data-preset]'); if (preset) { choosePreset(preset.dataset.preset ?? ''); return; }
  if (event.target.closest('#convert')) { all('[data-preset]').forEach(b => b.setAttribute('aria-pressed', 'false')); render(); return; }
  if (event.target.closest('.menu')) { const open = menu.getAttribute('aria-expanded') !== 'true'; menu.setAttribute('aria-expanded', String(open)); menu.setAttribute('aria-label', open ? '메뉴 닫기' : '메뉴 열기'); nav.classList.toggle('open', open); return; }
  const example = event.target.closest<HTMLButtonElement>('[data-try]'); if (example) { choosePreset(example.dataset.try ?? ''); navigate('/#experience'); return; }
  const anchor = event.target.closest<HTMLAnchorElement>('a[href]'); if (!anchor || anchor.target || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
  const url = new URL(anchor.href, location.href); if (url.origin === location.origin && (url.pathname === '/' || Object.values(PATHS).includes(url.pathname))) { event.preventDefault(); navigate(url.pathname + url.search + url.hash); }
 }
 function onInput(event: Event) { if (event.target === memo) { all('[data-preset]').forEach(b => b.setAttribute('aria-pressed', 'false')); status.textContent = '메모가 바뀌었습니다. 지도로 보기를 눌러 새 내용을 연결하세요.'; } }
 function onToggle(event: Event) { const current = event.target; if (current instanceof HTMLDetailsElement && current.classList.contains('question') && current.open) all<HTMLDetailsElement>('.question').forEach(other => { if (other !== current) other.open = false; }); }
 const onRoute = () => route(true);
 root.addEventListener('click', onClick); root.addEventListener('input', onInput); root.addEventListener('toggle', onToggle, true); window.addEventListener('popstate', onRoute); window.addEventListener('hashchange', onRoute);
 render(); route(false);
 return () => { disposed = true; cancelAnimationFrame(frame); root.removeEventListener('click', onClick); root.removeEventListener('input', onInput); root.removeEventListener('toggle', onToggle, true); window.removeEventListener('popstate', onRoute); window.removeEventListener('hashchange', onRoute); document.documentElement.classList.remove('emm-home-page'); };
}
