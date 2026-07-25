import { IsNumber, IsObject, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateNodeDto {
  /** 없으면(null/미지정) 이 맵의 루트 노드를 생성 */
  @IsOptional()
  @IsUUID()
  parentId?: string;

  @IsOptional()
  @IsString()
  text?: string;

  @IsOptional()
  @IsString()
  layoutType?: string;

  @IsOptional()
  @IsString()
  shapeType?: string;

  @IsOptional()
  @IsNumber()
  orderIndex?: number;

  @IsOptional()
  @IsObject()
  style?: Record<string, unknown>;
}
