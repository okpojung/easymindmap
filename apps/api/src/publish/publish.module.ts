import { Module } from '@nestjs/common';
import { AttachmentsModule } from '../attachments/attachments.module';
import { PublicPublishController, PublishController } from './publish.controller';
import { PublishService } from './publish.service';

@Module({
  // 공개된 맵의 사진을 열어 주려면 첨부 서비스가 필요하다 (PUBL-03)
  imports: [AttachmentsModule],
  controllers: [PublishController, PublicPublishController],
  providers: [PublishService],
})
export class PublishModule {}
