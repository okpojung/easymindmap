import { Injectable, OnModuleDestroy, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, type QueryResult, type QueryResultRow } from 'pg';
import type { AppEnv } from '../config/env.validation';

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
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params: readonly unknown[] = [],
  ): Promise<QueryResult<T>> {
    return this.pool.query<T>(text, params as unknown[]);
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
