/**
 * 맵 접근 판정 — **한 자리** (2026-08-18).
 *
 * ★ 왜 코어에 있나
 *   협업(동시 편집·초대 화면)은 유료 기능이지만, **"이 사람이 이 맵을
 *   열어도 되는가"** 는 코어가 답한다. 판정이 플러그인 쪽에 흩어지면
 *   플러그인이 틀렸을 때 **남의 문서가 열린다.** 접근 제어는 한 자리에
 *   있어야 하고, 그 자리는 데이터를 가진 쪽이다.
 *
 * ★ 표가 없으면 **소유자만** 통과한다
 *   `map_members` 델타를 아직 적용하지 않은 서버에서도 앱이 죽지 않아야
 *   한다. 그때 안전한 쪽은 **더 적게 들여보내는 쪽**이다 — 판정에
 *   실패했다고 열어 주면 장애가 곧 권한 우회가 된다.
 */

import type { QueryResultRow } from 'pg';
import type { DatabaseService } from '../database/database.service';
import { resetTableReadyCache, tableReady, tableReadyCached } from '../common/table-ready';

/** 소유자 · 편집자 · 열람자 */
export type MapRole = 'owner' | 'editor' | 'viewer';

/** 쓰기가 되는 역할 — 열람자는 문서를 저장할 수 없다 */
export const CAN_WRITE: readonly MapRole[] = ['owner', 'editor'];

export function canWrite(role: MapRole): boolean {
  return CAN_WRITE.includes(role);
}

/**
 * 참가자 표가 있는가 — 판정은 `common/table-ready.ts` 한 자리에 있다.
 * 왜 오류 코드가 아니라 존재 여부를 묻는지, 왜 false 만 다시 묻는지는
 * 그 파일의 머리 주석에 실측과 함께 적혀 있다.
 */
const MEMBERS_TABLE = 'public.map_members';

/** 검증용 — 기억한 것을 지운다 */
export function resetMapAccessCache(): void {
  resetTableReadyCache(MEMBERS_TABLE);
}

const OWNER_ONLY_SQL = `
  SELECT m.*, 'owner'::text AS access_role
    FROM public.maps m
   WHERE m.id = $1 AND m.owner_id = $2 AND m.deleted_at IS NULL`;

// 소유자면 owner, 아니면 참가자 역할. **소유자를 참가자 표에 넣지 않는다**
// — 같은 사실을 두 곳에 두면 언젠가 어긋나고, 어긋나면 어느 쪽이 맞는지
// 아무도 모른다.
const WITH_MEMBERS_SQL = `
  SELECT m.*,
         CASE WHEN m.owner_id = $2 THEN 'owner' ELSE mm.role END AS access_role
    FROM public.maps m
    LEFT JOIN public.map_members mm ON mm.map_id = m.id AND mm.user_id = $2
   WHERE m.id = $1 AND m.deleted_at IS NULL
     AND (m.owner_id = $2 OR mm.user_id IS NOT NULL)`;

/**
 * 참가자 표를 쓰는 질의를 돌리되, **표가 없는 서버에서는 소유자 전용
 * 질의로 물러난다**. 델타 미적용 서버에서 앱이 죽지 않게 하는 자리는
 * 여기 하나다 — 호출하는 쪽마다 try/catch 를 흩뿌리면 하나는 반드시
 * 빠뜨린다.
 */
export async function queryAllowingMissingMembers<T extends QueryResultRow>(
  db: DatabaseService, withMembers: string, ownerOnly: string, params: unknown[],
  now: number = Date.now(),
): Promise<T[]> {
  const sql = (await tableReady(db, MEMBERS_TABLE, now)) ? withMembers : ownerOnly;
  // 여기서 나는 오류는 **그대로 올려보낸다.** 삼키면 DB 장애가
  // "권한 없음"으로 둔갑해 원인을 못 찾는다.
  const { rows } = await db.query<T>(sql, params);
  return rows;
}

/**
 * 이 사용자가 볼 수 있는 맵인가. 볼 수 없으면 `null`
 * (없는 맵과 권한 없는 맵을 **구분하지 않는다** — 구분하면 남의 맵 id
 * 존재 여부를 알려 주는 셈이다).
 */
export async function findAccessibleMap<T extends QueryResultRow>(
  db: DatabaseService, mapId: string, userId: string,
): Promise<(T & { access_role: MapRole }) | null> {
  const rows = await queryAllowingMissingMembers<T & { access_role: MapRole }>(
    db, WITH_MEMBERS_SQL, OWNER_ONLY_SQL, [mapId, userId],
  );
  return rows[0] ?? null;
}

/**
 * 참가자 표가 있는가 — 다른 모듈(회원탈퇴 등)이 같은 캐시를 쓴다.
 * 표가 없으면 호출한 쪽은 **더 적게 들여보내는 쪽**으로 물러나야 한다.
 */
export function hasMapMembersTable(db: DatabaseService): Promise<boolean> {
  return tableReady(db, MEMBERS_TABLE, Date.now());
}

/** 운영 점검용 — 마지막으로 확인한 결과(아직 안 물어봤으면 null) */
export function membersTableReady(): boolean | null {
  return tableReadyCached(MEMBERS_TABLE);
}
