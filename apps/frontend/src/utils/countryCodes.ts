// countryCodes — 가입 화면의 휴대폰 국가번호 목록 (2026-08-09).
//
// **왜 목록을 두나**: 처음부터 Global 서비스를 염두에 둔 결정이라
// 번호를 `국가번호 + 번호` 두 칸으로 나눠 받는다. 한 칸에 통째로 받으면
// 나라마다 표기가 달라(0 을 떼는 나라·붙이는 나라) 나중에 SMS 인증을
// 붙일 때 서버가 국가를 되짚어야 한다.
//
// 목록은 **전부 넣지 않는다** — 200여 개를 나열하면 고르기가 더 어렵다.
// 한국을 맨 위에 두고, 이용자가 있을 법한 나라를 넣었다. 여기 없는
// 나라는 검색 칸에 숫자를 쳐서 찾을 수 있게 화면에서 처리한다
// (SignupForm 의 국가번호 선택 — 이름·번호 어느 쪽으로도 찾힌다).

export interface Country {
  /** ISO 3166-1 alpha-2 — 목록의 열쇠 */
  iso: string;
  /** 화면에 보이는 이름 (한국어) */
  name: string;
  /** 국가번호 — '+' 없이 숫자만 담고 화면에서 + 를 붙인다 */
  dial: string;
  flag: string;
}

export const COUNTRIES: Country[] = [
  { iso: 'KR', name: '대한민국', dial: '82', flag: '🇰🇷' },
  { iso: 'US', name: '미국', dial: '1', flag: '🇺🇸' },
  { iso: 'JP', name: '일본', dial: '81', flag: '🇯🇵' },
  { iso: 'CN', name: '중국', dial: '86', flag: '🇨🇳' },
  { iso: 'TW', name: '대만', dial: '886', flag: '🇹🇼' },
  { iso: 'HK', name: '홍콩', dial: '852', flag: '🇭🇰' },
  { iso: 'SG', name: '싱가포르', dial: '65', flag: '🇸🇬' },
  { iso: 'VN', name: '베트남', dial: '84', flag: '🇻🇳' },
  { iso: 'TH', name: '태국', dial: '66', flag: '🇹🇭' },
  { iso: 'ID', name: '인도네시아', dial: '62', flag: '🇮🇩' },
  { iso: 'MY', name: '말레이시아', dial: '60', flag: '🇲🇾' },
  { iso: 'PH', name: '필리핀', dial: '63', flag: '🇵🇭' },
  { iso: 'IN', name: '인도', dial: '91', flag: '🇮🇳' },
  { iso: 'AU', name: '호주', dial: '61', flag: '🇦🇺' },
  { iso: 'NZ', name: '뉴질랜드', dial: '64', flag: '🇳🇿' },
  { iso: 'GB', name: '영국', dial: '44', flag: '🇬🇧' },
  { iso: 'DE', name: '독일', dial: '49', flag: '🇩🇪' },
  { iso: 'FR', name: '프랑스', dial: '33', flag: '🇫🇷' },
  { iso: 'IT', name: '이탈리아', dial: '39', flag: '🇮🇹' },
  { iso: 'ES', name: '스페인', dial: '34', flag: '🇪🇸' },
  { iso: 'NL', name: '네덜란드', dial: '31', flag: '🇳🇱' },
  { iso: 'SE', name: '스웨덴', dial: '46', flag: '🇸🇪' },
  { iso: 'CH', name: '스위스', dial: '41', flag: '🇨🇭' },
  { iso: 'CA', name: '캐나다', dial: '1', flag: '🇨🇦' },
  { iso: 'BR', name: '브라질', dial: '55', flag: '🇧🇷' },
  { iso: 'MX', name: '멕시코', dial: '52', flag: '🇲🇽' },
  { iso: 'AE', name: '아랍에미리트', dial: '971', flag: '🇦🇪' },
  { iso: 'SA', name: '사우디아라비아', dial: '966', flag: '🇸🇦' },
  { iso: 'TR', name: '튀르키예', dial: '90', flag: '🇹🇷' },
  { iso: 'RU', name: '러시아', dial: '7', flag: '🇷🇺' },
  { iso: 'ZA', name: '남아프리카공화국', dial: '27', flag: '🇿🇦' },
];

export const DEFAULT_COUNTRY = COUNTRIES[0]; // 대한민국

/** 이름·ISO·번호 어느 쪽으로 쳐도 찾힌다 ('한국'·'kr'·'82') */
export function findCountries(q: string): Country[] {
  const s = q.trim().toLowerCase().replace(/^\+/, '');
  if (!s) return COUNTRIES;
  return COUNTRIES.filter(
    (c) => c.name.toLowerCase().includes(s)
      || c.iso.toLowerCase().includes(s)
      || c.dial.startsWith(s),
  );
}

/**
 * 보기 좋게 끊어 준다 — **한국 번호만** 규칙이 확실해서 끊고, 다른
 * 나라는 손대지 않는다. 나라마다 자릿수·묶음이 달라서 어설프게
 * 끊으면 오히려 잘못된 번호처럼 보인다.
 */
export function formatPhone(dial: string, digits: string): string {
  const d = digits.replace(/\D/g, '');
  if (dial !== '82') return d;
  if (d.length <= 3) return d;
  if (d.length <= 7) return `${d.slice(0, 3)}-${d.slice(3)}`;
  if (d.length <= 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7, 11)}`;
}
