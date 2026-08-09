// client-info — 요청을 보낸 기기의 IP · 플랫폼 · 브라우저를 뽑는다
// (2026-08-09: 히스토리에 "어디서 저장했는지"를 남기려고 도입).
//
// 역할 분담이 중요하다.
//   · **IP 는 서버만 안다** — 클라이언트가 보낸 값은 위조할 수 있으니
//     쓰지 않는다. Express 의 req.ip 는 main.ts 의 `trust proxy` 설정이
//     있어야 실제 클라이언트 IP 다 (없으면 전부 프록시 IP 하나).
//   · **플랫폼·브라우저는 클라이언트가 더 정확하다** — User-Agent 문자열
//     만으로는 Windows 10 과 11 을 구분할 수 없다(둘 다 'Windows NT 10.0').
//     그래서 프런트가 User-Agent Client Hints(navigator.userAgentData)로
//     알아낸 값을 보내 주고, 서버는 그것을 다듬어 저장한다. 값이 없으면
//     (구형 브라우저·직접 호출) 아래 UA 추정으로 채운다.

/** Express 요청에서 실제 클라이언트 IP — IPv4-mapped 표기는 벗긴다 */
export function clientIpOf(req: unknown): string | undefined {
  const r = req as { ips?: unknown; ip?: unknown } | undefined;
  const raw =
    Array.isArray(r?.ips) && r.ips.length ? r.ips[0] : r?.ip;
  if (typeof raw !== 'string' || !raw) return undefined;
  // '::ffff:203.0.113.9' → '203.0.113.9' (IPv4 를 IPv6 로 감싼 표기)
  const v4 = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(raw);
  return (v4 ? v4[1] : raw).slice(0, 45);
}

/** 사용자가 보낸 문자열을 저장 가능한 형태로 — 제어문자 제거 + 길이 제한 */
export function sanitizeLabel(v: unknown, max = 60): string | undefined {
  if (typeof v !== 'string') return undefined;
  const s = v.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim();
  return s ? s.slice(0, max) : undefined;
}

/**
 * User-Agent 문자열로 플랫폼을 **추정**한다 (클라이언트가 안 알려줬을 때).
 * Windows 10/11 은 UA 만으로는 갈리지 않으므로 'Windows 10/11' 로 둔다 —
 * 모르는 것을 아는 척하지 않는다.
 */
export function platformFromUa(ua: string): string | undefined {
  if (!ua) return undefined;
  let m = /Windows NT ([\d.]+)/.exec(ua);
  if (m) {
    const v = m[1];
    if (v === '10.0') return 'Windows 10/11';
    if (v === '6.3') return 'Windows 8.1';
    if (v === '6.2') return 'Windows 8';
    if (v === '6.1') return 'Windows 7';
    return 'Windows';
  }
  m = /Android (\d+)/.exec(ua);
  if (m) return 'Android ' + m[1];
  m = /(?:iPhone|iPad|iPod).*?OS (\d+)[._]/.exec(ua);
  if (m) return 'iOS ' + m[1];
  if (/\biPhone\b|\biPad\b/.test(ua)) return 'iOS';
  if (/CrOS/.test(ua)) return 'ChromeOS';
  // macOS 의 UA 버전은 10_15_7 에서 얼어 있어(고정) 믿을 수 없다 —
  // 정확한 값은 Client Hints 로만 온다.
  if (/Mac OS X|Macintosh/.test(ua)) return 'macOS';
  if (/Linux/.test(ua)) return 'Linux';
  return undefined;
}

/** User-Agent 문자열로 브라우저를 추정 — 순서가 중요하다(파생 브라우저 먼저) */
export function browserFromUa(ua: string): string | undefined {
  if (!ua) return undefined;
  const pick: [RegExp, string][] = [
    [/Edg(?:A|iOS)?\/(\d+)/, 'Edge'],
    [/OPR\/(\d+)/, 'Opera'],
    [/SamsungBrowser\/(\d+)/, 'Samsung Internet'],
    [/Whale\/(\d+)/, 'Whale'],
    [/FxiOS\/(\d+)/, 'Firefox'],
    [/Firefox\/(\d+)/, 'Firefox'],
    [/CriOS\/(\d+)/, 'Chrome'],
    [/Chrome\/(\d+)/, 'Chrome'],
    [/Version\/(\d+).*Safari/, 'Safari'],
  ];
  for (const [re, name] of pick) {
    const m = re.exec(ua);
    if (m) return `${name} ${m[1]}`;
  }
  if (/Safari/.test(ua)) return 'Safari';
  return undefined;
}
