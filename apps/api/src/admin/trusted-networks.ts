// 관리자 2단계 인증 생략 IP — "2단계 인증 IP관리" (2026-10-24 사용자 지시).
//
// 등록된 IP(또는 C클래스 망)에서 관리자 로그인하면 **인증번호 단계를 건너뛴다.**
// 비밀번호 로그인(GoTrue)과 관리자 명단(ADMIN_EMAILS) 검사는 그대로다 — 생략되는 것은
// 메일로 받는 인증번호 한 단계뿐이다.
//
// 등록 형식 (IPv4 만):
//   · `192.168.0.100`     → 그 IP 하나 (/32)
//   · `192.168.0.0`       → 끝자리가 0 이면 C클래스 망 192.168.0.0~255 (/24)
//   · `192.168.0.0/24`    → 같은 뜻을 명시
// **사설망 주소만** 받는다(10/8, 172.16/12, 192.168/16, 127/8) — 내부망에서만 쓰라는
// 사용자 결정. 공인 IP 를 넣으면 인터넷의 누군가가 그 IP 를 쓰는 순간 인증번호 없이
// 들어올 수 있다.
//
// 접속 IP 는 서버가 정한다(common/client-info.ts clientIpOf — main.ts `trust proxy`).
// 클라이언트가 보낸 X-Forwarded-For 를 그대로 믿지 않는다. 외부 접속자의 공인 IP 는
// 맨 앞 프록시가 사슬에 붙이므로 사설 주소로 위장할 수 없다(2026-10-24 실측:
// 외부 → 공인 IP, 내부 → 공유기 192.168.0.1 로 보임).
//
// 저장: `public.site_settings` 의 키 `admin.mfa_trusted_networks` (공지·게시판 패키지가
// 만든 표). 표가 없거나 읽지 못하면 **목록이 빈 것으로 본다** — 실패하면 인증번호를 받는
// 쪽(안전한 쪽)으로 닫힌다.

export interface TrustedNetwork {
  id: string;
  /** 정규화된 CIDR — `192.168.0.100/32`, `192.168.0.0/24` */
  cidr: string;
  label: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}

export const TRUSTED_NETWORKS_KEY = 'admin.mfa_trusted_networks';
export const TRUSTED_NETWORKS_MAX = 50;

const OCTET = '(25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)';
const IPV4_RE = new RegExp(`^${OCTET}\\.${OCTET}\\.${OCTET}\\.${OCTET}$`);

/** 'a.b.c.d' → 32비트 정수. 아니면 null */
export function ipv4ToInt(v: string): number | null {
  const s = String(v ?? '').trim().replace(/^::ffff:/i, '');
  if (!IPV4_RE.test(s)) return null;
  return s.split('.').reduce((n, o) => n * 256 + Number(o), 0);
}

function intToIpv4(n: number): string {
  return [24, 16, 8, 0].map((sh) => Math.floor(n / 2 ** sh) % 256).join('.');
}

/** 사설망(RFC1918)·루프백인가 */
export function isPrivateIpv4(n: number): boolean {
  const a = Math.floor(n / 2 ** 24), b = Math.floor(n / 2 ** 16) % 256;
  return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

export type ParseResult = { ok: true; cidr: string; bits: 24 | 32 } | { ok: false; message: string };

/** 사용자가 넣은 값 → 정규화된 CIDR */
export function parseTrustedAddress(raw: unknown): ParseResult {
  const s = String(raw ?? '').trim();
  if (!s) return { ok: false, message: 'IP 를 입력해 주세요.' };
  const m = /^([\d.]+)(?:\/(\d{1,2}))?$/.exec(s);
  if (!m) return { ok: false, message: 'IP 형식이 올바르지 않습니다. 예: 192.168.0.100 또는 192.168.0.0' };
  const n = ipv4ToInt(m[1]);
  if (n === null) return { ok: false, message: 'IP 형식이 올바르지 않습니다. 예: 192.168.0.100 또는 192.168.0.0' };
  let bits: 24 | 32;
  if (m[2] !== undefined) {
    if (m[2] !== '24' && m[2] !== '32') return { ok: false, message: '망은 /24(C클래스) 또는 /32(IP 하나)만 등록할 수 있습니다.' };
    bits = Number(m[2]) as 24 | 32;
  } else {
    bits = n % 256 === 0 ? 24 : 32;
  }
  if (bits === 24 && n % 256 !== 0) return { ok: false, message: 'C클래스 망은 끝자리를 0 으로 적어 주세요. 예: 192.168.0.0' };
  if (!isPrivateIpv4(n)) {
    return { ok: false, message: '내부망(사설) 주소만 등록할 수 있습니다 — 10.x, 172.16~31.x, 192.168.x, 127.x' };
  }
  return { ok: true, cidr: `${intToIpv4(n)}/${bits}`, bits };
}

/** 사람이 읽는 범위 — `192.168.0.0 ~ 192.168.0.255` 또는 `192.168.0.100` */
export function describeCidr(cidr: string): string {
  const [ip, bits] = cidr.split('/');
  if (bits === '24') {
    const base = ip.split('.').slice(0, 3).join('.');
    return `${base}.0 ~ ${base}.255`;
  }
  return ip;
}

/** 이 IP 가 이 CIDR 안인가 (/24, /32 만) */
export function cidrContains(cidr: string, ip: string): boolean {
  const n = ipv4ToInt(ip);
  const [base, bitsRaw] = String(cidr).split('/');
  const b = ipv4ToInt(base);
  if (n === null || b === null) return false;
  if (bitsRaw === '32') return n === b;
  if (bitsRaw === '24') return Math.floor(n / 256) === Math.floor(b / 256);
  return false;
}

/** 접속 IP 와 맞는 첫 항목 — **사설 IP 일 때만** (공인 IP 로는 생략하지 않는다) */
export function matchTrusted(list: TrustedNetwork[], ip: string | undefined | null): TrustedNetwork | null {
  const n = ipv4ToInt(String(ip ?? ''));
  if (n === null || !isPrivateIpv4(n)) return null;
  return list.find((e) => cidrContains(e.cidr, String(ip))) ?? null;
}

/** 저장된 JSON 을 믿지 않고 다시 고른다 — 형식이 틀린 항목은 버린다 */
export function sanitizeStored(v: unknown): TrustedNetwork[] {
  if (!Array.isArray(v)) return [];
  const out: TrustedNetwork[] = [];
  for (const e of v.slice(0, TRUSTED_NETWORKS_MAX)) {
    if (!e || typeof e !== 'object') continue;
    const r = e as Record<string, unknown>;
    const p = parseTrustedAddress(r.cidr);
    if (!p.ok || p.cidr !== r.cidr || typeof r.id !== 'string' || !/^[a-f0-9-]{8,40}$/.test(r.id)) continue;
    const str = (k: string, max: number) => (typeof r[k] === 'string' ? (r[k] as string).slice(0, max) : '');
    out.push({
      id: r.id, cidr: p.cidr, label: str('label', 60),
      createdAt: str('createdAt', 40), createdBy: str('createdBy', 254),
      updatedAt: str('updatedAt', 40), updatedBy: str('updatedBy', 254),
    });
  }
  return out;
}
