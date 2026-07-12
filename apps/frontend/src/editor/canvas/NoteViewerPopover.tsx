// NoteViewerPopover — 노드의 노트 인디케이터(문단 T/코드 C/표 ⊞/체크 ✓)를
// 클릭하면 뜨는 읽기 전용 노트 뷰어 팝업. 클릭한 종류의 노트만 표시한다.
// HTML 내보내기 뷰어의 상세 패널과 동일한 규칙으로 문단(리치 포함) /
// 코드(언어 라벨 + 복사 버튼) / 표 / 체크리스트를 렌더링한다.
//
// 창 조작: 제목줄 드래그 = 이동, 우하단 모서리 드래그(CSS resize) = 크기
// 조절. (편집은 좌측 노트·태그 탭에서)

import { useRef, useState } from 'react';
import type { ThemeTokens } from '@/components/design-tokens/theme';
import type { NoteBlock } from '@/editor/__samples__/types';

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

function NoteBlockView({ t, block }: { t: ThemeTokens; block: NoteBlock }) {
  // 폐기된 옛 타입(warning/tip)은 문단으로 렌더 (하위호환)
  const type =
    (block.type as string) === 'warning' || (block.type as string) === 'tip'
      ? 'paragraph'
      : block.type;

  if (type === 'table') {
    const rows = String(block.text || '').split('\n').filter((r) => r.trim());
    return (
      <table style={{ borderCollapse: 'collapse', width: '100%', marginBottom: 8, fontSize: 11.5 }}>
        <tbody>
          {rows.map((row, r) => (
            <tr key={r}>
              {row.split('|').map((cell, c) =>
                r === 0 ? (
                  <th key={c} style={{
                    border: `1px solid ${t.border}`, padding: '4px 7px',
                    textAlign: 'left', background: t.surfaceAlt, fontWeight: 700,
                  }}>{cell.trim()}</th>
                ) : (
                  <td key={c} style={{
                    border: `1px solid ${t.border}`, padding: '4px 7px', textAlign: 'left',
                  }}>{cell.trim()}</td>
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
          margin: 0, padding: '7px 9px', fontSize: 10, lineHeight: 1.5,
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
        style={{ marginBottom: 6, fontSize: 10.5, lineHeight: 1.6 }}
        dangerouslySetInnerHTML={{ __html: block.html }}
      />
    );
  }

  // 문단·체크: 글자 크기 10, 입력한 줄 그대로(pre) 표시 — 창 폭보다 긴
  // 줄은 블록 가로 스크롤바로 본다.
  return (
    <div style={{
      marginBottom: 6, lineHeight: 1.5, whiteSpace: 'pre', fontSize: 10,
      overflowX: 'auto',
    }}>
      {type === 'checklist' ? (block.checked ? '☑ ' : '☐ ') : ''}
      {block.text}
    </div>
  );
}

export function NoteViewerPopover({ t, title, heading, accent, notes, onClose }: Props) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  // 제목줄 드래그로 옮긴 위치 — 옮기기 전에는 기본 위치(우측 상단 도킹)
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{
    pointerId: number; px: number; py: number; left: number; top: number;
  } | null>(null);

  const accentColor = accent ?? t.primary;

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
        width: 300, maxWidth: '85%',
        maxHeight: pos ? '85%' : '62%', minWidth: 220, minHeight: 120,
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

      <div style={{ padding: '9px 14px 12px', overflow: 'auto', flex: 1, minHeight: 0 }}>
        {notes.map((block) => (
          <NoteBlockView key={block.id} t={t} block={block} />
        ))}
      </div>
    </div>
  );
}
