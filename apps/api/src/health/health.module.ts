import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { VersionPruneModule } from '../versions/version-prune.module';

@Module({
  imports: [VersionPruneModule],
  controllers: [HealthController],
})
export class HealthModule {}
