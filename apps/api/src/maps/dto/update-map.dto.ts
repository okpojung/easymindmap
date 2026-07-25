import { IsIn, IsInt, IsOptional, IsString, Max, Min, MaxLength } from 'class-validator';

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
}
