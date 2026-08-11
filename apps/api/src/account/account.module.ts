import { Module } from '@nestjs/common';
import { AccountController } from './account.controller';
import { AccountService } from './account.service';
// 회원탈퇴가 첨부 **파일 원본**까지 지운다 — 메타(DB)만 지우면
// 디스크에 주인 없는 파일이 그대로 남는다 (2026-08-11).
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [StorageModule],
  controllers: [AccountController],
  providers: [AccountService],
})
export class AccountModule {}
