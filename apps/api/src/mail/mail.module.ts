import { Global, Module } from '@nestjs/common';
import { MailService } from './mail.service';

// 전역 모듈 — 앞으로 여러 기능(가입 인증·비밀번호 재설정·협업 초대)이
// 같은 발송 통로를 쓴다. 모듈마다 import 를 반복하지 않도록 @Global.
@Global()
@Module({
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
