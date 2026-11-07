// 간트 새 탭·새 창 화면 `/?gantt=<편집 탭 id>` (2026-11-07).
// 맵을 서버에서 읽지 않고, 그 편집 탭이 BroadcastChannel 로 보내 주는 간트 줄을 그린다 (ganttLink.ts).
import { useEffect, useRef, useState } from 'react';
import { THEMES } from '@/components/design-tokens/theme';
import { useTr } from '@/i18n';
import { GanttView } from '@/editor/gantt/GanttView';
import { ganttChannelName, type GanttMsg } from '@/editor/gantt/ganttLink';
import type { GanttData } from '@/editor/gantt/ganttModel';

export function GanttWindowPage({ tabId }: { tabId: string }) {
  const tr = useTr();
  const [state, setState] = useState<{ data: GanttData; title: string; selectedId: string | null; theme: 'light' | 'dark'; editable: boolean; me: { name?: string; email?: string } | null } | null>(null);
  const [lost, setLost] = useState(false);
  const chRef = useRef<BroadcastChannel | null>(null);
  const lastSeen = useRef(Date.now());

  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') { setLost(true); return; }
    const ch = new BroadcastChannel(ganttChannelName(tabId));
    chRef.current = ch;
    ch.onmessage = (e: MessageEvent<GanttMsg>) => {
      const m = e.data;
      if (m?.type === 'state') { lastSeen.current = Date.now(); setLost(false); setState({ data: m.data, title: m.title, selectedId: m.selectedId, theme: m.theme, editable: m.editable !== false, me: m.me ?? null }); }
      else if (m?.type === 'bye') setLost(true);
    };
    const hello = () => ch.postMessage({ type: 'hello' } satisfies GanttMsg);
    hello();
    // 5초마다 안부 — 12초 넘게 답이 없으면 끊긴 것으로 본다(편집 탭이 닫혔거나 다른 곳으로 갔다)
    const iv = window.setInterval(() => { hello(); if (Date.now() - lastSeen.current > 12000) setLost(true); }, 5000);
    return () => { window.clearInterval(iv); ch.close(); };
  }, [tabId]);

  useEffect(() => {
    document.title = state?.title ? `${state.title} — ${tr('editor.gantt.title')}` : `EasyMindMap — ${tr('editor.gantt.title')}`;
  }, [state?.title, tr]);

  const t = THEMES[state?.theme ?? 'light'];
  return (
    <div data-testid="gantt-window" style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', background: t.surface, color: t.text, fontFamily: 'inherit' }}>
      <div style={{ padding: '8px 12px', borderBottom: `1px solid ${t.border}`, fontSize: 13.5, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span>EasyMindMap</span>
        <span style={{ color: t.textMuted, fontWeight: 500 }}>{state?.title ?? ''}</span>
      </div>
      {lost && (
        <div data-testid="gantt-lost" style={{ padding: '8px 12px', background: '#FDECEA', color: '#8A1C1C', fontSize: 12.5 }}>{tr('editor.gantt.lost')}</div>
      )}
      <div style={{ flex: 1, minHeight: 0 }}>
        {state ? (
          <GanttView t={t} data={state.data} selectedId={state.selectedId} fill
            editable={state.editable && !lost} me={state.me}
            onChangeDates={(id, patch) => chRef.current?.postMessage({ type: 'setDates', id, patch } satisfies GanttMsg)}
            onSelect={(id) => { chRef.current?.postMessage({ type: 'select', id } satisfies GanttMsg); setState((s) => (s ? { ...s, selectedId: id } : s)); }} />
        ) : !lost ? (
          <div style={{ padding: 18, fontSize: 12.5, color: t.textMuted }}>{tr('editor.gantt.waiting')}</div>
        ) : null}
      </div>
    </div>
  );
}
