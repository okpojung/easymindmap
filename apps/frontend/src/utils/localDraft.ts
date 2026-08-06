// localDraft — **저장되지 않은 맵을 브라우저에 즉시 보관**한다
// (2026-08-05 유실 감사 R1·R2·R3 대응).
//
// 자동저장은 "손을 멈춘 뒤 1.5초"(디바운스)에 서버로 간다. 그 사이에
// 브라우저가 죽거나(크래시·전원) 오프라인이면 그 편집은 어디에도 없다.
// beforeunload 경고는 **정상 종료에서만** 뜨므로 크래시는 못 잡는다.
//
// 그래서 편집을 1초 간격으로 **브라우저 안(IndexedDB)** 에 통째로 적어
// 둔다. 다음에 앱을 열면 "저장되지 않은 맵이 있습니다 — 복구할까요?"
// 로 되살린다.
//
// **왜 localStorage 가 아니라 IndexedDB 인가**
//   · localStorage 는 **동기**라 쓰는 동안 화면이 멈춘다. 맵에 사진이
//     내장돼 있으면 스냅샷이 수 MB — 1초마다 화면이 끊긴다.
//   · localStorage 는 도메인당 **약 5MB** 상한이라 사진 있는 맵은
//     금방 넘친다(QuotaExceededError → 백업 자체가 실패).
//   · IndexedDB 는 비동기 + 수백 MB 규모라 이 용도에 맞다.

const DB_NAME = 'emm-drafts';
const STORE = 'drafts';
const DB_VERSION = 1;

/** 서버에 저장된 적 없는 문서의 초안 키 (맵 id 가 없으므로 고정) */
export const UNSAVED_DRAFT_KEY = 'unsaved';

export interface LocalDraft {
  /** 서버 맵 id, 또는 UNSAVED_DRAFT_KEY */
  key: string;
  /** buildSnapshot() 과 같은 v2 스냅샷 */
  snapshot: unknown;
  /** 화면에 보여 줄 이름 */
  title: string;
  /** 적어 둔 시각 (ISO) */
  savedAt: string;
  /** 노드 수 — 복구 안내에 "N개 노드"로 보여 준다 */
  nodeCount: number;
}

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'key' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null); // 사생활 보호 모드 등 — 조용히 포기
    } catch {
      resolve(null);
    }
  });
}

/**
 * 실패를 **삼키지 않는다** (2026-08-06).
 *
 * 예전에는 어떤 실패든 `null` 로 뭉개서, "저장소가 꽉 참(QuotaExceeded)"
 * 처럼 **쓰기만 실패하는** 경우를 아무도 몰랐다. 첫 열기는 성공하므로
 * `isDraftStorageAvailable()` 검사도 통과한다 → 사용자는 보호받는 줄
 * 알지만 실제로는 초안이 하나도 안 적히는 상태. **사용자가 인식하지
 * 못하는 유일한 유실 경로**였다.
 *
 * 이제 성공/실패를 구분해 돌려주고, 쓰기 실패는 화면에 알린다.
 */
type StoreResult<T> = { ok: true; value: T } | { ok: false };

async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<StoreResult<T>> {
  const db = await openDb();
  if (!db) return { ok: false };
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, mode);
      const req = run(tx.objectStore(STORE));
      req.onsuccess = () => resolve({ ok: true, value: req.result as T });
      req.onerror = () => resolve({ ok: false });
      // 쓰기는 트랜잭션이 끝나야 진짜 디스크에 들어간다 — 쿼터 초과는
      // 요청이 아니라 **트랜잭션 중단**으로 나타난다.
      tx.onabort = () => resolve({ ok: false });
      tx.onerror = () => resolve({ ok: false });
      tx.oncomplete = () => db.close();
    } catch {
      resolve({ ok: false });
    }
  });
}

/** 초안 1건 기록 (덮어쓰기). **성공 여부를 돌려준다** */
export async function putDraft(draft: LocalDraft): Promise<boolean> {
  const r = await withStore('readwrite', (s) => s.put(draft) as IDBRequest<unknown>);
  return r.ok;
}

/** 초안 삭제 — 서버 저장에 성공했거나 사용자가 버렸을 때 */
export async function deleteDraft(key: string): Promise<void> {
  await withStore('readwrite', (s) => s.delete(key) as IDBRequest<unknown>);
}

/**
 * **이 브라우저에서 초안 보관이 가능한가.**
 *
 * 사생활 보호 모드·저장소 차단 설정·용량 없음이면 IndexedDB 를 못 연다.
 * 그 경우 크래시 대비 보관이 **통째로 없는** 상태인데, 조용히 넘어가면
 * 사용자는 보호받고 있다고 오해한다 — 화면에 알려 준다 (2026-08-06).
 */
export async function isDraftStorageAvailable(): Promise<boolean> {
  const db = await openDb();
  if (!db) return false;
  db.close();
  return true;
}

/** 남아 있는 초안 전체 (최근 순) */
export async function listDrafts(): Promise<LocalDraft[]> {
  const r = await withStore<LocalDraft[]>('readonly',
    (s) => s.getAll() as IDBRequest<LocalDraft[]>);
  if (!r.ok || !r.value) return [];
  return [...r.value].sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1));
}
