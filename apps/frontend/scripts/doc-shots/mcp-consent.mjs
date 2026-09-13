// 가이드 12 — OAuth 동의 화면 (mcp-connector-consent.png).
// GoTrue 의 인가 요청 조회 응답 하나만 스텁한다 — 화면 코드는 그대로다.
// vite 를 VITE_SUPABASE_URL=http://auth.local VITE_SUPABASE_AUTH_PREFIX= 로 띄운다.
//   node scripts/doc-shots/mcp-consent.mjs <출력파일>
import { boot } from './lib.mjs';
const OUT = process.argv[2] ?? '/tmp/doc-shots/mcp-connector-consent.png';
const { browser, page } = await boot({ width: 900, height: 520, path: '/oauth/consent?authorization_id=0f3c2e9a-7b1d-4c5e-9a2f-demo00000001', beforeGoto: async (page) => {
  await page.route('http://auth.local/**', (r) => r.request().url().includes('/oauth/authorizations/')
    ? r.fulfill({ contentType: 'application/json', body: JSON.stringify({ authorization_id: 'demo', client: { name: 'Claude' }, user: { email: 'you@example.com' }, scope: 'email' }) })
    : r.fulfill({ status: 404, body: '{}' }));
  await page.addInitScript(() => localStorage.setItem('emm.auth', JSON.stringify({ state: { session: { accessToken: 'demo', refreshToken: 'demo', expiresAt: Date.now() + 3600e3, userId: 'demo', email: 'you@example.com' }, guest: false }, version: 0 })));
} });
await page.addStyleTag({ content: '* { font-family: Pretendard, sans-serif !important; }' });
await page.getByTestId('consent-ask').waitFor({ timeout: 20000 });
await page.waitForTimeout(400);
await page.screenshot({ path: OUT, clip: { x: 0, y: 0, width: 900, height: 430 } });
console.log('shot', OUT);
await browser.close();
