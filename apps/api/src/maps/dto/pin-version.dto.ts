import { IsOptional, IsString, MaxLength } from 'class-validator';

/** 영구보관(별표) — 이름을 붙이는 것이 곧 보관하는 것이다 (13a §3.1) */
export class PinVersionDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string;
}
