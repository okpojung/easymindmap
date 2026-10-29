// 수식 (2026-10-29 사용자 요청: "a * (b + c), sum(a,b,c), price * 10% 등 — 함수는 엑셀 함수").
//
//   · 맨 앞 = 는 있어도 없어도 된다
//   · 연산 (엑셀 우선순위): 단항 - → % → ^ → * / → + - → & (글자 잇기) → = <> < > <= >=
//   · 값: 숫자 · "글자" · TRUE/FALSE · 변수 이름(같은 맵의 다른 변수) · 함수(인수, …)
//   · 함수 이름은 대소문자를 가리지 않는다. 변수 이름은 가린다(varSyntax 규칙)
//   · 오류는 엑셀과 같은 글자: #DIV/0! #VALUE! #NAME? #REF!(순환 참조) #N/A #NUM!
// 날짜·시간은 엑셀처럼 일련번호(숫자)다 — 서식이 날짜면 날짜로 보인다.

import { formatCell, partsToSerial, serialToParts, type CellValue } from './excelFormat';

export class FErr { constructor(public code: string) {} toString() { return this.code; } }
export type FVal = number | string | boolean | FErr;
type Node =
  | { t: 'num'; v: number } | { t: 'str'; v: string } | { t: 'bool'; v: boolean }
  | { t: 'ref'; name: string } | { t: 'fn'; name: string; args: Node[] }
  | { t: 'un'; op: string; a: Node } | { t: 'pct'; a: Node } | { t: 'bin'; op: string; a: Node; b: Node };

const NAME_START = /[A-Za-z_\uAC00-\uD7A3]/;
const NAME_CHAR = /[A-Za-z0-9_.\uAC00-\uD7A3]/;

function tokenize(src: string): string[] {
  const s = src.trim().replace(/^=/, '');
  const out: string[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9.]/.test(c)) { const m = /^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(s.slice(i)); if (!m) throw new FErr('#VALUE!'); out.push(m[0]); i += m[0].length; continue; }
    if (c === '"') { let j = i + 1; let str = ''; while (j < s.length) { if (s[j] === '"') { if (s[j + 1] === '"') { str += '"'; j += 2; continue; } break; } str += s[j++]; } out.push('"' + str); i = j + 1; continue; }
    if (NAME_START.test(c)) { let j = i; while (j < s.length && NAME_CHAR.test(s[j])) j++; out.push(s.slice(i, j)); i = j; continue; }
    const two = s.slice(i, i + 2);
    if (two === '<=' || two === '>=' || two === '<>') { out.push(two); i += 2; continue; }
    if ('+-*/^&=<>(),%;'.includes(c)) { out.push(c === ';' ? ',' : c); i++; continue; }
    throw new FErr('#NAME?');
  }
  return out;
}

export function parseFormula(src: string): Node {
  const tk = tokenize(src);
  let p = 0;
  const peek = () => tk[p];
  const eat = (x?: string) => { const v = tk[p++]; if (x !== undefined && v !== x) throw new FErr('#NAME?'); return v; };
  const cmp = (): Node => { let a = cat(); while (['=', '<>', '<', '>', '<=', '>='].includes(peek())) { const op = eat(); a = { t: 'bin', op, a, b: cat() }; } return a; };
  const cat = (): Node => { let a = add(); while (peek() === '&') { eat(); a = { t: 'bin', op: '&', a, b: add() }; } return a; };
  const add = (): Node => { let a = mul(); while (peek() === '+' || peek() === '-') { const op = eat(); a = { t: 'bin', op, a, b: mul() }; } return a; };
  const mul = (): Node => { let a = pow(); while (peek() === '*' || peek() === '/') { const op = eat(); a = { t: 'bin', op, a, b: pow() }; } return a; };
  const pow = (): Node => { let a = post(); while (peek() === '^') { eat(); a = { t: 'bin', op: '^', a, b: post() }; } return a; };
  const post = (): Node => { let a = un(); while (peek() === '%') { eat(); a = { t: 'pct', a }; } return a; };
  const un = (): Node => { if (peek() === '-' || peek() === '+') { const op = eat(); return { t: 'un', op, a: un() }; } return prim(); };
  const prim = (): Node => {
    const x = eat();
    if (x === undefined) throw new FErr('#VALUE!');
    if (x === '(') { const e = cmp(); eat(')'); return e; }
    if (x[0] === '"') return { t: 'str', v: x.slice(1) };
    if (/^[0-9.]/.test(x)) return { t: 'num', v: Number(x) };
    if (NAME_START.test(x[0])) {
      if (peek() === '(') {
        eat('(');
        const args: Node[] = [];
        if (peek() !== ')') { args.push(cmp()); while (peek() === ',') { eat(); args.push(cmp()); } }
        eat(')');
        return { t: 'fn', name: x.toUpperCase(), args };
      }
      const up = x.toUpperCase();
      if (up === 'TRUE' || up === 'FALSE') return { t: 'bool', v: up === 'TRUE' };
      return { t: 'ref', name: x };
    }
    throw new FErr('#NAME?');
  };
  const e = cmp();
  if (p < tk.length) throw new FErr('#NAME?');
  return e;
}

/** 수식이 부르는 변수 이름들 */
export function formulaRefs(src: string): string[] {
  let n: Node;
  try { n = parseFormula(src); } catch { return refsLoose(src); }
  const out: string[] = [];
  const walk = (x: Node) => {
    if (x.t === 'ref') { if (!out.includes(x.name)) out.push(x.name); }
    else if (x.t === 'fn') x.args.forEach(walk);
    else if (x.t === 'un' || x.t === 'pct') walk(x.a);
    else if (x.t === 'bin') { walk(x.a); walk(x.b); }
  };
  walk(n);
  return out;
}
/** 문법이 틀린 수식에서도 이름은 찾는다 (사용 중 판정·함께 바꾸기용) */
function refsLoose(src: string): string[] {
  const out: string[] = [];
  const s = src.replace(/"(?:[^"]|"")*"/g, ' ');
  for (const m of s.matchAll(/[A-Za-z_\uAC00-\uD7A3][A-Za-z0-9_.\uAC00-\uD7A3]*/g)) {
    const after = s.slice((m.index ?? 0) + m[0].length).trimStart();
    if (after.startsWith('(')) continue;
    if (!out.includes(m[0]) && !/^(TRUE|FALSE)$/i.test(m[0])) out.push(m[0]);
  }
  return out;
}

/** 수식 안의 변수 이름 바꾸기 — 글자("…")·함수 이름은 건드리지 않는다 */
export function renameInFormula(src: string, old: string, next: string): string {
  let out = ''; let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '"') { let j = i + 1; while (j < src.length) { if (src[j] === '"') { if (src[j + 1] === '"') { j += 2; continue; } break; } j++; } out += src.slice(i, j + 1); i = j + 1; continue; }
    if (NAME_START.test(c) && !(i > 0 && NAME_CHAR.test(src[i - 1]))) {
      let j = i; while (j < src.length && NAME_CHAR.test(src[j])) j++;
      const word = src.slice(i, j);
      const isFn = src.slice(j).trimStart().startsWith('(');
      out += !isFn && word === old ? next : word;
      i = j; continue;
    }
    out += c; i++;
  }
  return out;
}

// ── 값 다루기 ──────────────────────────────────────────────────────────
const isErr = (v: unknown): v is FErr => v instanceof FErr;
function num(v: FVal): number | FErr {
  if (isErr(v)) return v;
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  const t = v.trim().replace(/,/g, '');
  if (t === '') return 0;
  const pct = t.endsWith('%');
  const n = Number(pct ? t.slice(0, -1) : t);
  return Number.isFinite(n) ? (pct ? n / 100 : n) : new FErr('#VALUE!');
}
function str(v: FVal): string | FErr {
  if (isErr(v)) return v;
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (typeof v === 'number') return formatCell(v, 'General');
  return v;
}
function bool(v: FVal): boolean | FErr {
  if (isErr(v)) return v;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  const u = v.trim().toUpperCase();
  if (u === 'TRUE') return true; if (u === 'FALSE') return false;
  return new FErr('#VALUE!');
}
const nums = (vals: FVal[]): number[] | FErr => {
  const out: number[] = [];
  for (const v of vals) { if (typeof v === 'string' && v.trim() === '') continue; const n = num(v); if (isErr(n)) return n; out.push(n); }
  return out;
};
function roundTo(n: number, d: number, mode: 'r' | 'u' | 'd'): number {
  const f = Math.pow(10, d); const x = Math.abs(n) * f;
  const y = mode === 'r' ? Math.round(x + 1e-9) : mode === 'u' ? Math.ceil(x - 1e-9) : Math.floor(x + 1e-9);
  return Math.sign(n) * y / f;
}
function todaySerial(withTime: boolean): number {
  const d = new Date();
  return partsToSerial(d.getFullYear(), d.getMonth() + 1, d.getDate(), withTime ? d.getHours() : 0, withTime ? d.getMinutes() : 0, withTime ? d.getSeconds() : 0);
}

type Fn = (args: FVal[], raw: Node[], ev: (n: Node) => FVal) => FVal;
const need = (args: unknown[], min: number, max = min) => { if (args.length < min || args.length > max) throw new FErr('#VALUE!'); };
const N1 = (f: (n: number) => number): Fn => (a) => { need(a, 1); const n = num(a[0]); return isErr(n) ? n : f(n); };
const R = (mode: 'r' | 'u' | 'd'): Fn => (a) => { need(a, 1, 2); const n = num(a[0]); const d = a[1] === undefined ? 0 : num(a[1]); if (isErr(n)) return n; if (isErr(d)) return d; return roundTo(n, Math.trunc(d), mode); };
const FUNCTIONS: Record<string, Fn> = {
  SUM: (a) => { const n = nums(a); return isErr(n) ? n : n.reduce((x, y) => x + y, 0); },
  PRODUCT: (a) => { const n = nums(a); return isErr(n) ? n : n.reduce((x, y) => x * y, 1); },
  AVERAGE: (a) => { const n = nums(a); if (isErr(n)) return n; return n.length ? n.reduce((x, y) => x + y, 0) / n.length : new FErr('#DIV/0!'); },
  MIN: (a) => { const n = nums(a); return isErr(n) ? n : n.length ? Math.min(...n) : 0; },
  MAX: (a) => { const n = nums(a); return isErr(n) ? n : n.length ? Math.max(...n) : 0; },
  MEDIAN: (a) => { const n = nums(a); if (isErr(n)) return n; if (!n.length) return new FErr('#NUM!'); const s = [...n].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; },
  COUNT: (a) => a.filter((v) => typeof v === 'number' || (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v.replace(/,/g, ''))))).length,
  COUNTA: (a) => a.filter((v) => !(typeof v === 'string' && v === '')).length,
  ROUND: R('r'), ROUNDUP: R('u'), ROUNDDOWN: R('d'), TRUNC: R('d'),
  INT: N1(Math.floor), ABS: N1(Math.abs),
  SQRT: (a) => { need(a, 1); const n = num(a[0]); if (isErr(n)) return n; return n < 0 ? new FErr('#NUM!') : Math.sqrt(n); },
  MOD: (a) => { need(a, 2); const x = num(a[0]); const y = num(a[1]); if (isErr(x)) return x; if (isErr(y)) return y; if (y === 0) return new FErr('#DIV/0!'); return x - y * Math.floor(x / y); },
  POWER: (a) => { need(a, 2); const x = num(a[0]); const y = num(a[1]); if (isErr(x)) return x; if (isErr(y)) return y; return Math.pow(x, y); },
  CEILING: (a) => { need(a, 1, 2); const x = num(a[0]); const y = a[1] === undefined ? 1 : num(a[1]); if (isErr(x)) return x; if (isErr(y)) return y; return y === 0 ? 0 : Math.ceil(x / y - 1e-12) * y; },
  FLOOR: (a) => { need(a, 1, 2); const x = num(a[0]); const y = a[1] === undefined ? 1 : num(a[1]); if (isErr(x)) return x; if (isErr(y)) return y; return y === 0 ? new FErr('#DIV/0!') : Math.floor(x / y + 1e-12) * y; },
  PI: () => Math.PI,
  IF: (_a, raw, ev) => { need(raw, 2, 3); const c = bool(ev(raw[0])); if (isErr(c)) return c; return c ? ev(raw[1]) : raw[2] ? ev(raw[2]) : false; },
  IFERROR: (_a, raw, ev) => { need(raw, 2); const v = ev(raw[0]); return isErr(v) ? ev(raw[1]) : v; },
  AND: (a) => { for (const v of a) { const b = bool(v); if (isErr(b)) return b; if (!b) return false; } return true; },
  OR: (a) => { for (const v of a) { const b = bool(v); if (isErr(b)) return b; if (b) return true; } return false; },
  NOT: (a) => { need(a, 1); const b = bool(a[0]); return isErr(b) ? b : !b; },
  CONCAT: (a) => { let s = ''; for (const v of a) { const x = str(v); if (isErr(x)) return x; s += x; } return s; },
  TEXT: (a) => { need(a, 2); const f = str(a[1]); if (isErr(f)) return f; const v = a[0]; if (isErr(v)) return v; const asNum = typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v.replace(/,/g, ''))); return formatCell(asNum ? Number((v as string).replace(/,/g, '')) : v as CellValue, f); },
  LEN: (a) => { need(a, 1); const s = str(a[0]); return isErr(s) ? s : Array.from(s).length; },
  LEFT: (a) => { need(a, 1, 2); const s = str(a[0]); const n = a[1] === undefined ? 1 : num(a[1]); if (isErr(s)) return s; if (isErr(n)) return n; return Array.from(s).slice(0, Math.max(0, n)).join(''); },
  RIGHT: (a) => { need(a, 1, 2); const s = str(a[0]); const n = a[1] === undefined ? 1 : num(a[1]); if (isErr(s)) return s; if (isErr(n)) return n; const ch = Array.from(s); return n <= 0 ? '' : ch.slice(-n).join(''); },
  MID: (a) => { need(a, 3); const s = str(a[0]); const st = num(a[1]); const n = num(a[2]); if (isErr(s)) return s; if (isErr(st)) return st; if (isErr(n)) return n; return Array.from(s).slice(st - 1, st - 1 + n).join(''); },
  UPPER: (a) => { need(a, 1); const s = str(a[0]); return isErr(s) ? s : s.toUpperCase(); },
  LOWER: (a) => { need(a, 1); const s = str(a[0]); return isErr(s) ? s : s.toLowerCase(); },
  TRIM: (a) => { need(a, 1); const s = str(a[0]); return isErr(s) ? s : s.trim().replace(/\s+/g, ' '); },
  VALUE: (a) => { need(a, 1); return num(a[0]); },
  TODAY: (a) => { need(a, 0); return todaySerial(false); },
  NOW: (a) => { need(a, 0); return todaySerial(true); },
  DATE: (a) => { need(a, 3); const y = num(a[0]); const m = num(a[1]); const d = num(a[2]); if (isErr(y)) return y; if (isErr(m)) return m; if (isErr(d)) return d; return partsToSerial(y, m, d); },
  TIME: (a) => { need(a, 3); const h = num(a[0]); const m = num(a[1]); const s = num(a[2]); if (isErr(h)) return h; if (isErr(m)) return m; if (isErr(s)) return s; return (h * 3600 + m * 60 + s) / 86400; },
  YEAR: N1((n) => serialToParts(n).y), MONTH: N1((n) => serialToParts(n).mo), DAY: N1((n) => serialToParts(n).d),
  HOUR: N1((n) => serialToParts(n).h), MINUTE: N1((n) => serialToParts(n).mi), SECOND: N1((n) => serialToParts(n).s),
  WEEKDAY: N1((n) => serialToParts(n).wd + 1),
  DAYS: (a) => { need(a, 2); const x = num(a[0]); const y = num(a[1]); if (isErr(x)) return x; if (isErr(y)) return y; return Math.trunc(x) - Math.trunc(y); },
  EDATE: (a) => { need(a, 2); const x = num(a[0]); const m = num(a[1]); if (isErr(x)) return x; if (isErr(m)) return m; const p = serialToParts(x); return partsToSerial(p.y, p.mo + Math.trunc(m), p.d); },
};
FUNCTIONS.CONCATENATE = FUNCTIONS.CONCAT;
export const FUNCTION_NAMES = Object.keys(FUNCTIONS);

/** 수식 계산 — resolve(name) 은 다른 변수의 값(없으면 #NAME?) */
export function evalFormula(src: string, resolve: (name: string) => FVal): FVal {
  let tree: Node;
  try { tree = parseFormula(src); } catch (e) { return e instanceof FErr ? e : new FErr('#NAME?'); }
  const ev = (n: Node): FVal => {
    try {
      switch (n.t) {
        case 'num': return n.v;
        case 'str': return n.v;
        case 'bool': return n.v;
        case 'ref': return resolve(n.name);
        case 'pct': { const v = num(ev(n.a)); return isErr(v) ? v : v / 100; }
        case 'un': { const v = num(ev(n.a)); return isErr(v) ? v : n.op === '-' ? -v : v; }
        case 'fn': {
          const f = FUNCTIONS[n.name];
          if (!f) return new FErr('#NAME?');
          const lazy = n.name === 'IF' || n.name === 'IFERROR';
          const args = lazy ? [] : n.args.map(ev);
          if (!lazy && n.name !== 'COUNT' && n.name !== 'COUNTA') { const e = args.find(isErr); if (e) return e; }
          return f(args, n.args, ev);
        }
        case 'bin': {
          const a = ev(n.a); const b = ev(n.b);
          if (isErr(a)) return a; if (isErr(b)) return b;
          if (n.op === '&') { const x = str(a); const y = str(b); return isErr(x) ? x : isErr(y) ? y : x + y; }
          if (['=', '<>', '<', '>', '<=', '>='].includes(n.op)) {
            const bothNum = typeof a !== 'string' && typeof b !== 'string';
            const x: number | string = bothNum ? (num(a) as number) : String(str(a)).toLowerCase();
            const y: number | string = bothNum ? (num(b) as number) : String(str(b)).toLowerCase();
            switch (n.op) { case '=': return x === y; case '<>': return x !== y; case '<': return x < y; case '>': return x > y; case '<=': return x <= y; default: return x >= y; }
          }
          const x = num(a); const y = num(b);
          if (isErr(x)) return x; if (isErr(y)) return y;
          switch (n.op) {
            case '+': return x + y; case '-': return x - y; case '*': return x * y;
            case '/': return y === 0 ? new FErr('#DIV/0!') : x / y;
            default: { const r = Math.pow(x, y); return Number.isFinite(r) ? r : new FErr('#NUM!'); }
          }
        }
      }
    } catch (e) { return e instanceof FErr ? e : new FErr('#VALUE!'); }
  };
  const r = ev(tree);
  if (typeof r === 'number' && !Number.isFinite(r)) return new FErr('#NUM!');
  // 부동소수 찌꺼기 (0.1+0.2) — 엑셀처럼 15자리에서 자른다
  return typeof r === 'number' ? Number(r.toPrecision(15)) : r;
}
