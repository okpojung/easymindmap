import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, Min, MaxLength, ValidateIf } from 'class-validator';
import { MAP_KINDS } from './create-map.dto';

export class UpdateMapDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @IsOptional()
  @IsIn(['edit', 'dashboard', 'kanban'])
  viewMode?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(86_400)
  refreshIntervalSeconds?: number;

  @IsOptional()
  @IsString()
  defaultLayoutType?: string;

  /** 폴더 이동 — null = 최상위로 */
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsUUID()
  folderId?: string | null;

  @IsOptional()
  @IsIn(MAP_KINDS as unknown as string[])
  kind?: string;
}
