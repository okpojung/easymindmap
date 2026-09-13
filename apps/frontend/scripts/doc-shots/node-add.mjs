// 가이드 03 — 레이아웃별 `+` 버튼 방향 12장 (node-add-*.png).
// 툴팁(<title>)은 브라우저 네이티브라 캡처에 안 찍힌다 — 각 + 옆에 그 문구를
// 설명용 라벨로 얹는다 (문서에 "설명용" 이라고 밝혀 두었다).
//   node scripts/doc-shots/node-add.mjs <출력폴더>
import { boot, forceFont, stores, nodeBox, shotUnion } from './lib.mjs';
const OUT = process.argv[2] ?? '/tmp/doc-shots';
const CASES = [
  ['radial-bidirectional', 'root', 'radial-both-root'],
  ['radial-bidirectional', 'b1-1', 'radial-both-right'],
  ['radial-bidirectional', 'b4-1', 'radial-both-left'],
  ['radial-right', 'b1-1', 'radial-right'],
  ['tree-right', 'b1-1', 'tree-right'],
  ['tree-down', 'b1-1', 'tree-down'],
  ['hierarchy-right', 'b1-1', 'hierarchy-right'],
  ['process-tree-right', 'b1-1', 'process-tree-right'],
  ['timeline', 'b1', 'timeline-axis'],
  ['timeline', 'b1-1', 'timeline-stack'],
  ['timeline-center', 'b1', 'timeline-center-axis'],
  ['timeline-center', 'b1-1', 'timeline-center-stack'],
];
const { browser, page } = await boot();
await page.waitForSelector('[data-node-id="root"]', { timeout: 30000 });
await forceFont(page);
for (const [layout, nodeId, key] of CASES) {
  await stores.select(page, null);
  await stores.layout(page, layout);
  await page.waitForTimeout(500);
  await stores.select(page, nodeId);
  await page.waitForSelector('[data-add-indicator]', { timeout: 5000 });
  await stores.center(page, nodeId);
  await page.waitForTimeout(400);
  const res = await page.evaluate(({ nodeId }) => {
    document.querySelectorAll('.doc-label').forEach((e) => e.remove());
    const nb = document.querySelector(`[data-node-id="${nodeId}"]`).getBoundingClientRect();
    const ncx = nb.x + nb.width / 2, ncy = nb.y + nb.height / 2;
    const ns = 'http://www.w3.org/2000/svg';
    const labels = [];
    let minX = nb.x, minY = nb.y, maxX = nb.right, maxY = nb.bottom;
    for (const g of document.querySelectorAll('[data-add-indicator]')) {
      const c = g.querySelector('circle[r="11"]');
      const cx = +c.getAttribute('cx'), cy = +c.getAttribute('cy');
      const text = g.querySelector('title').textContent;
      const cb = c.getBoundingClientRect();
      const dx = cb.x + cb.width / 2 - ncx, dy = cb.y + cb.height / 2 - ncy;
      const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
      labels.push(`${dir}=${text}`);
      const w = text.length * 13 + 18, h = 24;
      let lx = cx, ly = cy, anchor = 'middle';
      if (dir === 'right') { lx = cx + 18; anchor = 'start'; }
      if (dir === 'left') { lx = cx - 18; anchor = 'end'; }
      if (dir === 'up') ly = cy - 26;
      if (dir === 'down') ly = cy + 26;
      const rx = anchor === 'start' ? lx - 4 : anchor === 'end' ? lx - w + 4 : lx - w / 2;
      const grp = document.createElementNS(ns, 'g'); grp.setAttribute('class', 'doc-label');
      const rect = document.createElementNS(ns, 'rect');
      for (const [k, v] of Object.entries({ x: rx, y: ly - h / 2, width: w, height: h, rx: 6, fill: '#1F2328', opacity: '0.92' })) rect.setAttribute(k, v);
      const t = document.createElementNS(ns, 'text');
      for (const [k, v] of Object.entries({ x: anchor === 'middle' ? lx : anchor === 'start' ? lx + 5 : lx - 5, y: ly + 5, 'font-size': '13', 'font-weight': '600', fill: '#fff', 'text-anchor': anchor })) t.setAttribute(k, v);
      t.textContent = text;
      grp.append(rect, t); g.parentNode.appendChild(grp);
      const rb = rect.getBoundingClientRect();
      minX = Math.min(minX, rb.x, cb.x); minY = Math.min(minY, rb.y, cb.y);
      maxX = Math.max(maxX, rb.right, cb.right); maxY = Math.max(maxY, rb.bottom, cb.bottom);
    }
    return { labels, rect: { x: minX, y: minY, width: maxX - minX, height: maxY - minY } };
  }, { nodeId });
  await shotUnion(page, { width: 1600, height: 1000 }, `${OUT}/node-add-${key}.png`, [res.rect], 70);
  console.log('  ', key, '|', res.labels.join(' · '));
}
await browser.close();
