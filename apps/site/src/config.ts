/**
 * 홈페이지가 바깥을 부르는 곳 — **둘뿐이다** (2026-09-13).
 *
 *   API      진열대 목록을 읽는다 (비인증)
 *   APP      [시작하기]·맵 열기가 가는 곳
 *
 * ★ 빌드 시점에 박힌다(`VITE_*`). 운영·개발이 같은 코드로 다른 주소를
 *   보게 하려면 이 길뿐이다 — 정적 파일에는 런타임 설정이 없다.
 */
const trim = (s: string | undefined, fallback: string) =>
  (s && s.trim() ? s.trim() : fallback).replace(/\/+$/, '');

/** API 주소 (`https://api-dev.mindmap.ai.kr`) */
export const API_URL = trim(import.meta.env.VITE_API_URL, 'https://api-dev.mindmap.ai.kr');

/**
 * 앱 주소 — 로그인·에디터가 있는 곳.
 *
 * 퍼블리싱된 맵(`/p/{id}`)은 **같은 도메인**으로 연다(B안) — nginx 가
 * 그 경로만 앱으로 넘긴다. 그래서 여기 주소는 맵 링크에 쓰지 않는다.
 */
/**
 * 홈페이지의 유일한 앱 진입점(헤더 고정 'EMM 로그인' 버튼, 2026-10-26).
 * 앱 첫 화면이 로그인 화면이고 그 안에 'Guest로 체험하기'가 있으므로, 회원·손님 모두 이 버튼 하나로 들어간다.
 * 이미 로그인한 회원은 앱이 바로 문서함을 연다.
 */
export const APP_LOGIN_URL = 'https://web.easymindmap.org/';
export const GITHUB_URL = 'https://github.com/okpojung/easymindmap';
/** Mindmap Markdown 표준(사양·참조 구현) GitHub 조직 */
export const MMD_GITHUB_URL = 'https://github.com/mindmapmarkdown';

export const APP_URL = trim(import.meta.env.VITE_APP_URL, 'https://web.easymindmap.org');
