import { IsBoolean, IsObject, IsOptional, IsString } from 'class-validator';

export class UpdateNodeDto {
  @IsOptional()
  @IsString()
  text?: string;

  @IsOptional()
  @IsString()
  layoutType?: string;

  @IsOptional()
  @IsBoolean()
  collapsed?: boolean;

  @IsOptional()
  @IsString()
  shapeType?: string;

  /** API: style / DB: style_json — 서비스에서 변환 */
  @IsOptional()
  @IsObject()
  style?: Record<string, unknown>;

  /** freeform 좌표 { x, y } (그 외 레이아웃은 null) */
  @IsOptional()
  @IsObject()
  manualPosition?: { x: number; y: number } | null;
}
