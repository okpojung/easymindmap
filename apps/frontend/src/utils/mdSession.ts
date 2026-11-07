// 마크다운 첨부 편집 자리 (2026-11-08) — 편집 영역 오른쪽 칸 · 새 탭 · 새 창이 함께 쓴다.
//
// 편집기(/md-editor/)는 **iframe 끼워 넣기 규약**으로 띄운다 — 편집기 쪽을 고치지 않는다:
//   부모 → 편집기  {type:"mde:set", markdown} · {type:"mde:mode", mode:"rendered"}
//   편집기 → 부모  {type:"mde:change", markdown}   (0.4초 모아서)
// 고친 내용은 **이 편집 탭이** 첨부에 저장한다(자동, 1초 모아서):
//   · 맵 내장 첨부(data URL) → 맵에 되쓴다(맵 저장은 평소처럼)
//   · 서버 첨부 → PUT /v1/attachments/:id/content (If-Match 로 다른 곳의 저장과 부딪히면 멈춘다)
// 새 탭·새 창은 EasyMindMap 의 작은 화면(/?mdedit=…)이 같은 iframe 을 띄우고, 내용·저장은
// BroadcastChannel 로 이 탭과 주고받는다(간트 창과 같은 방식).
import { cloudApiBase } from '@/services/cloud/apiClient';
import { getFreshAccessToken } from '@/stores/authStore';
import { useCloudStore } from '@/stores/cloudStore';
import { useDocumentStore } from '@/stores/documentStore';
import { dataUrlText, embeddedAttachmentKey, embeddedSizeOf, embedLimitError, markdownDataUrl } from './mdEmbedBridge';
import { embeddedMapBytes, findAttachment } from './openAttachment';
import { MD_EDITOR_PATH } from './mdEditorUrl';

export type MdTarget =
  | { kind: 'embedded'; nodeId: string; attachmentId: string; name: string }
  | { kind: 'server'; att: string; name: string };

/** 키 → 첨부 자리 (새 창이 주소로 들고 다닌다) */
export function mdTargetFromKey(key: string, name: string): MdTarget | null {
  if (key.startsWith('att:')) return key.length > 4 ? { kind: 'server', att: key.slice(4), name } : null;
  const i = key.lastIndexOf('~');
  if (i <= 0 || i === key.length - 1) return null;
  return { kind: 'embedded', nodeId: key.slice(0, i), attachmentId: key.slice(i + 1), name };
}

export function mdTargetKey(t: MdTarget): string {
  return t.kind === 'embedded' ? embeddedAttachmentKey(t.nodeId, t.attachmentId) : `att:${t.att}`;
}

/** iframe 에 띄울 편집기 주소 — 첨부 연동 인자 없이(끼워 넣기 모드). 언어는 편집기 설정을 따른다 */
export function mdEmbedSrc(): string {
  return `${MD_EDITOR_PATH}?embed=emm`;
}

const enc = new TextEncoder();
async function sha256Hex(buf: Uint8Array): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', buf.slice().buffer as ArrayBuffer);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export interface MdLoaded { markdown: string; readOnly: boolean; base?: string }

/** 첨부 내용 읽기 */
export async function loadMd(t: MdTarget): Promise<MdLoaded> {
  const readOnly = !!useCloudStore.getState().readOnlyInfo;
  if (t.kind === 'embedded') {
    const u = findAttachment({ nodeId: t.nodeId, attachmentId: t.attachmentId }, '')?.att?.url;
    const text = u?.startsWith('data:') ? dataUrlText(u) : null;
    if (text === null) throw new Error('gone');
    return { markdown: text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n'), readOnly };
  }
  const token = await getFreshAccessToken().catch(() => null);
  const r = await fetch(`${cloudApiBase}/v1/attachments/${encodeURIComponent(t.att)}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!r.ok) throw new Error(String(r.status));
  const buf = new Uint8Array(await r.arrayBuffer());
  return { markdown: new TextDecoder('utf-8').decode(buf).replace(/^\uFEFF/, '').replace(/\r\n/g, '\n'), readOnly, base: await sha256Hex(buf) };
}

/** 첨부에 저장 — 성공하면 새 base(서버 첨부) */
export async function saveMd(t: MdTarget, markdown: string, base?: string): Promise<{ ok: true; base?: string } | { ok: false; error: string }> {
  if (useCloudStore.getState().readOnlyInfo) return { ok: false, error: 'readonly' };
  if (t.kind === 'embedded') {
    const att = findAttachment({ nodeId: t.nodeId, attachmentId: t.attachmentId }, '')?.att as { url?: string } | undefined;
    if (!att?.url?.startsWith('data:')) return { ok: false, error: 'gone' };
    const next = markdownDataUrl(markdown, att.url);
    const err = embedLimitError(next.size, embeddedSizeOf(att.url), embeddedMapBytes());
    if (err) return { ok: false, error: err };
    const ok = useDocumentStore.getState().replaceEmbeddedAttachment(t.nodeId, t.attachmentId, next.url, next.size);
    return ok ? { ok: true } : { ok: false, error: 'gone' };
  }
  const body = enc.encode(markdown);
  const token = await getFreshAccessToken().catch(() => null);
  const headers: Record<string, string> = { 'Content-Type': 'text/markdown; charset=utf-8' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (base) headers['If-Match'] = `"sha256:${base}"`;
  const r = await fetch(`${cloudApiBase}/v1/attachments/${encodeURIComponent(t.att)}/content`, { method: 'PUT', headers, body });
  if (r.status === 409 || r.status === 412) return { ok: false, error: 'conflict' };
  if (!r.ok) return { ok: false, error: String(r.status) };
  useDocumentStore.getState().setServerAttachmentSize(t.att, body.byteLength);
  return { ok: true, base: await sha256Hex(body) };
}

/** 오른쪽 칸·새 창이 함께 쓰는 '모아서 자동 저장' 도우미 */
export function createMdAutosaver(t: MdTarget, onState: (s: 'saving' | 'saved' | { error: string }) => void, initial: { markdown: string; base?: string }) {
  let last = initial.markdown;
  let base = initial.base;
  let pending: string | null = null;
  let timer: number | null = null;
  let busy = false;
  const flush = async () => {
    timer = null;
    if (busy || pending === null) return;
    const md = pending;
    pending = null;
    if (md === last) return;
    busy = true;
    onState('saving');
    const r = await saveMd(t, md, base);
    busy = false;
    if ('error' in r) onState({ error: r.error }); else { last = md; base = r.base ?? base; onState('saved'); }
    if (pending !== null && timer === null) timer = window.setTimeout(flush, 600);
  };
  return {
    change(md: string) { pending = md; if (timer !== null) window.clearTimeout(timer); timer = window.setTimeout(flush, 1000); },
    /** 지금 바로 (닫거나 새 창으로 옮기기 전에) */
    async now() { if (timer !== null) { window.clearTimeout(timer); timer = null; } await flush(); },
    get latest() { return pending ?? last; },
  };
}
