// 새 맵을 처음 저장할 때의 기본 이름 = **첫 중심주제** (2026-10-26 사용자 요청).
// 중심주제가 여럿이면 첫 번째(root). 글자 장식(**굵게**, `코드`, [글](주소), # 머리)은 벗기고
// 첫 줄만, 공백은 하나로, 100자까지. 비어 있으면 null — 부르는 쪽이 '새 맵' 으로 둔다.
export function titleFromCenter(text: string | null | undefined): string | null {
  if (typeof text !== 'string') return null;
  const line = text.split(/\r?\n/).map((l) => l.trim()).find((l) => l.length > 0) ?? '';
  const clean = line
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/, '')
    .replace(/(\*\*|__|~~|`)/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean) return null;
  return Array.from(clean).slice(0, 100).join('');
}
