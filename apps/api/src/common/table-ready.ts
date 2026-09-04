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
 * ★ 있으면 기억하고, 없으면 **잠시 뒤 다시 묻는다**
 *   표가 사라질 일은 없으니 true 는 영구히 기억한다. false 는 그렇지
 *   않다 — 관리자가 델타를 적용했는데 재기동해야 반영된다면, 그 사이
 *   "기능이 안 되는데 이유를 모르는" 시간이 생긴다.
 */

import type { DatabaseService } from '../database/database.service';

/** 없다고 판정한 표를 다시 물어보기까지의 시간 */
const RECHECK_MS = 60_000;

interface Memo { ready: boolean; checkedAt: number }

const memo = new Map<string, Memo>();

/**
 * `to_regclass` 로 표의 존재를 묻는다. `table` 은 스키마를 포함한
 * 정규화된 이름(`'public.map_members'`)을 준다.
 */
export async function tableReady(
  db: DatabaseService, table: string, now: number = Date.now(),
): Promise<boolean> {
  const cur = memo.get(table);
  if (cur?.ready === true) return true;
  if (cur && !cur.ready && now - cur.checkedAt < RECHECK_MS) return false;
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
