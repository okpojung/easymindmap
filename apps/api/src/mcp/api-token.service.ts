import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import {
  BadRequestException, Injectable, NotFoundException, ServiceUnavailableException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

/**
 * MCP 개인 액세스 토큰(PAT) — 발급 · 검증 · 폐기.
 * 설계: docs/04-extensions/ai/mcp-connector.md §3 (안 B)
 *
 * **원문은 발급 응답에 딱 한 번만 나간다.** DB 에는 sha256 해시만 넣으므로
 * 우리도 다시 볼 수 없다 — 잃어버리면 새로 발급받는 수밖에 없다. 이것이
 * 불편이 아니라 목적이다: DB 가 통째로 새어도 남의 계정을 열 수 없다.
 */

/** 토큰 앞머리 — 로그·스크린샷에서 이게 우리 토큰임을 알아보게 한다 */
const PREFIX = 'emm_';
/** 임의 부분의 바이트 수 — base64url 로 43자쯤 된다 (256비트) */
const SECRET_BYTES = 32;
/** 한 사람이 동시에 들고 있을 수 있는 살아 있는 토큰 수 */
const MAX_LIVE_TOKENS = 10;

export interface ApiTokenRow {
  id: string;
  name: string;
  prefix: string;
  created_at: Date;
  last_used_at: Date | null;
  revoked_at: Date | null;
}

export interface ApiTokenView {
  id: string;
  name: string;
  prefix: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
}

function toView(r: ApiTokenRow): ApiTokenView {
  return {
    id: r.id,
    name: r.name,
    prefix: r.prefix,
    createdAt: r.created_at,
    lastUsedAt: r.last_used_at,
    revokedAt: r.revoked_at,
  };
}

/** 토큰 원문 → 저장·조회에 쓰는 해시 (hex 64자) */
function hashToken(raw: string): string {
  return createHash('sha256').update(raw, 'utf8').digest('hex');
}

/**
 * **델타 SQL 을 아직 적용하지 않은 서버**인가.
 *
 * 이 확인이 없으면 새 코드를 배포한 순간 토큰 화면이 오류로 막힌다 —
 * 사용자는 "AI 커넥터를 누르면 오류" 로 겪고, 진짜 원인(SQL 한 번)은
 * 어디에도 보이지 않는다.
 *
 * ★ **`err.code === '42P01'` 만 보면 안 된다** (실측 2026-09-04).
 * `DatabaseService.query` 가 스키마 오류(42P01·42703·42883)를 **이미
 * 503 예외로 바꿔서** 던지므로, 여기까지 pg 의 원본 코드가 오지 않는다
 * (database.service.ts `translate`). 이 서비스가 건드리는 표는
 * `api_tokens` 하나뿐이라, 그 503 은 곧 "그 표가 없다"는 뜻이다.
 * 원본 코드 검사도 남겨 둔다 — 나중에 그 변환이 사라져도 계속 맞는다.
 */
function isMissingTable(err: unknown): boolean {
  if ((err as { code?: string })?.code === '42P01') return true;
  return err instanceof ServiceUnavailableException;
}

@Injectable()
export class ApiTokenService {
  /**
   * `last_used_at` 을 방금 갱신한 토큰 (프로세스 메모리).
   *
   * 매 요청마다 UPDATE 하면 **읽기만 하는 요청도 전부 쓰기가 된다.**
   * 이 값은 "이 토큰이 아직 쓰이나"를 사람이 보려는 것이지 정확한
   * 시각이 필요한 값이 아니므로, 같은 토큰은 하루에 한 번만 쓴다.
   */
  private readonly touched = new Map<string, number>();
  private static readonly TOUCH_INTERVAL_MS = 24 * 60 * 60 * 1000;

  constructor(private readonly db: DatabaseService) {}

  /** 표가 아직 없으면 **빈 목록 + ready:false** — 화면이 그 이유를 말한다 */
  async list(userId: string): Promise<{ ready: boolean; tokens: ApiTokenView[] }> {
    try {
      const { rows } = await this.db.query<ApiTokenRow>(
        `SELECT id, name, prefix, created_at, last_used_at, revoked_at
           FROM public.api_tokens
          WHERE user_id = $1
          ORDER BY created_at DESC`,
        [userId],
      );
      return { ready: true, tokens: rows.map(toView) };
    } catch (err) {
      if (isMissingTable(err)) return { ready: false, tokens: [] };
      throw err;
    }
  }

  /**
   * 새 토큰 발급. 반환값의 `token` 이 **원문이고, 다시는 볼 수 없다.**
   */
  async issue(userId: string, name: string): Promise<ApiTokenView & { token: string }> {
    const label = name.trim().slice(0, 60);
    if (!label) throw new BadRequestException('토큰 이름을 적어 주세요.');

    try {
      return await this.insert(userId, label);
    } catch (err) {
      if (isMissingTable(err)) {
        throw new ServiceUnavailableException(
          '서버에 MCP 토큰 표(api_tokens)가 아직 없습니다 — 델타 SQL 을 적용해 주세요 '
          + '(docs/04-extensions/ai/mcp-connector.md §9).',
        );
      }
      throw err;
    }
  }

  private async insert(userId: string, label: string): Promise<ApiTokenView & { token: string }> {
    const { rows: live } = await this.db.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM public.api_tokens
        WHERE user_id = $1 AND revoked_at IS NULL`,
      [userId],
    );
    if (Number(live[0]?.n ?? 0) >= MAX_LIVE_TOKENS) {
      throw new BadRequestException(
        `살아 있는 토큰이 ${MAX_LIVE_TOKENS}개입니다 — 쓰지 않는 토큰을 먼저 폐기해 주세요.`,
      );
    }

    const raw = PREFIX + randomBytes(SECRET_BYTES).toString('base64url');
    const { rows } = await this.db.query<ApiTokenRow>(
      `INSERT INTO public.api_tokens (user_id, name, token_hash, prefix)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, prefix, created_at, last_used_at, revoked_at`,
      [userId, label, hashToken(raw), raw.slice(0, 12)],
    );
    return { ...toView(rows[0]), token: raw };
  }

  /**
   * 폐기 — 행을 지우지 않고 `revoked_at` 을 채운다. 언제 무엇을 껐는지
   * 사용자가 볼 수 있어야 하기 때문이다. **남의 토큰은 못 지운다** —
   * WHERE 에 user_id 가 함께 들어간다(경로의 id 만 믿지 않는다).
   */
  async revoke(userId: string, tokenId: string): Promise<ApiTokenView> {
    const { rows } = await this.db.query<ApiTokenRow>(
      `UPDATE public.api_tokens
          SET revoked_at = COALESCE(revoked_at, NOW())
        WHERE id = $1 AND user_id = $2
        RETURNING id, name, prefix, created_at, last_used_at, revoked_at`,
      [tokenId, userId],
    );
    if (rows.length === 0) throw new NotFoundException('토큰을 찾을 수 없습니다.');
    return toView(rows[0]);
  }

  /**
   * 토큰 원문 → 사용자 id. 없거나 폐기됐으면 null.
   *
   * 조회는 **해시 한 번 + UNIQUE 인덱스 한 번**이다. 비교를 SQL 등호로
   * 하는 것이 안전한 이유: 비교 대상이 토큰이 아니라 **해시**라, 응답
   * 시간으로 원문을 한 글자씩 알아낼 수 없다. 그래도 형식 검사는
   * 상수 시간으로 한다(아래 hasPrefix).
   */
  async userIdFor(raw: string): Promise<string | null> {
    if (!hasPrefix(raw)) return null;
    let rows: { id: string; user_id: string }[];
    try {
      ({ rows } = await this.db.query<{ id: string; user_id: string }>(
        `SELECT id, user_id FROM public.api_tokens
          WHERE token_hash = $1 AND revoked_at IS NULL`,
        [hashToken(raw)],
      ));
    } catch (err) {
      // 표가 없는 서버 = 발급한 적도 없는 서버다. 500 이 아니라 **인증
      // 실패**로 답한다 — 밖에서 부르는 쪽에는 그것이 사실이다
      if (isMissingTable(err)) return null;
      throw err;
    }
    if (rows.length === 0) return null;
    void this.touch(rows[0].id);
    return rows[0].user_id;
  }

  /** "마지막 사용" 갱신 — 하루에 한 번, 실패해도 요청은 그대로 진행한다 */
  private async touch(id: string): Promise<void> {
    const now = Date.now();
    const last = this.touched.get(id) ?? 0;
    if (now - last < ApiTokenService.TOUCH_INTERVAL_MS) return;
    this.touched.set(id, now);
    try {
      await this.db.query(
        `UPDATE public.api_tokens SET last_used_at = NOW() WHERE id = $1`, [id],
      );
    } catch {
      // 표시용 값이다 — 못 남겼다고 요청을 실패시키지 않는다
      this.touched.delete(id);
    }
  }
}

/** 접두어 검사 — 길이가 새지 않도록 상수 시간으로 비교한다 */
function hasPrefix(raw: string): boolean {
  if (raw.length < PREFIX.length + 20) return false;
  const a = Buffer.from(raw.slice(0, PREFIX.length), 'utf8');
  const b = Buffer.from(PREFIX, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}
