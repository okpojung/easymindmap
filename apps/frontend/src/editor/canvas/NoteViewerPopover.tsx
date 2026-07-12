// NoteViewerPopover — 에디터 캔버스에서 노드의 📝 인디케이터를 클릭하면 뜨는
// 읽기 전용 노트 뷰어 팝업. HTML 내보내기 뷰어의 상세 패널과 동일한 규칙으로
// 문단 / 코드(언어 라벨 + 복사 버튼) / 표(줄=행, |=열, 첫 행=헤더) /
// 체크리스트를 렌더링한다. (편집은 좌측 노트·태그 탭에서)

import { useState } from 'react';
import type { ThemeTokens } from '@/components/design-tokens/theme';
import type { NoteBlock } from '@/editor/__samples__/types';

interface Props {
  t: ThemeTokens;
  title: string;
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

export function NoteViewerPopover({ t, title, notes, onClose }: Props) {
  return (
    <div
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
      // 창 크기(가로 300 · 세로 최대 62%) — 내용이 넘치면 가로/세로
      // 스크롤바 표시.
      // [서버 연결 예정] 시스템 기본 크기는 관리자 설정(system_settings),
      // 사용자별 크기는 users.ui_preferences_json.noteViewer 로 이관 —
      // docs/02-domain/db-schema.md §향후 관리 테이블, 32-settings.md 참조.
      style={{
        position: 'absolute', right: 14, top: 60, width: 300,
        maxHeight: '62%', overflow: 'auto', background: t.surface,
        border: `1px solid ${t.border}`, borderRadius: 10, padding: '12px 14px',
        boxShadow: '0 8px 24px rgba(80, 60, 20, 0.18)', zIndex: 30,
        color: t.text,
      }}
    >
      <button
        onClick={onClose}
        title="닫기"
        style={{
          position: 'absolute', top: 8, right: 10, border: 'none',
          background: 'none', fontSize: 14, cursor: 'pointer', color: t.textMuted,
        }}
      >
        ✕
      </button>
      <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 4, paddingRight: 20 }}>
        {title}
      </div>
      <div style={{
        fontSize: 10, fontWeight: 700, color: t.textSubtle, letterSpacing: 0.5,
        margin: '6px 0 7px', paddingBottom: 5, borderBottom: `1px solid ${t.divider}`,
      }}>
        메모
      </div>
      {notes.map((block) => (
        <NoteBlockView key={block.id} t={t} block={block} />
      ))}
    </div>
  );
}
