// Canvas and outline indicators share the same note window as the sidebar.
import { useState } from 'react';
import type { ThemeTokens } from '@/components/design-tokens/theme';
import type { NoteBlock } from '@/editor/__samples__/types';
import { useDocumentStore, findNodeInMap } from '@/stores/documentStore';
import { useCloudStore } from '@/stores/cloudStore';
import { useTr } from '@/i18n';
import { flattenNodeText } from '@/editor/node-renderer/RichTextHtml';
import { stripInlineMarks } from '@/editor/node-renderer/inlineMarks';
import { NotePopupShell, NoteTextDialog, NoteCopyButton } from './NotePopup';
import { NoteBlockView } from './NoteBlockView';
interface Props { t: ThemeTokens; nodeId?: string; anchorView?: 'canvas' | 'outline'; title: string; accent?: string; notes: NoteBlock[]; onClose: () => void }
export function NoteViewerPopover({ t, nodeId, anchorView, title, notes, onClose }: Props) {
  const tr = useTr();
  const epoch = useDocumentStore((s) => s.docEpoch);
  const [openedEpoch] = useState(epoch);
  const readOnly = !!useCloudStore((s) => s.readOnlyInfo) || !nodeId;
  const font = useDocumentStore((s) => s.map.settings?.noteFont);
  const [entry, setEntry] = useState<{ block: NoteBlock; editing: boolean } | null>(() => notes.length === 1 ? { block: { ...notes[0] }, editing: false } : null);
  const heading = stripInlineMarks(flattenNodeText(title)).trim();
  const save = (patch: Partial<NoteBlock> = {}) => {
    if (!entry || readOnly) return;
    const s = useDocumentStore.getState();
    if (s.docEpoch !== openedEpoch) { onClose(); return; }
    if (!findNodeInMap(s.map, nodeId)?.notes?.some((n) => n.id === entry.block.id)) { onClose(); return; }
    const block = { ...entry.block, ...patch };
    s.updateNoteBlock(nodeId!, block.id, block);
    setEntry({ block, editing: false });
  };
  if (epoch !== openedEpoch) return null;
  if (entry) return <NoteTextDialog key={entry.block.id} t={t} nodeId={nodeId} anchorView={anchorView} title={heading} block={entry.block} initialEditing={entry.editing} readOnly={readOnly}
    onChange={(patch) => setEntry((v) => v && v.block.id === entry.block.id ? { ...v, block: { ...v.block, ...patch } } : v)}
    onSave={save} onCancel={() => { if (notes.length > 1) setEntry(null); else onClose(); }} />;
  return <NotePopupShell t={t} nodeId={nodeId} title={heading} onClose={onClose} actions={<NoteCopyButton t={t} blocks={notes} />}>
    <div data-testid="note-popup-list" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {notes.map((block, i) => <div key={block.id} data-testid="note-popup-list-item" style={{ borderBottom: '1px solid ' + t.divider, paddingBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          <b style={{ flex: 1, fontSize: 12 }}>{i + 1}</b>
          <button type="button" data-testid="note-list-edit" disabled={readOnly} onClick={() => setEntry({ block: { ...block }, editing: true })}
            style={{ border: '1px solid ' + t.border, padding: '4px 7px', borderRadius: 5, background: t.surface, color: t.primary, cursor: 'pointer' }}>{tr('common.edit')}</button>
          <NoteCopyButton t={t} blocks={[block]} />
        </div>
        <div data-testid="note-list-preview" onDoubleClick={() => setEntry({ block: { ...block }, editing: false })}>
          <NoteBlockView t={t} block={block} hideActions fs={font?.size || 13} family={font?.family}
            onToggleCheck={!readOnly && block.type === 'checklist' ? () => useDocumentStore.getState().updateNoteBlock(nodeId!, block.id, { checked: !block.checked }) : undefined} />
        </div>
      </div>)}
    </div>
  </NotePopupShell>;
}
