// 왼쪽 메뉴 '링크' · '첨부' · 'MD' (2026-10-31 사용자 요청) — 예전 '링크·첨부' 탭을 나눴다.
//
//   · 목록은 **열려 있는 맵 전체**의 링크·첨부·MD 다(노드 순서). 줄마다 어느 노드 것인지 보인다.
//   · 캔버스에서 노드를 고르면 그 노드의 줄이 강조되고 그 자리로 굴러간다 — 강조된 줄만 ✎(고치기)·🗑(지우기).
//     목록의 줄을 누르면 그 노드를 골라 화면 가운데로 데려온다.
//   · 추가 칸(입력칸·끌어 놓기·붙여넣기)은 평소 접어 두고 [＋ 추가] 로 편다. 머리말(개수·추가)은
//     목록이 굴러가도 위에 붙어 있다(sticky).
import { useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type ReactNode } from 'react';
import type { ThemeTokens } from '@/components/design-tokens/theme';
import type { MindNode, NodeAttachment, NodeLink } from '@/editor/__samples__/types';
import { mapCenters } from '@/editor/__samples__/types';
import { I } from '@/components/icons';
import { MarkdownFileIcon } from '@/components/icons/MarkdownFileIcon';
import { useDocumentStore } from '@/stores/documentStore';
import { useInteractionStore } from '@/stores/interactionStore';
import { useViewportStore } from '@/stores/viewportStore';
import { authEnabled, useAuthStore } from '@/stores/authStore';
import { attachFileWithProgress } from '@/utils/attachmentFile';
import { attachmentKindFor, isImageFileName } from '@/utils/attachmentKind';
import { cloudApi, serverAttachmentId } from '@/services/cloud/apiClient';
import { openAttachment } from '@/utils/openAttachment';
import { isMarkdownName } from '@/utils/mdEditorUrl';
import { flattenNodeText } from '@/editor/node-renderer/RichTextHtml';
import { ClipboardImageButton, FilePickerButton, addBtnStyle, inputStyle } from './ContentTab';
import { useTr } from '@/i18n';
import '@/components/ui/mobileCss';

type Kind = 'link' | 'attach' | 'md';
interface Row<T> { nodeId: string; nodeText: string; item: T }

/** 맵 전체를 노드 순서대로 훑는다 — 중심주제마다 루트 → 가지(깊이 우선) */
function eachNode(map: Parameters<typeof mapCenters>[0], f: (n: MindNode) => void) {
  const walk = (n: MindNode) => { f(n); (n.children ?? []).forEach(walk); };
  for (const c of mapCenters(map)) { walk(c.root as MindNode); c.branches.forEach((b) => walk(b as MindNode)); }
}

function fmtSize(n?: number): string {
  if (!n) return '';
  if (n < 1024) return n + 'B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + 'KB';
  return (n / 1024 / 1024).toFixed(1) + 'MB';
}

function attIcon(a: NodeAttachment): ReactNode {
  if (isMarkdownName(a.name)) return <MarkdownFileIcon size={16} />;
  if (a.kind === 'audio') return '🎤';
  if (a.kind === 'video') return '🎬';
  if (isImageFileName(a.name)) return '🖼';
  return '📄';
}

/** 줄을 누르면 그 노드로 — 고르고, 접힌 조상은 펴고, 지금 배율 그대로 가운데로 */
function goToNode(id: string) {
  useInteractionStore.getState().setSelectedId(id);
  useDocumentStore.getState().expandAncestors(id);
  const vp = useViewportStore.getState();
  vp.requestCenterNode(id, vp.zoom);
}

export function LinkTab({ t, selectedId }: { t: ThemeTokens; selectedId: string | null }) {
  return <ResourceTab t={t} selectedId={selectedId} kind="link" />;
}
export function AttachTab({ t, selectedId }: { t: ThemeTokens; selectedId: string | null }) {
  return <ResourceTab t={t} selectedId={selectedId} kind="attach" />;
}
export function MdTab({ t, selectedId }: { t: ThemeTokens; selectedId: string | null }) {
  return <ResourceTab t={t} selectedId={selectedId} kind="md" />;
}

function ResourceTab({ t, selectedId, kind }: { t: ThemeTokens; selectedId: string | null; kind: Kind }) {
  const tr = useTr();
  const map = useDocumentStore((s) => s.map);
  const guest = useAuthStore((s) => s.guest);
  const isGuest = authEnabled && guest && kind !== 'link';
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const rows = useMemo(() => {
    const out: Row<NodeLink | NodeAttachment>[] = [];
    eachNode(map, (n) => {
      const nodeText = flattenNodeText(n.text) || '—';
      if (kind === 'link') for (const l of n.links ?? []) out.push({ nodeId: n.id, nodeText, item: l });
      else for (const a of n.attachments ?? []) {
        if ((kind === 'md') === isMarkdownName(a.name)) out.push({ nodeId: n.id, nodeText, item: a });
      }
    });
    return out;
  }, [map, kind]);

  const selRows = rows.filter((r) => r.nodeId === selectedId);
  const selNode = useMemo(() => {
    let found: MindNode | null = null;
    if (selectedId) eachNode(map, (n) => { if (n.id === selectedId) found = n; });
    return found as MindNode | null;
  }, [map, selectedId]);

  // 노드를 고르면 그 노드의 첫 줄로 굴러간다
  useEffect(() => {
    setEditing(null);
    if (!selectedId) return;
    const el = listRef.current?.querySelector('[data-res-node="' + selectedId + '"]');
    if (el && 'scrollIntoView' in el) (el as HTMLElement).scrollIntoView({ block: 'nearest' });
  }, [selectedId]);
  useEffect(() => { setErr(null); }, [selectedId, kind]);

  const title = tr('inspector.res.' + kind + '.list');
  const canAdd = !!selNode && !isGuest;

  const head: CSSProperties = {
    position: 'sticky', top: 0, zIndex: 3, background: t.surface,
    borderBottom: '1px solid ' + t.divider, padding: '8px 12px',
  };

  return (
    <div data-mm-touch="" data-testid={'res-' + kind}>
      <div style={head} data-testid="res-head">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <b style={{ fontSize: 12.5, color: t.text }}>{title}</b>
          <span data-testid="res-count" style={{ fontSize: 11, color: t.textMuted }}>
            {tr('inspector.res.count', { all: rows.length, sel: selRows.length })}
          </span>
          <span style={{ flex: 1 }} />
          <button type="button" data-testid="res-add-toggle" aria-expanded={addOpen}
            disabled={!canAdd && !addOpen}
            title={isGuest ? tr('inspector.res.guest') : canAdd ? tr('inspector.res.addTip') : tr('inspector.res.pickNode')}
            onClick={() => { setAddOpen((v) => !v); setErr(null); }}
            style={{
              ...addBtnStyle(t), padding: '4px 10px', fontSize: 11.5,
              opacity: !canAdd && !addOpen ? 0.5 : 1, cursor: !canAdd && !addOpen ? 'not-allowed' : 'pointer',
            }}>
            {addOpen ? '✕ ' + tr('inspector.res.closeAdd') : '＋ ' + tr('inspector.content.add')}
          </button>
        </div>
        <div style={{ fontSize: 10.5, color: selNode ? t.primary : t.textSubtle, marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selNode ? tr('inspector.res.target', { name: flattenNodeText(selNode.text) || '—' }) : tr('inspector.res.pickNode')}
        </div>
        {addOpen && canAdd && selectedId && (
          <div data-testid="res-add" style={{ marginTop: 8 }}>
            {kind === 'link' && <LinkAdd t={t} nodeId={selectedId} onDone={() => setAddOpen(false)} />}
            {kind === 'attach' && <AttachAdd t={t} nodeId={selectedId} onError={setErr} />}
            {kind === 'md' && <MdAdd t={t} nodeId={selectedId} onError={setErr} />}
          </div>
        )}
        {isGuest && <div style={{ fontSize: 10.5, color: t.textMuted, marginTop: 4 }}>{tr('inspector.res.guest')}</div>}
        {err && <div data-testid="res-error" style={{ fontSize: 10.5, color: t.danger, marginTop: 5, lineHeight: 1.45 }}>⚠ {err}</div>}
      </div>

      <div ref={listRef} style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 5 }}>
        {rows.length === 0 && (
          <div style={{ fontSize: 11.5, color: t.textMuted, padding: '6px 2px', lineHeight: 1.6 }}>{tr('inspector.res.' + kind + '.empty')}</div>
        )}
        {rows.map((r) => (
          <ResRow key={r.nodeId + '/' + r.item.id} t={t} kind={kind} row={r}
            selected={r.nodeId === selectedId}
            editing={editing === r.item.id}
            onEdit={(on) => setEditing(on ? r.item.id : null)}
            onError={setErr} />
        ))}
      </div>
    </div>
  );
}

function ResRow({ t, kind, row, selected, editing, onEdit, onError }: {
  t: ThemeTokens; kind: Kind; row: Row<NodeLink | NodeAttachment>; selected: boolean; editing: boolean;
  onEdit: (on: boolean) => void; onError: (m: string | null) => void;
}) {
  const tr = useTr();
  const updateNodeLink = useDocumentStore((s) => s.updateNodeLink);
  const removeNodeLink = useDocumentStore((s) => s.removeNodeLink);
  const renameNodeAttachment = useDocumentStore((s) => s.renameNodeAttachment);
  const removeNodeAttachment = useDocumentStore((s) => s.removeNodeAttachment);
  const link = kind === 'link' ? (row.item as NodeLink) : null;
  const att = kind !== 'link' ? (row.item as NodeAttachment) : null;
  const [d1, setD1] = useState('');
  const [d2, setD2] = useState('');

  const startEdit = () => {
    onError(null);
    if (link) { setD1(link.label ?? ''); setD2(link.url); }
    else if (att) setD1(kind === 'md' ? att.name.replace(/\.(md|markdown)$/i, '') : att.name);
    onEdit(true);
  };
  const saveEdit = () => {
    if (link) {
      if (!d2.trim()) return;
      updateNodeLink(row.nodeId, link.id, { url: d2, label: d1 });
    } else if (att) {
      let name = d1.trim();
      if (!name) return;
      if (kind === 'md' && !isMarkdownName(name)) name += (att.name.match(/\.(md|markdown)$/i)?.[0] ?? '.md');
      renameNodeAttachment(row.nodeId, att.id, name);
    }
    onEdit(false);
  };
  const remove = () => {
    if (link) { removeNodeLink(row.nodeId, link.id); return; }
    if (!att) return;
    if (!window.confirm(tr('inspector.res.confirmRemove', { name: att.name }))) return;
    removeNodeAttachment(row.nodeId, att.id);
    const serverId = serverAttachmentId(att.url);
    if (serverId) void cloudApi.deleteAttachment(serverId).catch(() => undefined);
  };
  const open = () => {
    if (link) window.open(link.url, '_blank', 'noopener,noreferrer');
    else if (att) openAttachment(att.name, att.url, { nodeId: row.nodeId, attachmentId: att.id });
  };

  const icoBtn: CSSProperties = {
    width: 24, height: 24, borderRadius: 5, border: '1px solid ' + t.border, background: t.surface,
    color: t.text, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 12, flexShrink: 0, padding: 0,
  };
  const main = link ? (link.label || link.url) : att ? att.name : '';
  const sub = link && link.label ? link.url : att ? fmtSize(att.size) : '';

  return (
    <div data-testid="res-row" data-res-node={row.nodeId} aria-selected={selected}
      onClick={(e) => { if ((e.target as HTMLElement).closest('button,input,a')) return; if (!selected) goToNode(row.nodeId); }}
      className="mm-list-row"
      style={{
        padding: '6px 8px', borderRadius: 6, cursor: selected ? 'default' : 'pointer',
        border: '1px solid ' + (selected ? t.primaryBorder : t.border),
        background: selected ? t.primarySoft : t.surfaceAlt,
        ['--row-hover' as string]: t.primarySoft, ['--row-hover-bd' as string]: t.primaryBorder,
      } as CSSProperties}>
      {!editing ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ display: 'flex', fontSize: 14, color: t.accent, flexShrink: 0 }}>{link ? <I.Link size={13} /> : att ? attIcon(att) : null}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div data-testid="res-name" title={main} style={{ fontSize: 11.5, fontWeight: 600, color: link ? t.accent : t.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{main}</div>
            <div style={{ fontSize: 10, color: t.textSubtle, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {sub ? sub + ' · ' : ''}{tr('inspector.res.inNode', { name: row.nodeText })}
            </div>
          </div>
          <button type="button" data-testid="res-open" style={icoBtn} disabled={!!att && !att.url}
            title={kind === 'md' ? tr('inspector.content.openInMdEditor') : tr('inspector.content.openInNewTab')} onClick={open}>
            {kind === 'md' ? '✍' : '↗'}
          </button>
          {selected && <>
            <button type="button" data-testid="res-edit" style={icoBtn} title={tr('inspector.res.edit')} onClick={startEdit}><I.Pencil size={12} /></button>
            <button type="button" data-testid="res-remove" style={{ ...icoBtn, color: '#B91C1C' }} title={tr('inspector.res.remove')} onClick={remove}><I.Trash size={12} /></button>
          </>}
        </div>
      ) : (
        <div data-testid="res-editor" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {link ? <>
            <input value={d1} onChange={(e) => setD1(e.target.value)} placeholder={tr('inspector.content.linkLabel')} style={inputStyle(t)} autoFocus />
            <input value={d2} onChange={(e) => setD2(e.target.value)} placeholder="https://..." style={inputStyle(t)}
              onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') onEdit(false); }} />
          </> : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <input value={d1} onChange={(e) => setD1(e.target.value)} style={{ ...inputStyle(t), flex: 1 }} autoFocus
                onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') onEdit(false); }} />
              {kind === 'md' && <span style={{ fontSize: 11, color: t.textMuted }}>{att?.name.match(/\.(md|markdown)$/i)?.[0] ?? '.md'}</span>}
            </div>
          )}
          <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
            <button type="button" data-testid="res-save" style={addBtnStyle(t)} onClick={saveEdit}>{tr('inspector.res.save')}</button>
            <button type="button" style={{ ...addBtnStyle(t), background: 'transparent', color: t.textMuted, border: '1px solid ' + t.border }} onClick={() => onEdit(false)}>{tr('common.cancel')}</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── 추가 칸 ───────────────────────────────────────────────────────────

function LinkAdd({ t, nodeId, onDone }: { t: ThemeTokens; nodeId: string; onDone: () => void }) {
  const tr = useTr();
  const addNodeLink = useDocumentStore((s) => s.addNodeLink);
  const [url, setUrl] = useState('');
  const [label, setLabel] = useState('');
  const commit = () => {
    if (!url.trim()) return;
    addNodeLink(nodeId, url, label.trim() || undefined);
    setUrl(''); setLabel(''); onDone();
  };
  const drop = (e: DragEvent) => {
    e.preventDefault();
    const raw = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain');
    const u = raw.split(/\r?\n/).map((s) => s.trim()).find((s) => /^https?:\/\//i.test(s));
    if (u) { addNodeLink(nodeId, u); onDone(); }
  };
  const paste = async () => {
    try {
      const txt = (await navigator.clipboard.readText()).trim();
      const u = txt.split(/\s+/).find((s) => /^https?:\/\//i.test(s));
      if (u) setUrl(u);
    } catch { /* 권한이 없으면 칸에 직접 붙여 넣는다 */ }
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <input data-testid="link-add-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder={tr('inspector.content.linkLabel')} style={inputStyle(t)} />
      <div style={{ display: 'flex', gap: 4 }}>
        <input data-testid="link-add-url" value={url} onChange={(e) => setUrl(e.target.value)} autoFocus
          onKeyDown={(e) => { if (e.key === 'Enter') commit(); }} placeholder="https://..." style={{ ...inputStyle(t), flex: 1 }} />
        <button type="button" data-testid="link-add-commit" onClick={commit} style={addBtnStyle(t)}>{tr('inspector.content.add')}</button>
      </div>
      <div onDragOver={(e) => e.preventDefault()} onDrop={drop}
        style={{ padding: '8px 10px', borderRadius: 6, textAlign: 'center', border: '1px dashed ' + t.border, background: t.surfaceAlt, fontSize: 10.5, color: t.textSubtle }}>
        {tr('inspector.content.urlDrop')}
      </div>
      <button type="button" onClick={() => { void paste(); }}
        style={{ padding: '6px 10px', borderRadius: 5, border: '1px dashed ' + t.border, background: t.surfaceAlt, color: t.textMuted, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
        📋 {tr('inspector.res.pasteUrl')}
      </button>
    </div>
  );
}

function useAddFiles(nodeId: string, onError: (m: string | null) => void) {
  const tr = useTr();
  const addNodeAttachment = useDocumentStore((s) => s.addNodeAttachment);
  return async (files: File[]) => {
    onError(null);
    const epoch = useDocumentStore.getState().docEpoch;
    for (const f of files) {
      try {
        const url = await attachFileWithProgress(f);
        if (useDocumentStore.getState().docEpoch !== epoch) { onError(tr('inspector.content.switchedMap', { name: f.name })); return; }
        addNodeAttachment(nodeId, { name: f.name, kind: attachmentKindFor(f), size: f.size, url });
      } catch (err) {
        if ((err as Error)?.name === 'UploadAborted') continue;
        onError(err instanceof Error ? err.message : tr('inspector.content.attachFailed'));
      }
    }
  };
}

function AttachAdd({ t, nodeId, onError }: { t: ThemeTokens; nodeId: string; onError: (m: string | null) => void }) {
  const tr = useTr();
  const add = useAddFiles(nodeId, onError);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      <FilePickerButton t={t} label={tr('inspector.res.attach.pick')}
        accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.hwp,.hwpx,.zip,audio/*,video/*,image/*"
        onFiles={(files) => add(files)} />
      <ClipboardImageButton t={t} onFiles={(files) => add(files)} onError={(m) => onError(m)} />
      <div style={{ fontSize: 10, color: t.textSubtle, marginTop: 5, lineHeight: 1.45 }}>{tr('inspector.res.attach.help')}</div>
    </div>
  );
}

function MdAdd({ t, nodeId, onError }: { t: ThemeTokens; nodeId: string; onError: (m: string | null) => void }) {
  const tr = useTr();
  const add = useAddFiles(nodeId, onError);
  const [name, setName] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const create = async () => {
    const base = name.trim().replace(/\.(md|markdown)$/i, '') || tr('inspector.res.md.untitled');
    setBusy(true);
    try {
      const text = body.trim() ? body : '# ' + base + '\n\n';
      await add([new File([text], base + '.md', { type: 'text/markdown' })]);
      setName(''); setBody('');
    } finally { setBusy(false); }
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: t.textMuted }}>{tr('inspector.res.md.newHead')}</div>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        <input data-testid="md-add-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus
          placeholder={tr('inspector.res.md.namePh')} style={{ ...inputStyle(t), flex: 1 }} />
        <span style={{ fontSize: 11, color: t.textMuted }}>.md</span>
      </div>
      <textarea data-testid="md-add-body" value={body} onChange={(e) => setBody(e.target.value)} rows={4}
        placeholder={tr('inspector.res.md.bodyPh')}
        style={{ ...inputStyle(t), resize: 'vertical', fontFamily: "ui-monospace, 'Cascadia Mono', Consolas, monospace" }} />
      <button type="button" data-testid="md-add-create" disabled={busy} onClick={() => { void create(); }} style={{ ...addBtnStyle(t), padding: '6px 10px' }}>
        {busy ? '…' : tr('inspector.res.md.create')}
      </button>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: t.textMuted, marginTop: 6 }}>{tr('inspector.res.md.fileHead')}</div>
      <FilePickerButton t={t} label={tr('inspector.res.md.pick')} accept=".md,.markdown,text/markdown" onFiles={(files) => add(files.filter((f) => isMarkdownName(f.name)))} />
      <div style={{ fontSize: 10, color: t.textSubtle, marginTop: 5, lineHeight: 1.45 }}>{tr('inspector.res.md.help')}</div>
    </div>
  );
}
