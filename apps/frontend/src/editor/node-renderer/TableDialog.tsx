// TableDialog — 노드 본문 표(Markdown 파이프 표)를 팝업에서 편집하는
// 공용 다이얼로그 (2026-09-17, 사용자 요청).
//
// 코드 블록(CodeBlockDialog)과 같은 사용감:
//  - 미니 툴바 ⊞ 버튼 → 10×10 격자(TableGridPicker)에서 크기를 고르면
//    그 크기의 빈 표가 노드 텍스트(커서 위치)에 들어가고 이 창이 열린다
//  - 캔버스의 표 더블클릭 / 아웃라인·칸반 표의 ✎ → 기존 표 수정
//  - 창 안에서 **격자**(셀 입력) ↔ **MD**(파이프 원문) 보기를 전환할 수
//    있다 — 상단 툴바의 맵/아웃라인 토글과 같은 모양의 버튼
// Esc = 취소, Ctrl+Enter = 확인. document.body 포털로 화면 중앙에 띄운다.
//
// 표 문법은 mdTable.ts 의 파서가 읽는 그대로다: 헤더 행 + 구분선 + 데이터
// 행. 파서가 헤더 2칸·데이터 1행 이상을 요구하므로 최소 크기는 2행×2열.

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ThemeTokens } from '@/components/design-tokens/theme';
import { parseMdTable, sepCellOfAlign, type MdTableAlign } from './mdTable';
import { DialogXButton } from '@/components/ui/DialogFrame';

export const TABLE_MIN_ROWS = 2; // 헤더 + 데이터 1행
export const TABLE_MIN_COLS = 2;
export const TABLE_GRID_MAX = 10; // 격자 선택기 크기 (10×10)

// ── Markdown 표 만들기·끼워 넣기·바꾸기 ─────────────────────────────

// 셀 글자 정리 — 파서가 '|' 로 열을 나누고 줄로 행을 나누므로 둘 다 셀 안에
// 둘 수 없다. '|' 는 닮은 글자(¦)로, 줄바꿈은 공백으로.
function cleanCell(s: string): string {
  return String(s ?? '').replace(/\r?\n/g, ' ').replace(/\|/g, '¦').trim();
}

/** 헤더·행(·열 정렬) → `| a | b |\n|:---|---:|\n| 1 | 2 |` — 정렬은 GFM 구분선 콜론 */
export function buildMdTable(headers: string[], rows: string[][], aligns?: MdTableAlign[]): string {
  const cols = Math.max(TABLE_MIN_COLS, headers.length);
  const line = (cells: string[]) => {
    const out: string[] = [];
    for (let c = 0; c < cols; c++) out.push(cleanCell(cells[c] ?? ''));
    return `| ${out.join(' | ')} |`;
  };
  const body = rows.length ? rows : [[]];
  const sep = Array.from({ length: cols }, (_, c) => sepCellOfAlign(aligns?.[c] ?? null));
  return [line(headers), `|${sep.join('|')}|`, ...body.map(line)].join('\n');
}

/** rows×cols 빈 표 (헤더는 "열1, 열2 …" 로 채워 어디가 머리글인지 보이게) */
export function emptyTable(rows: number, cols: number): { headers: string[]; rows: string[][]; aligns: MdTableAlign[] } {
  const r = Math.max(TABLE_MIN_ROWS, rows);
  const c = Math.max(TABLE_MIN_COLS, cols);
  return {
    headers: Array.from({ length: c }, (_, i) => `열${i + 1}`),
    rows: Array.from({ length: r - 1 }, () => Array(c).fill('')),
    aligns: Array(c).fill(null),
  };
}

// 커서 위치에 표를 끼워 넣은 텍스트 — 앞뒤가 줄 경계가 아니면 줄바꿈을
// 보충한다 (spliceCodeBlock 과 같은 규칙)
export function spliceMdTable(value: string, cursor: number, md: string): string {
  const before = value.slice(0, cursor);
  const after = value.slice(cursor);
  const pre = before === '' || before.endsWith('\n') ? before : before + '\n';
  const post = after === '' || after.startsWith('\n') ? after : '\n' + after;
  return pre + md + post;
}

// 텍스트 안의 첫 표(코드 펜스 밖)를 새 표로 바꾼다. 표가 없으면 끝에 덧붙인다.
// 파서(parseMdTable)와 같은 판정: 파이프 행 두 줄 연속 + 헤더 2칸 이상.
export function replaceMdTable(value: string, md: string): string {
  const lines = String(value || '').split('\n');
  const isPipe = (l: string) => { const s = l.trim(); return s.length > 1 && s.includes('|'); };
  const isSep = (l: string) => {
    if (!isPipe(l)) return false;
    let s = l.trim();
    if (s.startsWith('|')) s = s.slice(1);
    if (s.endsWith('|')) s = s.slice(0, -1);
    const cells = s.split('|').map((c) => c.trim());
    return cells.length > 0 && cells.every((c) => /^:?-{2,}:?$/.test(c));
  };
  const cellCount = (l: string) => {
    let s = l.trim();
    if (s.startsWith('|')) s = s.slice(1);
    if (s.endsWith('|')) s = s.slice(0, -1);
    return s.split('|').length;
  };
  let inFence = false;
  for (let i = 0; i < lines.length - 1; i++) {
    if (/^\s*```/.test(lines[i])) { inFence = !inFence; continue; }
    if (inFence) continue;
    if (!isPipe(lines[i]) || isSep(lines[i]) || !isPipe(lines[i + 1])) continue;
    if (cellCount(lines[i]) < 2) continue;
    let j = i + 1;
    if (isSep(lines[j])) j++;
    const start = j;
    while (j < lines.length && isPipe(lines[j]) && !isSep(lines[j])) j++;
    if (j === start) continue; // 데이터 행 없음 — 파서도 표로 안 본다
    return [...lines.slice(0, i), ...md.split('\n'), ...lines.slice(j)].join('\n');
  }
  return (value ? value + '\n' : '') + md;
}

/** 텍스트에 (코드 펜스 밖) 표가 있는가 — 툴바 ⊞ 가 "삽입"과 "수정"을 가르는 기준 */
export function hasMdTable(value: string): boolean {
  return parseMdTable(value) !== null;
}

// ── 격자 선택기 — 10×10 칸 위로 마우스를 옮겨 크기를 고른다 ─────────────

export function TableGridPicker({
  t,
  onPick,
  onClose,
}: {
  t: ThemeTokens;
  onPick: (rows: number, cols: number) => void;
  onClose: () => void;
}) {
  const [hover, setHover] = useState<{ r: number; c: number }>({ r: TABLE_MIN_ROWS, c: TABLE_MIN_COLS });
  const rootRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', onDown, true);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown, true);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [onClose]);
  const CELL = 16;
  const pick = (r: number, c: number) => onPick(Math.max(TABLE_MIN_ROWS, r), Math.max(TABLE_MIN_COLS, c));
  return (
    <div
      ref={rootRef}
      data-testid="table-grid-picker"
      onMouseDown={(e) => e.preventDefault()}
      style={{
        position: 'absolute', top: 34, left: 0, zIndex: 5,
        background: t.surface, border: `1.5px solid ${t.border}`, borderRadius: 9,
        padding: 8, boxShadow: '0 6px 18px rgba(60,45,15,0.28)',
        display: 'flex', flexDirection: 'column', gap: 6, whiteSpace: 'nowrap',
      }}
    >
      <div style={{ fontSize: 12, color: t.text, fontWeight: 600 }}>
        표 {Math.max(TABLE_MIN_ROWS, hover.r)}행 × {Math.max(TABLE_MIN_COLS, hover.c)}열
        <span style={{ color: t.textMuted, fontWeight: 400 }}> (첫 행은 머리글 · 최소 2×2)</span>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${TABLE_GRID_MAX}, ${CELL}px)`,
          gap: 2,
        }}
        onMouseLeave={() => setHover({ r: TABLE_MIN_ROWS, c: TABLE_MIN_COLS })}
      >
        {Array.from({ length: TABLE_GRID_MAX * TABLE_GRID_MAX }, (_, i) => {
          const r = Math.floor(i / TABLE_GRID_MAX) + 1;
          const c = (i % TABLE_GRID_MAX) + 1;
          const on = r <= Math.max(TABLE_MIN_ROWS, hover.r) && c <= Math.max(TABLE_MIN_COLS, hover.c);
          return (
            <div
              key={i}
              data-grid-cell={`${r}x${c}`}
              onMouseEnter={() => setHover({ r, c })}
              onMouseUp={() => pick(r, c)}
              onClick={() => pick(r, c)}
              style={{
                width: CELL, height: CELL, boxSizing: 'border-box',
                border: `1px solid ${on ? t.primary : t.border}`,
                background: on ? (t.primarySoft ?? 'rgba(200,120,20,0.25)') : t.surface,
                borderRadius: 2, cursor: 'pointer',
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

// ── 표 편집 팝업 ───────────────────────────────────────────────────

export function TableDialog({
  t,
  initialMd,
  initialSize,
  onCancel,
  onSave,
}: {
  t: ThemeTokens;
  /** 기존 표 원문 (수정 모드). 없으면 initialSize 크기의 빈 표 */
  initialMd?: string;
  initialSize?: { rows: number; cols: number };
  onCancel: () => void;
  /** 확인 — 정리된 Markdown 표 한 덩어리 */
  onSave: (md: string) => void;
}) {
  const init = useMemo(() => {
    const parsed = initialMd ? parseMdTable(initialMd) : null;
    if (parsed) return { headers: parsed.headers, rows: parsed.rows, aligns: parsed.aligns };
    return emptyTable(initialSize?.rows ?? TABLE_MIN_ROWS, initialSize?.cols ?? TABLE_MIN_COLS);
  }, [initialMd, initialSize]);
  const [headers, setHeaders] = useState<string[]>(init.headers);
  const [rows, setRows] = useState<string[][]>(init.rows);
  // 열별 GFM 정렬 (구분선 콜론) — 커서 열에 정렬 버튼으로 지정 (2026-09-17)
  const [aligns, setAligns] = useState<MdTableAlign[]>(init.aligns);
  const setAlign = (a: MdTableAlign) => setAligns(aligns.map((x, i) => (i === cursor.c ? a : x)));
  const [view, setView] = useState<'grid' | 'md'>('grid');
  const [mdText, setMdText] = useState('');
  const [mdError, setMdError] = useState<string | null>(null);
  const firstRef = useRef<HTMLInputElement | null>(null);
  const mdRef = useRef<HTMLTextAreaElement | null>(null);
  // 커서가 있는 셀 — 행·열 추가/삭제의 기준 (r=-1 은 머리글). 2026-09-17
  // 사용자 요청: +행 = 커서 행 아래, −행 = 커서 행, +열 = 커서 열 오른쪽, −열 = 커서 열
  const [cursor, setCursor] = useState<{ r: number; c: number }>({ r: -1, c: 0 });
  const gridRef = useRef<HTMLTableElement | null>(null);
  const focusCell = (r: number, c: number) => {
    window.setTimeout(() => {
      const el = gridRef.current?.querySelector<HTMLInputElement>(`[data-table-cell="${r + 1}x${c + 1}"]`);
      el?.focus();
    }, 0);
  };

  useEffect(() => { window.setTimeout(() => firstRef.current?.focus(), 0); }, []);

  const cols = headers.length;
  const setCell = (r: number, c: number, v: string) => {
    if (r < 0) setHeaders(headers.map((h, i) => (i === c ? v : h)));
    else setRows(rows.map((row, i) => (i === r ? row.map((x, j) => (j === c ? v : x)) : row)));
  };
  // 커서 행 아래에 행 추가 (머리글에 있으면 맨 위 데이터 행으로)
  const addRow = () => {
    const at = Math.min(rows.length, cursor.r + 1);
    setRows([...rows.slice(0, at), Array(cols).fill(''), ...rows.slice(at)]);
    focusCell(at, cursor.c);
  };
  // 커서 행 삭제 (머리글·마지막 남은 데이터 행은 지우지 않는다)
  const canDelRow = cursor.r >= 0 && rows.length > 1;
  const delRow = () => {
    if (!canDelRow) return;
    setRows(rows.filter((_, i) => i !== cursor.r));
    const nr = Math.min(cursor.r, rows.length - 2);
    setCursor({ r: nr, c: cursor.c }); focusCell(nr, cursor.c);
  };
  // 커서 열 오른쪽에 열 추가
  const addCol = () => {
    const at = Math.min(cols, cursor.c + 1);
    setHeaders([...headers.slice(0, at), `열${cols + 1}`, ...headers.slice(at)]);
    setRows(rows.map((r) => [...r.slice(0, at), '', ...r.slice(at)]));
    setAligns([...aligns.slice(0, at), null, ...aligns.slice(at)]);
    setCursor({ r: cursor.r, c: at }); focusCell(cursor.r, at);
  };
  // 커서 열 삭제 (2열은 남긴다)
  const canDelCol = cols > TABLE_MIN_COLS;
  const delCol = () => {
    if (!canDelCol) return;
    setHeaders(headers.filter((_, i) => i !== cursor.c));
    setRows(rows.map((r) => r.filter((_, i) => i !== cursor.c)));
    setAligns(aligns.filter((_, i) => i !== cursor.c));
    const nc = Math.min(cursor.c, cols - 2);
    setCursor({ r: cursor.r, c: nc }); focusCell(cursor.r, nc);
  };

  // 격자 → MD (원문 보기로 전환)
  const toMd = () => { setMdText(buildMdTable(headers, rows, aligns)); setMdError(null); setView('md'); window.setTimeout(() => mdRef.current?.focus(), 0); };
  // MD → 격자 (원문을 읽어 셀로) — 표로 못 읽으면 전환하지 않고 알린다
  const toGrid = () => {
    const parsed = parseMdTable(mdText);
    if (!parsed) { setMdError('표로 읽을 수 없습니다 — 헤더 행과 데이터 행이 각각 한 줄 이상, 열이 2개 이상이어야 합니다.'); return; }
    setHeaders(parsed.headers); setRows(parsed.rows); setAligns(parsed.aligns); setMdError(null); setView('grid');
  };
  const save = () => {
    if (view === 'md') {
      const parsed = parseMdTable(mdText);
      if (!parsed) { setMdError('표로 읽을 수 없습니다 — 헤더 행과 데이터 행이 각각 한 줄 이상, 열이 2개 이상이어야 합니다.'); return; }
      onSave(buildMdTable(parsed.headers, parsed.rows, parsed.aligns));
      return;
    }
    onSave(buildMdTable(headers, rows, aligns));
  };

  const smallBtn = (label: string, onClick: () => void, title: string, disabled = false) => (
    <button
      type="button" onClick={onClick} title={title} disabled={disabled}
      style={{
        padding: '4px 9px', borderRadius: 6, border: `1px solid ${t.border}`,
        background: 'transparent', color: disabled ? t.border : t.text,
        fontSize: 12, fontWeight: 600, cursor: disabled ? 'default' : 'pointer',
      }}
    >
      {label}
    </button>
  );
  const alignBtn = (a: Exclude<MdTableAlign, null>, label: string, title: string) => {
    const on = (aligns[cursor.c] ?? 'left') === a;
    return (
      <button
        type="button" title={title} data-testid={`table-align-${a}`} aria-pressed={on}
        onClick={() => { setAlign(on && a !== 'left' ? null : a); focusCell(cursor.r, cursor.c); }}
        style={{
          width: 30, height: 26, borderRadius: 6, border: `1px solid ${on ? `${t.primaryBorder ?? t.primary}55` : t.border}`,
          background: on ? (t.primarySoft ?? 'rgba(200,120,20,0.18)') : 'transparent',
          color: on ? t.primary : t.text, fontSize: 14, fontWeight: 700, cursor: 'pointer',
        }}
      >
        {label}
      </button>
    );
  };
  const viewBtn = (which: 'grid' | 'md', label: string, title: string, onClick: () => void) => {
    const on = view === which;
    return (
      <button
        type="button" onClick={onClick} title={title}
        data-testid={`table-view-${which}`} aria-pressed={on}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          minWidth: 34, height: 28, padding: '0 8px', borderRadius: 8,
          background: on ? (t.primarySoft ?? 'rgba(200,120,20,0.18)') : (t.surfaceAlt ?? 'transparent'),
          color: on ? t.primary : t.text,
          border: `1px solid ${on ? `${t.primaryBorder ?? t.primary}55` : t.border}`,
          cursor: 'pointer', fontSize: 12, fontWeight: 700,
        }}
      >
        {label}
      </button>
    );
  };
  const cellInput = (r: number, c: number, value: string, isHead: boolean) => (
    <input
      key={`${r}-${c}`}
      ref={r === -1 && c === 0 ? firstRef : undefined}
      data-table-cell={`${r + 1}x${c + 1}`}
      value={value}
      onChange={(e) => setCell(r, c, e.target.value)}
      onFocus={() => setCursor({ r, c })}
      placeholder={isHead ? '머리글' : ''}
      style={{
        width: '100%', minWidth: 72, boxSizing: 'border-box', padding: '5px 8px',
        border: 'none', background: 'transparent', outline: 'none',
        color: t.text, fontSize: 12.5, fontWeight: isHead ? 700 : 400,
        textAlign: aligns[c] ?? 'left',
      }}
    />
  );

  return createPortal(
    <div
      data-testid="table-dialog"
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onCancel(); }
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); save(); }
      }}
      style={{
        // 노드 편집 오버레이(zIndex 1000)보다 위 — CodeBlockDialog 와 같은 층
        position: 'fixed', inset: 0, zIndex: 1200,
        background: 'rgba(15,14,10,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        data-testid="table-panel"
        style={{
          position: 'relative',
          width: 'min(760px, calc(100vw - 48px))',
          maxHeight: 'calc(100vh - 48px)',
          background: t.surface,
          border: `1.5px solid ${t.border}`,
          borderRadius: 12,
          boxShadow: '0 12px 40px rgba(20,15,5,0.45)',
          padding: 16,
          display: 'flex', flexDirection: 'column', gap: 10,
        }}
      >
        <DialogXButton t={t} testId="table-dialog-x" onClose={onCancel} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingRight: 34 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: t.text, flex: 1 }}>
            표 {initialMd ? '수정' : '삽입'}
            <span style={{ fontSize: 12, color: t.textMuted, fontWeight: 400, marginLeft: 8 }}>
              {view === 'grid' ? `${rows.length + 1}행 × ${cols}열` : 'Markdown 원문'}
            </span>
          </div>
          {/* 격자 ↔ MD 보기 — 상단 툴바의 맵/아웃라인 토글과 같은 모양 */}
          {viewBtn('grid', '⊞ 격자', '격자 보기 — 셀을 직접 입력합니다', () => view !== 'grid' && toGrid())}
          {viewBtn('md', 'MD', 'Markdown 원문 보기 — 파이프(|) 표를 직접 고칩니다', () => view !== 'md' && toMd())}
        </div>

        {view === 'grid' ? (
          <>
            <div style={{ overflow: 'auto', maxHeight: '55vh', border: `1px solid ${t.border}`, borderRadius: 8 }}>
              <table ref={gridRef} data-testid="table-dialog-grid" style={{ borderCollapse: 'collapse', width: '100%' }}>
                <thead>
                  <tr style={{ background: t.surfaceAlt ?? 'rgba(0,0,0,0.05)' }}>
                    {headers.map((h, c) => (
                      <th key={c} style={{ border: `1px solid ${t.border}`, padding: 0, textAlign: 'left' }}>
                        {cellInput(-1, c, h, true)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, r) => (
                    <tr key={r}>
                      {row.map((v, c) => (
                        <td key={c} style={{ border: `1px solid ${t.border}`, padding: 0 }}>
                          {cellInput(r, c, v, false)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {smallBtn('+ 행', addRow, '커서가 있는 행 아래에 행 추가')}
              {smallBtn('− 행', delRow, canDelRow ? '커서가 있는 행 삭제' : '머리글 행과 마지막 데이터 행은 지울 수 없습니다', !canDelRow)}
              {smallBtn('+ 열', addCol, '커서가 있는 열 오른쪽에 열 추가')}
              {smallBtn('− 열', delCol, canDelCol ? '커서가 있는 열 삭제' : '열은 2개 이상이어야 합니다', !canDelCol)}
              <span style={{ width: 1, height: 18, background: t.border, margin: '0 4px' }} />
              {alignBtn('left', '⇤', '커서 열 왼쪽 맞춤 (GFM `:---`)')}
              {alignBtn('center', '↔', '커서 열 가운데 맞춤 (GFM `:---:`)')}
              {alignBtn('right', '⇥', '커서 열 오른쪽 맞춤 (GFM `---:`)')}
              <span style={{ fontSize: 11.5, color: t.textMuted, marginLeft: 6 }}>
                커서 셀 기준 · 정렬은 열 단위(GFM) · 셀 안의 | 는 ¦ 로 · Tab 으로 다음 칸
              </span>
            </div>
          </>
        ) : (
          <>
            <textarea
              ref={mdRef}
              data-testid="table-md-input"
              value={mdText}
              onChange={(e) => { setMdText(e.target.value); setMdError(null); }}
              rows={Math.min(16, Math.max(6, mdText.split('\n').length + 1))}
              spellCheck={false}
              style={{
                width: '100%', boxSizing: 'border-box', resize: 'vertical', minHeight: 140,
                padding: '8px 10px', borderRadius: 8, border: `1px solid ${t.border}`,
                background: '#ECEFF3', color: '#334155', fontSize: 12.5, lineHeight: 1.5,
                outline: 'none', whiteSpace: 'pre', overflowX: 'auto',
                fontFamily: "ui-monospace, 'Cascadia Mono', 'Consolas', 'D2Coding', monospace",
              }}
            />
            {mdError && <div style={{ fontSize: 12, color: '#B42318' }}>{mdError}</div>}
          </>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            type="button" onClick={onCancel}
            style={{
              padding: '7px 14px', borderRadius: 7, border: `1px solid ${t.border}`,
              background: 'transparent', color: t.textMuted, fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
            }}
          >
            취소 (Esc)
          </button>
          <button
            type="button" data-testid="table-dialog-save" onClick={save}
            style={{
              padding: '7px 16px', borderRadius: 7, border: 'none',
              background: t.primary, color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
            }}
          >
            확인 (Ctrl+Enter)
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
