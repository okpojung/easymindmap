import { useEffect, useState } from 'react';
import Home from './pages/Home';
import Maps from './pages/Maps';
import { APP_URL } from './config';

/**
 * 길잡이 — **라우터 라이브러리를 쓰지 않는다** (2026-09-13).
 *
 * 길이 둘뿐이고(`/`·`/maps`), `/p/{id}` 는 nginx 가 앱으로 넘기므로 이
 * 번들에 오지 않는다. 셋 이상으로 늘거나 중첩이 생기면 그때 넣는다 —
 * 지금 넣으면 홈페이지 첫 화면에 쓰지도 않을 코드가 실린다.
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
}

function Link({ to, children }: { to: string; children: React.ReactNode }) {
  const here = window.location.pathname === to;
  return (
    <a
      href={to}
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

export default function App() {
  const path = usePath();
  const page = path === '/maps' ? <Maps /> : <Home />;
  return (
    <>
      <header className="top">
        <div className="wrap">
          <Link to="/"><span className="brand">Easy<span>MindMap</span></span></Link>
          <nav className="nav">
            <Link to="/">홈</Link>
            <Link to="/maps">퍼블리싱맵</Link>
          </nav>
          <span className="spacer" />
          <a className="btn" href={APP_URL}>시작하기</a>
        </div>
      </header>
      <main>{page}</main>
      <footer className="foot">
        <div className="wrap">
          <span>© EasyMindMap</span>
          <span className="spacer" />
          <a href={APP_URL}>앱 열기</a>
        </div>
      </footer>
    </>
  );
}
