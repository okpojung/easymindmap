// remoteImages — 불러온 맵의 원격(http) 이미지 URL을 다운로드해 맵에
// 내장한다 (MD의 ![](https://…png) → 노드 사진).
//
//   1) fetch 성공 + ≤2MB → data URL로 내장 (파일에 저장돼 원본이
//      사라져도 보존 — 기사 붙여넣기와 동일 정책)
//   2) fetch 실패(CORS 등)여도 <img>로 로드되면 → 원격 URL 참조 유지
//      (화면에는 보이고, 내보내기에는 URL로 남는다)
//   3) 둘 다 실패 → 이미지를 빼고 노드 링크(🔗)로 폴백 (데이터 손실 없음)
//
// [서버 연결 예정] 서버 저장 도입 시 이미지·첨부는 서버에 올리고 MD
// 변환 시 서버 경로로 바꾼다 — backlog.md B9.

import type { MindNode, SampleMap } from '@/editor/__samples__/types';

const FETCH_TIMEOUT_MS = 8000;
const INLINE_LIMIT = 2 * 1024 * 1024; // ≤2MB만 data URL로 내장

export interface RemoteImageStats {
  embedded: number; // data URL로 내장
  kept: number; // 원격 URL 참조 유지 (fetch 불가, 표시만 가능)
  linked: number; // 로드 실패 — 링크로 폴백
}

function fileNameOf(url: string): string {
  try {
    const path = url.replace(/[?#].*$/, '');
    return decodeURIComponent(path.split('/').filter(Boolean).pop() ?? '') || '이미지';
  } catch {
    return '이미지';
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('read'));
    r.readAsDataURL(blob);
  });
}

// <img>로 로드해 실측 크기를 얻는다 (data URL·원격 URL 공용)
function measureImage(src: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const timer = window.setTimeout(() => reject(new Error('timeout')), FETCH_TIMEOUT_MS);
    img.onload = () => {
      window.clearTimeout(timer);
      resolve({ w: img.naturalWidth || 320, h: img.naturalHeight || 200 });
    };
    img.onerror = () => {
      window.clearTimeout(timer);
      reject(new Error('load'));
    };
    img.src = src;
  });
}

async function fetchAsDataUrl(url: string): Promise<string | null> {
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (blob.size > INLINE_LIMIT) return null; // 너무 큼 — 원격 참조 유지 시도
    return await blobToDataUrl(blob);
  } catch {
    return null;
  } finally {
    window.clearTimeout(timer);
  }
}

type ImgEntry = { src: string; w: number; h: number; afterLine?: number };

// 노드 하나의 원격 이미지들을 처리 — images 배열을 새로 만들어 돌려주고,
// 실패분은 links에 추가한다 (node를 제자리 수정)
async function resolveNode(node: MindNode, stats: RemoteImageStats): Promise<void> {
  const list: ImgEntry[] = node.images?.length
    ? node.images
    : node.image?.src
      ? [node.image]
      : [];
  if (!list.some((im) => /^https?:\/\//i.test(im.src))) return;

  const out: ImgEntry[] = [];
  for (const im of list) {
    if (!/^https?:\/\//i.test(im.src)) {
      out.push(im);
      continue;
    }
    const dataUrl = await fetchAsDataUrl(im.src);
    if (dataUrl) {
      try {
        const dim = await measureImage(dataUrl);
        out.push({ ...im, src: dataUrl, w: dim.w, h: dim.h });
        stats.embedded += 1;
        continue;
      } catch {
        /* 이미지 파일이 아님 — 아래 폴백으로 */
      }
    }
    // fetch 불가(CORS 등) — 브라우저 <img>로는 로드될 수 있다
    try {
      const dim = await measureImage(im.src);
      out.push({ ...im, w: dim.w, h: dim.h });
      stats.kept += 1;
    } catch {
      // 이미지로 쓸 수 없음 — 링크로 폴백 (URL은 잃지 않는다)
      const links = node.links ?? [];
      if (!links.some((l) => l.url === im.src)) {
        links.push({
          id: `rimg-${Date.now()}-${links.length}`,
          url: im.src,
          label: fileNameOf(im.src),
        });
      }
      node.links = links;
      stats.linked += 1;
    }
  }

  if (node.images?.length) {
    if (out.length) node.images = out as typeof node.images;
    else delete node.images;
  } else if (node.image) {
    if (out.length) node.image = { src: out[0].src, w: out[0].w, h: out[0].h };
    else delete node.image;
  }
}

// 맵 전체의 원격 이미지를 내장/정리한 새 맵을 돌려준다.
// 원격 이미지가 없으면 즉시 원본을 그대로 반환한다 (비용 0).
export async function resolveRemoteImages(
  map: SampleMap,
): Promise<{ map: SampleMap; stats: RemoteImageStats }> {
  const stats: RemoteImageStats = { embedded: 0, kept: 0, linked: 0 };

  const hasRemote = (n: MindNode): boolean =>
    (n.images ?? []).some((im) => /^https?:\/\//i.test(im.src)) ||
    /^https?:\/\//i.test(n.image?.src ?? '') ||
    (n.children ?? []).some(hasRemote);
  if (!hasRemote(map.root as unknown as MindNode) && !map.branches.some(hasRemote)) {
    return { map, stats };
  }

  const clone: SampleMap = JSON.parse(JSON.stringify(map));
  const jobs: Promise<void>[] = [];
  const walk = (n: MindNode) => {
    jobs.push(resolveNode(n, stats));
    (n.children ?? []).forEach(walk);
  };
  walk(clone.root as unknown as MindNode);
  clone.branches.forEach(walk);
  await Promise.all(jobs);
  return { map: clone, stats };
}
