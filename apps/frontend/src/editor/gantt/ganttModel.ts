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
  /** 그리는 막대 — 처음·끝(끝 포함). 요약 줄이면 하위 일정의 범위 */
  barStart: string;
  barEnd: string;
  summary: boolean;
  progress?: number;
  assignees: string[];
  /** 아래에 간트 줄이 있다 (접기 단추) */
  hasChildren: boolean;
  parentId?: string;
}

export interface GanttData { rows: GanttRow[]; min?: string; max?: string }

function plainTitle(text: string): string {
  const line = nodeFirstLine(String(text ?? '')).replace(/\*\*|__|~~|==|`/g, '').trim();
  return line || '—';
}

export function buildGanttRows(map: SampleMap): GanttData {
  const rows: (GanttRow | null)[] = [];
  let min: string | undefined;
  let max: string | undefined;
  const walk = (n: MindNode, depth: number, parentId?: string): { s?: string; e?: string } => {
    const p = n.project;
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
    for (const c of (n.children ?? []) as MindNode[]) {
      const before = rows.length;
      const r = walk(c, depth + 1, n.id);
      if (rows.length > before) kids++;
      if (r.s && (!cs || r.s < cs)) cs = r.s;
      if (r.e && (!ce || r.e > ce)) ce = r.e;
    }
    if (!s && !cs) { rows.splice(at, 1); return {}; }
    const barStart = s ?? cs!;
    const barEnd = e ?? ce!;
    const prog = normalizeProgress(p?.progress);
    rows[at] = {
      id: n.id,
      text: plainTitle(n.text),
      depth,
      ...(s ? { start: s, end: e } : {}),
      barStart, barEnd,
      summary: !s,
      ...(prog !== null ? { progress: prog } : {}),
      assignees: assigneeList(p).map((a) => a.name),
      hasChildren: kids > 0,
      ...(parentId ? { parentId } : {}),
    };
    if (!min || barStart < min) min = barStart;
    if (!max || barEnd > max) max = barEnd;
    const lo = s && cs ? (s < cs ? s : cs) : s ?? cs;
    const hi = e && ce ? (e > ce ? e : ce) : e ?? ce;
    return { s: lo, e: hi };
  };
  for (const c of mapCenters(map)) {
    walk({ ...(c.root as MindNode), children: c.branches as MindNode[] }, 0);
  }
  return { rows: rows as GanttRow[], min, max };
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
