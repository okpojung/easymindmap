// 작업 목록 — 전체 작업 · 담당자별 · 내 작업 (2026-11-08 사용자 요청).
//
//   [전체 12] [나 3] [정제영 4] [김철수 2] … [담당자 없음 1]   상태: [모든 상태 ▾]   ☐ 담당자별로 묶기
//   작업(상위 경로) | 담당자 | 시작 | 끝 | 진척 | 상태
//
// 일정·담당자·진척 중 하나라도 적힌 노드가 작업이다. 줄을 누르면 맵에서 그 노드를 보여 준다.
// [나]는 지금 계정의 이메일(또는 이름)과 담당자를 맞춰 본다 — 담당자를 주소록에서 고르면 이메일이 함께 들어간다.
import { useMemo, useState } from 'react';
import type { ThemeTokens } from '@/components/design-tokens/theme';
import { useTr } from '@/i18n';
import { isMine, taskStatus, todayStr, type TaskItem, type TaskStatus } from './ganttModel';

const STATUS_COLOR: Record<TaskStatus, { bg: string; fg: string }> = {
  done: { bg: '#E3F5E8', fg: '#1E7B3A' },
  late: { bg: '#FDE7E5', fg: '#B42318' },
  doing: { bg: '#FFF1DE', fg: '#B5560B' },
  todo: { bg: '#E8F0FD', fg: '#2558B5' },
  nodate: { bg: '#EEEEEE', fg: '#666666' },
};
const STATUS_ORDER: TaskStatus[] = ['late', 'doing', 'todo', 'done', 'nodate'];
const UNASSIGNED = '\u0000none';
const ME = '\u0000me';
const ALL = '\u0000all';

function shortDate(v: string | undefined, year: number): string {
  if (!v) return '';
  return +v.slice(0, 4) === year ? v.slice(5).replace('-', '/') : v.replace(/-/g, '/');
}

export function TaskListView({ t, tasks, selectedId, onSelect, me }: {
  t: ThemeTokens;
  tasks: TaskItem[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  me?: { name?: string; email?: string } | null;
}) {
  const tr = useTr();
  const today = todayStr();
  const year = new Date().getFullYear();
  const [who, setWho] = useState<string>(ALL);
  const [status, setStatus] = useState<TaskStatus | 'all'>('all');
  const [grouped, setGrouped] = useState(false);

  // 담당자 목록과 사람마다 작업 수
  const people = useMemo(() => {
    const m = new Map<string, number>();
    let none = 0;
    for (const k of tasks) {
      if (!k.assignees.length) none++;
      for (const a of k.assignees) m.set(a.name, (m.get(a.name) ?? 0) + 1);
    }
    return { list: [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])), none };
  }, [tasks]);
  const mineCount = useMemo(() => tasks.filter((k) => isMine(k, me)).length, [tasks, me]);

  const sorted = useMemo(() => [...tasks].sort((a, b) => {
    const as = a.start ?? a.end ?? '9999';
    const bs = b.start ?? b.end ?? '9999';
    return as < bs ? -1 : as > bs ? 1 : 0;
  }), [tasks]);
  const pass = (k: TaskItem) => {
    if (status !== 'all' && taskStatus(k, today) !== status) return false;
    if (who === ALL) return true;
    if (who === ME) return isMine(k, me);
    if (who === UNASSIGNED) return k.assignees.length === 0;
    return k.assignees.some((a) => a.name === who);
  };
  const shown = sorted.filter(pass);
  const groups: { key: string; label: string; items: TaskItem[] }[] = grouped
    ? [
        ...people.list.map(([name]) => ({ key: name, label: '@' + name, items: shown.filter((k) => k.assignees.some((a) => a.name === name)) })),
        { key: UNASSIGNED, label: tr('editor.gantt.unassigned'), items: shown.filter((k) => !k.assignees.length) },
      ].filter((g) => g.items.length)
    : [{ key: '', label: '', items: shown }];

  const chip = (key: string, label: string, n: number) => (
    <button key={key} type="button" data-testid="task-filter" data-on={who === key ? '1' : undefined} onClick={() => setWho(key)} style={{
      fontSize: 11.5, padding: '3px 9px', borderRadius: 12, cursor: 'pointer', whiteSpace: 'nowrap',
      border: `1px solid ${who === key ? t.primaryBorder : t.border}`,
      background: who === key ? t.primarySoft : t.surface, color: who === key ? t.primary : t.text, fontWeight: who === key ? 700 : 500,
    }}>{label} <span style={{ color: t.textMuted, fontWeight: 500 }}>{n}</span></button>
  );
  const head: React.CSSProperties = { position: 'sticky', top: 0, background: t.surfaceAlt, zIndex: 1, textAlign: 'left', fontWeight: 700, color: t.textMuted, fontSize: 11.5, padding: '7px 8px', borderBottom: `1px solid ${t.border}`, whiteSpace: 'nowrap' };
  const td: React.CSSProperties = { padding: '6px 8px', fontSize: 12, borderBottom: `1px solid ${t.divider}`, verticalAlign: 'top' };

  return (
    <div data-testid="task-list" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 10px', borderBottom: `1px solid ${t.divider}`, flexWrap: 'wrap', flexShrink: 0 }}>
        {chip(ALL, tr('editor.gantt.all'), tasks.length)}
        {me && (me.email || me.name) ? chip(ME, tr('editor.gantt.me'), mineCount) : null}
        {people.list.map(([name, n]) => chip(name, '@' + name, n))}
        {people.none > 0 && chip(UNASSIGNED, tr('editor.gantt.unassigned'), people.none)}
        <span style={{ flex: 1 }} />
        <select data-testid="task-status" value={status} onChange={(e) => setStatus(e.target.value as TaskStatus | 'all')} style={{ fontSize: 11.5, padding: '3px 6px', borderRadius: 6, border: `1px solid ${t.border}`, background: t.surface, color: t.text }}>
          <option value="all">{tr('editor.gantt.statusAll')}</option>
          {STATUS_ORDER.map((st) => <option key={st} value={st}>{tr(`editor.gantt.status.${st}`)}</option>)}
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11.5, cursor: 'pointer', color: t.text }}>
          <input type="checkbox" data-testid="task-group" checked={grouped} onChange={(e) => setGrouped(e.target.checked)} />
          {tr('editor.gantt.groupByAssignee')}
        </label>
      </div>
      {tasks.length === 0 ? (
        <div data-testid="task-empty" style={{ padding: 18, fontSize: 12.5, color: t.textMuted, lineHeight: 1.6 }}>{tr('editor.gantt.tasksEmpty')}</div>
      ) : (
        <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 640 }}>
            <thead>
              <tr>
                <th style={{ ...head, width: '38%' }}>{tr('editor.gantt.task')}</th>
                <th style={head}>{tr('editor.gantt.assignee')}</th>
                <th style={head}>{tr('editor.gantt.start')}</th>
                <th style={head}>{tr('editor.gantt.end')}</th>
                <th style={{ ...head, width: 110 }}>{tr('editor.gantt.progress')}</th>
                <th style={head}>{tr('editor.gantt.statusCol')}</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => [
                g.label ? (
                  <tr key={`g:${g.key}`}><td colSpan={6} style={{ ...td, background: t.surfaceAlt, fontWeight: 700, color: t.text }}>{g.label} <span style={{ color: t.textMuted, fontWeight: 500 }}>{g.items.length}</span></td></tr>
                ) : null,
                ...g.items.map((k) => {
                  const st = taskStatus(k, today);
                  const sel = selectedId === k.id;
                  return (
                    <tr key={`${g.key}:${k.id}`} data-testid="task-row" data-task-id={k.id} onClick={() => onSelect?.(k.id)}
                      style={{ cursor: onSelect ? 'pointer' : 'default', background: sel ? t.primarySoft : undefined }}>
                      <td style={td}>
                        <div style={{ fontWeight: 600, color: sel ? t.primary : t.text }}>{k.text}</div>
                        {k.path && <div style={{ fontSize: 10.5, color: t.textSubtle, marginTop: 1 }}>{k.path}</div>}
                      </td>
                      <td style={{ ...td, color: t.textMuted }}>{k.assignees.map((a) => '@' + a.name).join(', ')}</td>
                      <td style={{ ...td, color: t.textMuted, whiteSpace: 'nowrap' }}>{shortDate(k.start, year)}</td>
                      <td style={{ ...td, color: t.textMuted, whiteSpace: 'nowrap' }}>{shortDate(k.end, year)}</td>
                      <td style={td}>
                        {k.progress != null && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <div style={{ flex: 1, height: 6, borderRadius: 3, background: t.divider, overflow: 'hidden' }}>
                              <div style={{ width: `${k.progress}%`, height: '100%', background: '#E0782A' }} />
                            </div>
                            <span style={{ fontSize: 11, color: t.textMuted, width: 32, textAlign: 'right' }}>{k.progress}%</span>
                          </div>
                        )}
                      </td>
                      <td style={td}>
                        <span data-testid="task-status-badge" style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 7px', borderRadius: 9, background: STATUS_COLOR[st].bg, color: STATUS_COLOR[st].fg, whiteSpace: 'nowrap' }}>{tr(`editor.gantt.status.${st}`)}</span>
                      </td>
                    </tr>
                  );
                }),
              ])}
              {shown.length === 0 && (
                <tr><td colSpan={6} style={{ ...td, color: t.textMuted, padding: 16 }}>{tr('editor.gantt.noMatch')}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
