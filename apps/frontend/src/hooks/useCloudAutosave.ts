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
import { useDocumentStore, isDocumentEmpty, EMPTY_MAP_TITLE } from '@/stores/documentStore';
import { useEditorUiStore } from '@/stores/editorUiStore';
import { useCloudStore } from '@/stores/cloudStore';
import { useAutosaveStore } from '@/stores/autosaveStore';
import { cloudApi, CloudError } from '@/services/cloud/apiClient';
import { editSessionKey } from '@/services/cloud/editSession';
import { useAppSettingsStore } from '@/stores/appSettingsStore';
import { clearLocalDraft } from '@/hooks/useLocalDraft';

const DEBOUNCE_MS = 1500;
/**
 * **최대 대기 한도** (2026-08-05 감사). 디바운스는 "손을 멈춘 뒤 1.5초"라
 * 계속 편집하면 타이머가 계속 리셋돼 **저장이 무한정 미뤄진다** — 간격
 * 슬라이더를 30초 드래그하거나 노드를 쉼 없이 추가하면 그동안 서버에는
 * 아무것도 가지 않는다. 첫 변경으로부터 이 시간이 지나면 편집 중이어도
 * 한 번 저장한다.
 */
const MAX_WAIT_MS = 5000;

let timer: number | undefined;
/** 아직 저장되지 않은 첫 변경 시각 (maxWait 판정용) */
let firstPendingAt = 0;
/** 마지막으로 히스토리 버전을 남긴 시각 (주기적 버전 — R4) */
let lastVersionAt = 0;
let saving = false;
let rerun = false;
let skipNextChange = false;
// 실패 재시도 (2026-08-05) — 배지는 예전부터 "저장 실패 — 재시도 중"
// 이라고 말했지만 **실제로는 재시도하지 않았다**. 되돌리기(Ctrl+Z)를
// 여러 번 하다 한 번 실패하면 그 문구가 그대로 굳어, 사용자는 기다려도
// 저장되지 않는 상태에 놓였다. 문구를 사실로 만든다 — 짧은 backoff 로
// MAX_RETRY 번까지 자동 재시도하고, 그래도 안 되면 배지를 "저장 실패"
// 로 바꿔 손으로 ☁ 저장하도록 안내한다.
const RETRY_DELAYS = [1000, 3000]; // 1초 → 3초
let retryTimer: number | undefined;
let retryCount = 0;

function cancelRetry(): void {
  window.clearTimeout(retryTimer);
  retryTimer = undefined;
  retryCount = 0;
}

/**
 * 바로 다음 "맵 변경" 1건만 자동저장에서 제외하고, **이미 예약된 저장
 * (디바운스 타이머·재실행 예약)도 모두 취소**한다. 열기(loadMap)·닫기
 * (closeMap)·연결 해제(detach)처럼 문서를 통째로 바꾸는 전환 지점에서
 * 부른다.
 *
 * 2026-08-04 유실 보고: 이전에는 skip 플래그만 세웠다 — 전환 직전에
 * 예약돼 있던 타이머·rerun 이 전환 **후의** 문서(예: 맵 닫기의
 * '문서 없음' 플레이스홀더)를 이전 맵에 저장할 수 있었다.
 */
export function suppressCloudAutosave(): void {
  skipNextChange = true;
  window.clearTimeout(timer);
  timer = undefined;
  firstPendingAt = 0;
  rerun = false;
  cancelRetry(); // 맵이 바뀌면 이전 맵의 재시도는 의미가 없다
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
  // 빈 문서·'문서 없음' 플레이스홀더는 자동저장하지 않는다 (최후의
  // 방어선, 2026-08-04 유실 보고) — 이 상태가 서버 맵에 쓰이면 저장해
  // 둔 내용이 통째로 사라진다. 맵을 정말 비우고 싶으면 수동 ☁ 저장.
  const doc = useDocumentStore.getState().map;
  // **가지가 하나도 없으면 자동저장하지 않는다.** 이전 가드는
  // isDocumentEmpty(제목이 '문서 없음' + 가지 0)와 제목만 봤는데,
  // 맵 전환 레이스에서 **제목은 남고 가지만 비는** 중간 상태가 생겨
  // 그 문서가 서버를 덮어썼다 (2026-08-05 두 번째 유실 보고).
  // 자동저장은 히스토리 버전을 남기지 않아 되돌릴 수단이 없으므로,
  // "내용이 사라지는 방향"의 자동저장은 아예 보내지 않는다.
  // 정말 비우려면 수동 ☁ 저장(버전이 남는다).
  if (isDocumentEmpty(doc) || doc.title === EMPTY_MAP_TITLE) return;
  if (!doc.branches || doc.branches.length === 0) return;
  // **화면의 문서가 이 맵에서 온 것이 맞는가** (2026-08-05 저장 감사).
  // 문서를 통째로 바꾸면서 서버 링크를 끊지 않은 경로가 있으면 전혀
  // 다른 문서가 이 맵에 저장된다 — AI 새 맵 생성(AITab)이 실제로
  // 그랬고, 열어 두었던 서버 맵이 AI 맵으로 덮어써지는 것을 재현했다.
  // 호출부를 하나씩 고치는 대신 **여기서 구조로 막는다**: 출처가 다르면
  // 아예 보내지 않는다. 새 경로가 생겨도 기본값(출처 없음)이라 안전.
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
    // 편집 중"으로 보고 409 로 거절한다. 즉 자동저장이 자기 자신의 잠금에
    // 막혀 전부 실패했다 — 되돌리기 중 뜨던 "저장 실패" 배지의 진짜 원인
    // (2026-08-05 재현·수정). 명시 저장(saveCurrentMap)은 처음부터 키를
    // 싣고 있었기에 ☁ 저장만은 되던 것이 증상을 가렸다.
    // **주기적 버전** (2026-08-05 감사 R4) — 자동저장은 원래 버전을 남기지
    // 않아서, 자동저장으로 지워진 내용은 세션 undo 말고 복구 수단이 없었다.
    // 개인 설정 간격(기본 5분)마다 한 번은 버전으로도 남긴다.
    const intervalMs =
      useAppSettingsStore.getState().versionIntervalMin * 60_000;
    const now = Date.now();
    const keepVersion = lastVersionAt === 0 || now - lastVersionAt >= intervalMs;
    const res = await cloudApi.saveDocument(
      mapId, snapshot(), title, keepVersion, editSessionKey());
    if (keepVersion) lastVersionAt = now;
    // 응답이 오는 사이 맵이 닫혔거나(unlink) 다른 맵으로 바뀌었으면
    // 링크를 되살리지 않는다 — 이전에는 무조건 link 해서, 닫은 맵의
    // 연결이 부활한 상태에서 rerun 이 '문서 없음' 플레이스홀더를 그
    // 맵에 저장하는 유실 경로가 있었다 (2026-08-04 실사용 보고).
    if (useCloudStore.getState().cloudMapId === mapId) {
      useCloudStore.getState().link(mapId, res.updatedAt);
      useAutosaveStore.getState().setSaveState('saved');
      cancelRetry();
      firstPendingAt = 0;
      // 서버에 들어갔으니 이 맵의 로컬 초안은 더 필요 없다
      void clearLocalDraft(mapId);
    }
  } catch (err) {
    if (useCloudStore.getState().cloudMapId === mapId) {
      const msg = err instanceof CloudError ? err.message : '자동 저장 실패';
      useCloudStore.getState().setError(msg);
      const delay = RETRY_DELAYS[retryCount];
      if (delay !== undefined) {
        // 아직 재시도가 남았다 — 배지는 'retrying'(= "재시도 중")
        retryCount += 1;
        useAutosaveStore.getState().setSaveState('retrying');
        window.clearTimeout(retryTimer);
        retryTimer = window.setTimeout(() => {
          if (useCloudStore.getState().cloudMapId === mapId) void doSave();
        }, delay);
      } else {
        // 다 써 버렸다 — 더 기다려도 소용없으니 사실대로 알린다
        cancelRetry();
        useAutosaveStore.getState().setSaveState('error');
      }
    }
  } finally {
    saving = false;
    // rerun 도 같은 맵에 여전히 연결돼 있을 때만 의미가 있다
    if (rerun) {
      rerun = false;
      if (useCloudStore.getState().cloudMapId === mapId) void doSave();
    }
  }
}

export function useCloudAutosave(): void {
  useEffect(() => {
    const unsub = useDocumentStore.subscribe((state, prev) => {
      if (state.map === prev.map) return; // 맵 변경일 때만
      // skip 소모를 연결 여부 검사보다 먼저 — "다음 맵 변경 1건 제외"
      // 약속과 일치시킨다. 이전 순서(연결 검사 먼저)에서는 미연결 상태의
      // 변경이 skip 을 소모하지 않아 플래그가 남았고, 그 잔존 플래그가
      // 나중의 진짜 편집 1건을 조용히 삼켰다 (2026-08-04 점검).
      if (skipNextChange) { skipNextChange = false; return; }
      if (!useCloudStore.getState().cloudMapId) {
        // 서버에 연결되지 않은 문서(미저장 새 맵·Local 파일·읽기 전용)를
        // 편집했다. 자동저장 대상이 아닌 것은 맞지만, 배지가 '저장됨'이라고
        // 말하면 **거짓말**이다 — 이 편집은 어디에도 저장돼 있지 않고,
        // 탭을 닫으면 그대로 사라진다. 사실대로 '저장 안 됨'으로 알리고,
        // 창을 닫을 때 브라우저가 묻게 한다(EditorPage beforeunload).
        // (2026-08-05 감사에서 실측: 5회 편집 후에도 배지가 '저장됨'이었다)
        //
        // 단, **잃을 것이 없는 빈 문서**('문서 없음' 자리표시·가지 0개)는
        // 그대로 'saved' — 첫 화면부터 경고를 띄우지 않는다.
        const cur = useDocumentStore.getState().map;
        const nothingToLose =
          isDocumentEmpty(cur) || (cur.branches?.length ?? 0) === 0;
        useAutosaveStore.getState().setSaveState(nothingToLose ? 'saved' : 'unsaved');
        return;
      }
      useAutosaveStore.getState().setSaveState('dirty');
      const now = Date.now();
      if (firstPendingAt === 0) firstPendingAt = now;
      window.clearTimeout(timer);
      // 계속 편집 중이어도 첫 변경으로부터 MAX_WAIT_MS 가 지나면 즉시 저장
      const wait = Math.max(0, Math.min(
        DEBOUNCE_MS, firstPendingAt + MAX_WAIT_MS - now,
      ));
      timer = window.setTimeout(() => void doSave(), wait);
    });
    return () => {
      unsub();
      window.clearTimeout(timer);
    };
  }, []);
}
