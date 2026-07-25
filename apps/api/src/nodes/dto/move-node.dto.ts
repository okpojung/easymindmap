import { IsNumber, IsUUID } from 'class-validator';

export class MoveNodeDto {
  @IsUUID()
  newParentId!: string;

  @IsNumber()
  orderIndex!: number;
}
