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
import { DatabaseService } from '../database/database.service';
import { MailService } from '../mail/mail.service';
import type { AppEnv } from '../config/env.validation';

/** 인증번호 규칙 — 한 곳에 모아 둔다 (문서 auth-session-ui.md §11 과 같은 값) */
const CODE_DIGITS = 6;
const CODE_TTL_MIN = 10; // 유효 시간
const MAX_ATTEMPTS = 5; // 틀릴 수 있는 횟수
const RESEND_WAIT_SEC = 60; // 재발송 최소 간격
const MAX_SENDS_PER_HOUR = 5; // 같은 이메일로 시간당 발송 상한
const TOKEN_TTL_MIN = 30; // 인증표 유효 시간

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

  constructor(
    private readonly db: DatabaseService,
    private readonly mail: MailService,
    config: ConfigService<AppEnv, true>,
  ) {
    this.tokenKey =
      String(config.get('SUPABASE_JWT_SECRET', { infer: true }) || '')
      || randomBytes(32).toString('hex');
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
  async sendEmailCode(emailRaw: string, devMode: boolean) {
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
      await this.mail.sendSignupCode(email, code, CODE_TTL_MIN);
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
}
