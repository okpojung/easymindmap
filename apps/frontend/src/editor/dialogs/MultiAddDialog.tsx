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
import { DialogXButton } from '@/components/ui/DialogFrame';
import { useTr } from '@/i18n';
import { rich } from '@/i18n/rich';

// 폰 대화상자 규칙(data-mm-*) — 불러오기만 하면 CSS 가 한 번 들어간다
import '@/components/ui/mobileCss';
export function MultiAddDialog({ t }: { t: ThemeTokens }) {
  const tr = useTr();
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
  const parentLabel = parentNode ? parentNode.text : tr('editor.multiAdd.rootLabel');
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
      data-mm-dialog-overlay=""
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        background: 'rgba(0,0,0,0.35)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        data-testid="multi-add-dialog"
        data-mm-dialog=""
        data-mm-touch=""
        style={{
          position: 'relative',
          width: 440, maxWidth: '92vw',
          background: t.surface, color: t.text,
          borderRadius: 12, border: `1px solid ${t.border}`,
          boxShadow: '0 12px 40px rgba(0,0,0,0.3)',
          padding: 18, fontFamily: 'inherit',
          maxHeight: 'calc(100dvh - 32px)', overflowY: 'auto', boxSizing: 'border-box',
        }}
      >
        <DialogXButton t={t} testId="multi-add-dialog-x" onClose={() => setOpen(false)} />
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4, paddingRight: 34 }}>{tr('editor.multiAdd.title')}</div>
        <div style={{ fontSize: 11.5, color: t.textMuted, marginBottom: 10 }}>
          {rich(tr('editor.multiAdd.desc'), { parent: <b style={{ color: t.text }}>{parentLabel}</b> }, { color: t.text })}
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
          placeholder={tr('editor.multiAdd.placeholder')}
          style={{
            width: '100%', boxSizing: 'border-box',
            resize: 'vertical', borderRadius: 8,
            border: `1px solid ${t.border}`, background: t.surfaceAlt, color: t.text,
            padding: '8px 10px', fontSize: 13, lineHeight: 1.5,
            outline: 'none', fontFamily: 'inherit',
          }}
        />
        <div style={{ display: 'flex', alignItems: 'center', marginTop: 12, gap: 8 }}>
          <span style={{ fontSize: 11.5, color: t.textMuted }}>{tr('editor.multiAdd.footer', { n: lineCount })}</span>
          <div style={{ flex: 1 }} />
          <button
            onClick={() => setOpen(false)}
            style={{
              padding: '7px 14px', borderRadius: 7, fontSize: 12.5, cursor: 'pointer',
              background: 'transparent', border: `1px solid ${t.border}`, color: t.text,
            }}
          >{tr('common.cancel')}</button>
          <button
            onClick={submit}
            disabled={lineCount === 0}
            style={{
              padding: '7px 16px', borderRadius: 7, fontSize: 12.5, fontWeight: 600,
              cursor: lineCount === 0 ? 'default' : 'pointer',
              background: t.primary, border: `1px solid ${t.primary}`, color: '#fff',
              opacity: lineCount === 0 ? 0.5 : 1,
            }}
          >{tr('editor.multiAdd.submit', { n: lineCount })}</button>
        </div>
      </div>
    </div>
  );
}
