// NoteViewerPopover — 노드의 노트 인디케이터(문단 T/코드 C/표 ⊞/체크 ✓)를
// 클릭하면 뜨는 읽기 전용 노트 뷰어 팝업. 클릭한 종류의 노트만 표시한다.
// HTML 내보내기 뷰어의 상세 패널과 동일한 규칙으로 문단(리치 포함) /
// 코드(언어 라벨 + 복사 버튼) / 표 / 체크리스트를 렌더링한다.
//
// 창 조작: 제목줄 드래그 = 이동, 우하단 모서리 드래그(CSS resize) = 크기
// 조절. (편집은 좌측 노트·태그 탭에서)

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useDocumentStore } from '@/stores/documentStore';
import { parseInlineMarks } from '@/editor/node-renderer/inlineMarks';
import type { ThemeTokens } from '@/components/design-tokens/theme';
import type { NoteBlock } from '@/editor/__samples__/types';

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
        borderRadius: sg.h ? 2 : undefined,
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

interface Props {
  t: ThemeTokens;
  title: string; // 노드 제목
  heading?: string; // 노트 종류 라벨 (문단 노트 / 코드 노트 / 표 노트 / 체크리스트)
  accent?: string; // 노트 종류 색 (인디케이터 배지와 동일)
  notes: NoteBlock[];
  onClose: () => void;
}

function CopyButton({ t, text }: { t: ThemeTokens; text: string }) {
  const [copied, setCopied] = useState(false);

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
      style={{
        border: `1px solid ${t.border}`, borderRadius: 4, background: t.surface,
        fontSize: 10, padding: '1px 7px', cursor: 'pointer', color: t.text,
        fontWeight: 600,
      }}
    >
      {copied ? '복사됨 ✓' : '⧉ 복사'}
    </button>
  );
}

function NoteBlockView({ t, block, fs, family }: {
  t: ThemeTokens; block: NoteBlock; fs: number; family?: string;
}) {
  // 폐기된 옛 타입(warning/tip)은 문단으로 렌더 (하위호환)
  const type =
    (block.type as string) === 'warning' || (block.type as string) === 'tip'
      ? 'paragraph'
      : block.type;

  if (type === 'table') {
    // 구분선 행(|---|)은 표시하지 않는다 (예전 데이터 하위호환). 셀 안의
    // 인라인 마커(**굵게** 등)·링크는 서식으로 렌더링 — 마커 문자 숨김.
    const rows = String(block.text || '').split('\n')
      .filter((r) => r.trim() && !/^[\s|:\-]+$/.test(r))
      .map((r) => r.replace(/^\s*\|/, '').replace(/\|\s*$/, ''));
    return (
      <table style={{ borderCollapse: 'collapse', width: '100%', marginBottom: 8,
        fontSize: Math.max(9, fs - 1), fontFamily: family }}>
        <tbody>
          {rows.map((row, r) => (
            <tr key={r}>
              {row.split('|').map((cell, c) =>
                r === 0 ? (
                  <th key={c} style={{
                    border: `1px solid ${t.border}`, padding: '4px 7px',
                    textAlign: 'left', background: t.surfaceAlt, fontWeight: 700,
                  }}><InlineText t={t} text={cell.trim()} /></th>
                ) : (
                  <td key={c} style={{
                    border: `1px solid ${t.border}`, padding: '4px 7px', textAlign: 'left',
                  }}><InlineText t={t} text={cell.trim()} /></td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
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
          <CopyButton t={t} text={block.text} />
        </div>
        <pre style={{
          margin: 0, padding: '7px 9px', fontSize: Math.max(9, fs - 2), lineHeight: 1.5,
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          whiteSpace: 'pre', overflowX: 'auto', background: t.surface,
        }}>{block.text}</pre>
      </div>
    );
  }

  // 리치 문단(웹 기사 붙여넣기) — sanitize된 HTML을 사진·서식째 표시
  if (type === 'paragraph' && block.html) {
    return (
      <div
        className="mm-rich-note"
        style={{ marginBottom: 6, fontSize: fs, fontFamily: family, lineHeight: 1.6 }}
        dangerouslySetInnerHTML={{ __html: block.html }}
      />
    );
  }

  // 문단·체크: 글자 크기 10, 입력한 줄 그대로 표시하되 인라인 마커
  // (**굵게** ==하이라이트== 등)는 서식으로, [라벨](url)은 링크로 렌더링
  // — 마커 문자는 숨김.
  return (
    <div style={{
      marginBottom: 6, lineHeight: 1.55, fontSize: fs, fontFamily: family,
      overflowX: 'auto',
    }}>
      {String(block.text).split('\n').map((line, li) => (
        <div key={li} style={{ whiteSpace: 'pre' }}>
          {li === 0 && type === 'checklist' ? (block.checked ? '☑ ' : '☐ ') : ''}
          <InlineText t={t} text={line} />
        </div>
      ))}
    </div>
  );
}

export function NoteViewerPopover({ t, title, heading, accent, notes, onClose }: Props) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const headRef = useRef<HTMLDivElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  // 제목줄 드래그로 옮긴 위치 — 옮기기 전에는 기본 위치(우측 상단 도킹)
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{
    pointerId: number; px: number; py: number; left: number; top: number;
  } | null>(null);

  const accentColor = accent ?? t.primary;

  // 노트 글꼴·크기 (맵 설정 — 기본 13pt)
  const noteFont = useDocumentStore((s) => s.map.settings?.noteFont);
  const fs = noteFont?.size && noteFont.size > 0 ? noteFont.size : 13;
  const family = noteFont?.family && noteFont.family.trim() ? noteFont.family : undefined;

  // 자동 크기 — 내용에 맞추되 최소 220×120 ~ 최대 "화면 4분할 시 우측
  // 상단"(화면의 1/2 × 1/2) 범위. 첫 렌더는 최대 폭으로 그려 내용의
  // 자연 크기(scrollWidth/Height)를 재고, 페인트 전에 줄인다.
  const [autoSize, setAutoSize] = useState<{ w: number; h: number } | null>(null);
  useLayoutEffect(() => {
    setAutoSize(null); // 노트·폰트가 바뀌면 다시 측정
  }, [notes, fs, family]);
  useLayoutEffect(() => {
    if (autoSize) return;
    const body = bodyRef.current;
    const head = headRef.current;
    if (!body || !head) return;
    const maxW = Math.floor(window.innerWidth / 2);
    const maxH = Math.floor(window.innerHeight / 2);
    // 자연 폭 측정 — 블록 요소는 컨테이너 폭을 다 차지하므로 잠시
    // max-content로 줄여 내용의 실제 폭을 잰다
    const prevW = body.style.width;
    body.style.width = 'max-content';
    const natW = body.offsetWidth;
    body.style.width = prevW;
    const w = Math.min(maxW, Math.max(220, natW + 6));
    const h = Math.min(maxH, Math.max(120, body.scrollHeight + head.offsetHeight + 8));
    setAutoSize({ w, h });
  }, [autoSize]);

  return (
    <div
      ref={rootRef}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
      // 기본 크기(가로 300 · 세로 최대 62%) — 우하단 모서리를 드래그해
      // 크기를 바꿀 수 있다 (CSS resize). 내용이 넘치면 스크롤.
      // [서버 연결 예정] 시스템 기본 크기는 관리자 설정(system_settings),
      // 사용자별 크기는 users.ui_preferences_json.noteViewer 로 이관 —
      // docs/02-domain/db-schema.md §향후 관리 테이블, 32-settings.md 참조.
      style={{
        position: 'absolute',
        ...(pos ? { left: pos.x, top: pos.y } : { right: 14, top: 60 }),
        // 자동 크기 — 측정 전 한 프레임은 최대 폭으로 그려 내용을 잰다
        width: autoSize ? autoSize.w : Math.floor(window.innerWidth / 2),
        ...(autoSize ? { height: autoSize.h } : {}),
        // 최대 = "화면 4분할 시 우측 상단" — 브라우저 화면의 1/2 × 1/2
        maxWidth: Math.floor(window.innerWidth / 2),
        maxHeight: Math.floor(window.innerHeight / 2),
        minWidth: 220, minHeight: 120,
        resize: 'both', overflow: 'auto',
        background: t.surface,
        border: `1px solid ${t.border}`, borderRadius: 10,
        boxShadow: '0 8px 24px rgba(80, 60, 20, 0.18)', zIndex: 30,
        color: t.text,
        display: 'flex', flexDirection: 'column',
      }}
    >
      {/* 제목줄 — 드래그하면 창이 움직인다 */}
      <div
        ref={headRef}
        title="드래그하여 이동"
        onPointerDown={(e) => {
          e.stopPropagation();
          const root = rootRef.current;
          if (!root) return;
          dragRef.current = {
            pointerId: e.pointerId,
            px: e.clientX, py: e.clientY,
            left: root.offsetLeft, top: root.offsetTop,
          };
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const d = dragRef.current;
          if (!d || d.pointerId !== e.pointerId) return;
          setPos({
            x: Math.max(0, d.left + e.clientX - d.px),
            y: Math.max(0, d.top + e.clientY - d.py),
          });
        }}
        onPointerUp={(e) => {
          if (dragRef.current?.pointerId === e.pointerId) dragRef.current = null;
        }}
        style={{
          display: 'flex', alignItems: 'center', gap: 7,
          padding: '8px 12px', cursor: 'move', userSelect: 'none',
          borderBottom: `1px solid ${t.divider}`,
          background: t.surfaceAlt,
          borderRadius: '10px 10px 0 0', flexShrink: 0,
        }}
      >
        <span style={{
          width: 9, height: 9, borderRadius: 3, background: accentColor, flexShrink: 0,
        }} />
        <span style={{
          fontSize: 10.5, fontWeight: 700, color: t.textSubtle,
          letterSpacing: 0.4, flexShrink: 0,
        }}>{heading ?? '메모'}</span>
        <span style={{
          fontSize: 12, fontWeight: 700, color: t.text, flex: 1, minWidth: 0,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{title}</span>
        <button
          onClick={onClose}
          onPointerDown={(e) => e.stopPropagation()}
          title="닫기"
          style={{
            border: 'none', background: 'none', fontSize: 14,
            cursor: 'pointer', color: t.textMuted, flexShrink: 0,
            padding: 0, lineHeight: 1,
          }}
        >
          ✕
        </button>
      </div>

      <div ref={bodyRef}
        style={{ padding: '9px 14px 12px', overflow: 'auto', flex: 1, minHeight: 0 }}>
        {notes.map((block) => (
          <NoteBlockView key={block.id} t={t} block={block} fs={fs} family={family} />
        ))}
      </div>
    </div>
  );
}
