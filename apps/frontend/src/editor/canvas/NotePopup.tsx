import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { ThemeTokens } from '@/components/design-tokens/theme';
import type { NoteBlock } from '@/editor/__samples__/types';
import { useDocumentStore } from '@/stores/documentStore';
import { useDialogDrag } from '@/components/ui/useDialogDrag';
import { useBackdropDismiss } from '@/components/ui/useBackdropDismiss';
import { useTr } from '@/i18n';
import { copyTable, pipeTextToTable } from '@/utils/copyTable';
import { stripInlineMarks } from '@/editor/node-renderer/inlineMarks';
import { NoteBlockView } from './NoteBlockView';
import { NoteBlockEditor } from '@/editor/inspector-panels/NoteBlockEditor';
import { CodeBlockDialog } from '@/editor/node-renderer/CodeBlockDialog';
import { TableDialog } from '@/editor/node-renderer/TableDialog';
import { noteTableFromMd, noteTableToMd } from '@/editor/inspector-panels/noteTable';
import { placeNotePopup, type Box } from './notePopupPosition';

export function NoteCopyButton({ t, blocks }: { t: ThemeTokens; blocks: NoteBlock[] }) {
  const tr = useTr(); const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      const b = blocks[0], table = blocks.length === 1 && b.type === 'table' ? pipeTextToTable(b.text) : null;
      if (table) await copyTable(table.headers, table.rows);
      else {
        const text = blocks.map((n) => n.type === 'code_block' || n.type === 'table' ? n.text : stripInlineMarks(n.text)).join('\n\n');
        if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
        else { const el = document.createElement('textarea'); el.value = text; el.style.position = 'fixed'; el.style.opacity = '0'; document.body.appendChild(el); el.select(); const ok = document.execCommand('copy'); el.remove(); if (!ok) return; }
      }
      setCopied(true); window.setTimeout(() => setCopied(false), 1400);
    } catch { /* clipboard permission denied: do not claim success */ }
  };
  return <button type="button" data-testid="note-popup-copy" aria-label={tr('common.copy')} title={tr('common.copy')}
    onPointerDown={(e) => e.stopPropagation()} onClick={() => void copy()}
    style={{ border: '1px solid ' + t.border, background: t.surface, color: t.text, borderRadius: 5, padding: '4px 7px', cursor: 'pointer', whiteSpace: 'nowrap' }}>{copied ? tr('common.copied') : '⧉'}</button>;
}

export function NotePopupShell({ t, nodeId, anchorView, title, actions, footer, children, onClose }: {
  t: ThemeTokens; nodeId?: string; anchorView?: 'canvas' | 'outline'; title: string; actions?: ReactNode; footer?: ReactNode; children: ReactNode; onClose: () => void;
}) {
  const tr = useTr(); const drag = useDialogDrag(); const backdrop = useBackdropDismiss(onClose);
  const [box, setBox] = useState<Box | null>(null);
  useLayoutEffect(() => {
    const fit = () => {
      const activeOutline = document.activeElement?.closest('[data-testid="outline-scroll"]');
      const all = [...document.querySelectorAll<HTMLElement>('[data-node-id], [data-outline-id]')].filter((e) => (e.getAttribute('data-node-id') || e.getAttribute('data-outline-id')) === nodeId);
      const preferred = anchorView ? all.filter((e) => e.hasAttribute(anchorView === 'outline' ? 'data-outline-id' : 'data-node-id')) : all;
      const el = preferred.find((e) => activeOutline?.contains(e)) || preferred.find((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.right > 0 && r.left < innerWidth && r.bottom > 0 && r.top < innerHeight; });
      const r = el?.getBoundingClientRect();
      const viewport = { left: 0, top: 44, width: innerWidth, height: innerHeight - 44 };
      const pane = el?.closest('svg, [data-testid="outline-scroll"]')?.getBoundingClientRect();
      const bounds = pane && pane.width >= 300 && pane.height >= 220 ? { left: Math.max(0, pane.left), top: Math.max(44, pane.top), width: Math.min(innerWidth, pane.right) - Math.max(0, pane.left), height: Math.min(innerHeight, pane.bottom) - Math.max(44, pane.top) } : viewport;
      let p = placeNotePopup(r ? { left: r.left, top: r.top, width: r.width, height: r.height } : null, bounds);
      if (r && p.left < r.right && p.left + p.width > r.left && p.top < r.bottom && p.top + p.height > r.top) p = placeNotePopup({ left: r.left, top: r.top, width: r.width, height: r.height }, viewport);
      setBox(p);
    };
    fit(); window.addEventListener('resize', fit); window.visualViewport?.addEventListener('resize', fit);
    return () => { window.removeEventListener('resize', fit); window.visualViewport?.removeEventListener('resize', fit); };
  }, [nodeId, anchorView]);
  return createPortal(<div data-testid="note-popup-overlay" {...backdrop} onPointerDown={(e) => e.stopPropagation()}
    onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Escape') { e.preventDefault(); onClose(); } }}
    style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(0,0,0,0.08)' }}>
    <div ref={drag.panelRef} data-testid="note-text-dialog" data-mm-dialog="" role="dialog" aria-modal="true" aria-label={title}
      onClick={(e) => e.stopPropagation()} onWheel={(e) => e.stopPropagation()}
      style={{ position: 'fixed', left: box?.left ?? 12, top: box?.top ?? 60, width: box?.width ?? 400, height: box?.height ?? 400,
        ...drag.panelStyle, maxWidth: 'calc(100vw - 24px)', maxHeight: 'calc(100dvh - 24px)', minWidth: 200, minHeight: 150,
        resize: 'both', overflow: 'hidden', display: 'flex', flexDirection: 'column', color: t.text, background: t.surface,
        border: '1px solid ' + t.border, borderRadius: 10, boxShadow: '0 12px 40px rgba(0,0,0,.24)' }}>
      <div data-testid="note-popup-title" {...drag.handleProps} title={tr('editor.note.dragToMove')}
        style={{ ...drag.handleProps.style, display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0, padding: '10px 12px', borderBottom: '1px solid ' + t.divider, background: t.surfaceAlt }}>
        <b style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13 }}>{title}</b>
        {actions}
        <button type="button" data-testid="note-popup-close" aria-label={tr('common.close')} title={tr('common.close')} onPointerDown={(e) => e.stopPropagation()} onClick={onClose} style={{ background: 'transparent', border: 0, color: t.text, cursor: 'pointer', fontSize: 19 }}>×</button>
      </div>
      <div data-testid="note-popup-body" style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: 14, overscrollBehavior: 'contain' }}>{children}</div>
      {footer && <div style={{ flexShrink: 0, padding: '10px 14px', borderTop: '1px solid ' + t.divider }}>{footer}</div>}
    </div>
  </div>, document.body);
}

/** New notes start in edit mode; existing notes use the same window in view mode. */
export function NoteTextDialog({ t, nodeId, anchorView, title, block, initialEditing = true, readOnly = false, onChange, onCancel, onSave }: {
  t: ThemeTokens; nodeId?: string; anchorView?: 'canvas' | 'outline'; title?: string; block: NoteBlock; initialEditing?: boolean; readOnly?: boolean;
  onChange: (p: Partial<NoteBlock>) => void; onCancel: () => void; onSave: (patch?: Partial<NoteBlock>) => void;
}) {
  const tr = useTr(); const [editing, setEditing] = useState(initialEditing && !readOnly);
  const ref = useRef<HTMLDivElement>(null);
  const font = useDocumentStore((s) => s.map.settings?.noteFont);
  useLayoutEffect(() => { if (editing) ref.current?.querySelector<HTMLElement>('textarea, input')?.focus(); }, [editing]);
  const commit = (patch?: Partial<NoteBlock>) => { if (!readOnly) { onSave(patch); setEditing(false); } };
  if (editing && block.type === 'code_block') return <CodeBlockDialog t={t} initialLang={block.lang} initialCode={block.text} onCancel={onCancel} onSave={(lang, text) => commit({ lang: lang || undefined, text })} />;
  if (editing && block.type === 'table') return <TableDialog t={t} initialMd={noteTableToMd(block.text)} onCancel={onCancel} onSave={(md) => commit({ text: noteTableFromMd(md) })} />;
  const heading = title || tr(block.type === 'checklist' ? 'inspector.notes.checkTitle' : 'inspector.notes.paragraphTitle');
  const editButton = <button type="button" data-testid="note-popup-edit" disabled={readOnly || editing} onClick={() => setEditing(true)} style={{ padding: '4px 7px', borderRadius: 5, border: '1px solid ' + t.border, color: t.primary, background: t.surface, cursor: 'pointer' }}>{tr('common.edit')}</button>;
  return <NotePopupShell t={t} nodeId={nodeId} anchorView={anchorView} title={heading} onClose={onCancel}
    actions={<>{editButton}<NoteCopyButton t={t} blocks={[block]} /></>}
    footer={editing ? <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
      <button type="button" data-testid="note-dialog-cancel" onClick={onCancel}>{tr('common.cancel')} (Esc)</button>
      <button type="button" data-testid="note-dialog-save" disabled={!block.text.trim()} onClick={() => commit()}>{tr('common.save')} (Ctrl+Enter)</button>
    </div> : undefined}>
    <div ref={ref} data-testid={editing ? 'note-popup-editing' : 'note-popup-reading'} onKeyDown={(e) => {
      if (editing && e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.nativeEvent.isComposing) { e.preventDefault(); if (block.text.trim()) commit(); }
    }}>
      {editing ? <NoteBlockEditor t={t} hideHeader block={block} onChange={onChange} onRemove={onCancel} /> : <NoteBlockView t={t} block={block} hideActions fs={font?.size || 13} family={font?.family}
        onToggleCheck={!readOnly && block.type === 'checklist' ? () => { const patch = { checked: !block.checked }; onChange(patch); commit(patch); } : undefined} />}
    </div>
  </NotePopupShell>;
}
