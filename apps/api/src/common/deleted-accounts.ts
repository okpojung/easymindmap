// 탈퇴 묘비 조회 — AuthGuard 와 AccountService 가 함께 쓴다 (2026-08-11).
//
// `public.deleted_accounts` 는 회원탈퇴와 함께 들어온 표라, **델타 SQL 을
// 아직 적용하지 않은 서버**에는 없다. 없다고 앱이 죽으면 안 되므로
// (배포와 SQL 적용 사이에 반드시 틈이 있다) 있는지 먼저 보고, 없으면
// "탈퇴한 사람 없음"으로 답한다.
//
// ★ 표가 있는지는 `common/table-ready.ts` 에 묻는다 (2026-09-05).
//   예전에는 여기에 **자기 전용 캐시와 자기 전용 질의**(information_schema
//   COUNT)가 따로 있었다. 같은 질문을 하는 방식이 저장소에 넷이나 되면,
//   새 기능을 만드는 사람이 넷 중 하나를 고르거나 다섯 번째를 만든다 —
//   실제로 그렇게 만든 다섯 번째가 **죽은 코드**였다(account.service.ts,
//   2026-09-04). 한 자리로 모아 둔다.

import type { DatabaseService } from '../database/database.service';
import { resetTableReadyCache, tableReady } from '../common/table-ready';

const DELETED_TABLE = 'public.deleted_accounts';

/**
 * 테스트·재기동 없이 다시 보게 하고 싶을 때 (탈퇴 직후 등).
 * 방금 세운 묘비를 이 프로세스가 곧바로 보게 한다.
 */
export function resetDeletedAccountsCache(): void {
  resetTableReadyCache(DELETED_TABLE);
}

/** `public.deleted_accounts` 표가 이 DB 에 있는가 */
export function hasDeletedAccountsTable(db: DatabaseService): Promise<boolean> {
  return tableReady(db, DELETED_TABLE);
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
