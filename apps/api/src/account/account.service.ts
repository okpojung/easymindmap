// account — 가입 이메일 인증번호와 회원 프로필(성명·휴대폰).
//
// 가입 흐름 (2026-08-09 사용자 요청):
//   ① [이메일 인증] → POST /account/email-code        — 6자리 코드 메일
//   ② 코드 입력     → POST /account/email-code/verify — 맞으면 **인증표**
//      (emailToken)를 준다. 이 표가 "이 이메일은 확인됐다"는 증거다.
//   ③ 가입 버튼     → 프런트가 GoTrue 로 계정을 만들고 로그인한 뒤,
//      PUT /account/profile 로 성명·휴대폰 + ②의 표를 보낸다.
//      서버는 표의 이메일과 **로그인한 사람의 이메일이 같은지** 보고 저장한다.
//
// 왜 표(HMAC)인가 — 가입은 GoTrue 에서 일어나므로 ②와 ③ 사이에 세션이
// 새로 생긴다. 그 사이를 잇는 증거가 필요한데, DB 를 다시 뒤지지 않고
// **서명만 검증하면 되는 값**이 가장 단순하다. 유효 30분.

import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
// ⚠️ CJS 전용 패키지만 쓸 것 — auth.guard.ts 와 같은 이유(ERR_REQUIRE_ESM)
import { sign as jwtSign } from 'jsonwebtoken';
import { DatabaseService } from '../database/database.service';
import { MailService, type CodePurpose } from '../mail/mail.service';
import { StorageService } from '../storage/storage.service';
import {
  hasDeletedAccountsTable, resetDeletedAccountsCache,
} from '../common/deleted-accounts';
import { forgetKnownUser } from '../common/auth/known-users';
import type { AppEnv } from '../config/env.validation';

/** 인증번호 규칙 — 한 곳에 모아 둔다 (문서 auth-session-ui.md §11 과 같은 값) */
const CODE_DIGITS = 6;
const CODE_TTL_MIN = 10; // 유효 시간
const MAX_ATTEMPTS = 5; // 틀릴 수 있는 횟수
const RESEND_WAIT_SEC = 60; // 재발송 최소 간격
const MAX_SENDS_PER_HOUR = 5; // 같은 이메일로 시간당 발송 상한
const TOKEN_TTL_MIN = 30; // 인증표 유효 시간

/**
 * 회원탈퇴 확인 문구 — **버튼만으로는 지우지 않는다.**
 * 되돌릴 수 없는 삭제라, 손이 미끄러져서는 일어나지 않게 직접 치게 한다.
 */
export const DELETE_CONFIRM_PHRASE = '회원탈퇴';

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

@Injectable()
export class AccountService {
  private readonly log = new Logger('AccountService');
  /**
   * 인증표 서명 키. 운영에서는 JWT 비밀키를 쓰고(서버가 여럿이어도 같다),
   * 개발(AUTH_MODE=dev)에서는 프로세스마다 임의 값이면 충분하다 —
   * 서버를 재기동하면 발급했던 표가 무효가 되지만 그게 더 안전하다.
   */
  private readonly tokenKey: string;
  /** GoTrue 주소 (끝 슬래시 제거). 비어 있으면 로그인 계정 삭제를 건너뛴다 */
  private readonly goTrueUrl: string;
  /** 로그인 계정이 **우리 DB 밖(GoTrue)** 에 사는가 (AUTH_MODE=supabase) */
  private readonly authExternal: boolean;

  constructor(
    private readonly db: DatabaseService,
    private readonly mail: MailService,
    private readonly storage: StorageService,
    config: ConfigService<AppEnv, true>,
  ) {
    this.tokenKey =
      String(config.get('SUPABASE_JWT_SECRET', { infer: true }) || '')
      || randomBytes(32).toString('hex');
    this.goTrueUrl =
      String(config.get('GOTRUE_URL', { infer: true }) || '').trim().replace(/\/+$/, '');
    this.authExternal = config.get('AUTH_MODE', { infer: true }) === 'supabase';
    // 기동할 때 한 번 알린다 — 탈퇴가 일어난 뒤에 알면 이미 늦다.
    if (!this.goTrueUrl && this.authExternal) {
      this.log.warn(
        'GOTRUE_URL 이 비어 있다 — 회원탈퇴가 로그인 계정을 지우지 못한다. '
        + '자료는 지워지지만 같은 이메일로 재가입이 막힌다 '
        + '(예: GOTRUE_URL=http://auth-dev:9999).',
      );
    }
  }

  /** 이메일 정규화 — 저장·조회의 단일 기준 (대소문자·공백으로 갈리지 않게) */
  private norm(email: string): string {
    const v = String(email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) || v.length > 255) {
      throw new BadRequestException('올바른 이메일 주소를 입력해 주세요.');
    }
    return v;
  }

  /**
   * ① 인증번호 발송. 같은 이메일로 다시 부르면 **앞의 코드는 무효**가 된다.
   * devCode 는 AUTH_MODE=dev + 메일 미설정일 때만 채워진다 — 메일 없이도
   * 가입 흐름 전체를 시험할 수 있게 (운영에서는 절대 나가지 않는다).
   */
  async sendEmailCode(emailRaw: string, devMode: boolean, purpose: CodePurpose = 'signup') {
    const email = this.norm(emailRaw);

    // 재발송 제한 — 남의 메일함을 두드리는 데 쓰이지 않게
    const { rows: cur } = await this.db.query<{
      wait_sec: number; sent_count: number; window_fresh: boolean;
    }>(
      `SELECT GREATEST(0, $2 - EXTRACT(EPOCH FROM (NOW() - sent_at)))::int AS wait_sec,
              sent_count,
              (NOW() - window_at) < INTERVAL '1 hour' AS window_fresh
         FROM public.email_verifications WHERE email = $1`,
      [email, RESEND_WAIT_SEC],
    );
    if (cur[0]) {
      if (cur[0].wait_sec > 0) {
        throw new BadRequestException(
          `${cur[0].wait_sec}초 뒤에 다시 요청할 수 있습니다.`,
        );
      }
      if (cur[0].window_fresh && cur[0].sent_count >= MAX_SENDS_PER_HOUR) {
        throw new BadRequestException(
          '인증번호를 너무 자주 요청했습니다. 1시간 뒤에 다시 시도해 주세요.',
        );
      }
    }

    // 앞자리 0 도 나오게 — 문자열로 다룬다
    const code = String(randomInt(0, 10 ** CODE_DIGITS)).padStart(CODE_DIGITS, '0');
    await this.db.query(
      `INSERT INTO public.email_verifications
         (email, code_hash, expires_at, attempts, sent_at, sent_count, window_at, consumed_at)
       VALUES ($1, $2, NOW() + ($3 || ' minutes')::interval, 0, NOW(), 1, NOW(), NULL)
       ON CONFLICT (email) DO UPDATE SET
         code_hash   = EXCLUDED.code_hash,
         expires_at  = EXCLUDED.expires_at,
         attempts    = 0,
         sent_at     = NOW(),
         -- 1시간 창이 지났으면 횟수를 처음부터 다시 센다
         sent_count  = CASE WHEN NOW() - public.email_verifications.window_at < INTERVAL '1 hour'
                            THEN public.email_verifications.sent_count + 1 ELSE 1 END,
         window_at   = CASE WHEN NOW() - public.email_verifications.window_at < INTERVAL '1 hour'
                            THEN public.email_verifications.window_at ELSE NOW() END,
         consumed_at = NULL`,
      [email, sha256(code), String(CODE_TTL_MIN)],
    );

    if (this.mail.isConfigured()) {
      await this.mail.sendCode(email, code, CODE_TTL_MIN, purpose);
      return { sent: true as const, expiresInMin: CODE_TTL_MIN };
    }

    // 메일 설정이 없다 — 거짓으로 "보냈다"고 하지 않는다.
    if (devMode) {
      this.log.warn(`[개발] 메일 미설정 — ${email} 인증번호 = ${code}`);
      return {
        sent: false as const, expiresInMin: CODE_TTL_MIN, devCode: code,
        message: '메일 발송이 설정되지 않아 화면에 인증번호를 표시합니다 (개발 모드).',
      };
    }
    throw new BadRequestException(
      '메일 발송이 아직 설정되지 않았습니다. 관리자에게 문의해 주세요.',
    );
  }

  /** ② 인증번호 확인 → 인증표(emailToken) */
  async verifyEmailCode(emailRaw: string, codeRaw: string) {
    const email = this.norm(emailRaw);
    const code = String(codeRaw || '').trim();

    const { rows } = await this.db.query<{
      code_hash: string; attempts: number; expired: boolean;
    }>(
      `SELECT code_hash, attempts, (expires_at <= NOW()) AS expired
         FROM public.email_verifications WHERE email = $1`,
      [email],
    );
    const row = rows[0];
    if (!row) throw new BadRequestException('먼저 [이메일 인증]을 눌러 인증번호를 받아 주세요.');
    if (row.expired) throw new BadRequestException('인증번호가 만료되었습니다. 다시 받아 주세요.');
    if (row.attempts >= MAX_ATTEMPTS) {
      throw new BadRequestException('입력 횟수를 넘었습니다. 인증번호를 다시 받아 주세요.');
    }

    const want = Buffer.from(row.code_hash, 'utf8');
    const got = Buffer.from(sha256(code), 'utf8');
    const ok = want.length === got.length && timingSafeEqual(want, got);
    if (!ok) {
      const { rows: a } = await this.db.query<{ attempts: number }>(
        `UPDATE public.email_verifications SET attempts = attempts + 1
          WHERE email = $1 RETURNING attempts`,
        [email],
      );
      const left = Math.max(0, MAX_ATTEMPTS - (a[0]?.attempts ?? MAX_ATTEMPTS));
      throw new BadRequestException(
        left > 0 ? `인증번호가 다릅니다. (${left}회 남음)` : '입력 횟수를 넘었습니다. 다시 받아 주세요.',
      );
    }

    await this.db.query(
      `UPDATE public.email_verifications SET consumed_at = NOW() WHERE email = $1`,
      [email],
    );
    return { verified: true as const, emailToken: this.issueToken(email) };
  }

  // ── 인증표 (HMAC) ──────────────────────────────────────────────
  // 형식: <이메일 base64url>.<만료 epoch초>.<서명>
  //
  // **표가 "어느 이메일을 확인했는지" 스스로 말한다.** 검증할 때 이메일을
  // 따로 받아야 한다면, 로그인 세션에 이메일이 없는 경우(AUTH_MODE=dev 의
  // 스텁은 id 만 준다) 맞춰 볼 것이 없어 가입을 마칠 수 없다.
  private issueToken(email: string): string {
    const exp = Math.floor(Date.now() / 1000) + TOKEN_TTL_MIN * 60;
    const b = Buffer.from(email, 'utf8').toString('base64url');
    return `${b}.${exp}.${this.sign(email, exp)}`;
  }

  private sign(email: string, exp: number): string {
    return createHmac('sha256', this.tokenKey).update(`${email}|${exp}`).digest('hex');
  }

  /**
   * 표를 풀어 **확인된 이메일**을 돌려준다 (서명·만료가 맞을 때만).
   * 맞지 않으면 null — 호출부가 거절 문구를 정한다.
   */
  private readToken(token: string): string | null {
    const parts = String(token || '').split('.');
    if (parts.length !== 3) return null;
    const [b, expRaw, sig] = parts;
    const exp = Number(expRaw);
    if (!Number.isFinite(exp) || !sig) return null;
    if (exp * 1000 < Date.now()) return null;
    let email: string;
    try {
      email = Buffer.from(b, 'base64url').toString('utf8');
    } catch { return null; }
    if (!email) return null;
    const want = Buffer.from(this.sign(email, exp), 'utf8');
    const got = Buffer.from(sig, 'utf8');
    if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
    return email;
  }

  /** 지금 로그인한 사람의 프로필 — 가입을 끝냈는지(성명 유무) 판단에도 쓴다 */
  async getProfile(userId: string) {
    const { rows } = await this.db.query<{
      full_name: string | null; phone_country: string | null;
      phone_number: string | null; plan: string;
      email_verified_at: Date | null; phone_verified_at: Date | null;
    }>(
      `SELECT full_name, phone_country, phone_number, plan,
              email_verified_at, phone_verified_at
         FROM public.users WHERE id = $1`,
      [userId],
    );
    const r = rows[0];
    return {
      fullName: r?.full_name ?? null,
      phoneCountry: r?.phone_country ?? null,
      phoneNumber: r?.phone_number ?? null,
      plan: r?.plan ?? 'free',
      emailVerifiedAt: r?.email_verified_at ?? null,
      // 휴대폰 인증은 나중 — 지금은 항상 null 이다
      phoneVerifiedAt: r?.phone_verified_at ?? null,
      /** 가입 정보를 다 채웠는가 (성명이 기준) */
      complete: !!r?.full_name,
    };
  }

  /**
   * ③ 프로필 저장. **인증표가 있어야** 이메일 인증 시각이 찍힌다 —
   * 표가 없거나 남의 것이면 거절한다(성명만 바꾸는 수정에는 표가 필요 없다).
   */
  async saveProfile(
    userId: string,
    userEmail: string,
    dto: {
      fullName: string; phoneCountry?: string; phoneNumber?: string;
      emailToken?: string;
    },
  ) {
    const fullName = String(dto.fullName || '').trim().slice(0, 100);
    if (fullName.length < 1) throw new BadRequestException('성명을 입력해 주세요.');

    // 국가번호 '+82' · 번호는 숫자만 — 나라마다 자릿수가 달라 형식은 최소로
    const country = dto.phoneCountry
      ? '+' + String(dto.phoneCountry).replace(/\D/g, '').slice(0, 5)
      : null;
    const phone = dto.phoneNumber
      ? String(dto.phoneNumber).replace(/\D/g, '').slice(0, 20)
      : null;
    if (phone && !country) throw new BadRequestException('국가번호를 골라 주세요.');
    if (phone && phone.length < 6) {
      throw new BadRequestException('휴대폰 번호를 다시 확인해 주세요.');
    }

    // 표가 있으면 "어느 이메일을 확인했는지"를 표에서 읽는다.
    // 세션이 이메일을 알고 있으면(AUTH_MODE=supabase) **같은지 확인**하고,
    // 모르면(dev 스텁) 표의 이메일을 그대로 믿는다 — 표는 우리 서명이다.
    let verified = false;
    if (dto.emailToken) {
      const tokenEmail = this.readToken(dto.emailToken);
      if (!tokenEmail) {
        throw new BadRequestException('이메일 인증이 만료되었습니다. 다시 인증해 주세요.');
      }
      const sessionEmail = userEmail ? String(userEmail).trim().toLowerCase() : '';
      if (sessionEmail && sessionEmail !== tokenEmail) {
        throw new BadRequestException('인증한 이메일과 로그인한 계정이 다릅니다.');
      }
      verified = true;
    }

    const res = await this.db.query(
      `UPDATE public.users
          SET full_name = $2,
              phone_country = $3,
              phone_number = $4,
              email_verified_at = CASE WHEN $5 THEN COALESCE(email_verified_at, NOW())
                                       ELSE email_verified_at END,
              updated_at = NOW()
        WHERE id = $1`,
      [userId, fullName, country, phone, verified],
    );
    // 없는 사용자에 조용히 성공하지 않는다 — 저장된 줄 알고 넘어가면
    // 다음 화면에서 "성명이 비어 있다"로 나타나 원인을 찾기 어렵다.
    if (res.rowCount === 0) {
      throw new BadRequestException('계정을 찾을 수 없습니다. 다시 로그인해 주세요.');
    }
    return this.getProfile(userId);
  }

  // ── 회원탈퇴 (2026-08-11) ──────────────────────────────────────
  //
  // **정말로 지운다.** users 행을 지우면 ON DELETE CASCADE 로 맵·폴더·
  // 태그·워크스페이스·첨부 메타가 함께 사라지고, 첨부 파일은 저장소
  // 접두사(u/<id>, tmp/<id>)를 통째로 지운다.
  //
  // 지우기 전에 손봐야 하는 곳이 있다 — users(id) 를 참조하면서
  // **CASCADE 가 아닌** 컬럼들이다. 그대로 두면 외래키가 삭제를 막는다.
  //   · map_revisions.created_by / map_document_versions.created_by → NULL
  //     (남의 맵에 남긴 버전은 맵의 것이지 사람의 것이 아니다 — 맵까지
  //      지우면 그 맵 주인의 히스토리가 사라진다)
  //   · exports.user_id → NULL   (기록만 남긴다)
  //   · ai_jobs.user_id  → NOT NULL 이라 행을 지운다

  /** 탈퇴 화면에 "무엇이 사라지는지" 숫자로 보여 주기 위한 조회 */
  async deletePreview(userId: string) {
    const { rows } = await this.db.query<{
      maps: string; attachments: string; file_bytes: string; doc_bytes: string;
    }>(
      `SELECT
         (SELECT COUNT(*)::text FROM public.maps WHERE owner_id = $1)          AS maps,
         (SELECT COUNT(*)::text FROM public.attachments WHERE owner_id = $1)   AS attachments,
         (SELECT COALESCE(SUM(size_bytes), 0)::text FROM public.attachments
           WHERE owner_id = $1)                                                AS file_bytes,
         (SELECT COALESCE(SUM(pg_column_size(d.doc)), 0)::text
            FROM public.map_documents d
            JOIN public.maps m ON m.id = d.map_id
           WHERE m.owner_id = $1)                                              AS doc_bytes`,
      [userId],
    );
    const r = rows[0];
    const fileBytes = Number(r?.file_bytes ?? 0);
    const docBytes = Number(r?.doc_bytes ?? 0);
    return {
      maps: Number(r?.maps ?? 0),
      attachments: Number(r?.attachments ?? 0),
      fileBytes,
      docBytes,
      usedBytes: fileBytes + docBytes,
      /** 화면이 그대로 비교해 쓸 수 있게 서버가 문구를 내려 준다 */
      confirmPhrase: DELETE_CONFIRM_PHRASE,
    };
  }

  /**
   * 회원탈퇴 — 확인 문구가 정확히 맞을 때만 지운다.
   *
   * 되돌릴 수 없다. 그래서 **지운 것을 숫자로 돌려준다** — 화면이
   * "맵 12개·첨부 3개를 삭제했습니다"라고 말할 수 있어야, 사용자가
   * 자기 계정이 정말 지워졌는지 확인할 수 있다.
   */
  async deleteAccount(userId: string, confirmRaw: string) {
    const confirm = String(confirmRaw || '').trim();
    if (confirm !== DELETE_CONFIRM_PHRASE) {
      throw new BadRequestException(
        `확인을 위해 '${DELETE_CONFIRM_PHRASE}' 를 정확히 입력해 주세요.`,
      );
    }

    const before = await this.deletePreview(userId);
    const hasTomb = await hasDeletedAccountsTable(this.db);

    await this.db.transaction(async (c) => {
      await c.query(
        `UPDATE public.map_revisions SET created_by = NULL WHERE created_by = $1`,
        [userId],
      );
      await c.query(
        `UPDATE public.map_document_versions SET created_by = NULL WHERE created_by = $1`,
        [userId],
      );
      await c.query(`UPDATE public.exports SET user_id = NULL WHERE user_id = $1`, [userId]);
      await c.query(`DELETE FROM public.ai_jobs WHERE user_id = $1`, [userId]);
      // 편집 잠금은 외래키가 없어 삭제를 막지는 않지만, 남겨 두면 남의
      // 공유 맵이 최대 60초 동안 "다른 사람이 편집 중"으로 잠긴다.
      await c.query(`DELETE FROM public.map_edit_locks WHERE user_id = $1`, [userId]);
      await c.query(`DELETE FROM public.workspace_members WHERE user_id = $1`, [userId]);

      // 여기서 CASCADE 가 돈다 — 맵·폴더·태그·워크스페이스·첨부 메타
      await c.query(`DELETE FROM public.users WHERE id = $1`, [userId]);

      if (hasTomb) {
        await c.query(
          `INSERT INTO public.deleted_accounts (user_id) VALUES ($1)
           ON CONFLICT (user_id) DO NOTHING`,
          [userId],
        );
      }
    });

    // ── 여기서부터는 실패해도 탈퇴를 되돌리지 않는다 ──────────────
    // 계정은 이미 지워졌다. 남는 것은 **주인 없는 찌꺼기**뿐이라,
    // 여기서 예외를 던지면 "탈퇴가 실패했다"는 잘못된 인상을 준다.

    // 로그인 계정 자체 — 이게 지워져야 **같은 이메일로 다시 가입**할 수
    // 있다. 두 자리를 모두 손봐야 한다 (2026-08-11 dev 서버에서 확인):
    //   ⓐ GoTrue 의 계정 — 별도 DB(`gotrue`)에 산다. 관리자 API 로 지운다.
    //   ⓑ 앱 DB 의 `auth.users` — 우리 외래키가 걸린 자리. 로컬/CI 에서는
    //      shim 이고, 운영 Supabase 에서는 ⓐ와 같은 표다.
    const authRemoved = await this.removeLoginAccount(userId);

    // 첨부 파일 원본 — 접두사를 통째로 지운다(업로드 중이던 조각 포함)
    for (const prefix of [`u/${userId}`, `tmp/${userId}`]) {
      try {
        await this.storage.deletePrefix(prefix);
      } catch (err) {
        this.log.warn(`첨부 파일 삭제 실패 (${prefix}): ${String((err as Error).message)}`);
      }
    }

    if (!hasTomb) {
      this.log.warn(
        'deleted_accounts 표가 없어 묘비를 남기지 못했다 — 델타 SQL 을 적용하기 전까지, '
        + '만료 전 토큰으로 들어오면 빈 계정이 되살아날 수 있다.',
      );
    }
    // 방금 세운 묘비를 이 프로세스가 곧바로 보게 한다 —
    // 캐시가 '표 없음'/'아는 사용자'로 남아 있으면 다음 요청이 그대로
    // 통과해 버린다.
    resetDeletedAccountsCache();
    forgetKnownUser(userId);

    this.log.log(
      `회원탈퇴 완료 (id=${userId}) — 맵 ${before.maps}개 · 첨부 ${before.attachments}개`,
    );
    return {
      deleted: true as const,
      maps: before.maps,
      attachments: before.attachments,
      usedBytes: before.usedBytes,
      /**
       * **로그인 계정까지 지웠는가.** false 면 자료는 지워졌지만 같은
       * 이메일로 **재가입이 막힌다** — 운영자가 알아야 한다.
       * (예전 이름 `authRemoved` 는 앱 DB 의 껍데기만 보고 true 를 내서
       *  오해를 줬다 — 2026-08-11.)
       */
      loginAccountRemoved: authRemoved,
    };
  }

  // ── 비밀번호 재설정 (2026-08-13 사용자 요청) ──────────────────
  //
  // 로그인하지 못하는 사람이 쓰는 길이라 **액세스 토큰이 없다.** 그래서
  // 마지막 단계는 서버가 GoTrue **관리자 API** 로 비밀번호를 바꾼다
  // (회원탈퇴가 계정을 지울 때 쓰는 것과 같은 길).
  //
  //   ① start   이메일 → 인증번호 메일
  //   ② verify  인증번호 → **재설정표**(인증표와 같은 형식, 30분)
  //   ③ confirm 재설정표 + 새 비밀번호 → GoTrue 에서 교체
  //
  // **계정이 있는지 알려 주지 않는다.** ①의 응답이 계정 유무에 따라
  // 달라지면, 아무나 이메일 목록을 훑어 "가입된 주소"를 알아낼 수 있다.

  /** ① 재설정 인증번호 — 없는 계정에도 **같은 모양**으로 답한다 */
  async resetStart(emailRaw: string, devMode: boolean) {
    const email = this.norm(emailRaw);
    const { rows } = await this.db.query(
      `SELECT 1 FROM auth.users WHERE lower(email) = lower($1)`, [email],
    );
    if (rows.length === 0) {
      this.log.log(`비밀번호 재설정 요청 — 없는 계정(${email}), 메일을 보내지 않는다`);
      // 계정이 없어도 **보낸 것처럼** 답한다(계정 열거 방지).
      return { sent: true as const, expiresInMin: CODE_TTL_MIN };
    }
    return this.sendEmailCode(email, devMode, 'passwordReset');
  }

  /** ② 인증번호 확인 → 재설정표 */
  async resetVerify(emailRaw: string, code: string) {
    const r = await this.verifyEmailCode(emailRaw, code);
    return { verified: true as const, resetToken: r.emailToken };
  }

  /**
   * ③ 새 비밀번호로 교체. **GoTrue 가 비밀번호의 주인**이므로 우리 DB 는
   * 손대지 않는다.
   */
  async resetConfirm(resetToken: string, password: string) {
    const email = this.readToken(resetToken);
    if (!email) {
      throw new BadRequestException('인증이 만료되었습니다. 처음부터 다시 해 주세요.');
    }
    if (String(password || '').length < 6) {
      throw new BadRequestException('비밀번호는 6자 이상이어야 합니다.');
    }
    if (!this.goTrueUrl) {
      // 고칠 수 없는 곳을 고치라고 안내하지 않는다 — 서버 설정 문제다.
      this.log.error('GOTRUE_URL 이 없어 비밀번호를 바꿀 수 없다.');
      throw new BadRequestException(
        '비밀번호 재설정이 아직 설정되지 않았습니다. 관리자에게 문의해 주세요.',
      );
    }

    const { rows } = await this.db.query<{ id: string }>(
      `SELECT id::text FROM auth.users WHERE lower(email) = lower($1)`, [email],
    );
    if (rows.length === 0) throw new BadRequestException('계정을 찾을 수 없습니다.');

    // ★ **표를 먼저 회수한다 — 한 번만 쓰이게.**
    // 재설정표는 우리 서명만으로 검증되므로(DB 를 보지 않는다) 그대로 두면
    // 30분 동안 **몇 번이든 다시 쓸 수 있다**. 인증번호 줄을 지우는 것으로
    // "이 표는 이미 썼다"를 남긴다.
    //
    // GoTrue 호출 **전에** 지운다: 나중에 지우면 두 요청이 동시에 들어올 때
    // 둘 다 통과한다. 호출이 실패하면 사용자는 처음부터 다시 해야 하는데,
    // 그게 "몰래 두 번 바뀌는 것"보다 낫다.
    const claim = await this.db.query(
      `DELETE FROM public.email_verifications WHERE email = $1`, [email],
    );
    if ((claim.rowCount ?? 0) === 0) {
      throw new BadRequestException('이미 사용한 인증입니다. 처음부터 다시 해 주세요.');
    }

    const token = jwtSign(
      { role: 'service_role', aud: 'authenticated', sub: rows[0].id },
      this.tokenKey, { algorithm: 'HS256', expiresIn: '2m' },
    );
    let res: Response;
    try {
      res = await fetch(`${this.goTrueUrl}/admin/users/${rows[0].id}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`, apikey: token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch (err) {
      this.log.error(`GoTrue 호출 실패: ${String((err as Error).message)}`);
      throw new BadRequestException('비밀번호를 바꾸지 못했습니다. 잠시 후 다시 시도해 주세요.');
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      this.log.error(`GoTrue 비밀번호 변경 실패 (HTTP ${res.status}) ${body.slice(0, 200)}`);
      throw new BadRequestException('비밀번호를 바꾸지 못했습니다. 잠시 후 다시 시도해 주세요.');
    }

    this.log.log(`비밀번호 재설정 완료: ${email}`);
    return { changed: true as const, email };
  }

  /**
   * 로그인 계정 삭제 — GoTrue 와 앱 DB **양쪽**을 지운다.
   *
   * dev 서버는 GoTrue 가 **별도 DB(`gotrue`)** 에 살고, 앱 DB 의
   * `auth.users` 는 외래키를 성립시키기 위한 **껍데기(shim)** 다.
   * 앱 DB 만 지우면 자료는 사라지지만 **로그인 정보가 남아 같은
   * 이메일로 재가입이 막힌다** (2026-08-11 dev 서버에서 확인 — 그전에는
   * 껍데기를 지우고 "지웠다"고 답했다).
   *
   * 관리자 토큰은 **우리가 직접 만든다.** GoTrue 의 JWT 비밀키를 이미
   * 갖고 있으므로(`SUPABASE_JWT_SECRET`), 서비스 키를 따로 보관할
   * 필요가 없다 — 보관하지 않는 비밀이 가장 안전하다.
   *
   * @returns 로그인 계정이 실제로 사라졌는가
   */
  private async removeLoginAccount(userId: string): Promise<boolean> {
    let goTrueOk: boolean | null = null; // null = 주소가 없어 시도하지 않음

    if (this.goTrueUrl) {
      try {
        const token = jwtSign(
          { role: 'service_role', aud: 'authenticated', sub: userId },
          this.tokenKey,
          { algorithm: 'HS256', expiresIn: '2m' },
        );
        const res = await fetch(`${this.goTrueUrl}/admin/users/${userId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}`, apikey: token },
          signal: AbortSignal.timeout(10_000),
        });
        // 404 = 이미 없다 — 우리가 원하는 결과와 같다
        goTrueOk = res.ok || res.status === 404;
        if (!goTrueOk) {
          this.log.warn(
            `GoTrue 계정 삭제 실패 (id=${userId}, HTTP ${res.status}) — `
            + '같은 이메일로 재가입이 막힌다. GOTRUE_URL 과 SUPABASE_JWT_SECRET 를 확인한다.',
          );
        }
      } catch (err) {
        goTrueOk = false;
        this.log.warn(
          `GoTrue 계정 삭제 호출 실패 (id=${userId}): ${String((err as Error).message)}`,
        );
      }
    } else {
      this.log.warn(
        'GOTRUE_URL 이 없어 로그인 계정을 지우지 못했다 — 자료는 지워졌지만 '
        + '같은 이메일로 재가입이 막힌다. 인증을 쓰는 배포에서는 반드시 설정한다.',
      );
    }

    // 앱 DB 쪽. 운영 Supabase 처럼 같은 표면 위의 삭제는 이미 끝나 0행이
    // 지워지는데, 그것을 "실패"로 보면 안 된다 — 오류만 실패로 센다.
    let dbOk = true;
    try {
      await this.db.query(`DELETE FROM auth.users WHERE id = $1`, [userId]);
    } catch (err) {
      dbOk = false;
      this.log.warn(
        `auth.users 삭제 실패 (id=${userId}): ${String((err as Error).message)}`,
      );
    }

    if (goTrueOk !== null) return goTrueOk && dbOk;
    // 주소가 없어 부르지 못했다. 답이 갈린다.
    //   · 인증을 쓰는 배포(supabase) — 로그인 계정은 **GoTrue 안**에 있고
    //     방금 지운 것은 껍데기일 수 있다. 지웠다고 답하면 안 된다.
    //     ("지운 것 같다"를 "지웠다"로 답하면 재가입이 막힌 뒤에야 안다.)
    //   · 인증이 없는 배포(dev, 로컬/CI) — 앱 DB 의 auth.users 가 곧 계정이다.
    return this.authExternal ? false : dbOk;
  }
}
