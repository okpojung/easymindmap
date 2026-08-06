import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { AttachmentsController } from './attachments.controller';
import { AttachmentsService } from './attachments.service';
import { ChunkUploadService } from './chunk-upload.service';

@Module({
  imports: [StorageModule],
  controllers: [AttachmentsController],
  providers: [AttachmentsService, ChunkUploadService],
  exports: [AttachmentsService], // maps 저장 시 쿼터 검사에 쓴다
})
export class AttachmentsModule {}
