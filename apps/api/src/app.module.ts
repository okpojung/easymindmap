import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { AccountModule } from './account/account.module';
import { AdminModule } from './admin/admin.module';
import { AttachmentsModule } from './attachments/attachments.module';
import { RateLimitGuard } from './common/rate-limit/rate-limit.guard';
import { validateEnv, type AppEnv } from './config/env.validation';
import { DatabaseModule } from './database/database.module';
import { FoldersModule } from './folders/folders.module';
import { HealthModule } from './health/health.module';
import { MapsModule } from './maps/maps.module';
import { MailModule } from './mail/mail.module';
import { NodesModule } from './nodes/nodes.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    // 레이트 리밋 — 창(window) 안에서 최대 몇 번까지 부를 수 있는지.
    // 값은 환경변수로 조절한다(운영 중 재빌드 없이 바꾸기 위해).
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppEnv, true>) => [
        {
          name: 'default',
          ttl: config.get('RATE_LIMIT_WINDOW_MS', { infer: true }),
          limit: config.get('RATE_LIMIT_MAX', { infer: true }),
        },
      ],
    }),
    DatabaseModule,
    MailModule,
    HealthModule,
    AccountModule,
    AdminModule,
    FoldersModule,
    AttachmentsModule,
    MapsModule,
    NodesModule,
  ],
  providers: [
    // 전역 가드 — 모든 요청이 여기를 먼저 지난다.
    // (컨트롤러의 @UseGuards(AuthGuard) 보다 **먼저** 실행된다)
    { provide: APP_GUARD, useClass: RateLimitGuard },
  ],
})
export class AppModule {}
