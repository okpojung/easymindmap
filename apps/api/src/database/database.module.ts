import { Global, Module } from '@nestjs/common';
import { DatabaseService } from './database.service';

/**
 * 전역 모듈 — 어느 모듈에서든 DatabaseService 를 주입받을 수 있다.
 */
@Global()
@Module({
  providers: [DatabaseService],
  exports: [DatabaseService],
})
export class DatabaseModule {}
