// 가이드 01 — 문서함 [↻ 새로고침] 버튼: 목록(내 맵·폴더·공유받은 맵)을 다시 읽는다 (2026-09-21).
//   node scripts/doc-shots/guide01-browser-refresh.mjs <출력폴더>   (vite 는 인증 모드로)
import { boot, forceFont, authStubs, shotUnion } from './lib.mjs';
const OUT = process.argv[2] ?? '/tmp/doc-shots';
const ok = (name, cond) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); if (!cond) process.exitCode = 1; };

// 서버 스텁 — phase 0: 내 맵 A 하나 · 공유 없음, phase 1: 내 맵 A·B + 공유받은 S (두 번째 /maps 는 700ms 늦게)
let phase = 0; const calls = { maps: 0, shared: 0, folders: 0 };
const item = (id, title, extra = {}) => ({
  mapId: id, title, folderId: null, kind: 'solo', deletedAt: null,
  createdAt: '2026-09-20T00:00:00Z', updatedAt: '2026-09-21T00:00:00Z',
  nodeCount: 12, docBytes: 2048, attachCount: 0, attachBytes: 0, ...extra,
});
const stubs = authStubs((p, m, req, json) => {
  if (p === '/maps' && m === 'GET') {
    calls.maps++;
    const body = { maps: phase ? [item('a', 'A맵'), item('b', 'B맵 (새로 저장됨)')] : [item('a', 'A맵')], total: phase ? 2 : 1 };
    if (phase) return new Promise((r) => setTimeout(() => r(json(body)), 700));
    return json(body);
  }
  if (p === '/maps/shared') { calls.shared++; return json(phase ? { maps: [item('s', 'S맵 (공유받음)', { shared: true, ownerEmail: 'friend@example.com', role: 'viewer' })], total: 1 } : { maps: [], total: 0 }); }
  if (p === '/folders') { calls.folders++; return json({ folders: [], total: 0 }); }
  return null;
});
const { browser, page, size } = await boot({ width: 1400, height: 860, scale: 1, beforeGoto: stubs });
await page.getByTestId('user-menu').waitFor({ timeout: 30000 });
await forceFont(page);
await page.evaluate(async () => { const m = await import('/src/stores/editorUiStore.ts'); m.useEditorUiStore.getState().setBrowserOpen(true); });
await page.waitForSelector('[data-testid="map-browser"]', { timeout: 10000 });
await page.waitForTimeout(600);

const btn = page.locator('[data-testid="browser-refresh"]');
const browserText = () => page.locator('[data-testid="map-browser"]').innerText();

// ① 버튼 자리 — "내 문서" 바로 다음, 첫 목록은 이미 읽었다
const strong = page.locator('[data-testid="map-browser"] strong', { hasText: '내 문서' }).first();
const sb = await strong.boundingBox(); const bb = await btn.boundingBox();
ok('① [↻ 새로고침] 이 "내 문서" 바로 오른쪽', bb.x > sb.x + sb.width && bb.x - (sb.x + sb.width) < 30 && Math.abs(bb.y - sb.y) < 12);
ok(`① 첫 목록 읽음 (maps ${calls.maps} · shared ${calls.shared} · folders ${calls.folders})`, calls.maps >= 1 && calls.shared >= 1 && calls.folders >= 1);
const delta = (a, b) => ({ maps: b.maps - a.maps, shared: b.shared - a.shared, folders: b.folders - a.folders });
ok('① 지금은 A맵만 보인다', (await browserText()).includes('A맵') && !(await browserText()).includes('B맵'));
await shotUnion(page, size, `${OUT}/01-browser-refresh.png`, [sb, bb, await page.locator('[data-testid="browser-new-map"]').boundingBox()], 14);

// ② 서버에 새 맵·공유가 생긴 뒤 [↻ 새로고침] → 세 목록을 다시 읽고, 읽는 동안 버튼은 잠긴다
phase = 1;
let before = { ...calls };
await btn.click();
await page.waitForTimeout(250);
ok('② 읽는 동안 "읽는 중…" + 비활성', (await btn.innerText()).includes('읽는 중') && (await btn.isDisabled()));
await page.waitForFunction(() => document.querySelector('[data-testid="browser-refresh"]')?.textContent?.includes('새로고침'), null, { timeout: 5000 });
await page.waitForTimeout(200);
let d = delta(before, calls);
ok(`② maps·shared·folders 를 한 번씩 더 읽었다 (+${d.maps}/+${d.shared}/+${d.folders})`, d.maps === 1 && d.shared === 1 && d.folders === 1);
const txt = await browserText();
ok('② 새로 저장된 B맵이 목록에', txt.includes('B맵 (새로 저장됨)'));
ok('② 공유받은 S맵도 목록에', txt.includes('S맵 (공유받음)'));
ok('② 버튼이 다시 활성', !(await btn.isDisabled()));

// ③ 다시 눌러도 같은 결과 (멱등)
before = { ...calls };
await btn.click();
await page.waitForFunction(() => document.querySelector('[data-testid="browser-refresh"]')?.textContent?.includes('새로고침'), null, { timeout: 5000 });
d = delta(before, calls);
ok(`③ 두 번째 새로고침도 세 목록을 다시 읽는다 (+${d.maps}/+${d.shared}/+${d.folders})`, d.maps === 1 && d.shared === 1 && d.folders === 1);

await browser.close();
