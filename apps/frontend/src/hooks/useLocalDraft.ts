// useLocalDraft — 편집을 **브라우저에 즉시 보관**한다 (2026-08-05 R1·R2).
//
// 자동저장은 "손을 멈춘 뒤 1.5초"에 서버로 간다. 그 사이 크래시·전원
// 차단·오프라인이면 그 편집은 어디에도 없다. beforeunload 경고는 정상
// 종료에서만 뜨므로 크래시는 못 잡는다. 그래서 **1초 간격**으로 문서
// 전체를 IndexedDB 에 적어 두고, 다음에 앱을 열 때 되살린다.
//
// 간격을 1초로 잡은 이유 (0.3초에서 상향 — 사용자 검토):
//   · 사진이 내장된 맵은 스냅샷이 수 MB다. 직렬화 비용이 있으므로
//     0.3초는 타이핑 중 프레임을 갉아먹을 수 있다.
//   · 1초면 최악의 유실이 "마지막 1초"로 제한된다 — 체감 차이가 없다.
import { useEffect } from 'react';
import { useDocumentStore, isDocumentEmpty } from '@/stores/documentStore';
import { useEditorUiStore } from '@/stores/editorUiStore';
import { useCloudStore } from '@/stores/cloudStore';
import { putDraft, deleteDraft, UNSAVED_DRAFT_KEY } from '@/utils/localDraft';

const DRAFT_MS = 1000;

let timer: number | undefined;

function countNodes(list: { children?: unknown[] }[]): number {
  return list.reduce(
    (n, x) => n + 1 + countNodes((x.children ?? []) as { children?: unknown[] }[]),
    0,
  );
}

/** 지금 화면의 문서를 초안으로 적는다 (서버 저장 성공 시 호출부가 지운다) */
export async function writeLocalDraftNow(): Promise<void> {
  const doc = useDocumentStore.getState();
  const ui = useEditorUiStore.getState();
  const cloud = useCloudStore.getState();
  const map = doc.map;
  // 잃을 것이 없는 빈 문서는 적지 않는다 (복구 안내가 헛돌지 않게)
  if (isDocumentEmpty(map) || (map.branches?.length ?? 0) === 0) return;
  await putDraft({
    key: cloud.cloudMapId ?? UNSAVED_DRAFT_KEY,
    snapshot: {
      v: 2,
      map,
      editor: { layoutType: ui.layoutType, spacingX: ui.spacingX, spacingY: ui.spacingY },
    },
    title: cloud.cloudTitle ?? map.title,
    savedAt: new Date().toISOString(),
    nodeCount: 1 + countNodes(map.branches as { children?: unknown[] }[]),
  });
}

/** 서버 저장에 성공했으면 그 맵의 초안은 필요 없다 */
export async function clearLocalDraft(mapId: string | null): Promise<void> {
  await deleteDraft(mapId ?? UNSAVED_DRAFT_KEY);
  // 미저장 문서가 처음 저장되면 'unsaved' 초안도 함께 정리한다
  if (mapId) await deleteDraft(UNSAVED_DRAFT_KEY);
}

export function useLocalDraft(): void {
  useEffect(() => {
    const unsub = useDocumentStore.subscribe((state, prev) => {
      if (state.map === prev.map) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => { void writeLocalDraftNow(); }, DRAFT_MS);
    });
    return () => { unsub(); window.clearTimeout(timer); };
  }, []);
}
