import { Controller, Get } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

/**
 * GET /v1/health — 로드밸런서·배포 헬스체크용.
 * DB 연결까지 확인해 실제 서비스 가능 상태인지 알려준다.
 */
@Controller('health')
export class HealthController {
  constructor(private readonly db: DatabaseService) {}

  @Get()
  async check(): Promise<{ status: string; db: 'up' | 'down'; time: string }> {
    const dbUp = await this.db.ping();
    return {
      status: dbUp ? 'ok' : 'degraded',
      db: dbUp ? 'up' : 'down',
      time: new Date().toISOString(),
    };
  }
}
