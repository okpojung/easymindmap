import { lazy, Suspense, useEffect, useRef, useState, type ComponentType } from 'react';
import Home from './pages/Home';
import FunctionPage from './pages/Function';
import Ai from './pages/Ai';
import Mmd from './pages/Mmd';
import Library from './pages/Library';
// 게시판은 Markdown 렌더러를 함께 싣기 때문에 첫 화면 번들과 나눠 필요할 때만 받는다
const Board = lazy(() => import('./pages/Board'));
import Contact from './pages/Contact';
import './community.css';

import { installBrandIdentity } from './redesign/brand';
import { GITHUB_URL, MMD_GITHUB_URL } from './config';
import { SITE_HEADER_MARKUP, mountSiteHeader } from './redesign/site-header';
import './redesign/redesign.css';

/** Product/spec/library routes use the exact homepage header (no separate legacy copy). */
function SiteHeader({ path }: { path: string }) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => (root.current ? mountSiteHeader(root.current, path) : undefined), [path]);
  return <div ref={root} className="emm-home emm-site-header" dangerouslySetInnerHTML={{ __html: SITE_HEADER_MARKUP }} />;
}

/**
 * 길잡이 — **라우터 라이브러리를 쓰지 않는다** (2026-09-13).
 *
 * 길이 몇 개뿐이고(`/`·`/function`·`/ai`·`/mmd`(옛 `/emm` 도 같은 곳)·`/library`), `/p/{id}` 는
 * nginx 가 앱으로 넘기므로 이 번들에 오지 않는다. 중첩 경로나
 * 파라미터가 생기면 그때
 * 넣는다 — 지금 넣으면 첫 화면에 쓰지도 않을 코드가 실린다.
 */
function usePath(): string {
  const [path, setPath] = useState(() => window.location.pathname);
  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  return path;
}

/** 같은 사이트 안의 이동 — 새로고침 없이 */
export function go(to: string) {
  window.history.pushState({}, '', to);
  window.dispatchEvent(new PopStateEvent('popstate'));
  window.scrollTo(0, 0);
}

export function Link(
  { to, className, children }: { to: string; className?: string; children: React.ReactNode },
) {
  const here = window.location.pathname === to;
  return (
    <a
      href={to}
      className={className}
      aria-current={here ? 'page' : undefined}
      onClick={(e) => {
        // 새 탭·가운데 클릭은 브라우저에 맡긴다 — 가로채면 사용자가
        // 늘 쓰던 조작이 깨진다
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        go(to);
      }}
    >{children}</a>
  );
}

const PAGES: Record<string, ComponentType> = {
  '/function': FunctionPage,
  '/ai': Ai,
  '/mmd': Mmd,
  '/emm': Mmd, // 옛 주소 — 2026-09-17 용어 통일(mmd) 전 링크 호환
  '/library': Library,
  '/board': Board,
  '/contact': Contact,
};

export default function App() {
  useEffect(() => { installBrandIdentity(); }, []);
  const path = usePath();
  const Page = PAGES[path];
  // The approved homepage/learning routes own their scoped navigation and footer.
  // Existing product/library routes and nginx viewer proxies are unchanged.
  if (!Page) return <Home />;
  return (
    <>
      <SiteHeader path={path} />
      <main><Suspense fallback={<p className="wrap" style={{ padding: '48px 20px' }}>불러오는 중…</p>}><Page /></Suspense></main>
      <footer className="foot">
        <div className="wrap">
          <span>© EasyMindMap</span>
          <span className="spacer" />
          <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">GitHub · EasyMindMap 오픈소스 코어 ↗</a>
          <a href={MMD_GITHUB_URL} target="_blank" rel="noopener noreferrer">Mindmap Markdown 표준 ↗</a>
          <Link to="/contact" className="foot-contact">✉ 문의하기</Link>

        </div>
      </footer>
    </>
  );
}
