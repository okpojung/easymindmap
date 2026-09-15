import type { ReactNode } from 'react';

/**
 * 본문 안의 **강조할 구절**을 `<b>` 로 감싼다 (2026-09-15).
 *
 * 내용(`content/*.ts`)에 HTML 을 적지 않으려고 둔 것이다 — 데이터에
 * 마크업이 섞이면 늘릴 때마다 태그를 맞춰야 하고, 잘못 닫으면 화면이
 * 깨진다. 여기서는 **구절을 찾아 감싸기만** 하므로 데이터는 순수한 글이다.
 *
 * 찾지 못한 구절은 조용히 넘어간다 — 글을 다듬다가 구절이 바뀌어도
 * 화면이 깨지지 않는 쪽이 낫다.
 */
export function emphasize(text: string, strong?: string[]): ReactNode {
  if (!strong?.length) return text;
  const out: ReactNode[] = [];
  let rest = text;
  let key = 0;
  while (rest) {
    // 남은 글에서 가장 먼저 나오는 구절을 찾는다
    let at = -1;
    let hit = '';
    for (const s of strong) {
      const i = rest.indexOf(s);
      if (i >= 0 && (at < 0 || i < at)) { at = i; hit = s; }
    }
    if (at < 0) { out.push(rest); break; }
    if (at > 0) out.push(rest.slice(0, at));
    out.push(<b key={key += 1}>{hit}</b>);
    rest = rest.slice(at + hit.length);
  }
  return out;
}
