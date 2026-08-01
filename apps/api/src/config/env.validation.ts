/**
 * 환경변수 검증 — 서버 부팅 시 필수 값이 없거나 형식이 틀리면
 * 즉시 명확한 에러로 죽는다(운영 중 조용한 오작동 방지).
 */
export interface AppEnv {
  PORT: number;
  CORS_ORIGIN: string;
  DATABASE_URL: string;
  AUTH_MODE: 'dev' | 'supabase';
  DEV_USER_ID: string;
  // AUTH_MODE=supabase 필수 — GoTrue(JWT) 서명 검증 비밀키
  // (Supabase 스택의 JWT_SECRET 과 동일 값, HS256)
  SUPABASE_JWT_SECRET: string;
}

export function validateEnv(raw: Record<string, unknown>): AppEnv {
  const errors: string[] = [];

  const PORT = Number(raw.PORT ?? 3000);
  if (!Number.isInteger(PORT) || PORT <= 0) errors.push('PORT 는 양의 정수여야 합니다.');

  const DATABASE_URL = String(raw.DATABASE_URL ?? '');
  if (!DATABASE_URL) errors.push('DATABASE_URL 는 필수입니다. (.env 참고)');

  const AUTH_MODE = String(raw.AUTH_MODE ?? 'dev');
  if (AUTH_MODE !== 'dev' && AUTH_MODE !== 'supabase') {
    errors.push("AUTH_MODE 는 'dev' 또는 'supabase' 여야 합니다.");
  }

  const DEV_USER_ID = String(raw.DEV_USER_ID ?? '00000000-0000-0000-0000-000000000001');

  const SUPABASE_JWT_SECRET = String(raw.SUPABASE_JWT_SECRET ?? '');
  if (AUTH_MODE === 'supabase' && SUPABASE_JWT_SECRET.length < 16) {
    errors.push(
      'AUTH_MODE=supabase 에는 SUPABASE_JWT_SECRET(16자 이상, Supabase JWT_SECRET 과 동일)이 필수입니다.',
    );
  }

  if (errors.length) {
    throw new Error('환경변수 오류:\n - ' + errors.join('\n - '));
  }

  return {
    PORT,
    CORS_ORIGIN: String(raw.CORS_ORIGIN ?? 'http://localhost:5173'),
    DATABASE_URL,
    AUTH_MODE: AUTH_MODE as 'dev' | 'supabase',
    DEV_USER_ID,
    SUPABASE_JWT_SECRET,
  };
}
