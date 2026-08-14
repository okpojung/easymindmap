// 로그인 접속 기록 — **우리가 직접 남긴다** (2026-08-14 사용자 요청).
//
// 왜 필요한가: 로그인은 GoTrue 가 처리하고 그쪽 감사 로그에 남지만,
// supabase/auth v2.194.0 은 `ip_address` 자리에 **빈 문자열**을 넣는다
// (token.go·logout.go 의 `NewAuditLogEntry(…, "", …)`). 그래서 **접속 IP 가
// GoTrue 쪽에 없다.** 우리는 프록시 뒤에서도 진짜 IP 를 보므로
// (`TRUST_PROXY`, `/v1/health/ip` 로 확인 가능) 우리가 남긴다.
//
// **로그인 목록의 기준이 아니다.** 목록·횟수는 여전히 GoTrue 감사 로그가
// 기준이고, 이 기록은 거기에 IP·기기를 **덧붙이는** 용도다. 이것만 보면
// 이 기능을 넣기 전의 로그인이 통째로 빠진다 — 없는 역사를 지어내지 않는다.

import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

/** 계정당 남기는 최대 건수 — 넘으면 오래된 것부터 지운다.
 *  로그인 목록이 최근 50건까지만 보이므로 200건이면 넉넉하고,
 *  한 계정이 무한정 쌓아 DB 를 밀어내지 못한다. */
const KEEP_PER_USER = 200;

/** 같은 사람의 기록을 이 시간 안에 두 번 남기지 않는다.
 *  화면 새로고침이나 재시도가 같은 로그인을 여러 줄로 만들면
 *  "몇 번 들어왔나"가 부풀어 보인다. */
const DEDUP_SEC = 60;

export interface LoginEventInfo {
  ip?: string;
  platform?: string;
  browser?: string;
}

/** 감사 로그 한 줄에 붙일 접속 정보 */
export interface LoginDetail {
  ip: string | null;
  device: string | null;
}

/**
 * 접속한 곳이 왜 안 보이는가 — **화면이 정확히 말할 수 있게** 서버가 구분한다
 * (2026-08-14 사용자 지적: "이젠 이력화면에서 IP가 빠졌다").
 *
 * 셋은 원인도 다르고 **사용자가 할 일도 다르다.** 하나로 뭉뚱그리면
 * "델타 SQL 을 안 넣었나, 다시 로그인을 안 했나"를 알 수 없다.
 */
export type IpSource =
  /** 붙였다 */
  | 'ok'
  /** 표가 없다 — 서버에 델타 SQL(runbook §1.5-0-F)을 넣어야 한다 */
  | 'no-table'
  /** 표는 있는데 이 사람 기록이 없다 — **다시 로그인하면** 그때부터 쌓인다 */
  | 'no-records';

export interface LoginDetails {
  details: (LoginDetail | null)[];
  source: IpSource;
}

@Injectable()
export class LoginEventsService {
  private readonly log = new Logger('LoginEventsService');

  constructor(private readonly db: DatabaseService) {}

  /** 로그인 직후 프런트가 부른다 → 그때의 IP·기기를 남긴다 */
  async record(userId: string, info: LoginEventInfo): Promise<{ recorded: boolean }> {
    const { rows } = await this.db.query<{ id: string }>(
      `INSERT INTO public.login_events (user_id, client_ip, platform, browser)
       SELECT $1, $2, $3, $4
        WHERE NOT EXISTS (
          SELECT 1 FROM public.login_events
           WHERE user_id = $1 AND at > NOW() - ($5 || ' seconds')::interval
        )
       RETURNING id::text`,
      [userId, info.ip ?? null, info.platform ?? null, info.browser ?? null, String(DEDUP_SEC)],
    );
    if (rows.length === 0) return { recorded: false };

    // 오래된 것 정리 — 커 봐야 계정당 200줄이다
    await this.db.query(
      `DELETE FROM public.login_events
        WHERE user_id = $1
          AND id NOT IN (
            SELECT id FROM public.login_events
             WHERE user_id = $1 ORDER BY at DESC LIMIT $2
          )`,
      [userId, KEEP_PER_USER],
    );
    return { recorded: true };
  }

  /**
   * GoTrue 로그인 줄에 붙일 접속 정보를 시각으로 맞춘다.
   *
   * 두 기록은 **같은 로그인**이지만 시각이 조금 다르다 — GoTrue 가 먼저
   * 쓰고, 프런트가 그 뒤에 우리를 부른다(보통 1~2초). 그래서 정확히
   * 같은 값으로 이을 수 없고 **가장 가까운 것끼리** 맺는다.
   *
   * 규칙 둘.
   *   · 창은 ±{windowSec}초. 넓히면 **다른 로그인의 IP 가 엉뚱한 줄에 붙는다**
   *     (실제로 1분 간격으로 두 번 로그인한 기록이 있다).
   *   · **일대일**로 맺는다. 하나의 기록이 여러 줄에 붙으면 같은 IP 가
   *     번져 보여, 실제보다 많은 곳에서 들어온 것처럼 읽힌다.
   *
   * 못 맺은 줄은 `null` 이다 — 이 기능을 넣기 전의 로그인이 그렇다.
   * 비워 두는 것이 맞다. 아무 값이나 채우면 없는 접속을 지어내는 셈이다.
   */
  async detailsFor(
    userId: string, times: Date[], windowSec = 60,
  ): Promise<LoginDetails> {
    const out: (LoginDetail | null)[] = times.map(() => null);
    // 표가 있는지 먼저 본다 — **"표가 없다"와 "기록이 없다"는 다른 말이다.**
    // 매번 물어보는 이유: 델타 SQL 은 서버가 돌고 있는 중에도 적용된다.
    // 캐시하면 적용하고도 재기동 전까지 계속 "표가 없다"고 답하게 된다.
    const exists = await this.tableExists();
    if (!exists) return { details: out, source: 'no-table' };
    if (times.length === 0) return { details: out, source: 'no-records' };

    const from = new Date(Math.min(...times.map((t) => t.getTime())) - windowSec * 1000);
    const to = new Date(Math.max(...times.map((t) => t.getTime())) + windowSec * 1000);
    let rows: { at: Date; client_ip: string | null; platform: string | null; browser: string | null }[];
    try {
      const r = await this.db.query<{
        at: Date; client_ip: string | null; platform: string | null; browser: string | null;
      }>(
        `SELECT at, client_ip, platform, browser
           FROM public.login_events
          WHERE user_id = $1 AND at BETWEEN $2 AND $3
          ORDER BY at DESC`,
        [userId, from.toISOString(), to.toISOString()],
      );
      rows = r.rows;
    } catch (err) {
      this.log.warn(`접속 기록 조회 실패: ${String((err as Error).message)}`);
      return { details: out, source: 'no-table' };
    }
    if (rows.length === 0) return { details: out, source: 'no-records' };

    // 가까운 짝부터 맺는다 — 먼저 온 순서가 아니라 **차이가 작은 순서**로
    // 맺어야, 1분 간격 로그인 둘이 서로 바뀌지 않는다.
    const pairs: { d: number; i: number; j: number }[] = [];
    times.forEach((t, i) => {
      rows.forEach((r, j) => {
        const d = Math.abs(t.getTime() - new Date(r.at).getTime());
        if (d <= windowSec * 1000) pairs.push({ d, i, j });
      });
    });
    pairs.sort((a, b) => a.d - b.d);

    const usedRow = new Set<number>();
    for (const { i, j } of pairs) {
      if (out[i] !== null || usedRow.has(j)) continue;
      const r = rows[j];
      usedRow.add(j);
      out[i] = {
        ip: r.client_ip,
        device: [r.platform, r.browser].filter(Boolean).join(' · ') || null,
      };
    }
    // 기록은 있는데 **하나도 못 맺었다** = 이 목록의 로그인들이 전부
    // 기록 시작 이전 것이다. 그것도 '기록 없음'으로 알린다.
    return {
      details: out,
      source: out.some(Boolean) ? 'ok' : 'no-records',
    };
  }

  /** `public.login_events` 표가 있는가 (델타 SQL 적용 여부) */
  async tableExists(): Promise<boolean> {
    try {
      const { rows } = await this.db.query<{ ok: boolean }>(
        `SELECT to_regclass('public.login_events') IS NOT NULL AS ok`,
      );
      return rows[0]?.ok === true;
    } catch {
      return false;
    }
  }
}
