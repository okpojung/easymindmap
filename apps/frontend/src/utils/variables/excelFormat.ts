// 엑셀 셀 서식 (2026-10-29 사용자 요청: "서식: excel 셀서식 동일하게 적용").
//
// 지원하는 것 (엑셀 사용자 지정 서식의 흔히 쓰는 부분):
//   · 구역 ;  — 양수;음수;0;글자 (조건 [>100] 은 무시)
//   · 숫자 0 # ? . , %  — 자릿수·천 단위 쉼표·소수·백분율(×100), 끝의 쉼표는 1000 으로 나눔
//   · 지수 E+00 / E-00
//   · 글자 "…" \x _x(공백) *x(무시) @ — 그 밖의 기호(₩ $ - + / ( ) : 공백 등)와 한글도 글자 그대로
//   · 날짜·시간 yyyy yy m mm mmm mmmm d dd ddd dddd aaa aaaa h hh m mm(분) s ss AM/PM 오전/오후 [h] [m] [s]
//   · [DBNum1] 一二三 · [DBNum2] 壹貳參 · [DBNum3] 전각 숫자 · [DBNum4] 한글(일만이천…)
//   · [Red] 같은 색 · [$₩-412] 같은 통화 표시 — 색은 무시, 통화는 기호만
//   · General · G/표준 — 일반
// 날짜·시간 값은 엑셀과 같이 **일련번호**(1899-12-30 = 0, 하루 = 1)다.

export type CellValue = number | string | boolean | null;

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const KDAYS = ['일','월','화','수','목','금','토'];

/** 구역 나누기 — 따옴표·[ ]·\ 안의 ; 는 구분자가 아니다 */
function splitSections(fmt: string): string[] {
  const out: string[] = []; let cur = ''; let q = false; let br = false;
  for (let i = 0; i < fmt.length; i++) {
    const c = fmt[i];
    if (q) { cur += c; if (c === '"') q = false; continue; }
    if (c === '\\') { cur += c + (fmt[i + 1] ?? ''); i++; continue; }
    if (c === '"') { q = true; cur += c; continue; }
    if (c === '[') br = true; else if (c === ']') br = false;
    if (c === ';' && !br) { out.push(cur); cur = ''; continue; }
    cur += c;
  }
  out.push(cur);
  return out;
}

type Tok =
  | { k: 'lit'; s: string }
  | { k: 'num'; s: string }          // 0 # ? , . 덩어리 문자 하나
  | { k: 'pct' }
  | { k: 'exp'; sign: '+' | '-' }
  | { k: 'at' }
  | { k: 'date'; s: string }         // yyyy, mm, d, h, ss, AM/PM ...
  | { k: 'elapsed'; s: string }      // [h] [mm] [ss]
  | { k: 'general' };

interface Section { toks: Tok[]; dbnum: number; isDate: boolean; hasNum: boolean; hasAt: boolean; general: boolean; cond?: string }

function tokenize(sec: string): Section {
  const toks: Tok[] = []; let dbnum = 0; let cond: string | undefined;
  const lit = (s: string) => { const last = toks[toks.length - 1]; if (last && last.k === 'lit') last.s += s; else toks.push({ k: 'lit', s }); };
  let i = 0;
  const lower = sec.toLowerCase();
  while (i < sec.length) {
    const c = sec[i];
    const rest = lower.slice(i);
    if (c === '"') { const j = sec.indexOf('"', i + 1); lit(sec.slice(i + 1, j < 0 ? sec.length : j)); i = j < 0 ? sec.length : j + 1; continue; }
    if (c === '\\') { lit(sec[i + 1] ?? ''); i += 2; continue; }
    if (c === '_') { lit(' '); i += 2; continue; }
    if (c === '*') { i += 2; continue; }
    if (c === '[') {
      const j = sec.indexOf(']', i);
      const inner = sec.slice(i + 1, j < 0 ? sec.length : j);
      const il = inner.toLowerCase();
      const m = /^dbnum([1-4])$/.exec(il);
      if (m) dbnum = Number(m[1]);
      else if (/^h+$|^m+$|^s+$/.test(il)) toks.push({ k: 'elapsed', s: il });
      else if (inner.startsWith('$')) lit(inner.slice(1).split('-')[0]);
      else if (/^[<>=]/.test(inner)) cond = inner;
      // 색 이름 등은 무시
      i = j < 0 ? sec.length : j + 1; continue;
    }
    if (rest.startsWith('general')) { toks.push({ k: 'general' }); i += 7; continue; }
    if (rest.startsWith('g/표준')) { toks.push({ k: 'general' }); i += 4; continue; }
    if (rest.startsWith('am/pm')) { toks.push({ k: 'date', s: 'ampm' }); i += 5; continue; }
    if (rest.startsWith('a/p')) { toks.push({ k: 'date', s: 'ap' }); i += 3; continue; }
    if (sec.startsWith('오전/오후', i)) { toks.push({ k: 'date', s: 'kampm' }); i += 5; continue; }
    if ((c === 'E' || c === 'e') && (sec[i + 1] === '+' || sec[i + 1] === '-')) { toks.push({ k: 'exp', sign: sec[i + 1] as '+' | '-' }); i += 2; continue; }
    if ('0#?.,'.includes(c)) { toks.push({ k: 'num', s: c }); i++; continue; }
    if (c === '%') { toks.push({ k: 'pct' }); i++; continue; }
    if (c === '@') { toks.push({ k: 'at' }); i++; continue; }
    const lc = c.toLowerCase();
    if ('ymdhsa'.includes(lc)) {
      let j = i; while (j < sec.length && sec[j].toLowerCase() === lc) j++;
      const run = lower.slice(i, j);
      if (lc === 'a' && run.length < 3) { lit(sec.slice(i, j)); i = j; continue; }
      toks.push({ k: 'date', s: run }); i = j; continue;
    }
    lit(c); i++;
  }
  // m/mm 이 분인가 — 바로 앞 날짜 토큰이 h 거나 바로 뒤가 s 면 분
  const dIdx = toks.map((t, k) => (t.k === 'date' || t.k === 'elapsed' ? k : -1)).filter((k) => k >= 0);
  for (let n = 0; n < dIdx.length; n++) {
    const t = toks[dIdx[n]] as { k: 'date'; s: string };
    if (t.k !== 'date' || !/^m{1,2}$/.test(t.s)) continue;
    const prev = n > 0 ? (toks[dIdx[n - 1]] as { s: string }).s : '';
    const next = n + 1 < dIdx.length ? (toks[dIdx[n + 1]] as { s: string }).s : '';
    if (/^h/.test(prev) || /^s/.test(next)) t.s = t.s === 'm' ? 'M' : 'MM'; // 분
  }
  const isDate = toks.some((t) => t.k === 'date' || t.k === 'elapsed');
  return {
    toks, dbnum, cond, isDate,
    hasNum: toks.some((t) => t.k === 'num' && '0#?'.includes(t.s)),
    hasAt: toks.some((t) => t.k === 'at'),
    general: toks.some((t) => t.k === 'general'),
  };
}

// ── 일반(General) ──────────────────────────────────────────────────────
export function generalNumber(n: number): string {
  if (!Number.isFinite(n)) return '#NUM!';
  if (Number.isInteger(n) && Math.abs(n) < 1e11) return String(n);
  const a = Math.abs(n);
  if (a !== 0 && (a >= 1e11 || a < 1e-9)) return n.toExponential(5).replace(/\.?0+e/, 'E').replace('E+', 'E+').replace(/E(-?)(\d)$/, 'E$10$2');
  return String(Number(n.toPrecision(10)));
}

// ── 한자·한글 숫자 ──────────────────────────────────────────────────────
const SETS: Record<number, { d: string[]; small: string[]; big: string[] }> = {
  1: { d: ['〇','一','二','三','四','五','六','七','八','九'], small: ['', '十', '百', '千'], big: ['', '万', '億', '兆'] },
  2: { d: ['零','壹','貳','參','四','伍','六','七','八','九'], small: ['', '拾', '百', '阡'], big: ['', '萬', '億', '兆'] },
  4: { d: ['영','일','이','삼','사','오','육','칠','팔','구'], small: ['', '십', '백', '천'], big: ['', '만', '억', '조'] },
};
function readInteger(n: number, set: number): string {
  const S = SETS[set];
  if (n === 0) return S.d[0];
  const digits = String(Math.floor(Math.abs(n)));
  const groups: string[] = [];
  for (let e = digits.length; e > 0; e -= 4) groups.unshift(digits.slice(Math.max(0, e - 4), e));
  let out = '';
  groups.forEach((g, gi) => {
    const bigIdx = groups.length - 1 - gi;
    let part = '';
    const p = g.padStart(4, '0');
    for (let k = 0; k < 4; k++) {
      const dv = Number(p[k]); if (!dv) continue;
      const pos = 3 - k;
      // 한글·한자 읽기는 십·백·천 앞의 '일' 을 생략한다 (일십 → 십)
      part += (dv === 1 && pos > 0 ? '' : S.d[dv]) + S.small[pos];
    }
    if (part) out += part + S.big[bigIdx];
  });
  return out;
}
function dbnumText(s: string, set: number): string {
  if (set === 3) return s.replace(/[0-9]/g, (d) => String.fromCharCode(0xFF10 + Number(d)));
  // 숫자 덩어리를 읽는다 (천 단위 쉼표는 떼고). 소수부는 자리마다 읽는다
  return s.replace(/(\d),(?=\d{3})/g, '$1').replace(/\d+(?:\.\d+)?/g, (m) => {
    const [ip, fp] = m.split('.');
    let r = readInteger(Number(ip), set);
    if (fp) r += (set === 4 ? '점' : '.') + Array.from(fp, (d) => SETS[set].d[Number(d)]).join('');
    return r;
  });
}

// ── 숫자 서식 ───────────────────────────────────────────────────────────
function formatNumberSection(n: number, sec: Section): string {
  const toks = sec.toks;
  let v = n;
  const pctCount = toks.filter((t) => t.k === 'pct').length;
  for (let k = 0; k < pctCount; k++) v *= 100;
  const expIdx = toks.findIndex((t) => t.k === 'exp');
  // 숫자 부분 — 첫 숫자 기호부터 마지막 숫자 기호까지 (지수 앞)
  const numIdx = toks.map((t, k) => (t.k === 'num' ? k : -1)).filter((k) => k >= 0 && (expIdx < 0 || k < expIdx));
  const first = numIdx[0]; const last = numIdx[numIdx.length - 1];
  const dotIdx = toks.findIndex((t, k) => t.k === 'num' && t.s === '.' && k >= first && k <= last);
  // 끝의 쉼표 = 1000 으로 나누기 (소수점 또는 숫자 부분 끝 바로 앞)
  const endAt = dotIdx >= 0 ? dotIdx : last + 1;
  let scale = 0;
  for (let k = endAt - 1; k >= first; k--) { const t = toks[k]; if (t.k === 'num' && t.s === ',') scale++; else break; }
  for (let k = 0; k < scale; k++) v /= 1000;
  const intToks = toks.slice(first, endAt - scale).map((t, k) => ({ t, k: k + first }));
  const fracToks = dotIdx >= 0 ? toks.slice(dotIdx + 1, last + 1).map((t, k) => ({ t, k: k + dotIdx + 1 })) : [];
  const fracPh = fracToks.filter((x) => x.t.k === 'num' && '0#?'.includes((x.t as { s: string }).s)).length;
  const thousands = intToks.some((x) => x.t.k === 'num' && (x.t as { s: string }).s === ',');
  let expStr = '';
  if (expIdx >= 0) {
    const expDigits = toks.slice(expIdx + 1).filter((t) => t.k === 'num' && '0#?'.includes(t.s)).length || 1;
    const intPh = Math.max(1, intToks.filter((x) => x.t.k === 'num' && '0#?'.includes((x.t as { s: string }).s)).length);
    let e = v === 0 ? 0 : Math.floor(Math.log10(Math.abs(v))) - (intPh - 1);
    let m = v / Math.pow(10, e);
    if (Number(Math.abs(m).toFixed(fracPh)) >= Math.pow(10, intPh)) { m /= 10; e += 1; }
    v = m;
    expStr = 'E' + (e < 0 ? '-' : (toks[expIdx] as { sign: string }).sign === '+' ? '+' : '') + String(Math.abs(e)).padStart(expDigits, '0');
  }
  const abs = Math.abs(v);
  const fixed = abs.toFixed(Math.min(20, fracPh));
  let [ip, fp = ''] = fixed.split('.');
  // 정수 자리 채우기 — 자리 기호를 오른쪽부터, 남는 앞자리 숫자는 첫 기호에 몰아 준다
  const intPhs = intToks.filter((x) => x.t.k === 'num' && '0#?'.includes((x.t as { s: string }).s));
  const minDigits = intPhs.length ? intPhs.length - intPhs.findIndex((x) => (x.t as { s: string }).s !== '#') : 0;
  if (ip === '0' && intPhs.length && intPhs.every((x) => (x.t as { s: string }).s === '#')) ip = '';
  if (thousands) ip = ip.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  void minDigits;
  let intOut = '';
  {
    // 오른쪽부터 숫자를 자리 기호에 앉힌다 (쉼표 기호는 위에서 이미 넣었다)
    const chars = Array.from(ip);
    let ci = chars.length - 1;
    const pieces: string[] = [];
    const items = intToks.filter((x) => !(x.t.k === 'num' && (x.t as { s: string }).s === ','));
    for (let k = items.length - 1; k >= 0; k--) {
      const t = items[k].t;
      if (t.k === 'num') {
        const ph = t.s;
        // 이 자리에 앉을 글자 (쉼표는 숫자에 딸려 온다)
        let piece = '';
        while (ci >= 0 && chars[ci] === ',') { piece = ',' + piece; ci--; }
        if (ci >= 0) { piece = chars[ci] + piece; ci--; }
        else piece = ph === '0' ? '0' : ph === '?' ? ' ' : '';
        // 첫 자리 기호면 남은 앞자리를 모두 붙인다
        const isFirst = !items.slice(0, k).some((x) => x.t.k === 'num');
        if (isFirst && ci >= 0) { piece = chars.slice(0, ci + 1).join('') + piece; ci = -1; }
        pieces.unshift(piece);
      } else if (t.k === 'lit') pieces.unshift(t.s);
      else if (t.k === 'pct') pieces.unshift('%');
    }
    intOut = pieces.join('');
  }
  // 소수 자리 — 뒤의 # 은 0 을 지운다, ? 는 공백
  let fracOut = '';
  if (dotIdx >= 0) {
    const fd = Array.from(fp);
    let fi = 0; const pieces: string[] = [];
    for (const x of fracToks) {
      const t = x.t;
      if (t.k === 'num' && '0#?'.includes(t.s)) pieces.push(fd[fi++] ?? (t.s === '0' ? '0' : ''));
      else if (t.k === 'lit') pieces.push(t.s);
      else if (t.k === 'pct') pieces.push('%');
    }
    // 끝에서부터 # 자리의 0 지우기
    const phs = fracToks.filter((x) => x.t.k === 'num' && '0#?'.includes((x.t as { s: string }).s)).map((x) => (x.t as { s: string }).s);
    let p = 0; const map: number[] = [];
    fracToks.forEach((x, k) => { if (x.t.k === 'num' && '0#?'.includes((x.t as { s: string }).s)) map[p++] = k; });
    for (let q = phs.length - 1; q >= 0; q--) {
      if (phs[q] === '0') break;
      const idx = map[q];
      if (pieces[idx] === '0') pieces[idx] = phs[q] === '?' ? ' ' : ''; else break;
    }
    fracOut = '.' + pieces.join('');
  }
  // 앞·뒤 글자
  const before = toks.slice(0, first).map((t) => (t.k === 'lit' ? t.s : t.k === 'pct' ? '%' : t.k === 'at' ? '' : '')).join('');
  const after = toks.slice(last + 1).filter((t) => t.k !== 'exp' && !(t.k === 'num')).map((t) => (t.k === 'lit' ? t.s : t.k === 'pct' ? '%' : '')).join('');
  const expTail = expIdx >= 0 ? expStr : '';
  let out = before + intOut + fracOut + expTail + after;
  if (sec.dbnum) out = dbnumText(out, sec.dbnum);
  return out;
}

// ── 날짜·시간 ───────────────────────────────────────────────────────────
/** 엑셀 일련번호 ↔ 날짜 (UTC 로 계산 — 시간대에 흔들리지 않게) */
export function serialToParts(serial: number) {
  const ms = Math.round(serial * 86400000);
  const d = new Date(Date.UTC(1899, 11, 30) + ms);
  return { y: d.getUTCFullYear(), mo: d.getUTCMonth() + 1, d: d.getUTCDate(), wd: d.getUTCDay(), h: d.getUTCHours(), mi: d.getUTCMinutes(), s: d.getUTCSeconds() };
}
export function partsToSerial(y: number, mo: number, d: number, h = 0, mi = 0, s = 0): number {
  return (Date.UTC(y, mo - 1, d, h, mi, s) - Date.UTC(1899, 11, 30)) / 86400000;
}

function formatDateSection(serial: number, sec: Section): string {
  const p = serialToParts(serial);
  const hasAmPm = sec.toks.some((t) => t.k === 'date' && /ampm|ap|kampm/.test(t.s));
  const p2 = (n: number) => String(n).padStart(2, '0');
  let out = '';
  for (const t of sec.toks) {
    if (t.k === 'lit') { out += t.s; continue; }
    if (t.k === 'elapsed') {
      const totalS = Math.round(serial * 86400);
      out += t.s[0] === 'h' ? String(Math.floor(totalS / 3600)).padStart(t.s.length, '0')
        : t.s[0] === 'm' ? String(Math.floor(totalS / 60)).padStart(t.s.length, '0')
          : String(totalS).padStart(t.s.length, '0');
      continue;
    }
    if (t.k === 'num') { out += t.s === '.' ? '.' : ''; continue; }
    if (t.k !== 'date') continue;
    const h12 = p.h % 12 === 0 ? 12 : p.h % 12;
    switch (t.s) {
      case 'yyyy': case 'yyy': out += String(p.y); break;
      case 'yy': case 'y': out += p2(p.y % 100); break;
      case 'm': out += String(p.mo); break;
      case 'mm': out += p2(p.mo); break;
      case 'mmm': out += MONTHS[p.mo - 1].slice(0, 3); break;
      case 'mmmm': out += MONTHS[p.mo - 1]; break;
      case 'mmmmm': out += MONTHS[p.mo - 1][0]; break;
      case 'M': out += String(p.mi); break;
      case 'MM': out += p2(p.mi); break;
      case 'd': out += String(p.d); break;
      case 'dd': out += p2(p.d); break;
      case 'ddd': out += DAYS[p.wd].slice(0, 3); break;
      case 'dddd': out += DAYS[p.wd]; break;
      case 'aaa': out += KDAYS[p.wd]; break;
      case 'aaaa': out += KDAYS[p.wd] + '요일'; break;
      case 'h': out += String(hasAmPm ? h12 : p.h); break;
      case 'hh': out += p2(hasAmPm ? h12 : p.h); break;
      case 's': out += String(p.s); break;
      case 'ss': out += p2(p.s); break;
      case 'ampm': out += p.h < 12 ? 'AM' : 'PM'; break;
      case 'ap': out += p.h < 12 ? 'A' : 'P'; break;
      case 'kampm': out += p.h < 12 ? '오전' : '오후'; break;
      default: out += t.s;
    }
  }
  return sec.dbnum ? dbnumText(out, sec.dbnum) : out;
}

/**
 * 값을 서식대로. 숫자가 아닌 글자는 글자 구역(4번째 또는 @ 가 있는 구역)으로,
 * 없으면 글자 그대로. 논리값은 TRUE/FALSE. 오류(#DIV/0! 등)는 그대로.
 */
export function formatCell(value: CellValue, fmt?: string | null): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  const f = (fmt ?? '').trim();
  const secs = splitSections(f || 'General').map(tokenize);
  if (typeof value === 'string') {
    if (value.startsWith('#')) return value; // 오류
    const textSec = secs.length >= 4 ? secs[3] : secs.find((s) => s.hasAt);
    if (!textSec) return value;
    let out = textSec.toks.map((t) => (t.k === 'lit' ? t.s : t.k === 'at' ? value : '')).join('');
    if (textSec.dbnum) out = dbnumText(out, textSec.dbnum);
    return out;
  }
  if (!Number.isFinite(value)) return '#NUM!';
  let sec = secs[0]; let n = value; let neg = false;
  if (secs[0].cond || (secs[1] && secs[1].cond)) {
    // 조건 구역 — [>=100] 처럼 단순 비교만
    const test = (c?: string) => {
      if (!c) return false;
      const m = /^(<=|>=|<>|<|>|=)\s*(-?\d+(?:\.\d+)?)$/.exec(c.trim()); if (!m) return false;
      const x = Number(m[2]);
      return m[1] === '<' ? n < x : m[1] === '<=' ? n <= x : m[1] === '>' ? n > x : m[1] === '>=' ? n >= x : m[1] === '=' ? n === x : n !== x;
    };
    sec = test(secs[0].cond) ? secs[0] : test(secs[1]?.cond) ? secs[1] : (secs[2] ?? secs[secs.length - 1]);
    neg = n < 0 && !sec.toks.some((t) => t.k === 'lit' && t.s.includes('-'));
    n = Math.abs(n);
  } else if (n < 0 && secs.length >= 2) { sec = secs[1]; n = -n; }
  else if (n === 0 && secs.length >= 3) sec = secs[2];
  else if (n < 0) { neg = true; n = -n; }
  let out: string;
  if (sec.general || (!sec.hasNum && !sec.isDate)) {
    const g = generalNumber(n);
    out = sec.general
      ? sec.toks.map((t) => (t.k === 'general' ? g : t.k === 'lit' ? t.s : t.k === 'pct' ? '%' : '')).join('')
      : (sec.toks.length ? sec.toks.map((t) => (t.k === 'lit' ? t.s : '')).join('') : g);
    if (sec.dbnum) out = dbnumText(out, sec.dbnum);
  } else if (sec.isDate) {
    out = formatDateSection(neg ? -n : n, sec); neg = false;
  } else out = formatNumberSection(n, sec);
  // 날짜가 아닌데 결과가 0 으로만 남은 음수(예: -0.4 → "0")는 부호를 붙이지 않는다 (엑셀과 같다)
  if (neg && /[1-9]/.test(out)) out = '-' + out;
  return out;
}

/** 전화번호 — 서식이 비면 한국 번호 자동 하이픈, 0 자리 기호가 있으면 숫자를 앉힌다 (앞 0 보존) */
export function formatPhone(raw: string, fmt?: string | null): string {
  const digits = String(raw ?? '').replace(/\D/g, '');
  const f = (fmt ?? '').trim();
  if (!digits) return String(raw ?? '');
  if (f && /[0#]/.test(f)) {
    const ph = (f.match(/[0#]/g) ?? []).length;
    const ds = digits.padStart(ph, '0').split('');
    let extra = ds.length - ph;
    let out = '';
    let first = true;
    for (const c of f) {
      if (c === '0' || c === '#') {
        if (first && extra > 0) { out += ds.splice(0, extra + 1).join(''); extra = 0; }
        else out += ds.shift() ?? '';
        first = false;
      } else if (c !== '"') out += c;
    }
    return out;
  }
  if (/^02/.test(digits)) return digits.length <= 9 ? digits.replace(/^(02)(\d{3})(\d{4})$/, '$1-$2-$3') : digits.replace(/^(02)(\d{4})(\d{4})$/, '$1-$2-$3');
  if (digits.length === 11) return digits.replace(/^(\d{3})(\d{4})(\d{4})$/, '$1-$2-$3');
  if (digits.length === 10) return digits.replace(/^(\d{3})(\d{3})(\d{4})$/, '$1-$2-$3');
  if (digits.length === 8) return digits.replace(/^(\d{4})(\d{4})$/, '$1-$2');
  return String(raw);
}
