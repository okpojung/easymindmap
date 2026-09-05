import React from 'react';
import ReactDOM from 'react-dom/client';
import { EditorPage } from '@/pages/EditorPage';
import { AdminPage } from '@/pages/admin/AdminPage';
import { PublicMapPage, publishIdFromPath } from '@/pages/PublicMapPage';
import '@/styles/global.css';

// 화면 고르기 — 라우터를 들이지 않고 **주소만** 본다 (2026-08-13 · 08-14).
//
// 이 앱에는 라우터가 없다(에디터 하나뿐이었다). 관리자 콘솔 하나 때문에
// 라우터를 넣으면 에디터의 `?map=` 처리와 규칙이 둘로 갈린다.
// nginx 가 이미 SPA 폴백(try_files … /index.html)을 하므로 `/admin` 도,
// 관리자 도메인의 어떤 경로도 서버 설정 변경 없이 이 파일까지 온다.
//
// **개발과 운영이 서로 다른 주소를 쓴다**(2026-08-14 사용자 결정).
//
//   개발  dev.mindmap.ai.kr/admin       ← 경로로 들어간다 (지금 그대로)
//   운영  admin.easymindmap.org         ← **도메인 전체**가 관리자다
//
// 운영 쪽을 도메인으로 가르는 이유는 **프록시에서 IP 제한을 걸 수 있어서**다
// (같은 호스트에 얹혀 있으면 경로만으로 막기 어렵다 — admin-console.md §1).
// 그래서 관리자 도메인에서는 **경로와 무관하게** 콘솔만 뜬다. 에디터로
// 새어 나갈 길을 두지 않는다.
const host = window.location.hostname;
const isAdminHost = host === 'admin' || host.startsWith('admin.');
const isAdminPath = window.location.pathname.replace(/\/+$/, '') === '/admin';
const isAdmin = isAdminHost || isAdminPath;

// 퍼블리싱 링크 `/p/{publishId}` — **로그인 없이** 열리는 읽기 전용 화면
// (docs/04-extensions/publish/27-publish-share.md §4.2). 에디터보다
// **먼저** 갈라야 한다: 에디터는 뜨는 순간 로그인 화면·문서함을 띄우는데,
// 링크를 받은 사람은 계정이 없다.
const publishId = publishIdFromPath(window.location.pathname);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {publishId
      ? <PublicMapPage publishId={publishId} />
      : isAdmin ? <AdminPage /> : <EditorPage />}
  </React.StrictMode>,
);
