// embedImage — 웹에서 붙여넣은 사진을 "다운로드해서 맵에 내장"한다.
//
// URL 참조만 저장하면 기사 삭제·오프라인에서 사진이 사라진다(2026-07
// 사용자 피드백). 붙여넣는 시점에 원본 바이트를 받아 data URL(base64)로
// 맵 데이터에 넣는다. 브라우저 보안(CORS) 때문에 일부 사이트는 다운로드가
// 차단될 수 있는데, 그 경우에만 원본 URL을 유지하는 폴백으로 동작한다
// (온라인에서는 그대로 보인다).
//
// [서버 연결 예정] 서버 연결 시에는 서버가 사진을 내려받아 첨부파일
// 디렉토리(attachments 스토리지)에 저장하고 맵에는 그 경로만 저장하는
// 방식으로 이관한다 — CORS 제약이 없어져 내장 성공률 100%가 된다
// (docs/02-domain/db-schema.md §첨부 참조).

// 사진 1장 내장 상한 — 맵(JSON)이 지나치게 커지는 것을 막는다.
// 기사 사진은 보통 100~500KB라 충분하다. 초과분은 URL 유지.
export const MAX_EMBED_BYTES = 2_500_000;

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

function imageSize(src: string): Promise<{ w: number; h: number } | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () =>
      resolve({ w: img.naturalWidth || 400, h: img.naturalHeight || 300 });
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

// 원격 사진을 data URL로 다운로드. 실패(CORS 차단·크기 초과·이미지 아님)
// 하면 null — 호출부는 원본 URL을 유지한다.
export async function fetchImageAsDataUrl(
  src: string,
): Promise<{ dataUrl: string; w: number; h: number } | null> {
  if (!/^https?:\/\//i.test(src)) return null;

  // ① fetch — CORS를 허용하는 CDN이면 원본 바이트 그대로 내장
  try {
    const res = await fetch(src, { mode: 'cors' });
    if (res.ok) {
      const blob = await res.blob();
      if (blob.type.startsWith('image/') && blob.size > 0 && blob.size <= MAX_EMBED_BYTES) {
        const dataUrl = await blobToDataUrl(blob);
        const dim = await imageSize(dataUrl);
        if (dim) return { dataUrl, ...dim };
      }
    }
  } catch {
    // CORS 차단 등 — ②로
  }

  // ② crossOrigin 이미지 → canvas 재인코딩 (CORS 헤더가 있어야 성공)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const im = new Image();
      im.crossOrigin = 'anonymous';
      im.onload = () => resolve(im);
      im.onerror = () => reject(new Error('load fail'));
      im.src = src;
    });
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const ctx = c.getContext('2d');
    if (ctx && c.width > 0 && c.height > 0) {
      ctx.drawImage(img, 0, 0);
      const dataUrl = c.toDataURL('image/png');
      // base64는 원본의 약 1.37배 — 상한을 같은 감각으로 적용
      if (dataUrl.length <= MAX_EMBED_BYTES * 1.4) {
        return { dataUrl, w: c.width, h: c.height };
      }
    }
  } catch {
    // 실패 — 원본 URL 유지 폴백
  }
  return null;
}

// 리치 노트 HTML 속 원격 <img>들을 내장 data URL로 교체한다.
// 하나라도 교체되면 새 HTML을, 아니면 null을 돌려준다.
export async function embedRichHtmlImages(html: string): Promise<string | null> {
  if (!html || !/<img[\s>]/i.test(html)) return null;
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const imgs = Array.from(doc.querySelectorAll('img')).filter((im) =>
    /^https?:\/\//i.test(im.getAttribute('src') ?? ''),
  );
  if (imgs.length === 0) return null;
  let changed = false;
  await Promise.all(imgs.map(async (im) => {
    const emb = await fetchImageAsDataUrl(im.getAttribute('src')!);
    if (emb) {
      im.setAttribute('src', emb.dataUrl);
      changed = true;
    }
  }));
  return changed ? doc.body.innerHTML : null;
}
