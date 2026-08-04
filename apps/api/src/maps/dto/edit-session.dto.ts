import { IsString, MaxLength } from 'class-validator';

/** 편집 잠금 하트비트/해제 — 탭 고유 세션 키 (2026-08-04) */
export class EditSessionDto {
  @IsString()
  @MaxLength(64)
  sessionKey!: string;
}
