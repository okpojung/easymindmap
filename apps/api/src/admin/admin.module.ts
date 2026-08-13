import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminGuard } from './admin.guard';
// 인증번호 발송·확인은 가입 쪽 규칙을 그대로 쓴다 — 두 벌로 나누면
// 재발송 간격·시도 횟수 제한이 갈린다 (admin.service.ts 참조).
import { AccountModule } from '../account/account.module';

@Module({
  imports: [AccountModule],
  controllers: [AdminController],
  providers: [AdminService, AdminGuard],
})
export class AdminModule {}
