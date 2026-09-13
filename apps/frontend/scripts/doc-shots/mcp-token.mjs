// 가이드 12 — 🔌 AI 커넥터(MCP) 토큰 발급 직후 (mcp-token.png).
// 에디터 전체를 띄워 계정 메뉴 ▸ AI 커넥터(MCP) ▸ [발급] 을 실제로 누른다.
// vite: VITE_SUPABASE_URL=http://auth.local VITE_SUPABASE_AUTH_PREFIX= VITE_API_URL=https://api-dev.mindmap.ai.kr
//   node scripts/doc-shots/mcp-token.mjs <출력파일>
import { boot } from './lib.mjs';
const OUT = process.argv[2] ?? '/tmp/doc-shots/mcp-token.png';
const tokens = [{ id: 't1', name: 'Claude 웹', prefix: 'emm_k9m2p7qa', createdAt: '2026-09-06T02:10:00Z', lastUsedAt: '2026-09-13T01:20:00Z', revokedAt: null }];
const { browser, page } = await boot({ width: 1100, height: 760, beforeGoto: async (page) => {
  // 응답 모양은 apiClient.ts 의 타입과 맞춘다 — 틀리면 문서함이 죽어 계정 메뉴까지 못 간다
  await page.route('https://api-dev.mindmap.ai.kr/**', (route) => {
    const req = route.request(); const p = new URL(req.url()).pathname.replace(/^\/v1/, ''); const m = req.method();
    const json = (o) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(o) });
    if (p === '/mcp-tokens' && m === 'GET') return json({ available: true, ready: true, tokens });
    if (p === '/mcp-tokens' && m === 'POST') { const t2 = { id: 't2', name: req.postDataJSON().name, prefix: 'emm_a1b2c3d4', createdAt: new Date().toISOString(), lastUsedAt: null, revokedAt: null }; tokens.unshift(t2); return json({ ...t2, token: 'emm_a1b2c3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8S9t0U1v' }); }
    if (p === '/account/profile') return json({ fullName: '홍길동', email: 'you@example.com', emailVerified: true, avatar: null });
    if (p === '/maps' || p === '/maps/shared') return json({ maps: [], total: 0 });
    if (p === '/folders') return json({ folders: [], total: 0 });
    if (p === '/account/ai-settings') return json({ available: true, settings: null, updatedAt: null });
    if (p === '/account/ai-keys') return json({ available: true, keys: {} });
    return json({});
  });
  await page.route('http://auth.local/**', (r) => r.fulfill({ contentType: 'application/json', body: '{}' }));
  await page.addInitScript(() => localStorage.setItem('emm.auth', JSON.stringify({ state: { session: { accessToken: 'demo', refreshToken: 'demo', expiresAt: Date.now() + 3600e3, userId: 'demo', email: 'you@example.com' }, guest: false }, version: 0 })));
} });
await page.addStyleTag({ content: '*:not(code) { font-family: Pretendard, sans-serif !important; }' });
await page.getByTestId('user-menu').waitFor({ timeout: 30000 }); await page.waitForTimeout(800);
await page.getByTestId('user-menu').click(); await page.getByTestId('user-menu-mcp').click();
await page.getByTestId('mcp-token-name').fill('집 노트북 Claude'); await page.getByTestId('mcp-issue').click();
await page.getByTestId('mcp-fresh-token').waitFor(); await page.waitForTimeout(500);
await page.getByTestId('mcp-dialog').screenshot({ path: OUT });
console.log('shot', OUT);
await browser.close();
