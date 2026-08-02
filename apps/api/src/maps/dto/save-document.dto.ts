import { IsBoolean, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * 전체 문서 스냅샷 저장. `doc` 는 프론트엔드 문서 트리(임베드 이미지·노트·
 * 태그·스타일 포함) 그대로. title 을 함께 주면 맵 제목도 갱신.
 */
export class SaveDocumentDto {
  @IsObject()
  doc!: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  /**
   * true 면 이 저장을 **히스토리 버전으로도 남긴다** (B8).
   * 명시적 저장·맵 닫기에서만 true — 자동저장(디바운스)마다 쌓으면
   * 스냅샷(이미지 data URL 포함)이 커서 용량이 급증한다.
   */
  @IsOptional()
  @IsBoolean()
  keepVersion?: boolean;
}
