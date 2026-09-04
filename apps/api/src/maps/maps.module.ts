import { Module } from '@nestjs/common';
import { AttachmentsModule } from '../attachments/attachments.module';
import { FoldersModule } from '../folders/folders.module';
import { VaultModule } from '../vault/vault.module';
import { MapsController } from './maps.controller';
import { MapsService } from './maps.service';

@Module({
  imports: [FoldersModule, AttachmentsModule, VaultModule], // 폴더 소유 검증 + 쿼터 + 파일 미러
  controllers: [MapsController],
  providers: [MapsService],
  // MCP 커넥터가 `create_map` 에서 그대로 쓴다 — 쿼터·이름 중복·잠금 규칙을
  // 두 벌로 만들지 않기 위해서다 (mcp-connector.md §2)
  exports: [MapsService],
})
export class MapsModule {}
