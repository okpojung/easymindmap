import {
  IsEmail, IsOptional, IsString, Length, MaxLength, MinLength,
} from 'class-validator';

/** [이메일 인증] 버튼 — 인증번호 발송 */
export class SendEmailCodeDto {
  @IsEmail({}, { message: '올바른 이메일 주소를 입력해 주세요.' })
  @MaxLength(255)
  email!: string;
}

/** 인증번호 확인 */
export class VerifyEmailCodeDto {
  @IsEmail({}, { message: '올바른 이메일 주소를 입력해 주세요.' })
  @MaxLength(255)
  email!: string;

  @IsString()
  @Length(4, 10)
  code!: string;
}

/** 가입 마무리 — 성명·휴대폰 저장 (emailToken 이 있으면 이메일 인증도 기록) */
export class SaveProfileDto {
  @IsString()
  @MinLength(1, { message: '성명을 입력해 주세요.' })
  @MaxLength(100)
  fullName!: string;

  /** 국가번호 — '+82' 또는 '82' 둘 다 받는다 (서버가 정규화) */
  @IsOptional()
  @IsString()
  @MaxLength(6)
  phoneCountry?: string;

  /** 휴대폰 번호 — 하이픈·공백이 있어도 서버가 숫자만 남긴다 */
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phoneNumber?: string;

  /** 이메일 인증 결과로 받은 표 (없으면 이메일 인증 시각을 찍지 않는다) */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  emailToken?: string;
}

/**
 * 회원탈퇴 — 확인 문구('회원탈퇴')를 직접 입력해야 한다.
 * 버튼 하나로 지워지지 않게 하는 마지막 문턱이다.
 */
export class DeleteAccountDto {
  @IsString()
  @MaxLength(30)
  confirm!: string;
}
