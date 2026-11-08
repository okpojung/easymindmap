// 간트 차트 자료 (2026-11-07 사용자 요청: "Redmine 의 간트가 아니라 EMM 에서 직접 간트 창을").
//
// 노드의 프로젝트 태그(일정 📅·담당자 @·진척 %)로 줄을 만든다. 체크(노드에 보이기)와 상관없이
// **값이 있으면** 싣는다 — 간트는 일정표라 노드 태그를 꺼 둔 일정도 보여야 한다.
//   · 일정이 있는 노드 → 막대 (시작만 있으면 하루, 끝만 있으면 마감일 하루)
//   · 일정은 없지만 아래에 일정이 있는 노드 → 요약 막대(하위 일정의 처음~끝)
//   · 둘 다 아니면 줄을 만들지 않는다
// 순서·들여쓰기는 맵의 트리 그대로(중심주제마다).
import type { MindNode, SampleMap } from '@/editor/__samples__/types';
import { mapCenters } from '@/editor/__samples__/types';
import { assigneeList, isValidDate, normalizeProgress } from '@/editor/node-renderer/projectTags';
import { nodeFirstLine } from '@/utils/variables/mapVariables';

export interface GanttRow {
  id: string;
  text: string;
  depth: number;
  /** 이 노드에 적힌 일정 (YYYY-MM-DD) */
  start?: string;
  end?: string;
  /** 그리는 막대 — 처음·끝(끝 포함). 요약 줄이면 하위 일정의 범위. 일정이 전혀 없는 줄이면 없다 */
  barStart?: string;
  barEnd?: string;
  /** 자기 일정은 없고 아래에 일정이 있다 (요약 막대) */
  summary: boolean;
  /** 이 노드에 일정이 적혀 있다 (📅) — 기본 보기는 이 줄만 보인다 */
  dated: boolean;
  /** 1레벨 가지 번호 (막대 색) */
  branch: number;
  /** 노드에 시작일·끝일이 실제로 적혀 있나 — 끌어 옮길 때 없는 쪽은 만들지 않는다 */
  hasStart: boolean;
  hasEnd: boolean;
  progress?: number;
  assignees: string[];
  /** 아래에 줄이 있다 (접기 단추) */
  hasChildren: boolean;
  parentId?: string;
}

export interface TaskAssignee { name: string; email?: string }
/** 작업 목록 한 줄 — 일정·담당자·진척 중 하나라도 적힌 노드 */
export interface TaskItem {
  id: string;
  text: string;
  /** 상위 노드 제목들 (중심주제부터) */
  path: string;
  start?: string;
  end?: string;
  progress?: number;
  assignees: TaskAssignee[];
}

export interface GanttData { rows: GanttRow[]; min?: string; max?: string; tasks: TaskItem[] }

function plainTitle(text: string): string {
  const line = nodeFirstLine(String(text ?? '')).replace(/\*\*|__|~~|==|`/g, '').trim();
  return line || '—';
}

export function buildGanttRows(map: SampleMap): GanttData {
  const rows: (GanttRow | null)[] = [];
  let min: string | undefined;
  let max: string | undefined;
  // ★ 모든 노드를 줄로 만든다 (2026-11-08) — 기본 보기는 일정 있는 줄만, [일정 없는 노드도 보기] 를 켜면 전부
  const walk = (n: MindNode, depth: number, branch: number, parentId?: string): { s?: string; e?: string } => {
    const p = n.project;
    const hasStart = isValidDate(p?.start);
    const hasEnd = isValidDate(p?.end);
    let s = isValidDate(p?.start) ? p!.start : undefined;
    let e = isValidDate(p?.end) ? p!.end : undefined;
    if (s && e && e < s) e = s;
    if (s && !e) e = s;
    if (e && !s) s = e;
    const at = rows.length;
    // 자리만 먼저 잡고(트리 순서), 자식을 본 뒤에 채운다
    rows.push(null);
    let cs: string | undefined;
    let ce: string | undefined;
    let kids = 0;
    ((n.children ?? []) as MindNode[]).forEach((c, k) => {
      const before = rows.length;
      const r = walk(c, depth + 1, depth === 0 ? k : branch, n.id);
      if (rows.length > before) kids++;
      if (r.s && (!cs || r.s < cs)) cs = r.s;
      if (r.e && (!ce || r.e > ce)) ce = r.e;
    });
    const barStart = s ?? cs;
    const barEnd = e ?? ce;
    const prog = normalizeProgress(p?.progress);
    rows[at] = {
      id: n.id,
      text: plainTitle(n.text),
      depth,
      ...(s ? { start: s, end: e } : {}),
      ...(barStart && barEnd ? { barStart, barEnd } : {}),
      summary: !s && !!cs,
      dated: !!s,
      branch,
      hasStart, hasEnd,
      ...(prog !== null ? { progress: prog } : {}),
      assignees: assigneeList(p).map((a) => a.name),
      hasChildren: kids > 0,
      ...(parentId ? { parentId } : {}),
    };
    if (barStart && (!min || barStart < min)) min = barStart;
    if (barEnd && (!max || barEnd > max)) max = barEnd;
    const lo = s && cs ? (s < cs ? s : cs) : s ?? cs;
    const hi = e && ce ? (e > ce ? e : ce) : e ?? ce;
    return { s: lo, e: hi };
  };
  const tasks: TaskItem[] = [];
  const collect = (n: MindNode, path: string[]) => {
    const p = n.project;
    const people = assigneeList(p).map((a) => (a.email ? { name: a.name, email: a.email } : { name: a.name }));
    const prog = normalizeProgress(p?.progress);
    const s = isValidDate(p?.start) ? p!.start : undefined;
    let e = isValidDate(p?.end) ? p!.end : undefined;
    if (s && e && e < s) e = s;
    if (s || e || people.length || prog !== null) {
      tasks.push({
        id: n.id, text: plainTitle(n.text), path: path.join(' › '),
        ...(s ? { start: s } : {}), ...(e ? { end: e } : {}),
        ...(prog !== null ? { progress: prog } : {}),
        assignees: people,
      });
    }
    const next = [...path, plainTitle(n.text)];
    for (const c of (n.children ?? []) as MindNode[]) collect(c, next);
  };
  for (const c of mapCenters(map)) {
    const root = { ...(c.root as MindNode), children: c.branches as MindNode[] };
    walk(root, 0, 0);
    collect(root, []);
  }
  return { rows: rows as GanttRow[], min, max, tasks };
}

// --- 날짜 계산 (UTC 자정 기준 — 시간대에 흔들리지 않게) ---------------------------
const DAY = 86400000;
export function dayNum(v: string): number { return Math.round(Date.UTC(+v.slice(0, 4), +v.slice(5, 7) - 1, +v.slice(8, 10)) / DAY); }
export function dayStr(n: number): string { return new Date(n * DAY).toISOString().slice(0, 10); }
/** 오늘 (사용자 시간대의 날짜) */
export function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
/** 0=일 … 6=토 */
export function weekday(n: number): number { return new Date(n * DAY).getUTCDay(); }

/** 막대를 끌었을 때 바뀌는 날짜 — 'move' 통째로, 'start'·'end' 한쪽 끝. 날짜 수(delta)만큼 */
export function draggedDates(r: Pick<GanttRow, 'barStart' | 'barEnd' | 'hasStart' | 'hasEnd'>, mode: 'move' | 'start' | 'end', delta: number): { start?: string; end?: string } {
  if (!r.barStart || !r.barEnd) return {};
  const s = dayNum(r.barStart);
  const e = dayNum(r.barEnd);
  if (mode === 'move') {
    return {
      ...(r.hasStart || !r.hasEnd ? { start: dayStr(s + delta) } : {}),
      ...(r.hasEnd ? { end: dayStr(e + delta) } : {}),
    };
  }
  if (mode === 'start') return { start: dayStr(Math.min(s + delta, e)), ...(r.hasEnd ? {} : { end: dayStr(e) }) };
  return { end: dayStr(Math.max(e + delta, s)), ...(r.hasStart ? {} : { start: dayStr(s) }) };
}

export type TaskStatus = 'done' | 'late' | 'doing' | 'todo' | 'nodate';
/** 작업 상태 — 진척 100 이면 완료, 끝이 지났으면 지연, 오늘이 기간 안이면 진행 중, 아직이면 예정 */
export function taskStatus(t: Pick<TaskItem, 'start' | 'end' | 'progress'>, today: string): TaskStatus {
  if (t.progress === 100) return 'done';
  const s = t.start ?? t.end;
  const e = t.end ?? t.start;
  if (!s || !e) return 'nodate';
  if (e < today) return 'late';
  if (s <= today) return 'doing';
  return 'todo';
}

/** 이 작업이 그 사람 것인가 — 이메일이 같거나(대소문자 무시) 이름이 같다 */
export function isMine(t: Pick<TaskItem, 'assignees'>, me: { name?: string; email?: string } | null | undefined): boolean {
  if (!me) return false;
  const em = me.email?.trim().toLowerCase();
  const nm = me.name?.trim();
  return t.assignees.some((a) => (em && a.email?.trim().toLowerCase() === em) || (nm && a.name === nm));
}
