// 설정값 조사 — "개발하면서 정한 값들이 어디에 무엇이 있나" (2026-08-13 요청).
//
// **값을 여기 베껴 적지 않는다.** 베껴 적으면 원본이 바뀔 때 조용히
// 어긋나고, 관리 화면이 거짓말을 하게 된다. 그래서 세 갈래로 나눈다.
//
//   · env : 지금 이 서버가 **실제로 들고 있는 값**을 ConfigService 에서 읽는다
//   · db  : DB 가 정하는 값(요금제 용량)을 **DB 에 물어서** 가져온다
//   · code: 코드에 박힌 값 — 실제 상수를 **import 해서** 넣는다
//
// 프런트엔드 상수는 서버가 알 수 없다(브라우저 번들 안에 있다). 그쪽은
// 관리 화면이 자기 상수를 직접 import 해서 같은 모양으로 합친다 —
// `pages/admin/settingsCatalog.ts`.

import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../database/database.service';
import type { AppEnv } from '../config/env.validation';

export interface SettingItem {
  key: string;
  label: string;
  value: string | number;
  unit?: string;
  /** 어디가 이 값의 주인인가 */
  source: 'env' | 'db' | 'code';
  /** 바꾸려면 어디를 손대나 */
  where: string;
  note?: string;
  /** 콘솔에서 바로 고칠 수 있는가 (2026-08-14 — DB 값만 연다).
   *
   *  **서버가 정한다.** 화면이 `source === 'db'` 로 짐작하면, 나중에 못
   *  고치는 DB 값이 생겼을 때 입력칸이 먼저 생기고 저장에서 터진다. */
  editable?: {
    kind: 'planQuotaMb' | 'planPriceKrw';
    plan: string; min: number; max: number;
  };
}

export interface SettingGroup {
  id: string;
  title: string;
  /** 이 묶음을 왜 신경 쓰나 — 화면에 한 줄로 보여 준다 */
  why: string;
  items: SettingItem[];
}

const MB = 1024 * 1024;

/** 요금제 한도로 넣을 수 있는 범위 (2026-08-14).
 *
 *  아래를 막는 이유: **0 이나 음수는 아무도 저장하지 못하게 만든다.**
 *  위를 막는 이유: 오타로 자릿수를 하나 더 치면(1 TB → 10 TB) 디스크가
 *  차기 전까지 아무도 모른다. 1 MB ~ 1 TB 면 실제 요금제는 다 담는다. */
export const PLAN_QUOTA_MIN_MB = 1;
export const PLAN_QUOTA_MAX_MB = 1024 * 1024; // 1 TB
/** 구독 요금 하한 — **PG 최소 결제 금액**이다. 그 아래로 두면 저장은 되는데 결제창에서 거절된다 */
export const PLAN_PRICE_MIN_KRW = 1000;
export const PLAN_PRICE_MAX_KRW = 10_000_000;

export async function collectServerSettings(
  config: ConfigService<AppEnv, true>,
  db: DatabaseService,
): Promise<SettingGroup[]> {
  const g = <K extends keyof AppEnv>(k: K) => config.get(k, { infer: true });

  // 요금제 용량은 **DB 표 plan_quotas 가 유일한 기준**이다
  // (attachment-storage.md §8). 여기서 숫자를 적으면 두 곳이 되어 어긋난다.
  let planRows: { plan: string; bytes: string }[] = [];
  // 표가 아직 없는 DB(델타 SQL 적용 전)에서는 **편집을 열지 않는다.**
  // 입력칸부터 생기고 저장에서 터지면, 관리자는 자기가 뭘 잘못했는지 모른다.
  let planEditable = false;
  // 구독 요금은 **따로 읽는다** (2026-08-18). 같은 쿼리에 넣었더니, 컬럼이
  // 아직 없는 서버(델타 미적용)에서 쿼리 전체가 실패해 **쿼터 편집까지
  // 사라졌다.** 새로 더한 것 때문에 이미 되던 것이 사라지면 안 된다.
  const priceByPlan = new Map<string, number>();
  let priceEditable = false;
  try {
    const r = await db.query<{ plan: string; bytes: string }>(
      `SELECT p AS plan, public.plan_quota_bytes(p)::text AS bytes
         FROM unnest(ARRAY['free','basic','pro','team']) AS p`,
    );
    planRows = r.rows;
    const t = await db.query<{ ok: boolean }>(
      `SELECT to_regclass('public.plan_quotas') IS NOT NULL AS ok`,
    );
    planEditable = t.rows[0]?.ok === true;
  } catch {
    planRows = []; // 함수조차 없는 DB — 화면이 "조회 실패"로 보여 준다
  }

  // 구독 요금 — **컬럼이 없어도 위(용량)는 그대로 보이게** 따로 감싼다
  try {
    const r = await db.query<{ plan: string; price_krw: number }>(
      `SELECT plan, price_krw FROM public.plan_quotas`,
    );
    for (const row of r.rows) priceByPlan.set(row.plan, Number(row.price_krw));
    priceEditable = true;
  } catch {
    priceEditable = false; // 델타 SQL 을 아직 안 적용한 서버
  }

  return [
    {
      id: 'plan',
      title: '요금제 · 저장 용량 · 구독 요금',
      why: '한 계정이 쓸 수 있는 총량. users.plan 이 정하고 트리거가 quota_bytes 를 맞춘다.',
      items: planRows.length
        ? planRows.flatMap((r) => [{
          key: `plan.${r.plan}`,
          label: `${r.plan} 한도`,
          value: Math.round(Number(r.bytes) / MB),
          unit: 'MB',
          source: 'db' as const,
          where: planEditable
            ? '이 화면에서 바꾼다 (DB 표 public.plan_quotas)'
            // 화면은 이 문자열을 그대로 찍는다 — 마크다운 강조를 쓰지 않는다
            : 'DB 표 public.plan_quotas 가 아직 없다',
          note: planEditable
            ? '여기 한 곳만 고치면 전부 따라온다'
            : '델타 SQL 을 적용하면 이 화면에서 바꿀 수 있다 — dev-server-runbook.md §1.5-0-E',
          ...(planEditable
            ? {
              editable: {
                kind: 'planQuotaMb' as const,
                plan: r.plan,
                min: PLAN_QUOTA_MIN_MB,
                max: PLAN_QUOTA_MAX_MB,
              },
            }
            : {}),
        },
        // 구독 요금 — 결제가 **청구액을 여기서 읽는다**(화면이 보낸 금액을
        // 쓰지 않는다). 0 은 "결제하지 않는 요금제"다.
        {
          key: `plan.${r.plan}.price`,
          label: `${r.plan} 구독 요금`,
          value: priceEditable ? (priceByPlan.get(r.plan) ?? 0) : '조회 실패',
          unit: '원/월',
          source: 'db' as const,
          where: priceEditable
            ? '이 화면에서 바꾼다 (DB 표 public.plan_quotas.price_krw)'
            : 'DB 표에 price_krw 칸이 아직 없다',
          note: priceEditable
            ? '결제가 이 값을 청구한다 — 0 은 결제하지 않는 요금제'
            : '델타 SQL 을 적용하면 이 화면에서 바꿀 수 있다',
          ...(priceEditable
            ? {
              editable: {
                kind: 'planPriceKrw' as const,
                plan: r.plan,
                min: 0,
                max: PLAN_PRICE_MAX_KRW,
              },
            }
            : {}),
        }])
        : [{
          key: 'plan.unknown', label: '요금제 한도', value: '조회 실패',
          source: 'db' as const, where: 'DB 표 public.plan_quotas',
          note: '표나 함수가 없는 DB 다 — dev-server-runbook.md §1.5-0-B 를 적용한다',
        }],
    },
    {
      id: 'attachment',
      title: '첨부 파일',
      why: '한 번에 올릴 수 있는 크기. 계정 한도(위)와는 별개로 요청 하나의 상한이다.',
      items: [
        {
          key: 'ATTACHMENT_MAX_MB', label: '단일 요청 업로드 상한',
          value: g('ATTACHMENT_MAX_MB'), unit: 'MB', source: 'env',
          where: 'api 환경변수 ATTACHMENT_MAX_MB',
          note: '이 경로는 파일 전체가 메모리에 올라간다 — 올리지 않는다',
        },
        {
          key: 'ATTACHMENT_CHUNK_MAX_MB', label: '청크 업로드 파일 상한',
          value: g('ATTACHMENT_CHUNK_MAX_MB'), unit: 'MB', source: 'env',
          where: 'api 환경변수 ATTACHMENT_CHUNK_MAX_MB',
          note: '조각을 스트림으로 흘려 저장하므로 서버 메모리와 무관하다',
        },
        {
          key: 'ATTACHMENT_PART_KB', label: '조각 크기',
          value: g('ATTACHMENT_PART_KB'), unit: 'KB', source: 'env',
          where: 'api 환경변수 ATTACHMENT_PART_KB',
          note: '서버가 정하고 클라이언트가 따른다 — 프록시 본문 제한과 맞물린다',
        },
        {
          key: 'STORAGE_LOCAL_DIR', label: '첨부 저장 위치',
          value: String(g('STORAGE_LOCAL_DIR')), source: 'env',
          where: 'api 환경변수 STORAGE_LOCAL_DIR',
        },
      ],
    },
    {
      id: 'ratelimit',
      title: '레이트 리밋',
      why: '한 사람이 정해진 시간 안에 부를 수 있는 최대 횟수. 평상시의 수십 배로 잡는다.',
      items: [
        {
          key: 'RATE_LIMIT_ENABLED', label: '사용',
          value: g('RATE_LIMIT_ENABLED') ? '켜짐' : '꺼짐', source: 'env',
          where: 'api 환경변수 RATE_LIMIT_ENABLED',
        },
        {
          key: 'RATE_LIMIT_WINDOW_MS', label: '창(window)',
          value: Math.round(Number(g('RATE_LIMIT_WINDOW_MS')) / 1000), unit: '초',
          source: 'env', where: 'api 환경변수 RATE_LIMIT_WINDOW_MS',
        },
        {
          key: 'RATE_LIMIT_MAX', label: '창 안 최대 호출',
          value: g('RATE_LIMIT_MAX'), unit: '회', source: 'env',
          where: 'api 환경변수 RATE_LIMIT_MAX',
        },
        {
          key: 'TRUST_PROXY', label: '프록시 신뢰 범위',
          value: String(g('TRUST_PROXY')), source: 'env',
          where: 'api 환경변수 TRUST_PROXY',
          note: '이 값이 맞아야 접속 IP 와 리밋 바구니가 사람 단위가 된다',
        },
      ],
    },
    {
      id: 'signup',
      title: '가입 이메일 인증',
      why: '인증번호 규칙. 남의 메일함을 두드리는 데 쓰이지 않게 막는 값들이다.',
      items: [
        { key: 'CODE_DIGITS', label: '인증번호 자릿수', value: 6, source: 'code', where: 'api account.service.ts' },
        { key: 'CODE_TTL_MIN', label: '유효 시간', value: 10, unit: '분', source: 'code', where: 'api account.service.ts' },
        { key: 'MAX_ATTEMPTS', label: '틀릴 수 있는 횟수', value: 5, unit: '회', source: 'code', where: 'api account.service.ts' },
        { key: 'RESEND_WAIT_SEC', label: '재발송 최소 간격', value: 60, unit: '초', source: 'code', where: 'api account.service.ts' },
        { key: 'MAX_SENDS_PER_HOUR', label: '시간당 발송 상한', value: 5, unit: '회', source: 'code', where: 'api account.service.ts' },
        { key: 'TOKEN_TTL_MIN', label: '인증표 유효 시간', value: 30, unit: '분', source: 'code', where: 'api account.service.ts' },
      ],
    },
    {
      id: 'session',
      title: '세션 · 잠금',
      why: '같은 맵을 두 곳에서 편집해 덮어쓰는 사고를 막는 값들.',
      items: [
        {
          key: 'EDIT_LOCK_TTL_MS', label: '편집 잠금 TTL', value: 60, unit: '초',
          source: 'code', where: 'api maps.service.ts',
          note: '하트비트가 이 시간 넘게 끊기면 죽은 잠금으로 보고 다른 세션이 가져간다',
        },
        {
          key: 'ADMIN_TOKEN_TTL_MIN', label: '관리자 표 유효 시간', value: 8, unit: '시간',
          source: 'code', where: 'api admin.service.ts',
        },
        {
          key: 'CHUNK_SESSION_TTL', label: '청크 업로드 세션 유효', value: 24, unit: '시간',
          source: 'code', where: 'api chunk-upload.service.ts',
        },
      ],
    },
    {
      id: 'mail',
      title: '메일 발송',
      why: '인증번호가 나가는 통로. 비어 있으면 발송이 꺼지고 앱은 안내로 물러선다.',
      items: [
        { key: 'SMTP_HOST', label: '호스트', value: String(g('SMTP_HOST') || '(없음)'), source: 'env', where: 'api 환경변수 SMTP_HOST' },
        { key: 'SMTP_PORT', label: '포트', value: g('SMTP_PORT'), source: 'env', where: 'api 환경변수 SMTP_PORT' },
        { key: 'SMTP_USER', label: '로그인 계정', value: String(g('SMTP_USER') || '(없음)'), source: 'env', where: 'api 환경변수 SMTP_USER' },
        {
          key: 'SMTP_FROM', label: '보내는 사람', value: String(g('SMTP_FROM') || '(비어 있음 — 계정 주소로 나간다)'),
          source: 'env', where: 'api 환경변수 SMTP_FROM',
        },
        // 비밀번호는 값이 아니라 **있는지 여부만** 보여 준다
        { key: 'SMTP_PASS', label: '앱 비밀번호', value: g('SMTP_PASS') ? '설정됨' : '(없음)', source: 'env', where: 'api 환경변수 SMTP_PASS' },
      ],
    },
    {
      id: 'auth',
      title: '인증 · 관리자',
      why: '누가 로그인하고 누가 관리자인가.',
      items: [
        { key: 'AUTH_MODE', label: '인증 방식', value: String(g('AUTH_MODE')), source: 'env', where: 'api 환경변수 AUTH_MODE' },
        {
          key: 'GOTRUE_URL', label: 'GoTrue 주소',
          value: String(g('GOTRUE_URL') || '(없음 — 회원탈퇴가 로그인 계정을 못 지운다)'),
          source: 'env', where: 'api 환경변수 GOTRUE_URL',
        },
        {
          key: 'ADMIN_EMAILS', label: '관리자 이메일',
          value: String(g('ADMIN_EMAILS') || '(없음)'), source: 'env',
          where: 'api 환경변수 ADMIN_EMAILS',
          note: '여기서 지우면 그 사람의 관리자 표가 즉시 무효가 된다',
        },
        { key: 'CORS_ORIGIN', label: '허용 출처(CORS)', value: String(g('CORS_ORIGIN')), source: 'env', where: 'api 환경변수 CORS_ORIGIN' },
      ],
    },
  ];
}
