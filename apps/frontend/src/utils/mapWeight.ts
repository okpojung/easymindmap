// 지금 문서의 무게 — 하단 상태바와 HTML 뷰어 상태줄이 같은 숫자를 보이도록 한 곳에 둔다.
// **서버가 저장할 때 세는 방식과 같은 규칙**이다 (maps.service.ts `saveDocument`).
//
// · 문서 크기 = 스냅샷 JSON 의 **UTF-8 바이트**
// · 첨부 개수 = 문서 안 `attachments` 항목 전부
// · 첨부 용량 = 내장(data URL)은 base64 를 원본 크기로 환산하고, 서버
//   저장소 첨부는 붙일 때 적어 둔 `size` 를 쓴다(2026-08-07).
//   **`size` 가 없는 옛 첨부**는 셀 수 없으므로 `unknown` 으로 센다 — 0 으로 뭉개지 않는다.

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)}MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)}GB`;
}

interface AttachNode {
  children?: AttachNode[];
  attachments?: { url?: string; size?: number }[];
}

export interface MapWeight { docBytes: number; attachCount: number; attachBytes: number; unknown: number }

export function measureDocument(map: unknown): MapWeight {
  const json = JSON.stringify(map ?? {});
  const docBytes = new TextEncoder().encode(json).length;

  let attachCount = 0;
  let attachBytes = 0;
  let unknown = 0;
  const walk = (n: AttachNode) => {
    for (const a of n.attachments ?? []) {
      attachCount += 1;
      if (a.url?.startsWith('data:')) {
        const comma = a.url.indexOf(',');
        attachBytes += Math.floor(((a.url.length - comma - 1) * 3) / 4);
      } else if (typeof a.size === 'number') {
        attachBytes += a.size;
      } else {
        unknown += 1;   // 크기를 적어 두기 전(2026-08-07 이전)에 붙은 첨부
      }
    }
    for (const c of n.children ?? []) walk(c);
  };
  const m = map as { root?: AttachNode; branches?: AttachNode[] } | undefined;
  if (m?.root) walk(m.root);
  for (const b of m?.branches ?? []) walk(b);

  return { docBytes, attachCount, attachBytes, unknown };
}
