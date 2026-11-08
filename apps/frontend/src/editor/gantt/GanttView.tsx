// 간트 차트 화면 (2026-11-07) — 편집 영역 아래 칸·새 탭·새 창이 같은 화면을 쓴다.
//
//   [간트|작업 목록] [일 주 월 년] [－ ＋] [오늘] [☐ 일정 없는 노드] [테마 ▾]
//   [작업 | 담당자 | 시작 | 끝 | 진척]  |  날짜 눈금 ── 막대
//
// 왼쪽 칸은 가로 스크롤해도 붙어 있고(sticky), 머리글은 세로 스크롤해도 붙어 있다.
// 막대·줄을 누르면 onSelect(노드 id) — 편집 창이 맵에서 그 노드를 찾아 보여 준다.
// 막대를 끌면 날짜가 옮겨지고, 양끝을 끌면 시작·끝이 바뀐다(2026-11-08) — 값은 늘 노드의 프로젝트 태그에
// 쓴다(onChangeDates). 간트가 따로 값을 들고 있지 않으므로 두 곳이 어긋나지 않는다.
// 2026-11-08 추가(ThinkWise 간트 참고): 년 눈금 · 축소/확대 · 일정 없는 노드 숨김(기본)/보기 · 테마.
// 보기 설정(눈금·배율·숨김·테마)은 이 브라우저에 기억한다.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { ThemeTokens } from '@/components/design-tokens/theme';
import { useTr } from '@/i18n';
import { dayNum, dayStr, draggedDates, todayStr, weekday, type GanttData, type GanttRow } from './ganttModel';
import { TaskListView } from './TaskListView';
import { GANTT_THEMES, GANTT_THEME_KEYS, alpha, type GanttThemeKey } from './ganttThemes';

type Scale = 'day' | 'week' | 'month' | 'year';
const SCALES: Scale[] = ['day', 'week', 'month', 'year'];
const DAY_W: Record<Scale, number> = { day: 26, week: 9, month: 3.2, year: 0.9 };
const ZOOMS = [0.5, 0.67, 0.8, 1, 1.25, 1.5, 2, 3];
const ROW_H = 30;
const HEAD_H = 46;
// 오른쪽 [개요] 칸의 열 — 폭은 개요 칸 폭에 비례해 나눈다 (ThinkWise·MS Project 의 표 칸과 같은 자리)
const DETAIL_COLS = [
  { key: 'assignee', weight: 1.5 },
  { key: 'start', weight: 1 },
  { key: 'finish', weight: 1 },
  { key: 'duration', weight: 0.7 },
  { key: 'complete', weight: 0.8 },
] as const;
const DETAIL_WEIGHT = DETAIL_COLS.reduce((a, c) => a + c.weight, 0);
const TASK_W_MIN = 140;
const DETAIL_W_MIN = 220;

interface Prefs { scale: Scale; zoom: number; showAll: boolean; theme: GanttThemeKey; details: boolean; taskW: number; detailW: number }
const PREF_KEY = 'emm.gantt.prefs';
function loadPrefs(): Prefs {
  const d: Prefs = { scale: 'day', zoom: 3, showAll: false, theme: 'vivid', details: true, taskW: 240, detailW: 400 };
  try {
    const p = JSON.parse(localStorage.getItem(PREF_KEY) || '{}') as Partial<Prefs>;
    return {
      scale: SCALES.includes(p.scale as Scale) ? (p.scale as Scale) : d.scale,
      zoom: typeof p.zoom === 'number' && p.zoom >= 0 && p.zoom < ZOOMS.length ? p.zoom : d.zoom,
      showAll: typeof p.showAll === 'boolean' ? p.showAll : d.showAll,
      theme: GANTT_THEME_KEYS.includes(p.theme as GanttThemeKey) ? (p.theme as GanttThemeKey) : d.theme,
      details: typeof p.details === 'boolean' ? p.details : d.details,
      taskW: typeof p.taskW === 'number' && p.taskW >= TASK_W_MIN ? Math.min(700, p.taskW) : d.taskW,
      detailW: typeof p.detailW === 'number' && p.detailW >= DETAIL_W_MIN ? Math.min(800, p.detailW) : d.detailW,
    };
  } catch { return d; }
}

function shortDate(v: string | undefined, year: number): string {
  if (!v) return '';
  return +v.slice(0, 4) === year ? v.slice(5).replace('-', '/') : v.slice(2).replace(/-/g, '/');
}

type DragMode = 'move' | 'start' | 'end';
type Tick = { x: number; w: number; label: string; weekend?: boolean; today?: boolean };

export function GanttView({ t, data, selectedId, onSelect, toolbar, fill, editable, onChangeDates, me }: {
  t: ThemeTokens;
  data: GanttData;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  /** 막대를 끌어 날짜를 바꿀 수 있나 (읽기 전용 맵이면 false) */
  editable?: boolean;
  onChangeDates?: (id: string, patch: { start?: string; end?: string }) => void;
  /** 지금 사용자 — 작업 목록의 [나] */
  me?: { name?: string; email?: string } | null;
  /** 머리줄 오른쪽에 붙일 단추들 (닫기·새 탭 등) */
  toolbar?: ReactNode;
  /** 부모 높이를 꽉 채운다 */
  fill?: boolean;
}) {
  const tr = useTr();
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const setPref = (p: Partial<Prefs>) => setPrefs((cur) => { const next = { ...cur, ...p }; try { localStorage.setItem(PREF_KEY, JSON.stringify(next)); } catch { /* 저장 못 해도 화면은 바뀐다 */ } return next; });
  const { scale, showAll } = prefs;
  const theme = GANTT_THEMES[prefs.theme];
  const [view, setView] = useState<'gantt' | 'tasks'>('gantt');
  // 끄는 중인 막대 — 놓기 전까지는 화면에만 (놓으면 onChangeDates)
  const drag = useRef<{ id: string; mode: DragMode; x0: number; delta: number; moved: boolean; row: GanttRow } | null>(null);
  const [preview, setPreview] = useState<{ id: string; start: string; end: string } | null>(null);
  const suppressClick = useRef(false);
  const canDrag = !!editable && !!onChangeDates;
  const [folded, setFolded] = useState<Set<string>>(() => new Set());
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const year = new Date().getFullYear();
  const today = todayStr();

  // 보일 줄 — 기본은 일정(📅) 있는 노드만(위 노드가 숨으면 들여쓰기도 당긴다),
  // [일정 없는 노드도 보기] 면 맵의 모든 노드(접기 가능)
  const visible = useMemo(() => {
    const out: (GanttRow & { shownDepth: number })[] = [];
    if (!showAll) {
      const byId = new Map(data.rows.map((r) => [r.id, r]));
      for (const r of data.rows) {
        if (!r.dated) continue;
        let d = 0;
        for (let p = r.parentId ? byId.get(r.parentId) : undefined; p; p = p.parentId ? byId.get(p.parentId) : undefined) if (p.dated) d++;
        out.push({ ...r, shownDepth: d });
      }
      return out;
    }
    let hideDepth = Infinity;
    for (const r of data.rows) {
      if (r.depth > hideDepth) continue;
      hideDepth = Infinity;
      out.push({ ...r, shownDepth: r.depth });
      if (folded.has(r.id) && r.hasChildren) hideDepth = r.depth;
    }
    return out;
  }, [data.rows, folded, showAll]);

  // 날짜 범위 — 앞뒤 여유. 주=월요일, 월=1일, 년=1월 1일에 맞춘다
  const range = useMemo(() => {
    if (!data.min || !data.max) return null;
    let a = Math.min(dayNum(data.min), dayNum(today)) - 3;
    let b = Math.max(dayNum(data.max), dayNum(today)) + 10;
    if (scale === 'week') { while (weekday(a) !== 1) a--; }
    if (scale === 'month') { a = dayNum(dayStr(a).slice(0, 8) + '01'); b = dayNum(dayStr(b + 31).slice(0, 8) + '01') - 1; }
    if (scale === 'year') { a = dayNum(dayStr(a).slice(0, 4) + '-01-01'); b = dayNum(String(+dayStr(b).slice(0, 4) + 1) + '-01-01') - 1; }
    return { a, b, days: b - a + 1 };
  }, [data.min, data.max, scale, today]);
  const dw = DAY_W[scale] * ZOOMS[prefs.zoom];
  const leftW = prefs.taskW;
  const rightW = prefs.details ? prefs.detailW : 0;
  // 스크롤 칸 폭 — 일정이 짧아도 [개요] 칸이 오른쪽 끝에 붙어 있게 일정 칸을 늘린다
  const [viewW, setViewW] = useState(0);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setViewW(el.clientWidth));
    ro.observe(el);
    setViewW(el.clientWidth);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!range, view]);
  const timelineW = range ? Math.max(range.days * dw, viewW - leftW - rightW) : 0;

  // 처음 열 때(와 눈금·배율을 바꿀 때) 오늘 근처로
  const scrollToDay = (d: string) => {
    const el = scrollRef.current;
    if (!el || !range) return;
    const x = (dayNum(d) - range.a) * dw;
    el.scrollLeft = Math.max(0, x - (el.clientWidth - leftW - rightW) / 3);
  };
  useEffect(() => {
    if (!range) return;
    const first = data.min && dayNum(data.min) > dayNum(today) ? data.min : today;
    scrollToDay(first);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scale, prefs.zoom, !!range]);

  // 머리글 눈금 — 위 줄(월·년), 아래 줄(일·주·월·분기)
  const ticks = useMemo(() => {
    const top: Tick[] = [];
    const bottom: Tick[] = [];
    if (!range) return { top, bottom };
    let curKey = '';
    for (let d = range.a; d <= range.b; d++) {
      const s = dayStr(d);
      const yearly = scale === 'month' || scale === 'year';
      const key = yearly ? s.slice(0, 4) : s.slice(0, 7);
      if (key !== curKey) {
        top.push({ x: (d - range.a) * dw, w: 0, label: yearly ? key : `${s.slice(0, 4)}.${s.slice(5, 7)}` });
        curKey = key;
      }
      const md = s.slice(5);
      if (scale === 'day') {
        const wd = weekday(d);
        bottom.push({ x: (d - range.a) * dw, w: dw, label: String(+s.slice(8, 10)), weekend: wd === 0 || wd === 6, today: s === today });
      } else if (scale === 'week' && weekday(d) === 1) {
        bottom.push({ x: (d - range.a) * dw, w: dw * 7, label: `${+s.slice(5, 7)}/${+s.slice(8, 10)}` });
      } else if (scale === 'month' && s.slice(8, 10) === '01') {
        bottom.push({ x: (d - range.a) * dw, w: 0, label: s.slice(5, 7) });
      } else if (scale === 'year' && (md === '01-01' || md === '04-01' || md === '07-01' || md === '10-01')) {
        bottom.push({ x: (d - range.a) * dw, w: 0, label: `Q${(+s.slice(5, 7) + 2) / 3}` });
      }
    }
    for (let i = 0; i < top.length; i++) top[i].w = (i + 1 < top.length ? top[i + 1].x : timelineW) - top[i].x;
    if (scale === 'month' || scale === 'year') for (let i = 0; i < bottom.length; i++) bottom[i].w = (i + 1 < bottom.length ? bottom[i + 1].x : timelineW) - bottom[i].x;
    return { top, bottom };
  }, [range, scale, dw, timelineW, today]);

  const btn = (on: boolean): React.CSSProperties => ({
    fontSize: 11.5, padding: '3px 9px', borderRadius: 6, cursor: 'pointer', lineHeight: 1.4,
    border: `1px solid ${on ? theme.accent : t.border}`,
    background: on ? alpha(theme.accent, 0.12) : t.surface, color: on ? theme.accent : t.text, fontWeight: on ? 700 : 500,
  });
  const iconBtn: React.CSSProperties = { ...btn(false), padding: '3px 8px', fontWeight: 700 };
  // 테마 강조색을 옅게 얹은 **불투명** 배경 — 양옆 고정 칸 뒤로 날짜·막대가 비치지 않게
  const solid = (a: number, base: string) => (a > 0 ? `linear-gradient(${alpha(theme.accent, a)}, ${alpha(theme.accent, a)}), ${base}` : base);
  const colW = (weight: number) => Math.max(36, Math.floor((rightW - 2) * weight / DETAIL_WEIGHT));
  // 칸 폭 조절 — [작업명] 오른쪽 경계, [개요] 왼쪽 경계를 끌어 넓히고 줄인다(기억한다)
  const sizing = useRef<{ which: 'task' | 'detail'; x0: number; w0: number } | null>(null);
  const resizeHandle = (which: 'task' | 'detail') => (
    <span
      data-testid={`gantt-resize-${which}`}
      title={tr('editor.gantt.drag')}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => { e.stopPropagation(); (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); sizing.current = { which, x0: e.clientX, w0: which === 'task' ? prefs.taskW : prefs.detailW }; }}
      onPointerMove={(e) => {
        const z = sizing.current;
        if (!z) return;
        const dx = e.clientX - z.x0;
        if (z.which === 'task') setPref({ taskW: Math.max(TASK_W_MIN, Math.min(700, Math.round(z.w0 + dx))) });
        else setPref({ detailW: Math.max(DETAIL_W_MIN, Math.min(800, Math.round(z.w0 - dx))) });
      }}
      onPointerUp={() => { sizing.current = null; }}
      style={{ position: 'absolute', top: 0, bottom: 0, width: 8, [which === 'task' ? 'right' : 'left']: -4, cursor: 'col-resize', zIndex: 5 }}
    />
  );
  const cell: React.CSSProperties = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '0 6px', fontSize: 11.5, flexShrink: 0 };
  const sep = <span style={{ width: 1, height: 18, background: t.border, margin: '0 3px' }} />;

  return (
    <div data-testid="gantt-view" style={{ display: 'flex', flexDirection: 'column', height: fill ? '100%' : undefined, minHeight: 0, background: t.surface, color: t.text }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 10px', borderBottom: `1px solid ${t.divider}`, background: `linear-gradient(180deg, ${alpha(theme.accent, 0.08)}, ${t.surfaceAlt})`, flexShrink: 0, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12.5, fontWeight: 800, color: theme.accent }}>▤ {tr('editor.gantt.title')}</span>
        <div style={{ display: 'flex', gap: 0, marginLeft: 4, border: `1px solid ${t.border}`, borderRadius: 7, overflow: 'hidden' }}>
          {(['gantt', 'tasks'] as const).map((v) => (
            <button key={v} type="button" data-testid={`gantt-view-${v}`} onClick={() => setView(v)} style={{
              fontSize: 11.5, padding: '3px 10px', border: 'none', cursor: 'pointer',
              background: view === v ? theme.accent : t.surface, color: view === v ? '#fff' : t.text, fontWeight: view === v ? 700 : 500,
            }}>{v === 'gantt' ? tr('editor.gantt.viewGantt') : `${tr('editor.gantt.viewTasks')} ${data.tasks.length}`}</button>
          ))}
        </div>
        {view === 'gantt' && <>
          {sep}
          {SCALES.map((s) => (
            <button key={s} type="button" data-testid={`gantt-scale-${s}`} style={btn(scale === s)} onClick={() => setPref({ scale: s })}>{tr(`editor.gantt.${s}`)}</button>
          ))}
          {sep}
          <button type="button" data-testid="gantt-zoom-out" title={tr('editor.gantt.zoomOut')} aria-label={tr('editor.gantt.zoomOut')} style={iconBtn} disabled={prefs.zoom === 0} onClick={() => setPref({ zoom: Math.max(0, prefs.zoom - 1) })}>－</button>
          <span data-testid="gantt-zoom" style={{ fontSize: 10.5, color: t.textMuted, minWidth: 34, textAlign: 'center' }}>{Math.round(ZOOMS[prefs.zoom] * 100)}%</span>
          <button type="button" data-testid="gantt-zoom-in" title={tr('editor.gantt.zoomIn')} aria-label={tr('editor.gantt.zoomIn')} style={iconBtn} disabled={prefs.zoom === ZOOMS.length - 1} onClick={() => setPref({ zoom: Math.min(ZOOMS.length - 1, prefs.zoom + 1) })}>＋</button>
          <button type="button" data-testid="gantt-today" style={btn(false)} onClick={() => scrollToDay(today)}>{tr('editor.gantt.today')}</button>
          <button type="button" data-testid="gantt-details" title={tr('editor.gantt.detailsTip')} style={btn(prefs.details)} onClick={() => setPref({ details: !prefs.details })}>{tr('editor.gantt.details')}</button>
          {sep}
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11.5, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            <input type="checkbox" data-testid="gantt-show-all" checked={showAll} onChange={(e) => setPref({ showAll: e.target.checked })} />
            {tr('editor.gantt.showAll')}
          </label>
          {sep}
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11.5, color: t.textMuted }}>
            {tr('editor.gantt.theme')}
            <select data-testid="gantt-theme" value={prefs.theme} onChange={(e) => setPref({ theme: e.target.value as GanttThemeKey })}
              style={{ fontSize: 11.5, padding: '2px 4px', borderRadius: 6, border: `1px solid ${t.border}`, background: t.surface, color: t.text }}>
              {GANTT_THEME_KEYS.map((k) => <option key={k} value={k}>{tr(`editor.gantt.theme.${k}`)}</option>)}
            </select>
          </label>
        </>}
        <span title={view === 'tasks' ? tr('editor.gantt.tasksHint') : canDrag ? tr('editor.gantt.hint') : tr('editor.gantt.hintReadOnly')}
          style={{ flex: 1, minWidth: 8, fontSize: 10.5, color: t.textSubtle, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {view === 'tasks' ? tr('editor.gantt.tasksHint') : canDrag ? tr('editor.gantt.hint') : tr('editor.gantt.hintReadOnly')}
        </span>
        {toolbar}
      </div>

      {view === 'tasks' ? (
        <TaskListView t={t} tasks={data.tasks} selectedId={selectedId} onSelect={onSelect} me={me} />
      ) : !range ? (
        <div data-testid="gantt-empty" style={{ padding: 18, fontSize: 12.5, color: t.textMuted, lineHeight: 1.6 }}>{tr('editor.gantt.empty')}</div>
      ) : (
        <div ref={scrollRef} data-testid="gantt-scroll" style={{ flex: 1, minHeight: 0, overflow: 'auto', position: 'relative' }}>
          <div style={{ width: leftW + timelineW + rightW, position: 'relative' }}>
            {/* 머리글 — [작업명] [날짜 눈금] [개요 열]. 양옆 칸은 불투명하게(가로로 굴려도 날짜가 비치지 않게) */}
            <div style={{ position: 'sticky', top: 0, zIndex: 3, display: 'flex', height: HEAD_H, background: t.surfaceAlt, borderBottom: `2px solid ${alpha(theme.accent, 0.5)}` }}>
              <div style={{ position: 'sticky', left: 0, zIndex: 4, display: 'flex', alignItems: 'flex-end', width: leftW, flexShrink: 0, background: solid(0.10, t.surfaceAlt), borderRight: `1px solid ${t.border}`, paddingBottom: 7, fontWeight: 700, color: t.text }}>
                <span style={{ ...cell, width: leftW }}>{tr('editor.gantt.task')}</span>
                {resizeHandle('task')}
              </div>
              <div style={{ position: 'relative', width: timelineW, flexShrink: 0, overflow: 'hidden' }}>
                {ticks.top.map((k, i) => (
                  <div key={`t${k.x}`} style={{ position: 'absolute', left: k.x, top: 0, width: k.w, height: 22, borderLeft: `1px solid ${t.border}`, fontSize: 11.5, fontWeight: 800, padding: '4px 6px', boxSizing: 'border-box', overflow: 'hidden', whiteSpace: 'nowrap', color: theme.accent, background: i % 2 ? alpha(theme.accent, 0.05) : alpha(theme.accent, 0.11) }}>{k.w >= 48 ? k.label : ''}</div>
                ))}
                {ticks.bottom.map((k) => (
                  <div key={`b${k.x}`} style={{ position: 'absolute', left: k.x, top: 22, width: k.w || undefined, height: 24, borderLeft: `1px solid ${t.divider}`, fontSize: 10, textAlign: scale === 'day' ? 'center' : 'left', padding: scale === 'day' ? '5px 0' : '5px 4px', boxSizing: 'border-box', color: k.today ? '#fff' : k.weekend ? theme.today : t.textMuted, background: k.today ? theme.today : undefined, borderRadius: k.today ? 4 : 0, fontWeight: k.today ? 800 : 500, whiteSpace: 'nowrap', overflow: 'hidden' }}>{(scale === 'month' || scale === 'year') && k.w < 18 ? '' : scale === 'day' && dw < 15 && !k.today && +k.label % 5 !== 1 ? '' : k.label}</div>
                ))}
              </div>
              {prefs.details && (
                <div style={{ position: 'sticky', right: 0, zIndex: 4, display: 'flex', alignItems: 'flex-end', width: rightW, flexShrink: 0, background: solid(0.10, t.surfaceAlt), borderLeft: `1px solid ${t.border}`, paddingBottom: 7, fontWeight: 700, color: t.text, boxShadow: '-4px 0 8px rgba(0,0,0,0.06)' }}>
                  {resizeHandle('detail')}
                  {DETAIL_COLS.map((c) => (
                    <span key={c.key} style={{ ...cell, width: colW(c.weight), textAlign: c.key === 'assignee' ? 'left' : 'center' }}>{tr(`editor.gantt.col.${c.key}`)}</span>
                  ))}
                </div>
              )}
            </div>

            {/* 본문 — 주말 음영·오늘 선은 한 번만 그린다 */}
            <div style={{ position: 'relative' }}>
              <div aria-hidden="true" style={{ position: 'absolute', left: leftW, top: 0, width: timelineW, height: visible.length * ROW_H, pointerEvents: 'none', overflow: 'hidden' }}>
                {scale === 'day' && ticks.bottom.filter((k) => k.weekend).map((k) => (
                  <div key={`w${k.x}`} style={{ position: 'absolute', left: k.x, top: 0, width: k.w, height: '100%', background: theme.weekend }} />
                ))}
                {(scale === 'month' || scale === 'year') && ticks.bottom.map((k) => (
                  <div key={`g${k.x}`} style={{ position: 'absolute', left: k.x, top: 0, width: 1, height: '100%', background: t.divider }} />
                ))}
                {dayNum(today) >= range.a && dayNum(today) <= range.b && (
                  <div data-testid="gantt-today-line" style={{ position: 'absolute', left: (dayNum(today) - range.a) * dw + dw / 2 - 1, top: 0, width: 2, height: '100%', background: theme.today, opacity: 0.8 }} />
                )}
              </div>
              {visible.map((r, rowIdx) => {
                const sel = selectedId === r.id;
                const color = theme.palette[r.branch % theme.palette.length];
                const pv = preview && preview.id === r.id ? preview : null;
                const bs = pv ? pv.start : r.barStart;
                const be = pv ? pv.end : r.barEnd;
                const hasBar = !!bs && !!be;
                const x = hasBar ? (dayNum(bs!) - range.a) * dw : 0;
                const w = hasBar ? Math.max(dw, (dayNum(be!) - dayNum(bs!) + 1) * dw) : 0;
                // 마감일만 있는 노드는 ◆ (마일스톤)
                const milestone = r.dated && r.hasEnd && !r.hasStart;
                // 끌기 — 막대 가운데는 통째로, 양끝 7px 은 시작·끝 (요약 막대는 하위에서 정해지므로 못 끈다)
                const startDrag = (mode: DragMode) => (e: React.PointerEvent) => {
                  if (!canDrag || !r.dated || e.button !== 0) return;
                  e.stopPropagation();
                  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                  drag.current = { id: r.id, mode, x0: e.clientX, delta: 0, moved: false, row: r };
                };
                const onDragMove = (e: React.PointerEvent) => {
                  const d = drag.current;
                  if (!d || d.id !== r.id || !d.row.barStart || !d.row.barEnd) return;
                  const px = e.clientX - d.x0;
                  if (!d.moved && Math.abs(px) < 3) return;
                  d.moved = true;
                  d.delta = Math.round(px / dw);
                  const nd = draggedDates(d.row, d.mode, d.delta);
                  // 화면용 처음·끝 — 적혀 있지 않은 쪽은 하루짜리 막대와 같이 움직인다
                  const ns = nd.start ?? (d.mode === 'move' ? nd.end! : d.row.barStart);
                  const ne = nd.end ?? (d.mode === 'move' ? ns : d.row.barEnd);
                  setPreview({ id: r.id, start: ns, end: ne < ns ? ns : ne });
                };
                const onDragEnd = () => {
                  const d = drag.current;
                  drag.current = null;
                  if (!d || d.id !== r.id) return;
                  if (d.moved) {
                    suppressClick.current = true;
                    window.setTimeout(() => { suppressClick.current = false; }, 0);
                    if (d.delta !== 0) onChangeDates?.(r.id, draggedDates(d.row, d.mode, d.delta));
                  }
                  setPreview(null);
                };
                const handle = (side: 'start' | 'end'): React.CSSProperties => ({
                  position: 'absolute', top: 0, bottom: 0, width: 7, [side === 'start' ? 'left' : 'right']: -1,
                  cursor: 'ew-resize', zIndex: 2,
                });
                const prog = r.progress ?? 0;
                const tint = sel ? 0.16 : rowIdx % 2 ? 0.03 : 0;
                const sideBg = solid(tint, t.surface);
                const tip = `${r.text}${hasBar ? ` · ${bs}${be !== bs ? ' ~ ' + be : ''}` : ''}${r.assignees.length ? ' · @' + r.assignees.join(', @') : ''}${r.progress != null ? ' · ' + r.progress + '%' : ''}`;
                const days = hasBar ? dayNum(be!) - dayNum(bs!) + 1 : 0;
                const detail = (key: typeof DETAIL_COLS[number]['key']) => {
                  if (key === 'assignee') return r.assignees.join(', ');
                  if (key === 'start') return shortDate(r.summary ? r.barStart : r.start, year);
                  if (key === 'finish') return shortDate(r.summary ? r.barEnd : r.end, year);
                  if (key === 'duration') return hasBar && (r.dated || r.summary) ? tr('editor.gantt.durDays', { n: days }) : '';
                  return r.progress != null ? `${r.progress}%` : '';
                };
                return (
                  <div key={r.id} data-testid="gantt-row" data-gantt-id={r.id}
                    onClick={() => { if (suppressClick.current) { suppressClick.current = false; return; } onSelect?.(r.id); }}
                    style={{ display: 'flex', height: ROW_H, borderBottom: `1px solid ${t.divider}`, cursor: onSelect ? 'pointer' : 'default', background: tint ? alpha(theme.accent, tint) : undefined, position: 'relative' }}>
                    <div style={{ position: 'sticky', left: 0, zIndex: 2, display: 'flex', alignItems: 'center', width: leftW, flexShrink: 0, background: sideBg, borderRight: `1px solid ${t.border}`, boxShadow: `inset 3px 0 0 ${r.dated || r.summary ? color : 'transparent'}` }}>
                      <span style={{ ...cell, width: leftW, display: 'flex', alignItems: 'center', gap: 3, paddingLeft: 8 + r.shownDepth * 14, fontWeight: r.summary || r.depth === 0 ? 700 : 500, color: sel ? theme.accent : r.dated || r.summary ? t.text : t.textMuted }} title={r.text}>
                        {showAll && r.hasChildren ? (
                          <button type="button" aria-label={folded.has(r.id) ? '+' : '-'}
                            onClick={(e) => { e.stopPropagation(); setFolded((f) => { const n = new Set(f); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n; }); }}
                            style={{ border: 'none', background: 'transparent', color: t.textMuted, cursor: 'pointer', width: 14, padding: 0, fontSize: 10, flexShrink: 0 }}>{folded.has(r.id) ? '▸' : '▾'}</button>
                        ) : <span style={{ width: 14, flexShrink: 0 }} />}
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.text}</span>
                      </span>
                      {resizeHandle('task')}
                    </div>
                    <div style={{ position: 'relative', width: timelineW, flexShrink: 0 }}>
                      {!hasBar ? null : r.summary ? (
                        <div data-testid="gantt-bar" title={`${tr('editor.gantt.summary')} · ${bs} ~ ${be}`} style={{ position: 'absolute', left: x, top: 11, width: w, height: 7, background: theme.summary, borderRadius: 2, opacity: 0.85 }}>
                          <span style={{ position: 'absolute', left: 0, top: 6, borderLeft: '4px solid transparent', borderRight: '4px solid transparent', borderTop: `6px solid ${theme.summary}` }} />
                          <span style={{ position: 'absolute', right: 0, top: 6, borderLeft: '4px solid transparent', borderRight: '4px solid transparent', borderTop: `6px solid ${theme.summary}` }} />
                        </div>
                      ) : milestone && !pv ? (
                        <div data-testid="gantt-bar" title={`${tr('editor.gantt.milestone')} · ${tip}`}
                          onPointerDown={startDrag('move')} onPointerMove={onDragMove} onPointerUp={onDragEnd} onPointerCancel={onDragEnd}
                          style={{ position: 'absolute', left: x + w / 2 - 8, top: 7, width: 16, height: 16, transform: 'rotate(45deg)', background: color, borderRadius: 3, boxShadow: sel ? `0 0 0 3px ${alpha(color, 0.35)}` : `0 1px 3px ${alpha(color, 0.5)}`, cursor: canDrag ? 'grab' : undefined, touchAction: canDrag ? 'none' : undefined }} />
                      ) : (
                        <div data-testid="gantt-bar" title={tip}
                          onPointerDown={startDrag('move')} onPointerMove={onDragMove} onPointerUp={onDragEnd} onPointerCancel={onDragEnd}
                          style={{
                            position: 'absolute', left: x, top: 6, width: w, height: 18, borderRadius: 6, boxSizing: 'border-box',
                            background: `linear-gradient(90deg, ${color} 0%, ${color} ${prog}%, ${alpha(color, 0.28)} ${prog}%, ${alpha(color, 0.28)} 100%)`,
                            border: `1px solid ${color}`,
                            boxShadow: pv ? `0 3px 10px ${alpha(color, 0.55)}` : sel ? `0 0 0 2px ${alpha(color, 0.35)}` : `0 1px 2px ${alpha(color, 0.35)}`,
                            cursor: canDrag ? (pv ? 'grabbing' : 'grab') : undefined, touchAction: canDrag ? 'none' : undefined,
                            display: 'flex', alignItems: 'center', overflow: 'hidden',
                          }}>
                          {w >= 46 && r.progress != null && (
                            <span style={{ fontSize: 9.5, fontWeight: 800, color: prog >= 40 ? '#fff' : color, paddingLeft: 6, pointerEvents: 'none', textShadow: prog >= 40 ? '0 1px 1px rgba(0,0,0,0.25)' : undefined }}>{prog}%</span>
                          )}
                          {canDrag && <span data-testid="gantt-handle-start" onPointerDown={startDrag('start')} onPointerMove={onDragMove} onPointerUp={onDragEnd} onPointerCancel={onDragEnd} style={handle('start')} />}
                          {canDrag && <span data-testid="gantt-handle-end" onPointerDown={startDrag('end')} onPointerMove={onDragMove} onPointerUp={onDragEnd} onPointerCancel={onDragEnd} style={handle('end')} />}
                        </div>
                      )}
                      {pv && (
                        <span data-testid="gantt-drag-label" style={{ position: 'absolute', left: x, top: -1, transform: 'translateY(-100%)', fontSize: 10.5, fontWeight: 700, color: '#fff', background: color, borderRadius: 4, padding: '1px 6px', whiteSpace: 'nowrap', zIndex: 3 }}>
                          {pv.start === pv.end ? pv.start : `${pv.start} ~ ${pv.end}`}
                        </span>
                      )}
                      {/* 막대 오른쪽 이름표 — 작업명 */}
                      {hasBar && !r.summary && !pv && (
                        <span style={{ position: 'absolute', left: x + Math.max(w, milestone ? 12 : 0) + 6, top: 8, fontSize: 10.5, color: t.textMuted, whiteSpace: 'nowrap', pointerEvents: 'none' }}>
                          {r.text}{!prefs.details && r.assignees.length ? ` · ${r.assignees.map((a) => '@' + a).join(' ')}` : ''}
                        </span>
                      )}
                    </div>
                    {prefs.details && (
                      <div style={{ position: 'sticky', right: 0, zIndex: 2, display: 'flex', alignItems: 'center', width: rightW, flexShrink: 0, background: sideBg, borderLeft: `1px solid ${t.border}`, boxShadow: '-4px 0 8px rgba(0,0,0,0.04)' }}>
                        {resizeHandle('detail')}
                        {DETAIL_COLS.map((c) => (
                          <span key={c.key} data-gantt-col={c.key} title={c.key === 'assignee' ? r.assignees.join(', ') : undefined}
                            style={{ ...cell, width: colW(c.weight), textAlign: c.key === 'assignee' ? 'left' : 'center', color: c.key === 'complete' && prog === 100 ? '#2B8A3E' : t.textMuted, fontWeight: c.key === 'complete' && prog === 100 ? 700 : 400 }}>{detail(c.key)}</span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
