// 마크다운 편집기 새 탭·새 창 `/?mdedit=<편집 탭 id>&key=<첨부 키>&name=<파일 이름>` (2026-11-08).
// 편집기(iframe)는 오른쪽 칸과 같고, 내용·저장은 그 편집 탭이 BroadcastChannel 로 맡는다(MdEditorDock.tsx).
// [EMM 창에서 열기] → 이 창을 닫고 편집 탭의 오른쪽 칸에서 다시 연다.
import { useEffect, useRef, useState } from 'react';
import { THEMES } from '@/components/design-tokens/theme';
import { useEditorUiStore } from '@/stores/editorUiStore';
import { useTr } from '@/i18n';
import { mdChannelName, mdStateText, useMdFrame, type MdMsg, type MdSaveState } from '@/editor/md/MdEditorDock';
import { mdEmbedSrc, mdTargetFromKey } from '@/utils/mdSession';

export function MdEditorWindowPage({ tabId, mdKey, name }: { tabId: string; mdKey: string; name: string }) {
  const tr = useTr();
  const t = THEMES[useEditorUiStore((s) => s.themeName)];
  const frame = useRef<HTMLIFrameElement | null>(null);
  const chRef = useRef<BroadcastChannel | null>(null);
  const [content, setContent] = useState<{ markdown: string; readOnly: boolean } | null>(null);
  const [state, setState] = useState<MdSaveState | null>(null);
  const [lost, setLost] = useState(false);
  const [fail, setFail] = useState<string | null>(null);
  const latest = useRef<string | null>(null);
  const kind = mdTargetFromKey(mdKey, name)?.kind ?? 'embedded';

  useEffect(() => {
    document.title = `${name} — EasyMindMap`;
    if (typeof BroadcastChannel === 'undefined') { setLost(true); return; }
    const ch = new BroadcastChannel(mdChannelName(tabId));
    chRef.current = ch;
    let got = false;
    ch.onmessage = (e: MessageEvent<MdMsg>) => {
      const m = e.data;
      if (!m) return;
      if (m.type === 'bye') { setLost(true); return; }
      if (m.key !== mdKey) return;
      if (m.type === 'md-load') { got = true; latest.current = m.markdown; setContent({ markdown: m.markdown, readOnly: m.readOnly }); if (m.readOnly) setState({ error: 'readonly' }); }
      else if (m.type === 'md-fail') { got = true; setFail(m.error); }
      else if (m.type === 'md-state') setState(m.state);
    };
    ch.postMessage({ type: 'md-hello', key: mdKey } satisfies MdMsg);
    const tm = window.setTimeout(() => { if (!got) setLost(true); }, 6000);
    return () => { window.clearTimeout(tm); ch.close(); };
  }, [tabId, mdKey, name]);

  const { onLoad } = useMdFrame(frame, {
    content: content?.markdown ?? null, rendered: false,
    onChange: (md) => { latest.current = md; if (!content?.readOnly && !lost) chRef.current?.postMessage({ type: 'md-change', key: mdKey, markdown: md } satisfies MdMsg); },
  });
  useEffect(() => {
    if (content && frame.current?.contentDocument?.readyState === 'complete') onLoad();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content]);

  const backToEmm = () => {
    chRef.current?.postMessage({ type: 'md-dock', key: mdKey, name, ...(latest.current !== null ? { markdown: latest.current } : {}) } satisfies MdMsg);
    try { window.opener?.focus(); } catch { /* 다른 창 */ }
    window.setTimeout(() => window.close(), 150);
  };

  const btn: React.CSSProperties = { fontSize: 12, padding: '4px 10px', borderRadius: 7, cursor: 'pointer', border: `1px solid ${t.primaryBorder}`, background: t.primarySoft, color: t.primary, fontWeight: 700, whiteSpace: 'nowrap' };
  return (
    <div data-testid="md-window" style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', background: t.surface, color: t.text }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderBottom: `1px solid ${t.border}`, background: t.surfaceAlt, flexShrink: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 700 }}>EasyMindMap</span>
        <span style={{ fontSize: 12.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>📝 {name}</span>
        <span data-testid="md-window-state" style={{ fontSize: 11, color: t.textMuted, whiteSpace: 'nowrap' }}>{mdStateText(state, kind) || tr('editor.md.autosave')}</span>
        <span style={{ flex: 1 }} />
        {!lost && !fail && <button type="button" data-testid="md-back-to-emm" style={btn} onClick={backToEmm}>⇤ {tr('editor.dock.backToEmm')}</button>}
      </div>
      {lost && <div data-testid="md-lost" style={{ padding: '8px 12px', background: '#FDECEA', color: '#8A1C1C', fontSize: 12.5 }}>{tr('editor.md.lost')}</div>}
      {fail ? (
        <div style={{ padding: 16, fontSize: 12.5, color: '#B42318' }}>{fail === 'gone' ? tr('editor.md.gone') : tr('editor.md.loadFail', { error: fail })}</div>
      ) : (
        <iframe ref={frame} data-testid="md-window-frame" title={name} src={mdEmbedSrc()} onLoad={onLoad}
          style={{ flex: 1, minHeight: 0, width: '100%', border: 'none', background: '#fff', visibility: content ? 'visible' : 'hidden' }} />
      )}
    </div>
  );
}
