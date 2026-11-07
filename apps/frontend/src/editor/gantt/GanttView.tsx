// 간트 차트 화면 (2026-11-07) — 편집 영역 아래 칸·새 탭·새 창이 같은 화면을 쓴다.
//
//   [작업 | 담당자 | 시작 | 끝 | 진척]  |  날짜 눈금 ── 막대
//
// 왼쪽 칸은 가로 스크롤해도 붙어 있고(sticky), 머리글은 세로 스크롤해도 붙어 있다.
// 막대·줄을 누르면 onSelect(노드 id) — 편집 창이 맵에서 그 노드를 찾아 보여 준다.
// 고치기(일정 끌기 등)는 하지 않는다 — 값은 노드의 프로젝트 태그 하나에만 있다(두 곳에서 고치면 어긋난다).
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { ThemeTokens } from '@/components/design-tokens/theme';
import { useTr } from '@/i18n';
import { dayNum, dayStr, todayStr, weekday, type GanttData, type GanttRow } from './ganttModel';

type Scale = 'day' | 'week' | 'month';
const DAY_W: Record<Scale, number> = { day: 26, week: 9, month: 3.2 };
const ROW_H = 28;
const HEAD_H = 44;
const COLS = { task: 240, assignee: 120, start: 82, end: 82, progress: 52 };
const LEFT_W = COLS.task + COLS.assignee + COLS.start + COLS.end + COLS.progress;

function shortDate(v: string | undefined, year: number): string {
  if (!v) return '';
  return +v.slice(0, 4) === year ? v.slice(5).replace('-', '/') : v.slice(2).replace(/-/g, '/');
}

export function GanttView({ t, data, selectedId, onSelect, toolbar, fill }: {
  t: ThemeTokens;
  data: GanttData;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  /** 머리줄 오른쪽에 붙일 단추들 (닫기·새 탭 등) */
  toolbar?: ReactNode;
  /** 부모 높이를 꽉 채운다 */
  fill?: boolean;
}) {
  const tr = useTr();
  const [scale, setScale] = useState<Scale>('day');
  const [folded, setFolded] = useState<Set<string>>(() => new Set());
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const year = new Date().getFullYear();
  const today = todayStr();

  // 접힌 줄의 자손은 숨긴다
  const visible = useMemo(() => {
    const out: GanttRow[] = [];
        let hideDepth = Infinity;
    for (const r of data.rows) {
      if (r.depth > hideDepth) continue;
      hideDepth = Infinity;
      out.push(r);
      if (folded.has(r.id) && r.hasChildren) hideDepth = r.depth;
    }
    return out;
  }, [data.rows, folded]);

  // 날짜 범위 — 앞 3일, 뒤 10일 여유. 주·월 눈금이면 월요일/1일에 맞춘다
  const range = useMemo(() => {
    if (!data.min || !data.max) return null;
    let a = Math.min(dayNum(data.min), dayNum(today)) - 3;
    let b = Math.max(dayNum(data.max), dayNum(today)) + 10;
    if (scale !== 'day') { while (weekday(a) !== 1) a--; }
    if (scale === 'month') { a = dayNum(dayStr(a).slice(0, 8) + '01'); const e = dayStr(b); b = dayNum(e.slice(0, 8) + '28') + 4; }
    return { a, b, days: b - a + 1 };
  }, [data.min, data.max, scale, today]);
  const dw = DAY_W[scale];
  const timelineW = range ? range.days * dw : 0;

  // 처음 열 때(와 눈금을 바꿀 때) 오늘 근처로
  const scrollToDay = (d: string) => {
    const el = scrollRef.current;
    if (!el || !range) return;
    const x = (dayNum(d) - range.a) * dw;
    el.scrollLeft = Math.max(0, x - (el.clientWidth - LEFT_W) / 3);
  };
  useEffect(() => {
    if (!range) return;
    const first = data.min && dayNum(data.min) > dayNum(today) ? data.min : today;
    scrollToDay(first);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scale, !!range]);

  // 머리글 눈금
  const ticks = useMemo(() => {
    if (!range) return { top: [] as { x: number; w: number; label: string }[], bottom: [] as { x: number; w: number; label: string; weekend?: boolean; today?: boolean }[] };
    const top: { x: number; w: number; label: string }[] = [];
    const bottom: { x: number; w: number; label: string; weekend?: boolean; today?: boolean }[] = [];
    let curKey = '';
    for (let d = range.a; d <= range.b; d++) {
      const s = dayStr(d);
      const key = scale === 'month' ? s.slice(0, 4) : s.slice(0, 7);
      if (key !== curKey) {
        top.push({ x: (d - range.a) * dw, w: 0, label: scale === 'month' ? key : `${s.slice(0, 4)}.${s.slice(5, 7)}` });
        curKey = key;
      }
      if (scale === 'day') {
        const wd = weekday(d);
        bottom.push({ x: (d - range.a) * dw, w: dw, label: String(+s.slice(8, 10)), weekend: wd === 0 || wd === 6, today: s === today });
      } else if (scale === 'week' && weekday(d) === 1) {
        bottom.push({ x: (d - range.a) * dw, w: dw * 7, label: `${+s.slice(5, 7)}/${+s.slice(8, 10)}` });
      } else if (scale === 'month' && s.slice(8, 10) === '01') {
        bottom.push({ x: (d - range.a) * dw, w: 0, label: s.slice(5, 7) });
      }
    }
    for (let i = 0; i < top.length; i++) top[i].w = (i + 1 < top.length ? top[i + 1].x : timelineW) - top[i].x;
    if (scale === 'month') for (let i = 0; i < bottom.length; i++) bottom[i].w = (i + 1 < bottom.length ? bottom[i + 1].x : timelineW) - bottom[i].x;
    return { top, bottom };
  }, [range, scale, dw, timelineW, today, year]);

  const btn = (on: boolean): React.CSSProperties => ({
    fontSize: 11.5, padding: '3px 9px', borderRadius: 6, cursor: 'pointer',
    border: `1px solid ${on ? t.primaryBorder : t.border}`,
    background: on ? t.primarySoft : t.surface, color: on ? t.primary : t.text, fontWeight: on ? 700 : 500,
  });
  const cell: React.CSSProperties = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '0 6px', fontSize: 11.5, flexShrink: 0 };
  const accent = '#E0782A';

  return (
    <div data-testid="gantt-view" style={{ display: 'flex', flexDirection: 'column', height: fill ? '100%' : undefined, minHeight: 0, background: t.surface, color: t.text }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderBottom: `1px solid ${t.divider}`, background: t.surfaceAlt, flexShrink: 0, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12.5, fontWeight: 700 }}>{tr('editor.gantt.title')}</span>
        <span style={{ fontSize: 11, color: t.textMuted }}>{data.rows.length ? `· ${data.rows.length}` : ''}</span>
        <div style={{ display: 'flex', gap: 3, marginLeft: 8 }}>
          {(['day', 'week', 'month'] as Scale[]).map((s) => (
            <button key={s} type="button" data-testid={`gantt-scale-${s}`} style={btn(scale === s)} onClick={() => setScale(s)}>{tr(`editor.gantt.${s}`)}</button>
          ))}
          <button type="button" data-testid="gantt-today" style={btn(false)} onClick={() => scrollToDay(today)}>{tr('editor.gantt.today')}</button>
        </div>
        <span style={{ flex: 1, minWidth: 8, fontSize: 10.5, color: t.textSubtle, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tr('editor.gantt.hint')}</span>
        {toolbar}
      </div>

      {!range ? (
        <div data-testid="gantt-empty" style={{ padding: 18, fontSize: 12.5, color: t.textMuted, lineHeight: 1.6 }}>{tr('editor.gantt.empty')}</div>
      ) : (
        <div ref={scrollRef} data-testid="gantt-scroll" style={{ flex: 1, minHeight: 0, overflow: 'auto', position: 'relative' }}>
          <div style={{ width: LEFT_W + timelineW, position: 'relative' }}>
            {/* 머리글 */}
            <div style={{ position: 'sticky', top: 0, zIndex: 3, display: 'flex', height: HEAD_H, background: t.surfaceAlt, borderBottom: `1px solid ${t.border}` }}>
              <div style={{ position: 'sticky', left: 0, zIndex: 4, display: 'flex', alignItems: 'flex-end', width: LEFT_W, flexShrink: 0, background: t.surfaceAlt, borderRight: `1px solid ${t.border}`, paddingBottom: 6, fontWeight: 700, color: t.textMuted }}>
                <span style={{ ...cell, width: COLS.task }}>{tr('editor.gantt.task')}</span>
                <span style={{ ...cell, width: COLS.assignee }}>{tr('editor.gantt.assignee')}</span>
                <span style={{ ...cell, width: COLS.start }}>{tr('editor.gantt.start')}</span>
                <span style={{ ...cell, width: COLS.end }}>{tr('editor.gantt.end')}</span>
                <span style={{ ...cell, width: COLS.progress, textAlign: 'right' }}>{tr('editor.gantt.progress')}</span>
              </div>
              <div style={{ position: 'relative', width: timelineW, flexShrink: 0 }}>
                {ticks.top.map((k) => (
                  <div key={`t${k.x}`} style={{ position: 'absolute', left: k.x, top: 0, width: k.w, height: 20, borderLeft: `1px solid ${t.border}`, fontSize: 11, fontWeight: 700, padding: '3px 5px', boxSizing: 'border-box', overflow: 'hidden', whiteSpace: 'nowrap' }}>{k.w >= 48 ? k.label : ''}</div>
                ))}
                {ticks.bottom.map((k) => (
                  <div key={`b${k.x}`} style={{ position: 'absolute', left: k.x, top: 20, width: k.w || undefined, height: 24, borderLeft: `1px solid ${t.divider}`, fontSize: 10, textAlign: scale === 'day' ? 'center' : 'left', padding: scale === 'day' ? '5px 0' : '5px 4px', boxSizing: 'border-box', color: k.today ? '#fff' : k.weekend ? '#C0392B' : t.textMuted, background: k.today ? accent : undefined, fontWeight: k.today ? 700 : 400, whiteSpace: 'nowrap', overflow: 'hidden' }}>{scale === 'month' && k.w < 18 ? '' : k.label}</div>
                ))}
              </div>
            </div>

            {/* 본문 — 주말 음영·오늘 선은 한 번만 그린다 */}
            <div style={{ position: 'relative' }}>
              <div aria-hidden="true" style={{ position: 'absolute', left: LEFT_W, top: 0, width: timelineW, height: visible.length * ROW_H, pointerEvents: 'none' }}>
                {scale === 'day' && ticks.bottom.filter((k) => k.weekend).map((k) => (
                  <div key={`w${k.x}`} style={{ position: 'absolute', left: k.x, top: 0, width: k.w, height: '100%', background: t.surfaceAlt, opacity: 0.7 }} />
                ))}
                {dayNum(today) >= range.a && dayNum(today) <= range.b && (
                  <div data-testid="gantt-today-line" style={{ position: 'absolute', left: (dayNum(today) - range.a) * dw + dw / 2, top: 0, width: 2, height: '100%', background: accent, opacity: 0.75 }} />
                )}
              </div>
              {visible.map((r) => {
                const sel = selectedId === r.id;
                const x = (dayNum(r.barStart) - range.a) * dw;
                const w = Math.max(dw, (dayNum(r.barEnd) - dayNum(r.barStart) + 1) * dw);
                const prog = r.progress ?? 0;
                return (
                  <div key={r.id} data-testid="gantt-row" data-gantt-id={r.id}
                    onClick={() => onSelect?.(r.id)}
                    style={{ display: 'flex', height: ROW_H, borderBottom: `1px solid ${t.divider}`, cursor: onSelect ? 'pointer' : 'default', background: sel ? t.primarySoft : undefined, position: 'relative' }}>
                    <div style={{ position: 'sticky', left: 0, zIndex: 2, display: 'flex', alignItems: 'center', width: LEFT_W, flexShrink: 0, background: sel ? t.primarySoft : t.surface, borderRight: `1px solid ${t.border}` }}>
                      <span style={{ ...cell, width: COLS.task, display: 'flex', alignItems: 'center', gap: 3, paddingLeft: 6 + r.depth * 14, fontWeight: r.summary || r.depth === 0 ? 700 : 500, color: sel ? t.primary : t.text }} title={r.text}>
                        {r.hasChildren ? (
                          <button type="button" aria-label={folded.has(r.id) ? '+' : '-'}
                            onClick={(e) => { e.stopPropagation(); setFolded((f) => { const n = new Set(f); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n; }); }}
                            style={{ border: 'none', background: 'transparent', color: t.textMuted, cursor: 'pointer', width: 14, padding: 0, fontSize: 10, flexShrink: 0 }}>{folded.has(r.id) ? '▸' : '▾'}</button>
                        ) : <span style={{ width: 14, flexShrink: 0 }} />}
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.text}</span>
                      </span>
                      <span style={{ ...cell, width: COLS.assignee, color: t.textMuted }} title={r.assignees.join(', ')}>{r.assignees.join(', ')}</span>
                      <span style={{ ...cell, width: COLS.start, color: t.textMuted }}>{shortDate(r.summary ? r.barStart : r.start, year)}</span>
                      <span style={{ ...cell, width: COLS.end, color: t.textMuted }}>{shortDate(r.summary ? r.barEnd : r.end, year)}</span>
                      <span style={{ ...cell, width: COLS.progress, textAlign: 'right', color: t.textMuted }}>{r.progress != null ? `${r.progress}%` : ''}</span>
                    </div>
                    <div style={{ position: 'relative', width: timelineW, flexShrink: 0 }}>
                      {r.summary ? (
                        <div data-testid="gantt-bar" title={`${tr('editor.gantt.summary')} · ${r.barStart} ~ ${r.barEnd}`} style={{ position: 'absolute', left: x, top: 10, width: w, height: 7, background: t.textMuted, borderRadius: 2 }}>
                          <span style={{ position: 'absolute', left: 0, top: 5, borderLeft: '4px solid transparent', borderRight: '4px solid transparent', borderTop: `5px solid ${t.textMuted}` }} />
                          <span style={{ position: 'absolute', right: 0, top: 5, borderLeft: '4px solid transparent', borderRight: '4px solid transparent', borderTop: `5px solid ${t.textMuted}` }} />
                        </div>
                      ) : (
                        <div data-testid="gantt-bar" title={`${r.text} · ${r.barStart}${r.barEnd !== r.barStart ? ' ~ ' + r.barEnd : ''}${r.assignees.length ? ' · @' + r.assignees.join(', @') : ''}${r.progress != null ? ' · ' + r.progress + '%' : ''}`}
                          style={{ position: 'absolute', left: x, top: 6, width: w, height: 16, borderRadius: 4, background: sel ? '#F4B183' : '#F8CBAD', border: `1px solid ${accent}`, boxSizing: 'border-box', overflow: 'hidden' }}>
                          <div style={{ width: `${prog}%`, height: '100%', background: accent, opacity: 0.85 }} />
                        </div>
                      )}
                      {/* 막대 오른쪽 이름표 — 담당자 */}
                      {!r.summary && r.assignees.length > 0 && (
                        <span style={{ position: 'absolute', left: x + w + 6, top: 7, fontSize: 10.5, color: t.textMuted, whiteSpace: 'nowrap' }}>{r.assignees.map((a) => '@' + a).join(' ')}</span>
                      )}
                    </div>
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
