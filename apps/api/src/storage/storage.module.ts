import { Module } from '@nestjs/common';
import { LocalDiskStorage, StorageService } from './storage.service';

// STORAGE_DRIVER 로 드라이버를 고른다 — 현재는 local 만 구현
// (S3 호환 드라이버는 StorageService 구현체를 추가하고 여기서 분기).
@Module({
  providers: [{ provide: StorageService, useClass: LocalDiskStorage }],
  exports: [StorageService],
})
export class StorageModule {}
