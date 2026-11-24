import { createHmac, randomBytes } from 'node:crypto';
import { HttpException, HttpStatus } from '@nestjs/common';

// Single-process hourly windows; independent of bearer headers and optional global throttling.
// Charge synchronously before any DB/GoTrue lookup, including attempts that return 409.
// A hard global cap bounds both maps even if IPs and addresses are rotated. No PII is logged.
export class SignupCodeBudget {
  private readonly key = randomBytes(32);
  private readonly ips = new Map<string, number>();
  private readonly emails = new Map<string, number>();
  private until = 0;
  private total = 0;

  take(ip: string | undefined, email: string, now = Date.now()): void {
    if (now >= this.until) {
      this.ips.clear(); this.emails.clear(); this.total = 0; this.until = now + 3_600_000;
    }
    const digest = (s: string) => createHmac('sha256', this.key).update(s).digest('base64url');
    const ipKey = digest(ip || 'unknown');
    const emailKey = digest(email);
    const byIp = this.ips.get(ipKey) || 0, byEmail = this.emails.get(emailKey) || 0;
    if (this.total >= 3000 || byIp >= 20 || byEmail >= 5) {
      throw new HttpException('가입 인증 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.', HttpStatus.TOO_MANY_REQUESTS);
    }
    this.total++; this.ips.set(ipKey, byIp + 1); this.emails.set(emailKey, byEmail + 1);
  }
}
