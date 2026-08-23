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
})
export class MapsModule {}
