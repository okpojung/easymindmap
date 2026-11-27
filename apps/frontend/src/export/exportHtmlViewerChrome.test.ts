// HTML 뷰어 머리말·아래 막대·미니맵 창이 앱과 같은 배치인지 (2026-11-27 사용자 요청).
// node scripts/run-vite-test.mjs src/export/exportHtmlViewerChrome.test.ts
import { buildStandaloneHtml } from './exportHtml';
import type { SampleMap } from '@emm/emm-parser';

const assert = (ok: unknown, label: string) => { if (!ok) throw new Error(label); };
const map: SampleMap = {
  title: 'Viewer chrome', canvasMode: 'auto',
  root: { id: 'root', text: 'Root', colorKey: 'root' },
  branches: [{ id: 'a', text: 'Child with link', colorKey: 'l1A', side: 'right',
    project: { start: '2026-12-01', end: '2026-12-05', progress: 40, assignees: [{ name: 'Kim' }] },
    links: [{ url: 'https://example.com', label: 'ex' }],
    notes: [{ id: 'n1', type: 'paragraph', text: 'memo' }] }],
} as unknown as SampleMap;
const html = buildStandaloneHtml(map, 'process-tree-right');
const idx = (id: string) => html.indexOf(`id="${id}"`);

// 머리말: 로고 · 제목 상자 · 검색 | 보기 · 목록(링크·첨부·MD·노트) · 펼치기/접기 — 이 순서
const order = ['mm-brand', 'mm-title', 'mm-search', 'mm-view-toggle', 'mm-outline-split', 'mm-dark', 'mm-gantt-btn',
  'mm-list-links', 'mm-list-files', 'mm-list-md', 'mm-list-notes', 'mm-expand', 'mm-collapse'];
order.forEach((id) => assert(idx(id) > 0, 'missing #' + id));
for (let i = 1; i < order.length; i++) assert(idx(order[i - 1]) < idx(order[i]), 'header order ' + order[i - 1] + ' < ' + order[i]);
assert((html.match(/class="mm-group"/g) ?? []).length === 4, 'four header groups (view, gantt, lists, fold)');

// 아래 막대: 왼쪽 상태(앱 문구 + 내보내기 정보) · 오른쪽 − 100% + 미니맵 | Pan · 선택 노드 · 맞추기 · 전체화면
const bottom = ['mm-status', 'mm-zoom-out', 'mm-zoom-pct', 'mm-zoom-in', 'mm-minimap-btn', 'mm-pan', 'mm-center', 'mm-fit', 'mm-fullscreen'];
for (let i = 1; i < bottom.length; i++) assert(idx(bottom[i - 1]) < idx(bottom[i]), 'bottom order ' + bottom[i]);
assert(idx('mm-bottombar') > idx('mm-main'), 'status bar below the canvas');
assert(!html.includes('id="mm-zoom-100"') && !html.includes('id="mm-zoom-input"'), 'no separate 100% magnifier / number input');
assert(!html.includes('id="mm-count" class') && html.includes('EasyMindMap'), 'status text baked');
// 상단에서 화면 단추가 빠졌다 (아래 막대로 옮김)
const headerEnd = html.indexOf('</header>');
['mm-pan', 'mm-center', 'mm-fit', 'mm-fullscreen', 'mm-minimap-btn'].forEach((id) => assert(idx(id) > headerEnd, id + ' not in header'));

// 미니맵 창: 타이틀바·핀·도움말·닫기·크기 조절 + 도움말 대화상자
['mm-mm-bar', 'mm-mm-pin', 'mm-mm-help', 'mm-mm-close', 'mm-mm-resize', 'mm-mm-helpdlg'].forEach((id) => assert(idx(id) > 0, 'minimap ' + id));
assert(html.includes('easymindmap.minimap.window.v1'), 'minimap window state key shared with the app');

// 앱 아이콘을 구워 실었다 · 앱 글꼴 · 넘치는 줄 맞춤 · 앱과 같은 휠
assert(html.includes('window.__MM_IC__ = {'), 'icon table');
assert(/<link rel="stylesheet" href="https:\/\/cdn\.jsdelivr\.net\/gh\/orioncactus\/pretendard/.test(html), 'Pretendard link');
assert(html.includes("lengthAdjust', 'spacingAndGlyphs'"), 'over-wide line squeeze');
assert(html.includes('function canvasWheel(e, atCenter)'), 'app wheel behaviour');
assert(!/<header>[\s\S]*?id="mm-lists-btn"/.test(html), 'old single lists button removed');
// 읽기 전용 간트 — 앱 buildGanttRows 로 구운 줄 · 앱 테마 · 아래 칸
const ganttJson = html.slice(html.indexOf('window.__MINDMAP__'));
assert(/"gantt":\{"rows":\[\{/.test(ganttJson) && ganttJson.includes('"barStart":"2026-12-01"') && ganttJson.includes('"ganttThemes"'), 'gantt rows baked');
assert(idx('mm-gantt') > idx('mm-main') && idx('mm-gantt') < idx('mm-bottombar'), 'gantt dock between canvas and status bar');
assert(!/onChangeDates|data-testid="gantt-handle/.test(html), 'gantt is read-only');
console.log('PASS viewer chrome: header groups, bottom bar, minimap window, app icons, font fit, wheel');
