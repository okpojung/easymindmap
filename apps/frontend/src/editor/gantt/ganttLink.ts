// 간트 새 탭·새 창 연결 (2026-11-07).
//
// 새 탭·새 창의 간트는 맵을 서버에서 다시 읽지 않는다 — **이 편집 탭과 같은 출처의
// BroadcastChannel** 로 간트 줄만 받아 그린다. 그래서 저장 전 맵도 보이고, 고치면 바로 따라온다.
// 간트에서 줄을 누르면 거꾸로 이 탭에 "그 노드 보여 줘"를 보낸다.
//   편집 탭  → {type:'state', rows, title, selectedId, theme}   (바뀔 때 · hello 를 받을 때)
//   간트 창  → {type:'hello'} (열릴 때 · 5초마다) · {type:'select', id}
//   편집 탭  → {type:'bye'} (탭을 닫을 때)
import type { GanttData } from './ganttModel';

/** 이 편집 탭의 이름표 — 간트 창 주소 `/?gantt=<id>` 에 실린다 */
export const GANTT_TAB_ID: string = (() => {
  try { return crypto.randomUUID().slice(0, 12); } catch { return Math.random().toString(36).slice(2, 14); }
})();

export function ganttChannelName(id: string): string { return `emm-gantt-${id}`; }

export type GanttMsg =
  | { type: 'state'; data: GanttData; title: string; selectedId: string | null; theme: 'light' | 'dark' }
  | { type: 'hello' }
  | { type: 'select'; id: string }
  | { type: 'bye' };

/** 간트를 새 탭('tab') 또는 새 창('window')으로 연다. 팝업이 막히면 false */
export function openGanttWindow(mode: 'tab' | 'window'): boolean {
  const url = `${window.location.origin}/?gantt=${encodeURIComponent(GANTT_TAB_ID)}`;
  try {
    const w = mode === 'window'
      ? window.open(url, `emm-gantt-${GANTT_TAB_ID}`, 'popup=yes,width=1280,height=760')
      : window.open(url, '_blank');
    return !!w;
  } catch {
    return false;
  }
}
