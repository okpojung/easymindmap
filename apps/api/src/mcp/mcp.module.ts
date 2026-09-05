import { Module } from '@nestjs/common';
import { FoldersModule } from '../folders/folders.module';
import { MapsModule } from '../maps/maps.module';
import { ApiTokenService } from './api-token.service';
import { McpAuthGuard } from './mcp-auth.guard';
import { McpController } from './mcp.controller';
import { McpToolsService } from './mcp-tools';
import { McpTokensController } from './mcp-tokens.controller';

/**
 * MCP 커넥터 (1단계 create_map · 2단계 list_maps/get_map) — docs/04-extensions/ai/mcp-connector.md
 *
 * **오픈코어 경계: 공개** (§5 결정, 2026-09-04). 노출하는 것이 전부 MVP
 * 기능이고, 셀프호스트 사용자가 자기 서버를 자기 AI 에 연결하지 못하면
 * 반쪽이 되기 때문이다.
 *
 * 이 모듈이 통째로 빠져도 앱은 그대로 돈다 — 그것이 1단계에서 멈출 수
 * 있게 하는 설계다(§7).
 */
@Module({
  imports: [MapsModule, FoldersModule], // 폴더는 list_maps 가 이름을 보여 주는 데 쓴다
  controllers: [McpController, McpTokensController],
  providers: [ApiTokenService, McpToolsService, McpAuthGuard],
})
export class McpModule {}
