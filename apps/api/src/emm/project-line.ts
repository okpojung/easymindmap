// ⚠️ 자동 복사본 — 직접 고치지 마세요.
// 원본: packages/emm-parser/src/project-line.ts
// 갱신: cd apps/api && npm run sync:emm  (CI 가 어긋남을 검사한다)
// 왜 복사하는지는 apps/api/scripts/sync-emm-parser.mjs 머리말 참조.

// 프로젝트 태그 줄 — MD 왕복 (2026-10-23 사용자 결정 "2번").
//
// 노드의 프로젝트 태그(일정·담당자·진척율, model.ts ProjectTags) 중 **노드에 보이게
// 켜 둔 것만** 노드 제목 아래 한 줄로 쓴다. 사람이 읽을 수 있는 모양이고, 불러오기가
// 같은 줄을 다시 프로젝트 태그로 되돌린다(🔗 링크 줄·📎 첨부 줄과 같은 방식).
//
//   📅 2026-10-01 ~ 2026-10-31 · @정미옥 <miok@example.com> · 35%
//
// 조각은 ` · ` 로 나누고 순서는 일정 → 담당자 → 진척율. 각 조각은 없어도 된다.
//   일정    `📅 시작 ~ 끝` · `📅 시작`(하루) · `📅 ~ 끝`(마감만) — 날짜는 언제나 YYYY-MM-DD
//   담당자  `@이름` 또는 `@이름 <이메일>`
//   진척율  `35%` (앱 태그 모양인 `%35` 도 읽는다)
// **줄 전체가 이 모양일 때만** 프로젝트 태그로 읽는다 — 한 조각이라도 어긋나면 보통 글이다.
// 체크를 꺼 둔(노드에 안 보이는) 값은 MD 에 싣지 않는다(화면에 보이는 것만 나간다).
// 일반 태그(`tags`)는 여전히 MD 에 싣지 않는다 — emm-spec.md §노드별 충실도.
import type { ProjectTags } from './model';

const DATE = String.raw`\d{4}-\d{2}-\d{2}`;
const DATE_SEG_RE = new RegExp(String.raw`^📅\s*(${DATE})?\s*(?:(~)\s*(${DATE})?)?$`, 'u');
const ASSIGNEE_SEG_RE = /^@([^\s<>·@][^<>·]*?)(?:\s*<([^<>\s@]+@[^<>\s@]+)>)?$/u;
const PROGRESS_SEG_RE = /^(?:(\d{1,3})\s*%|%\s*(\d{1,3}))$/;

function realDate(v: string | undefined): v is string {
  if (!v || !new RegExp(`^${DATE}$`).test(v)) return false;
  const d = new Date(v + 'T00:00:00Z');
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

function progressOf(v: unknown): number | null {
  const n = typeof v === 'number' ? v : NaN;
  if (!Number.isFinite(n)) return null;
  const r = Math.round(n);
  return r >= 0 && r <= 100 ? r : null;
}

/** 노드에 켜 둔 프로젝트 태그 → MD 한 줄. 보일 게 없으면 null */
export function projectLine(p: ProjectTags | undefined): string | null {
  if (!p) return null;
  const parts: string[] = [];
  if (p.dateOn) {
    const s = realDate(p.start) ? p.start : undefined;
    let e = realDate(p.end) ? p.end : undefined;
    if (s && e && e < s) e = undefined;
    if (s && e && s !== e) parts.push(`📅 ${s} ~ ${e}`);
    else if (s) parts.push(`📅 ${s}`);
    else if (e) parts.push(`📅 ~ ${e}`);
  }
  const name = p.assignee?.name?.replace(/[\s·<>@]+/g, ' ').trim();
  if (p.assigneeOn && name) {
    const email = p.assignee?.email?.trim();
    parts.push(email && /^[^<>\s@]+@[^<>\s@]+$/.test(email) ? `@${name} <${email}>` : `@${name}`);
  }
  if (p.progressOn) {
    const v = progressOf(p.progress);
    if (v !== null) parts.push(`${v}%`);
  }
  return parts.length ? parts.join(' · ') : null;
}

/** MD 한 줄 → 프로젝트 태그. 줄 전체가 프로젝트 태그 모양이 아니면 null */
export function parseProjectLine(text: string): ProjectTags | null {
  const line = text.trim();
  if (!line || line.includes('\n')) return null;
  const segs = line.split(/\s+·\s+/);
  if (segs.length > 3) return null;
  const out: ProjectTags = {};
  let stage = 0; // 일정(1) → 담당자(2) → 진척율(3) 순서만 받는다
  for (const seg of segs) {
    const d = seg.match(DATE_SEG_RE);
    if (d && stage < 1) {
      const [, s, tilde, e] = d;
      if (!s && !e) return null;
      if (s && !realDate(s)) return null;
      if (e && !realDate(e)) return null;
      if (s && e && e < s) return null;
      if (s && tilde && !e) return null; // `📅 2026-10-01 ~` — 끝이 빠진 줄은 보통 글로 둔다
      if (s) out.start = s;
      if (e) out.end = e;
      out.dateOn = true;
      stage = 1;
      continue;
    }
    const a = seg.match(ASSIGNEE_SEG_RE);
    if (a && stage < 2) {
      const name = a[1].trim().slice(0, 60);
      if (!name) return null;
      out.assignee = a[2] ? { name, email: a[2] } : { name };
      out.assigneeOn = true;
      stage = 2;
      continue;
    }
    const g = seg.match(PROGRESS_SEG_RE);
    if (g && stage < 3) {
      const v = Number(g[1] ?? g[2]);
      if (!(v >= 0 && v <= 100)) return null;
      out.progress = v;
      out.progressOn = true;
      stage = 3;
      continue;
    }
    return null;
  }
  return stage ? out : null;
}
