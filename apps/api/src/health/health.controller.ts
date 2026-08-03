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
  'map_folders', // 문서함(폴더)
  'map_documents',
  'map_document_versions', // B8 히스토리
  'attachments', // B9 첨부 저장소
  'nodes',
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
  'map_document_versions.node_count', // 히스토리 상세 정보 (2026-08-03)
  'map_document_versions.attach_count', // 히스토리 첨부 개수 (2026-08-03 2차)
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
      time: new Date().toISOString(),
    };
  }
}
