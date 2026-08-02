import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from 'pg';
import type { AppEnv } from '../config/env.validation';

/**
 * "스키마가 낡아서" 나는 PostgreSQL 오류 코드.
 *   42P01 undefined_table · 42703 undefined_column · 42883 undefined_function
 *
 * 배포가 "코드는 자동(Coolify) · 스키마는 수동" 구조라, 스키마 적용을
 * 빠뜨리면 새 코드가 없는 테이블·컬럼을 찾는다. 그대로 두면 사용자에게
 * **"Internal server error"** 만 보여 원인을 알 수 없다
 * (2026-08-02 문서함 배포에서 실제로 겪음) — 그래서 여기서 잡아
 * "무엇을 해야 하는지"가 든 503 으로 바꾼다.
 */
const SCHEMA_ERROR_CODES = new Set(['42P01', '42703', '42883']);

const SCHEMA_HINT =
  '서버 데이터베이스 스키마가 최신이 아닙니다. ' +
  '관리자가 schema.sql 을 적용해야 합니다 (apps/api 에서 `npm run db:apply`). ' +
  '자세한 누락 항목은 /v1/health 의 missingTables·missingColumns 에서 볼 수 있습니다.';

/**
 * PostgreSQL 접속 풀. 애플리케이션 전역에서 재사용한다.
 * ORM 없이 raw SQL(node-postgres)을 쓰는 이유: schema.sql/ltree 등
 * DB 고유 기능을 그대로 활용하고, Supabase(= Postgres) 전환 시에도
 * 동일한 접속 방식을 유지하기 위함.
 */
@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private readonly pool: Pool;

  constructor(config: ConfigService<AppEnv, true>) {
    this.pool = new Pool({
      connectionString: config.get('DATABASE_URL', { infer: true }),
      max: 10,
      idleTimeoutMillis: 30_000,
    });
  }

  async onModuleInit(): Promise<void> {
    // 부팅 시 접속 확인 — 실패하면 로그로 즉시 알린다(치명적이진 않게).
    try {
      await this.pool.query('SELECT 1');
      this.logger.log('데이터베이스 연결 확인됨');
    } catch (err) {
      this.logger.error('데이터베이스 연결 실패 — DATABASE_URL 확인 필요', err as Error);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }

  /** 파라미터 바인딩 쿼리. SQL 인젝션 방지를 위해 항상 $1,$2 형태 사용. */
  async query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params: readonly unknown[] = [],
  ): Promise<QueryResult<T>> {
    try {
      return await this.pool.query<T>(text, params as unknown[]);
    } catch (err) {
      throw this.translate(err);
    }
  }

  /**
   * 스키마 미적용으로 인한 오류를 **행동 지침이 든 503** 으로 바꾼다.
   * 그 외 오류는 그대로 올려보낸다(500 → 원래 처리 경로 유지).
   */
  private translate(err: unknown): unknown {
    const code = (err as { code?: string } | null)?.code;
    if (code && SCHEMA_ERROR_CODES.has(code)) {
      const detail = (err as { message?: string }).message ?? '';
      this.logger.error(`스키마 불일치 [${code}] ${detail} — schema.sql 적용 필요`);
      return new ServiceUnavailableException(SCHEMA_HINT);
    }
    return err;
  }

  /**
   * 트랜잭션 실행 — 콜백 안의 모든 쿼리를 하나의 커넥션/트랜잭션으로 묶는다.
   * 콜백이 예외를 던지면 ROLLBACK, 정상 종료하면 COMMIT.
   * autosave(여러 패치를 원자적으로)·노드 이동 등에서 사용.
   */
  async transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      // 트랜잭션 안의 쿼리는 client.query 라 위 query() 를 거치지 않는다 —
      // 스키마 오류 변환을 여기서도 한 번 더 적용한다.
      throw this.translate(err);
    } finally {
      client.release();
    }
  }

  /** 헬스체크용 — 연결 가능 여부만 boolean 으로. */
  async ping(): Promise<boolean> {
    try {
      await this.pool.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }
}
