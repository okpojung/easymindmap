import { Controller, Get } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

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
  'map_documents',
  'map_document_versions', // B8 히스토리
  'nodes',
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
    time: string;
  }> {
    const dbUp = await this.db.ping();
    let schema: 'ok' | 'outdated' | 'unknown' = 'unknown';
    let missing: string[] = [];

    if (dbUp) {
      try {
        const { rows } = await this.db.query<{ table_name: string }>(
          `SELECT table_name FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = ANY($1)`,
          [REQUIRED_TABLES as unknown as string[]],
        );
        const present = new Set(rows.map((r) => r.table_name));
        missing = REQUIRED_TABLES.filter((t) => !present.has(t));
        schema = missing.length === 0 ? 'ok' : 'outdated';
      } catch {
        schema = 'unknown';
      }
    }

    return {
      // 스키마가 낡았으면 degraded — 배포 직후 바로 눈에 띄도록
      status: dbUp && schema === 'ok' ? 'ok' : 'degraded',
      db: dbUp ? 'up' : 'down',
      schema,
      ...(missing.length ? { missingTables: missing } : {}),
      time: new Date().toISOString(),
    };
  }
}
