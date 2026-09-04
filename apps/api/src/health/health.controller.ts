import { Controller, Get, Req } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { clientIpOf } from '../common/client-info';

/**
 * 배포가 **실제로 반영됐는지** 헬스체크 한 번으로 알기 위한 값들
 * (2026-09-02 추가).
 *
 * 그전에는 `{status:ok, db:up, schema:ok}` 만 돌려줘서, 옛 코드가 그대로
 * 돌고 있어도 **똑같은 응답**이 나왔다. NestJS 11 이관(#347) 뒤 "서버에
 * 반영됐나"를 확인할 방법이 Coolify UI 나 서버 SSH 뿐이었다.
 *
 * 새로 노출되는 정보는 **공개 저장소의 커밋 SHA 와 오픈소스 라이브러리
 * 버전**뿐이다. 저장소가 public 이라 커밋 SHA 만 알면 `package-lock.json`
 * 에서 같은 값을 읽을 수 있으므로, 이것으로 새로 드러나는 것은 없다.
 * (자격증명·내부 주소·경로는 넣지 않는다.)
 */
function packageVersion(name: string): string | undefined {
  try {
    // 정적 import 대신 require 를 쓰는 이유: 없거나 exports 로 막힌
    // 패키지여도 **헬스체크가 죽지 않아야** 한다. 빌드는 번들 없는
    // CJS(tsc) 라 동적 require 가 그대로 남는다.
    return (require(`${name}/package.json`) as { version?: string }).version;
  } catch {
    return undefined;
  }
}

/**
 * 빌드된 커밋. 배포 플랫폼이 주는 값이라 **앱 설정이 아니다** — 없어도
 * 앱은 정상 동작해야 하므로 `env.validation` 의 필수 검증에 넣지 않고
 * 여기서 직접 읽고, 없으면 응답에서 **필드째 생략**한다.
 *
 * Coolify 는 `SOURCE_COMMIT` 을 주입한다. 다른 플랫폼·로컬 빌드도
 * 받아들이도록 흔한 이름을 순서대로 본다.
 */
const COMMIT_ENV_KEYS = [
  'SOURCE_COMMIT',
  'COOLIFY_SOURCE_COMMIT',
  'GIT_COMMIT_SHA',
  'GIT_SHA',
  'COMMIT_SHA',
] as const;

function buildCommit(): string | undefined {
  for (const key of COMMIT_ENV_KEYS) {
    const value = process.env[key]?.trim();
    // 40자 전체 SHA 도 12자로 줄인다 — 사람이 눈으로 대조하는 값이다
    if (value) return value.slice(0, 12);
  }
  return undefined;
}

// 프로세스가 사는 동안 바뀌지 않는다 — 요청마다 다시 읽지 않는다
const BUILD_COMMIT = buildCommit();
const RUNTIME = {
  node: process.versions.node,
  nestjs: packageVersion('@nestjs/core'),
  express: packageVersion('express'),
} as const;

/**
 * 이 API 가 동작하려면 반드시 있어야 하는 테이블.
 *
 * ⚠️ **schema.sql 에 새 테이블을 추가하면 여기에도 추가한다.**
 * 배포가 "코드는 자동(Coolify) · 스키마는 수동" 구조라 스키마 적용을
 * 빠뜨리기 쉽다(2026-08-02 B8 배포에서 제기된 위험). 헬스체크가 이를
 * 즉시 알려 주면, 사용자가 저장 500 을 겪기 전에 발견할 수 있다.
 */
const REQUIRED_TABLES = [
  'users',
  'maps',
  'map_folders', // 문서함(폴더)
  'map_documents',
  'map_document_versions', // B8 히스토리
  'attachments', // B9 첨부 저장소
  'map_edit_locks', // 단일 세션 편집 잠금 (2026-08-04)
  'nodes',
  'email_verifications', // 가입 이메일 인증번호 (2026-08-09)
  'deleted_accounts', // 회원탈퇴 묘비 (2026-08-11)
  'plan_quotas', // 요금제별 용량 — 관리자 콘솔에서 바꾼다 (2026-08-14)
  'login_events', // 로그인 접속 IP·기기 — GoTrue 가 남기지 않는다 (2026-08-14)
  // 맵 참가자 — 협업의 권한 판정 (2026-08-18). 없어도 앱은 돌지만
  // **소유자만** 맵을 열 수 있다(협업이 조용히 1인용이 된다). 조용한
  // 반쪽 동작은 여기서 드러내는 편이 낫다.
  'map_members',
  // AI API 키 보관 (2026-09-04). 없으면 키 보관만 꺼진다 — 화면이 밝힌다.
  'user_ai_keys',
  // AI 설정(우선순위·모델·프롬프트 템플릿) 계정 보관 (2026-09-04). 없으면
  // 설정만 브라우저에 남는다 — 화면이 밝힌다.
  'user_ai_settings',
  // MCP 커넥터 토큰 (2026-09-04). 없으면 AI 커넥터만 못 쓴다 — 토큰
  // 화면이 `ready:false` 로 이유를 밝히고, 다른 기능은 그대로 돈다.
  'api_tokens',
] as const;

/**
 * 기존 테이블에 **나중에 추가된 컬럼**. 테이블만 보면 "있다"고 나오지만
 * 컬럼이 없으면 저장이 실패하므로 여기서 함께 확인한다
 * (2026-08-02 문서함 도입에서 maps.folder_id/kind 추가).
 * `테이블.컬럼` 형식으로 적는다.
 */
const REQUIRED_COLUMNS = [
  'maps.folder_id',
  'maps.kind',
  'users.quota_bytes', // B9 저장 용량 쿼터
  'users.plan', // 요금제 — 쿼터의 단일 기준 (2026-08-06)
  'map_document_versions.node_count', // 히스토리 상세 정보 (2026-08-03)
  'map_document_versions.attach_count', // 히스토리 첨부 개수 (2026-08-03 2차)
  'map_documents.node_count', // 문서함 목록 상세 (2026-08-05)
  'map_documents.attach_bytes', // 문서함 목록 상세 (2026-08-05)
  'map_documents.search_text', // 문서함 내용 검색 (2026-08-08)
  'map_document_versions.client_ip', // 히스토리 접속 정보 (2026-08-09)
  'users.full_name', // 회원가입 — 성명·휴대폰 (2026-08-09)
  // 구독 요금 (2026-08-18) — 없으면 관리자 콘솔의 요금 편집이 열리지 않는다.
  // 여기 넣는 이유: 요금 저장이 실패할 때 서버가 "**/v1/health 의
  // missingColumns 를 보라**"고 안내하는데, 이 목록에 없으면 그 안내가
  // **아무것도 알려주지 않는 곳**을 가리킨다.
  'plan_quotas.price_krw',
] as const;

/**
 * GET /v1/health — 로드밸런서·배포 헬스체크용.
 * DB 연결 + **스키마 최신 여부**까지 확인해 실제 서비스 가능 상태인지 알려준다.
 */
@Controller('health')
export class HealthController {
  constructor(private readonly db: DatabaseService) {}

  @Get()
  async check(): Promise<{
    status: string;
    db: 'up' | 'down';
    schema: 'ok' | 'outdated' | 'unknown';
    missingTables?: string[];
    missingColumns?: string[];
    commit?: string;
    runtime: { node: string; nestjs?: string; express?: string };
    time: string;
  }> {
    const dbUp = await this.db.ping();
    let schema: 'ok' | 'outdated' | 'unknown' = 'unknown';
    let missingTables: string[] = [];
    let missingColumns: string[] = [];

    if (dbUp) {
      try {
        const [tables, columns] = await Promise.all([
          this.db.query<{ table_name: string }>(
            `SELECT table_name FROM information_schema.tables
              WHERE table_schema = 'public' AND table_name = ANY($1)`,
            [REQUIRED_TABLES as unknown as string[]],
          ),
          this.db.query<{ ref: string }>(
            `SELECT table_name || '.' || column_name AS ref
               FROM information_schema.columns
              WHERE table_schema = 'public'
                AND table_name || '.' || column_name = ANY($1)`,
            [REQUIRED_COLUMNS as unknown as string[]],
          ),
        ]);
        const presentTables = new Set(tables.rows.map((r) => r.table_name));
        const presentColumns = new Set(columns.rows.map((r) => r.ref));
        missingTables = REQUIRED_TABLES.filter((t) => !presentTables.has(t));
        missingColumns = REQUIRED_COLUMNS.filter((c) => !presentColumns.has(c));
        schema = missingTables.length === 0 && missingColumns.length === 0 ? 'ok' : 'outdated';
      } catch {
        schema = 'unknown';
      }
    }

    return {
      // 스키마가 낡았으면 degraded — 배포 직후 바로 눈에 띄도록
      status: dbUp && schema === 'ok' ? 'ok' : 'degraded',
      db: dbUp ? 'up' : 'down',
      schema,
      ...(missingTables.length ? { missingTables } : {}),
      ...(missingColumns.length ? { missingColumns } : {}),
      // 배포 플랫폼이 커밋을 알려 주지 않으면 필드째 생략한다
      ...(BUILD_COMMIT ? { commit: BUILD_COMMIT } : {}),
      runtime: RUNTIME,
      time: new Date().toISOString(),
    };
  }

  /**
   * GET /v1/health/ip — **서버가 당신의 IP 를 무엇으로 보는지** 그대로 보여준다
   * (2026-08-09). 히스토리에 남는 IP 가 내부 주소로 찍힐 때, 프록시가 몇
   * 단계인지·헤더를 제대로 붙이는지 추측하지 않고 **눈으로 확인**하려고 둔다.
   * 브라우저에서 그냥 열면 되고, PC·휴대폰에서 각각 열어 비교하면 된다.
   *
   * 자기 요청의 헤더만 되돌려 준다 — 다른 사람의 정보는 나오지 않는다.
   */
  @Get('ip')
  whoami(@Req() req: {
    ip?: string; ips?: string[];
    headers?: Record<string, unknown>;
    socket?: { remoteAddress?: string };
    app?: { get?: (k: string) => unknown };
  }) {
    const h = req.headers ?? {};
    const ip = clientIpOf(req) ?? null;
    const xff = (h['x-forwarded-for'] as string) ?? null;
    // 사설망(RFC1918)·루프백인가 — 이게 참이면 아직 프록시 주소를 보고 있다
    const isPrivate = (v: string | null) =>
      !!v && /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$|fc|fd)/i.test(v);
    const remote = req.socket?.remoteAddress ?? null;
    const xffList = (xff ?? '').split(',').map((v) => v.trim()).filter(Boolean);
    // 앞단(우리 바로 앞이 아니라 **그 앞**)이 원본 IP 를 버렸는가.
    // 판정: 사슬에 실린 주소가 전부 사설이고, 우리에게 온 XFF 가 딱 하나이며
    // 그 값이 바로 앞 상대(remoteAddress)와도 다르다 —
    // "우리 앞 프록시가 그 앞 상대의 주소를 적었는데, 그것도 사설"이라는 뜻.
    // 이때는 진짜 접속자 IP 가 **우리 서버에 닿기 전에 이미 사라진 것**이라
    // TRUST_PROXY 를 어떻게 고쳐도 복구할 수 없다.
    const lostUpstream =
      xffList.length === 1 && isPrivate(xffList[0])
      && !!remote && xffList[0] !== remote.replace(/^::ffff:/, '');
    // **사슬이 여럿인데 전부 사설**인 경우 (2026-08-14 실사용에서 나왔다:
    // `192.168.0.1, 192.168.0.74`). 위 lostUpstream 은 사슬이 하나일 때만
    // 잡아서 이 경우를 놓치고 "TRUST_PROXY 조정이 필요하다"고만 말했는데,
    // 조정해도 달라지지 않는다 — 사슬에 공인 IP 가 아예 없기 때문이다.
    // 남은 가능성은 둘뿐이고, **판별법을 알려 주는 것**이 우리가 할 일이다.
    const allPrivateChain = xffList.length >= 2 && xffList.every((v) => isPrivate(v));
    return {
      // 우리가 기록에 쓰는 값 — 이게 진짜 접속 IP 여야 한다
      ip,
      // 프록시 사슬 (trust proxy 로 벗겨 낸 결과)
      ips: req.ips ?? [],
      // 프록시가 붙여 준 원본 헤더
      xForwardedFor: xff,
      xRealIp: (h['x-real-ip'] as string) ?? null,
      // 바로 앞 상대(= 마지막 프록시)의 주소
      remoteAddress: remote,
      trustProxy: (req.app?.get?.('trust proxy') as unknown) ?? null,
      userAgent: (h['user-agent'] as string) ?? null,
      // 무엇을 고쳐야 하는지 바로 알려 준다
      hint: !isPrivate(ip)
        ? 'OK — 공인 IP 입니다. 히스토리에도 이 값이 남습니다.'
        : !xff && /^(127\.|::1)/.test(req.socket?.remoteAddress ?? '')
          ? '프록시를 거치지 않은 직접 접속입니다 (로컬 개발) — 정상입니다.'
          : !xff
            ? '프록시가 X-Forwarded-For 를 붙이지 않습니다 — 리버스 프록시에서 X-Forwarded-For 전달을 켜 주세요.'
            : lostUpstream
              ? `접속자 IP 가 **우리 서버에 닿기 전에** 사라졌습니다 — 우리 앞 프록시(${remote})가 그 앞 상대(${xffList[0]})를 접속자로 적었고, 그 값도 사설 IP 입니다. 서버 코드로는 복구할 수 없습니다. ${xffList[0]} 가 무엇인지부터 확인하세요 (dev-server-runbook.md §6.4).`
              : allPrivateChain
                ? `프록시 사슬(${xffList.join(' → ')})이 **전부 사설 IP** 입니다. `
                  + 'TRUST_PROXY 를 바꿔도 달라지지 않습니다 — 사슬 안에 공인 IP 가 아예 없습니다. '
                  + '둘 중 하나입니다: ⑴ 지금 서버와 **같은 사설망에서** 접속 중이다(정상) '
                  + `⑵ 맨 앞 프록시(${xffList[0]})가 원본 IP 를 버렸다. `
                  + '**휴대폰의 LTE(와이파이 끄고)로 이 주소를 다시 열어** 보세요 — '
                  + '거기서 공인 IP 가 나오면 ⑴이라 고칠 것이 없고, 그때도 사설이면 ⑵입니다 '
                  + '(dev-server-runbook.md §6.4).'
                : 'X-Forwarded-For 는 오는데 아직 사설 IP 입니다 — 접속자가 같은 사설망에 있거나, TRUST_PROXY 조정이 필요합니다(기본 loopback, linklocal, uniquelocal).',
    };
  }
}
