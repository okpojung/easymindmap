// admin — 관리자 콘솔의 서버 쪽 (2026-08-13 사용자 요청).
//
// **왜 별도 모듈인가**: 관리자 기능은 남의 계정을 들여다보고 요금제까지
// 바꾼다. 일반 API 와 같은 가드를 쓰면 "일반 사용자 토큰으로도 되는가"를
// 매번 따져야 한다. 문(門)을 따로 두고 그 문에만 규칙을 건다.
//
// ── 로그인은 2단계다 (사용자 지시) ────────────────────────────────
//   ① 이메일 + 비밀번호  — **프런트가 GoTrue 로 직접** 로그인한다.
//      비밀번호가 우리 서버를 지나가지 않는다.
//   ② 이메일 인증번호    — 그 토큰을 들고 와 인증번호를 받고 확인한다.
//      맞으면 **관리자 표**(admin token)를 준다. 유효 8시간.
//
// 인증번호 발송·확인은 가입에 쓰는 것을 **그대로 재사용**한다
// (account.service.ts) — 재발송 간격·시도 횟수 제한이 이미 붙어 있고,
// 두 벌로 나누면 규칙이 갈린다.
//
// **누가 관리자인가**는 환경변수 `ADMIN_EMAILS` 가 정한다. DB 컬럼이
// 아닌 이유: 컬럼이면 DB 를 건드릴 수 있는 사람이 스스로를 관리자로
// 올릴 수 있다. 환경변수는 배포 권한이 있어야 바꾼다.

import {
  BadRequestException, ForbiddenException, Injectable, Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
// ⚠️ CJS 전용 패키지만 쓸 것 (auth.guard.ts 와 같은 이유)
import { sign as jwtSign } from 'jsonwebtoken';
import { DatabaseService } from '../database/database.service';
import { AccountService } from '../account/account.service';
import type { AppEnv } from '../config/env.validation';
import {
  PLAN_PRICE_MAX_KRW, PLAN_PRICE_MIN_KRW,
  PLAN_QUOTA_MAX_MB, PLAN_QUOTA_MIN_MB,
} from './admin-settings';

/** 관리자 표 유효 시간 — 하루 일과보다 길지 않게 */
const ADMIN_TOKEN_TTL_MIN = 8 * 60;

/** 요금제 — users_plan_check 제약과 같은 목록 */
export const PLANS = ['free', 'basic', 'pro', 'team'] as const;
export type Plan = (typeof PLANS)[number];

@Injectable()
export class AdminService {
  private readonly log = new Logger('AdminService');
  private readonly adminEmails: Set<string>;
  private readonly tokenKey: string;
  /** GoTrue 주소 — **진짜 로그인 이력**은 여기에만 있다 (2026-08-13) */
  private readonly goTrueUrl: string;

  constructor(
    private readonly db: DatabaseService,
    private readonly account: AccountService,
    config: ConfigService<AppEnv, true>,
  ) {
    const raw = String(config.get('ADMIN_EMAILS', { infer: true }) || '');
    this.adminEmails = new Set(
      raw.split(',').map((v) => v.trim().toLowerCase()).filter(Boolean),
    );
    // 표 서명 키 — 계정 인증표와 같은 키를 쓴다(같은 서버가 발급한다).
    // 없으면 프로세스마다 임의 값 → 재기동하면 관리자도 다시 로그인한다.
    this.tokenKey =
      String(config.get('SUPABASE_JWT_SECRET', { infer: true }) || '')
      || randomBytes(32).toString('hex');
    this.goTrueUrl =
      String(config.get('GOTRUE_URL', { infer: true }) || '').trim().replace(/\/+$/, '');
    if (this.adminEmails.size === 0) {
      this.log.warn('ADMIN_EMAILS 가 비어 있다 — 관리자 콘솔에 아무도 들어갈 수 없다.');
    }
  }

  isAdminEmail(email: string | undefined | null): boolean {
    return !!email && this.adminEmails.has(String(email).trim().toLowerCase());
  }

  // ── ① 관리자 확인 + 인증번호 발송 ────────────────────────────
  /**
   * GoTrue 로그인을 마친 사람이 부른다(AuthGuard 가 토큰을 검증했다).
   * **관리자가 아니면 여기서 끊는다** — 인증번호도 보내지 않는다.
   */
  async loginStart(email: string | undefined, devMode: boolean) {
    if (!this.isAdminEmail(email)) {
      // 관리자 명단은 알려 주지 않는다 — 같은 문구로 끝낸다.
      throw new ForbiddenException('관리자 계정이 아닙니다.');
    }
    // 문구를 갈라 놓는다 — '가입 인증번호'라고 적힌 메일이 관리자
    // 로그인에도 오면 무엇 때문에 온 메일인지 알 수 없다.
    const r = await this.account.sendEmailCode(email as string, devMode, 'adminLogin');
    return { ...r, step: 'code' as const, email };
  }

  // ── ② 인증번호 확인 → 관리자 표 ──────────────────────────────
  async loginVerify(email: string | undefined, code: string) {
    if (!this.isAdminEmail(email)) {
      throw new ForbiddenException('관리자 계정이 아닙니다.');
    }
    // 틀린 횟수·만료 처리는 가입 쪽과 같은 규칙을 탄다
    await this.account.verifyEmailCode(email as string, code);
    const e = String(email).trim().toLowerCase();
    const exp = Math.floor(Date.now() / 1000) + ADMIN_TOKEN_TTL_MIN * 60;
    this.log.log(`관리자 로그인: ${e}`);
    return {
      adminToken: `${Buffer.from(e, 'utf8').toString('base64url')}.${exp}.${this.sign(e, exp)}`,
      email: e,
      expiresAt: new Date(exp * 1000).toISOString(),
    };
  }

  private sign(email: string, exp: number): string {
    return createHmac('sha256', this.tokenKey).update(`admin|${email}|${exp}`).digest('hex');
  }

  /** 표를 풀어 관리자 이메일을 돌려준다 — 서명·만료·명단이 모두 맞을 때만 */
  readAdminToken(token: string): string | null {
    const parts = String(token || '').split('.');
    if (parts.length !== 3) return null;
    const [b, expRaw, sig] = parts;
    const exp = Number(expRaw);
    if (!Number.isFinite(exp) || !sig || exp * 1000 < Date.now()) return null;
    let email: string;
    try { email = Buffer.from(b, 'base64url').toString('utf8'); } catch { return null; }
    const want = Buffer.from(this.sign(email, exp), 'utf8');
    const got = Buffer.from(sig, 'utf8');
    if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
    // **명단에서 빠진 사람의 표는 그 순간 무효다** — 표를 회수할 방법이
    // 없으므로, 환경변수에서 지우는 것이 곧 회수가 되어야 한다.
    return this.isAdminEmail(email) ? email : null;
  }

  // ── 회원관리 ─────────────────────────────────────────────────
  /**
   * 회원 목록 — 요금제·사용량·활동을 한 번에 본다.
   *
   * **로그인 이력이 아니라 "저장 활동"이다.** GoTrue 는 별도 DB 라 우리가
   * 로그인 기록을 갖고 있지 않다. 대신 저장할 때 남는 기록
   * (map_document_versions 의 시각·플랫폼·브라우저·IP)을 쓴다 —
   * 화면에도 그렇게 밝힌다.
   */
  async listUsers(q: string, limit: number) {
    const like = q ? `%${q.trim().toLowerCase()}%` : null;
    const { rows } = await this.db.query<{
      id: string; email: string | null; full_name: string | null;
      phone_country: string | null; phone_number: string | null;
      plan: string; quota_bytes: string; created_at: Date;
      email_verified_at: Date | null;
      maps: string; attachments: string; file_bytes: string; doc_bytes: string;
      saves_30d: string; last_seen_at: Date | null;
      last_platform: string | null; last_browser: string | null; last_ip: string | null;
    }>(
      `SELECT u.id::text, a.email, u.full_name, u.phone_country, u.phone_number,
              u.plan, u.quota_bytes::text, u.created_at, u.email_verified_at,
              (SELECT COUNT(*)::text FROM public.maps m
                WHERE m.owner_id = u.id AND m.deleted_at IS NULL)        AS maps,
              (SELECT COUNT(*)::text FROM public.attachments t
                WHERE t.owner_id = u.id)                                 AS attachments,
              (SELECT COALESCE(SUM(t.size_bytes),0)::text FROM public.attachments t
                WHERE t.owner_id = u.id)                                 AS file_bytes,
              (COALESCE((SELECT SUM(pg_column_size(d.doc)) FROM public.map_documents d
                           JOIN public.maps m ON m.id = d.map_id
                          WHERE m.owner_id = u.id), 0)
             + COALESCE((SELECT SUM(pg_column_size(v.doc)) FROM public.map_document_versions v
                           JOIN public.maps m ON m.id = v.map_id
                          WHERE m.owner_id = u.id), 0))::text            AS doc_bytes,
              (SELECT COUNT(*)::text FROM public.map_document_versions v
                 JOIN public.maps m ON m.id = v.map_id
                WHERE m.owner_id = u.id AND v.created_at > NOW() - INTERVAL '30 days')
                                                                         AS saves_30d,
              act.created_at AS last_seen_at,
              act.client_platform AS last_platform,
              act.client_browser  AS last_browser,
              act.client_ip::text AS last_ip
         FROM public.users u
         LEFT JOIN auth.users a ON a.id = u.id
         LEFT JOIN LATERAL (
              SELECT v.created_at, v.client_platform, v.client_browser, v.client_ip
                FROM public.map_document_versions v
                JOIN public.maps m ON m.id = v.map_id
               WHERE m.owner_id = u.id
               ORDER BY v.created_at DESC LIMIT 1
         ) act ON TRUE
        WHERE ($1::text IS NULL
               OR lower(COALESCE(a.email,'')) LIKE $1
               OR lower(COALESCE(u.full_name,'')) LIKE $1)
        ORDER BY u.created_at DESC
        LIMIT $2`,
      [like, Math.min(Math.max(limit || 200, 1), 1000)],
    );

    // 로그인 이력은 GoTrue 에만 있다 — 못 가져와도 목록은 그대로 낸다
    const gt = await this.fetchGoTrueUsers();

    return {
      /** false 면 '마지막 로그인' 칸이 비어 있는 이유를 화면이 밝힌다 */
      loginHistoryAvailable: gt !== null,
      users: rows.map((r) => ({
        id: r.id,
        email: r.email,
        fullName: r.full_name,
        phone: r.phone_number ? `${r.phone_country ?? ''} ${r.phone_number}`.trim() : null,
        plan: r.plan,
        quotaBytes: Number(r.quota_bytes),
        usedBytes: Number(r.file_bytes) + Number(r.doc_bytes),
        fileBytes: Number(r.file_bytes),
        docBytes: Number(r.doc_bytes),
        maps: Number(r.maps),
        attachments: Number(r.attachments),
        /** 최근 30일 저장 횟수 — 로그인 횟수가 아니다 */
        saves30d: Number(r.saves_30d),
        createdAt: r.created_at,
        emailVerifiedAt: r.email_verified_at,
        lastSeenAt: r.last_seen_at,
        lastPlatform: r.last_platform,
        lastBrowser: r.last_browser,
        lastIp: r.last_ip,
        // ── GoTrue 가 아는 것 (진짜 로그인) ──
        /** 마지막 **로그인** 시각 — 저장 활동과 다르다 */
        lastSignInAt: gt?.get(r.id)?.lastSignInAt ?? null,
        /** GoTrue 기준 이메일 확인 시각 (우리 쪽 email_verified_at 과 별개) */
        emailConfirmedAt: gt?.get(r.id)?.emailConfirmedAt ?? null,
        /** 차단된 계정이면 그 시각까지 */
        bannedUntil: gt?.get(r.id)?.bannedUntil ?? null,
      })),
    };
  }

  // ── 진짜 로그인 이력 (2026-08-13 사용자 요청) ────────────────
  //
  // **로그인은 GoTrue 가 처리하고 GoTrue 만 안다.** dev 서버는 GoTrue 가
  // 별도 DB 를 쓰므로 우리 DB 를 아무리 뒤져도 나오지 않는다. 그래서
  // 관리자 API 로 물어본다 — 회원탈퇴가 계정을 지울 때와 같은 길이라
  // 새 환경변수도, 서비스 키 보관도 필요 없다.
  //
  // 못 가져와도 **회원 목록은 그대로 보여 준다** — 로그인 이력은 덤이지
  // 목록이 열리지 않을 이유가 아니다. 대신 화면이 그 사실을 밝힌다.

  /** GoTrue 의 사용자들 — id → 로그인 정보. 실패하면 null */
  private async fetchGoTrueUsers(): Promise<Map<string, {
    lastSignInAt: string | null; emailConfirmedAt: string | null; bannedUntil: string | null;
  }> | null> {
    if (!this.goTrueUrl) return null;
    try {
      const token = jwtSign(
        { role: 'service_role', aud: 'authenticated' },
        this.tokenKey, { algorithm: 'HS256', expiresIn: '2m' },
      );
      const res = await fetch(`${this.goTrueUrl}/admin/users?per_page=1000`, {
        headers: { Authorization: `Bearer ${token}`, apikey: token },
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        this.log.warn(`GoTrue 사용자 조회 실패 (HTTP ${res.status}) — 로그인 이력을 비운다`);
        return null;
      }
      const json = (await res.json()) as { users?: Record<string, unknown>[] };
      const map = new Map<string, {
        lastSignInAt: string | null; emailConfirmedAt: string | null; bannedUntil: string | null;
      }>();
      for (const u of json.users ?? []) {
        const id = String(u.id ?? '');
        if (!id) continue;
        // 필드 이름은 GoTrue 판에 따라 조금씩 다르다 — 있는 것을 쓴다.
        map.set(id, {
          lastSignInAt: (u.last_sign_in_at as string) ?? null,
          emailConfirmedAt:
            (u.email_confirmed_at as string) ?? (u.confirmed_at as string) ?? null,
          bannedUntil: (u.banned_until as string) ?? null,
        });
      }
      return map;
    } catch (err) {
      this.log.warn(`GoTrue 사용자 조회 실패: ${String((err as Error).message)}`);
      return null;
    }
  }

  /** 요금제 변경 — quota_bytes 는 users_sync_quota 트리거가 따라온다 */
  async setPlan(userId: string, plan: string, byEmail: string) {
    if (!(PLANS as readonly string[]).includes(plan)) {
      throw new BadRequestException(`요금제는 ${PLANS.join('·')} 중 하나여야 합니다.`);
    }
    const { rows } = await this.db.query<{ plan: string; quota_bytes: string; email: string | null }>(
      `UPDATE public.users u SET plan = $2, updated_at = NOW()
        WHERE u.id = $1
       RETURNING u.plan, u.quota_bytes::text,
                 (SELECT a.email FROM auth.users a WHERE a.id = u.id) AS email`,
      [userId, plan],
    );
    // 없는 사용자에 조용히 성공하지 않는다 — 바꿨다고 여기는데 화면은 그대로다
    if (rows.length === 0) throw new BadRequestException('그 계정을 찾을 수 없습니다.');
    this.log.log(`요금제 변경: ${rows[0].email} → ${plan} (관리자 ${byEmail})`);
    return {
      plan: rows[0].plan,
      quotaBytes: Number(rows[0].quota_bytes),
      email: rows[0].email,
    };
  }

  /**
   * 요금제 한도를 바꾼다 — **콘솔에서 고칠 수 있는 유일한 값** (2026-08-14).
   *
   * 어려운 부분은 표를 고치는 것이 아니라 **이미 있는 회원을 어떻게 하느냐**다.
   * `users.quota_bytes` 는 요금제가 *바뀔 때만* 트리거가 따라오므로, 표만
   * 고치면 **기존 회원은 옛 한도 그대로**다 — 바꿨는데 아무 일도 안 일어난다.
   *
   * 그렇다고 그 요금제 전원을 덮으면 **특별 계약(quota_bytes 를 직접 올려 둔
   * 계정)이 조용히 깎인다** (schema.sql 의 escape hatch).
   *
   * 그래서 **옛 한도와 정확히 같은 사람만** 옮긴다. 다른 값을 가진 사람은
   * 손대지 않고, 몇 명을 그렇게 두었는지 함께 돌려줘 화면이 밝히게 한다.
   */
  async setPlanQuota(plan: string, mb: number, byEmail: string) {
    if (!(PLANS as readonly string[]).includes(plan)) {
      throw new BadRequestException(`요금제는 ${PLANS.join('·')} 중 하나여야 합니다.`);
    }
    if (!Number.isInteger(mb) || mb < PLAN_QUOTA_MIN_MB || mb > PLAN_QUOTA_MAX_MB) {
      throw new BadRequestException(
        `한도는 ${PLAN_QUOTA_MIN_MB} ~ ${PLAN_QUOTA_MAX_MB} MB 사이의 정수여야 합니다.`,
      );
    }
    const bytes = BigInt(mb) * 1048576n;

    return this.db.transaction(async (c) => {
      // 옛 값을 **잠가서** 읽는다 — 두 관리자가 동시에 바꾸면 한쪽의
      // "옛 한도와 같은 사람" 판정이 이미 틀린 값을 보게 된다
      const before = await c.query<{ quota_bytes: string }>(
        `SELECT quota_bytes::text FROM public.plan_quotas WHERE plan = $1 FOR UPDATE`,
        [plan],
      );
      if (before.rows.length === 0) {
        throw new BadRequestException(
          'plan_quotas 표에 그 요금제가 없습니다 — schema.sql 을 적용해 주세요.',
        );
      }
      const old = BigInt(before.rows[0].quota_bytes);

      await c.query(
        `UPDATE public.plan_quotas
            SET quota_bytes = $2, updated_at = NOW(), updated_by = $3
          WHERE plan = $1`,
        [plan, bytes.toString(), byEmail],
      );

      // 옛 한도를 그대로 쓰던 사람만 옮긴다
      const moved = await c.query(
        `UPDATE public.users SET quota_bytes = $2, updated_at = NOW()
          WHERE plan = $1 AND quota_bytes = $3`,
        [plan, bytes.toString(), old.toString()],
      );
      // 남은 사람 = 특별 계약(직접 올려 둔 값)
      const kept = await c.query<{ n: string }>(
        `SELECT COUNT(*)::text AS n FROM public.users
          WHERE plan = $1 AND quota_bytes <> $2`,
        [plan, bytes.toString()],
      );

      const usersUpdated = moved.rowCount ?? 0;
      const usersKept = Number(kept.rows[0]?.n ?? 0);
      this.log.log(
        `요금제 한도 변경: ${plan} ${old / 1048576n}MB → ${mb}MB `
        + `(회원 ${usersUpdated}명 반영 · ${usersKept}명 유지, 관리자 ${byEmail})`,
      );
      return { plan, mb, previousMb: Number(old / 1048576n), usersUpdated, usersKept };
    });
  }

  /**
   * 요금제 **구독 요금** 변경 (2026-08-18, 사용자 요청).
   *
   * 한도와 달리 **회원 행을 건드리지 않는다** — 값은 결제할 때 이 표에서
   * 읽는다. 이미 결제한 사람의 원장은 그때의 청구액을 이미 들고 있으므로
   * 가격을 바꿔도 **과거 결제는 흔들리지 않는다.**
   *
   * `0` 은 "결제하지 않는 요금제"다. 그 밖에는 **1,000원 이상**만 받는다 —
   * PG 최소 금액이 1,000원이라, 그 아래로 두면 **저장은 되는데 결제창에서
   * 거절**되는 값이 생긴다. 저장할 때 막는 편이 낫다.
   */
  async setPlanPrice(plan: string, krw: number, byEmail: string) {
    if (!(PLANS as readonly string[]).includes(plan)) {
      throw new BadRequestException(`요금제는 ${PLANS.join('·')} 중 하나여야 합니다.`);
    }
    if (!Number.isInteger(krw) || krw < 0 || krw > PLAN_PRICE_MAX_KRW) {
      throw new BadRequestException(
        `요금은 0 ~ ${PLAN_PRICE_MAX_KRW.toLocaleString('ko-KR')}원 사이의 정수여야 합니다.`,
      );
    }
    if (krw > 0 && krw < PLAN_PRICE_MIN_KRW) {
      throw new BadRequestException(
        `결제하는 요금제는 ${PLAN_PRICE_MIN_KRW.toLocaleString('ko-KR')}원 이상이어야 합니다 `
        + '(PG 최소 결제 금액). 무료로 두려면 0 을 넣으세요.',
      );
    }

    const { rows } = await this.db.query<{ price_krw: number }>(
      `UPDATE public.plan_quotas SET price_krw = $2, updated_at = NOW(), updated_by = $3
        WHERE plan = $1
        RETURNING (SELECT price_krw FROM public.plan_quotas WHERE plan = $1) AS price_krw`,
      [plan, krw, byEmail],
    );
    if (!rows.length) {
      throw new BadRequestException(
        'plan_quotas 표에 그 요금제가 없습니다 — 델타 SQL 을 적용해 주세요.',
      );
    }
    this.log.log(`요금제 요금 변경: ${plan} → ${krw}원 (관리자 ${byEmail})`);
    return { plan, krw };
  }

  /** 화면 위쪽 요약 — 전체 회원 수와 요금제 분포 */
  async summary() {
    const { rows } = await this.db.query<{ plan: string; n: string; bytes: string }>(
      `SELECT u.plan,
              COUNT(*)::text AS n,
              COALESCE(SUM(
                COALESCE((SELECT SUM(t.size_bytes) FROM public.attachments t
                           WHERE t.owner_id = u.id), 0)
              ), 0)::text AS bytes
         FROM public.users u GROUP BY u.plan ORDER BY u.plan`,
    );
    const { rows: recent } = await this.db.query<{ n7: string; n30: string }>(
      `SELECT COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days')::text  AS n7,
              COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days')::text AS n30
         FROM public.users`,
    );
    return {
      byPlan: rows.map((r) => ({ plan: r.plan, users: Number(r.n), fileBytes: Number(r.bytes) })),
      total: rows.reduce((s, r) => s + Number(r.n), 0),
      new7d: Number(recent[0]?.n7 ?? 0),
      new30d: Number(recent[0]?.n30 ?? 0),
    };
  }
}
