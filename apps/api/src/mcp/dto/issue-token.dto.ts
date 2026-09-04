import { IsString, MaxLength, MinLength } from 'class-validator';

export class IssueTokenDto {
  /** 사람이 알아보는 이름 — '집 노트북 Claude' 처럼 어디에 넣었는지 */
  @IsString()
  @MinLength(1, { message: '토큰 이름을 적어 주세요.' })
  @MaxLength(60, { message: '토큰 이름은 60자까지입니다.' })
  name!: string;
}
