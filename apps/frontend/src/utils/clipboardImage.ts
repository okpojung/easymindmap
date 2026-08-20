// clipboardImage — 클립보드에서 사진을 꺼내 NodeImage로 만든다.
// 캔버스(노드 선택 후 Ctrl+V)와 노드 텍스트 편집창 붙여넣기가 공유한다.
//
//   ① 이미지 파일 (스크린샷·복사한 그림) → **첨부와 같은 문**을 지난다
//   ② text/html 속 첫 <img> (웹에서 복사)  → 서버가 대신 받아 저장
//
// 원본 크기를 알기 위해 Image()로 로드해 보고, 로드가 실패해도(핫링크
// 차단 등) 기본 크기(400×300)로 일단 첨부한다 — 표시가 깨지면 노드의
// ✕ 버튼으로 제거할 수 있다.
//
// ─────────────────────────────────────────────────────────────────────
// 2026-08-20 (B16 ② 슬라이스 3 · D-2) — **문서에 사진 바이트를 남기지 않는다**
//
// 예전에는 여기서 무조건 FileReader 로 data URL 을 만들었다. 그러면 사진
// 바이트가 문서(맵 JSON)에 그대로 들어가, 자동저장이 매번 그것을 통째로
// 올리고 버전 히스토리가 스냅샷마다 같은 사진을 복사한다. 협업(CRDT)에서는
// **업데이트 로그에 영원히 남는다** (collaboration/27-sync-model.md §3).
//
// ★ **판정을 새로 만들지 않는다.** "data URL 로 둘 것인가 / 서버에 올릴
//   것인가" 는 첨부가 이미 `attachmentUrlForFile()` 에서 정한다(로그인
//   여부 · 개당 2MB · 맵당 10MB · 8MB 넘으면 청크). 첨부는 그 문을
//   지나는데 사진만 안 지나고 있었다. **같은 문으로 보낸다** — 기준을
//   사진용으로 따로 만들면 두 벌이 되고, 두 벌은 반드시 어긋난다.
//
// 게스트(비로그인)는 그 문에서 **지금처럼 data URL** 로 나온다. 서버가
// 없는 사람에게 로그인을 요구하면 첫 사용 경험이 깨진다.
// ─────────────────────────────────────────────────────────────────────

import type { NodeImage } from '@/editor/__samples__/types';
import { resolveLazyImgSrc } from './sanitizeRichHtml';
import { importRemoteImage } from './embedImage';
import { attachmentUrlForFile } from './attachmentFile';
import { notifyUser } from '@/stores/noticeStore';

/** 주어진 주소로 실제 픽셀 크기를 잰다 — 못 재면 기본 비율 */
function probeSize(src: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const probe = new Image();
    probe.onload = () =>
      resolve({ w: probe.naturalWidth || 400, h: probe.naturalHeight || 300 });
    // 크기를 못 재도 첨부는 한다 (기본 비율) — 렌더링이 되면 그 크기로 표시
    probe.onerror = () => resolve({ w: 400, h: 300 });
    probe.src = src;
  });
}

function fileToDataUrl(f: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error ?? new Error('file read failed'));
    r.readAsDataURL(f);
  });
}

/**
 * 클립보드에서 꺼낸 **이미지 파일**을 노드 사진으로 만든다 (D-2 ①).
 *
 * 크기는 파일 자체(objectURL)로 잰다 — 업로드 성공 여부와 무관하게 항상
 * 잴 수 있고, 토큰이나 네트워크가 필요 없다.
 */
async function applyImageFile(f: File, apply: (img: NodeImage) => void): Promise<void> {
  const probeUrl = URL.createObjectURL(f);
  const size = await probeSize(probeUrl).finally(() => URL.revokeObjectURL(probeUrl));

  let src: string;
  try {
    // `preferServer` — **사진은 크기와 무관하게 서버로** (2026-08-20).
    // 이게 없으면 2MB 이하 파일이 문서에 data URL 로 내장된다. 그건
    // **첨부**에 맞는 규칙이고(단일 .md 로 복원되는 것이 이득), 사진은
    // 정반대다 — 그래서 **스크린샷 대부분이 그대로 문서에 남았다.**
    // 판정을 두 벌로 만들지 않으려고 저 함수에 옵션으로 넣었다:
    // 로그인 여부·쿼터·청크 경로는 여전히 저기 한 곳이 정한다.
    src = await attachmentUrlForFile(f, { preferServer: true });
    // `attachmentUrlForFile` 은 서버를 못 쓰는 큰 파일에 **blob URL** 을
    // 준다. 첨부에는 맞는 답이지만(그 경우 내보내기가 안내를 띄운다)
    // **사진에는 안 된다** — 새로고침하면 그 자리가 통째로 깨지고,
    // 내보낸 파일에도 담기지 않는다. 사진은 문서에 남는 편이 낫다.
    // (판정을 바꾸는 것이 아니라, 이 자리에서 받지 않는 것이다.)
    if (src.startsWith('blob:')) {
      URL.revokeObjectURL(src);
      src = await fileToDataUrl(f);
    }
  } catch (err) {
    // ★ **업로드 실패를 조용히 삼키지 않는다.** 삼키면 노드에 빈 사진
    //   자리가 남고, 사용자는 무엇이 잘못됐는지 알 수 없다. 문서에
    //   넣어서라도 사진은 남기고, 그렇게 했다고 알린다.
    const why = err instanceof Error ? err.message : '알 수 없는 오류';
    try {
      src = await fileToDataUrl(f);
      notifyUser(`⚠ 사진을 서버에 저장하지 못해 문서에 넣었습니다 — ${why}`);
    } catch {
      notifyUser(`⚠ 사진을 붙여넣지 못했습니다 — ${why}`);
      return;
    }
  }
  apply({ src, ...size });
}

/**
 * 웹에서 복사한 **사진 주소**를 노드 사진으로 만든다 (D-2 ②).
 *
 * 서버가 대신 받아 저장하고 주소만 남긴다. 막히면 지금까지처럼 data URL,
 * 그것도 안 되면 원본 URL 을 그대로 둔다 — **폴백을 지우지 않는다.**
 */
async function applyRemoteImage(src: string, apply: (img: NodeImage) => void): Promise<void> {
  const got = await importRemoteImage(src);
  if (got) {
    apply({ src: got.src, w: got.w, h: got.h });
    return;
  }
  apply({ src, ...(await probeSize(src)) });
}

/**
 * 사진 하나를 노드에 붙인다 — 주소(웹 이미지)면 서버 경유, 그 밖(data URL
 * 등)이면 크기만 재서 그대로.
 */
function probeAndApply(src: string, apply: (img: NodeImage) => void): void {
  if (/^https?:\/\//i.test(src)) {
    void applyRemoteImage(src, apply);
    return;
  }
  void probeSize(src).then((size) => apply({ src, ...size }));
}

// 클립보드에 사진이 있으면 apply를 호출하고 그 종류를 반환한다.
//   'file' = 이미지 파일이 소비됨 (호출부에서 preventDefault 권장)
//   'html' = 웹 이미지 URL만 추출 (텍스트 붙여넣기는 그대로 진행해도 됨)
//   null   = 사진 없음
// opts.allowHtml=false — 이미지 '파일'만 받는다. 캔버스의 전역(윈도우)
// 붙여넣기 핸들러가 사용: 웹 기사(text/html) 붙여넣기까지 받으면 노트
// 문단 등 다른 붙여넣기 대상(포커스가 입력창 밖일 때)을 가로채므로,
// 전역 경로는 스크린샷·복사한 그림만 노드에 붙인다. 기사(텍스트+사진)는
// 노드 텍스트 편집창의 onPaste가 처리한다.
export function extractClipboardImage(
  dt: DataTransfer | null,
  apply: (img: NodeImage) => void,
  opts: { allowHtml?: boolean } = {},
): 'file' | 'html' | null {
  if (!dt) return null;
  const allowHtml = opts.allowHtml !== false;

  for (const f of Array.from(dt.files ?? [])) {
    if (f.type.startsWith('image/')) {
      void applyImageFile(f, apply);
      return 'file';
    }
  }

  if (!allowHtml) return null;

  const html = dt.getData('text/html');
  if (html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    // 지연 로딩 자리표시자(1px gif 등)는 건너뛰고 실제 주소를 가진 첫
    // 이미지를 찾는다 (data-src·srcset 폴백 — sanitizeRichHtml과 동일)
    let src: string | null = null;
    for (const im of Array.from(doc.querySelectorAll('img'))) {
      src = resolveLazyImgSrc(im);
      if (src) break;
    }
    if (src) {
      probeAndApply(src, apply);
      return 'html';
    }
  }
  return null;
}
