// 가이드 07 — AI 설정(키 입력 + 도움말) · AI 생성 결과(두 버튼 + 확인 창) · 선택 노드 확장 결과.
// AI 제공사 HTTP 는 스텁이다 (api.openai.com → 가짜 답변) — 그 뒤의 파싱·확인·삽입은 진짜 코드가 돈다.
// vite: 인증 모드 (guide01-02.mjs 와 같음)
//   node scripts/doc-shots/guide07.mjs <출력폴더>
import { boot, forceFont, authStubs, openSample, shotUnion, stores, nodeBox } from './lib.mjs';
const OUT = process.argv[2] ?? '/tmp/doc-shots';
const GEN_MD = `# Docker 로 WordPress 설치\n## 준비\n### Docker Desktop 설치\n### 작업 폴더 만들기\n## compose 파일 작성\n### db 서비스 (MySQL 8)\n### wordpress 서비스\n## 실행과 확인\n### docker compose up -d\n### http://localhost:8080 접속\n`;
const EXPAND_MD = `## 이메일 / 소셜 로그인\n### 이메일 확인 메일 발송\n### Google · GitHub OAuth\n## 세션 · 권한 관리\n### 액세스 토큰 갱신\n### 역할별 권한 표\n## 보안 점검\n### 비밀번호 정책\n### 로그인 시도 제한\n`;
const { browser, page, size } = await boot({ width: 1400, height: 860, scale: 1, beforeGoto: async (page) => {
  await authStubs()(page);
  const pick = (route) => { const body = route.request().postDataJSON?.() ?? {}; return JSON.stringify(body.messages ?? '').includes('확장할 노드') ? EXPAND_MD : GEN_MD; };
  await page.route('https://api.openai.com/**', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content: pick(route) } }] }) }));
  await page.route('https://api.anthropic.com/**', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'text', text: pick(route) }] }) }));
} });
await page.getByTestId('user-menu').waitFor({ timeout: 30000 });
await forceFont(page);
await openSample(page);
const bb = (loc) => loc.boundingBox();
const up = (sel, pred) => page.evaluate(({ sel, pred }) => {
  let el = document.querySelector(sel); const f = new Function('r', 'el', `return ${pred}`);
  while (el && !f(el.getBoundingClientRect(), el)) el = el.parentElement;
  const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height };
}, { sel, pred });
const ui = (patch) => page.evaluate(async ({ patch }) => { const m = await import('/src/stores/editorUiStore.ts'); m.useEditorUiStore.setState(patch); }, { patch });
const panelRect = async () => {
  const rail = await up('[title="템플릿"]', 'r.height > innerHeight * 0.5');
  const pc = await bb(page.getByTestId('panel-close'));
  return { x: rail.x, y: pc.y - 12, width: (pc.x + pc.width + 16) - rail.x };
};

// ── AI 설정 — 키 입력 + "키 발급 방법" 펼침 ─────────────
{
  await ui({ aiSettingsOpen: true }); await page.getByTestId('ai-settings-dialog').waitFor();
  const dlg = page.getByTestId('ai-settings-dialog');
  await dlg.getByText('키 발급 방법', { exact: false }).first().click().catch(() => {});
  const first = dlg.locator('input[type="password"], input[type="text"]').first();
  await first.fill('sk-ant-api03-예시키-여기에-붙여넣기'); await page.waitForTimeout(300);
  await dlg.screenshot({ path: `${OUT}/07-ai-settings.png` }); console.log('shot 07-ai-settings');
  await ui({ aiSettingsOpen: false }); await page.waitForTimeout(200);
  await page.evaluate(async () => { const m = await import('/src/stores/aiSettingsStore.ts'); m.useAiSettingsStore.getState().setKey('anthropic', ''); });
}
// ── AI 생성 결과 — 두 버튼 + 확인 창 ─────────────────
{
  await page.evaluate(async () => { const m = await import('/src/stores/aiSettingsStore.ts'); m.useAiSettingsStore.getState().setKey('openai', 'sk-demo'); });
  await stores.select(page, 'b2-2');
  await ui({ activeSection: 'inspector', inspectorTab: 'ai', sidebarCollapsed: false }); await page.waitForTimeout(500);
  const ta = page.getByPlaceholder(/웹 채팅에 질문하듯/); await ta.waitFor();
  await ta.fill('Docker로 WordPress 설치 절차를 정리해줘');
  await page.getByRole('button', { name: /AI에게 물어보기/ }).click();
  await page.getByRole('button', { name: /새 맵 생성/ }).waitFor({ timeout: 10000 });
  await page.getByRole('button', { name: '선택 노드에 삽입' }).click();
  await page.getByText('확인', { exact: true }).waitFor({ timeout: 5000 }); await page.waitForTimeout(300);
  const pr = await panelRect();
  const cf = await page.getByText('확인', { exact: true }).boundingBox();
  await shotUnion(page, size, `${OUT}/07-ai-result.png`, [{ x: pr.x, y: pr.y, width: pr.width, height: 640 }, { x: cf.x - 40, y: cf.y - 120, width: 420, height: 200 }], 0);
  await page.getByText('취소', { exact: true }).click(); await page.waitForTimeout(300);
}
// ── 선택 노드 자세히 확장 → 하위에 채워진 세부 노드 ────────
{
  await stores.select(page, 'b1-1'); await page.waitForTimeout(300);
  // 확장은 브라우저의 window.confirm 으로 묻는다 (캡처에 안 찍힘) — 자동으로 [확인]
  page.once('dialog', (d) => { console.log('confirm:', d.message().split('\n')[0]); d.accept(); });
  const before = await page.locator('[data-node-id]').count();
  await page.getByRole('button', { name: /선택 노드 자세히 확장/ }).last().click();
  await page.waitForFunction((n) => document.querySelectorAll('[data-node-id]').length > n, before, { timeout: 15000 });
  await page.waitForTimeout(500);
  await ui({ sidebarCollapsed: true });
  await stores.center(page, 'b1-1'); await page.waitForTimeout(500);
  const kids = await page.evaluate(() => [...document.querySelectorAll('[data-node-id]')].map((e) => e.getAttribute('data-node-id')).filter((id) => !/^(root|b\d)/.test(id)).length);
  console.log('expanded nodes (new ids):', kids);
  const nb = await nodeBox(page, 'b1-1');
  await shotUnion(page, size, `${OUT}/07-ai-expand.png`, [{ x: nb.x - 60, y: nb.y - 230, width: nb.width + 560, height: nb.height + 460 }], 0);
}
await browser.close();
