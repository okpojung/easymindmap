// 편집 영역 아래 간트 칸 + 새 탭·새 창으로 맵 상태 보내기 (2026-11-07).
import { useEffect, useMemo, useRef } from 'react';
import type { ThemeTokens } from '@/components/design-tokens/theme';
import { useDocumentStore } from '@/stores/documentStore';
import { useInteractionStore } from '@/stores/interactionStore';
import { useViewportStore } from '@/stores/viewportStore';
import { useEditorUiStore } from '@/stores/editorUiStore';
import { useCloudStore } from '@/stores/cloudStore';
import { useProfileStore } from '@/stores/profileStore';
import { useAuthStore } from '@/stores/authStore';
import { isValidDate } from '@/editor/node-renderer/projectTags';
import { useTr } from '@/i18n';
import { buildGanttRows } from './ganttModel';
import { GanttView } from './GanttView';
import { GANTT_TAB_ID, ganttChannelName, openGanttWindow, type GanttMsg } from './ganttLink';

/** 맵에서 그 노드를 골라 화면 가운데로 (접힌 조상은 펼친다) */
export function revealNode(id: string): void {
  useInteractionStore.getState().setSelectedId(id);
  useDocumentStore.getState().expandAncestors(id);
  const vp = useViewportStore.getState();
  vp.requestCenterNode(id, vp.zoom);
}

/** 끌어서 바꾼 날짜를 노드의 프로젝트 태그에 쓴다 (읽기 전용 맵이면 아무것도 안 한다) */
export function applyGanttDates(id: string, patch: { start?: string; end?: string }): void {
  if (useCloudStore.getState().readOnlyInfo) return;
  const clean: { start?: string; end?: string } = {};
  if (isValidDate(patch.start)) clean.start = patch.start;
  if (isValidDate(patch.end)) clean.end = patch.end;
  if (!clean.start && !clean.end) return;
  useDocumentStore.getState().updateNodeProject(id, clean);
}

/** 지금 계정 — 작업 목록의 [나] */
function meNow(): { name?: string; email?: string } | null {
  const name = useProfileStore.getState().profile?.fullName || undefined;
  const email = useAuthStore.getState().session?.email || undefined;
  return name || email ? { name, email } : null;
}

/** 간트 열기 메뉴의 세 가지 — 아래 칸 · 새 탭 · 새 창 */
export function openGantt(mode: 'dock' | 'tab' | 'window', onBlocked?: () => void): void {
  const ui = useEditorUiStore.getState();
  if (mode === 'dock') { ui.setGanttDock(true); return; }
  ui.setGanttRemote(true);
  if (!openGanttWindow(mode)) onBlocked?.();
}

export function GanttDock({ t, onBlocked }: { t: ThemeTokens; onBlocked?: () => void }) {
  const tr = useTr();
  const map = useDocumentStore((s) => s.map);
  const selectedId = useInteractionStore((s) => s.selectedId);
  const h = useEditorUiStore((s) => s.ganttDockH);
  const setH = useEditorUiStore((s) => s.setGanttDockH);
  const setDock = useEditorUiStore((s) => s.setGanttDock);
  const data = useMemo(() => buildGanttRows(map), [map]);
  const readOnly = useCloudStore((s) => !!s.readOnlyInfo);
  const myName = useProfileStore((s) => s.profile?.fullName);
  const myEmail = useAuthStore((s) => s.session?.email);
  const me = useMemo(() => (myName || myEmail ? { name: myName || undefined, email: myEmail || undefined } : null), [myName, myEmail]);
  const drag = useRef<{ y: number; h: number } | null>(null);

  const smallBtn: React.CSSProperties = {
    fontSize: 11.5, padding: '3px 8px', borderRadius: 6, cursor: 'pointer',
    border: `1px solid ${t.border}`, background: t.surface, color: t.text,
  };
  return (
    <div data-testid="gantt-dock" style={{ height: h, flexShrink: 0, display: 'flex', flexDirection: 'column', borderTop: `1px solid ${t.border}`, minHeight: 0, position: 'relative' }}>
      {/* 위 경계를 끌어 높이 조절 */}
      <div
        title={tr('editor.gantt.drag')}
        onPointerDown={(e) => { drag.current = { y: e.clientY, h }; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); }}
        onPointerMove={(e) => { if (drag.current) setH(drag.current.h - (e.clientY - drag.current.y)); }}
        onPointerUp={() => { drag.current = null; }}
        style={{ position: 'absolute', left: 0, right: 0, top: -4, height: 8, cursor: 'row-resize', zIndex: 5 }}
      />
      <GanttView
        t={t} data={data} selectedId={selectedId} fill
        onSelect={revealNode}
        editable={!readOnly} onChangeDates={applyGanttDates} me={me}
        toolbar={(
          <div style={{ display: 'flex', gap: 4 }}>
            <button type="button" data-testid="gantt-dock-newtab" style={smallBtn} onClick={() => openGantt('tab', onBlocked)}>↗ {tr('editor.gantt.newTab')}</button>
            <button type="button" data-testid="gantt-dock-newwindow" style={smallBtn} onClick={() => openGantt('window', onBlocked)}>⧉ {tr('editor.gantt.newWindow')}</button>
            <button type="button" data-testid="gantt-dock-close" aria-label={tr('editor.gantt.close')} title={tr('editor.gantt.close')} style={{ ...smallBtn, padding: '3px 7px' }} onClick={() => setDock(false)}>✕</button>
          </div>
        )}
      />
    </div>
  );
}

/**
 * 새 탭·새 창 간트에 이 탭의 맵을 보낸다. 간트 창을 한 번이라도 열었을 때만 돈다.
 * 큰 맵에서 글자마다 보내지 않도록 0.3초 모아서 보낸다.
 */
export function GanttBroadcaster() {
  const remote = useEditorUiStore((s) => s.ganttRemote);
  useEffect(() => {
    if (!remote || typeof BroadcastChannel === 'undefined') return;
    const ch = new BroadcastChannel(ganttChannelName(GANTT_TAB_ID));
    let timer: number | null = null;
    let cache: { map: unknown; data: ReturnType<typeof buildGanttRows> } | null = null;
    const send = () => {
      timer = null;
      const map = useDocumentStore.getState().map;
      if (!cache || cache.map !== map) cache = { map, data: buildGanttRows(map) };
      const msg: GanttMsg = {
        type: 'state', data: cache.data, title: map.title ?? '',
        selectedId: useInteractionStore.getState().selectedId ?? null,
        theme: useEditorUiStore.getState().themeName,
        editable: !useCloudStore.getState().readOnlyInfo,
        me: meNow(),
      };
      ch.postMessage(msg);
    };
    const schedule = () => { if (timer === null) timer = window.setTimeout(send, 300); };
    ch.onmessage = (e: MessageEvent<GanttMsg>) => {
      const m = e.data;
      if (m?.type === 'hello') send();
      else if (m?.type === 'select' && typeof m.id === 'string') revealNode(m.id);
      else if (m?.type === 'setDates' && typeof m.id === 'string' && m.patch) applyGanttDates(m.id, m.patch);
    };
    const u1 = useDocumentStore.subscribe((s, p) => { if (s.map !== p.map) schedule(); });
    const u2 = useInteractionStore.subscribe((s, p) => { if (s.selectedId !== p.selectedId) schedule(); });
    const u3 = useEditorUiStore.subscribe((s, p) => { if (s.themeName !== p.themeName) schedule(); });
    const u4 = useCloudStore.subscribe((s, p) => { if (s.readOnlyInfo !== p.readOnlyInfo) schedule(); });
    const bye = () => { try { ch.postMessage({ type: 'bye' } satisfies GanttMsg); } catch { /* 닫히는 중 */ } };
    window.addEventListener('pagehide', bye);
    send();
    return () => { u1(); u2(); u3(); u4(); window.removeEventListener('pagehide', bye); if (timer !== null) window.clearTimeout(timer); ch.close(); };
  }, [remote]);
  return null;
}
