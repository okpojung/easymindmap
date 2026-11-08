// 마크다운 첨부 편집기 — 편집 영역 오른쪽 칸 + 새 탭·새 창 (2026-11-08 사용자 요청).
//
//   [📝 회의록.md · 맵에 반영됨]          [↗ 새 탭] [⧉ 새 창] [✕]
//   ┌ /md-editor/ (iframe, 렌더링 보기) ┐
//
// 새 탭·새 창으로 옮기면 이 칸은 닫힌다. 그 창의 [EMM 창에서 열기] 를 누르면 그 창이 닫히고 다시 이 칸에 열린다.
import { useEffect, useRef, useState } from 'react';
import type { ThemeTokens } from '@/components/design-tokens/theme';
import { useEditorUiStore } from '@/stores/editorUiStore';
import { useTr, tr as trNow } from '@/i18n';
import { GANTT_TAB_ID } from '@/editor/gantt/ganttLink';
import { createMdAutosaver, loadMd, mdEmbedSrc, mdTargetFromKey, mdTargetKey, type MdTarget } from '@/utils/mdSession';

export function mdChannelName(id: string): string { return `emm-md-${id}`; }

export type MdSaveState = 'saving' | 'saved' | { error: string };
export type MdMsg =
  | { type: 'md-hello'; key: string }
  | { type: 'md-load'; key: string; markdown: string; readOnly: boolean }
  | { type: 'md-fail'; key: string; error: string }
  | { type: 'md-change'; key: string; markdown: string; now?: boolean }
  | { type: 'md-state'; key: string; state: MdSaveState; markdown?: string }
  | { type: 'md-dock'; key: string; name: string; markdown?: string }
  | { type: 'bye' };

/** 저장 상태 글 */
export function mdStateText(s: MdSaveState | null, kind: MdTarget['kind']): string {
  if (s === null) return '';
  if (s === 'saving') return trNow('editor.md.saving');
  if (s === 'saved') return kind === 'embedded' ? trNow('editor.md.savedMap') : trNow('editor.md.savedServer');
  if (s.error === 'readonly') return trNow('editor.md.readOnly');
  if (s.error === 'gone') return trNow('editor.md.gone');
  if (s.error === 'conflict') return trNow('editor.md.conflict');
  return trNow('editor.md.saveFail', { error: s.error });
}

/** 편집기를 새 탭('tab')·새 창('window')으로 연다 */
export function openMdWindow(t: MdTarget, mode: 'tab' | 'window'): boolean {
  useEditorUiStore.getState().setMdRemote(true);
  const url = `${window.location.origin}/?mdedit=${encodeURIComponent(GANTT_TAB_ID)}&key=${encodeURIComponent(mdTargetKey(t))}&name=${encodeURIComponent(t.name)}`;
  try {
    const w = mode === 'window'
      ? window.open(url, `emm-md-${GANTT_TAB_ID}-${mdTargetKey(t)}`.replace(/[^\w-]/g, '_'), 'popup=yes,width=1100,height=820')
      : window.open(url, '_blank');
    return !!w;
  } catch { return false; }
}

/**
 * iframe 편집기와 이야기하기 (편집기 원본 v1.0.3 의 부모 저장 규약, okpojung/markdown-editor docs/iframe-embed.md)
 *   편집기 → 부모  mde:ready · mde:change {markdown} (자동저장용) · mde:save {markdown} ([EMM에 저장]·Ctrl+S) · mde:close
 *   부모 → 편집기  mde:config {name, saveLabel} → mde:set {markdown} → mde:mode
 *                  저장이 **실제로 끝난 뒤에만** mde:saved {markdown: 저장한 내용} (실패면 {ok:false})
 * 같은 출처·이 iframe 이 보낸 것만 받는다.
 */
export function useMdFrame(frame: React.RefObject<HTMLIFrameElement | null>, opts: {
  content: string | null; name: string; rendered: boolean;
  onChange: (md: string) => void; onSave?: (md: string) => void; onClose?: () => void;
}) {
  const tr = useTr();
  const ready = useRef(false);
  const pushed = useRef<string | null>(null);
  const optsRef = useRef(opts); optsRef.current = opts;
  const post = (msg: unknown) => frame.current?.contentWindow?.postMessage(msg, window.location.origin);
  const push = () => {
    const o = optsRef.current;
    if (!frame.current?.contentWindow || o.content === null) return;
    post({ type: 'mde:config', name: o.name, saveLabel: tr('editor.md.saveLabel') });
    post({ type: 'mde:set', markdown: o.content });
    if (o.rendered) post({ type: 'mde:mode', mode: 'rendered' });
    pushed.current = o.content;
  };
  useEffect(() => {
    const on = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow || e.origin !== window.location.origin) return;
      const d = e.data as { type?: string; markdown?: unknown } | null;
      if (!d || typeof d !== 'object') return;
      if (d.type === 'mde:ready') { ready.current = true; push(); }
      else if (d.type === 'mde:change' && typeof d.markdown === 'string') optsRef.current.onChange(d.markdown);
      else if (d.type === 'mde:save' && typeof d.markdown === 'string') (optsRef.current.onSave ?? optsRef.current.onChange)(d.markdown);
      // 편집기 안의 [✕ 닫기] — 칸(또는 창)을 닫는다
      else if (d.type === 'mde:close') optsRef.current.onClose?.();
    };
    window.addEventListener('message', on);
    return () => window.removeEventListener('message', on);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frame]);
  // 내용이 늦게 오면(편집기가 먼저 준비됨) 그때 넣는다
  useEffect(() => { if (ready.current && opts.content !== null && pushed.current === null) push(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [opts.content]);
  return {
    /** iframe 새로 뜰 때 */
    onLoad: () => { ready.current = false; pushed.current = null; },
    /** 저장 성공 — 그 스냅샷으로 편집기의 '저장 안 됨' 을 지운다 */
    ack: (markdown: string) => post({ type: 'mde:saved', markdown }),
    fail: () => post({ type: 'mde:saved', ok: false }),
  };
}

export function MdEditorDock({ t, target, onBlocked }: { t: ThemeTokens; target: MdTarget; onBlocked?: () => void }) {
  const tr = useTr();
  const setDock = useEditorUiStore((s) => s.setMdDock);
  const ratio = useEditorUiStore((s) => s.mdDockRatio);
  const setRatio = useEditorUiStore((s) => s.setMdDockRatio);
  const frame = useRef<HTMLIFrameElement | null>(null);
  const [loaded, setLoaded] = useState<{ markdown: string; readOnly: boolean; base?: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [state, setState] = useState<MdSaveState | null>(null);
  const saver = useRef<ReturnType<typeof createMdAutosaver> | null>(null);
  const frameApi = useRef<{ ack: (md: string) => void; fail: () => void } | null>(null);
  const box = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{ x: number; w: number; total: number } | null>(null);

  useEffect(() => {
    let alive = true;
    loadMd(target).then((r) => {
      if (!alive) return;
      setLoaded(r);
      saver.current = createMdAutosaver(target, (st, savedMd) => {
        setState(st);
        if (st === 'saved' && typeof savedMd === 'string') frameApi.current?.ack(savedMd);
        else if (typeof st === 'object') frameApi.current?.fail();
      }, r);
      if (r.readOnly) setState({ error: 'readonly' });
    }).catch((e: Error) => { if (alive) setErr(e.message || 'error'); });
    return () => { alive = false; void saver.current?.now(); };
  }, [target]);

  const api = useMdFrame(frame, {
    content: loaded?.markdown ?? null, name: target.name, rendered: true,
    onChange: (md) => { if (!loaded?.readOnly) saver.current?.change(md); },
    // [EMM에 저장]·Ctrl+S — 바로 저장
    onSave: (md) => { if (loaded?.readOnly) { frameApi.current?.fail(); return; } saver.current?.change(md); void saver.current?.now(); },
    onClose: () => void close(),
  });
  frameApi.current = api;
  const onLoad = api.onLoad;

  const moveOut = async (mode: 'tab' | 'window') => {
    await saver.current?.now();
    if (!openMdWindow(target, mode)) { onBlocked?.(); return; }
    setDock(null);
  };
  const close = async () => { await saver.current?.now(); setDock(null); };

  const smallBtn: React.CSSProperties = { fontSize: 11.5, padding: '3px 8px', borderRadius: 6, cursor: 'pointer', border: `1px solid ${t.border}`, background: t.surface, color: t.text, whiteSpace: 'nowrap' };
  return (
    <div ref={box} data-testid="md-dock" style={{ width: `${ratio * 100}%`, minWidth: 320, flexShrink: 0, display: 'flex', flexDirection: 'column', borderLeft: `1px solid ${t.border}`, position: 'relative', background: t.surface }}>
      {/* 왼쪽 경계를 끌어 폭 조절 */}
      <div
        title={tr('editor.gantt.drag')}
        onPointerDown={(e) => { const par = box.current?.parentElement; drag.current = { x: e.clientX, w: box.current?.offsetWidth ?? 0, total: par?.offsetWidth ?? 1 }; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); }}
        onPointerMove={(e) => { const d = drag.current; if (d) setRatio((d.w - (e.clientX - d.x)) / d.total); }}
        onPointerUp={() => { drag.current = null; }}
        style={{ position: 'absolute', left: -4, top: 0, bottom: 0, width: 8, cursor: 'col-resize', zIndex: 5 }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderBottom: `1px solid ${t.divider}`, background: t.surfaceAlt, flexShrink: 0 }}>
        <span style={{ fontSize: 12.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }} title={target.name}>📝 {target.name}</span>
        <span data-testid="md-dock-state" style={{ fontSize: 11, color: state && typeof state === 'object' && state.error !== 'readonly' ? '#B42318' : t.textMuted, whiteSpace: 'nowrap' }}>{mdStateText(state, target.kind) || tr('editor.md.autosave')}</span>
        <span style={{ flex: 1 }} />
        <button type="button" data-testid="md-dock-newtab" style={smallBtn} onClick={() => void moveOut('tab')}>↗ {tr('editor.gantt.newTab')}</button>
        <button type="button" data-testid="md-dock-newwindow" style={smallBtn} onClick={() => void moveOut('window')}>⧉ {tr('editor.gantt.newWindow')}</button>
        <button type="button" data-testid="md-dock-close" aria-label={tr('editor.gantt.close')} title={tr('editor.gantt.close')} style={{ ...smallBtn, padding: '3px 7px' }} onClick={() => void close()}>✕</button>
      </div>
      {err ? (
        <div data-testid="md-dock-error" style={{ padding: 16, fontSize: 12.5, color: '#B42318' }}>{err === 'gone' ? tr('editor.md.gone') : tr('editor.md.loadFail', { error: err })}</div>
      ) : (
        <iframe ref={frame} data-testid="md-dock-frame" title={target.name} src={mdEmbedSrc()} onLoad={onLoad}
          style={{ flex: 1, minHeight: 0, width: '100%', border: 'none', background: '#fff', visibility: loaded ? 'visible' : 'hidden' }} />
      )}
    </div>
  );
}

/**
 * 새 탭·새 창 편집기와 주고받기 — 그 창이 처음 열 때 내용을 건네고, 고친 내용을 첨부에 저장하고,
 * [EMM 창에서 열기] 를 받으면 오른쪽 칸으로 되돌린다.
 */
export function MdBroadcaster() {
  const remote = useEditorUiStore((s) => s.mdRemote);
  useEffect(() => {
    if (!remote || typeof BroadcastChannel === 'undefined') return;
    const ch = new BroadcastChannel(mdChannelName(GANTT_TAB_ID));
    const savers = new Map<string, ReturnType<typeof createMdAutosaver>>();
    const post = (m: MdMsg) => ch.postMessage(m);
    ch.onmessage = async (e: MessageEvent<MdMsg>) => {
      const m = e.data;
      if (!m || m.type === 'bye' || typeof m.key !== 'string') return;
      const key = m.key;
      if (m.type === 'md-hello') {
        const tgt = mdTargetFromKey(key, '');
        if (!tgt) { post({ type: 'md-fail', key, error: 'gone' }); return; }
        try {
          const r = await loadMd(tgt);
          savers.set(key, createMdAutosaver(tgt, (state, savedMd) => post({ type: 'md-state', key, state, ...(state === 'saved' && typeof savedMd === 'string' ? { markdown: savedMd } : {}) }), r));
          post({ type: 'md-load', key, markdown: r.markdown, readOnly: r.readOnly });
        } catch (er) { post({ type: 'md-fail', key, error: (er as Error).message || 'error' }); }
      } else if (m.type === 'md-change') {
        const sv = savers.get(key);
        sv?.change(m.markdown);
        if (m.now) void sv?.now();
      } else if (m.type === 'md-dock') {
        const s = savers.get(key);
        if (s) { if (typeof m.markdown === 'string') s.change(m.markdown); await s.now(); }
        const tgt = mdTargetFromKey(key, m.name || 'md');
        if (tgt) useEditorUiStore.getState().setMdDock(tgt);
        savers.delete(key);
        window.focus();
      }
    };
    const bye = () => { try { post({ type: 'bye' }); } catch { /* 닫히는 중 */ } };
    window.addEventListener('pagehide', bye);
    return () => { window.removeEventListener('pagehide', bye); for (const s of savers.values()) void s.now(); ch.close(); };
  }, [remote]);
  return null;
}
