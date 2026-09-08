// MultiAddDialog — bulk child-node creation (Ctrl+Space).
// Spec: docs/03-editor-core/node/03-node-indicator.md §5 (Ctrl+Space → 다중 생성 팝업)
// Each non-empty line becomes a child of the selected node (or a branch of root
// when nothing is selected).

import { useEffect, useRef, useState } from 'react';
import type { ThemeTokens } from '@/components/design-tokens/theme';
import { useDocumentStore, findNodeInMap } from '@/stores/documentStore';
import { useEditorUiStore } from '@/stores/editorUiStore';
import { useInteractionStore } from '@/stores/interactionStore';
import { countOutline, parseOutlineLines } from '@/utils/outlineLines';

export function MultiAddDialog({ t }: { t: ThemeTokens }) {
  const open = useEditorUiStore((s) => s.multiAddOpen);
  const setOpen = useEditorUiStore((s) => s.setMultiAddOpen);
  const map = useDocumentStore((s) => s.map);
  const addChildOutlineBulk = useDocumentStore((s) => s.addChildOutlineBulk);
  const selectedId = useInteractionStore((s) => s.selectedId);

  const [text, setText] = useState('');
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (open) {
      setText('');
      window.setTimeout(() => taRef.current?.focus(), 0);
    }
  }, [open]);

  if (!open) return null;

  const parentNode = findNodeInMap(map, selectedId);
  const parentLabel = parentNode ? parentNode.text : '루트(맵 전체)';
  // 들여쓰기(스페이스·탭)는 하위 노드 — utils/outlineLines (2026-09-08)
  const outline = parseOutlineLines(text);
  const lineCount = countOutline(outline);

  const submit = () => {
    addChildOutlineBulk(selectedId ?? 'root', outline);
    setOpen(false);
  };

  return (
    <div
      onClick={() => setOpen(false)}
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        background: 'rgba(0,0,0,0.35)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 440, maxWidth: '92vw',
          background: t.surface, color: t.text,
          borderRadius: 12, border: `1px solid ${t.border}`,
          boxShadow: '0 12px 40px rgba(0,0,0,0.3)',
          padding: 18, fontFamily: 'inherit',
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>다중 노드 추가</div>
        <div style={{ fontSize: 11.5, color: t.textMuted, marginBottom: 10 }}>
          한 줄에 하나씩 입력하면 각 줄이{' '}
          <b style={{ color: t.text }}>{parentLabel}</b>의 자식 노드로 추가됩니다.
          {' '}<b style={{ color: t.text }}>스페이스·Tab 으로 들여쓴 줄은 바로 위 줄의 하위 노드</b>가 됩니다
          (앞의 <code>-</code> 불릿은 뗍니다).
        </div>
        <textarea
          ref={taRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') { e.preventDefault(); setOpen(false); }
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submit(); }
            // Tab 은 포커스를 옮기지 않고 **들여쓰기 두 칸**을 넣는다(Shift+Tab 은 뺀다)
            // — "스페이스 또는 탭으로 들여쓰기" (2026-09-08 요청)
            if (e.key === 'Tab') {
              e.preventDefault();
              const ta = e.currentTarget;
              const { selectionStart: s, selectionEnd: en, value } = ta;
              const lineStart = value.lastIndexOf('\n', s - 1) + 1;
              if (e.shiftKey) {
                const cut = value.slice(lineStart, lineStart + 2) === '  ' ? 2 : value[lineStart] === '\t' ? 1 : 0;
                if (!cut) return;
                const next = value.slice(0, lineStart) + value.slice(lineStart + cut);
                setText(next);
                window.setTimeout(() => ta.setSelectionRange(Math.max(lineStart, s - cut), Math.max(lineStart, en - cut)), 0);
              } else {
                const next = value.slice(0, lineStart) + '  ' + value.slice(lineStart);
                setText(next);
                window.setTimeout(() => ta.setSelectionRange(s + 2, en + 2), 0);
              }
            }
          }}
          rows={9}
          placeholder={'예)\n- I. 문제정의\n  - 10. 연 128억 건 발급 (1P)\n  - 11. 국가 데이터 공백 (2P)\n- II. 해결구조\n  - 20. 간편인증 한 번으로 통합 (5P)'}
          style={{
            width: '100%', boxSizing: 'border-box',
            resize: 'vertical', borderRadius: 8,
            border: `1px solid ${t.border}`, background: t.surfaceAlt, color: t.text,
            padding: '8px 10px', fontSize: 13, lineHeight: 1.5,
            outline: 'none', fontFamily: 'inherit',
          }}
        />
        <div style={{ display: 'flex', alignItems: 'center', marginTop: 12, gap: 8 }}>
          <span style={{ fontSize: 11.5, color: t.textMuted }}>{lineCount}개 노드 · Ctrl+Enter로 추가</span>
          <div style={{ flex: 1 }} />
          <button
            onClick={() => setOpen(false)}
            style={{
              padding: '7px 14px', borderRadius: 7, fontSize: 12.5, cursor: 'pointer',
              background: 'transparent', border: `1px solid ${t.border}`, color: t.text,
            }}
          >취소</button>
          <button
            onClick={submit}
            disabled={lineCount === 0}
            style={{
              padding: '7px 16px', borderRadius: 7, fontSize: 12.5, fontWeight: 600,
              cursor: lineCount === 0 ? 'default' : 'pointer',
              background: t.primary, border: `1px solid ${t.primary}`, color: '#fff',
              opacity: lineCount === 0 ? 0.5 : 1,
            }}
          >{lineCount}개 추가</button>
        </div>
      </div>
    </div>
  );
}
