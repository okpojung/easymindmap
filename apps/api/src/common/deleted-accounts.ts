// 탈퇴 묘비 조회 — AuthGuard 와 AccountService 가 함께 쓴다 (2026-08-11).
//
// `public.deleted_accounts` 는 회원탈퇴와 함께 들어온 표라, **델타 SQL 을
// 아직 적용하지 않은 서버**에는 없다. 없다고 앱이 죽으면 안 되므로
// (배포와 SQL 적용 사이에 반드시 틈이 있다) 있는지 먼저 보고, 없으면
// "탈퇴한 사람 없음"으로 답한다.
//
// 결과는 **양방향으로 1분 캐시**한다 — 없다가 생겼을 때도 재기동 없이
// 따라잡는다(maps.service.ts 의 컬럼 탐지와 같은 방식).

import type { DatabaseService } from '../database/database.service';

const CACHE_MS = 60_000;

let tableCache: boolean | null = null;
let tableCacheAt = 0;

/** 테스트·재기동 없이 다시 보게 하고 싶을 때 (탈퇴 직후 등) */
export function resetDeletedAccountsCache(): void {
  tableCache = null;
  tableCacheAt = 0;
}

/** `public.deleted_accounts` 표가 이 DB 에 있는가 */
export async function hasDeletedAccountsTable(db: DatabaseService): Promise<boolean> {
  const now = Date.now();
  if (tableCache !== null && now - tableCacheAt < CACHE_MS) return tableCache;
  tableCacheAt = now;
  try {
    const { rows } = await db.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'deleted_accounts'`,
    );
    tableCache = Number(rows[0]?.n ?? 0) > 0;
  } catch {
    tableCache = false;
  }
  return tableCache;
}

/**
 * 이 id 가 **탈퇴한 계정**인가.
 * 표가 없으면 false — 묘비를 세울 수 없는 서버에서는 막을 근거도 없다.
 */
export async function isDeletedAccount(
  db: DatabaseService, userId: string,
): Promise<boolean> {
  if (!(await hasDeletedAccountsTable(db))) return false;
  try {
    const { rows } = await db.query(
      `SELECT 1 FROM public.deleted_accounts WHERE user_id = $1`,
      [userId],
    );
    return rows.length > 0;
  } catch {
    return false;
  }
}
