// 맵 변수 (2026-10-29 사용자 요청: 왼쪽 레일 '변수' — 변수명·타입·서식·값·복사).
//
// 저장: 문서의 map.settings.variables — [{ name, type, format?, value? }] (협업맵도 settings 를 보존한다).
//   · value 는 사람이 넣은 글자 그대로(수식은 수식 글자). 대시보드맵은 유료 모듈이 읽을 때
//     DB(dashboard_vars) 값을 value 에 넣어 준다 — 서식·수식은 여기서 똑같이 적용된다.
//   · 날짜·시간은 엑셀처럼 일련번호로 계산하고, 서식이 날짜면 날짜로 보인다.
// 노드 글자의 [&이름] 을 값으로 바꿔 보이는 것은 '값으로 보기'(applyVariableView) — 문서는 그대로다.

import type { MapVariable, VariableType } from '@emm/model';
import { formatCell, formatPhone, partsToSerial } from './excelFormat';
import { evalFormula, FErr, formulaRefs, type FVal } from './formula';
import { fillText, varsInText } from './varSyntax';

export type { MapVariable, VariableType };

export const VARIABLE_TYPES: VariableType[] = ['number', 'currency', 'date', 'time', 'percent', 'text', 'phone', 'koreanNumber', 'email', 'formula'];

/** 타입별 기본 서식 (엑셀 셀 서식) */
export const DEFAULT_FORMAT: Record<VariableType, string> = {
  number: '#,##0', currency: '₩#,##0', date: 'yyyy-mm-dd', time: 'hh:mm', percent: '0%',
  text: '@', phone: '', koreanNumber: '[DBNum4]G/표준', email: '@', formula: 'G/표준',
};
/** 서식 고르기 목록 (자주 쓰는 것) — 직접 입력도 된다 */
export const FORMAT_PRESETS: Record<VariableType, string[]> = {
  number: ['#,##0', '#,##0.00', '0', '0.0', '#,##0;-#,##0', '#,##0;[Red]-#,##0', '#,##0,"천"', 'G/표준'],
  currency: ['₩#,##0', '#,##0"원"', '$#,##0.00', '#,##0,,"백만원"', '₩#,##0;-₩#,##0'],
  date: ['yyyy-mm-dd', 'yyyy.mm.dd', 'yyyy"년" m"월" d"일"', 'yyyy-mm-dd (aaa)', 'm/d', 'mmmm d, yyyy'],
  time: ['hh:mm', 'hh:mm:ss', 'h:mm AM/PM', '오전/오후 h:mm', '[h]:mm'],
  percent: ['0%', '0.0%', '0.00%'],
  text: ['@', '@"님"'],
  phone: ['', '000-0000-0000', '00-000-0000', '000-000-0000'],
  koreanNumber: ['[DBNum4]G/표준', '"일금 "[DBNum4]G/표준"원정"', '[DBNum1]G/표준', '[DBNum2]G/표준'],
  email: ['@'],
  formula: ['G/표준', '#,##0', '#,##0.00', '₩#,##0', '0%', '0.0%', 'yyyy-mm-dd'],
};

const isErr = (v: unknown): v is FErr => v instanceof FErr;

function parseNumber(raw: string): number | null {
  const t = raw.trim().replace(/[,\s₩$원]/g, '');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}
function parseDate(raw: string): number | null {
  const m = /^(\d{4})[-./년\s]+(\d{1,2})[-./월\s]+(\d{1,2})일?(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(raw.trim());
  if (!m) return null;
  return partsToSerial(+m[1], +m[2], +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0));
}
function parseTime(raw: string): number | null {
  const m = /^(오전|오후|AM|PM)?\s*(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i.exec(raw.trim());
  if (!m) return null;
  let h = +m[2];
  const ap = (m[1] ?? m[5] ?? '').toUpperCase();
  if ((ap === 'PM' || ap === '오후') && h < 12) h += 12;
  if ((ap === 'AM' || ap === '오전') && h === 12) h = 0;
  return (h * 3600 + +m[3] * 60 + +(m[4] ?? 0)) / 86400;
}

/** 넣은 글자 → 계산에 쓰는 값. 빈 값은 null(값 없음) */
export function parseRaw(type: VariableType, raw: string | undefined | null): FVal | null {
  const s = String(raw ?? '');
  if (!s.trim()) return null;
  switch (type) {
    case 'number': case 'currency': case 'koreanNumber': {
      const n = parseNumber(s); return n === null ? new FErr('#VALUE!') : n;
    }
    case 'percent': {
      const t = s.trim();
      if (t.endsWith('%')) { const n = parseNumber(t.slice(0, -1)); return n === null ? new FErr('#VALUE!') : n / 100; }
      // 엑셀의 자동 백분율 입력과 같다 — 1 이상이면 % 로 읽고(25 → 25%), 1 미만이면 비율(0.25 → 25%)
      const n = parseNumber(t); return n === null ? new FErr('#VALUE!') : (Math.abs(n) >= 1 ? n / 100 : n);
    }
    case 'date': { const n = parseDate(s) ?? parseNumber(s); return n === null ? new FErr('#VALUE!') : n; }
    case 'time': { const n = parseTime(s) ?? parseNumber(s); return n === null ? new FErr('#VALUE!') : n; }
    default: return s;
  }
}

/** 값 검사 (입력 칸 아래 안내) — 문제가 있으면 i18n 키 */
export function valueProblem(type: VariableType, raw: string): string | null {
  if (!raw.trim() || type === 'formula') return null;
  if (type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw.trim())) return 'var.err.email';
  if (type === 'phone' && raw.replace(/\D/g, '').length < 7) return 'var.err.phone';
  const v = parseRaw(type, raw);
  return isErr(v) ? 'var.err.value' : null;
}

export interface VarResult {
  /** 계산된 값 (null = 값 없음) */
  value: FVal | null;
  /** 서식을 입힌 보이는 글자 — 값이 없으면 undefined (노드에는 [&x] 그대로) */
  display?: string;
}

/** 모든 변수를 계산한다 — 수식은 다른 변수를 부른다(순환이면 #REF!) */
export function evaluateVariables(vars: readonly MapVariable[] | undefined): Map<string, VarResult> {
  const out = new Map<string, VarResult>();
  const list = vars ?? [];
  const byName = new Map(list.map((v) => [v.name, v]));
  const computing = new Set<string>();
  const valueOf = (name: string): FVal | null => {
    const def = byName.get(name);
    if (!def) return new FErr('#NAME?');
    const done = out.get(name);
    if (done) return done.value;
    if (computing.has(name)) return new FErr('#REF!');
    computing.add(name);
    let v: FVal | null;
    if (def.type === 'formula') {
      v = (def.value ?? '').trim() ? evalFormula(def.value ?? '', (ref) => {
        const r = valueOf(ref);
        if (r === null) { const d = byName.get(ref); return d && ['text', 'email', 'phone'].includes(d.type) ? '' : 0; }
        return r;
      }) : null;
    } else v = parseRaw(def.type, def.value);
    computing.delete(name);
    out.set(name, { value: v, display: displayOf(def, v) });
    return v;
  };
  for (const v of list) valueOf(v.name);
  return out;
}

export function displayOf(def: MapVariable, v: FVal | null): string | undefined {
  if (v === null) return undefined;
  if (isErr(v)) return v.code;
  const fmt = def.format ?? DEFAULT_FORMAT[def.type];
  if (def.type === 'phone') return formatPhone(String(v), def.format);
  if (typeof v === 'string' && ['number', 'currency', 'percent', 'koreanNumber', 'date', 'time'].includes(def.type)) return v;
  return formatCell(v, fmt || 'General');
}

/** 미리 보기 — 서식만 바꿔 볼 때 (변수 편집 칸) */
export function previewDisplay(def: MapVariable, all: readonly MapVariable[]): string {
  const others = all.filter((x) => x.name !== def.name);
  const r = evaluateVariables([...others, def]).get(def.name);
  return r?.display ?? '';
}

// ── DB 값 (유료 모듈 dashboard_vars, 2026-10-30) ───────────────────────────
/** 정의의 값을 DB 값으로 — 수식은 다른 변수로 계산하므로 덮지 않는다 (pro vars.ts renderDoc 과 같은 규칙) */
export function withDbValues(defs: readonly MapVariable[], db?: Readonly<Record<string, string>>): MapVariable[] {
  if (!db) return [...defs];
  return defs.map((d) => (d.type !== 'formula' && Object.prototype.hasOwnProperty.call(db, d.name) ? { ...d, value: db[d.name] } : d));
}

/** 값으로 보기에 쓰는 결과 — 정의(DB 값 우선)를 계산하고, 정의 없이 DB 에만 있는 이름은 값 그대로 */
export function variableResults(map: { settings?: { variables?: MapVariable[] } }, db?: Readonly<Record<string, string>>): Map<string, VarResult> {
  const res = evaluateVariables(withDbValues(map.settings?.variables ?? [], db));
  if (db) for (const [k, v] of Object.entries(db)) if (!res.has(k) && v !== '') res.set(k, { value: v, display: v });
  return res;
}

let dbSource: (() => Record<string, string> | undefined) | null = null;
/** 지금 열린 맵의 DB 값을 주는 곳 — varDbStore 가 등록한다(내보내기가 스토어를 직접 들이지 않게) */
export function setVarDbSource(fn: () => Record<string, string> | undefined): void { dbSource = fn; }
export function currentVarDb(): Record<string, string> | undefined { return dbSource?.(); }

// ── 맵 훑기 ────────────────────────────────────────────────────────────
interface TNode { text?: string; children?: TNode[] }
interface TMap { root: TNode; branches: TNode[]; centers?: { root: TNode; branches: TNode[] }[]; settings?: { variables?: MapVariable[] } }

function eachNode(map: TMap, f: (n: TNode) => void) {
  const walk = (n: TNode) => { f(n); n.children?.forEach(walk); };
  walk(map.root); map.branches.forEach(walk);
  for (const c of map.centers ?? []) { walk(c.root); c.branches.forEach(walk); }
}

/** 변수마다 쓰는 곳 — 노드 수 · 그 변수를 부르는 수식 변수 이름 */
export function variableUsage(map: TMap): Map<string, { nodes: number; formulas: string[] }> {
  const out = new Map<string, { nodes: number; formulas: string[] }>();
  const get = (n: string) => { let x = out.get(n); if (!x) { x = { nodes: 0, formulas: [] }; out.set(n, x); } return x; };
  eachNode(map, (n) => { for (const name of varsInText(String(n.text ?? ''))) get(name).nodes++; });
  for (const v of map.settings?.variables ?? []) {
    if (v.type !== 'formula') continue;
    for (const r of formulaRefs(v.value ?? '')) if (r !== v.name) get(r).formulas.push(v.name);
  }
  return out;
}

/**
 * '값으로 보기' — 노드 글자의 [&이름] 을 서식 입힌 값으로 바꾼 **화면용 사본**.
 * 바꾼 노드에는 원문을 _rawText 로 남긴다(편집은 원문으로 한다). 바뀐 것이 없으면 맵 그대로.
 */
export function applyVariableView<M>(input: M, results?: Map<string, VarResult>): M {
  const map = input as unknown as TMap;
  const res = results ?? variableResults(map, currentVarDb());
  const values = new Map<string, string>();
  for (const [k, r] of res) if (r.display !== undefined) values.set(k, r.display);
  if (!values.size) return input;
  const conv = <N extends TNode>(n: N): N => {
    let kids = n.children;
    if (kids?.length) { const next = kids.map(conv); if (next.some((c, i) => c !== kids![i])) kids = next; }
    const t = String(n.text ?? '');
    const filled = t.includes('[&') ? fillText(t, values) : t;
    if (filled === t && kids === n.children) return n;
    return { ...n, children: kids, ...(filled !== t ? { text: filled, _rawText: t } : {}) };
  };
  const root = conv(map.root);
  const branches = map.branches.map(conv);
  const centers = map.centers?.map((c) => {
    const r = conv(c.root); const bs = c.branches.map(conv);
    return r === c.root && bs.every((b, i) => b === c.branches[i]) ? c : { ...c, root: r, branches: bs };
  });
  const same = root === map.root && branches.every((b, i) => b === map.branches[i]) && (!centers || centers.every((c, i) => c === map.centers![i]));
  return (same ? map : { ...map, root, branches, centers }) as unknown as M;
}
