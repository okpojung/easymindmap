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

  // **프록시 뒤에 있다는 것을 Express 에 알린다** (2026-08-08).
  // 우리 API 는 NPM(nginx) → Traefik → 컨테이너 순으로 들어온다. 이
  // 설정이 없으면 `req.ip` 가 전부 **프록시 IP 하나**로 보여서,
  // 레이트 리밋이 모든 사용자를 한 바구니에 담는다 — 한 사람이 많이
  // 쓰면 전원이 막힌다. 이 설정을 켜면 X-Forwarded-For 를 읽어 실제
  // 클라이언트 IP 를 쓴다.
  //
  // **2026-08-09 수정**: 처음에는 `1`(한 단계)이었는데, 실제 배포는
  // 프록시가 **두 단계**라 히스토리에 남는 IP 가 전부 내부 주소
  // (192.168.x.x — nginx 의 IP)였다. 단계 수를 사람이 세어 맞추는
  // 방식은 프록시를 하나 더 끼우거나 빼는 순간 조용히 틀린다.
  // 그래서 기본을 **"사설망 주소는 전부 우리 프록시"**로 바꿨다
  // (loopback/linklocal/uniquelocal) — 몇 단계든 벗겨 내고 처음
  // 만나는 **공인 IP**(= 진짜 접속자)에서 멈춘다.
  //   · true(무제한 신뢰)는 여전히 쓰지 않는다 — 클라이언트가 헤더를
  //     위조해 IP 를 바꿔 가며 한도를 무한히 우회할 수 있다.
  //   · 배포마다 다르면 TRUST_PROXY 로 덮어쓴다(숫자·목록·false).
  const trustRaw = String(config.get('TRUST_PROXY', { infer: true }) ?? '').trim();
  const trustProxy: boolean | number | string[] =
    trustRaw === 'false' ? false
      : trustRaw === 'true' ? true
        : /^\d+$/.test(trustRaw) ? Number(trustRaw)
          : trustRaw.split(',').map((v) => v.trim()).filter(Boolean);
  app.set('trust proxy', trustProxy);

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

  // 프론트엔드(다른 출처)에서 호출 허용.
  // CORS_ORIGIN 은 **콤마로 여러 출처**를 받을 수 있다 (2026-08-02) —
  // 로컬 개발 + dev 프런트를 동시에 붙이는 경우가 실제로 있었는데,
  // 단일 문자열만 넘기면 두 번째 출처가 전부 차단됐다.
  const corsOrigins = String(config.get('CORS_ORIGIN', { infer: true }))
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  app.enableCors({
    origin: corsOrigins.length === 1 ? corsOrigins[0] : corsOrigins,
    credentials: true,
  });

  const port = config.get('PORT', { infer: true });
  await app.listen(port);
  new Logger('Bootstrap').log(`EasyMindMap API 기동 → http://localhost:${port}/v1`);
}

void bootstrap();
