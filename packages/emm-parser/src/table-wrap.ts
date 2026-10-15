/**
 * 표 셀 자동 줄바꿈 (2026-10-15 사용자 요청).
 *
 * PDF·AI 가 만든 표는 셀 글이 한 줄로 길게 붙어 오는 일이 많다 — 셀 하나가
 * 문장 서너 개면 표가 1,700px 로 넓어져 주변 노드(최대 320px)와 어울리지 않고
 * 맵이 옆으로 길게 늘어난다. 그래서 **표를 받을 때** 셀 글을 `<br>`(GFM 의 셀
 * 줄바꿈)로 나눠 표 전체 폭을 [TABLE_MAX_EM] 안에 맞춘다.
 *
 *   · 좁은 열은 그대로 두고, 넓은 열들이 남은 폭을 나눠 갖는다(물 채우기)
 *   · 빈칸에서 끊는다 — `/` · `,` · `·` 뒤가 우선이 되도록 그 뒤의 빈칸을 고른다.
 *     빈칸 없이 긴 낱말(한글 붙여 쓴 말)은 글자 단위로 끊는다
 *   · 링크(`[..](..)`)·코드(`` `..` ``)는 끊지 않는다 — 문법이 깨진다
 *   · 이미 있는 `<br>` 은 그대로 줄로 본다 (그 줄 안에서만 다시 나눈다)
 *   · 표가 이미 좁으면 **한 글자도 바꾸지 않는다**
 *
 * 폭은 글꼴 없이 근사한다 — 앱의 표 그리기(mdTable.ts measureTextApprox)와 같은
 * 배율(한글 1em · 숫자 0.62 · 대문자 0.72 · 그 밖 0.55 · 빈칸 0.34).
 */

/** 표 전체 폭 상한(em). 셀 글자 11px 기준 약 640px — 노드 최대 폭(320px)의 두 배 */
export const TABLE_MAX_EM = 58;
/** 한 열이 줄어들 수 있는 최소 폭(em) — 이보다 좁히면 한 줄에 두세 글자라 읽을 수 없다 */
export const TABLE_MIN_COL_EM = 8;

const CJK_RE = /[　-鿿가-힯＀-￯]/;
const BR_RE = /<br\s*\/?>/gi;

function charEm(ch: string): number {
  if (CJK_RE.test(ch)) return 1;
  if (ch === ' ') return 0.34;
  if (/\d/.test(ch)) return 0.62;
  if (/[A-Z]/.test(ch)) return 0.72;
  return 0.55;
}

/** 근사 폭(em) — 굵게·기울임 표시(`**`·`*`·`~~`)는 화면에 안 보이므로 세지 않는다 */
export function textEm(s: string): number {
  let w = 0;
  for (const ch of Array.from(s.replace(/\*\*|~~|(?<!\\)\*/g, ''))) w += charEm(ch);
  return w;
}

function linesOf(cell: string): string[] {
  return cell.split(BR_RE).map((l) => l.trim());
}

/** 끊으면 안 되는 덩어리(링크·코드)를 지키며 빈칸으로 낱말을 나눈다 */
function tokens(line: string): string[] {
  const out: string[] = [];
  const re = /(\[[^\]]*\]\([^)]*\)|`[^`]*`|\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) out.push(m[1]);
  return out;
}

function hardSplit(word: string, max: number): string[] {
  const parts: string[] = [];
  let cur = '';
  let w = 0;
  for (const ch of Array.from(word)) {
    const cw = charEm(ch);
    if (cur && w + cw > max) { parts.push(cur); cur = ''; w = 0; }
    cur += ch; w += cw;
  }
  if (cur) parts.push(cur);
  return parts;
}

/** 끊기 좋은 자리 — 이 낱말 **뒤**에서 끊으면 항목이 갈리지 않는다(`/` · `,` · `·` · `;` · `|`) */
const isSep = (t: string) => /^[/·|;]$/.test(t) || /[,;]$/.test(t);

/** 한 줄을 max(em) 안으로 나눈다 */
export function wrapLine(line: string, max: number): string[] {
  if (textEm(line) <= max) return [line];
  const out: string[] = [];
  let cur: string[] = [];
  const em = (ts: string[]) => textEm(ts.join(' '));
  for (const tok of tokens(line)) {
    const protectedTok = /^\[.*\]\(.*\)$|^`.*`$/.test(tok);
    const pieces = !protectedTok && textEm(tok) > max ? hardSplit(tok, max) : [tok];
    for (const p of pieces) {
      if (cur.length && em([...cur, p]) > max) {
        // 줄 뒤쪽 절반 안에 구분 기호가 있으면 그 뒤에서 끊는다 — "DB : ⏎ MS-SQL" 처럼
        // 항목 가운데가 갈리지 않게. 없으면 넘친 자리에서 끊는다
        let cut = -1;
        for (let i = cur.length - 1; i > 0; i--) {
          if (em(cur.slice(0, i + 1)) < max * 0.5) break;
          if (isSep(cur[i])) { cut = i; break; }
        }
        if (cut >= 0 && cut < cur.length - 1) {
          out.push(cur.slice(0, cut + 1).join(' '));
          cur = [...cur.slice(cut + 1), p];
          if (em(cur) > max) { out.push(cur.slice(0, -1).join(' ')); cur = [p]; }
        } else {
          out.push(cur.join(' '));
          cur = [p];
        }
      } else cur.push(p);
    }
  }
  if (cur.length) out.push(cur.join(' '));
  return out;
}

/**
 * 표(행 × 셀 글)의 셀을 줄바꿈해 전체 폭을 maxEm 안으로. 바뀌지 않으면 같은 배열을 돌려준다.
 * @param rows 머리글 행을 포함한 셀 글 배열 (구분선 행은 넣지 않는다)
 */
export function wrapTableCells(rows: string[][], maxEm = TABLE_MAX_EM): string[][] {
  if (!rows.length) return rows;
  const nCol = Math.max(...rows.map((r) => r.length));
  const natural = Array.from({ length: nCol }, (_, c) =>
    Math.max(0, ...rows.map((r) => Math.max(0, ...linesOf(r[c] ?? '').map(textEm)))));
  // 셀 여백(앞뒤 0.6em씩)을 더한 표 폭
  const pad = 1.2;
  const total = natural.reduce((a, b) => a + b + pad, 0);
  if (total <= maxEm) return rows;

  // 물 채우기 — 몫보다 좁은 열은 그대로, 넓은 열이 남은 폭을 똑같이 나눈다
  const width = natural.slice();
  let budget = maxEm - pad * nCol;
  let wide = natural.map((_, c) => c);
  for (;;) {
    const share = budget / wide.length;
    const narrow = wide.filter((c) => natural[c] <= share);
    if (!narrow.length) {
      for (const c of wide) width[c] = Math.max(TABLE_MIN_COL_EM, share);
      break;
    }
    for (const c of narrow) budget -= natural[c];
    wide = wide.filter((c) => natural[c] > share);
    if (!wide.length) break;
  }

  let changed = false;
  const out = rows.map((r) => r.map((cell, c) => {
    if (natural[c] <= width[c]) return cell;
    const lines = linesOf(cell).flatMap((l) => (l ? wrapLine(l, width[c]) : ['']));
    const joined = lines.join('<br>');
    if (joined !== cell) changed = true;
    return joined;
  }));
  return changed ? out : rows;
}
