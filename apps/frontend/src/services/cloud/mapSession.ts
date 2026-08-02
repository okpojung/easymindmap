// mapSession — "지금 편집 중인 맵"의 세션 동작 모음 (저장 / 닫기 / 열기).
//
// 2026-08-02 로그인 UI 정리에서 도입. 그 전에는 같은 저장·닫기 로직이
// 상단 클라우드 메뉴와 좌측 새 맵 패널에 중복돼 있었다. 한 곳에 모아
// 호출부(상단 툴바·좌측 패널·히스토리 패널)가 같은 규칙을 따르게 한다.
//
// **탭 정책** (2026-08-02 사용자 결정): 다른 맵을 여는 것은 브라우저
// **새 탭**(`?map=<id>`)이다. 앱 내부 탭 관리 대신 브라우저 탭을 쓰므로
// 맵마다 메모리가 완전히 격리되고, 동시 편집 개수 제한이 필요 없다.

import { useDocumentStore, isDocumentEmpty } from '@/stores/documentStore';
import { useCloudStore } from '@/stores/cloudStore';
import { useAutosaveStore } from '@/stores/autosaveStore';
import { suppressCloudAutosave } from '@/hooks/useCloudAutosave';
import { cloudApi, CloudError, type MapKind } from '@/services/cloud/apiClient';
import { authEnabled, useAuthStore } from '@/stores/authStore';

/** 클라우드 문서 스냅샷 포맷 — 프론트 문서(map) + 칸반을 통째로 담는다 */
export const SNAPSHOT_VERSION = 1;

export function buildSnapshot(): { v: number; map: unknown; kanban: unknown } {
  const st = useDocumentStore.getState();
  return { v: SNAPSHOT_VERSION, map: st.map, kanban: st.kanban };
}

/** 인증이 켜진 배포에서 아직 로그인하지 않은 상태 (= 서버 저장 불가) */
export function needLogin(): boolean {
  return authEnabled && !useAuthStore.getState().session;
}

/** 현재 문서가 비어 있는가 (맵 닫기 직후 등) */
export function isCurrentMapEmpty(): boolean {
  return (
    useCloudStore.getState().cloudMapId === null &&
    isDocumentEmpty(useDocumentStore.getState().map)
  );
}

/**
 * 서버 맵을 **이 탭에 그대로** 열어도 되는 상태인가.
 * 잃을 것이 없을 때만 true —
 *   · 서버 맵과 연결돼 있지 않고(cloudMapId 없음), 그리고
 *   · 문서가 비었거나(맵 닫기 직후) 첫 화면 그대로 손대지 않았을 때
 *     (편집 이력 past 가 비어 있음 — 새 맵 패널의 확인 게이트와 같은 기준)
 * 그 외에는 편집 중이라고 보고 새 탭에서 연다.
 */
export function canReuseThisTab(): boolean {
  if (useCloudStore.getState().cloudMapId) return false;
  const doc = useDocumentStore.getState();
  return isDocumentEmpty(doc.map) || doc.past.length === 0;
}

/** 아직 서버에 저장한 적 없는 맵인가 (= 저장할 폴더·이름을 물어야 한다) */
export function isUnsavedMap(): boolean {
  return useCloudStore.getState().cloudMapId === null;
}

/**
 * 이미 서버에 있는 맵을 **같은 이름 그대로** 다시 저장한다
 * (2026-08-02 규칙 2 — "열었던 서버맵의 이름 그대로").
 * 이름은 문서 안의 map.title 이 아니라 **cloudStore 에 기억해 둔 서버
 * 이름**을 쓴다. 맵 안의 중심 주제를 바꿔도 파일 이름은 바뀌지 않는다.
 *
 * 아직 서버에 없는 맵에서 부르면 오류다 — 그 경우는 saveNewMap().
 */
export async function saveCurrentMap(
  { keepVersion = true }: { keepVersion?: boolean } = {},
): Promise<{ mapId: string }> {
  const cloud = useCloudStore.getState();
  const id = cloud.cloudMapId;
  if (!id) throw new CloudError(0, '저장할 폴더와 이름을 먼저 정해 주세요.');
  cloud.setBusy('saving');
  try {
    const title = cloud.cloudTitle ?? undefined;
    const res = await cloudApi.saveDocument(id, buildSnapshot(), title, keepVersion);
    useCloudStore.getState().link(id, res.updatedAt);
    useAutosaveStore.getState().setSaveState('saved');
    return { mapId: id };
  } finally {
    useCloudStore.getState().setBusy('idle');
  }
}

/**
 * 새 맵을 **폴더 + 이름 + 유형**을 정해 처음 저장한다 (규칙 3).
 * 같은 폴더에 같은 이름이 있으면 서버가 409 로 거절하고, 호출부(저장
 * 대화상자)가 그 메시지를 그대로 보여 준다.
 */
export async function saveNewMap(opts: {
  title: string;
  folderId: string | null;
  kind: MapKind;
}): Promise<{ mapId: string }> {
  const cloud = useCloudStore.getState();
  cloud.setBusy('saving');
  try {
    const created = await cloudApi.createMap(opts.title, {
      folderId: opts.folderId,
      kind: opts.kind,
    });
    // 맵 이름과 문서 제목을 맞춰 둔다 — 내보내기 파일명 등에 쓰인다
    useDocumentStore.getState().setMapTitle(opts.title);
    const res = await cloudApi.saveDocument(
      created.mapId, buildSnapshot(), opts.title, true,
    );
    useCloudStore.getState().link(created.mapId, res.updatedAt, {
      title: opts.title, folderId: opts.folderId, kind: opts.kind,
    });
    useAutosaveStore.getState().setSaveState('saved');
    return { mapId: created.mapId };
  } finally {
    useCloudStore.getState().setBusy('idle');
  }
}

/**
 * 서버 맵과의 연결만 끊는다 — 문서 내용은 그대로 둔다.
 *
 * **새 맵 만들기·Local 파일 불러오기처럼 문서를 통째로 바꿀 때 반드시
 * 부른다.** 연결을 남겨 두면 새 문서의 자동저장이 조금 전까지 편집하던
 * 서버 맵을 덮어써 남의 내용을 지운다 (2026-08-02 e2e82에서 실측).
 */
export function detachFromServer(): void {
  suppressCloudAutosave();
  useCloudStore.getState().unlink();
  useAutosaveStore.getState().setSaveState('saved');
}

/** 문서를 화면에서 비우고 서버 링크를 끊는다 (저장은 호출부 책임) */
export function clearCurrentMap(): void {
  suppressCloudAutosave(); // 빈 문서가 방금 닫은 맵을 덮어쓰지 않도록
  useDocumentStore.getState().closeMap();
  useCloudStore.getState().unlink();
  useAutosaveStore.getState().setSaveState('saved');
}

/**
 * 맵 닫기 — 이미 서버에 있는 맵은 **저장한 뒤** 닫는다 (규칙 5).
 * 저장이 실패하면 닫지 않는다(내용 유실 방지).
 *
 * 아직 서버에 저장한 적 없는 맵(새 맵·Local 파일 불러오기)은 여기서
 * 처리하지 않는다 — 호출부가 **"저장되지 않았습니다" 경고**(규칙 4)를
 * 먼저 띄우고, 사용자가 고른 뒤에 saveNewMap()/closeWithoutSaving()
 * 으로 이어 간다.
 *
 * @returns 'closed' 닫음 · 'unsaved' 미저장 맵이라 호출부 확인 필요 ·
 *          'failed' 저장 실패로 닫지 않음 · 'empty' 열린 맵 없음
 */
export async function saveAndCloseMap(
  flash: (msg: string) => void,
): Promise<'closed' | 'unsaved' | 'failed' | 'empty'> {
  if (isCurrentMapEmpty()) {
    flash('열려 있는 맵이 없습니다.');
    return 'empty';
  }
  if (isUnsavedMap()) return 'unsaved';

  try {
    await saveCurrentMap({ keepVersion: true });
  } catch (err) {
    flash('⚠ ' + (err instanceof CloudError ? err.message : '저장 실패 — 닫지 않았습니다.'));
    return 'failed';
  }
  clearCurrentMap();
  return 'closed';
}

// ── 브라우저 새 탭으로 맵 열기 (`?map=<id>`) ───────────────────────────

export const MAP_URL_PARAM = 'map';

/** 부팅 시 URL 에 지정된 맵 id (없으면 null) — 모듈 로드 시 1회 확정 */
export const initialMapId: string | null = readMapIdFromUrl();

function readMapIdFromUrl(): string | null {
  try {
    const v = new URLSearchParams(window.location.search).get(MAP_URL_PARAM);
    return v && v.trim() ? v.trim() : null;
  } catch {
    return null;
  }
}

export function mapUrl(mapId: string): string {
  const u = new URL(window.location.href);
  u.search = `?${MAP_URL_PARAM}=${encodeURIComponent(mapId)}`;
  u.hash = '';
  return u.toString();
}

/**
 * 다른 맵을 **브라우저 새 탭**으로 연다. 팝업 차단 등으로 실패하면
 * false — 호출부가 안내한다.
 */
export function openMapInNewTab(mapId: string): boolean {
  try {
    // ⚠️ 'noopener' 를 주면 브라우저가 **항상 null 을 돌려준다** — 탭이
    // 정상적으로 열려도 "팝업 차단" 으로 오인한다. 같은 출처의 우리
    // 페이지를 여는 것이므로 opener 는 연 뒤에 직접 끊는다.
    const w = window.open(mapUrl(mapId), '_blank');
    if (w) {
      try { w.opener = null; } catch { /* 브라우저가 막으면 그대로 둔다 */ }
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/** 서버 맵을 **현재 탭**에 불러온다 (빈 문서 상태에서만 쓴다) */
export async function openMapHere(mapId: string): Promise<void> {
  const cloud = useCloudStore.getState();
  cloud.setBusy('opening');
  try {
    const { doc, updatedAt, title, folderId, kind } = await cloudApi.getDocument(mapId);
    const loadedMap = (doc as { map?: unknown }).map;
    if (!loadedMap) throw new CloudError(0, '문서 형식을 인식할 수 없습니다.');
    suppressCloudAutosave(); // 방금 불러온 문서를 곧바로 재저장하지 않도록
    useDocumentStore.getState().loadMap(loadedMap as never);
    // 서버의 맵 이름을 문서 제목으로도 맞춘다 — 이후 저장은 이 이름 그대로
    useDocumentStore.getState().setMapTitle(title);
    useCloudStore.getState().link(mapId, updatedAt, { title, folderId, kind });
    useAutosaveStore.getState().setSaveState('saved');
  } finally {
    useCloudStore.getState().setBusy('idle');
  }
}
