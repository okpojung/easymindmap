import { NoteTextDialog } from '@/editor/canvas/NotePopup';
// NoteTagTab — tag chips + structured note (paragraph/code_block/table/checklist)
// editor, wired to the selected node via documentStore.

import { useEffect, useMemo, useRef, useState } from 'react';
import { CodeBlockDialog } from '@/editor/node-renderer/CodeBlockDialog';
import { collectMapNotes } from './mapNotes';
import { flattenNodeText } from '@/editor/node-renderer/RichTextHtml';
import { useViewportStore } from '@/stores/viewportStore';
import { useCloudStore } from '@/stores/cloudStore';
import { useInteractionStore } from '@/stores/interactionStore';
import type { ThemeTokens } from '@/components/design-tokens/theme';
import type { NoteBlock as NoteBlockData, NoteBlockType } from '@/editor/__samples__/types';
import { useDocumentStore, findNodeInMap } from '@/stores/documentStore';
import { InspectorSection, Toggle } from './InspectorSection';
import { useEditorUiStore } from '@/stores/editorUiStore';
import { resolveTagColor } from '@/editor/node-renderer/resolveTagColor';
import { TableDialog, TableGridPicker } from '@/editor/node-renderer/TableDialog';
import { noteTableFromMd, noteTableToMd } from './noteTable';
import { useTr } from '@/i18n';

// 손가락 기기의 입력칸 16px·누를 자리 40px (data-mm-touch) — 불러오기만 하면 CSS 가 들어간다
import '@/components/ui/mobileCss';
import { useCoarse } from '@/hooks/useViewport';
import { ProjectTagsSection } from './ProjectTagsSection';
// label 은 사전 키 — 렌더할 때 번역한다
const BLOCK_TYPES: { type: NoteBlockType; label: string }[] = [
  { type: 'paragraph', label: 'inspector.note.add.paragraph' },
  { type: 'code_block', label: 'inspector.note.add.code' },
  { type: 'table', label: 'inspector.note.add.table' },
  { type: 'checklist', label: 'inspector.note.add.check' },
];

// part — 왼쪽 메뉴의 '노트'·'태그' 를 나눴다 (2026-10-31). 'tag' 는 태그 + 프로젝트 태그, 'note' 는 노트 블록.
export function NoteTagTab({ t, selectedId, part = 'all' }: { t: ThemeTokens; selectedId: string | null; part?: 'all' | 'note' | 'tag' }) {
  const tr = useTr();
  const coarse = useCoarse();
  const map = useDocumentStore((s) => s.map);
  const addNodeTag = useDocumentStore((s) => s.addNodeTag);
  const removeNodeTag = useDocumentStore((s) => s.removeNodeTag);
  // 태그 끌어서 순서 바꾸기 (2026-10-23)
  const moveNodeTag = useDocumentStore((s) => s.moveNodeTag);
  const [dragTag, setDragTag] = useState<string | null>(null);
  const [overTag, setOverTag] = useState<string | null>(null);
  const [tagDraft, setTagDraft] = useState('');
  // 노드에 태그 표시 켜기/끄기 — 태그 탭 맨 위 (2026-11-07 사용자 요청: "태그 표시 On/OFF 버튼이 없어졌다").
  // 같은 스위치가 검색 패널에도 있다(둘은 같은 값). 노드를 고르지 않아도 누를 수 있다.
  const showTags = useEditorUiStore((s) => s.showTags);
  const setShowTags = useEditorUiStore((s) => s.setShowTags);

  const node = findNodeInMap(map, selectedId);
  const disabled = !selectedId || !node;
  const tags = node?.tags ?? (node?.tag ? [node.tag] : []);

  const commitTag = () => {
    const v = tagDraft.trim();
    if (v && selectedId) addNodeTag(selectedId, v);
    setTagDraft('');
  };

  // 이 맵에서 쓰는 태그 (2026-11-11 사용자 요청) — 한 번 쓴 태그를 고르고 노드를 누르면 그 노드에 붙는다.
  // 많이 쓴 순. 입력란에 글을 치면 그 글이 든 태그만 보인다.
  const mapTags = useMemo(() => {
    if (part === 'note') return [] as [string, number][];
    const cnt = new Map<string, number>();
    const walk = (n: { tags?: string[]; tag?: string; children?: unknown[] }) => {
      for (const g of n.tags ?? (n.tag ? [n.tag] : [])) cnt.set(g, (cnt.get(g) ?? 0) + 1);
      (n.children as typeof n[] | undefined)?.forEach(walk);
    };
    walk(map.root as never); map.branches.forEach((b) => walk(b as never));
    for (const c of map.centers ?? []) { walk(c.root as never); c.branches.forEach((b) => walk(b as never)); }
    return [...cnt.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [map, part]);
  const tagPainter = useInteractionStore((s) => s.tagPainter);
  const setTagPainter = useInteractionStore((s) => s.setTagPainter);
  const setStylePainter = useInteractionStore((s) => s.setStylePainter);
  // 태그 탭을 닫으면 붙이기 모드도 끝낸다
  useEffect(() => (part === 'note' ? undefined : () => setTagPainter(null)), [part, setTagPainter]);
  // 고른 태그가 맵에서 모두 지워지면 모드 끝
  useEffect(() => { if (tagPainter && !mapTags.some(([g]) => g === tagPainter)) setTagPainter(null); }, [mapTags, tagPainter, setTagPainter]);
  const q = tagDraft.trim().toLowerCase();
  const shownTags = q ? mapTags.filter(([g]) => g.toLowerCase().includes(q)) : mapTags;
  const pickPainter = (g: string) => {
    if (tagPainter === g) { setTagPainter(null); return; }
    setStylePainter(null);
    setTagPainter(g);
    setTagDraft('');
  };
  const nodeDisabled = disabled ? { opacity: 0.5, pointerEvents: 'none' as const } : undefined;

  return (
    <>
    {part !== 'note' && (
      <label data-testid="tags-show-toggle" style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
        padding: '8px 12px', margin: '0 0 2px', borderBottom: `1px solid ${t.divider}`, cursor: 'pointer',
      }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: t.text }}>{tr('inspector.tags.showToggle')}</span>
        <Toggle t={t} on={showTags} onChange={setShowTags} />
      </label>
    )}
    <div data-mm-touch="" style={undefined}>
      {part !== 'note' && <>
      <InspectorSection t={t} title={tr('inspector.note.tags')}>
        <div style={nodeDisabled}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
          {tags.map((tagName, idx) => {
            const tc = resolveTagColor(tagName, t);
            return (
              <span key={tagName}
                draggable={tags.length > 1}
                title={tags.length > 1 ? tr('editor.node.dragTag') : undefined}
                onDragStart={(e) => { setDragTag(tagName); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', tagName); }}
                onDragOver={(e) => { if (dragTag && dragTag !== tagName) { e.preventDefault(); setOverTag(tagName); } }}
                onDragLeave={() => setOverTag((v) => (v === tagName ? null : v))}
                onDrop={(e) => { e.preventDefault(); if (dragTag && selectedId && dragTag !== tagName) moveNodeTag(selectedId, dragTag, idx); setDragTag(null); setOverTag(null); }}
                onDragEnd={() => { setDragTag(null); setOverTag(null); }}
                style={{
                cursor: tags.length > 1 ? 'grab' : undefined,
                opacity: dragTag === tagName ? 0.5 : 1,
                boxShadow: overTag === tagName ? `inset 3px 0 0 ${t.primary}` : undefined,
                fontSize: 11, fontWeight: 600,
                padding: '3px 7px', borderRadius: 3,
                background: tc.bg, color: tc.text,
                border: `1px solid ${tc.border}`,
                display: 'inline-flex', alignItems: 'center', gap: 4,
                letterSpacing: 0.2,
              }}>
                #{tagName}
                {/* 단추로 — 키보드·화면 낭독기로도 지울 수 있게. 손가락이면 누를 자리를 넓힌다 */}
                <button
                  type="button"
                  data-mm-small=""
                  aria-label={`${tr('common.delete')} #${tagName}`}
                  title={tr('common.delete')}
                  onClick={() => selectedId && removeNodeTag(selectedId, tagName)}
                  style={{
                    opacity: 0.6, cursor: 'pointer', fontSize: coarse ? 15 : 11, lineHeight: 1,
                    border: 'none', background: 'transparent', color: 'inherit',
                    padding: coarse ? '6px 6px' : 0, margin: coarse ? '-6px -6px -6px 0' : 0,
                  }}
                >×</button>
              </span>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <input
            value={tagDraft}
            onChange={(e) => setTagDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') commitTag(); }}
            placeholder={tr('inspector.note.tagPlaceholder')}
            style={{
              flex: 1, fontSize: 11, padding: '4px 7px', borderRadius: 4,
              border: `1px solid ${t.border}`, background: t.surface, color: t.text,
              outline: 'none',
            }}
          />
          <button onClick={commitTag} style={{
            fontSize: 11, padding: '4px 8px', borderRadius: 4,
            border: `1px solid ${t.primaryBorder}40`, background: t.primarySoft,
            color: t.primary, cursor: 'pointer', fontWeight: 600,
          }}>{tr('inspector.content.add')}</button>
        </div>
        </div>
        {mapTags.length > 0 && (
          <div data-testid="map-tags" style={{ marginTop: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: t.textMuted, marginBottom: 4 }}>{tr('inspector.tags.mapTags')}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {shownTags.map(([g, n]) => {
                const tc = resolveTagColor(g, t);
                const on = tagPainter === g;
                const has = tags.includes(g);
                return (
                  <button key={g} type="button" data-testid="map-tag" aria-pressed={on}
                    title={on ? tr('inspector.tags.painterOff') : tr('inspector.tags.painterPick', { tag: g })}
                    onClick={() => pickPainter(g)}
                    style={{
                      fontSize: 11, fontWeight: 600, padding: '3px 7px', borderRadius: 3, cursor: 'pointer',
                      background: tc.bg, color: tc.text, letterSpacing: 0.2,
                      border: on ? `2px solid ${t.primary}` : `1px solid ${tc.border}`,
                      margin: on ? -1 : 0, boxShadow: on ? `0 0 0 2px ${t.primarySoft}` : undefined,
                      opacity: has && !on ? 0.55 : 1,
                    }}>
                    #{g} <span style={{ opacity: 0.6, fontWeight: 500 }}>{n}</span>
                  </button>
                );
              })}
              {!shownTags.length && <span style={{ fontSize: 11, color: t.textSubtle }}>{tr('inspector.tags.noMatch')}</span>}
            </div>
            <div data-testid="tag-painter-hint" style={{
              marginTop: 6, fontSize: 11, lineHeight: 1.5, borderRadius: 4,
              padding: tagPainter ? '5px 7px' : 0,
              background: tagPainter ? t.primarySoft : 'transparent',
              color: tagPainter ? t.primary : t.textSubtle, fontWeight: tagPainter ? 600 : 400,
            }}>
              {tagPainter ? tr('inspector.tags.painterOn', { tag: tagPainter }) : tr('inspector.tags.painterHint')}
            </div>
          </div>
        )}
      </InspectorSection>

      {/* 프로젝트 태그 — 일정·담당자·진척율 (2026-10-23) */}
      <div style={nodeDisabled}>
      <ProjectTagsSection t={t} nodeId={selectedId} project={node?.project} />
      </div>
      </>}

      {part !== 'tag' && <MapNotesPanel t={t} selectedId={selectedId} />}

    </div>
    </>
  );
}


// 노트 메뉴: 맵 전체 목록. 편집은 로컬 초안에서 하고 확인할 때만 문서에 반영한다.
type NoteDraft = { session: string; nodeId: string; epoch: number; existing: boolean; initialEditing: boolean; block: NoteBlockData; size?: { rows: number; cols: number } };
function MapNotesPanel({ t, selectedId }: { t: ThemeTokens; selectedId: string | null }) {
  const tr = useTr();
  const map = useDocumentStore((s) => s.map);
  const epoch = useDocumentStore((s) => s.docEpoch);
  const readOnly = !!useCloudStore((s) => s.readOnlyInfo);
  const [draft, setDraft] = useState<NoteDraft | null>(null);
  const [pick, setPick] = useState<{ nodeId: string; epoch: number } | null>(null);
  const rows = useMemo(() => collectMapNotes(map).map((r) => ({ ...r, nodeText: flattenNodeText(r.nodeText) || '—' })), [map]);
  const selected = findNodeInMap(map, selectedId);
  const canAdd = !!selected && !readOnly;
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => { setDraft(null); setPick(null); }, [epoch]);
  useEffect(() => {
    const el = [...(listRef.current?.querySelectorAll<HTMLElement>('[data-note-node]') ?? [])].find((e) => e.dataset.noteNode === selectedId);
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedId]);
  const open = (type: NoteBlockType, nodeId: string, block?: NoteBlockData, size?: { rows: number; cols: number }, initialEditing = true) => {
    setDraft({ session: crypto.randomUUID(), nodeId, epoch, existing: !!block, initialEditing, block: block ? { ...block } : { id: 'note-draft', type, text: '', ...(type === 'checklist' ? { checked: false } : {}) }, size });
  };
  const close = () => setDraft(null);
  const save = (patch: Partial<NoteBlockData> = {}) => {
    if (!draft || readOnly) return;
    const st = useDocumentStore.getState();
    if (st.docEpoch !== draft.epoch || !findNodeInMap(st.map, draft.nodeId)) { close(); return; }
    const b = { ...draft.block, ...patch };
    if (draft.existing) {
      const owner = findNodeInMap(st.map, draft.nodeId);
      if (owner?.notes?.some((n) => n.id === b.id)) st.updateNoteBlock(draft.nodeId, b.id, b);
    } else st.addNoteBlock(draft.nodeId, b.type, b.text, { lang: b.lang, html: b.html, checked: b.checked });
    close();
  };
  const go = (id: string) => {
    useInteractionStore.getState().setSelectedId(id);
    useDocumentStore.getState().expandAncestors(id);
    const vp = useViewportStore.getState(); vp.requestCenterNode(id, vp.zoom);
  };
  const btn = { fontSize: 11, padding: '3px 6px', borderRadius: 4, border: '1px solid ' + t.border, background: t.surface, color: t.text, cursor: 'pointer' };
  return <div data-testid="map-notes">
    <div data-testid="notes-toolbar" style={{ position: 'sticky', top: 0, zIndex: 5, background: t.surface, padding: '10px 12px', borderBottom: '1px solid ' + t.divider }}>
      <b style={{ fontSize: 12, display: 'block', marginBottom: 7 }}>{tr('inspector.note.title')}</b>
      <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
      {BLOCK_TYPES.map((b) => <span key={b.type} style={{ position: 'relative', display: 'inline-flex' }}>
        <button type="button" data-testid={'note-add-' + b.type} disabled={!canAdd}
          onClick={() => { if (!selectedId || !canAdd) return; if (b.type === 'table') setPick({ nodeId: selectedId, epoch }); else open(b.type, selectedId); }}
          style={{ ...btn, background: t.primarySoft, color: t.primary, opacity: canAdd ? 1 : 0.5 }}>+{tr(b.label)}</button>
        {b.type === 'table' && pick && <TableGridPicker t={t} anchor="right" onClose={() => setPick(null)}
          onPick={(rows, cols) => { const p = pick; setPick(null); if (p.epoch === useDocumentStore.getState().docEpoch) open('table', p.nodeId, undefined, { rows, cols }); }} />}
      </span>)}
    </div>
      <div data-testid="notes-summary" style={{ fontSize: 11, color: t.textMuted, marginBottom: 8 }}>
        {tr('inspector.notes.count', { all: rows.length, sel: rows.filter((r) => r.nodeId === selectedId).length })}
      </div>
      </div>
      <div ref={listRef} style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {!rows.length && <div style={{ fontSize: 11, color: t.textSubtle }}>{tr('inspector.notes.emptyMap')}</div>}
        {rows.map(({ nodeId, nodeText, block }) => {
          const meta = BLOCK_META[block.type] ?? BLOCK_META.paragraph;
          return <div key={nodeId + '/' + block.id} data-testid="map-note-row" data-note-node={nodeId} data-note-type={block.type}
            style={{ border: '1px solid ' + (selectedId === nodeId ? t.primaryBorder : t.border), borderRadius: 6, padding: 8, background: selectedId === nodeId ? t.primarySoft : t.surfaceAlt }}>
            <div style={{ display: 'flex', gap: 5, alignItems: 'center', fontSize: 11 }}>
              <b>{meta.icon} {tr(meta.label)}</b>
              <span style={{ flex: 1 }} />
              <button type="button" data-testid="map-note-edit" disabled={readOnly} style={btn} onClick={() => open(block.type, nodeId, block)}>{tr('common.edit')}</button>
              <button type="button" data-testid="map-note-remove" disabled={readOnly} style={btn} onClick={() => { if (window.confirm(tr('inspector.notes.removeConfirm'))) useDocumentStore.getState().removeNoteBlock(nodeId, block.id); }}>{tr('common.delete')}</button>
            </div>
            <button type="button" data-testid="map-note-node" onClick={() => go(nodeId)} title={nodeText}
              style={{ background: 'transparent', border: 0, padding: '5px 0', color: t.primary, cursor: 'pointer', fontSize: 11, width: '100%', textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tr('inspector.notes.owner', { name: nodeText })}</button>
            <div style={{ display: 'flex', gap: 5, alignItems: 'flex-start' }}>
              {block.type === 'checklist' && <input type="checkbox" aria-label={tr('inspector.note.checklist')} data-testid="map-note-check" checked={!!block.checked} disabled={readOnly} onChange={(e) => useDocumentStore.getState().updateNoteBlock(nodeId, block.id, { checked: e.target.checked })} />}
              <button type="button" data-testid="map-note-preview" onClick={() => open(block.type, nodeId, block, undefined, false)}
                style={{ background: 'transparent', border: 0, padding: 0, width: '100%', cursor: 'pointer', color: t.text, fontSize: 11, textAlign: 'left', whiteSpace: 'pre-wrap', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflowWrap: 'anywhere' }}>{block.text || '—'}</button>
            </div>
          </div>;
        })}
      </div>
    {draft && draft.block.type === 'code_block' && draft.initialEditing && <CodeBlockDialog t={t} initialLang={draft.block.lang} initialCode={draft.block.text} onCancel={close} onSave={(lang, text) => save({ lang: lang || undefined, text })} />}
    {draft && draft.block.type === 'table' && draft.initialEditing && <TableDialog t={t} initialMd={draft.existing ? noteTableToMd(draft.block.text) : undefined} initialSize={draft.size} onCancel={close} onSave={(md) => save({ text: noteTableFromMd(md) })} />}
    {draft && (!(draft.block.type === 'code_block' || draft.block.type === 'table') || !draft.initialEditing) && <NoteTextDialog key={draft.session} t={t} nodeId={draft.nodeId} title={flattenNodeText(findNodeInMap(map, draft.nodeId)?.text || '')} initialEditing={draft.initialEditing} readOnly={readOnly} block={draft.block} onChange={(patch) => setDraft((d) => d && d.session === draft.session ? { ...d, block: { ...d.block, ...patch } } : d)} onCancel={close} onSave={(patch) => save(patch)} />}
  </div>;
}

const BLOCK_META: Record<string, { icon: string; label: string }> = {
 paragraph: { icon: '¶', label: 'inspector.note.add.paragraph' },
 code_block: { icon: '</>', label: 'inspector.note.add.code' },
 table: { icon: '⊞', label: 'inspector.note.add.table' },
 checklist: { icon: '☰', label: 'inspector.note.checklist' },
};
