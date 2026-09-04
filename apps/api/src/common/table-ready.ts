/**
 * "이 표가 이 서버에 있는가" — **한 자리** (2026-09-04).
 *
 * ★ 왜 필요한가
 *   스키마 델타를 적용하지 않은 서버에서도 앱이 **죽지 않아야** 한다.
 *   표가 없을 때 물러나는 자리가 기능마다 흩어지면, 언젠가 한 곳이
 *   빠지고 그 한 곳이 배포 직후 500 이 된다.
 *
 * ★ 오류 코드로 판단하지 않는다 — **존재 여부를 직접 묻는다**
 *   실측(2026-08-18, map-access.ts): `DatabaseService.query` 는
 *   `42P01`(undefined_table)을 **503 예외로 바꿔서** 올려 준다. 그래서
 *   오류 코드를 보고 물러나려던 첫 구현은 아무것도 잡지 못했고, 델타를
 *   적용하지 않은 서버에서는 맵 열기가 통째로 503 이 됐다.
 *
 *   **같은 덫에 두 번 물렸다** (2026-09-04, account.service.ts). AI 키·설정
 *   쪽도 `catch (e) { if (e.code === '42P01') … }` 로 물러나려 했고, 그
 *   분기는 한 번도 실행되지 않았다 — 화면이 "스키마가 아직 적용되지 않아"
 *   대신 "서버가 응답하지 않아" 라는 **틀린 진단**을 냈다. 새 표를 쓰는
 *   기능은 여기를 쓴다. 그리고 `test/schema-degrade.test.mjs` 가 표를
 *   실제로 치워 보고 물러남을 확인한다 — 죽은 분기는 그렇게만 잡힌다.
 *
 *   ⚠️ **503 을 잡아 "표가 없다"로 읽는 것도 안 된다** — 그 변환은 표·
 *   **컬럼**·함수 없음을 **모두 같은 503** 으로 만든다. 컬럼 하나가 빠진
 *   서버를 "표가 없다"고 잘못 말하게 된다.
 *
 * ★ 있으면 기억하고, 없으면 **잠시 뒤 다시 묻는다**
 *   표가 사라질 일은 없으니 true 는 영구히 기억한다. false 는 그렇지
 *   않다 — 관리자가 델타를 적용했는데 재기동해야 반영된다면, 그 사이
 *   "기능이 안 되는데 이유를 모르는" 시간이 생긴다.
 *
 *   **"없다"를 얼마나 기억할지는 부르는 쪽이 정한다**(`missTtlMs`, 2026-09-05).
 *   기본 1분은 **자주 불리는 자리**를 위한 것이다 — 맵을 열 때마다
 *   `to_regclass` 를 치지 않으려는 것뿐이다. 반대로 **드물게 불리고
 *   델타 직후 바로 반영돼야 하는 자리**(로그인 기록 화면 등)는 `0` 을
 *   주어 매번 묻는다. 1분은 사람이 "적용했는데 왜 그대로지?" 하고
 *   헤매기에 충분한 시간이고, 그 자리는 어차피 트래픽이 없어 매번 물어도
 *   비용이 없다.
 */

import type { DatabaseService } from '../database/database.service';

/** "없다"를 기억하는 기본 시간 — 부르는 쪽이 `missTtlMs` 로 덮어쓴다 */
export const DEFAULT_MISS_TTL_MS = 60_000;

/** 매번 다시 묻는다 — 델타 적용을 곧바로 알아채야 하는 자리 */
export const ALWAYS_RECHECK = 0;

export interface TableReadyOptions {
  /** 지금 시각 (테스트에서 시간을 흐르게 하려고 받는다) */
  now?: number;
  /**
   * "없다"를 이만큼 기억한다(ms). `0`(=`ALWAYS_RECHECK`) 이면 기억하지
   * 않고 매번 묻는다. **"있다"는 언제나 영구히 기억한다** — 표가
   * 사라지는 일은 없다.
   */
  missTtlMs?: number;
}

interface Memo { ready: boolean; checkedAt: number }

const memo = new Map<string, Memo>();

/**
 * `to_regclass` 로 표의 존재를 묻는다. `table` 은 스키마를 포함한
 * 정규화된 이름(`'public.map_members'`)을 준다.
 */
export async function tableReady(
  db: DatabaseService, table: string, opts: TableReadyOptions = {},
): Promise<boolean> {
  const now = opts.now ?? Date.now();
  const missTtl = opts.missTtlMs ?? DEFAULT_MISS_TTL_MS;
  const cur = memo.get(table);
  if (cur?.ready === true) return true;
  if (cur && !cur.ready && missTtl > 0 && now - cur.checkedAt < missTtl) return false;
  const { rows } = await db.query<{ ok: boolean }>(
    `SELECT to_regclass($1) IS NOT NULL AS ok`, [table],
  );
  const ready = rows[0]?.ok === true;
  memo.set(table, { ready, checkedAt: now });
  return ready;
}

/** 검증용 — 기억한 것을 지운다 (인자를 주면 그 표만) */
export function resetTableReadyCache(table?: string): void {
  if (table) memo.delete(table);
  else memo.clear();
}

/** 운영 점검용 — 마지막으로 확인한 결과(아직 안 물어봤으면 null) */
export function tableReadyCached(table: string): boolean | null {
  return memo.get(table)?.ready ?? null;
}
