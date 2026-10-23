// 프로젝트 태그 — 일정·담당자·진척율 (2026-10-23 사용자 결정).
//
// 노트·태그 탭의 고정 입력란에서 체크하고 값을 넣으면 노드 아래 태그 줄 맨 앞에
// `📅11-03~11-14` `@정제영` `%50` 순으로 붙는다. 체크를 끄면 태그만 빠지고 값은 남는다.
// 값은 노드의 `project` 칸에 저장한다(일반 태그 `tags` 와 섞지 않는다). Redmine 연계 맵에서는
// 이 값이 Redmine 일감의 시작일·마감일·담당자·진척도와 맞춰진다(연계 단계에서 붙인다).
import type { ProjectTags } from '@/editor/__samples__/types';

export type ProjectChipKind = 'date' | 'assignee' | 'progress';
export interface ProjectChip { kind: ProjectChipKind; label: string }

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/** YYYY-MM-DD 이고 실제로 있는 날짜인가 */
export function isValidDate(v: unknown): v is string {
  if (typeof v !== 'string' || !DATE_RE.test(v)) return false;
  const d = new Date(v + 'T00:00:00Z');
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

/** 진척율 — 0~100 정수만 (자유 입력, 소수는 반올림). 아니면 null */
export function normalizeProgress(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  if (!Number.isFinite(n)) return null;
  const r = Math.round(n);
  return r >= 0 && r <= 100 ? r : null;
}

/** 태그에 쓰는 날짜 — 올해면 MM-DD, 다른 해면 YYYY-MM-DD */
function shortDate(v: string, year: number): string {
  return Number(v.slice(0, 4)) === year ? v.slice(5) : v;
}

/** 일정 글자 — 시작~끝, 하루짜리(같거나 끝이 없음)는 하나만, 끝만 있으면 ~끝 */
export function formatDateRange(start: string | undefined, end: string | undefined, year = new Date().getFullYear()): string {
  const s = isValidDate(start) ? start : undefined;
  const e = isValidDate(end) ? end : undefined;
  if (s && e && s !== e) {
    // 해를 넘기면 둘 다 연도를 적는다
    const y = Number(s.slice(0, 4)) === Number(e.slice(0, 4)) ? year : NaN;
    return `${shortDate(s, y)}~${shortDate(e, y)}`;
  }
  if (s) return shortDate(s, year);
  if (e) return `~${shortDate(e, year)}`;
  return '';
}

/** 노드에 붙일 프로젝트 태그 — 체크된 것 중 값이 올바른 것만, 정해진 순서로 */
export function projectChips(p: ProjectTags | undefined, year = new Date().getFullYear()): ProjectChip[] {
  if (!p) return [];
  const out: ProjectChip[] = [];
  if (p.dateOn) {
    const range = formatDateRange(p.start, p.end, year);
    if (range) out.push({ kind: 'date', label: `📅${range}` });
  }
  if (p.assigneeOn && p.assignee?.name?.trim()) out.push({ kind: 'assignee', label: `@${p.assignee.name.trim()}` });
  if (p.progressOn) {
    const v = normalizeProgress(p.progress);
    if (v !== null) out.push({ kind: 'progress', label: `%${v}` });
  }
  return out;
}

/** 저장 전 정리 — 쓸모없는 칸을 빼고, 남는 게 없으면 undefined */
export function cleanProject(p: ProjectTags | undefined): ProjectTags | undefined {
  if (!p) return undefined;
  const out: ProjectTags = {};
  if (isValidDate(p.start)) out.start = p.start;
  if (isValidDate(p.end)) out.end = p.end;
  if (out.start && out.end && out.start > out.end) delete out.end;
  const name = p.assignee?.name?.trim();
  if (name) {
    out.assignee = { name: name.slice(0, 60) };
    if (p.assignee?.email) out.assignee.email = String(p.assignee.email).trim().slice(0, 254);
    if (Number.isInteger(p.assignee?.redmineUserId) && p.assignee!.redmineUserId! > 0) out.assignee.redmineUserId = p.assignee!.redmineUserId;
  }
  const prog = normalizeProgress(p.progress);
  if (prog !== null) out.progress = prog;
  if (p.dateOn) out.dateOn = true;
  if (p.assigneeOn) out.assigneeOn = true;
  if (p.progressOn) out.progressOn = true;
  return Object.keys(out).length ? out : undefined;
}
