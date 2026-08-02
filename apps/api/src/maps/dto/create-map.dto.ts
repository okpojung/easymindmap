import { IsIn, IsOptional, IsString, IsUUID, MaxLength, ValidateIf } from 'class-validator';

/** 맵 유형 — 단독맵 / 협업맵 (2026-08-02) */
export const MAP_KINDS = ['solo', 'collab'] as const;

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

  /** 저장할 폴더 — 생략/null = 최상위("홈") */
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsUUID()
  folderId?: string | null;

  /** 'solo'(단독맵, 기본) | 'collab'(협업맵) */
  @IsOptional()
  @IsIn(MAP_KINDS as unknown as string[])
  kind?: string;
}
