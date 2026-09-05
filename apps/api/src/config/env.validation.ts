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
  /**
   * vault 미러가 쓸 폴더 (docs/04-extensions/vault-mirror.md).
   * **비어 있으면 꺼진다** — 클라우드 배포에는 사용자의 디스크가 없다(§2).
   * 반드시 **빈 폴더**를 준다: 남의 파일이 있는 폴더는 거절한다(§7).
   */
  VAULT_DIR: string;
  // 첨부 1개의 최대 크기 (MB) — **단일 요청 업로드** 경로
  ATTACHMENT_MAX_MB: number;
  // 청크 업로드 조각 크기 (KB). 서버가 정하고 클라이언트는 따른다.
  // 테스트에서 작은 파일로 여러 조각을 만들려고 낮춘다 (§12.9)
  ATTACHMENT_PART_KB: number;
  // 청크 업로드로 올릴 수 있는 파일 1개의 최대 크기 (MB)
  ATTACHMENT_CHUNK_MAX_MB: number;
  // ── 레이트 리밋 (2026-08-08) ────────────────────────────────────
  // "한 사람이 정해진 시간 안에 부를 수 있는 최대 횟수".
  // 자세한 설명은 docs/05-implementation/rate-limit.md
  RATE_LIMIT_WINDOW_MS: number;
  RATE_LIMIT_MAX: number;
  // 0 이면 레이트 리밋을 끈다 (부하 테스트 등 특수한 경우에만)
  RATE_LIMIT_ENABLED: boolean;
  /**
   * **우리 앞에 프록시가 몇 단계 있는가** (2026-08-09).
   * 이 값이 맞아야 `req.ip` 가 진짜 접속자 IP 가 된다 — 히스토리의
   * 접속 IP 와 레이트 리밋의 바구니가 모두 여기에 달려 있다.
   *   · `'loopback, linklocal, uniquelocal'` (기본) = **사설망 주소는
   *     전부 우리 프록시로 보고 벗겨 낸다**. 단계 수를 몰라도 맞는다.
   *   · 숫자(`'2'`) = 딱 그만큼만 벗긴다.
   *   · `'false'` = 프록시 없음(접속 소켓 주소를 그대로 쓴다).
   * 자세한 설명은 docs/05-implementation/rate-limit.md §프록시.
   */
  TRUST_PROXY: string;

  // ── 메일 발송 (2026-08-09 — 가입 이메일 인증) ────────────────────
  // 비어 있으면 발송 기능이 꺼진다. 앱은 죽지 않고, 인증번호 요청이
  // "메일 발송이 아직 설정되지 않았습니다"로 안내된다.
  //   개발/초기 : Google Workspace SMTP (smtp.gmail.com:587 + 앱 비밀번호)
  //   나중에     : SES·Resend·Postmark 로 호스트/계정만 교체
  SMTP_HOST: string;
  SMTP_PORT: number;
  SMTP_USER: string;
  SMTP_PASS: string;
  /** 보내는 사람 표기 — 비우면 'EasyMindMap <SMTP_USER>' */
  SMTP_FROM: string;

  /**
   * **GoTrue 주소** — 회원탈퇴가 로그인 계정까지 지우기 위해 쓴다
   * (2026-08-11). 컨테이너끼리 부르므로 **내부 주소**가 맞다
   * (예: `http://auth-dev:9999`). 관리자 토큰은 SUPABASE_JWT_SECRET 로
   * 직접 서명하므로 서비스 키를 따로 두지 않는다.
   *
   * 비우면 앱 DB 의 `auth.users` 만 지운다 — dev 서버처럼 GoTrue 가
   * **별도 DB** 를 쓰는 배포에서는 그 자리가 껍데기라, **자료는
   * 지워지지만 같은 이메일로 재가입이 막힌다.**
   * 인증을 쓰는 배포(AUTH_MODE=supabase)에서는 반드시 채운다.
   */
  GOTRUE_URL: string;

  /**
   * **관리자 콘솔에 들어갈 수 있는 이메일** (2026-08-13). 쉼표로 여럿.
   * DB 컬럼이 아닌 이유: 컬럼이면 DB 를 건드릴 수 있는 사람이 스스로를
   * 관리자로 올릴 수 있다. 환경변수는 배포 권한이 있어야 바꾼다.
   * 비어 있으면 아무도 못 들어간다(기동 로그에 경고).
   */
  ADMIN_EMAILS: string;

  /**
   * **GoTrue 의 데이터베이스** — 로그인 이력(감사 로그)을 읽는다
   * (2026-08-13). dev 서버는 GoTrue 가 별도 DB(`gotrue`)를 쓴다.
   *   예: `postgres://postgres:<pw>@<host>:5432/gotrue`
   *
   * 비우면 **이력 기능만** 꺼진다 — 앱은 죽지 않고 화면이 그 사실을
   * 밝힌다. **읽기만 한다**(쓰기는 GoTrue 의 몫).
   */
  GOTRUE_DATABASE_URL: string;

  /**
   * **AI API 키 보관 비밀** (2026-09-04). 사용자가 프로필에 등록한 AI 회사
   * API 키(Anthropic·OpenAI·Gemini)를 DB 에 **암호화해서** 넣을 때 쓰는
   * 키다(AES-256-GCM, `account/ai-key-crypto.ts`). 16자 이상.
   *
   * 비우면 **보관 기능만 꺼진다** — 앱은 죽지 않고, 키는 예전처럼
   * 브라우저(localStorage)에만 남으며 화면이 그 사실을 밝힌다.
   * ⚠️ 한 번 정하면 바꾸지 말 것 — 바꾸면 이미 저장된 키를 못 푼다
   * (사용자가 다시 등록해야 한다).
   */
  AI_KEY_SECRET: string;
  // ── 버전 정리 워커 (2026-09-06, 13a §2 · src/versions/) ─────────────
  // 끄면 아무것도 지우지 않는다. 델타(pinned·version_days 칸)가 없어도 안 돈다.
  VERSION_PRUNE_ENABLED: boolean;
  // 저장 뒤 얼마 있다가 그 맵을 정리하나 (ms). 사진 GC 보다 뒤여야 한다.
  VERSION_PRUNE_DEBOUNCE_MS: number;
  // 전체 훑기 주기 (시간). 0 = 훑지 않는다(저장 뒤 정리만).
  VERSION_PRUNE_SWEEP_HOURS: number;
  // 보관 기간이 지난 뒤 실제로 지우기까지 유예 (일) — 13a §3.2 ③
  VERSION_PRUNE_GRACE_DAYS: number;
  // 이 시각(ISO) 이전 버전은 건드리지 않는다 — 13a §6 소급 금지. 비우면 전부.
  VERSION_PRUNE_SINCE: string;
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

  // **단일 요청** 업로드 상한 (MB). 이 경로는 multer 메모리 버퍼
  // (`file.buffer`)라 파일 전체가 힙에 올라간다 — 그래서 여기는 올리지
  // 않는다. 더 큰 파일은 **청크 업로드**(§12)가 받는다.
  const ATTACHMENT_MAX_MB = Number(raw.ATTACHMENT_MAX_MB ?? 200);
  if (!Number.isFinite(ATTACHMENT_MAX_MB) || ATTACHMENT_MAX_MB <= 0) {
    errors.push('ATTACHMENT_MAX_MB 는 양수여야 합니다.');
  }

  // 조각 크기는 **서버가 정한다** — 리버스 프록시 본문 제한과 맞물리므로
  // 클라이언트가 고르게 두면 서버가 통제할 수 없다 (§12.4 ①).
  const ATTACHMENT_PART_KB = Number(raw.ATTACHMENT_PART_KB ?? 8 * 1024);
  if (!Number.isFinite(ATTACHMENT_PART_KB) || ATTACHMENT_PART_KB < 1) {
    errors.push('ATTACHMENT_PART_KB 는 1 이상이어야 합니다.');
  }

  // 청크 경로의 파일 1개 상한 (MB). 조각 저장이 스트림이라 서버 메모리와
  // 무관하다 — 실질 상한은 계정 쿼터(요금제가 정한다)가 먼저 건다.
  const ATTACHMENT_CHUNK_MAX_MB = Number(raw.ATTACHMENT_CHUNK_MAX_MB ?? 1024);
  if (!Number.isFinite(ATTACHMENT_CHUNK_MAX_MB) || ATTACHMENT_CHUNK_MAX_MB <= 0) {
    errors.push('ATTACHMENT_CHUNK_MAX_MB 는 양수여야 합니다.');
  }

  // ── 레이트 리밋 ─────────────────────────────────────────────────
  // 기본값은 **정상 사용의 수십 배**로 잡는다. 우리 앱은 자동저장이
  // 5분 주기라 평상시 요청이 매우 적다 — 좁게 잡아 봐야 정상 사용자만
  // 막히고, 남용은 어차피 이 정도 선에서 걸린다.
  // (근거와 계산은 docs/05-implementation/rate-limit.md §5)
  const RATE_LIMIT_WINDOW_MS = Number(raw.RATE_LIMIT_WINDOW_MS ?? 60_000);
  if (!Number.isFinite(RATE_LIMIT_WINDOW_MS) || RATE_LIMIT_WINDOW_MS < 1000) {
    errors.push('RATE_LIMIT_WINDOW_MS 는 1000 이상이어야 합니다.');
  }
  const RATE_LIMIT_MAX = Number(raw.RATE_LIMIT_MAX ?? 600);
  if (!Number.isInteger(RATE_LIMIT_MAX) || RATE_LIMIT_MAX < 1) {
    errors.push('RATE_LIMIT_MAX 는 1 이상의 정수여야 합니다.');
  }
  // 'false'/'0' 만 끔으로 본다 — 오타로 조용히 꺼지지 않게 기본은 켬
  const rlRaw = String(raw.RATE_LIMIT_ENABLED ?? 'true').toLowerCase();
  const RATE_LIMIT_ENABLED = !(rlRaw === 'false' || rlRaw === '0');

  // 프록시 신뢰 설정 — 기본은 "사설망은 전부 우리 프록시"다.
  // 예전 기본값(1단계)은 nginx→Traefik→컨테이너처럼 **두 단계**인
  // 배포에서 진짜 접속자 대신 **프록시의 내부 IP**(192.168.x.x)를
  // 집어 왔다 (2026-08-09 사용자 보고: 히스토리 IP 가 전부 dev 서버
  // 내부 주소). 단계 수를 사람이 세어 맞추는 방식은 프록시를 하나
  // 더 끼우는 순간 조용히 틀리므로 기본을 바꿨다.
  const TRUST_PROXY = String(raw.TRUST_PROXY ?? 'loopback, linklocal, uniquelocal').trim();

  // 메일 — 넷 중 하나라도 비면 발송 기능이 꺼진다(오류가 아니다).
  const SMTP_PORT = Number(raw.SMTP_PORT ?? 587);
  if (!Number.isInteger(SMTP_PORT) || SMTP_PORT <= 0) {
    errors.push('SMTP_PORT 는 양의 정수여야 합니다.');
  }

  const AI_KEY_SECRET = String(raw.AI_KEY_SECRET ?? '').trim();
  if (AI_KEY_SECRET && AI_KEY_SECRET.length < 16) {
    errors.push('AI_KEY_SECRET 은 16자 이상이어야 합니다 (비우면 AI 키 보관이 꺼집니다).');
  }

  const VERSION_PRUNE_ENABLED = String(raw.VERSION_PRUNE_ENABLED ?? 'true') !== 'false';
  const VERSION_PRUNE_DEBOUNCE_MS = Number(raw.VERSION_PRUNE_DEBOUNCE_MS ?? 60_000);
  const VERSION_PRUNE_SWEEP_HOURS = Number(raw.VERSION_PRUNE_SWEEP_HOURS ?? 24);
  const VERSION_PRUNE_GRACE_DAYS = Number(raw.VERSION_PRUNE_GRACE_DAYS ?? 7);
  const VERSION_PRUNE_SINCE = String(raw.VERSION_PRUNE_SINCE ?? '2026-09-04T00:00:00Z').trim();
  if (!Number.isFinite(VERSION_PRUNE_DEBOUNCE_MS) || VERSION_PRUNE_DEBOUNCE_MS < 0) {
    errors.push('VERSION_PRUNE_DEBOUNCE_MS 는 0 이상이어야 합니다.');
  }
  if (!Number.isFinite(VERSION_PRUNE_SWEEP_HOURS) || VERSION_PRUNE_SWEEP_HOURS < 0) {
    errors.push('VERSION_PRUNE_SWEEP_HOURS 는 0 이상이어야 합니다 (0 = 훑지 않음).');
  }
  if (!Number.isFinite(VERSION_PRUNE_GRACE_DAYS) || VERSION_PRUNE_GRACE_DAYS < 0) {
    errors.push('VERSION_PRUNE_GRACE_DAYS 는 0 이상이어야 합니다.');
  }
  if (VERSION_PRUNE_SINCE && Number.isNaN(Date.parse(VERSION_PRUNE_SINCE))) {
    errors.push('VERSION_PRUNE_SINCE 는 ISO 날짜여야 합니다 (예: 2026-09-04T00:00:00Z).');
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
    STORAGE_LOCAL_DIR: String(raw.STORAGE_LOCAL_DIR ?? './data/attachments'),
    VAULT_DIR: String(raw.VAULT_DIR ?? '').trim(),
    ATTACHMENT_MAX_MB,
    ATTACHMENT_PART_KB,
    ATTACHMENT_CHUNK_MAX_MB,
    RATE_LIMIT_WINDOW_MS,
    RATE_LIMIT_MAX,
    RATE_LIMIT_ENABLED,
    TRUST_PROXY,
    SMTP_HOST: String(raw.SMTP_HOST ?? ''),
    SMTP_PORT,
    SMTP_USER: String(raw.SMTP_USER ?? ''),
    SMTP_PASS: String(raw.SMTP_PASS ?? ''),
    SMTP_FROM: String(raw.SMTP_FROM ?? ''),
    GOTRUE_URL: String(raw.GOTRUE_URL ?? ''),
    ADMIN_EMAILS: String(raw.ADMIN_EMAILS ?? ''),
    GOTRUE_DATABASE_URL: String(raw.GOTRUE_DATABASE_URL ?? ''),
    AI_KEY_SECRET,
    VERSION_PRUNE_ENABLED,
    VERSION_PRUNE_DEBOUNCE_MS,
    VERSION_PRUNE_SWEEP_HOURS,
    VERSION_PRUNE_GRACE_DAYS,
    VERSION_PRUNE_SINCE,
  };
}
