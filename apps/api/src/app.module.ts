import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './config/env.validation';
import { DatabaseModule } from './database/database.module';
import { FoldersModule } from './folders/folders.module';
import { HealthModule } from './health/health.module';
import { MapsModule } from './maps/maps.module';
import { NodesModule } from './nodes/nodes.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    DatabaseModule,
    HealthModule,
    FoldersModule,
    MapsModule,
    NodesModule,
  ],
})
export class AppModule {}
