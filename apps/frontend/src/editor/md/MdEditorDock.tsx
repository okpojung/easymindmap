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
  | { type: 'md-change'; key: string; markdown: string }
  | { type: 'md-state'; key: string; state: MdSaveState }
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

/** iframe 편집기와 이야기하기 — 내용 넣기·렌더링 보기·고친 내용 받기 */
export function useMdFrame(frame: React.RefObject<HTMLIFrameElement | null>, opts: {
  content: string | null; rendered: boolean; onChange: (md: string) => void;
}) {
  const echoed = useRef(false);
  const onChangeRef = useRef(opts.onChange); onChangeRef.current = opts.onChange;
  const optsRef = useRef(opts); optsRef.current = opts;
  useEffect(() => {
    const on = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow) return;
      const d = e.data as { type?: string; markdown?: unknown } | null;
      if (d?.type === 'mde:change' && typeof d.markdown === 'string') { echoed.current = true; onChangeRef.current(d.markdown); }
    };
    window.addEventListener('message', on);
    return () => window.removeEventListener('message', on);
  }, [frame]);
  const push = () => {
    const w = frame.current?.contentWindow;
    const o = optsRef.current;
    if (!w || o.content === null) return;
    w.postMessage({ type: 'mde:set', markdown: o.content }, window.location.origin);
    if (o.rendered) w.postMessage({ type: 'mde:mode', mode: 'rendered' }, window.location.origin);
  };
  // 편집기가 늦게 준비되면 한 번 더
  const onLoad = () => {
    echoed.current = false;
    push();
    window.setTimeout(() => { if (!echoed.current) push(); }, 1200);
  };
  return { onLoad };
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
  const box = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{ x: number; w: number; total: number } | null>(null);

  useEffect(() => {
    let alive = true;
    loadMd(target).then((r) => {
      if (!alive) return;
      setLoaded(r);
      saver.current = createMdAutosaver(target, setState, r);
      if (r.readOnly) setState({ error: 'readonly' });
    }).catch((e: Error) => { if (alive) setErr(e.message || 'error'); });
    return () => { alive = false; void saver.current?.now(); };
  }, [target]);

  const { onLoad } = useMdFrame(frame, {
    content: loaded?.markdown ?? null, rendered: true,
    onChange: (md) => { if (!loaded?.readOnly) saver.current?.change(md); },
  });
  // 내용을 받았을 때 iframe 이 이미 떠 있으면 바로 넣는다
  useEffect(() => {
    if (loaded && frame.current?.contentDocument?.readyState === 'complete') onLoad();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

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
          savers.set(key, createMdAutosaver(tgt, (state) => post({ type: 'md-state', key, state }), r));
          post({ type: 'md-load', key, markdown: r.markdown, readOnly: r.readOnly });
        } catch (er) { post({ type: 'md-fail', key, error: (er as Error).message || 'error' }); }
      } else if (m.type === 'md-change') {
        savers.get(key)?.change(m.markdown);
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
