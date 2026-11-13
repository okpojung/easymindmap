// NoteViewerPopover — 노드의 노트 인디케이터(문단 T/코드 C/표 ⊞/체크 ✓)를
// 클릭하면 뜨는 노트 뷰어 팝업. 클릭한 종류의 노트만 표시한다.
// 글자 편집은 좌측 노트·태그 탭에서 하고, 체크리스트의 ☑/☐만 여기서
// 바로 토글할 수 있다 (nodeId를 받은 경우).
// HTML 내보내기 뷰어의 상세 패널과 동일한 규칙으로 문단(리치 포함) /
// 코드(언어 라벨 + 복사 버튼) / 표 / 체크리스트를 렌더링한다.
//
// 창 조작: 제목줄 드래그 = 이동, 우하단 모서리 드래그(CSS resize) = 크기
// 조절. (편집은 좌측 노트·태그 탭에서)

import { Fragment, useState, type ReactNode } from 'react';
import { cellLines, splitPipeCells } from '@/editor/node-renderer/mdTable';
import { useDocumentStore } from '@/stores/documentStore';
import { parseInlineMarks, stripInlineMarks } from '@/editor/node-renderer/inlineMarks';
import { flattenNodeText } from '@/editor/node-renderer/RichTextHtml';
import { copyTable, pipeTextToTable } from '@/utils/copyTable';
import type { ThemeTokens } from '@/components/design-tokens/theme';
import type { NoteBlock } from '@/editor/__samples__/types';
import { gridCharSpans } from '@/utils/monoGrid';
import { useNoteHtmlResolver } from '@/utils/imageSrc';
import { useTr } from '@/i18n';

// Markdown 링크 — [라벨](url). 노트 원문에 그대로 남아 있는 링크를
// 클릭 가능한 <a>로 렌더링한다 (MD 불러오기의 인용문 노트 등).
const MD_LINK_RE = /\[([^\]]*)\]\((https?:\/\/[^)\s]+)(?:\s+"[^"]*")?\)/g;

// 한 줄 텍스트 → 인라인 마커 span + Markdown 링크 <a> 렌더링
function InlineText({ t, text }: { t: ThemeTokens; text: string }) {
  const parts: ReactNode[] = [];
  let last = 0;
  let key = 0;
  const marks = (s: string) =>
    parseInlineMarks(s).map((sg) => (
      <span key={`m${key++}`} style={{
        fontWeight: sg.b ? 700 : undefined,
        fontStyle: sg.i ? 'italic' : undefined,
        textDecoration: [sg.s ? 'line-through' : '', sg.u ? 'underline' : '']
          .filter(Boolean).join(' ') || undefined,
        background: sg.h ? '#FFE066' : undefined,
        // 형광펜 배경 위 글자는 진한 고정색 (다크 모드 가독성)
        color: sg.h ? '#1F1B16' : undefined,
        borderRadius: sg.h ? 2 : undefined,
        padding: sg.h ? '0 1px' : undefined,
      }}>{sg.text}</span>
    ));
  for (const m of text.matchAll(MD_LINK_RE)) {
    const idx = m.index ?? 0;
    if (idx > last) parts.push(...marks(text.slice(last, idx)));
    parts.push(
      <a key={`a${key++}`} href={m[2]} target="_blank" rel="noopener noreferrer"
         style={{ color: t.primary, textDecoration: 'underline', wordBreak: 'break-all' }}>
        {m[1].trim() || m[2]}
      </a>,
    );
    last = idx + m[0].length;
  }
  if (last < text.length) parts.push(...marks(text.slice(last)));
  if (parts.length === 0) parts.push(...marks(text));
  return <>{parts}</>;
}


function CopyButton({ t, text }: { t: ThemeTokens; text: string }) {
  const [copied, setCopied] = useState(false);
  const tr = useTr();

  const copy = () => {
    const done = () => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(done, done);
    } else {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch { /* noop */ }
      ta.remove();
      done();
    }
  };

  return (
    <button
      onClick={copy}
      title={tr('editor.note.copyCode')}
      style={{
        border: `1px solid ${t.border}`, borderRadius: 4, background: t.surface,
        fontSize: 10, padding: '1px 7px', cursor: 'pointer', color: t.text,
        fontWeight: 600,
      }}
    >
      {copied ? tr('common.copied') : '⧉'}
    </button>
  );
}

// 노트 문단 우상단 ⧉ 복사 — 마커를 뗀 표시 텍스트를 클립보드에
function NoteParagraphCopyButton({ t, text }: { t: ThemeTokens; text: string }) {
  const [copied, setCopied] = useState(false);
  const tr = useTr();
  return (
    <button
      data-note-para-copy
      title={tr('editor.note.copyParagraph')}
      onClick={(e) => {
        e.stopPropagation();
        const clean = stripInlineMarks(text).trim();
        if (!clean) return;
        void navigator.clipboard?.writeText(clean).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        }).catch(() => {});
      }}
      onPointerDown={(e) => e.stopPropagation()}
      style={{
        position: 'absolute', top: 0, right: 0, zIndex: 1,
        border: `1px solid ${t.border}`, background: t.surface, borderRadius: 4,
        padding: '1px 5px', cursor: 'pointer', fontSize: 10,
        fontWeight: 700, color: copied ? '#15803D' : t.textMuted,
      }}
    >
      {copied ? tr('common.copied') : '⧉'}
    </button>
  );
}

// 표 셀 한 칸 — 셀 안 `<br>` 마다 줄을 바꾼다 (2026-10-15)
function cellBody(t: ThemeTokens, cell: string): ReactNode {
  return cellLines(cell).map((ln, i) => (
    <Fragment key={i}>{i > 0 ? <br /> : null}<InlineText t={t} text={ln} /></Fragment>
  ));
}

// 노트 표 우상단 ⧉ 복사 — 엑셀(TSV)·웹 에디터(HTML 표) 두 형식 동시 복사
function NoteTableCopyButton({ t, text }: { t: ThemeTokens; text: string }) {
  const [copied, setCopied] = useState(false);
  const tr = useTr();
  return (
    <button
      data-note-table-copy
      title={tr('editor.note.copyTable')}
      onClick={(e) => {
        e.stopPropagation();
        const tbl = pipeTextToTable(text);
        if (!tbl) return;
        void copyTable(tbl.headers, tbl.rows).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        });
      }}
      onPointerDown={(e) => e.stopPropagation()}
      style={{
        position: 'absolute', top: 2, right: 0, zIndex: 1,
        border: `1px solid ${t.border}`, background: t.surface, borderRadius: 4,
        padding: '1px 5px', cursor: 'pointer', fontSize: 10,
        fontWeight: 700, color: copied ? '#15803D' : t.textMuted,
      }}
    >
      {copied ? tr('common.copied') : '⧉'}
    </button>
  );
}

export function NoteBlockView({ t, block, fs, family, onToggleCheck, onEditTable, onEditCode, hideActions = false }: {
  t: ThemeTokens; block: NoteBlock; fs: number; family?: string; hideActions?: boolean;
  // 체크리스트 블록의 ☑/☐ 클릭 토글 — nodeId를 아는 호출자만 넘긴다
  onToggleCheck?: () => void;
  // 표 블록 ✎ 편집 — 표 편집 팝업(격자/MD)을 연다. nodeId를 아는 호출자만 (2026-10-15)
  onEditTable?: () => void;
  // 코드 블록 ✎ 편집 — 코드블록 편집 팝업을 연다 (2026-10-15, 노드 내용의 코드와 같은 창)
  onEditCode?: () => void;
}) {
  // 노트 사진이 **우리 저장소**에 있으면 그릴 때 토큰을 붙인다 (2026-08-20).
  // 토큰은 문서에 저장하지 않는다 — 저장하면 만료되는 날 사진이 전부 깨진다.
  const resolveNoteHtml = useNoteHtmlResolver();
  const tr = useTr();
  // 폐기된 옛 타입(warning/tip)은 문단으로 렌더 (하위호환)
  const type =
    (block.type as string) === 'warning' || (block.type as string) === 'tip'
      ? 'paragraph'
      : block.type;

  if (type === 'table') {
    // 구분선 행(|---|)은 표시하지 않는다 (예전 데이터 하위호환). 셀 안의
    // 인라인 마커(**굵게** 등)·링크는 서식으로 렌더링 — 마커 문자 숨김.
    // 셀 안 `<br>` 은 줄바꿈이다 (2026-10-15, 맵·뷰어와 같은 규칙).
    const rows = String(block.text || '').split('\n')
      .filter((r) => r.trim() && !/^(?=[^-]*-)[\s|:\-]+$/.test(r))
      .map((r) => r.replace(/^\s*\|/, '').replace(/\|\s*$/, ''));
    return (
      // paddingTop = 표 바깥 위 복사(⧉) 스트립 — 머리글과 겹치지 않음
      <div style={{ position: 'relative', paddingTop: hideActions ? 0 : 20 }}>
      {/* 표 복사(⧉) — 엑셀(TSV)·웹 에디터(HTML 표) 동시 형식 */}
      {!hideActions && <NoteTableCopyButton t={t} text={String(block.text || '')} />}
      {/* ✎ 편집 — 노드 안 표와 같은 표 편집 팝업(격자/MD · ↵ 줄바꿈 · 창 이동)으로 (2026-10-15 사용자 요청) */}
      {onEditTable && (
        <button
          data-testid="note-viewer-table-edit"
          title={tr('editor.note.editTable')}
          onClick={(e) => { e.stopPropagation(); onEditTable(); }}
          onPointerDown={(e) => e.stopPropagation()}
          style={{
            position: 'absolute', top: 2, right: 28, zIndex: 1,
            border: `1px solid ${t.border}`, background: t.surface, borderRadius: 4,
            padding: '1px 6px', cursor: 'pointer', fontSize: 10, fontWeight: 700, color: t.textMuted,
          }}
        >✎ {tr('editor.note.editTableShort')}</button>
      )}
      <table style={{ borderCollapse: 'collapse', width: '100%', marginBottom: 8,
        fontSize: Math.max(9, fs - 1), fontFamily: family }}>
        <tbody>
          {rows.map((row, r) => (
            <tr key={r}>
              {splitPipeCells(row).map((cell, c) =>
                r === 0 ? (
                  <th key={c} style={{
                    border: `1px solid ${t.border}`, padding: '4px 7px',
                    textAlign: 'left', background: t.surfaceAlt, fontWeight: 700,
                  }}>{cell.trim() ? cellBody(t, cell) : '\u00a0'}</th>
                ) : (
                  <td key={c} style={{
                    border: `1px solid ${t.border}`, padding: '4px 7px', textAlign: 'left',
                  }}>{cell.trim() ? cellBody(t, cell) : '\u00a0'}</td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    );
  }

  if (type === 'code_block') {
    return (
      <div style={{ marginBottom: 8, border: `1px solid ${t.border}`, borderRadius: 6, overflow: 'hidden' }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '3px 8px', background: t.surfaceAlt, fontSize: 10, fontWeight: 700,
          color: t.textMuted, letterSpacing: 0.4, textTransform: 'uppercase',
        }}>
          <span>{block.lang || 'code'}</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {onEditCode && (
              <button
                data-testid="note-viewer-code-edit"
                title={tr('editor.note.editCode')}
                onClick={(e) => { e.stopPropagation(); onEditCode(); }}
                onPointerDown={(e) => e.stopPropagation()}
                style={{
                  border: `1px solid ${t.border}`, background: t.surface, borderRadius: 4,
                  padding: '1px 6px', cursor: 'pointer', fontSize: 10, fontWeight: 700,
                  color: t.textMuted, textTransform: 'none', letterSpacing: 0,
                }}
              >✎ {tr('editor.note.editTableShort')}</button>
            )}
            {!hideActions && <CopyButton t={t} text={block.text} />}
          </span>
        </div>
        {/* 격자 배치 — 맵 캔버스와 같은 규칙 (utils/monoGrid) */}
        <pre style={{
          margin: 0, padding: '7px 9px', fontSize: Math.max(9, fs - 2), lineHeight: 1.5,
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          whiteSpace: 'pre', overflowX: 'auto', background: t.surface,
        }}>
          {String(block.text || '').split('\n').map((ln, li) => (
            <div key={li}>
              {gridCharSpans(ln).map((c, ci) => (
                <span key={ci} style={{ display: 'inline-block', width: `${c.em}em` }}>
                  {c.ch === ' ' ? '\u00A0' : c.ch}
                </span>
              ))}
              {ln === '' ? '\u00A0' : null}
            </div>
          ))}
        </pre>
      </div>
    );
  }

  // 리치 문단(웹 기사 붙여넣기) — sanitize된 HTML을 사진·서식째 표시
  if (type === 'paragraph' && block.html) {
    return (
      <div style={{ position: 'relative' }}>
        {/* 문단 복사(⧉) — 표시 텍스트를 클립보드에 (2026-07-31) */}
        {!hideActions && <NoteParagraphCopyButton t={t} text={String(block.text || '')} />}
        <div
          className="mm-rich-note"
          style={{
            marginBottom: 6, fontSize: fs, fontFamily: family, lineHeight: 1.6,
            // ⧉ 버튼 폭만큼 오른쪽 여백 예약 — 첫 줄 글자가 버튼 밑으로
            // 흐르지 않는다 (2026-07-31)
            paddingRight: hideActions ? 0 : 30,
          }}
          dangerouslySetInnerHTML={{ __html: resolveNoteHtml(block.html) ?? '' }}
        />
      </div>
    );
  }

  // 문단·체크: 글자 크기 10, 입력한 줄 그대로 표시하되 인라인 마커
  // (**굵게** ==하이라이트== 등)는 서식으로, [라벨](url)은 링크로 렌더링
  // — 마커 문자는 숨김.
  return (
    <div style={{ position: 'relative' }}>
    {type === 'paragraph' && !hideActions && <NoteParagraphCopyButton t={t} text={String(block.text || '')} />}
    <div style={{
      marginBottom: 6, lineHeight: 1.55, fontSize: fs, fontFamily: family,
      overflowX: 'auto',
      // 문단이면 ⧉ 버튼 폭만큼 오른쪽 여백 예약 (글자와 겹침 방지)
      paddingRight: type === 'paragraph' && !hideActions ? 30 : undefined,
    }}>
      {String(block.text).split('\n').map((line, li) => (
        // 문단은 긴 줄을 창 폭에서 접는다 (2026-09-11) — html 없는 붙여넣기
        // 글이 창 밖으로 한 줄로 흘렀다. 체크는 전처럼 줄 그대로.
        <div key={li} style={{ whiteSpace: type === 'paragraph' ? 'pre-wrap' : 'pre' }}>
          {li === 0 && type === 'checklist' ? (
            // 체크 글리프 클릭 = 완료/미완료 토글 (팝업에서 바로 체크).
            // 클릭 판정은 좌우 5px 여유 — 글리프만 노리면 빗나간다.
            // ⚠️ 위아래 padding 은 주지 않는다: 이 블록이 overflowX:'auto'
            // 라 세로가 한 줄보다 커지면 **줄마다 세로 스크롤바(회색 바)**
            // 가 생긴다 (2026-08-09 보고). inline-block 높이가 이미
            // 줄높이(1.55)라 세로 판정은 충분하다.
            <span
              data-note-popup-check
              role="checkbox" aria-checked={!!block.checked} tabIndex={onToggleCheck ? 0 : undefined}
              onKeyDown={(e) => { if (onToggleCheck && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); e.stopPropagation(); onToggleCheck(); } }}
              data-checked={block.checked ? '1' : '0'}
              onClick={onToggleCheck ? (e) => { e.stopPropagation(); onToggleCheck(); } : undefined}
              onPointerDown={(e) => e.stopPropagation()}
              title={onToggleCheck
                ? (block.checked ? tr('editor.note.markUndone') : tr('editor.note.markDone'))
                : undefined}
              style={{
                display: 'inline-block', padding: '0 5px', margin: '0 -5px',
                marginRight: 0, cursor: onToggleCheck ? 'pointer' : 'default',
                color: block.checked ? '#22A06B' : t.textMuted,
              }}
            >{block.checked ? '☑' : '☐'}</span>
          ) : null}
          {li === 0 && type === 'checklist' ? ' ' : ''}
          <InlineText t={t} text={line} />
        </div>
      ))}
    </div>
    </div>
  );
}

