// 노드 글자 속 변수 `[&이름]` (2026-10-29, 유료 모듈 dashboard/vars.ts 와 같은 문법 — 22-dashboard.md §2).
//
// 규칙 (2026-10-29 사용자 결정):
//   · 이름 — 한글·영문·숫자·`_`·`.`, 첫 글자는 숫자가 아님, 40자까지, 공백 없음
//   · 엑셀 함수 이름(SUM·IF …)과 TRUE/FALSE 는 이름으로 쓰지 못한다(대소문자 무시)
//   · 대소문자는 구분하되, 대소문자만 다른 이름은 등록하지 못한다
//   · 코드블럭(```) 과 한 줄 코드(\`…\`) 안의 `[&x]` 는 변수가 아니다(사용법 설명용)
//   · `[&이름:서식]` 은 예약 — 지금은 변수로 읽지 않는다(이름에 `:` 가 없다)

export const VAR_NAME = '[A-Za-z_\\uAC00-\\uD7A3][A-Za-z0-9_.\\uAC00-\\uD7A3]{0,39}';
const NAME_RE = new RegExp(`^${VAR_NAME}$`);
export const varRe = (): RegExp => new RegExp(`\\[&(${VAR_NAME})\\]`, 'g');

/** 변수명으로 쓸 수 없는 이름 — 수식 함수·논리값 (formula.ts FUNCTIONS 와 같은 목록) */
export const RESERVED_NAMES = [
  'SUM', 'AVERAGE', 'MIN', 'MAX', 'COUNT', 'COUNTA', 'PRODUCT', 'MEDIAN',
  'ROUND', 'ROUNDUP', 'ROUNDDOWN', 'INT', 'TRUNC', 'ABS', 'MOD', 'POWER', 'SQRT', 'CEILING', 'FLOOR', 'PI',
  'IF', 'IFERROR', 'AND', 'OR', 'NOT', 'TRUE', 'FALSE',
  'CONCAT', 'CONCATENATE', 'TEXT', 'LEN', 'LEFT', 'RIGHT', 'MID', 'UPPER', 'LOWER', 'TRIM', 'VALUE',
  'TODAY', 'NOW', 'DATE', 'TIME', 'YEAR', 'MONTH', 'DAY', 'HOUR', 'MINUTE', 'SECOND', 'WEEKDAY', 'EDATE', 'DAYS',
];

export function isVarName(s: unknown): s is string {
  return typeof s === 'string' && NAME_RE.test(s);
}

/** 이름 검사 — 틀리면 이유 키(i18n), 맞으면 null. others = 이미 있는 이름들(자기 자신 제외) */
export function nameProblem(name: string, others: readonly string[]): string | null {
  if (!name) return 'var.err.empty';
  if (/\s/.test(name)) return 'var.err.space';
  if (!isVarName(name)) return 'var.err.chars';
  if (RESERVED_NAMES.includes(name.toUpperCase())) return 'var.err.reserved';
  const low = name.toLowerCase();
  if (others.some((o) => o === name)) return 'var.err.dup';
  if (others.some((o) => o.toLowerCase() === low)) return 'var.err.caseDup';
  return null;
}

/**
 * 한 줄을 코드 밖/안 조각으로 — 한 줄 코드(\`…\`) 안은 code=true.
 * 닫히지 않은 백틱은 코드가 아니다(글자 그대로).
 */
function lineChunks(line: string): { s: string; code: boolean }[] {
  const out: { s: string; code: boolean }[] = [];
  let i = 0;
  while (i < line.length) {
    const a = line.indexOf('`', i);
    if (a < 0) { out.push({ s: line.slice(i), code: false }); break; }
    const b = line.indexOf('`', a + 1);
    if (b < 0) { out.push({ s: line.slice(i), code: false }); break; }
    if (a > i) out.push({ s: line.slice(i, a), code: false });
    out.push({ s: line.slice(a, b + 1), code: true });
    i = b + 1;
  }
  return out;
}

/** 글자 전체를 줄·조각으로 훑으며 코드 밖 조각만 바꾼다 */
export function mapOutsideCode(text: string, fn: (s: string) => string): string {
  let inFence = false;
  return String(text ?? '').split('\n').map((line) => {
    if (/^\s*```/.test(line)) { inFence = !inFence; return line; }
    if (inFence) return line;
    if (!line.includes('[&')) return line;
    return lineChunks(line).map((c) => (c.code ? c.s : fn(c.s))).join('');
  }).join('\n');
}

/** 글자에 든 변수 이름 (코드 밖, 중복 없이, 나온 순서) */
export function varsInText(text: string): string[] {
  const out: string[] = [];
  mapOutsideCode(text, (s) => {
    for (const m of s.matchAll(varRe())) if (!out.includes(m[1])) out.push(m[1]);
    return s;
  });
  return out;
}

/** `[&old]` → `[&next]` (코드 밖만) */
export function renameInText(text: string, old: string, next: string): string {
  return mapOutsideCode(text, (s) => s.replace(varRe(), (whole, name: string) => (name === old ? `[&${next}]` : whole)));
}

/**
 * 값이 노드의 인라인 서식 기호로 읽히지 않게 (유료 모듈 vars.plainValue 와 같다) —
 * `*` → ∗, 백틱 → ˋ, `~~` `==` `__` 사이에 폭 없는 공백.
 */
export function plainValue(v: string): string {
  return v.replace(/\*/g, '∗').replace(/`/g, 'ˋ').replace(/~~/g, '~\u200B~').replace(/==/g, '=\u200B=').replace(/__/g, '_\u200B_');
}

/** 값으로 채운다 — 값이 없는 이름은 `[&x]` 그대로 (넣는 것을 잊은 변수를 찾을 수 있게) */
export function fillText(text: string, values: ReadonlyMap<string, string>): string {
  if (!String(text ?? '').includes('[&')) return text;
  return mapOutsideCode(text, (s) => s.replace(varRe(), (whole, name: string) => {
    const v = values.get(name);
    return v === undefined ? whole : plainValue(v);
  }));
}
