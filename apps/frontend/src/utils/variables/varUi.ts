// 노드 글자 속 [&이름] 의 화면 도우미 (2026-10-29)
//   · varSegs — 인라인 서식 조각을 더 잘게: [&이름] 부분에 v='k'(등록된 변수)·'u'(등록 안 됨) 표시
//   · varQueryAt — 입력 중인 [&… 자리 (자동완성)
import type { InlineSeg } from '@/editor/node-renderer/inlineMarks';
import { varRe } from './varSyntax';

export type VarSeg = InlineSeg & { v?: 'k' | 'u' };

export function varSegs(segs: InlineSeg[], known: ReadonlySet<string>): VarSeg[] {
  if (!segs.some((s) => !s.c && s.text.includes('[&'))) return segs;
  const out: VarSeg[] = [];
  for (const s of segs) {
    if (s.c || !s.text.includes('[&')) { out.push(s); continue; }
    let last = 0;
    for (const m of s.text.matchAll(varRe())) {
      const at = m.index ?? 0;
      if (at > last) out.push({ ...s, text: s.text.slice(last, at) });
      out.push({ ...s, text: m[0], v: known.has(m[1]) ? 'k' : 'u' });
      last = at + m[0].length;
    }
    if (last < s.text.length) out.push({ ...s, text: s.text.slice(last) });
  }
  return out;
}

/** 커서 앞이 `[&부분이름` 이면 그 시작 위치와 부분 이름 — 아니면 null */
export function varQueryAt(text: string, caret: number): { start: number; q: string } | null {
  const before = text.slice(0, caret);
  const m = /\[&([A-Za-z0-9_.\uAC00-\uD7A3]*)$/.exec(before);
  if (!m) return null;
  // 코드블럭 안이면 제안하지 않는다
  const fences = (before.match(/^\s*```/gm) ?? []).length;
  if (fences % 2 === 1) return null;
  return { start: before.length - m[0].length, q: m[1] };
}

/** 고르기 목록 — 앞글자 일치 먼저, 그다음 포함 (대소문자 무시) */
export function varSuggestions(names: readonly string[], q: string): string[] {
  const s = q.toLowerCase();
  const head = names.filter((n) => n.toLowerCase().startsWith(s));
  const mid = s ? names.filter((n) => !head.includes(n) && n.toLowerCase().includes(s)) : [];
  return [...head, ...mid].slice(0, 12);
}
