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

  /**
   * 편집 세션 키 (2026-08-04 단일 세션 잠금) — 탭마다 고유. 다른 살아
   * 있는 세션이 이 맵의 잠금을 쥐고 있으면 저장이 409 로 거절된다.
   */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  editSession?: string;

  /**
   * **"가지가 하나도 없는 문서로 덮어쓰는 것"을 명시적으로 허용**한다
   * (2026-08-05 세 번째 유실 보고). 서버는 내용이 있던 맵을 빈 문서로
   * 덮어쓰는 저장을 기본적으로 거부한다 — 자동저장이든 명시 저장이든.
   * 사용자가 확인 대화상자에서 "그래도 비우고 저장"을 고른 경우에만
   * 프런트가 이 값을 true 로 보낸다.
   */
  @IsOptional()
  @IsBoolean()
  allowEmpty?: boolean;
}
