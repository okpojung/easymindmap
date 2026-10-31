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
//   · 서버 첨부 중 마크다운(.md/.markdown)은 **웹 마크다운 편집기**
//     (`/md-editor/`, public/md-editor)로 새 탭에서 연다 — 읽고 고쳐
//     서버에 다시 저장한다 (2026-10-31, docs/04-extensions/attachment-storage.md).
//   · 맵 **내장** 마크다운(data URL, ≤2MB — 대부분의 .md 첨부)도 같은 편집기로
//     연다. 편집기는 내장 바이트를 못 읽으므로 이 탭이 postMessage 로 건네고
//     저장을 받아 맵에 되쓴다 (mdEmbedBridge.ts, 같은 문서 §7.5).

import { attachmentFetchUrl, cloudApiBase, serverAttachmentId } from '@/services/cloud/apiClient';
import { getFreshAccessToken } from '@/stores/authStore';
import { useCloudStore } from '@/stores/cloudStore';
import { useDocumentStore } from '@/stores/documentStore';
import { isMarkdownName, mdEditorUrl, MD_SAVED_MESSAGE } from './mdEditorUrl';
import {
  createMdEmbedHandler, dataUrlText, embeddedAttachmentKey, embeddedMdEditorUrl,
  embeddedSizeOf, embedLimitError, markdownDataUrl,
} from './mdEmbedBridge';

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

// 편집기 창이 저장하면 opener(이 창)로 알려 온다 — 그 첨부의 크기(size)를
// 고쳐 상태바 첨부 용량이 맞게 한다. 리스너는 처음 편집기를 열 때 한 번만 단다.
let mdSavedListening = false;
function listenMdSaved() {
  if (mdSavedListening || typeof window === 'undefined') return;
  mdSavedListening = true;
  window.addEventListener('message', (e: MessageEvent) => {
    // 편집기는 같은 origin 에서만 뜬다 — 다른 출처의 같은 모양 메시지는 무시
    if (e.origin !== window.location.origin) return;
    const d = e.data as { type?: unknown; att?: unknown; sizeBytes?: unknown } | null;
    if (!d || d.type !== MD_SAVED_MESSAGE || typeof d.att !== 'string') return;
    if (typeof d.sizeBytes !== 'number' || !(d.sizeBytes >= 0)) return;
    useDocumentStore.getState().setServerAttachmentSize(d.att, d.sizeBytes);
  });
}

/**
 * 서버 마크다운 첨부 → 같은 origin 의 웹 편집기(`/md-editor/`)를 새 탭에서
 * 연다 (2026-10-31). 토큰을 고르는 비동기 사이에 팝업이 막히지 않게
 * **클릭 제스처 안에서 빈 창을 먼저** 연다(PDF·사진과 같은 수).
 * opener 를 끊지 않는다(`noopener` 없음) — 저장 알림 postMessage 를 받아야 한다.
 */
function openMarkdownEditor(att: string, name: string) {
  listenMdSaved();
  const win = window.open('', '_blank');
  getFreshAccessToken()
    .catch(() => null)
    .then((token) => {
      const u = mdEditorUrl({ att, api: cloudApiBase, name, token });
      if (win) win.location.href = u;
      else window.open(u, '_blank');
    });
}

/** 첨부를 가리키는 자리 — 알면 넘긴다(인스펙터). 모르면 url 로 맵에서 찾는다 */
export interface AttachmentRef { nodeId: string; attachmentId: string }

type AttNode = { id: string; attachments?: { id: string; url?: string; size?: number }[]; children?: AttNode[] };

/** 맵의 모든 노드(첫 중심·가지·둘째 이후 중심) */
function eachNode(visit: (n: AttNode) => void) {
  const map = useDocumentStore.getState().map as unknown as {
    root: AttNode; branches: AttNode[]; centers?: { root: AttNode; branches: AttNode[] }[];
  };
  const walk = (n: AttNode) => { visit(n); for (const c of n.children ?? []) walk(c); };
  walk(map.root);
  map.branches.forEach(walk);
  for (const c of map.centers ?? []) { walk(c.root); c.branches.forEach(walk); }
}

function findAttachment(ref: AttachmentRef | undefined, url: string): { nodeId: string; att: { id: string; url?: string } } | null {
  let hit: { nodeId: string; att: { id: string; url?: string } } | null = null;
  eachNode((n) => {
    if (hit) return;
    for (const a of n.attachments ?? []) {
      if (ref ? (n.id === ref.nodeId && a.id === ref.attachmentId) : a.url === url) { hit = { nodeId: n.id, att: a }; return; }
    }
  });
  return hit;
}

function embeddedMapBytes(): number {
  let total = 0;
  eachNode((n) => { for (const a of n.attachments ?? []) total += embeddedSizeOf(a.url); });
  return total;
}

/**
 * 맵 내장 마크다운 → 같은 origin 의 편집기를 새 탭으로 (2026-10-31).
 * **클릭 제스처 안에서 바로** 연다(비동기 없음 — 팝업 차단을 피한다). opener 를
 * 끊지 않는다 — 편집기가 opener 로 hello/save 를 보낸다. 리스너는 창이 닫히면
 * 정리한다(1초마다 `closed` 확인). 같은 첨부를 다시 누르면 새 창이 하나 더 뜬다.
 */
function openEmbeddedMarkdown(nodeId: string, attachmentId: string, name: string) {
  const key = embeddedAttachmentKey(nodeId, attachmentId);
  const win = window.open(embeddedMdEditorUrl(key, name), '_blank');
  if (!win) return;
  const current = () => findAttachment({ nodeId, attachmentId }, '')?.att ?? null;
  const onMessage = createMdEmbedHandler({
    key,
    origin: window.location.origin,
    read: () => {
      const u = current()?.url;
      return u?.startsWith('data:') ? dataUrlText(u) : null;
    },
    readOnly: () => !!useCloudStore.getState().readOnlyInfo,
    write: (markdown) => {
      const att = current();
      if (!att?.url?.startsWith('data:')) return { ok: false, error: '맵에서 이 첨부를 찾을 수 없습니다 (지워졌거나 다른 맵을 열었습니다).' };
      const next = markdownDataUrl(markdown, att.url);
      const err = embedLimitError(next.size, embeddedSizeOf(att.url), embeddedMapBytes());
      if (err) return { ok: false, error: err };
      const ok = useDocumentStore.getState().replaceEmbeddedAttachment(nodeId, attachmentId, next.url, next.size);
      return ok ? { ok: true } : { ok: false, error: '맵에서 이 첨부를 찾을 수 없습니다.' };
    },
  });
  const listener = (e: MessageEvent) => {
    if (e.source !== win) return; // 이 창이 보낸 것만
    onMessage({ origin: e.origin, data: e.data, source: win });
  };
  window.addEventListener('message', listener);
  const timer = window.setInterval(() => {
    if (!win.closed) return;
    window.clearInterval(timer);
    window.removeEventListener('message', listener);
  }, 1000);
}

export function openAttachment(name: string, url?: string, ref?: AttachmentRef): void {
  if (!url) return;

  // 맵 내장 마크다운 → 웹 편집기 (opener 다리)
  if (url.startsWith('data:') && isMarkdownName(name)) {
    const hit = findAttachment(ref, url);
    if (hit) { openEmbeddedMarkdown(hit.nodeId, hit.att.id, name); return; }
  }

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
  const attId = serverAttachmentId(url);
  if (attId && isMarkdownName(name)) {
    openMarkdownEditor(attId, name);
    return;
  }

  if (attId) {
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
