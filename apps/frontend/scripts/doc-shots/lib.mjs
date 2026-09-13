// 사용자 가이드 스크린샷 공용 도우미 (2026-09-13).
//
// 실제 프런트엔드를 vite 개발 서버로 띄우고 Playwright 로 조작해 찍는다 —
// 그림을 그리는 것이 아니라 **진짜 컴포넌트를 렌더**하므로 캡처가 곧
// 동작 확인이다. 절차·규칙: docs/user-guide/assets/README.md
//
// 실행 전제
//   · vite 가 http://127.0.0.1:5199 에서 돌고 있어야 한다 (README 의 명령)
//   · Playwright 는 전역 설치본을 쓴다 — PLAYWRIGHT_MODULE 로 경로 지정
//     (예: /opt/node22/lib/node_modules/playwright/index.mjs). 프런트엔드
//     의존성에 넣지 않는다 — 문서 도구 때문에 번들 의존성을 늘리지 않는다.
export const BASE = process.env.DOC_SHOT_BASE ?? 'http://127.0.0.1:5199';
const pw = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');

/** 브라우저 + 페이지. 폰트는 CDN 이 막힌 환경을 대비해 로컬 Pretendard 로 강제한다. */
export async function boot({ width = 1600, height = 1000, scale = 2, path = '/', beforeGoto } = {}) {
  const browser = await pw.chromium.launch();
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: scale, locale: 'ko-KR' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 200)));
  // API 는 전부 스텁 — 응답 모양은 apiClient.ts 의 타입과 맞춰야 한다
  await page.route('http://api.local/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page.route('https://cdn.jsdelivr.net/**', (r) => r.abort());
  if (beforeGoto) await beforeGoto(page);
  await page.goto(BASE + path);
  return { browser, page, size: { width, height } };
}

export async function forceFont(page) {
  await page.addStyleTag({ content: '*:not(code):not(textarea){font-family:Pretendard,sans-serif !important}' });
}

/** 에디터 스토어 — vite 개발 서버는 같은 모듈 URL 을 같은 인스턴스로 주므로 앱과 상태를 공유한다 */
export const stores = {
  select: (page, id) => page.evaluate(async ({ id }) => {
    const m = await import('/src/stores/interactionStore.ts');
    m.useInteractionStore.getState().setMultiSelectedIds([]);
    m.useInteractionStore.getState().setSelectedId(id);
  }, { id }),
  multi: (page, ids) => page.evaluate(async ({ ids }) => {
    const m = await import('/src/stores/interactionStore.ts');
    m.useInteractionStore.getState().setMultiSelectedIds(ids);
  }, { ids }),
  layout: (page, layout) => page.evaluate(async ({ layout }) => {
    const m = await import('/src/stores/editorUiStore.ts');
    m.useEditorUiStore.getState().setLayoutType(layout);
  }, { layout }),
  // 캔버스는 스크롤이 아니라 pan/scale — scrollIntoView 가 듣지 않는다.
  // 검색 결과 클릭이 쓰는 요청으로 노드를 화면 중앙에 놓는다.
  center: (page, id, zoom = 100) => page.evaluate(async ({ id, zoom }) => {
    const m = await import('/src/stores/viewportStore.ts');
    m.useViewportStore.getState().requestCenterNode(id, zoom);
  }, { id, zoom }),
  selectedId: (page) => page.evaluate(async () => {
    const m = await import('/src/stores/interactionStore.ts');
    return m.useInteractionStore.getState().selectedId;
  }),
};

export const nodeBox = (page, id) => page.locator(`[data-node-id="${id}"]`).first().boundingBox();

/** 사각형들의 합집합 + 여백을 뷰포트 안으로 잘라 찍는다 */
export async function shotUnion(page, size, file, rects, pad = 60) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const r of rects) {
    if (!r) continue;
    x0 = Math.min(x0, r.x); y0 = Math.min(y0, r.y);
    x1 = Math.max(x1, r.x + r.width); y1 = Math.max(y1, r.y + r.height);
  }
  const X = Math.max(0, x0 - pad), Y = Math.max(0, y0 - pad);
  await page.screenshot({ path: file, clip: {
    x: X, y: Y,
    width: Math.min(size.width - X, x1 - x0 + pad * 2),
    height: Math.min(size.height - Y, y1 - y0 + pad * 2),
  } });
  console.log('shot', file);
}
