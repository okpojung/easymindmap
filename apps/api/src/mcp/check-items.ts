/**
 * **`check_items` 의 순수 부분** (2026-09-09) — 기존 맵의 노드에 있는
 * **체크박스만** 체크(또는 해제)한다.
 * 설계: docs/04-extensions/ai/mcp-connector.md §9.12
 *
 * 이 파일은 DB·잠금을 모른다. "어느 노드의, 어느 체크박스를, 어느 상태로"
 * 만 정한다 — 저장·버전은 `mcp-tools.ts` 가 MapsService 로 한다.
 *
 * 체크박스는 맵에 **두 모양**으로 있다. 둘 다 다룬다:
 *   · 노드 본문의 체크 줄 — `- [ ] 완료` / `- [x] 완료` (앱이 체크박스
 *     글리프로 그리고, 클릭이 원문의 `[ ]`↔`[x]` 를 바꾼다 — 프런트
 *     `node-renderer/mdCheck.ts` `toggleCheckInText`)
 *   · 체크리스트 노트 — `NoteBlock{type:'checklist', checked}`
 *
 * **앱의 클릭과 같은 규칙**을 따른다: 줄 정규식은 mdCheck.ts 의
 * `CHECK_LINE_RE` 와 같고, 코드 펜스(```) 안의 `- [ ]` 는 세지 않는다
 * (코드 예제 속 체크 표기 보호). 바꾸는 것은 `[ ]`/`[x]` 한 글자뿐이다 —
 * 노드의 다른 글자·노트·자식·스타일은 손대지 않는다. 그래서 이 도구는
 * §2-3 "있는 노드를 바꾸는 도구는 두지 않는다" 의 **유일한 예외**다 — 되돌리기
 * 쉽고(반대로 한 번 더 부르면 된다), 히스토리 버전으로도 남는다.
 */
import type { MindNode, NoteBlock, SampleMap } from '../emm/model';
import { AppendError, findByPath, nodeTitle } from './append-to-map';

/** 프런트 `mdCheck.ts` CHECK_LINE_RE 와 **같아야 한다** — 앱이 체크박스로 그리는 줄이 곧 이 도구가 바꾸는 줄이다 */
export const CHECK_LINE_RE = /^[ \t]*[-*+][ \t]+\[([ xX])\][ \t]?(.*)$/;

export interface SetChecksResult<T> {
  value: T;
  /** 이번에 상태가 바뀐 체크박스 수 */
  changed: number;
  /** 이미 원하는 상태여서 그대로 둔 수 */
  already: number;
  /** `item` 으로 좁힌 뒤 대상이 된 체크박스 수 (= changed + already) */
  matched: number;
  /** 노드에 있는 체크박스 전체 수 (좁히기 전) */
  total: number;
}

/** `item` 좁히기 — 비우면 전부, 있으면 그 말이 **들어간** 항목만 (대소문자 무시) */
function itemMatches(label: string, filter: string | undefined): boolean {
  if (!filter) return true;
  return label.toLowerCase().includes(filter.toLowerCase());
}

/**
 * 노드 본문의 체크 줄을 `checked` 상태로 맞춘 새 본문. 펜스 안은 건너뛴다.
 * `[ ]`/`[x]` 한 글자만 바꾼다 — `[X]` 도 체크로 보고, 바꿀 때는 소문자 `x`
 * 로 쓴다(직렬화기 `serialize.ts` 가 내는 모양과 같다).
 */
export function setChecksInText(
  text: string, checked: boolean, filter?: string,
): SetChecksResult<string> {
  const lines = String(text ?? '').split('\n');
  let inFence = false;
  let changed = 0, already = 0, matched = 0, total = 0;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*```/.test(lines[i])) { inFence = !inFence; continue; }
    if (inFence) continue;
    const m = CHECK_LINE_RE.exec(lines[i]);
    if (!m) continue;
    total++;
    if (!itemMatches(m[2], filter)) continue;
    matched++;
    const isChecked = m[1] !== ' ';
    if (isChecked === checked) { already++; continue; }
    lines[i] = lines[i].replace(/\[([ xX])\]/, checked ? '[x]' : '[ ]');
    changed++;
  }
  return { value: changed ? lines.join('\n') : text, changed, already, matched, total };
}

/** 체크리스트 노트를 `checked` 상태로 맞춘 새 노트 배열(바뀐 것이 없으면 원본 그대로) */
export function setChecksInNotes(
  notes: NoteBlock[] | undefined, checked: boolean, filter?: string,
): SetChecksResult<NoteBlock[] | undefined> {
  let changed = 0, already = 0, matched = 0, total = 0;
  const out = (notes ?? []).map((n) => {
    if (n.type !== 'checklist') return n;
    total++;
    if (!itemMatches(n.text ?? '', filter)) return n;
    matched++;
    if (Boolean(n.checked) === checked) { already++; return n; }
    changed++;
    return { ...n, checked };
  });
  return { value: changed ? out : notes, changed, already, matched, total };
}

export interface CheckOutcome {
  /** 사용자가 적은 이름 그대로 */
  asked: string;
  /** 찾은 노드의 경로("가지 > 하위") — 못 찾았으면 asked */
  path: string;
  changed: number;
  already: number;
  matched: number;
  total: number;
  /** 못 찾음·모호함 등 — 이 노드는 건너뛰었다 */
  error?: string;
}

export interface CheckItemsResult {
  map: SampleMap;
  outcomes: CheckOutcome[];
  /** 전체 바뀐 체크박스 수 */
  changed: number;
}

/**
 * `targets` 가 가리키는 노드들의 체크박스를 `checked` 로 맞춘 새 맵을
 * 돌려준다(원본은 건드리지 않는다). 노드 하나가 실패해도(못 찾음·모호함)
 * 나머지는 진행하고 그 사정을 outcome 에 적는다 — 열 개를 부탁했는데 하나
 * 때문에 전부 안 되면 사용자는 같은 말을 되풀이해야 한다.
 *
 * 이름 찾기는 `append_to_map` 과 **같은 규칙**(`findByPath`): 정확히 같은
 * 이름 → 없으면 포함 → 둘 이상이면 고르지 않고 후보를 나열, `id:` 는 앱이
 * 알려 준 선택 노드, 빈 값·root 는 중심 주제.
 */
export function checkItems(
  map: SampleMap, targets: string[], checked: boolean, filter?: string,
): CheckItemsResult {
  if (!Array.isArray(targets) || targets.length === 0) {
    throw new AppendError('`nodes` 가 비어 있습니다 — 체크할 노드 이름을 하나 이상 넣어 주세요.');
  }
  // 같은 노드를 두 번 적어도 한 번만 바꾼다 — 두 번째는 "이미 그 상태" 가 된다
  let work: SampleMap = map;
  const outcomes: CheckOutcome[] = [];
  let changedAll = 0;

  for (const rawTarget of targets) {
    const asked = String(rawTarget ?? '').trim();
    let found;
    try {
      found = findByPath(work, asked);
    } catch (err) {
      if (err instanceof AppendError) {
        outcomes.push({ asked, path: asked, changed: 0, already: 0, matched: 0, total: 0, error: err.message });
        continue;
      }
      throw err;
    }

    if (!found.node) {
      // 중심 주제 — 본문·노트 둘 다 (append 와 같이 root.notes 를 허용한다)
      const root = work.root as SampleMap['root'] & { notes?: NoteBlock[] };
      const t = setChecksInText(root.text, checked, filter);
      const n = setChecksInNotes(root.notes, checked, filter);
      const o = merge(asked, found.path, t, n);
      outcomes.push(o);
      if (o.changed) {
        changedAll += o.changed;
        work = { ...work, root: { ...root, text: t.value, ...(n.changed ? { notes: n.value } : {}) } };
      }
      continue;
    }

    const tgt = found.node;
    const t = setChecksInText(tgt.text, checked, filter);
    const n = setChecksInNotes(tgt.notes, checked, filter);
    const o = merge(asked, found.path, t, n);
    outcomes.push(o);
    if (!o.changed) continue;
    changedAll += o.changed;
    const replace = (nodes: MindNode[]): MindNode[] => nodes.map((x) => {
      if (x === tgt) return { ...x, text: t.value, ...(n.changed ? { notes: n.value } : {}) };
      const c = (x.children ?? []) as MindNode[];
      return c.length ? { ...x, children: replace(c) } : x;
    });
    work = { ...work, branches: replace(work.branches as MindNode[]) as SampleMap['branches'] };
  }

  return { map: work, outcomes, changed: changedAll };
}

function merge(
  asked: string, path: string, t: SetChecksResult<string>, n: SetChecksResult<NoteBlock[] | undefined>,
): CheckOutcome {
  return {
    asked, path,
    changed: t.changed + n.changed,
    already: t.already + n.already,
    matched: t.matched + n.matched,
    total: t.total + n.total,
  };
}

/** 체크박스가 있는 노드 목록 — "무엇을 체크할 수 있나" 를 AI 가 사용자에게 보여 줄 때 */
export function listCheckable(map: SampleMap): { path: string; items: { label: string; checked: boolean }[] }[] {
  const out: { path: string; items: { label: string; checked: boolean }[] }[] = [];
  const itemsOf = (text: string, notes: NoteBlock[] | undefined) => {
    const items: { label: string; checked: boolean }[] = [];
    let inFence = false;
    for (const line of String(text ?? '').split('\n')) {
      if (/^\s*```/.test(line)) { inFence = !inFence; continue; }
      if (inFence) continue;
      const m = CHECK_LINE_RE.exec(line);
      if (m) items.push({ label: m[2].trim(), checked: m[1] !== ' ' });
    }
    for (const nb of notes ?? []) {
      if (nb.type === 'checklist') items.push({ label: String(nb.text ?? '').trim(), checked: Boolean(nb.checked) });
    }
    return items;
  };
  const root = map.root as SampleMap['root'] & { notes?: NoteBlock[] };
  const rootItems = itemsOf(root.text, root.notes);
  if (rootItems.length) out.push({ path: nodeTitle(root) || map.title, items: rootItems });
  const walk = (nodes: MindNode[], path: string[]) => {
    for (const n of nodes) {
      const p = [...path, nodeTitle(n)];
      const items = itemsOf(n.text, n.notes);
      if (items.length) out.push({ path: p.join(' > '), items });
      walk((n.children ?? []) as MindNode[], p);
    }
  };
  walk(map.branches as MindNode[], []);
  return out;
}
