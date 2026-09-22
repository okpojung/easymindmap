import { BadGatewayException, Controller, Get, Header, NotFoundException, Req } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import type { AppEnv } from '../config/env.validation';
import {
  AS_METADATA_SUFFIX, OIDC_DISCOVERY_SUFFIX, PRM_SUFFIX,
  authorizationServerMetadata, protectedResourceMetadata, requestOrigin,
} from './oauth';

/**
 * RFC 9728 보호 자원 메타데이터 — MCP 3단계.
 *
 * ★ **`/v1` 프리픽스 밖에 있어야 한다.** well-known 주소는 규격이 도메인
 *   뿌리부터 못 박은 자리라 우리 마음대로 `/v1` 을 붙일 수 없다.
 *   `main.ts` 의 `setGlobalPrefix` 에서 이 두 경로를 예외로 뺀다 —
 *   빼는 것을 잊으면 클라이언트가 404 를 받고 **말없이 연결에 실패한다.**
 *
 * 규격이 두 자리를 인정해 **둘 다 낸다**(같은 문서).
 *   · 경로를 끼운 형태 `/.well-known/oauth-protected-resource/v1/mcp` ← 권장
 *   · 뿌리          `/.well-known/oauth-protected-resource`
 *   클라이언트는 앞의 것을 먼저 찾고 없으면 뒤를 찾는다.
 *
 * **인증이 필요 없다.** 이 문서는 "어디서 로그인하면 되는지" 를 알려 주는
 * 안내판이라, 토큰을 요구하면 아무도 첫걸음을 뗄 수 없다(닭과 달걀).
 * 비밀이 들어 있지 않다 — 주소와 scope 이름뿐이다.
 */
@Controller()
export class OAuthMetadataController {
  constructor(private readonly config: ConfigService<AppEnv, true>) {}

  @Get(`${PRM_SUFFIX}/v1/mcp`)
  forMcp(@Req() req: Request) {
    return this.doc(req);
  }

  @Get(PRM_SUFFIX)
  atRoot(@Req() req: Request) {
    return this.doc(req);
  }

  /**
   * 인가 서버 메타데이터 — **우리 겉면** (2026-09-22, oauth.ts "인가 서버 겉면").
   * GoTrue 의 문서를 받아 `issuer`·`authorization_endpoint` 만 우리 것으로 바꾼다.
   * 10분 캐시 — GoTrue 도 같은 값을 10분 캐시로 낸다.
   */
  @Get(AS_METADATA_SUFFIX)
  @Header('Cache-Control', 'public, max-age=600')
  authorizationServer(@Req() req: Request) {
    return this.asDoc(req);
  }

  /** OIDC 디스커버리 자리 — 같은 문서. MCP 클라이언트는 둘 중 하나를 찾는다 */
  @Get(OIDC_DISCOVERY_SUFFIX)
  @Header('Cache-Control', 'public, max-age=600')
  openidConfiguration(@Req() req: Request) {
    return this.asDoc(req);
  }

  private upstreamCache?: { at: number; doc: Record<string, unknown> };

  private async asDoc(req: Request) {
    const as = this.gotrue();
    const origin = requestOrigin(req, this.config.get('PUBLIC_API_URL', { infer: true }));
    const now = Date.now();
    if (!this.upstreamCache || now - this.upstreamCache.at > 10 * 60 * 1000) {
      const url = `${as.replace(/\/+$/, '')}/${AS_METADATA_SUFFIX}`;
      let doc: Record<string, unknown>;
      try {
        const res = await fetch(url, { headers: { Accept: 'application/json' } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        doc = (await res.json()) as Record<string, unknown>;
      } catch (err) {
        // 없는 것을 있는 척하지 않는다 — GoTrue 문서를 못 받으면 우리 문서도 없다.
        throw new BadGatewayException(
          `인가 서버(GoTrue) 메타데이터를 읽지 못했습니다: ${(err as Error).message} — ${url}`,
        );
      }
      if (typeof doc.token_endpoint !== 'string') {
        throw new BadGatewayException('인가 서버(GoTrue) 메타데이터에 token_endpoint 가 없습니다 — OAuth 서버가 꺼져 있는지 확인하세요 (mcp-connector.md §10.4).');
      }
      this.upstreamCache = { at: now, doc };
    }
    return authorizationServerMetadata(this.upstreamCache.doc, origin);
  }

  private gotrue(): string {
    const as = this.config.get('GOTRUE_PUBLIC_URL', { infer: true });
    if (!as) {
      // **없는 것을 있는 척하지 않는다.** 인가 서버 주소를 모르면 이
      // 문서는 거짓이 된다 — `authorization_servers` 가 비면 클라이언트는
      // 그 자리에서 멈추는데, 왜 멈췄는지 알 길이 없다.
      throw new NotFoundException(
        'OAuth 커넥터가 이 서버에 설정되지 않았습니다 (GOTRUE_PUBLIC_URL 미설정). '
        + 'PAT 로는 그대로 붙을 수 있습니다 — mcp-connector.md §9.2.',
      );
    }
    return as;
  }

  private doc(req: Request) {
    this.gotrue(); // 설정이 없으면 여기서 404 — 거짓 문서를 내지 않는다
    const origin = requestOrigin(req, this.config.get('PUBLIC_API_URL', { infer: true }));
    // ★ 인가 서버는 **우리 겉면**이다 (2026-09-22). GoTrue 를 직접 가리키면
    //   ChatGPT 가 `openid` 를 붙여 토큰 교환이 500 으로 끝난다(§12.5).
    return protectedResourceMetadata(origin, origin);
  }
}
