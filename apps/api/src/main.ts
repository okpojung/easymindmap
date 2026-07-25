import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import type { AppEnv } from './config/env.validation';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: false });
  const config = app.get(ConfigService<AppEnv, true>);

  // 문서 스냅샷은 임베드 이미지(data URL) 때문에 커질 수 있어 한도를 올린다.
  app.useBodyParser('json', { limit: '25mb' });

  // 모든 라우트에 /v1 프리픽스 (api-spec.md 기준: https://api.../v1)
  app.setGlobalPrefix('v1');

  // DTO 검증 전역 적용 — 정의되지 않은 필드는 제거, 타입 자동 변환
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // 프론트엔드(다른 출처)에서 호출 허용
  app.enableCors({
    origin: config.get('CORS_ORIGIN', { infer: true }),
    credentials: true,
  });

  const port = config.get('PORT', { infer: true });
  await app.listen(port);
  new Logger('Bootstrap').log(`EasyMindMap API 기동 → http://localhost:${port}/v1`);
}

void bootstrap();
