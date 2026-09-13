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
export const APP_URL = trim(import.meta.env.VITE_APP_URL, 'https://pro-dev.mindmap.ai.kr');
