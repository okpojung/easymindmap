// 맵 변수의 **DB 값** (2026-10-30 사용자 요청) — 유료 모듈의 dashboard_vars.
//   값으로 보기·변수 패널이 쓴다. 문서 안의 정의(map.settings.variables)보다 DB 값이 우선이다
//   (대시보드맵에서 서버가 채우는 규칙과 같다 — pro vars.ts renderDoc).
//   유료 UI 가 없거나(proVarDb=null) 주인이 아니거나 기능이 꺼졌으면 status 가 'off' — 문서 값만 쓴다.
import { create } from 'zustand';
import { proVarDb, type VarDbRow } from '@pro';
import { useCloudStore } from './cloudStore';
import { setVarDbSource } from '@/utils/variables/mapVariables';

export type { VarDbRow };

interface VarDbState {
  mapId: string | null;
  rows: Record<string, VarDbRow>;
  status: 'idle' | 'loading' | 'ok' | 'off';
  /** 저장·지우기 실패 문장 (서버 문장 그대로) */
  error: string | null;
  load: (mapId: string, force?: boolean) => Promise<void>;
  save: (mapId: string, vars: Record<string, string>) => Promise<boolean>;
  remove: (mapId: string, name: string) => Promise<boolean>;
  clearError: () => void;
}

const errOf = (e: unknown) => (proVarDb?.errorText(e) || (e instanceof Error ? e.message : '')) || 'error';

export const useVarDbStore = create<VarDbState>((set, get) => ({
  mapId: null,
  rows: {},
  status: 'idle',
  error: null,
  load: async (mapId, force = false) => {
    if (!proVarDb) { set({ mapId, rows: {}, status: 'off' }); return; }
    const cur = get();
    if (!force && cur.mapId === mapId && (cur.status === 'ok' || cur.status === 'loading' || cur.status === 'off')) return;
    set({ mapId, status: 'loading', ...(cur.mapId !== mapId ? { rows: {} } : {}) });
    try {
      const list = await proVarDb.load(mapId);
      if (get().mapId !== mapId) return;
      set({ rows: Object.fromEntries(list.map((r) => [r.name, r])), status: 'ok' });
    } catch {
      if (get().mapId !== mapId) return;
      set({ rows: {}, status: 'off' });
    }
  },
  save: async (mapId, vars) => {
    if (!proVarDb) return false;
    try {
      await proVarDb.save(mapId, vars);
      set({ error: null });
      await get().load(mapId, true);
      return true;
    } catch (e) { set({ error: errOf(e) }); return false; }
  },
  remove: async (mapId, name) => {
    if (!proVarDb) return false;
    try {
      await proVarDb.remove(mapId, name);
      set({ error: null });
      await get().load(mapId, true);
      return true;
    } catch (e) { set({ error: errOf(e) }); return false; }
  },
  clearError: () => set({ error: null }),
}));

/** 지금 열린 맵 id — 편집 중이면 cloudMapId, 대시보드·읽기 전용이면 readOnlyInfo */
export function currentMapId(): string | null {
  const c = useCloudStore.getState();
  return c.cloudMapId ?? c.readOnlyInfo?.mapId ?? null;
}

/** 지금 열린 맵의 DB 값 {이름: 값} — 다른 맵의 것이거나 못 읽었으면 undefined */
export function currentDbValues(): Record<string, string> | undefined {
  const s = useVarDbStore.getState();
  if (s.status !== 'ok' || !s.mapId || s.mapId !== currentMapId()) return undefined;
  return Object.fromEntries(Object.values(s.rows).map((r) => [r.name, r.value]));
}

// HTML 내보내기(exportHtml)도 같은 값을 쓰게 — 내보내기가 스토어를 직접 들이지 않도록 등록만 한다
setVarDbSource(currentDbValues);
