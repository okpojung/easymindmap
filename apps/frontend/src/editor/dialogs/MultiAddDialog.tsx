// MultiAddDialog — bulk child-node creation (Ctrl+Space).
// Spec: docs/03-editor-core/node/03-node-indicator.md §5 (Ctrl+Space → 다중 생성 팝업)
// Each non-empty line becomes a child of the selected node (or a branch of root
// when nothing is selected).

import { useEffect, useRef, useState } from 'react';
import type { ThemeTokens } from '@/components/design-tokens/theme';
import { useDocumentStore, findNodeInMap } from '@/stores/documentStore';
import { useEditorUiStore } from '@/stores/editorUiStore';
import { useInteractionStore } from '@/stores/interactionStore';

export function MultiAddDialog({ t }: { t: ThemeTokens }) {
  const open = useEditorUiStore((s) => s.multiAddOpen);
  const setOpen = useEditorUiStore((s) => s.setMultiAddOpen);
  const map = useDocumentStore((s) => s.map);
  const addChildNodesBulk = useDocumentStore((s) => s.addChildNodesBulk);
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
  const lineCount = text.split('\n').map((s) => s.trim()).filter(Boolean).length;

  const submit = () => {
    const lines = text.split('\n');
    addChildNodesBulk(selectedId ?? 'root', lines);
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
        </div>
        <textarea
          ref={taRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') { e.preventDefault(); setOpen(false); }
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submit(); }
          }}
          rows={7}
          placeholder={'예)\n시장 조사\n경쟁사 분석\n사용자 인터뷰'}
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
