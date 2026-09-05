import { Module } from '@nestjs/common';
import { AttachmentsModule } from '../attachments/attachments.module';
import { StorageModule } from '../storage/storage.module';
import { PublicPublishController, PublishController } from './publish.controller';
import { PublishService } from './publish.service';

@Module({
  // 퍼블리싱된 맵의 사진을 열어 주려면 첨부 서비스가 필요하다 (PUBL-03)
  // 첨부: 퍼블리싱된 맵의 사진 · 저장소: 미리보기 실루엣 (PUBL-03 · 27a §2)
  imports: [AttachmentsModule, StorageModule],
  controllers: [PublishController, PublicPublishController],
  providers: [PublishService],
})
export class PublishModule {}
