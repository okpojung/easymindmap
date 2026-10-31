// 맵 **내장** 마크다운 첨부 ↔ 웹 편집기(`/md-editor/`) 다리 (2026-10-31).
//
// 2MB 이하 첨부는 서버에 올리지 않고 맵 안에 data URL 로 내장한다
// (utils/attachmentFile.ts ①). 그래서 대부분의 .md 첨부는 서버 첨부
// (`/v1/attachments/{id}`, mdEditorUrl.ts)가 아니라 **내장 첨부**다. 편집기는
// 내장 첨부를 직접 읽을 수 없으므로, 편집기를 연 **앱 탭(opener)** 이 내용을
// 건네주고 저장을 받아 맵에 되쓴다. 편집기 쪽 규약은 public/md-editor/index.html
// 의 "Embedded (in-map) attachment" 절(okpojung/markdown-editor@b816552).
//
//   앱:     window.open('/md-editor/?src=opener&key=<키>&name=<이름>', '_blank')
//   편집기 → 앱: {type:"mde:hello", key}                (0.5초 간격, 최대 10초)
//   앱 → 편집기: {type:"mde:load", key, markdown, readOnly}
//   편집기 → 앱: {type:"mde:save", key, markdown, reqId}
//   앱 → 편집기: {type:"mde:saved", key, reqId, ok:true} | {…, ok:false, error}
//
// 모든 메시지는 **같은 origin** 끼리만 — 보낼 때 targetOrigin = location.origin,
// 받을 때 event.origin === location.origin 을 확인한다.
//
// 이 파일은 store·env 를 읽지 않는 순수 함수만 둔다 — tsx 로 바로 시험한다
// (mdEmbedBridge.test.ts). 맵을 고치는 쪽은 openAttachment.ts 가 이어 붙인다.

import { MD_EDITOR_PATH } from './mdEditorUrl';

/** 첨부 하나의 내장 한도 — 내보내기 인라인 한도(INLINE_ATTACHMENT_LIMIT)와 같다 */
export const EMBED_FILE_LIMIT = 2 * 1024 * 1024;
/** 맵 하나의 내장 첨부 합계 한도 — attachmentFile.ts EMBED_TOTAL_LIMIT 와 같다 */
export const EMBED_MAP_LIMIT = 10 * 1024 * 1024;

/** 맵 안에서 첨부 하나를 가리키는 키 — 노드 id + 첨부 id (URL 에 넣어도 된다) */
export function embeddedAttachmentKey(nodeId: string, attachmentId: string): string {
  return `${nodeId}~${attachmentId}`;
}

export function embeddedMdEditorUrl(key: string, name: string): string {
  return `${MD_EDITOR_PATH}?src=opener&key=${encodeURIComponent(key)}&name=${encodeURIComponent(name)}`;
}

const DATA_URL = /^data:([^;,]*)((?:;[^;,]*)*?)(;base64)?,(.*)$/s;

/** data URL 의 원본 바이트 */
export function dataUrlBytes(url: string): Uint8Array | null {
  const m = DATA_URL.exec(url);
  if (!m) return null;
  try {
    if (m[3]) {
      const bin = atob(m[4]);
      const out = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      return out;
    }
    return new TextEncoder().encode(decodeURIComponent(m[4]));
  } catch {
    return null;
  }
}

/** 내장 바이트 → 문자열 (UTF-8, BOM 제거) */
export function dataUrlText(url: string): string | null {
  const b = dataUrlBytes(url);
  if (!b) return null;
  return new TextDecoder('utf-8').decode(b).replace(/^﻿/, '');
}

/**
 * 새 마크다운 → 내장 data URL. 원래 MIME 을 지킨다(없으면 text/markdown).
 * 반환 `size` 는 원본 바이트 수 — 첨부의 `size` 와 한도 계산에 쓴다.
 */
export function markdownDataUrl(markdown: string, prevUrl?: string): { url: string; size: number } {
  const bytes = new TextEncoder().encode(markdown);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  const prevMime = prevUrl ? DATA_URL.exec(prevUrl)?.[1] : '';
  const mime = prevMime && prevMime.trim() ? prevMime : 'text/markdown';
  return { url: `data:${mime};base64,${btoa(bin)}`, size: bytes.length };
}

/** data URL 의 원본 바이트 수 추정 (attachmentFile.ts 와 같은 셈 — base64 길이 × 3/4) */
export function embeddedSizeOf(url: string | undefined): number {
  return url?.startsWith('data:') ? Math.floor(url.length * 0.75) : 0;
}

/**
 * 한도 검사 — 넘으면 사용자에게 보여 줄 한국어 이유, 아니면 null.
 * `mapTotal` 은 지금 맵의 내장 합계(이 첨부의 옛 내용 포함).
 */
export function embedLimitError(newSize: number, oldSize: number, mapTotal: number): string | null {
  const mb = (n: number) => `${Math.round((n / (1024 * 1024)) * 10) / 10}MB`;
  if (newSize > EMBED_FILE_LIMIT) {
    return `맵에 내장하는 첨부는 ${mb(EMBED_FILE_LIMIT)} 까지입니다 (지금 ${mb(newSize)}). 파일 메뉴의 '.md로 저장'으로 내 PC에 저장한 뒤 다시 첨부해 주세요.`;
  }
  if (mapTotal - oldSize + newSize > EMBED_MAP_LIMIT) {
    return `이 맵의 내장 첨부 합계가 ${mb(EMBED_MAP_LIMIT)} 를 넘습니다. 다른 첨부를 줄이거나 '.md로 저장'으로 따로 보관해 주세요.`;
  }
  return null;
}

// ── 메시지 처리 ──────────────────────────────────────────────────────

export interface BridgeDeps {
  key: string;
  /** 앱의 origin (window.location.origin) */
  origin: string;
  /** 지금 맵에 있는 그 첨부의 마크다운 — 첨부가 사라졌으면 null */
  read: () => string | null;
  /** 맵이 읽기 전용(열람자·다른 세션 편집 중 등)인가 */
  readOnly: () => boolean;
  /** 저장 — 실패면 한국어 이유 */
  write: (markdown: string) => { ok: true } | { ok: false; error: string };
}

interface MsgEvent {
  origin: string;
  data: unknown;
  source: { postMessage: (msg: unknown, targetOrigin: string) => void } | null;
}

/**
 * 편집기 창 하나에 대한 message 처리기. 다른 origin·다른 키·모르는 종류는
 * 조용히 무시한다(같은 탭에 편집기가 여러 개 떠 있을 수 있다).
 */
export function createMdEmbedHandler(deps: BridgeDeps): (e: MsgEvent) => void {
  return (e) => {
    if (e.origin !== deps.origin || !e.source) return;
    const d = e.data as { type?: unknown; key?: unknown; markdown?: unknown; reqId?: unknown } | null;
    if (!d || typeof d !== 'object' || d.key !== deps.key) return;
    const reply = (msg: Record<string, unknown>) => e.source!.postMessage({ key: deps.key, ...msg }, deps.origin);

    if (d.type === 'mde:hello') {
      const markdown = deps.read();
      if (markdown === null) return; // 첨부가 없어졌다 — 편집기가 10초 뒤 안내한다
      reply({ type: 'mde:load', markdown, readOnly: deps.readOnly() });
      return;
    }
    if (d.type === 'mde:save') {
      if (typeof d.markdown !== 'string') {
        reply({ type: 'mde:saved', reqId: d.reqId, ok: false, error: '저장할 내용이 없습니다.' });
        return;
      }
      if (deps.readOnly()) {
        reply({ type: 'mde:saved', reqId: d.reqId, ok: false, error: '이 맵은 읽기 전용이라 저장할 수 없습니다.' });
        return;
      }
      const r = deps.write(d.markdown);
      // `'error' in r` — 이 프로젝트는 strict 가 꺼져 있어 r.ok 로는 좁혀지지 않는다
      reply('error' in r
        ? { type: 'mde:saved', reqId: d.reqId, ok: false, error: r.error }
        : { type: 'mde:saved', reqId: d.reqId, ok: true });
    }
  };
}
