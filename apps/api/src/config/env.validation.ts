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
  // 첨부 저장소 (B9) — local 드라이버가 파일을 저장할 디렉터리.
  // dev 서버는 NAS 의 NFS 마운트를 컨테이너 볼륨으로 물려 지정한다.
  STORAGE_LOCAL_DIR: string;
  // 첨부 1개의 최대 크기 (MB)
  ATTACHMENT_MAX_MB: number;
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

  // 첨부 1개 상한 (MB). 2026-08-06 사용자 요청으로 20 → 200 으로 올렸다.
  // **1GB 는 아직 못 올린다** — 업로드가 multer 메모리 버퍼(`file.buffer`)
  // 라 큰 파일이 그대로 힙에 올라간다. 1GB 를 허용하려면 diskStorage 로
  // 바꿔 스트리밍해야 한다(별도 작업). 계정 무료 쿼터가 1GB 라 실질
  // 상한은 어차피 쿼터가 먼저 걸린다.
  const ATTACHMENT_MAX_MB = Number(raw.ATTACHMENT_MAX_MB ?? 200);
  if (!Number.isFinite(ATTACHMENT_MAX_MB) || ATTACHMENT_MAX_MB <= 0) {
    errors.push('ATTACHMENT_MAX_MB 는 양수여야 합니다.');
  }

  return {
    PORT,
    CORS_ORIGIN: String(raw.CORS_ORIGIN ?? 'http://localhost:5173'),
    DATABASE_URL,
    AUTH_MODE: AUTH_MODE as 'dev' | 'supabase',
    DEV_USER_ID,
    SUPABASE_JWT_SECRET,
    STORAGE_LOCAL_DIR: String(raw.STORAGE_LOCAL_DIR ?? './data/attachments'),
    ATTACHMENT_MAX_MB,
  };
}
