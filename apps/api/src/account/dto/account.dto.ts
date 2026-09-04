import {
  IsEmail, IsIn, IsOptional, IsString, Length, MaxLength, MinLength,
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

/** 비밀번호 재설정 ① — 이메일만 받는다 (계정 유무는 알려 주지 않는다) */
export class ResetStartDto {
  @IsEmail({}, { message: '올바른 이메일 주소를 입력해 주세요.' })
  @MaxLength(255)
  email!: string;
}

/** 비밀번호 재설정 ② — 인증번호 확인 */
export class ResetVerifyDto {
  @IsEmail({}, { message: '올바른 이메일 주소를 입력해 주세요.' })
  @MaxLength(255)
  email!: string;

  @IsString()
  @Length(4, 10)
  code!: string;
}

/** 비밀번호 재설정 ③ — 재설정표 + 새 비밀번호 */
export class ResetConfirmDto {
  @IsString()
  @MaxLength(200)
  resetToken!: string;

  @IsString()
  @MinLength(6, { message: '비밀번호는 6자 이상이어야 합니다.' })
  @MaxLength(100)
  password!: string;
}

/**
 * 로그인 접속 기록 (2026-08-14).
 *
 * **IP 는 받지 않는다** — 서버가 요청에서 직접 본다. 클라이언트가 보낸 IP 는
 * 위조할 수 있고, 그러면 남의 접속인 척 기록을 심을 수 있다.
 *
 * 플랫폼·브라우저는 반대로 클라이언트가 더 정확하다(User-Agent Client
 * Hints). 없으면 서버가 User-Agent 로 추정한다.
 */
export class LoginEventDto {
  @IsOptional() @IsString() @MaxLength(60) platform?: string;
  @IsOptional() @IsString() @MaxLength(60) browser?: string;
}

/**
 * AI API 키 등록/삭제 (2026-09-04). `key` 를 비우면 그 회사의 키를 지운다.
 * 회사 이름은 프런트 `aiProviders.ts` 의 PROVIDERS 와 같다.
 */
export class SaveAiKeyDto {
  @IsIn(['anthropic', 'openai', 'gemini'], { message: '알 수 없는 AI 회사입니다.' })
  provider!: 'anthropic' | 'openai' | 'gemini';

  @IsString()
  @MaxLength(512)
  key!: string;
}
