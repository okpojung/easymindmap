import React from 'react';
import ReactDOM from 'react-dom/client';
import { EditorPage } from '@/pages/EditorPage';
import { AdminPage } from '@/pages/admin/AdminPage';
import '@/styles/global.css';

// 화면 고르기 — 라우터를 들이지 않고 경로 하나만 본다 (2026-08-13).
//
// 이 앱에는 라우터가 없다(에디터 하나뿐이었다). 관리자 콘솔 하나 때문에
// 라우터를 넣으면 에디터의 `?map=` 처리와 규칙이 둘로 갈린다.
// nginx 가 이미 SPA 폴백(try_files … /index.html)을 하므로 `/admin` 은
// 서버 설정 변경 없이 이 파일까지 온다.
//
// **운영 전환 때 admin.easymindmap.org 로 분리한다**(사용자 결정) —
// 그때 이 분기와 pages/admin/ 만 새 엔트리로 옮기면 된다.
const isAdmin = window.location.pathname.replace(/\/+$/, '') === '/admin';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {isAdmin ? <AdminPage /> : <EditorPage />}
  </React.StrictMode>,
);
