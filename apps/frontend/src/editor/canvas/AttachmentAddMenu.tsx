import { useEffect, useRef, useState } from 'react';
import type { ThemeTokens } from '@/components/design-tokens/theme';
import { TooltipButton } from '@/components/top-toolbar/Tooltip';
import { useLang } from '@/i18n';
import { useCoarse } from '@/hooks/useViewport';
import { findNodeInMap, useDocumentStore } from '@/stores/documentStore';
import { useCloudStore } from '@/stores/cloudStore';
import { authEnabled, useAuthStore } from '@/stores/authStore';
import { useInteractionStore } from '@/stores/interactionStore';
import { useEditorUiStore } from '@/stores/editorUiStore';
import type { NoteBlock, NoteBlockType } from '@/editor/__samples__/types';
import { NoteTextDialog } from './NotePopup';
import { CodeBlockDialog } from '@/editor/node-renderer/CodeBlockDialog';
import { TableDialog, TableGridPicker } from '@/editor/node-renderer/TableDialog';
import { noteTableFromMd } from '@/editor/inspector-panels/noteTable';
import { flattenNodeText } from '@/editor/node-renderer/RichTextHtml';
import { attachFileWithProgress } from '@/utils/attachmentFile';
import { attachmentKindFor } from '@/utils/attachmentKind';
import { isMarkdownName } from '@/utils/mdEditorUrl';
import copyByLang from './attachment-add-copy.json';

type Target = { nodeId: string; epoch: number };
type Draft = Target & { session: string; block: NoteBlock; size?: { rows: number; cols: number } };

// Recheck after every async boundary; never apply results to another map.
function writable(target: Target): boolean {
  const st = useDocumentStore.getState();
  return !useCloudStore.getState().readOnlyInfo && st.docEpoch === target.epoch && !!findNodeInMap(st.map, target.nodeId);
}

/** Reuses the sidebar note dialogs/store commands and MD upload policy. */
export function AttachmentAddMenu({ t, compact, onOpen }: { t: ThemeTokens; compact?: boolean; onOpen?: () => void }) {
  const lang = useLang();
  const copy = copyByLang[lang] ?? copyByLang.en;
  const coarse = useCoarse();
  const nodeId = useInteractionStore((s) => s.selectedId);
  const epoch = useDocumentStore((s) => s.docEpoch);
  const node = useDocumentStore((s) => findNodeInMap(s.map, nodeId));
  const readOnly = !!useCloudStore((s) => s.readOnlyInfo);
  const guest = useAuthStore((s) => s.guest);
  const fileBlocked = authEnabled && guest;
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [pick, setPick] = useState<Target | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ error: boolean; text: string } | null>(null);
  const box = useRef<HTMLSpanElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const fileTarget = useRef<Target | null>(null);
  const enabled = !!node && !readOnly && !busy;
  const title = readOnly ? copy.readOnly : !node ? copy.pick : busy ? copy.uploading : copy.add;
  useEffect(() => { setOpen(false); setDraft(null); setPick(null); setNotice(null); fileTarget.current = null; }, [epoch]);
  useEffect(() => { if (readOnly) { setOpen(false); setDraft(null); setPick(null); } }, [readOnly]);
  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    const outside = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', outside, true);
    return () => document.removeEventListener('pointerdown', outside, true);
  }, [open]);
  const start = (type: NoteBlockType, target: Target, size?: { rows: number; cols: number }) => {
    if (!writable(target)) return;
    setOpen(false); setNotice(null);
    setDraft({ ...target, session: crypto.randomUUID(), block: { id: 'note-draft', type, text: '' }, size });
  };
  const save = (patch: Partial<NoteBlock> = {}) => {
    if (!draft) return;
    if (!writable(draft)) { setDraft(null); setNotice({ error: true, text: copy.targetChanged }); return; }
    const b = { ...draft.block, ...patch };
    useDocumentStore.getState().addNoteBlock(draft.nodeId, b.type, b.text, { lang: b.lang, html: b.html, checked: b.checked });
    setDraft(null);
    useEditorUiStore.getState().setInspectorTab('note');
  };
  const addFiles = async (files: File[], target: Target | null) => {
    if (!target || !writable(target) || (authEnabled && useAuthStore.getState().guest)) return;
    const valid = files.filter((f) => isMarkdownName(f.name));
    if (!valid.length) { setNotice({ error: true, text: copy.invalid }); return; }
    setBusy(true); setNotice(null);
    try {
      for (const f of valid) {
        if (!writable(target) || (authEnabled && useAuthStore.getState().guest)) throw new Error(copy.targetChanged);
        const url = await attachFileWithProgress(f);
        if (!writable(target) || (authEnabled && useAuthStore.getState().guest)) throw new Error(copy.targetChanged);
        useDocumentStore.getState().addNodeAttachment(target.nodeId, { name: f.name, kind: attachmentKindFor(f), size: f.size, url });
      }
      setNotice({ error: false, text: copy.added });
      useEditorUiStore.getState().setInspectorTab('md');
    } catch (e) {
      if ((e as Error)?.name !== 'UploadAborted') setNotice({ error: true, text: e instanceof Error ? e.message : copy.failed });
    } finally { setBusy(false); }
  };
  const itemStyle = { width: '100%', minHeight: 38, padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 10, border: 0, borderRadius: 6, background: t.surface, color: t.text, textAlign: 'left' as const, fontSize: 13, cursor: 'pointer' };
  return <span ref={box} data-attachment-add="" style={{ position: compact ? 'static' : 'relative', display: 'inline-flex' }}>
    <TooltipButton ref={trigger} type="button" data-testid="attachment-add" aria-label={copy.add} title={title} aria-description={title} aria-haspopup="menu" aria-expanded={open} disabled={!enabled}
      onClick={() => { if (!enabled) return; onOpen?.(); setOpen((v) => !v); }}
      style={{ width: coarse ? 40 : 32, height: coarse ? 40 : 32, border: 0, borderRadius: 6, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: open ? t.primarySoft : 'transparent', color: enabled ? t.text : t.textSubtle, opacity: enabled ? 1 : .45, cursor: enabled ? 'pointer' : 'default' }}>
      <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 15 7-7a3 3 0 0 0-4.2-4.2L4 11.6a5 5 0 0 0 7.1 7.1l4.4-4.4M7.6 13.6l6.7-6.7"/><path d="M19 15v7m-3.5-3.5h7"/></svg>
    </TooltipButton>
    <input ref={fileInput} data-testid="attachment-md-file-input" type="file" accept=".md,.markdown,text/markdown" multiple style={{ display: 'none' }} onChange={(e) => { const files = Array.from(e.currentTarget.files ?? []); e.currentTarget.value = ''; const target = fileTarget.current; fileTarget.current = null; if (files.length) void addFiles(files, target); }} />
    {open && <div ref={menu} data-testid="attachment-add-menu" role="menu" aria-label={copy.add}
      onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Escape') { e.preventDefault(); setOpen(false); trigger.current?.focus(); return; }
        if (['ArrowDown','ArrowUp','Home','End'].includes(e.key)) { e.preventDefault(); const items = [...(menu.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])]; const i = items.indexOf(document.activeElement as HTMLButtonElement); const next = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : (i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length; items[next]?.focus(); }
      }} style={{ position: 'absolute', top: 'calc(100% + 6px)', ...(compact ? { right: 0 } : { left: 0 }), zIndex: 30, width: 'min(250px, calc(100vw - 20px))', padding: 5, background: t.surface, color: t.text, border: '1px solid ' + t.border, borderRadius: 8, boxShadow: t.shadowSm }}>
      <button type="button" role="menuitem" data-testid="attachment-add-md" disabled={fileBlocked} title={fileBlocked ? copy.guest : copy.md} style={{ ...itemStyle, opacity: fileBlocked ? .45 : 1 }} onClick={() => { if (!nodeId || fileBlocked) return; fileTarget.current = { nodeId, epoch }; setOpen(false); fileInput.current?.click(); }}><b style={{ width: 24 }}>MD</b>{copy.md}</button>
      <button type="button" role="menuitem" data-testid="attachment-add-paragraph" style={itemStyle} onClick={() => { if (nodeId) start('paragraph', { nodeId, epoch }); }}><b style={{ width: 24 }}>¶</b>{copy.paragraph}</button>
      <button type="button" role="menuitem" data-testid="attachment-add-code" style={itemStyle} onClick={() => { if (nodeId) start('code_block', { nodeId, epoch }); }}><b style={{ width: 24 }}>&lt;/&gt;</b>{copy.code}</button>
      <button type="button" role="menuitem" data-testid="attachment-add-table" style={itemStyle} onClick={() => { setOpen(false); if (nodeId) setPick({ nodeId, epoch }); }}><b style={{ width: 24 }}>⊞</b>{copy.table}</button>
    </div>}
    {pick && <TableGridPicker t={t} anchor={compact ? "right" : "left"} top={coarse ? 46 : 38} onClose={() => setPick(null)} onPick={(rows, cols) => { const target = pick; setPick(null); start('table', target, { rows, cols }); }} />}
    {draft?.block.type === 'code_block' && <CodeBlockDialog t={t} initialCode={draft.block.text} initialLang={draft.block.lang} onCancel={() => setDraft(null)} onSave={(lang, text) => save({ lang: lang || undefined, text })} />}
    {draft?.block.type === 'table' && <TableDialog t={t} initialSize={draft.size} onCancel={() => setDraft(null)} onSave={(md) => save({ text: noteTableFromMd(md) })} />}
    {draft?.block.type === 'paragraph' && <NoteTextDialog key={draft.session} t={t} nodeId={draft.nodeId} title={flattenNodeText(findNodeInMap(useDocumentStore.getState().map, draft.nodeId)?.text || '')} block={draft.block} readOnly={readOnly} onChange={(patch) => setDraft((d) => d && d.session === draft.session ? { ...d, block: { ...d.block, ...patch } } : d)} onCancel={() => setDraft(null)} onSave={save} />}
    {notice && <div role={notice.error ? 'alert' : 'status'} data-testid="attachment-add-notice" style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 30, maxWidth: 'min(320px, calc(100vw - 20px))', minWidth: 180, padding: 9, borderRadius: 8, border: '1px solid ' + t.border, background: t.surface, color: notice.error ? t.danger : t.text, fontSize: 12 }}>{notice.text}<button type="button" aria-label={copy.close} onClick={() => setNotice(null)} style={{ marginLeft: 8, color: t.text, background: 'transparent', border: 0 }}>×</button></div>}
  </span>;
}
