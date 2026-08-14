import { Global, Module } from '@nestjs/common';
import { AuditLogService } from './audit-log.service';
import { LoginEventsService } from './login-events.service';

// **전역으로 둔다** — 관리자(남의 이력)와 계정(본인 이력) 두 곳이 쓰고,
// GoTrue DB 풀은 하나만 있으면 된다.
//
// 접속 기록(login_events)도 같이 둔다. 로그인 이력을 만들 때 **두 기록이
// 늘 함께 쓰이기 때문**이다 — GoTrue 가 목록을 주고, 우리 기록이 IP 를 붙인다.
@Global()
@Module({
  providers: [AuditLogService, LoginEventsService],
  exports: [AuditLogService, LoginEventsService],
})
export class AuditLogModule {}
