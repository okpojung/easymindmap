// 클라우드 자동 저장 — 문서가 서버 맵에 연결(cloudMapId)돼 있을 때만
// 전체 스냅샷을 서버에 올린다. 저장 상태는 상단 툴바 배지로 표시된다.
//
// ## 저장 시점 (2026-08-06 모델 개편 — 사용자 결정)
//
// 예전에는 **"손을 멈춘 뒤 1.5초"(디바운스) + 최대 5초**마다 문서 전체를
// 올렸다. 사진이 든 맵은 스냅샷이 수 MB 라, 10분 집중 편집이면 서버로
// 수백 번 × 수 MB 가 오갔다. 실시간처럼 보이려고 치른 값이 너무 컸다.
//
// 지금은 **네 가지 시점**에만 올린다.
//
// | 언제 | 히스토리 버전 |
// | --- | --- |
// | ☁ 저장 · 맵 닫기 · 다른 이름으로 저장 (이 파일 밖 — mapSession) | **남긴다** |
// | **주기 자동저장** (개인 설정 3·5·10분, 기본 5분) | 안 남김 |
// | **미저장 편집 50개**가 쌓이면 (주기 전이라도) | 안 남김 |
// | **탭 전환 · 창 닫기 · 오프라인→복귀 순간** | 안 남김 |
//
// 마지막 줄이 핵심이다 — 주기가 아니라 **사건**이라 트래픽이 사실상 0인데
// 유실 방어 효과는 가장 크다. 그 사이의 편집은 **로컬 초안(IndexedDB)**
// 이 지킨다 (useLocalDraft — 구조 변경은 즉시, 타이핑은 1초).
//
// 안전장치:
//  - cloudMapId 가 없으면(미연결) 절대 자동 저장하지 않는다.
//  - 방금 "열기/저장"으로 문서가 바뀐 직후에는 잠깐 억제(suppress)한다.
//  - 문서 출처(docOrigin)가 이 맵이 아니면 아예 보내지 않는다.
import { useEffect } from 'react';
import {
  useDocumentStore, isDocumentEmpty, EMPTY_MAP_TITLE, isViewOnlyChange, isRemoteChange,
} from '@/stores/documentStore';
import { useEditorUiStore } from '@/stores/editorUiStore';
import { useCloudStore } from '@/stores/cloudStore';
import { useAutosaveStore } from '@/stores/autosaveStore';
import { cloudApi, CloudError } from '@/services/cloud/apiClient';
import { editSessionKey } from '@/services/cloud/editSession';
import { useAppSettingsStore } from '@/stores/appSettingsStore';
import { clearLocalDraft } from '@/hooks/useLocalDraft';

/**
 * **미저장 편집이 이만큼 쌓이면 주기 전이라도 한 번 올린다.**
 *
 * "변경 **용량**"이 아니라 "변경 **횟수**"를 쓴다 — 용량은 중요도와
 * 반대로 움직인다(문장 한 줄 수정은 용량 변화가 0 이지만 잃으면 아프고,
 * 사진 1장은 +2MB 지만 원본이 PC 에 있어 다시 하면 된다).
 */
export const EDIT_COUNT_TRIGGER = 50;

/** 주기 도달을 확인하는 간격 — 개인 설정을 바꿔도 바로 반영되게 짧게 */
export const TICK_MS = 5000;

let tick: number | undefined;
/** 아직 서버에 반영되지 않은 편집 수 */
let pendingEdits = 0;
/** 마지막으로 서버에 반영된 시각 (0 = 이 세션에서 아직 없음) */
let lastSaveAt = 0;
let saving = false;
let rerun = false;
let skipNextChange = false;
//
// **끝까지 재시도한다** (2026-08-06 R2). 예전에는 2회 실패하면 멈추고
// "손으로 ☁ 저장하세요"로 넘겼다 — 노트북을 덮었다 열거나 와이파이가
// 잠깐 끊긴 흔한 상황에서, 사용자가 배지를 못 보면 그대로 유실이었다.
const RETRY_DELAYS = [1000, 3000, 10_000, 30_000]; // 마지막 값은 무기한 반복
/** 이 횟수를 넘으면 배지를 'retrying' 이 아니라 'error' 로 (사실대로) */
const RETRY_QUIET_LIMIT = 2;
let retryTimer: number | undefined;
let retryCount = 0;

function cancelRetry(): void {
  window.clearTimeout(retryTimer);
  retryTimer = undefined;
  retryCount = 0;
}

function setPending(n: number): void {
  pendingEdits = n;
  useAutosaveStore.getState().setPendingEdits(n);
}

/**
 * 바로 다음 "맵 변경" 1건만 자동저장에서 제외하고, **예약된 재시도도
 * 취소**한다. 열기(loadMap)·닫기(closeMap)·연결 해제(detach)처럼 문서를
 * 통째로 바꾸는 전환 지점에서 부른다.
 */
/**
 * **협업 세션이 이 맵을 몰고 있는가** (2026-08-18).
 *
 * 협업맵에서 스냅샷 자동저장을 그대로 두면 **문서 전체를 통째로 덮어써서**
 * 같은 순간 남이 고친 것을 지운다 — 글자 단위로 합쳐 놓고 그 위에 통째
 * 저장을 얹는 셈이다. 그래서 협업이 **실제로 붙어 있는 동안만** 자동저장이
 * 비켜 준다(붙지 못했으면 예전대로 저장해야 한다 — 그래야 유료 모듈이
 * 없거나 소켓이 끊긴 서버에서 편집이 사라지지 않는다).
 *
 * 자리는 코어에 있고, 켜고 끄는 것은 협업 모듈이 한다.
 */
let collabDrivingMapId: string | null = null;

export function setCollabDriving(mapId: string | null): void {
  if (collabDrivingMapId === mapId) return;
  collabDrivingMapId = mapId;
  // 배지는 스토어 값에서 파생된다 — 자세한 이유는 autosaveStore 주석.
  useAutosaveStore.getState().setCollabDrivingMapId(mapId);
  if (mapId) {
    // 몰기 시작 — 대기분을 턴다(그 편집은 소켓이 이미 가져갔다)
    setPending(0);
    cancelRetry();
  } else {
    // 끊겼다 — **예전 방식으로 돌아간다.** 배지를 무조건 'saved' 로 두면
    // 소켓이 끊긴 뒤의 편집이 저장된 것처럼 보인다.
    useAutosaveStore.getState().setSaveState(pendingEdits > 0 ? 'dirty' : 'saved');
  }
}

/** 지금 이 맵을 협업이 몰고 있나 — 저장 경로가 이것만 본다 */
export function isCollabDriving(mapId?: string | null): boolean {
  if (!collabDrivingMapId) return false;
  return !mapId || collabDrivingMapId === mapId;
}

export function suppressCloudAutosave(): void {
  skipNextChange = true;
  setPending(0);
  rerun = false;
  cancelRetry(); // 맵이 바뀌면 이전 맵의 재시도는 의미가 없다
}

/** 명시 저장(☁ 저장·맵 닫기·다른 이름)이 성공했을 때 — 대기분을 턴다 */
/**
 * ☁ 저장·맵 닫기·다른 이름으로 저장이 **서버에 넣은 뒤** 부른다.
 *
 * `mapId` 를 주면 **그 맵의 로컬 초안도 지운다** (2026-08-07 보고).
 * 예전에는 자동저장 경로만 초안을 지웠다. 그래서 손으로 ☁ 저장을
 * 눌러 서버에 잘 들어간 뒤에도 초안이 남아, 다음에 앱을 열면
 * **"저장되지 않은 맵이 있습니다 — 복구할까요?"** 가 떴다. 저장했는데도
 * 안 했다고 말하는 셈이라 사실과 다르다.
 */
export function notifyExplicitSave(mapId?: string | null): void {
  setPending(0);
  lastSaveAt = Date.now();
  useAutosaveStore.getState().setLastSavedAt(lastSaveAt);
  cancelRetry();
  if (mapId) void clearLocalDraft(mapId);
}

// mapSession.buildSnapshot 과 같은 v2 형태 — mapSession 이 이 파일의
// suppressCloudAutosave 를 import 하므로 (순환 방지) 여기서 따로 만든다.
function snapshot() {
  const st = useDocumentStore.getState();
  const ui = useEditorUiStore.getState();
  return {
    v: 2,
    map: st.map,
    editor: { layoutType: ui.layoutType, spacingX: ui.spacingX, spacingY: ui.spacingY },
  };
}

async function doSave() {
  const cloud = useCloudStore.getState();
  const mapId = cloud.cloudMapId;
  if (!mapId) return;
  // **협업이 몰고 있으면 통째 저장을 하지 않는다** — 같은 순간 남이 고친
  // 것을 덮어쓴다. 서버가 몇 초마다 물질화하므로 잃는 것도 없다.
  if (isCollabDriving(mapId)) { setPending(0); return; }
  // 빈 문서·'문서 없음' 플레이스홀더는 자동저장하지 않는다 (최후의
  // 방어선, 2026-08-04 유실 보고) — 이 상태가 서버 맵에 쓰이면 저장해
  // 둔 내용이 통째로 사라진다. 맵을 정말 비우고 싶으면 수동 ☁ 저장.
  const doc = useDocumentStore.getState().map;
  // **가지가 하나도 없으면 자동저장하지 않는다.** 맵 전환 레이스에서
  // **제목은 남고 가지만 비는** 중간 상태가 서버를 덮어썼다 (2026-08-05).
  if (isDocumentEmpty(doc) || doc.title === EMPTY_MAP_TITLE) return;
  if (!doc.branches || doc.branches.length === 0) return;
  // **화면의 문서가 이 맵에서 온 것이 맞는가** (2026-08-05 저장 감사).
  // 문서를 통째로 바꾸면서 서버 링크를 끊지 않은 경로가 있으면 전혀
  // 다른 문서가 이 맵에 저장된다 — AI 새 맵 생성(AITab)이 실제로
  // 그랬다. 호출부를 하나씩 고치는 대신 **여기서 구조로 막는다**.
  if (useDocumentStore.getState().docOrigin !== mapId) {
    // eslint-disable-next-line no-console
    console.warn('[autosave] 문서 출처가 달라 저장하지 않았습니다',
      { docOrigin: useDocumentStore.getState().docOrigin, mapId });
    return;
  }
  if (saving) { rerun = true; return; }
  saving = true;
  useAutosaveStore.getState().setSaveState('saving');
  try {
    // 이름은 **서버에 저장된 그 이름 그대로** — 자동저장이 맵 이름을
    // 바꿔 버리면 "열었던 이름 그대로 저장" 규칙이 깨진다 (2026-08-02).
    const title = useCloudStore.getState().cloudTitle ?? undefined;
    // **편집 세션 키를 반드시 실어야 한다.** 맵을 열 때 이 탭이 편집
    // 잠금을 쥐는데(2026-08-04), 키 없이 보낸 저장은 서버가 "다른 세션이
    // 편집 중"으로 보고 409 로 거절한다 (2026-08-05 재현·수정).
    //
    // **히스토리 버전은 남기지 않는다** (2026-08-06 사용자 결정) —
    // 히스토리는 ☁ 저장·맵 닫기·다른 이름으로 저장에서만 생긴다.
    // 그래야 "히스토리 = 내가 매듭지은 시점"이라는 뜻이 흐려지지 않는다.
    const res = await cloudApi.saveDocument(
      mapId, snapshot(), title, false, editSessionKey());
    // 응답이 오는 사이 맵이 닫혔거나 다른 맵으로 바뀌었으면 링크를
    // 되살리지 않는다 (2026-08-04 실사용 보고).
    if (useCloudStore.getState().cloudMapId === mapId) {
      useCloudStore.getState().link(mapId, res.updatedAt);
      useAutosaveStore.getState().setSaveState('saved');
      cancelRetry();
      setPending(0);
      lastSaveAt = Date.now();
      useAutosaveStore.getState().setLastSavedAt(lastSaveAt);
      // 서버에 들어갔으니 이 맵의 로컬 초안은 더 필요 없다
      void clearLocalDraft(mapId);
    }
  } catch (err) {
    if (useCloudStore.getState().cloudMapId === mapId) {
      const msg = err instanceof CloudError ? err.message : '자동 저장 실패';
      useCloudStore.getState().setError(msg);
      // **포기하지 않는다** — 마지막 간격으로 무기한 재시도한다.
      // 편집분은 그동안 로컬 초안(IndexedDB)에 남아 있으므로 잃지 않는다.
      const delay = RETRY_DELAYS[Math.min(retryCount, RETRY_DELAYS.length - 1)];
      retryCount += 1;
      useAutosaveStore.getState().setSaveState(
        retryCount <= RETRY_QUIET_LIMIT ? 'retrying' : 'error');
      window.clearTimeout(retryTimer);
      retryTimer = window.setTimeout(() => {
        if (useCloudStore.getState().cloudMapId === mapId) void doSave();
      }, delay);
    }
  } finally {
    saving = false;
    if (rerun) {
      rerun = false;
      if (useCloudStore.getState().cloudMapId === mapId) void doSave();
    }
  }
}

/**
 * **편집 1회로 센다.**
 *
 * "편집"의 정의 = **다시 만들어야 하는 것을 바꾸는 변경**.
 *
 * | 센다 | 안 센다 |
 * | --- | --- |
 * | 노드 구조·텍스트·노트·첨부·링크·사진 | 노드 선택 |
 * | 스타일·색·아이콘·태그·정렬·크기·**좌우**(`side`) | 확대/축소·이동(Pan) |
 * | 레이아웃(전역·노드별)·간격 | 패널 열기/접기·검색어 |
 * | 맵 설정·맵 이름 | **접기/펴기** (2026-08-06) |
 *
 * `side`(좌우 이동)는 사용자가 정한 **배치**라 잃으면 맵 모양이 달라진다
 * → 내용 쪽이다. 반면 접힘은 **다시 보면 되는** 화면 상태다.
 */
function countEdit(): void {
  // 협업이 몰면 이 편집은 소켓이 가져간다 — 미저장으로 세지 않는다
  if (isCollabDriving(useCloudStore.getState().cloudMapId)) return;
  setPending(pendingEdits + 1);
  useAutosaveStore.getState().setSaveState('dirty');
  // 주기 전이라도 편집이 많이 쌓이면 한 번 올린다
  if (pendingEdits >= EDIT_COUNT_TRIGGER) void doSave();
}

/**
 * **주기를 기다리지 않고 지금 보낸다.** 탭이 백그라운드로 가거나 창을
 * 닫으려 하거나 네트워크가 돌아왔을 때 부른다 — 이 세 시점은 주기가
 * 아니라 **사건**이라 트래픽이 거의 없는데 유실 방어 효과가 가장 크다.
 * 대기 중인 편집이 없으면 아무것도 하지 않는다.
 */
export function flushCloudAutosave(): void {
  if (pendingEdits === 0) return;
  if (!useCloudStore.getState().cloudMapId) return;
  if (isCollabDriving(useCloudStore.getState().cloudMapId)) return;
  void doSave();
}

export function useCloudAutosave(): void {
  useEffect(() => {
    const unsub = useDocumentStore.subscribe((state, prev) => {
      if (state.map === prev.map) return; // 맵 변경일 때만
      // 접기/펴기 같은 **보기 전용** 변경은 미저장 편집으로 세지 않는다
      // (2026-08-06 사용자 결정 — 내용이 중요하지 접힘 모양은 아니다)
      if (isViewOnlyChange()) return;
      // **남이 친 것을 내가 다시 올리지 않는다** (2026-08-18 협업)
      if (isRemoteChange()) return;
      // skip 소모를 연결 여부 검사보다 먼저 — "다음 맵 변경 1건 제외"
      // 약속과 일치시킨다 (2026-08-04 점검).
      if (skipNextChange) { skipNextChange = false; return; }
      if (!useCloudStore.getState().cloudMapId) {
        // 서버에 연결되지 않은 문서(미저장 새 맵·Local 파일·읽기 전용)를
        // 편집했다. 배지가 '저장됨'이라고 말하면 **거짓말**이다 — 이
        // 편집은 어디에도 저장돼 있지 않다 (2026-08-05 감사에서 실측).
        // 단, **잃을 것이 없는 빈 문서**는 그대로 'saved'.
        const cur = useDocumentStore.getState().map;
        const nothingToLose =
          isDocumentEmpty(cur) || (cur.branches?.length ?? 0) === 0;
        useAutosaveStore.getState().setSaveState(nothingToLose ? 'saved' : 'unsaved');
        return;
      }
      countEdit();
    });

    // **화면 설정(전역 레이아웃·간격)도 저장 대상이다.**
    // 이 값들은 `documentStore.map` 이 아니라 editorUiStore 에 있는데,
    // 스냅샷의 `editor` 필드로 함께 서버에 올라간다. 여기를 구독하지
    // 않으면 **간격 슬라이더만 만진 변경은 영영 서버에 가지 않는다**
    // (주기 자동저장은 "대기 중인 편집이 있을 때"만 움직이기 때문).
    // 2026-08-06 저장 모델 개편 중 발견해 함께 막았다.
    const unsubUi = useEditorUiStore.subscribe((s, p) => {
      if (s.layoutType === p.layoutType
        && s.spacingX === p.spacingX && s.spacingY === p.spacingY) return;
      if (!useCloudStore.getState().cloudMapId) return;
      countEdit();
    });

    // **주기 자동저장** — 개인 설정 간격(기본 5분)이 지났고 대기 중인
    // 편집이 있으면 올린다. 설정을 바꿔도 곧바로 반영되도록 짧게 재며
    // 경과를 확인한다(타이머를 다시 걸지 않는다).
    tick = window.setInterval(() => {
      if (pendingEdits === 0) return;
      if (saving || retryTimer !== undefined) return;
      const intervalMs =
        useAppSettingsStore.getState().autosaveIntervalMin * 60_000;
      if (lastSaveAt !== 0 && Date.now() - lastSaveAt < intervalMs) return;
      // 이 세션에서 한 번도 저장한 적이 없으면 첫 편집으로부터 재야
      // 하므로, lastSaveAt 을 열린 시점으로 본다(아래 mount 에서 설정).
      void doSave();
    }, TICK_MS);

    // ── 안전 3시점 ───────────────────────────────────────────────────
    // ① 탭이 화면에서 사라질 때 (탭 전환·앱 전환·창 닫기 직전)
    const onVis = () => {
      if (document.visibilityState === 'hidden') flushCloudAutosave();
    };
    // ② 페이지를 떠날 때 (마지막 보루)
    const onHide = () => flushCloudAutosave();
    // ③ 네트워크가 돌아왔을 때
    const onOnline = () => {
      const s = useAutosaveStore.getState().saveState;
      if ((s === 'error' || s === 'retrying') && useCloudStore.getState().cloudMapId) {
        cancelRetry();
        void doSave();
      } else {
        flushCloudAutosave();
      }
    };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', onHide);
    window.addEventListener('online', onOnline);

    // 이 세션의 기준 시각 — 맵을 연 뒤 주기가 지나야 첫 자동저장이 간다
    lastSaveAt = Date.now();
    useAutosaveStore.getState().setLastSavedAt(lastSaveAt);

    return () => {
      unsub();
      unsubUi();
      window.clearInterval(tick);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pagehide', onHide);
      window.removeEventListener('online', onOnline);
    };
  }, []);
}
