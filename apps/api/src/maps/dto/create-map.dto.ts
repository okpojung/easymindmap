import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

const LAYOUTS = [
  'radial-bidirectional',
  'radial-right',
  'tree-right',
  'tree-down',
  'org-right',
  'progressive-right',
  'timeline',
  'freeform',
  'kanban',
];

export class CreateMapDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @IsOptional()
  @IsUUID()
  workspaceId?: string;

  @IsOptional()
  @IsIn(LAYOUTS)
  defaultLayoutType?: string;
}
