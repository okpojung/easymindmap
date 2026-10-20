import { useEffect, useState } from 'react';
import Home from './pages/Home';
import FunctionPage from './pages/Function';
import Ai from './pages/Ai';
import Mmd from './pages/Mmd';
import Library from './pages/Library';

import { BRAND_LOGO_URL, installBrandIdentity } from './redesign/brand';

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

const PAGES: Record<string, () => JSX.Element> = {
  '/function': FunctionPage,
  '/ai': Ai,
  '/mmd': Mmd,
  '/emm': Mmd, // 옛 주소 — 2026-09-17 용어 통일(mmd) 전 링크 호환
  '/library': Library,
};

export default function App() {
  useEffect(() => { installBrandIdentity();
    const close = (event: Event) => { if (event instanceof KeyboardEvent && event.key !== 'Escape') return; document.querySelectorAll<HTMLDetailsElement>('.legacy-dropdown[open]').forEach(d => { if (event instanceof KeyboardEvent || !(event.target instanceof Element) || !d.contains(event.target)) { if (event instanceof KeyboardEvent) d.querySelector('summary')?.focus(); d.open = false; } }); };
    document.addEventListener('click', close); document.addEventListener('keydown', close);
    return () => { document.removeEventListener('click', close); document.removeEventListener('keydown', close); };
  }, []);
  const path = usePath();
  const Page = PAGES[path];
  // The approved homepage/learning routes own their scoped navigation and footer.
  // Existing product/library routes and nginx viewer proxies are unchanged.
  if (!Page) return <Home />;
  return (
    <>
      <header className="top">
        <div className="wrap">
          <Link to="/"><span className="brand"><img src={BRAND_LOGO_URL} alt="" width={56} height={50} style={{ verticalAlign: 'middle', marginRight: 8, objectFit: 'contain' }} />Easy<span>MindMap</span></span></Link>
          <nav className="nav legacy-site-nav" aria-label="주 메뉴"><a href="/learn/questions">질문하는 힘</a><a href="/#learn">처음이라면</a><details className="legacy-dropdown"><summary>EMM</summary><div><a href="/why">특장점</a><Link to="/function">주요기능</Link><Link to="/ai">AI연동</Link></div></details><Link to="/mmd">MMD Spec</Link><Link to="/library">지식창고</Link><a href="/about/brand">브랜드 스토리</a></nav>
          <span className="spacer" />
          <a className="btn" href="https://web.easymindmap.org/try">시작하기</a>
        </div>
      </header>
      <main><Page /></main>
      <footer className="foot">
        <div className="wrap">
          <span>© EasyMindMap</span>
          <span className="spacer" />

        </div>
      </footer>
    </>
  );
}
