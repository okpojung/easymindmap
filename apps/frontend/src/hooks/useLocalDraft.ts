// useLocalDraft — 편집을 **브라우저에 즉시 보관**한다 (2026-08-05 R1·R2).
//
// 서버 자동저장은 **주기(기본 5분)와 몇몇 시점**에만 간다 (§7.9). 그 사이
// 크래시·전원 차단·오프라인이면 그 편집은 어디에도 없다. beforeunload
// 경고는 정상 종료에서만 뜨므로 크래시는 못 잡는다. 그래서 문서 전체를
// IndexedDB 에 적어 두고, 다음에 앱을 열 때 되살린다 — **유실 방어는
// 서버 저장 주기가 아니라 이 초안이 전담한다.**
//
// **언제 적는가** (2026-08-06 — "마지막 1초"까지 없애기)
//   1. **노드 수가 바뀌면 즉시** — 추가·삭제·붙여넣기·이동 같은 구조
//      변경은 드물게 일어나고 잃으면 가장 아프다. 디바운스하지 않는다.
//   2. **그 밖의 변경(주로 타이핑)은 1초 디바운스** — 글자마다 수 MB
//      스냅샷을 직렬화하면 타이핑이 끊긴다.
//   2-1. **접기/펴기는 아예 적지 않는다** — 내용이 아니라 보기 상태다
//      (2026-08-06 사용자 결정).
//   3. **화면에서 벗어나는 순간 즉시**(`visibilitychange` → hidden,
//      `pagehide`) — 탭 전환·앱 전환·창 닫기·모바일 백그라운드 진입.
//      이 시점은 페이지가 아직 살아 있어 IndexedDB 쓰기가 끝난다.
//      (R6 — 백그라운드로 밀린 예약 저장 문제도 여기서 함께 해소된다)
//
// 그래서 남는 노출은 **"타이핑 중 예고 없는 전원 차단"** 한 가지뿐이고,
// 그 경우에도 마지막 글자 몇 개를 제외한 문서 전체는 남는다.
import { useEffect } from 'react';
import { useDocumentStore, isDocumentEmpty, isViewOnlyChange } from '@/stores/documentStore';
import { useEditorUiStore } from '@/stores/editorUiStore';
import { useCloudStore } from '@/stores/cloudStore';
import { useAutosaveStore } from '@/stores/autosaveStore';
import { putDraft, deleteDraft, UNSAVED_DRAFT_KEY } from '@/utils/localDraft';

const DRAFT_MS = 1000;

let timer: number | undefined;
/** 직전에 본 노드 수 — 바뀌면 "구조 변경"으로 보고 즉시 적는다 */
let lastCount = -1;

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
  // **이미 서버에 다 들어간 문서는 적지 않는다.** 적어 두면 다음 실행에서
  // 잃은 것이 없는데도 "저장되지 않은 맵이 있습니다"가 떠서, 진짜 경고와
  // 구분이 안 된다 (탭 전환마다 배너가 뜨는 문제).
  if (useAutosaveStore.getState().saveState === 'saved') return;
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
      if (isViewOnlyChange()) return; // 접기/펴기는 초안도 다시 쓰지 않는다
      const n = countNodes(state.map.branches as { children?: unknown[] }[]);
      const structural = lastCount >= 0 && n !== lastCount;
      lastCount = n;
      window.clearTimeout(timer);
      if (structural) {
        // 노드 추가·삭제·붙여넣기 — 기다리지 않는다
        void writeLocalDraftNow();
        return;
      }
      timer = window.setTimeout(() => { void writeLocalDraftNow(); }, DRAFT_MS);
    });

    // 전역 레이아웃·간격도 스냅샷(`editor`)에 들어가므로 함께 지킨다 —
    // 여기를 빠뜨리면 "간격만 조절하고 껐다" 가 초안에도 안 남는다.
    const unsubUi = useEditorUiStore.subscribe((s, p) => {
      if (s.layoutType === p.layoutType
        && s.spacingX === p.spacingX && s.spacingY === p.spacingY) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => { void writeLocalDraftNow(); }, DRAFT_MS);
    });

    // **화면에서 벗어나는 순간 즉시 적는다.**
    // visibilitychange(hidden) 는 탭 전환·앱 전환·창 닫기 직전에 뜨고,
    // 이때 페이지는 아직 완전히 살아 있어 IndexedDB 쓰기가 끝난다.
    // pagehide 는 그 뒤의 마지막 보루다(브라우저에 따라 못 끝낼 수 있다).
    const flush = () => {
      window.clearTimeout(timer);
      void writeLocalDraftNow();
    };
    const onVis = () => { if (document.visibilityState === 'hidden') flush(); };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', flush);

    return () => {
      unsub();
      unsubUi();
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pagehide', flush);
    };
  }, []);
}
