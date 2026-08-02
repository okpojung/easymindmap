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
import { cloudApi, CloudError } from '@/services/cloud/apiClient';
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

/**
 * 현재 맵을 서버에 저장한다. 아직 서버 맵이 없으면 새로 만든다.
 * `keepVersion` = 히스토리(저장 버전)로도 남길지 — 명시적 저장·맵 닫기만
 * true, 자동저장은 false (스냅샷 용량 때문, B8).
 * 실패는 CloudError 로 던진다 — 호출부가 "닫지 않는다" 등을 판단한다.
 */
export async function saveCurrentMap(
  { keepVersion = true }: { keepVersion?: boolean } = {},
): Promise<{ mapId: string }> {
  const doc = useDocumentStore.getState();
  const title = doc.map.title || '제목 없는 맵';
  const cloud = useCloudStore.getState();
  cloud.setBusy('saving');
  try {
    let id = cloud.cloudMapId;
    if (!id) id = (await cloudApi.createMap(title)).mapId;
    const res = await cloudApi.saveDocument(id, buildSnapshot(), title, keepVersion);
    useCloudStore.getState().link(id, res.updatedAt);
    useAutosaveStore.getState().setSaveState('saved');
    return { mapId: id };
  } finally {
    useCloudStore.getState().setBusy('idle');
  }
}

/** 문서를 화면에서 비우고 서버 링크를 끊는다 (저장은 호출부 책임) */
export function clearCurrentMap(): void {
  suppressCloudAutosave(); // 빈 문서가 방금 닫은 맵을 덮어쓰지 않도록
  useDocumentStore.getState().closeMap();
  useCloudStore.getState().unlink();
  useAutosaveStore.getState().setSaveState('saved');
}

/**
 * 맵 닫기 — **무조건 저장한 뒤** 닫는다 (2026-08-02 사용자 확정).
 * 저장이 실패하면 닫지 않는다(내용 유실 방지). 로그인하지 않아 저장할 수
 * 없을 때만 "저장 없이 닫기"를 확인받는다.
 *
 * @returns 실제로 닫았으면 true
 */
export async function saveAndCloseMap(
  flash: (msg: string) => void,
): Promise<boolean> {
  if (isCurrentMapEmpty()) {
    flash('열려 있는 맵이 없습니다.');
    return false;
  }

  if (needLogin()) {
    const ok = window.confirm(
      '로그인하지 않아 서버에 저장할 수 없습니다.\n' +
      '저장하지 않고 닫을까요? (내용이 사라집니다)',
    );
    if (!ok) return false;
  } else {
    try {
      await saveCurrentMap({ keepVersion: true });
    } catch (err) {
      flash('⚠ ' + (err instanceof CloudError ? err.message : '저장 실패 — 닫지 않았습니다.'));
      return false;
    }
  }

  clearCurrentMap();
  return true;
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
    const { doc, updatedAt } = await cloudApi.getDocument(mapId);
    const loadedMap = (doc as { map?: unknown }).map;
    if (!loadedMap) throw new CloudError(0, '문서 형식을 인식할 수 없습니다.');
    suppressCloudAutosave(); // 방금 불러온 문서를 곧바로 재저장하지 않도록
    useDocumentStore.getState().loadMap(loadedMap as never);
    useCloudStore.getState().link(mapId, updatedAt);
    useAutosaveStore.getState().setSaveState('saved');
  } finally {
    useCloudStore.getState().setBusy('idle');
  }
}
