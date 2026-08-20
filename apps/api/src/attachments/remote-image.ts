// remote-image — **서버가 원격 사진을 대신 내려받는다** (2026-08-20, B16 ② 슬라이스 3).
//
// 왜 서버인가: 브라우저 fetch 는 CORS 로 막힌다. 남의 사이트가 우리에게
// 사진을 내줄 이유가 없으므로, 기사에서 복사한 사진은 상당수가 내장되지
// 못하고 **원본 URL 링크로만 남았다**(기사가 지워지면 사진도 사라진다).
// 서버는 CORS 를 받지 않으므로 이 경로로 내려받아 첨부 저장소에 넣는다.
//
// ─────────────────────────────────────────────────────────────────────
// ★ 이 파일의 본체는 다운로드가 아니라 **SSRF 방어**다.
//
// "사용자가 준 아무 URL 이나 서버가 대신 받아온다" 는 것은, 막지 않으면
// **공격자가 우리 서버를 통해 내부망을 두드리는 통로**가 된다. 이 배포는
// Coolify · GoTrue · PostgreSQL 이 같은 도커 네트워크에 있고 NAS 마운트도
// 붙어 있다 — `http://<컨테이너이름>:5432` 한 줄이면 그대로 열린다.
//
// 그래서 다음을 **전부** 건다.
//   ① http/https 만 (file: · gopher: · data: 등은 거절)
//   ② 사설·루프백·링크로컬 대역 차단 — **DNS 해석 결과(IP)로** 검사한다.
//      호스트 이름만 보면 공격자가 자기 도메인의 A 레코드를 127.0.0.1 로
//      걸어 그대로 우회한다.
//   ③ 검사한 그 IP 로 **직접 붙는다**(lookup 을 갈아끼운다). 검사한 뒤
//      다시 해석하면 그 사이에 답이 바뀔 수 있다(DNS rebinding).
//   ④ 리다이렉트 3회 상한 — **매 홉마다 ①②③ 를 다시 한다.**
//      첫 응답이 302 로 내부 주소를 가리키는 것이 전형적인 우회다.
//   ⑤ Content-Type 이 image/* 인지, 그중에서도 담을 수 있는 형식인지
//   ⑥ 바이트 상한 — **스트림을 읽으면서** 넘는 순간 끊는다.
//      Content-Length 는 거짓말할 수 있으므로 그것만 믿지 않는다.
//   ⑦ 타임아웃
// ─────────────────────────────────────────────────────────────────────

import { createHash } from 'node:crypto';
import { lookup as dnsLookup } from 'node:dns';
import * as http from 'node:http';
import * as https from 'node:https';
import { isIP } from 'node:net';

/**
 * 원격 사진 1장의 바이트 상한.
 *
 * 프런트의 `MAX_EMBED_BYTES`(2.5MB)와 **같은 값**이다 — 서버 경유가
 * 실패했을 때 프런트 fetch 폴백이 도는데, 두 한도가 다르면 "서버로는
 * 안 되고 브라우저로는 되는" 크기 구간이 생겨 설명할 수 없는 동작이 된다.
 */
export const REMOTE_IMAGE_MAX_BYTES = 2_500_000;

/** 리다이렉트 상한 — 매 홉마다 검사를 다시 한다 */
const MAX_REDIRECTS = 3;

/** 응답 헤더까지 + 본문 전체에 각각 거는 시간 상한(ms) */
const HEADER_TIMEOUT_MS = 8_000;
const TOTAL_TIMEOUT_MS = 20_000;

/**
 * 받아서 저장할 수 있는 형식 — `maps/doc-images.ts` 의 `EXT_BY_MIME`,
 * 내보내기 직렬화가 ZIP 에 담는 형식과 **같아야 한다.** 여기만 넓히면
 * 내보내기가 알아보지 못하는 사진이 문서에 들어간다(조용한 유실).
 */
const EXT_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

/** SSRF 검사에 걸렸다 — 호출부가 400 으로 바꾼다 */
export class BlockedUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BlockedUrlError';
  }
}

/** 받아오다 실패했다(연결·형식·크기) — 호출부가 400 으로 바꾼다 */
export class RemoteFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RemoteFetchError';
  }
}

function ipv4Parts(ip: string): number[] | null {
  const p = ip.split('.');
  if (p.length !== 4) return null;
  const out: number[] = [];
  for (const s of p) {
    if (!/^\d{1,3}$/.test(s)) return null;
    const n = Number(s);
    if (n > 255) return null;
    out.push(n);
  }
  return out;
}

/**
 * IPv6 주소를 8묶음 숫자로 편다(`::` 축약 포함). 못 펴면 null.
 *
 * 문자열 비교로 때우면 반드시 뚫린다 — `::1` 은 `0:0:0:0:0:0:0:1` 로도,
 * `0000:...:0001` 로도 쓸 수 있고, URL 파서는 그것을 **또 다른 꼴로**
 * 정규화한다. 숫자로 펴 놓고 숫자로 비교한다.
 */
function ipv6Groups(ip: string): number[] | null {
  let s = ip.toLowerCase();
  // 끝에 IPv4 표기가 붙은 꼴(`::ffff:127.0.0.1`)을 16진수 두 묶음으로 바꾼다
  const tail = /(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(s);
  if (tail) {
    const p = ipv4Parts(tail[1]);
    if (!p) return null;
    s = s.slice(0, tail.index)
      + ((p[0] << 8) | p[1]).toString(16) + ':' + ((p[2] << 8) | p[3]).toString(16);
  }
  const halves = s.split('::');
  if (halves.length > 2) return null;
  const parse = (part: string) =>
    part === '' ? [] : part.split(':').map((g) => parseInt(g, 16));
  const head = parse(halves[0]);
  const rest = halves.length === 2 ? parse(halves[1]) : [];
  const groups = halves.length === 2
    ? [...head, ...new Array(8 - head.length - rest.length).fill(0), ...rest]
    : head;
  if (groups.length !== 8 || groups.some((g) => !Number.isInteger(g) || g < 0 || g > 0xffff)) {
    return null;
  }
  return groups;
}

/**
 * 이 IP 로 나가면 안 되는가 — 안 되면 **이유**를, 되면 null.
 *
 * 요구된 대역(localhost · 127/8 · 10/8 · 172.16/12 · 192.168/16 ·
 * 169.254/16 · ::1 · fc00::/7 · 0.0.0.0/8)에 더해, 같은 성격이라 함께
 * 막아야 하는 것들(CGNAT · 멀티캐스트 · 예약 대역 · IPv6 링크로컬)까지
 * 막는다. **막는 쪽으로 틀리는 편이 안전하다** — 여기서 뚫리면 내부망이다.
 */
export function blockedIpReason(addr: string): string | null {
  const ip = addr.trim().replace(/^\[|\]$/g, '').replace(/%.*$/, '');

  if (isIP(ip) === 6) {
    const g = ipv6Groups(ip);
    if (!g) return '주소를 해석할 수 없습니다.';

    // 앞 다섯 묶음이 0 이면 IPv4 를 싼 꼴일 수 있다
    if (g[0] === 0 && g[1] === 0 && g[2] === 0 && g[3] === 0 && g[4] === 0) {
      // ★ **IPv4-mapped(`::ffff:a.b.c.d`) 를 반드시 벗긴다.** URL 파서가
      //   `::ffff:127.0.0.1` 을 `::ffff:7f00:1` 로 정규화해 버리므로,
      //   점 표기만 보고 벗기면 그 꼴이 IPv4 검사를 통째로 건너뛴다.
      const asV4 = () => blockedIpv4Reason(
        [g[6] >> 8, g[6] & 0xff, g[7] >> 8, g[7] & 0xff].join('.'),
      );
      if (g[5] === 0xffff) return asV4();
      if (g[5] === 0) {
        // `::` · `::1` 이 먼저다 — 이것을 IPv4 로 풀면 `0.0.0.1` 이 되어
        // 엉뚱한 이유("0.0.0.0/8")가 붙는다.
        if (g[6] === 0 && g[7] === 0) return ':: (미지정)';
        if (g[6] === 0 && g[7] === 1) return '::1 (루프백)';
        return asV4(); // IPv4-compatible(폐기된 표기) — 그래도 벗겨서 본다
      }
    }

    const n = g[0];
    if (n >= 0xfc00 && n <= 0xfdff) return 'fc00::/7 (사설망)';   // 유니크 로컬
    if (n >= 0xfe80 && n <= 0xfebf) return 'fe80::/10 (링크로컬)';
    if (n >= 0xff00) return 'ff00::/8 (멀티캐스트)';
    return null;
  }
  if (isIP(ip) === 4) return blockedIpv4Reason(ip);
  return '주소를 해석할 수 없습니다.';
}

function blockedIpv4Reason(ip: string): string | null {
  const p = ipv4Parts(ip);
  if (!p) return '주소를 해석할 수 없습니다.';
  const [a, b, c] = p;
  if (a === 0) return '0.0.0.0/8 (예약)';
  if (a === 10) return '10.0.0.0/8 (사설망)';
  if (a === 127) return '127.0.0.0/8 (루프백)';
  if (a === 100 && b >= 64 && b <= 127) return '100.64.0.0/10 (통신사 사설망)';
  if (a === 169 && b === 254) return '169.254.0.0/16 (링크로컬·클라우드 메타데이터)';
  if (a === 172 && b >= 16 && b <= 31) return '172.16.0.0/12 (사설망)';
  // /24 다 — 세 번째 자리까지 봐야 한다. 두 자리만 보면 192.0.0.0/16
  // 전체를 막아 버린다(멀쩡한 공개 대역이 함께 걸린다).
  if (a === 192 && b === 0 && c === 0) return '192.0.0.0/24 (예약)';
  if (a === 192 && b === 168) return '192.168.0.0/16 (사설망)';
  if (a === 198 && (b === 18 || b === 19)) return '198.18.0.0/15 (벤치마크 예약)';
  if (a >= 224) return '224.0.0.0/4 이상 (멀티캐스트·예약)';
  return null;
}

/**
 * URL 하나를 검사한다 — 형식(①)만. IP 검사(②)는 실제로 붙을 때 한다.
 *
 * `localhost` 처럼 **이름만으로도 뻔한 것**은 여기서 먼저 자른다. DNS 가
 * 막아 주긴 하지만, 오류 메시지가 "127.0.0.1 이라 막혔다"보다
 * "localhost 는 받아올 수 없다"가 사용자에게 낫다.
 */
function parseAndCheckUrl(raw: string): URL {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new BlockedUrlError('주소 형식이 올바르지 않습니다.');
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new BlockedUrlError(
      `${u.protocol} 주소는 받아올 수 없습니다 — http/https 만 됩니다.`,
    );
  }
  const host = u.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!host) throw new BlockedUrlError('호스트가 없는 주소입니다.');
  if (host === 'localhost' || host.endsWith('.localhost')) {
    throw new BlockedUrlError('localhost 는 받아올 수 없습니다.');
  }
  // 이름이 아니라 IP 를 직접 적은 경우는 지금 바로 검사한다
  if (isIP(host)) {
    const why = blockedIpReason(host);
    if (why) throw new BlockedUrlError(`내부 주소는 받아올 수 없습니다 — ${why}`);
  }
  return u;
}

/**
 * `http.request` 에 끼워 넣을 이름 해석기.
 *
 * ★ **해석한 IP 를 그대로 돌려주고 그 IP 로 붙게 한다.** 검사만 하고
 * 라이브러리가 다시 해석하게 두면, 그 사이에 답이 바뀌어(DNS rebinding)
 * 검사를 통과한 이름이 내부 주소로 붙는다.
 *
 * 해석 결과가 **여럿이면 하나라도 막힌 대역이면 거절**한다 — 공격자는
 * 통과할 IP 하나를 섞어 놓기만 하면 되기 때문이다.
 */
const pinnedLookup: NonNullable<http.RequestOptions['lookup']> = (
  hostname, options, callback,
) => {
  dnsLookup(hostname, { all: true, verbatim: true }, (err, addresses) => {
    if (err) {
      (callback as (e: NodeJS.ErrnoException | null) => void)(err);
      return;
    }
    const list = addresses ?? [];
    if (!list.length) {
      (callback as (e: Error | null) => void)(
        new BlockedUrlError(`주소를 찾을 수 없습니다 — ${hostname}`),
      );
      return;
    }
    for (const a of list) {
      const why = blockedIpReason(a.address);
      if (why) {
        (callback as (e: Error | null) => void)(
          new BlockedUrlError(`내부 주소는 받아올 수 없습니다 — ${why}`),
        );
        return;
      }
    }
    // ★ **`net` 은 lookup 을 `{ all: true }` 로 부르고 배열을 기대한다.**
    //   (Node 18+ `lookupAndConnect` 가 `addresses[0].address` 를 읽는다.)
    //   여기서 문자열 하나만 돌려주면 `addresses[0]` 이 **문자열의 첫 글자**가
    //   되어 `Invalid IP address: undefined` 로 죽는다 — 차단은 멀쩡히 돌고
    //   **성공 경로만 조용히 전부 실패**한다. 막는 쪽만 시험하면 안 걸린다.
    //   여기 담긴 주소는 위에서 **전부** 검사를 통과한 것들이다.
    if ((options as { all?: boolean }).all) {
      (callback as (e: null, addrs: { address: string; family: number }[]) => void)(
        null, list.map((a) => ({ address: a.address, family: a.family })),
      );
      return;
    }
    const first = list[0];
    (callback as (e: null, addr: string, fam: number) => void)(
      null, first.address, first.family,
    );
  });
};

interface Hop {
  status: number;
  location?: string;
  contentType: string;
  contentLength: number | null;
  res: http.IncomingMessage;
}

/**
 * 전체 시간 상한을 **실제로 끊기 위한** 손잡이.
 *
 * 플래그만 세워 두면 아무것도 끊기지 않는다 — 1바이트씩 아주 느리게
 * 흘려보내는 서버(slow loris)에 소켓이 잡힌 채로 남는다. 그래서 지금 열려
 * 있는 요청을 들고 있다가 시간이 되면 **그것을 부순다.**
 */
interface Deadline {
  /** 전체 상한이 지났다 */
  expired: boolean;
  /** 소켓이 조용해서 끊었다 — 끊긴 이유를 사용자에게 제대로 말해 주려는 것 */
  idle: boolean;
  /** 지금 열려 있는 요청 — 시간이 되면 이걸 destroy 한다 */
  current?: { destroy: (err?: Error) => void };
}

function requestOnce(u: URL, deadline: Deadline): Promise<Hop> {
  return new Promise<Hop>((resolve, reject) => {
    const mod = u.protocol === 'https:' ? https : http;
    const req = mod.request(
      {
        protocol: u.protocol,
        hostname: u.hostname.replace(/^\[|\]$/g, ''),
        port: u.port || (u.protocol === 'https:' ? 443 : 80),
        path: `${u.pathname}${u.search}`,
        method: 'GET',
        // 리다이렉트는 **우리가** 따라간다 — 라이브러리에 맡기면 홉마다
        // 검사를 다시 할 수 없다.
        lookup: pinnedLookup,
        headers: {
          // 핫링크 차단이 흔해 최소한의 신원은 밝힌다. Referer 는 보내지
          // 않는다 — 사용자가 어느 페이지에서 복사했는지는 남의 서버가
          // 알 일이 아니다.
          'User-Agent': 'EasyMindMap/1.0 (+image fetch)',
          Accept: 'image/*',
          'Accept-Encoding': 'identity', // 크기 상한을 압축 해제 전 바이트로 센다
        },
        timeout: HEADER_TIMEOUT_MS,
      },
      (res) => {
        const len = Number(res.headers['content-length']);
        resolve({
          status: res.statusCode ?? 0,
          location: typeof res.headers.location === 'string' ? res.headers.location : undefined,
          contentType: String(res.headers['content-type'] ?? '').toLowerCase(),
          contentLength: Number.isFinite(len) ? len : null,
          res,
        });
      },
    );
    deadline.current = req;
    req.on('timeout', () => {
      // 소켓이 8초간 조용하다 — 응답 헤더를 안 주는 서버와, 본문을 아주
      // 느리게 흘려 소켓을 붙잡는 서버(slow loris)를 같이 끊는다.
      deadline.idle = true;
      req.destroy(new RemoteFetchError('사진 서버가 응답하지 않습니다(시간 초과).'));
    });
    req.on('error', (err) => {
      if (deadline.expired || deadline.idle) {
        reject(new RemoteFetchError('사진을 받아오는 데 너무 오래 걸립니다(시간 초과).'));
        return;
      }
      reject(
        err instanceof BlockedUrlError || err instanceof RemoteFetchError
          ? err
          : new RemoteFetchError(`사진을 받아오지 못했습니다 — ${err.message}`),
      );
    });
    req.end();
  });
}

/** 상한을 넘는 순간 끊으면서 본문을 읽는다 */
function readCapped(
  res: http.IncomingMessage, cap: number, deadline: Deadline,
): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    let done = false;
    const fail = (err: Error) => {
      if (done) return;
      done = true;
      res.destroy();
      reject(err);
    };
    res.on('data', (c: Buffer) => {
      total += c.length;
      // ⑥ **Content-Length 를 믿지 않는다** — 여기서 실제 바이트로 센다
      if (total > cap) {
        fail(new RemoteFetchError(
          `사진이 너무 큽니다 — ${Math.round(cap / 1024 / 1024 * 10) / 10}MB 까지만 받아옵니다.`,
        ));
        return;
      }
      chunks.push(c);
    });
    res.on('error', (e) => fail(
      deadline.expired || deadline.idle
        ? new RemoteFetchError('사진을 받아오는 데 너무 오래 걸립니다(시간 초과).')
        : new RemoteFetchError(`전송이 끊겼습니다 — ${e.message}`),
    ));
    res.on('end', () => {
      if (done) return;
      done = true;
      resolve(Buffer.concat(chunks));
    });
  });
}

export interface RemoteImage {
  bytes: Buffer;
  mime: string;
  /** 내용 해시 이름 `img-<16자>.<확장자>` — 저장할 때 이 이름을 쓴다 */
  name: string;
  /** 실제로 받아온 최종 주소(리다이렉트를 따라간 뒤) */
  finalUrl: string;
}

/**
 * 원격 사진을 받아 온다. 실패하면 `BlockedUrlError` · `RemoteFetchError`.
 *
 * 이름을 **내용 해시**(`img-<해시16>.<확장자>`)로 짓는 이유는 둘이다.
 *   ① 같은 사진을 두 번 올리지 않는다 (호출부가 이름으로 찾아 재사용)
 *   ② 정리(GC)가 "우리가 넣은 사진"으로 알아본다 —
 *      `doc-images.ts isExtractedImageName()` 과 **같은 꼴**이어야 한다.
 */
export async function fetchRemoteImage(
  rawUrl: string,
  cap = REMOTE_IMAGE_MAX_BYTES,
): Promise<RemoteImage> {
  let u = parseAndCheckUrl(rawUrl);
  const deadline: Deadline = { expired: false, idle: false };
  const timer = setTimeout(() => {
    deadline.expired = true;
    deadline.current?.destroy(
      new RemoteFetchError('사진을 받아오는 데 너무 오래 걸립니다(시간 초과).'),
    );
  }, TOTAL_TIMEOUT_MS);

  try {
    for (let hop = 0; ; hop += 1) {
      const r = await requestOnce(u, deadline);
      deadline.current = r.res;

      // ④ 리다이렉트 — 매 홉마다 ①②③ 를 다시 통과해야 한다
      if (r.status >= 300 && r.status < 400 && r.location) {
        r.res.resume(); // 본문은 버린다
        if (hop >= MAX_REDIRECTS) {
          throw new RemoteFetchError(`리다이렉트가 ${MAX_REDIRECTS}회를 넘었습니다.`);
        }
        // 상대 경로 Location 도 있다 — 현재 주소를 기준으로 푼다
        let next: URL;
        try {
          next = new URL(r.location, u);
        } catch {
          throw new RemoteFetchError('리다이렉트 주소를 해석할 수 없습니다.');
        }
        u = parseAndCheckUrl(next.toString());
        continue;
      }

      if (r.status !== 200) {
        r.res.resume();
        throw new RemoteFetchError(`사진 서버가 ${r.status} 로 답했습니다.`);
      }

      // ⑤ 형식 — image/* 인가, 그중 담을 수 있는 것인가
      const mime = r.contentType.split(';')[0].trim();
      if (!mime.startsWith('image/')) {
        r.res.resume();
        throw new RemoteFetchError(`사진이 아닙니다 — Content-Type: ${mime || '(없음)'}`);
      }
      const ext = EXT_BY_MIME[mime === 'image/jpg' ? 'image/jpeg' : mime];
      if (!ext) {
        r.res.resume();
        throw new RemoteFetchError(
          `${mime} 형식은 저장하지 않습니다 — png·jpeg·gif·webp 만 받습니다.`,
        );
      }
      // Content-Length 가 이미 상한을 넘는다면 받기 전에 끊는다(있을 때만)
      if (r.contentLength !== null && r.contentLength > cap) {
        r.res.resume();
        throw new RemoteFetchError(
          `사진이 너무 큽니다 — ${Math.round(cap / 1024 / 1024 * 10) / 10}MB 까지만 받아옵니다.`,
        );
      }

      const bytes = await readCapped(r.res, cap, deadline);
      if (!bytes.length) throw new RemoteFetchError('빈 응답입니다.');
      // 선언한 길이보다 **짧게** 끝난 응답은 잘린 사진이다. 대개는 Node 가
      // 먼저 'aborted' 로 끊어 주지만, 그것에만 기대지 않는다 — 깨진 그림이
      // 노드에 박히는 것은 못 받은 것보다 나쁘다.
      if (r.contentLength !== null && bytes.length < r.contentLength) {
        throw new RemoteFetchError('전송이 중간에 끊겼습니다(길이가 맞지 않습니다).');
      }

      const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 16);
      const realMime = mime === 'image/jpg' ? 'image/jpeg' : mime;
      return { bytes, mime: realMime, name: `img-${hash}.${ext}`, finalUrl: u.toString() };
    }
  } finally {
    clearTimeout(timer);
    deadline.current = undefined;
  }
}
