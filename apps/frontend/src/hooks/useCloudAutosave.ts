// 클라우드 자동 저장 — 문서가 서버 맵에 연결(cloudMapId)돼 있을 때만,
// 편집이 멈춘 뒤 잠깐(디바운스) 있다가 전체 스냅샷을 서버에 올린다.
// 저장 상태는 상단 툴바 배지(useAutosaveStore)로 표시된다.
//
// 안전장치:
//  - cloudMapId 가 없으면(미연결) 절대 자동 저장하지 않는다 → 실수로 서버
//    맵을 기본 문서로 덮어쓰는 일이 없다.
//  - 방금 "열기/저장"으로 문서가 바뀐 직후에는 잠깐 억제(suppress)해
//    불필요한 재저장을 막는다.
import { useEffect } from 'react';
import { useDocumentStore } from '@/stores/documentStore';
import { useCloudStore } from '@/stores/cloudStore';
import { useAutosaveStore } from '@/stores/autosaveStore';
import { cloudApi, CloudError } from '@/services/cloud/apiClient';

const DEBOUNCE_MS = 1500;

let timer: number | undefined;
let saving = false;
let rerun = false;
let skipNextChange = false;

/**
 * 바로 다음 "맵 변경" 1건만 자동저장에서 제외한다. 열기(loadMap)로 문서를
 * 통째로 교체한 직후, 방금 불러온 그 문서를 곧바로 되쓰지 않기 위함.
 * (수동 저장은 맵을 바꾸지 않으므로 호출할 필요가 없다.)
 */
export function suppressCloudAutosave(): void {
  skipNextChange = true;
}

function snapshot() {
  const st = useDocumentStore.getState();
  return { v: 1, map: st.map, kanban: st.kanban };
}

async function doSave() {
  const cloud = useCloudStore.getState();
  const mapId = cloud.cloudMapId;
  if (!mapId) return;
  if (saving) { rerun = true; return; }
  saving = true;
  useAutosaveStore.getState().setSaveState('saving');
  try {
    const title = useDocumentStore.getState().map.title || '제목 없는 맵';
    const res = await cloudApi.saveDocument(mapId, snapshot(), title);
    useCloudStore.getState().link(mapId, res.updatedAt);
    useAutosaveStore.getState().setSaveState('saved');
  } catch (err) {
    useAutosaveStore.getState().setSaveState('error');
    useCloudStore.getState().setError(
      err instanceof CloudError ? err.message : '자동 저장 실패',
    );
  } finally {
    saving = false;
    if (rerun) { rerun = false; void doSave(); }
  }
}

export function useCloudAutosave(): void {
  useEffect(() => {
    const unsub = useDocumentStore.subscribe((state, prev) => {
      if (state.map === prev.map) return; // 맵 변경일 때만
      if (!useCloudStore.getState().cloudMapId) return; // 미연결이면 무시
      if (skipNextChange) { skipNextChange = false; return; } // 열기 직후 1건 제외
      useAutosaveStore.getState().setSaveState('dirty');
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void doSave(), DEBOUNCE_MS);
    });
    return () => {
      unsub();
      window.clearTimeout(timer);
    };
  }, []);
}
