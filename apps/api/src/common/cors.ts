import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

/**
 * CORS 설정 — **한 자리** (2026-10-31 main.ts 에서 옮김).
 *
 * CORS_ORIGIN 은 **콤마로 여러 출처**를 받을 수 있다 (2026-08-02) —
 * 로컬 개발 + dev 프런트를 동시에 붙이는 경우가 실제로 있었는데,
 * 단일 문자열만 넘기면 두 번째 출처가 전부 차단됐다.
 *
 * 메서드·허용 헤더는 기본값에 맡긴다 — 메서드는 `GET,HEAD,PUT,PATCH,POST,DELETE`,
 * 허용 헤더는 preflight 의 `Access-Control-Request-Headers` 를 그대로 되돌려
 * 준다. 그래서 첨부 덮어쓰기(`PUT …/content` + `Content-Type: text/markdown` ·
 * `If-Match`)의 preflight 도 통과한다 — 시험이 이 함수로 확인한다
 * (test/attachment-content.test.mjs). 목록을 손으로 적으면 헤더 하나를
 * 더할 때마다 여기를 잊는다.
 */
export function corsOptions(raw: string): CorsOptions {
  const origins = String(raw ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    origin: origins.length === 1 ? origins[0] : origins,
    credentials: true,
  };
}
