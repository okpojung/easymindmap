// mail — 거래 메일(가입 인증번호·비밀번호 재설정·초대 …) 발송 한 곳.
//
// **왜 우리 API 가 보내나** (2026-08-09 결정): 앞으로 나갈 메일이 여럿이고
// (인증번호·재설정·협업 초대·용량 알림), 문구·발신자·재발송 제한을 한
// 규칙으로 묶어야 관리가 된다. 인증 서버(GoTrue)에 맡기면 가입 메일만
// 그쪽 규칙을 따르고 나머지는 우리가 보내는 이상한 구조가 된다.
//
// **통로는 환경변수로 갈아 끼운다** — 첨부 저장소가 STORAGE_DRIVER 로
// 드라이버를 고르는 것과 같은 방식이다.
//   · 개발/초기 : Google Workspace SMTP (하루 약 2,000통, 자기 도메인
//     발신 가능 — 무료 Gmail 은 From 을 덮어써서 못 쓴다)
//   · 나중에    : SES·Resend·Postmark 로 **호스트/계정만 교체**.
//     반송(bounce)·스팸신고를 알려 주므로 "메일이 안 온다"를 추적할 수
//     있다. 코드는 바뀌지 않는다.
//
// **설정이 없으면 죽지 않는다** — isConfigured() 가 false 면 호출부가
// 사용자에게 "메일 발송이 아직 설정되지 않았습니다"로 안내하고, 개발
// 모드에서는 인증번호를 서버 로그에 남겨 메일 없이도 흐름을 시험한다.

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';
import type { AppEnv } from '../config/env.validation';

@Injectable()
export class MailService {
  private readonly log = new Logger('MailService');
  private transporter: Transporter | null = null;

  constructor(private readonly config: ConfigService<AppEnv, true>) {}

  /** SMTP 접속 정보가 다 있는가 — 없으면 호출부가 안내 문구로 물러선다 */
  isConfigured(): boolean {
    return (
      !!this.config.get('SMTP_HOST', { infer: true })
      && !!this.config.get('SMTP_USER', { infer: true })
      && !!this.config.get('SMTP_PASS', { infer: true })
    );
  }

  /** 보내는 사람 — SMTP_FROM 이 없으면 계정 주소를 그대로 쓴다 */
  from(): string {
    const explicit = this.config.get('SMTP_FROM', { infer: true });
    if (explicit) return explicit;
    const user = this.config.get('SMTP_USER', { infer: true });
    return `EasyMindMap <${user}>`;
  }

  private tx(): Transporter {
    if (this.transporter) return this.transporter;
    const port = Number(this.config.get('SMTP_PORT', { infer: true }) ?? 587);
    this.transporter = createTransport({
      host: this.config.get('SMTP_HOST', { infer: true }),
      port,
      // 465 = 접속부터 TLS, 587 = 접속 후 STARTTLS 로 승격 (nodemailer 기본)
      secure: port === 465,
      auth: {
        user: this.config.get('SMTP_USER', { infer: true }),
        pass: this.config.get('SMTP_PASS', { infer: true }),
      },
    });
    return this.transporter;
  }

  /**
   * 메일 한 통. **실패해도 예외를 밖으로 던진다** — 인증번호는 "보냈다"고
   * 말해 놓고 안 가면 사용자가 영문도 모르고 기다리게 된다.
   */
  async send(to: string, subject: string, text: string, html?: string): Promise<void> {
    await this.tx().sendMail({ from: this.from(), to, subject, text, html });
    this.log.log(`메일 발송: ${subject} → ${to}`);
  }

  /** 가입 인증번호 — 문구는 짧게, 코드는 크게, 유효시간을 분명히 */
  async sendSignupCode(to: string, code: string, minutes: number): Promise<void> {
    const subject = `[EasyMindMap] 가입 인증번호 ${code}`;
    const text =
      `EasyMindMap 가입 인증번호는 ${code} 입니다.\n`
      + `${minutes}분 안에 입력해 주세요.\n\n`
      + '본인이 요청하지 않았다면 이 메일은 무시하셔도 됩니다.';
    const html =
      '<div style="font-family:system-ui,-apple-system,sans-serif;'
      + 'max-width:420px;line-height:1.7;color:#1F1B16">'
      + '<p style="margin:0 0 14px">EasyMindMap 가입 인증번호입니다.</p>'
      + `<div style="font-size:30px;font-weight:800;letter-spacing:6px;`
      + `padding:14px 0;color:#D97706">${code}</div>`
      + `<p style="margin:0 0 14px">${minutes}분 안에 입력해 주세요.</p>`
      + '<p style="margin:0;font-size:12px;color:#8B7D68">'
      + '본인이 요청하지 않았다면 이 메일은 무시하셔도 됩니다.</p>'
      + '</div>';
    await this.send(to, subject, text, html);
  }
}
