import { Module } from '@nestjs/common';
import { FoldersModule } from '../folders/folders.module';
import { MapsController } from './maps.controller';
import { MapsService } from './maps.service';

@Module({
  imports: [FoldersModule], // 폴더 소유 검증
  controllers: [MapsController],
  providers: [MapsService],
})
export class MapsModule {}
