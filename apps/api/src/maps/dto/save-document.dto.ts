import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

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
}
