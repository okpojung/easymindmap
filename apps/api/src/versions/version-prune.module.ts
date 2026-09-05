// 버전 정리 워커 (13a §2) — MapsModule 이 저장 뒤 schedule() 을 부르고,
// HealthController 가 status() 를 내보인다.
import { Module } from '@nestjs/common';
import { VersionPruneService } from './version-prune.service';

@Module({
  providers: [VersionPruneService],
  exports: [VersionPruneService],
})
export class VersionPruneModule {}
