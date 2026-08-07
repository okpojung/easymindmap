// 첨부파일 열기 정책 (2026-07 사용자 요청):
//   · 브라우저가 표시할 수 있는 형식(PDF·사진·텍스트·오디오·비디오)은
//     **새 탭에서 바로 열기** — data URL은 Chrome이 탭 이동을 막고,
//     blob URL은 MIME이 비어 있으면 다운로드돼 버리므로, 둘 다 정확한
//     MIME의 Blob URL로 바꿔 연다.
//   · 브라우저가 못 여는 형식(Word/Excel/PPT 등 오피스)은 **즉시
//     다운로드** — 웹앱은 보안상 로컬 앱을 직접 실행할 수 없다.
//     (브라우저 다운로드 항목에서 "항상 열기"를 켜 두면 클릭 한 번으로
//     오피스가 열린다. 서버 저장 연결 후에는 Office 뷰어 연동 예정 —
//     docs/03-editor-core/node/04-node-content.md)

import { attachmentFetchUrl, serverAttachmentId } from '@/services/cloud/apiClient';

const VIEWABLE_MIME = /^(application\/pdf|image\/|text\/|audio\/|video\/)/;

const EXT_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
  webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp',
  txt: 'text/plain', md: 'text/plain', log: 'text/plain', csv: 'text/plain',
  json: 'text/plain', xml: 'text/plain', html: 'text/html',
  mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4',
  mp4: 'video/mp4', webm: 'video/webm',
};

function extOf(name: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(name || '');
  return m ? m[1].toLowerCase() : '';
}

function dataUrlToBlob(dataUrl: string, fallbackMime: string): Blob | null {
  const m = /^data:([^;,]*)?(;base64)?,(.*)$/s.exec(dataUrl);
  if (!m) return null;
  const mime = m[1] || fallbackMime || 'application/octet-stream';
  try {
    if (m[2]) {
      const bin = atob(m[3]);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return new Blob([bytes], { type: mime });
    }
    return new Blob([decodeURIComponent(m[3])], { type: mime });
  } catch {
    return null;
  }
}

function download(url: string, name: string) {
  const a = document.createElement('a');
  a.href = url;
  a.download = name || 'attachment';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// blob의 MIME이 비어 있거나 generic이면 파일 확장자로 보정한 Blob URL 생성
function typedObjectUrl(blob: Blob, name: string): { url: string; mime: string } {
  const extMime = EXT_MIME[extOf(name)] || '';
  const mime = VIEWABLE_MIME.test(blob.type)
    ? blob.type
    : (extMime && VIEWABLE_MIME.test(extMime) ? extMime : blob.type || extMime || 'application/octet-stream');
  const typed = mime === blob.type ? blob : new Blob([blob], { type: mime });
  const url = URL.createObjectURL(typed);
  // 새 탭이 로드를 마칠 때까지 URL 유지 (1분 뒤 해제)
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return { url, mime };
}

function openTyped(blob: Blob, name: string, preOpened?: Window | null) {
  const { url, mime } = typedObjectUrl(blob, name);
  if (VIEWABLE_MIME.test(mime)) {
    if (preOpened) preOpened.location.href = url;
    else window.open(url, '_blank', 'noopener');
  } else {
    // 오피스 등 브라우저가 못 여는 형식 — 즉시 다운로드
    preOpened?.close();
    download(url, name);
  }
}

export function openAttachment(name: string, url?: string): void {
  if (!url) return;

  // ── 서버 첨부 저장소(B9) ────────────────────────────────────────
  //
  // **브라우저가 열 수 있는 형식은 URL 을 그대로 넘겨 스트리밍시킨다**
  // (2026-08-07). 예전에는 `fetch → blob()` 으로 **파일 전체를 메모리에
  // 받은 뒤** Blob URL 로 열었다. 사진·PDF 는 그래도 됐지만 동영상에서
  // 무너졌다 — 884MB 를 다 받을 때까지 새 창은 `about:blank` 인 채로
  // 있고(사용자에게는 "파일이 없고 재생이 안 된다"), 받아도 통짜 Blob
  // 이라 **구간 이동이 안 된다**. 메모리도 위험하다.
  //
  // 서버는 이제 `Accept-Ranges: bytes` 와 206 부분 응답을 지원하고
  // (attachments.controller), `Content-Type`·`Content-Disposition:
  // inline` 을 제대로 보낸다. 그러니 토큰만 붙인 URL 을 그대로 열면
  // 브라우저가 알아서 필요한 구간만 받아 재생한다 — 즉시 시작되고
  // 구간 이동도 된다.
  //
  // 오피스처럼 브라우저가 못 여는 형식만 예전처럼 받아서 다운로드한다
  // (그쪽은 애초에 통째로 내려받는 것이 목적이다).
  if (serverAttachmentId(url)) {
    const extMime = EXT_MIME[extOf(name)] || '';
    if (VIEWABLE_MIME.test(extMime)) {
      const win = window.open('', '_blank');
      attachmentFetchUrl(url)
        .then((u) => {
          if (win) win.location.href = u;
          else window.open(u, '_blank', 'noopener');
        })
        .catch(() => { win?.close(); });
      return;
    }
    attachmentFetchUrl(url)
      .then((u) => fetch(u))
      .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.blob(); })
      .then((b) => download(URL.createObjectURL(b), name))
      .catch(() => undefined);
    return;
  }

  if (url.startsWith('data:')) {
    const blob = dataUrlToBlob(url, EXT_MIME[extOf(name)] || '');
    if (blob) openTyped(blob, name);
    return;
  }

  if (url.startsWith('blob:')) {
    // 클릭 제스처 안에서 동기적으로 창을 먼저 열어 팝업 차단을 피하고,
    // MIME 보정한 Blob으로 내용을 채운다
    const win = window.open('', '_blank');
    fetch(url)
      .then((r) => r.blob())
      .then((b) => openTyped(b, name, win))
      .catch(() => {
        if (win) win.location.href = url;
      });
    return;
  }

  // 외부(https 등) — 브라우저 기본 동작
  window.open(url, '_blank', 'noopener');
}
