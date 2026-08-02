import { Module } from '@nestjs/common';
import { FoldersController } from './folders.controller';
import { FoldersService } from './folders.service';

@Module({
  controllers: [FoldersController],
  providers: [FoldersService],
  exports: [FoldersService], // maps 가 폴더 소유 검증에 쓴다
})
export class FoldersModule {}
