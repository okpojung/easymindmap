import { IsString } from 'class-validator';

export class LayoutNodeDto {
  @IsString()
  layoutType!: string;
}
