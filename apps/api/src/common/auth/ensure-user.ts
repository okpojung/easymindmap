/**
 * JIT 사용자 프로비저닝 — **한 자리** (2026-09-06).
 *
 * 검증된 토큰의 사용자가 DB 에 없으면 만든다. Supabase 스택(GoTrue)이
 * API 와 같은 DB 를 쓰면 이미 존재하므로 no-op 이고, 분리 배포(다른 DB)
 * 여도 FK 가 깨지지 않게 하는 안전망이다.
 *
 * ★ 왜 떼어 냈나 — **문이 둘이 됐기 때문이다** (MCP 3단계).
 *   예전에는 `AuthGuard` 하나만 사용자를 만들었다. 이제 MCP 가 OAuth
 *   토큰으로 들어오는 문을 하나 더 열었고, 그쪽도 같은 일을 해야 한다.
 *   같은 규칙을 두 벌로 두면 언젠가 한쪽만 고쳐진다 — 그리고 여기서
 *   갈리면 **탈퇴한 계정이 한쪽 문으로만 되살아난다.**
 */
import { Logger, UnauthorizedException } from '@nestjs/common';
import type { DatabaseService } from '../../database/database.service';
import { isDeletedAccount } from '../deleted-accounts';
import { knownUsers } from './known-users';

const log = new Logger('EnsureUser');

export async function ensureUserProvisioned(
  db: DatabaseService, id: string, email?: string,
): Promise<void> {
  if (knownUsers.has(id)) return;
  // **탈퇴한 계정은 되살리지 않는다** (2026-08-11).
  // 탈퇴 직후에도 그 사람의 액세스 토큰은 만료 전까지 유효하다. 이
  // 확인이 없으면 아래 INSERT 가 auth.users 를 다시 만들어, 그 이메일이
  // 다시 잡혀 **같은 주소로 재가입할 수 없게** 된다.
  if (await isDeletedAccount(db, id)) {
    throw new UnauthorizedException('탈퇴한 계정입니다. 다시 가입해 주세요.');
  }
  try {
    await db.query(
      `INSERT INTO auth.users (id, email) VALUES ($1, $2)
       ON CONFLICT (id) DO NOTHING`,
      [id, email ?? null],
    );
    // 트리거가 없는 환경(진짜 Supabase 는 자체 트리거 구성) 대비 —
    // public.users 도 명시적으로 보장한다.
    await db.query(
      `INSERT INTO public.users (id) VALUES ($1) ON CONFLICT (id) DO NOTHING`,
      [id],
    );
    knownUsers.add(id);
  } catch (err) {
    log.error(`사용자 JIT 생성 실패 (id=${id})`, err as Error);
    throw new UnauthorizedException('사용자 초기화에 실패했습니다. 잠시 후 다시 시도해 주세요.');
  }
}
