import { Global, Module } from '@nestjs/common';
import { AuditLogService } from './audit-log.service';

// **전역으로 둔다** — 관리자(남의 이력)와 계정(본인 이력) 두 곳이 쓰고,
// GoTrue DB 풀은 하나만 있으면 된다.
@Global()
@Module({ providers: [AuditLogService], exports: [AuditLogService] })
export class AuditLogModule {}
