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

import {
  BadRequestException, ConflictException, Injectable, Logger, ServiceUnavailableException,
} from '@nestjs/common';
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
import { tableReady } from '../common/table-ready';
import { hasMapMembersTable } from '../maps/map-access';
import type { CollabMapSummary, DeleteBlockedBody } from './dto/account.dto';
import { aiKeyHint, decryptAiKey, encryptAiKey } from './ai-key-crypto';
import type { AppEnv } from '../config/env.validation';

// AI 보관 표 — 둘 다 2026-09-04 에 들어온 표라, 델타 SQL 을 아직 적용하지
// 않은 서버에는 없다. 이름을 여기 한 번만 적어 두 자리(조회·저장)가
// 어긋나지 않게 한다.
const AI_KEYS_TABLE = 'public.user_ai_keys';
const AI_SETTINGS_TABLE = 'public.user_ai_settings';

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
  /** AI API 키 암호화 비밀 — 비어 있으면 키 보관이 꺼진다 (2026-09-04) */
  private readonly aiKeySecret: string;

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
    this.aiKeySecret = String(config.get('AI_KEY_SECRET', { infer: true }) || '').trim();
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

  // ── AI API 키 보관 (2026-09-04) ─────────────────────────────
  // 키는 브라우저에만 있었다 → PC·브라우저·주소가 바뀔 때마다 다시 등록해야
  // 했다. 계정에 **암호화해서** 붙인다(ai-key-crypto.ts). 로그인한 본인에게만
  // 복호화해 돌려주고, 목록에는 끝자리(hint)를 함께 준다.
  //
  // **꺼지는 두 가지** — 둘 다 앱을 세우지 않고 `enabled:false` 로 말한다.
  //   secret : AI_KEY_SECRET 미설정 (서버 설정)
  //   schema : user_ai_keys 표가 아직 없다 (델타 SQL 미적용)
  //
  // ★ 표가 있는지는 **`tableReady` 로 직접 묻는다** (2026-09-04 수정).
  //   처음에는 쿼리를 try 로 감싸고 `err.code === '42P01'` 을 봤는데,
  //   `DatabaseService.query` 가 그 코드를 **이미 503 예외로 바꿔서**
  //   올려 주기 때문에(database.service.ts `translate`) 그 분기는 한 번도
  //   실행되지 않았다. 그래서 델타를 적용하지 않은 서버에서 화면이
  //   "서버 스키마가 아직 적용되지 않아" 대신 "서버가 응답하지 않아" 로
  //   **틀린 진단**을 내놓았다. 오류 코드로 짐작하지 않고 묻는다.

  /** 내 키 전부 — `enabled` 가 false 면 `reason` 이 왜인지 말한다 */
  async getAiKeys(userId: string): Promise<{
    enabled: boolean;
    reason?: 'secret' | 'schema';
    keys: Record<string, { key: string; hint: string; updatedAt: Date }>;
  }> {
    if (!this.aiKeySecret) return { enabled: false, reason: 'secret', keys: {} };
    if (!(await tableReady(this.db, AI_KEYS_TABLE))) {
      return { enabled: false, reason: 'schema', keys: {} };
    }
    const { rows } = await this.db.query<{
      provider: string; key_enc: string; key_hint: string; updated_at: Date;
    }>(
      `SELECT provider, key_enc, key_hint, updated_at
         FROM public.user_ai_keys WHERE user_id = $1`,
      [userId],
    );
    const keys: Record<string, { key: string; hint: string; updatedAt: Date }> = {};
    for (const r of rows) {
      const plain = decryptAiKey(r.key_enc, this.aiKeySecret);
      // 비밀이 바뀌어 못 푸는 행은 **없는 것으로** 준다 — 화면이 "다시
      // 등록하세요" 로 이어진다. 예외로 전체를 세우면 다른 회사 키까지 잃는다.
      if (plain === null) {
        this.log.warn(`AI 키를 풀지 못했다 (user=${userId}, provider=${r.provider}) — AI_KEY_SECRET 이 바뀌었나?`);
        continue;
      }
      keys[r.provider] = { key: plain, hint: r.key_hint, updatedAt: r.updated_at };
    }
    return { enabled: true, keys };
  }

  /**
   * AI 설정(우선순위·모델·프롬프트 템플릿) — 비밀이 아니라 AI_KEY_SECRET 과
   * 무관하게 늘 된다. 표가 없으면(델타 미적용) available:false 를 주고 앱은 산다.
   */
  async getAiSettings(userId: string): Promise<{
    available: boolean; settings: Record<string, unknown> | null; updatedAt: Date | null;
  }> {
    if (!(await tableReady(this.db, AI_SETTINGS_TABLE))) {
      return { available: false, settings: null, updatedAt: null };
    }
    const { rows } = await this.db.query<{ settings: Record<string, unknown>; updated_at: Date }>(
      `SELECT settings, updated_at FROM public.user_ai_settings WHERE user_id = $1`,
      [userId],
    );
    return {
      available: true,
      settings: rows[0]?.settings ?? null,
      updatedAt: rows[0]?.updated_at ?? null,
    };
  }

  async saveAiSettings(userId: string, settings: Record<string, unknown>) {
    // 모델 이름은 짧은 문자열만 — JSON 에 아무거나 실리지 않게
    const models = settings.models && typeof settings.models === 'object'
      ? Object.fromEntries(Object.entries(settings.models as Record<string, unknown>)
          .filter(([k, v]) => typeof v === 'string' && (v as string).length <= 200 && k.length <= 20)
          .map(([k, v]) => [k, v as string]))
      : undefined;
    const clean: Record<string, unknown> = {
      ...(Array.isArray(settings.priority) ? { priority: settings.priority } : {}),
      ...(models ? { models } : {}),
      ...(typeof settings.systemPrompt === 'string' ? { systemPrompt: settings.systemPrompt } : {}),
    };
    if (!(await tableReady(this.db, AI_SETTINGS_TABLE))) {
      throw new ServiceUnavailableException(
        'AI 설정 보관 표(user_ai_settings)가 아직 없습니다 — 서버 스키마(델타 SQL)를 적용해 주세요.',
      );
    }
    await this.db.query(
      `INSERT INTO public.user_ai_settings (user_id, settings)
       VALUES ($1, $2::jsonb)
       ON CONFLICT (user_id) DO UPDATE SET settings = EXCLUDED.settings, updated_at = NOW()`,
      [userId, JSON.stringify(clean)],
    );
    return { saved: true as const };
  }

  /** 키 등록(빈 문자열 = 삭제). 보관이 꺼져 있으면 503 — 프런트가 이유를 보여 준다 */
  async saveAiKey(userId: string, provider: string, keyRaw: string) {
    if (!this.aiKeySecret) {
      throw new ServiceUnavailableException(
        '서버에 AI 키 보관 비밀(AI_KEY_SECRET)이 설정되지 않아 계정에 저장할 수 없습니다 — 키는 이 브라우저에만 남습니다.',
      );
    }
    if (!(await tableReady(this.db, AI_KEYS_TABLE))) {
      throw new ServiceUnavailableException(
        'AI 키 보관 표(user_ai_keys)가 아직 없습니다 — 서버 스키마(델타 SQL)를 적용해 주세요.',
      );
    }
    const key = String(keyRaw ?? '').trim();
    if (!key) {
      await this.db.query(
        `DELETE FROM public.user_ai_keys WHERE user_id = $1 AND provider = $2`,
        [userId, provider],
      );
      return { provider, saved: false as const };
    }
    const hint = aiKeyHint(key);
    await this.db.query(
      `INSERT INTO public.user_ai_keys (user_id, provider, key_enc, key_hint)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, provider)
       DO UPDATE SET key_enc = EXCLUDED.key_enc, key_hint = EXCLUDED.key_hint,
                     updated_at = NOW()`,
      [userId, provider, encryptAiKey(key, this.aiKeySecret), hint],
    );
    return { provider, saved: true as const, hint };
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

  // ── 회원탈퇴 (2026-08-11 · 2026-09-04 스키마 정비 A) ─────────────
  //
  // **정말로 지운다.** 다만 `maps.owner_id` 가 이제 ON DELETE RESTRICT 라
  // (docs/90-architecture/schema-overhaul-plan.md §2) users 행을 지우기
  // 전에 **앱이 맵을 직접 정리**한다. 순서가 곧 규칙이다 — 계획서 §2.3.
  //
  //   ① 내가 개설자인 **활성 협업맵**이 있으면 막는다 — 409 + 맵 목록 +
  //      참여자 수. 남의 작업이 걸려 있다. "협업맵" 은 kind='collab' **또는
  //      map_members 행이 있는** 활성 맵이다 — PATCH 로 kind 를 solo 로
  //      되돌려도 참여자는 남고 map-access 는 kind 를 보지 않으므로,
  //      kind 만 믿으면 편집 중인 참여자의 문서를 지운다(Codex 리뷰 P1).
  //   ② 나머지 내 맵(단독맵 · 휴지통에 있는 맵)을 지운다 — 맵의
  //      CASCADE 로 문서·버전·노드·참가자·잠금·게시가 따라 사라진다.
  //   ③ 남의 맵의 map_members 에서 나를 뺀다 — 참여는 막을 이유가 없다.
  //   ④ DELETE FROM users — 폴더·태그·워크스페이스·첨부 메타가 CASCADE.
  //
  // 되돌려 깨뜨리면(계획서 §2.4): ②를 빼면 **모든 사용자가 탈퇴 불가**
  // (RESTRICT 가 막는다), ①을 빼면 협업맵이 참여자 작업과 함께 사라진다
  // (CASCADE 시절의 사고). ①은 DB 가 아니라 앱이 답하는 층이고, RESTRICT 는
  // 앱이 틀렸을 때의 마지막 방벽이다 — 그래서 ④가 외래키에 막히면 500 이
  // 아니라 409 로 바꿔 올린다.
  //
  // 휴지통의 협업맵은 막지 않는다 — 참여자는 이미 열 수 없고(map-access 가
  // deleted_at 을 본다), 개설자가 이미 지우기로 한 맵이다. 막으면 영구
  // 삭제 API 가 없는 지금 그 사용자는 탈퇴할 길이 없다.
  //
  // 지우기 전에 손봐야 하는 곳 — users(id) 를 참조하면서 CASCADE 도
  // SET NULL 도 아닌 컬럼들 (그대로 두면 외래키가 삭제를 막는다):
  //   · map_revisions.created_by / map_document_versions.created_by → NULL
  //     (남의 맵에 남긴 버전은 맵의 것이지 사람의 것이 아니다)
  //   · exports.user_id → NULL   (기록만 남긴다)
  //   · ai_jobs.user_id  → NOT NULL 이라 행을 지운다
  //   (map_document_versions.pinned_by · map_members.invited_by 는 SET NULL,
  //    map_ownership_transfers 는 CASCADE — 손대지 않는다)

  /**
   * 내가 개설자인 **활성 협업맵** — 탈퇴를 막는 것들. 참여자 수를 함께 준다.
   * kind='collab' 이거나 **참여자가 한 명이라도 있으면** 협업맵이다.
   *
   * `map_members` 델타를 아직 적용하지 않은 서버에서는 참여자 수를
   * **모른다(null)** — 그래도 kind 가 협업이면 막는다. 판정에 실패했다고
   * 열어 주면 장애가 곧 데이터 손실이 된다 (map-access.ts 와 같은 방향).
   */
  private async findOwnedCollabMaps(
    run: <T extends { [k: string]: unknown }>(sql: string, params: unknown[]) => Promise<{ rows: T[] }>,
    userId: string,
  ): Promise<{ maps: CollabMapSummary[]; memberTotal: number | null }> {
    const withMembers = await hasMapMembersTable(this.db);
    type Row = { id: string; title: string; updated_at: Date; member_count: number | null };
    const { rows } = await run<Row>(
      withMembers
        ? `SELECT m.id, m.title, m.updated_at,
                  (SELECT COUNT(*)::int FROM public.map_members mm
                    WHERE mm.map_id = m.id) AS member_count
             FROM public.maps m
            WHERE m.owner_id = $1 AND m.deleted_at IS NULL
              AND (m.kind = 'collab'
                   OR EXISTS (SELECT 1 FROM public.map_members mm WHERE mm.map_id = m.id))
            ORDER BY m.updated_at DESC`
        : `SELECT m.id, m.title, m.updated_at, NULL::int AS member_count
             FROM public.maps m
            WHERE m.owner_id = $1 AND m.kind = 'collab' AND m.deleted_at IS NULL
            ORDER BY m.updated_at DESC`,
      [userId],
    );
    const maps: CollabMapSummary[] = rows.map((r) => ({
      mapId: r.id,
      title: r.title,
      memberCount: r.member_count,
      updatedAt: r.updated_at,
    }));
    let memberTotal: number | null = null;
    if (maps.length > 0 && withMembers) {
      // 같은 사람이 여러 맵에 있으면 한 번만 센다 — "참여자 5명" 은 사람 수다
      const { rows: t } = await run<{ n: number }>(
        `SELECT COUNT(DISTINCT mm.user_id)::int AS n
           FROM public.map_members mm
           JOIN public.maps m ON m.id = mm.map_id
          WHERE m.owner_id = $1 AND m.deleted_at IS NULL`,
        [userId],
      );
      memberTotal = t[0]?.n ?? 0;
    }
    return { maps, memberTotal };
  }

  /** 막을 때 돌려주는 본문 — 화면이 `message` 만 보여 줘도 목록이 보인다 */
  private blockedBody(maps: CollabMapSummary[], memberTotal: number | null): DeleteBlockedBody {
    const who = memberTotal === null
      ? '참여자의 작업도 함께 사라집니다'
      : `참여자 ${memberTotal}명의 작업도 함께 사라집니다`;
    const lines = maps.map((m) =>
      ` · ${m.title} (참여자 ${m.memberCount === null ? '수 알 수 없음' : m.memberCount + '명'})`);
    const message =
      `함께 쓰는 맵 ${maps.length}개의 개설자입니다. 탈퇴하면 ${who}. `
      + '먼저 그 맵을 삭제해 주세요(소유권 넘기기는 준비 중입니다).\n'
      + lines.join('\n');
    return { code: 'OWNS_COLLAB_MAPS', message, collabMaps: maps, memberTotal };
  }

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
    // 탈퇴가 막힐지는 **미리** 알려 준다 — 확인 문구까지 입력한 뒤에
    // 막히면 헛수고다.
    const blocked = await this.findOwnedCollabMaps(
      (sql, params) => this.db.query(sql, params), userId,
    );
    return {
      maps: Number(r?.maps ?? 0),
      attachments: Number(r?.attachments ?? 0),
      fileBytes,
      docBytes,
      usedBytes: fileBytes + docBytes,
      /** 화면이 그대로 비교해 쓸 수 있게 서버가 문구를 내려 준다 */
      confirmPhrase: DELETE_CONFIRM_PHRASE,
      /** 내가 개설자인 활성 협업맵 — 비어 있지 않으면 탈퇴가 409 로 막힌다 */
      collabMaps: blocked.maps,
      /** 그 맵들의 참여자 수(사람 수). 참가자 표가 없는 서버면 null */
      memberTotal: blocked.memberTotal,
      blocked: blocked.maps.length > 0,
    };
  }

  /**
   * 회원탈퇴 — 확인 문구가 정확히 맞을 때만 지운다.
   *
   * 되돌릴 수 없다. 그래서 **지운 것을 숫자로 돌려준다** — 화면이
   * "맵 12개·첨부 3개를 삭제했습니다"라고 말할 수 있어야, 사용자가
   * 자기 계정이 정말 지워졌는지 확인할 수 있다.
   *
   * 협업맵 개설자면 **409** 와 함께 맵 목록·참여자 수를 돌려준다
   * (`DeleteBlockedBody`). 500 이 아니라 안내다 — 계획서 §2.4.
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
    const hasMembers = await hasMapMembersTable(this.db);

    // 지울 파일 — **내 첨부 행**의 키만 (2026-09-05, 29-invite-and-ownership-transfer.md §3.4 B).
    // 예전에는 `u/<id>` 접두사를 통째로 지웠다. 소유권 이전이 첨부의 주인을
    // 새 주인으로 바꾸되 키는 그대로 두므로(유료 모듈은 파일을 옮길 손이
    // 없다), 그 접두사 아래에 **남의 맵 것이 된 파일**이 남아 있을 수 있다.
    // 접두사로 지우면 이전받은 맵의 그림이 옛 주인 탈퇴와 함께 사라진다.
    // 행은 아래 트랜잭션에서 CASCADE 로 지워지므로 키는 **그 전에** 읽는다.
    let fileKeys: string[] = [];
    try {
      const { rows } = await this.db.query<{ storage_key: string }>(
        `SELECT storage_key FROM public.attachments WHERE owner_id = $1`, [userId],
      );
      fileKeys = rows.map((r) => r.storage_key);
    } catch (err) {
      this.log.warn(`첨부 키 조회 실패 — 파일이 남을 수 있다: ${String((err as Error).message)}`);
    }

    try {
      await this.db.transaction(async (c) => {
        // ① 협업맵 개설자면 여기서 멈춘다 — 트랜잭션 안에서 다시 본다
        //    (미리보기와 탈퇴 사이에 협업맵을 만들었을 수 있다)
        const blocked = await this.findOwnedCollabMaps(
          (sql, params) => c.query(sql, params), userId,
        );
        if (blocked.maps.length > 0) {
          throw new ConflictException(this.blockedBody(blocked.maps, blocked.memberTotal));
        }

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

        // ② 내 맵을 **앱이 명시적으로** 지운다 — RESTRICT 가 users 삭제를
        //    막기 전에. **활성 협업맵(kind 또는 참여자 있음)은 여기서도
        //    지우지 않는다** — ①이 어떤 이유로 빠져도 그 맵은 남아 ④가
        //    RESTRICT 에 걸린다(409). `owner_id = $1` 만으로 지우면 ①이 빠진
        //    날 협업맵을 앱이 손수 지우는 셈이라 DB 층이 방벽 구실을 못 한다
        //    (검증에서 확인). 판정은 ①과 같은 문장이어야 한다 — 두 곳이
        //    어긋나면 ①이 통과시킨 맵이 ②에 남아 모두가 탈퇴 불가가 된다.
        await c.query(
          hasMembers
            ? `DELETE FROM public.maps
                WHERE owner_id = $1
                  AND (deleted_at IS NOT NULL
                       OR (kind <> 'collab' AND NOT EXISTS (
                             SELECT 1 FROM public.map_members mm WHERE mm.map_id = maps.id)))`
            : `DELETE FROM public.maps
                WHERE owner_id = $1 AND (deleted_at IS NOT NULL OR kind <> 'collab')`,
          [userId],
        );

        // ③ 남의 맵에 참여자로 있던 자리 — 표가 있는 서버에서만
        if (hasMembers) {
          await c.query(`DELETE FROM public.map_members WHERE user_id = $1`, [userId]);
        }

        // ④ 여기서 CASCADE 가 돈다 — 폴더·태그·워크스페이스·첨부 메타
        await c.query(`DELETE FROM public.users WHERE id = $1`, [userId]);

        if (hasTomb) {
          await c.query(
            `INSERT INTO public.deleted_accounts (user_id) VALUES ($1)
             ON CONFLICT (user_id) DO NOTHING`,
            [userId],
          );
        }
      });
    } catch (err) {
      // 마지막 방벽(RESTRICT)에 걸렸다 — 앱 검사가 놓친 맵이 남아 있다.
      // 500 으로 두면 사용자는 "탈퇴가 고장났다" 고만 안다.
      if ((err as { code?: string } | null)?.code === '23503') {
        this.log.error(`회원탈퇴가 외래키에 막혔다 (id=${userId}): ${String((err as Error).message)}`);
        throw new ConflictException({
          code: 'MAPS_REMAIN',
          message: '아직 남아 있는 맵이 있어 탈퇴할 수 없습니다. 맵을 정리한 뒤 다시 시도해 주세요.',
        });
      }
      throw err;
    }

    // ── 여기서부터는 실패해도 탈퇴를 되돌리지 않는다 ──────────────
    // 계정은 이미 지워졌다. 남는 것은 **주인 없는 찌꺼기**뿐이라,
    // 여기서 예외를 던지면 "탈퇴가 실패했다"는 잘못된 인상을 준다.

    // 로그인 계정 자체 — 이게 지워져야 **같은 이메일로 다시 가입**할 수
    // 있다. 두 자리를 모두 손봐야 한다 (2026-08-11 dev 서버에서 확인):
    //   ⓐ GoTrue 의 계정 — 별도 DB(`gotrue`)에 산다. 관리자 API 로 지운다.
    //   ⓑ 앱 DB 의 `auth.users` — 우리 외래키가 걸린 자리. 로컬/CI 에서는
    //      shim 이고, 운영 Supabase 에서는 ⓐ와 같은 표다.
    const authRemoved = await this.removeLoginAccount(userId);

    // 첨부 파일 원본 — **내 행의 키만** 하나씩 지운다(위 fileKeys). 접두사
    // `u/<id>` 는 통째로 지우지 않는다 — 소유권이 넘어간 맵의 파일이 그
    // 아래 남아 있을 수 있다. 업로드 중이던 조각(`tmp/<id>`)만 접두사째.
    let removed = 0;
    for (const key of fileKeys) {
      try {
        await this.storage.delete(key);
        removed += 1;
      } catch (err) {
        this.log.warn(`첨부 파일 삭제 실패 (${key}): ${String((err as Error).message)}`);
      }
    }
    try {
      await this.storage.deletePrefix(`tmp/${userId}`);
    } catch (err) {
      this.log.warn(`업로드 조각 삭제 실패 (tmp/${userId}): ${String((err as Error).message)}`);
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
      `회원탈퇴 완료 (id=${userId}) — 맵 ${before.maps}개 · 첨부 ${before.attachments}개 `
      + `· 파일 ${removed}/${fileKeys.length}개 삭제`,
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
