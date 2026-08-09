// clientInfo — 지금 이 브라우저의 **플랫폼**과 **브라우저 종류**를 알아낸다
// (2026-08-09: 히스토리에 "어디서 저장했는지"를 남기려고 도입).
//
// 왜 프런트가 알아내는가 — User-Agent 문자열만으로는 **Windows 10 과 11 을
// 구분할 수 없다**. 둘 다 'Windows NT 10.0' 으로 온다(마이크로소프트가
// 호환성 때문에 그대로 뒀다). 실제 버전은 브라우저의
// **User-Agent Client Hints**(navigator.userAgentData.getHighEntropyValues)
// 로만 알 수 있고, 이건 스크립트에서만 물어볼 수 있다. 그래서 프런트가
// 물어보고 서버에 알려 주며, 서버는 못 받았을 때만 UA 로 추정한다.
//
// IP 는 여기서 만들지 않는다 — 서버가 요청에서 직접 읽는다(위조 방지).

export interface ClientInfo {
  platform?: string; // 'Windows 11' · 'Android 14' · 'iOS 17' · 'macOS 14'
  browser?: string; // 'Chrome 126' · 'Edge 126' · 'Safari 17'
}

interface UADataBrand { brand: string; version: string }
interface UAData {
  brands?: UADataBrand[];
  platform?: string;
  getHighEntropyValues?: (hints: string[]) => Promise<{
    platform?: string;
    platformVersion?: string;
    fullVersionList?: UADataBrand[];
    uaFullVersion?: string;
  }>;
}

/**
 * 위장(GREASE) 브랜드인가 — 크로미움은 "이 목록을 순진하게 파싱하지 마라"고
 * 일부러 가짜 항목을 하나 끼워 넣는다. **구두점이 실행할 때마다 달라진다**:
 * `Not)A;Brand` · `Not;A=Brand` · `Not_A Brand` · `;Not A Brand` · `Not/A(Brand` …
 *
 * 그래서 구두점을 나열해 걸러내면 언젠가 새는 조합이 나온다 — 실제로
 * 안드로이드에서 `Not;A=Brand 8` 이 브라우저 이름으로 저장됐다(2026-08-09
 * 사용자 보고. `=` 가 목록에 없었다). **글자·숫자만 남겨** 비교한다.
 */
export function isGreaseBrand(brand: string): boolean {
  const s = brand.replace(/[^a-z0-9]/gi, '').toLowerCase();
  return s.includes('not') && s.includes('brand');
}

// 진짜 브라우저 이름을 고른다. 크로미움 계열은 Chromium 도 함께 오는데,
// Edge·Whale 같은 파생 브라우저가 있으면 그쪽이 사용자가 아는 이름이다.
function pickBrand(brands: UADataBrand[] | undefined): UADataBrand | undefined {
  if (!brands?.length) return undefined;
  const real = brands.filter((b) => !isGreaseBrand(b.brand));
  return real.find((b) => !/^chromium$/i.test(b.brand)) ?? real[0];
}

// Windows 는 Client Hints 의 platformVersion 으로 세대를 가른다 —
// 마이크로소프트 문서 기준: 13 이상 = Windows 11, 1~12 = Windows 10.
function windowsLabel(platformVersion: string | undefined): string {
  const major = Number(String(platformVersion ?? '').split('.')[0]);
  if (!Number.isFinite(major)) return 'Windows';
  if (major >= 13) return 'Windows 11';
  if (major >= 1) return 'Windows 10';
  return 'Windows 7/8'; // 0.x = Windows 8.1 이하
}

function major(v: string | undefined): string {
  const m = /^(\d+)/.exec(String(v ?? ''));
  return m ? m[1] : '';
}

/** UA 문자열만으로 추정 — Client Hints 를 못 쓰는 브라우저(사파리·파이어폭스) */
export function fromUserAgent(ua: string): ClientInfo {
  const out: ClientInfo = {};
  let m = /Windows NT ([\d.]+)/.exec(ua);
  if (m) {
    // UA 로는 10 과 11 이 갈리지 않는다 — 아는 척하지 않고 그대로 적는다
    out.platform =
      m[1] === '10.0' ? 'Windows 10/11'
        : m[1] === '6.3' ? 'Windows 8.1'
          : m[1] === '6.2' ? 'Windows 8'
            : m[1] === '6.1' ? 'Windows 7' : 'Windows';
  } else if ((m = /Android (\d+)/.exec(ua))) {
    out.platform = 'Android ' + m[1];
  } else if ((m = /(?:iPhone|iPad|iPod).*?OS (\d+)[._]/.exec(ua))) {
    out.platform = 'iOS ' + m[1];
  } else if (/\biPhone\b|\biPad\b/.test(ua)) {
    out.platform = 'iOS';
  } else if (/CrOS/.test(ua)) {
    out.platform = 'ChromeOS';
  } else if (/Mac OS X|Macintosh/.test(ua)) {
    // macOS 의 UA 버전은 10_15_7 에 얼어 있어(고정) 믿을 수 없다
    out.platform = 'macOS';
  } else if (/Linux/.test(ua)) {
    out.platform = 'Linux';
  }

  // 순서가 중요하다 — 파생 브라우저가 Chrome/Safari 를 함께 달고 온다
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
    const hit = re.exec(ua);
    if (hit) { out.browser = `${name} ${hit[1]}`; break; }
  }
  if (!out.browser && /Safari/.test(ua)) out.browser = 'Safari';
  return out;
}

let cached: Promise<ClientInfo> | null = null;

/**
 * 이 브라우저의 플랫폼·브라우저. **세션당 한 번만** 물어보고 캐시한다
 * (Client Hints 조회는 비동기라 저장 경로에서 매번 하면 낭비다).
 */
export function getClientInfo(): Promise<ClientInfo> {
  if (cached) return cached;
  cached = (async () => {
    const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent || '';
    const base = fromUserAgent(ua);
    const uad = (navigator as unknown as { userAgentData?: UAData })?.userAgentData;
    if (!uad?.getHighEntropyValues) return base;
    try {
      const hi = await uad.getHighEntropyValues([
        'platform', 'platformVersion', 'fullVersionList',
      ]);
      const plat = hi.platform || uad.platform || '';
      if (plat === 'Windows') base.platform = windowsLabel(hi.platformVersion);
      else if (plat === 'Android') base.platform = ('Android ' + major(hi.platformVersion)).trim();
      else if (plat === 'macOS') base.platform = ('macOS ' + major(hi.platformVersion)).trim();
      else if (plat === 'Chrome OS' || plat === 'Chromium OS') base.platform = 'ChromeOS';
      else if (plat) base.platform = plat;

      const brand = pickBrand(hi.fullVersionList ?? uad.brands);
      if (brand) {
        // 'Google Chrome' · 'Microsoft Edge' → 사람이 부르는 짧은 이름
        const name = brand.brand.replace(/^(Google|Microsoft)\s+/, '');
        base.browser = `${name} ${major(brand.version)}`.trim();
      }
    } catch {
      // 권한·정책으로 막히면 UA 추정값을 그대로 쓴다
    }
    return base;
  })();
  return cached;
}
