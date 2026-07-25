import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

export class PatchDto {
  @IsIn(['add', 'update', 'delete', 'move'])
  op!: 'add' | 'update' | 'delete' | 'move';

  @IsUUID()
  nodeId!: string;

  /** delete 는 생략, 나머지는 변경 필드만 (parentId·text·orderIndex·style 등) */
  @IsOptional()
  @IsObject()
  data?: Record<string, unknown>;
}

export class AutosaveDto {
  @IsString()
  clientId!: string;

  @IsString()
  patchId!: string;

  @IsInt()
  @Min(0)
  baseVersion!: number;

  @IsOptional()
  @IsString()
  timestamp?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PatchDto)
  patches!: PatchDto[];
}
