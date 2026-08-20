import { IsBoolean, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

/**
 * 원격 사진 대리 다운로드 (2026-08-20, B16 ② 슬라이스 3 · D-1).
 *
 * `url` 을 여기서 깊이 검사하지는 않는다 — 형식·대역·리다이렉트 검사는
 * `remote-image.ts` 한 곳에서만 한다. **검사를 두 벌 두면 반드시 어긋나고,
 * 그때 느슨한 쪽이 뚫린다.** 여기서는 길이만 자른다.
 */
export class FromUrlDto {
  @IsString()
  @MaxLength(2048)
  url!: string;

  @IsOptional()
  @IsUUID()
  mapId?: string;

  /**
   * `false` 면 **저장하지 않고 바이트만** 돌려준다 (기본 true = 저장).
   *
   * 왜 필요한가: 리치 노트 속 `<img>` 는 `image`·`images` 가 아니라
   * **노트 HTML 안**에 있다. 내보내기의 사진 되돌리기
   * (`export/serverImages.ts`)와 화면의 토큰 붙이기(`utils/imageSrc.ts`)는
   * `image`·`images` 만 훑으므로, 노트 HTML 에 서버 주소를 넣으면
   * **내보낸 파일이 서버 없이 안 열린다** — 이 제품의 핵심 약속이 깨진다
   * (content-permanence.md §7.1).
   *
   * 그래서 노트 HTML 은 지금처럼 data URL 로 두되, **받아오는 일만**
   * 서버가 대신한다 — CORS 로 막히던 사이트가 그제야 성공한다.
   */
  @IsOptional()
  @IsBoolean()
  store?: boolean;
}
