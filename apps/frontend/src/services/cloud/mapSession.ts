// mapSession — "지금 편집 중인 맵"의 세션 동작 모음 (저장 / 닫기 / 열기).
//
// 2026-08-02 로그인 UI 정리에서 도입. 그 전에는 같은 저장·닫기 로직이
// 상단 클라우드 메뉴와 좌측 새 맵 패널에 중복돼 있었다. 한 곳에 모아
// 호출부(상단 툴바·좌측 패널·히스토리 패널)가 같은 규칙을 따르게 한다.
//
// **탭 정책** (2026-08-02 사용자 결정): 다른 맵을 여는 것은 브라우저
// **새 탭**(`?map=<id>`)이다. 앱 내부 탭 관리 대신 브라우저 탭을 쓰므로
// 맵마다 메모리가 완전히 격리되고, 동시 편집 개수 제한이 필요 없다.

import {
  useDocumentStore, isDocumentEmpty, normalizeMapForSnapshot,
} from '@/stores/documentStore';
import { useEditorUiStore } from '@/stores/editorUiStore';
import { useInteractionStore } from '@/stores/interactionStore';
import { useCloudStore } from '@/stores/cloudStore';
import { useAutosaveStore } from '@/stores/autosaveStore';
import { notifyExplicitSave, suppressCloudAutosave } from '@/hooks/useCloudAutosave';
import { cloudApi, CloudError, type MapKind } from '@/services/cloud/apiClient';
import { editSessionKey } from '@/services/cloud/editSession';
import { authEnabled, useAuthStore } from '@/stores/authStore';

/**
 * 클라우드 문서 스냅샷 포맷 — 문서(map)에 **에디터 설정**까지 담는다.
 *
 * v2 (2026-08-02): editor(전역 레이아웃·간격) 추가. v1 은 map 만
 * 저장해서, 서버에서 다시 열면 **레이아웃이 저장 당시와 달라졌다**
 * (진행트리로 편집해 저장했는데 방사형으로 열림 — 사용자 실사용 보고).
 * 레이아웃은 documentStore 가 아니라 editorUiStore 소관이라 스냅샷에
 * 명시적으로 실어야 한다. 로컬 HTML/MD 내보내기가 editor 를 담는 것과
 * 같은 이유·같은 형태다.
 */
export const SNAPSHOT_VERSION = 2;

// 단일 세션 편집 잠금의 세션 키는 editSession.ts 에 있다 — 자동저장도
// 같은 키를 써야 하는데 그쪽에서 이 파일을 import 하면 순환이 된다.
export { editSessionKey };

/** 현재 연결된 맵의 편집 잠금을 해제 (닫기·새 문서 전환 시 — 베스트 에포트) */
function releaseEditLock(): void {
  const id = useCloudStore.getState().cloudMapId;
  if (!id) return;
  void cloudApi.editRelease(id, editSessionKey()).catch(() => { /* 무시 — TTL 이 정리 */ });
}

export interface SnapshotEditor {
  layoutType: string;
  spacingX: number;
  spacingY: number;
}

export function buildSnapshot(): {
  v: number; map: unknown; editor: SnapshotEditor;
} {
  const st = useDocumentStore.getState();
  const ui = useEditorUiStore.getState();
  // (예전 스냅샷의 kanban 필드는 초기 개발 목데이터를 싣기만 하고 복원에
  //  쓰인 적이 없어 제거했다 — 칸반 화면은 map 에서 실시간으로 만든다.)
  return {
    v: SNAPSHOT_VERSION,
    // 로드 경로와 같은 정규형으로 저장 (2026-08-03) — 그래야 "다시 열기
    // → 그대로 닫기"가 서버에서 무변경으로 판정된다 (normalizeMapForSnapshot)
    map: normalizeMapForSnapshot(st.map),
    editor: { layoutType: ui.layoutType, spacingX: ui.spacingX, spacingY: ui.spacingY },
  };
}

/** 스냅샷의 editor 설정을 화면에 복원한다 (v1 스냅샷은 editor 없음 → 무시) */
export function applySnapshotEditor(doc: unknown): void {
  const editor = (doc as { editor?: Partial<SnapshotEditor> } | null)?.editor;
  if (!editor) return;
  const ui = useEditorUiStore.getState();
  if (editor.layoutType) ui.setLayoutType(editor.layoutType as never);
  if (typeof editor.spacingX === 'number') ui.setSpacingX(editor.spacingX);
  if (typeof editor.spacingY === 'number') ui.setSpacingY(editor.spacingY);
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
 * **맵을 비우는 저장인가**를 사용자에게 묻는다 (2026-08-05 세 번째 유실).
 *
 * 재현 경로: 서버 맵을 연 뒤 Ctrl+Z 를 몇 번 더 누르면 '열기 이전'
 * 문서(문서 없음 자리표시)가 현재 문서가 되는데, 그대로 ☁ 저장을 누르면
 * 맵이 통째로 비워졌다. 자동저장은 서버 가드가 막고 있었지만 **명시
 * 저장은 "사용자의 뜻"이라며 통과**시키고 있었다 — 사용자는 비우려던
 * 것이 아니었다.
 *
 * 이제 가지가 0개인 문서를 저장하려 하면 먼저 묻는다.
 * @returns 'ok' 비우는 저장이 아니다(그냥 진행) · 'yes' 비우겠다고 답함 ·
 *          'cancel' 취소
 */
function confirmEmptyOverwrite(): 'ok' | 'yes' | 'cancel' {
  const branches = useDocumentStore.getState().map.branches?.length ?? 0;
  if (branches > 0) return 'ok';
  const yes = window.confirm(
    '지금 화면의 문서에는 가지(주제)가 하나도 없습니다.\n'
    + '이대로 저장하면 서버에 저장돼 있던 내용이 사라집니다.\n\n'
    + '되돌리기(Ctrl+Z)를 너무 많이 눌렀다면 [취소]를 누르고 '
    + '다시 실행(Ctrl+Y)으로 되돌아가세요.\n\n'
    + '정말 비운 채로 저장할까요?',
  );
  return yes ? 'yes' : 'cancel';
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
): Promise<{ mapId: string; unchanged: boolean }> {
  const cloud = useCloudStore.getState();
  const id = cloud.cloudMapId;
  if (!id) throw new CloudError(0, '저장할 폴더와 이름을 먼저 정해 주세요.');
  // 가지 0개 문서로 서버 맵을 덮어쓰려는 저장은 **먼저 묻는다** (§7.4)
  const allowEmpty = confirmEmptyOverwrite();
  if (allowEmpty === 'cancel') {
    throw new CloudError(0, '저장을 취소했습니다 — 내용이 사라지지 않았습니다.');
  }
  cloud.setBusy('saving');
  try {
    const title = cloud.cloudTitle ?? undefined;
    const res = await cloudApi.saveDocument(
      id, buildSnapshot(), title, keepVersion, editSessionKey(), allowEmpty === 'yes');
    useCloudStore.getState().link(id, res.updatedAt);
    // 이 문서를 그 맵에 저장했으니 이제 그 맵의 문서다 (자동저장 출처 검사)
    useDocumentStore.getState().setDocOrigin(id);
    useAutosaveStore.getState().setSaveState('saved');
    // 대기 중이던 편집 수를 털고, **그 맵의 로컬 초안도 지운다**
    // (2026-08-07 — 저장했는데 다음에 열면 복구 배너가 뜨던 문제)
    notifyExplicitSave(id);
    // unchanged: 내용이 그대로라 서버가 저장·히스토리 생성을 생략했다
    return { mapId: id, unchanged: res.unchanged === true };
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
      created.mapId, buildSnapshot(), opts.title, true, editSessionKey(),
    );
    useCloudStore.getState().link(created.mapId, res.updatedAt, {
      title: opts.title, folderId: opts.folderId, kind: opts.kind,
    });
    useDocumentStore.getState().setDocOrigin(created.mapId);
    useAutosaveStore.getState().setSaveState('saved');
    notifyExplicitSave(res.mapId);
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
  useDocumentStore.getState().setDocOrigin(null); // 출처도 끊는다
  releaseEditLock(); // 편집권 반납 — 다른 세션이 곧바로 열 수 있게
  useCloudStore.getState().unlink();
  useAutosaveStore.getState().setSaveState('saved');
}

/** 문서를 화면에서 비우고 서버 링크를 끊는다 (저장은 호출부 책임) */
export function clearCurrentMap(): void {
  suppressCloudAutosave(); // 빈 문서가 방금 닫은 맵을 덮어쓰지 않도록
  releaseEditLock();
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
  // 읽기 전용으로 연 맵 (다른 세션이 편집 중) — 저장 없이 그대로 닫는다
  if (useCloudStore.getState().readOnlyInfo) {
    clearCurrentMap();
    flash('읽기 전용으로 보던 맵을 닫았습니다.');
    return 'closed';
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

/**
 * 서버 맵을 **현재 탭**에 불러온다 (빈 문서 상태에서만 쓴다).
 *
 * 단일 세션 편집 잠금 (2026-08-04): 다른 세션(브라우저·탭·PC)이 이 맵을
 * 편집 중이면 서버가 editLock='busy' 를 준다 → **읽기 전용으로 연다**:
 * 서버 링크를 만들지 않아 자동저장·저장이 이 맵에 쓰지 않고(사본 저장은
 * 가능), readOnlyInfo 배너로 안내한다.
 *
 * @returns readOnly — 읽기 전용으로 열렸는가. `reason` 은 **왜** 그런지
 *   (다른 세션이 편집 중 / 읽기만 권한) — 부르는 쪽이 안내 문장을 가른다.
 */
export async function openMapHere(
  mapId: string,
): Promise<{ readOnly: boolean; reason?: string }> {
  const cloud = useCloudStore.getState();
  cloud.setBusy('opening');
  try {
    const { doc, updatedAt, title, folderId, kind, editLock, role } =
      await cloudApi.getDocument(mapId, editSessionKey());
    const loadedMap = (doc as { map?: unknown }).map;
    if (!loadedMap) throw new CloudError(0, '문서 형식을 인식할 수 없습니다.');
    suppressCloudAutosave(); // 방금 불러온 문서를 곧바로 재저장하지 않도록
    // 열기는 **문서 경계** — 되돌리기가 '열기 이전' 문서로 넘어가면
    // 안 된다 (그 상태로 저장하면 이 맵이 비워진다, §7.4)
    useDocumentStore.getState().loadMap(loadedMap as never,
      { resetHistory: true, serverMapId: mapId });
    // 서버의 맵 이름을 문서 제목으로도 맞춘다 — 이후 저장은 이 이름 그대로
    useDocumentStore.getState().setMapTitle(title);
    // 저장 당시의 레이아웃·간격 복원 (v2 스냅샷 — 없으면 그대로 둔다)
    applySnapshotEditor(doc);
    useInteractionStore.getState().setSelectedId(null);
    // **읽기 전용으로 여는 두 갈래** — 이유가 다르므로 문장도 다르다.
    //   ⑴ editLock='busy' : 다른 세션이 편집 중이다(내 권한은 있다)
    //   ⑵ role='viewer'   : '읽기만' 으로 초대받았다(권한 자체가 없다)
    // ⑵ 를 안 막으면 화면이 **편집을 허용하는 것처럼** 보이고, 사용자는
    // 한참 고친 뒤 저장할 때에야 403 을 만난다. 그 편집은 갈 곳이 없다
    // (2026-08-19 실사용에서 그대로 겪었다).
    const readOnlyReason = editLock === 'busy'
      ? '다른 세션에서 편집 중'
      : role === 'viewer' ? '이 맵은 읽기만 권한으로 공유받았습니다' : null;
    if (readOnlyReason) {
      // 읽기 전용 — 링크 없음(저장 경로 차단) + 배너 정보만
      useCloudStore.getState().unlink();
      useCloudStore.getState().setReadOnlyInfo({ mapId, title, reason: readOnlyReason });
    } else {
      useCloudStore.getState().link(mapId, updatedAt, { title, folderId, kind });
    }
    useAutosaveStore.getState().setSaveState('saved');
    return { readOnly: readOnlyReason !== null, reason: readOnlyReason ?? undefined };
  } finally {
    useCloudStore.getState().setBusy('idle');
  }
}
