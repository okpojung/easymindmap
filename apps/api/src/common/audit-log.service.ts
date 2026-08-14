// 로그인 이력 — GoTrue 의 **감사 로그**를 읽는다 (2026-08-13 사용자 요청).
//
// **왜 두 번째 DB 연결인가**: 로그인은 GoTrue 가 처리하고, dev 서버의
// GoTrue 는 **별도 데이터베이스**(`gotrue`)를 쓴다. 관리자 API 는 마지막
// 로그인 시각만 주고 **횟수·이력 목록은 주지 않는다.** 그 기록은
// `auth.audit_log_entries` 에만 있다.
//
// **설정이 없으면 조용히 비활성이다** — 앱은 죽지 않고, 화면이 "이력을
// 볼 수 없다"고 밝힌다. 없는 것을 있는 척하지 않는다.
//
//   GOTRUE_DATABASE_URL=postgres://postgres:<pw>@<host>:5432/gotrue
//
// 읽기만 한다. 쓰기는 GoTrue 의 몫이다.

import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import type { AppEnv } from '../config/env.validation';

// ── IP 에 대하여 (2026-08-14 사용자 지적: "IP 값이 없다") ──────────────
//
// **GoTrue 가 로그인 IP 를 기록하지 않는다.** 우리 쿼리 문제가 아니다.
// `auth.audit_log_entries.ip_address` 컬럼은 있지만, supabase/auth
// v2.194.0 의 로그인·로그아웃 경로가 그 자리에 **빈 문자열을 넣는다**:
//
//   internal/api/token.go  models.NewAuditLogEntry(…, models.LoginAction,  "", …)
//   internal/api/logout.go models.NewAuditLogEntry(…, models.LogoutAction, "", …)
//
// payload JSON 에도 ip 키가 없다(actor_id·actor_username·action·log_type뿐).
// 그래서 **우리 코드로는 채울 방법이 없다** — 화면은 그 사실을 밝힌다.
// 진짜 접속 IP 가 필요하면 우리가 직접 기록해야 한다(로그인 직후 우리 API 를
// 부르는 방식). 그건 별도 작업이다.
//
// 다른 판의 GoTrue 나 다른 사건은 값을 넣을 수 있으므로 **읽기는 그대로 둔다.**

/**
 * 보여 줄 사건만 고른다. `token_refreshed` 는 앱이 자동으로 일으켜
 * 하루에도 수십 건씩 쌓인다 — 섞으면 **사람이 한 일이 묻힌다.**
 */
const SHOWN_ACTIONS: Record<string, string> = {
  login: '로그인',
  logout: '로그아웃',
  user_signedup: '가입',
  user_modified: '계정 정보 변경',
  user_recovery_requested: '비밀번호 재설정 요청',
  user_updated_password: '비밀번호 변경',
};

export interface LoginEvent {
  at: string;
  /** 'login' 같은 원래 값 — 화면이 모르는 종류도 그대로 보여 줄 수 있게 */
  action: string;
  label: string;
  ip: string | null;
}

export interface LoginHistory {
  /** false 면 화면이 **왜 비어 있는지** 밝힌다 */
  available: boolean;
  events: LoginEvent[];
  /** 이 목록이 최대 몇 건까지인가 — 화면이 "더 있다"를 말할 수 있게 (2026-08-14).
   *  이 값을 주지 않으면 화면은 "최근 N건입니다" 밖에 못 쓰는데,
   *  N 이 전부인지 잘린 것인지 읽는 사람이 알 수 없다. */
  limit: number;
  /** 최근 30일 로그인 횟수 */
  logins30d: number;
  /** 전체 로그인 횟수 */
  loginsTotal: number;
  lastLoginAt: string | null;
}

const EMPTY: LoginHistory = {
  available: false, events: [], limit: 0, logins30d: 0, loginsTotal: 0, lastLoginAt: null,
};

@Injectable()
export class AuditLogService implements OnModuleDestroy {
  private readonly log = new Logger('AuditLogService');
  private readonly pool: Pool | null;

  constructor(config: ConfigService<AppEnv, true>) {
    const url = String(config.get('GOTRUE_DATABASE_URL', { infer: true }) || '').trim();
    if (!url) {
      this.pool = null;
      if (config.get('AUTH_MODE', { infer: true }) === 'supabase') {
        this.log.warn(
          'GOTRUE_DATABASE_URL 이 없다 — 로그인 이력(횟수·시각·IP)을 볼 수 없다. '
          + '마지막 로그인 시각만 관리자 API 로 가져온다.',
        );
      }
      return;
    }
    // 작은 풀이면 충분하다 — 사람이 화면을 열 때만 쓴다.
    this.pool = new Pool({ connectionString: url, max: 3, idleTimeoutMillis: 30_000 });
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool?.end();
  }

  get enabled(): boolean { return this.pool !== null; }

  /**
   * 한 사람의 로그인 이력.
   *
   * `actor_id` 는 GoTrue 의 사용자 id 이고, 우리 `auth.users.id` 와 같은
   * 값이다(가드가 토큰의 sub 로 만든다). 그래서 그대로 넘기면 된다.
   */
  async forUser(userId: string, limit = 50): Promise<LoginHistory> {
    if (!this.pool) return EMPTY;
    try {
      const actions = Object.keys(SHOWN_ACTIONS);
      const take = Math.min(Math.max(limit, 1), 200);
      const [list, counts] = await Promise.all([
        this.pool.query<{ created_at: Date; ip_address: string | null; action: string }>(
          `SELECT created_at, ip_address, payload->>'action' AS action
             FROM auth.audit_log_entries
            WHERE payload->>'actor_id' = $1
              AND payload->>'action' = ANY($2)
            ORDER BY created_at DESC
            LIMIT $3`,
          [userId, actions, take],
        ),
        this.pool.query<{ total: string; d30: string; last_at: Date | null }>(
          `SELECT COUNT(*)::text AS total,
                  COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days')::text AS d30,
                  MAX(created_at) AS last_at
             FROM auth.audit_log_entries
            WHERE payload->>'actor_id' = $1 AND payload->>'action' = 'login'`,
          [userId],
        ),
      ]);
      const c = counts.rows[0];
      return {
        available: true,
        limit: take,
        events: list.rows.map((r) => ({
          at: r.created_at.toISOString(),
          action: r.action,
          label: SHOWN_ACTIONS[r.action] ?? r.action,
          // 비어 있으면 null 로 — 화면이 "빈 값"과 "기록 안 함"을 구분한다.
          // GoTrue v2.194.0 은 로그인·로그아웃에 **빈 문자열**을 넣는다(아래 주석).
          ip: (r.ip_address ?? '').trim() || null,
        })),
        logins30d: Number(c?.d30 ?? 0),
        loginsTotal: Number(c?.total ?? 0),
        lastLoginAt: c?.last_at ? new Date(c.last_at).toISOString() : null,
      };
    } catch (err) {
      // 표가 없거나(다른 GoTrue 판) 접속이 안 되는 경우 — 화면은 비운다.
      this.log.warn(`로그인 이력 조회 실패 (id=${userId}): ${String((err as Error).message)}`);
      return EMPTY;
    }
  }
}
