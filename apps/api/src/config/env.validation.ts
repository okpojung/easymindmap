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

  if (errors.length) {
    throw new Error('환경변수 오류:\n - ' + errors.join('\n - '));
  }

  return {
    PORT,
    CORS_ORIGIN: String(raw.CORS_ORIGIN ?? 'http://localhost:5173'),
    DATABASE_URL,
    AUTH_MODE: AUTH_MODE as 'dev' | 'supabase',
    DEV_USER_ID,
  };
}
