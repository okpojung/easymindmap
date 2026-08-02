import { IsOptional, IsString, IsUUID, MaxLength, ValidateIf } from 'class-validator';

export class CreateFolderDto {
  @IsString()
  @MaxLength(255)
  name!: string;

  /** 최상위면 생략 (또는 null) */
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsUUID()
  parentId?: string | null;
}

export class UpdateFolderDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  /** null = 최상위로 이동 */
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsUUID()
  parentId?: string | null;
}
