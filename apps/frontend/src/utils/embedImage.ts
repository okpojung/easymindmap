// embedImage — 웹에서 붙여넣은 사진을 "다운로드해서 맵에 내장"한다.
//
// URL 참조만 저장하면 기사 삭제·오프라인에서 사진이 사라진다(2026-07
// 사용자 피드백). 붙여넣는 시점에 원본 바이트를 받아 data URL(base64)로
// 맵 데이터에 넣는다. 브라우저 보안(CORS) 때문에 일부 사이트는 다운로드가
// 차단될 수 있는데, 그 경우에만 원본 URL을 유지하는 폴백으로 동작한다
// (온라인에서는 그대로 보인다).
//
// [서버 연결 — 2026-08-20 완료, B16 ② 슬라이스 3] 위에 적어 둔 "서버 연결
// 예정"을 실제로 이었다. 로그인 상태면 **서버가 대신 내려받는다**
// (`POST /v1/attachments/from-url`) — CORS 를 받지 않으므로 브라우저가
// 막히던 사이트도 성공한다. 프런트 fetch 경로는 **폴백으로 남긴다**
// (게스트 · 서버 실패 · 인증 꺼진 개발 모드).
//
// [노트 HTML 슬라이스 — 2026-08-20] 예전에는 갈래가 둘이었다: 노드 사진은
// 서버 주소로, **리치 노트 HTML 속 `<img>` 는 data URL 로**. 되돌리기와
// 토큰 붙이기가 `image`·`images` 만 훑어서, 노트에 서버 주소를 넣으면
// 내보낸 파일이 그 사진에서만 깨졌기 때문이다 (28번 §3.5 셋째 줄).
//
// 이제 **한 갈래다.** `export/serverImages.ts` 와 `utils/imageSrc.ts` 가
// 노트 HTML 까지 훑으므로(`@emm/note-images`), 노트 사진도 노드 사진과
// 똑같이 `importRemoteImage()` 로 서버에 올린다.

// 사진 1장 내장 상한 — 맵(JSON)이 지나치게 커지는 것을 막는다.
// 기사 사진은 보통 100~500KB라 충분하다. 초과분은 URL 유지.
export const MAX_EMBED_BYTES = 2_500_000;

import { cloudApi, attachmentFetchUrl, serverAttachmentId } from '@/services/cloud/apiClient';
import { authEnabled, useAuthStore } from '@/stores/authStore';
import { useCloudStore } from '@/stores/cloudStore';
import { notifyUser } from '@/stores/noticeStore';

/** 서버에 올릴 수 있는 상태인가 — 게스트는 서버가 없다 */
function canUseServer(): boolean {
  return authEnabled && !!useAuthStore.getState().session;
}

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
//
// **로그인 상태면 서버가 먼저 받아 본다** (2026-08-20) — CORS 를 받지
// 않으므로 브라우저가 막히던 사이트가 그제야 성공한다. 저장은 하지
// 않는다(`store: false`): 여기서 나온 값은 **노트 HTML 안**에 들어가는데,
// 그 자리에 서버 주소를 넣으면 내보낸 파일이 서버 없이 안 열린다.
export async function fetchImageAsDataUrl(
  src: string,
  opts: { viaServer?: boolean } = {},
): Promise<{ dataUrl: string; w: number; h: number } | null> {
  if (!/^https?:\/\//i.test(src)) return null;

  // ⓪ 서버 대리 다운로드 — CORS 를 넘는 유일한 길.
  //    `viaServer: false` 는 **이미 서버에 물어봤다가 실패한** 호출부가
  //    쓴다 — 같은 주소로 두 번 왕복할 이유가 없다.
  if (opts.viaServer !== false && canUseServer()) {
    try {
      const got = await cloudApi.imageBytesFromUrl(src);
      const dim = await imageSize(got.dataUrl);
      if (dim) return { dataUrl: got.dataUrl, ...dim };
    } catch {
      // 서버가 못 받았다(차단·형식·크기·오프라인) — 아래 프런트 경로로
    }
  }

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

/**
 * 리치 노트 HTML 속 원격 `<img>` 들을 **우리가 보관하는 주소**로 바꾼다.
 * 하나라도 바뀌면 새 HTML 을, 아니면 null 을 돌려준다.
 *
 * 로그인 상태면 서버 저장소 주소, 아니면 지금까지처럼 data URL 이다
 * (`importRemoteImage` 가 그 판정을 한다 — 노드 사진과 **같은 길**).
 *
 * ★ **우리 저장소 사진은 건드리지 않는다.** 그것도 `http` 로 시작하므로,
 *   거르지 않으면 노트를 다시 붙여넣을 때마다 서버에서 되받아 사진이
 *   한 벌씩 더 쌓인다 (`remoteImages.ts` 가 겪은 것과 같은 뒷문이다).
 */
export async function embedRichHtmlImages(html: string): Promise<string | null> {
  if (!html || !/<img[\s>]/i.test(html)) return null;
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const imgs = Array.from(doc.querySelectorAll('img')).filter((im) => {
    const src = im.getAttribute('src') ?? '';
    return /^https?:\/\//i.test(src) && !serverAttachmentId(src);
  });
  if (imgs.length === 0) return null;
  let changed = false;
  await Promise.all(imgs.map(async (im) => {
    const got = await importRemoteImage(im.getAttribute('src')!);
    if (got) {
      im.setAttribute('src', got.src);
      changed = true;
    }
  }));
  return changed ? doc.body.innerHTML : null;
}

/**
 * **노드 사진용** 원격 사진 가져오기 (2026-08-20, B16 ② 슬라이스 3 · D-3).
 *
 * 로그인 상태면 서버가 받아 **첨부 저장소에 넣고 주소만** 돌려준다 —
 * 문서에 사진 바이트가 남지 않으니 자동저장이 빨라지고, 버전 히스토리가
 * 같은 사진을 스냅샷마다 복사하지 않는다(협업 CRDT 로그도 같다, 27번 §3).
 *
 * 실패하면 **지금까지의 data URL 경로를 그대로 쓴다.** 그 경로를 지우지
 * 않는 이유는 게스트·오프라인·인증이 꺼진 개발 모드가 전부 그 길로 가기
 * 때문이다. 둘 다 안 되면 null — 호출부가 원본 URL 을 유지한다.
 */
export async function importRemoteImage(
  src: string,
): Promise<{ src: string; w: number; h: number } | null> {
  if (!/^https?:\/\//i.test(src)) return null;

  let serverWhy: string | null = null;
  if (canUseServer()) {
    try {
      const mapId = useCloudStore.getState().cloudMapId ?? undefined;
      const up = await cloudApi.attachmentFromUrl(src, mapId);
      // 크기는 **받아 온 사진**으로 잰다 — 원본 주소는 핫링크가 막혀
      // 브라우저에서 안 열리는 경우가 많다(그래서 서버로 돌린 것이다).
      const dim = await imageSize(await attachmentFetchUrl(up.url));
      // 크기를 못 재도 주소는 살아 있다 — 기본 비율로 붙인다
      return { src: up.url, w: dim?.w ?? 400, h: dim?.h ?? 300 };
    } catch (err) {
      serverWhy = err instanceof Error ? err.message : '알 수 없는 오류';
    }
  }

  // 서버가 못 받았으면 지금까지의 길로 — **폴백을 지우지 않는다**
  const emb = await fetchImageAsDataUrl(src, { viaServer: false });

  // **조용히 삼키지 않는다.** 결과가 갈리므로 문구도 갈라야 한다:
  // 문서에 들어갔는지(무거워짐) · 아예 링크로만 남았는지(기사가 지워지면
  // 사진도 사라진다)를 사용자가 구분할 수 있어야 한다.
  if (serverWhy) {
    notifyUser(
      emb
        ? `⚠ 사진을 서버에 저장하지 못해 문서에 넣었습니다 — ${serverWhy}`
        : `⚠ 사진을 가져오지 못해 원본 주소만 남겼습니다 — ${serverWhy}`,
    );
  }
  return emb ? { src: emb.dataUrl, w: emb.w, h: emb.h } : null;
}
