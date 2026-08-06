import { IsInt, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

/** 청크 업로드 세션 시작 (§12.4 ①) */
export class StartUploadDto {
  /** 원본 파일명 — **경로에는 절대 쓰지 않는다** (메타데이터 전용) */
  @IsString()
  @MaxLength(255)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(127)
  mime?: string;

  /** 전체 크기(바이트). 쿼터를 **미리** 예약하는 데 쓴다 */
  @IsInt()
  @Min(1)
  size!: number;

  @IsOptional()
  @IsUUID()
  mapId?: string;
}
