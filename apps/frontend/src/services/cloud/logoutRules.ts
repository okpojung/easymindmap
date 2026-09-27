/**
 * 로그아웃이 GoTrue 에 보내는 경로 — **이 세션만** 끝낸다 (2026-09-27).
 *
 * ★ 왜 `scope=local` 인가 — GoTrue `/logout` 의 기본은 **`global`** 이고, 그것은
 *   `DELETE FROM sessions WHERE user_id = ?` 다(`internal/api/logout.go` →
 *   `models.Logout`). 그 사용자의 세션이 **전부** 지워진다 — 다른 브라우저만이
 *   아니라 **ChatGPT·claude.ai 가 OAuth 로 받아 둔 세션(refresh 토큰)까지**.
 *   그래서 앱에서 한 번 로그아웃하면 모든 AI 커넥터가 다음 갱신에서
 *   "Invalid Refresh Token: Refresh Token Not Found" 로 끊겼다
 *   (2026-09-27 실측 — mcp-connector.md §12.10).
 *
 *   `local` 은 액세스 토큰의 `session_id` 하나만 지운다. 이 브라우저는 로그아웃되고
 *   다른 기기·커넥터는 그대로다 — 사람이 "로그아웃" 에서 기대하는 뜻이다.
 *   "모든 기기에서 로그아웃" 이 필요해지면 그때 `global` 을 **따로 이름 붙여** 둔다.
 */
export const LOGOUT_SCOPE = 'local' as const;
export const LOGOUT_PATH = `/logout?scope=${LOGOUT_SCOPE}`;
