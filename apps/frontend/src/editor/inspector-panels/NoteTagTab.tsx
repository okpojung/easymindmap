// NoteTagTab — tag chips + structured note (paragraph/code_block/table/checklist)
// editor, wired to the selected node via documentStore.

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CodeBlockDialog } from '@/editor/node-renderer/CodeBlockDialog';
import { collectMapNotes } from './mapNotes';
import { flattenNodeText } from '@/editor/node-renderer/RichTextHtml';
import { useViewportStore } from '@/stores/viewportStore';
import { useCloudStore } from '@/stores/cloudStore';
import { DialogFrame } from '@/components/ui/DialogFrame';
import { useInteractionStore } from '@/stores/interactionStore';
import type { ThemeTokens } from '@/components/design-tokens/theme';
import type { NoteBlock as NoteBlockData, NoteBlockType } from '@/editor/__samples__/types';
import { I } from '@/components/icons';
import { useDocumentStore, findNodeInMap } from '@/stores/documentStore';
import { InspectorSection, Toggle } from './InspectorSection';
import { useEditorUiStore } from '@/stores/editorUiStore';
import { resolveTagColor } from '@/editor/node-renderer/resolveTagColor';
import { sanitizeRichHtml } from '@/utils/sanitizeRichHtml';
import { rebuildRichHtml, remapImgSrcs } from '@/utils/richNoteEdit';
import { embedRichHtmlImages } from '@/utils/embedImage';
import { useNoteHtmlResolver } from '@/utils/imageSrc';
import { TableDialog, TableGridPicker } from '@/editor/node-renderer/TableDialog';
import { noteTableCells, noteTableFromMd, noteTableToMd } from './noteTable';
import { cellLines } from '@/editor/node-renderer/mdTable';
import { useTr } from '@/i18n';

// 손가락 기기의 입력칸 16px·누를 자리 40px (data-mm-touch) — 불러오기만 하면 CSS 가 들어간다
import '@/components/ui/mobileCss';
import { useCoarse } from '@/hooks/useViewport';
import { ProjectTagsSection } from './ProjectTagsSection';
// 코드 블록 언어 목록.
// [서버 연결 예정] Supabase 연동 시 이 하드코딩 목록은 code_languages
// 테이블로 이관되어 시스템 관리자 설정 메뉴에서 추가·수정·삭제한다
// (docs/02-domain/db-schema.md §향후 관리 테이블, 32-settings.md 참조).
const CODE_LANGUAGES = [
  'Shell', 'JavaScript', 'TypeScript', 'Node', 'Python', 'PHP', 'Java',
  'C', 'C++', 'C#', 'Go', 'Rust', 'SQL', 'HTML', 'CSS', 'JSON', 'YAML',
  'Markdown', '기타',
];
// '기타' 는 노트에 저장되는 값이라 그대로 두고, 보이는 이름만 번역한다
const CODE_LANG_OTHER = '기타';

// 노트 블록 입력창 높이(행 수) — 길이를 조절하려면 이 숫자만 바꾸면 된다.
// (docs/03-editor-core/node/04-node-content.md §UI 조정 가이드 참조)
const NOTE_INPUT_ROWS: Record<string, number> = {
  paragraph: 15,
  code_block: 15,
};

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
type NoteDraft = { session: string; nodeId: string; epoch: number; existing: boolean; block: NoteBlockData; size?: { rows: number; cols: number } };
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
  const open = (type: NoteBlockType, nodeId: string, block?: NoteBlockData, size?: { rows: number; cols: number }) => {
    setDraft({ session: crypto.randomUUID(), nodeId, epoch, existing: !!block, block: block ? { ...block } : { id: 'note-draft', type, text: '', ...(type === 'checklist' ? { checked: false } : {}) }, size });
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
    <InspectorSection t={t} title={tr('inspector.note.title')} action={<div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
      {BLOCK_TYPES.map((b) => <span key={b.type} style={{ position: 'relative', display: 'inline-flex' }}>
        <button type="button" data-testid={'note-add-' + b.type} disabled={!canAdd}
          onClick={() => { if (!selectedId || !canAdd) return; if (b.type === 'table') setPick({ nodeId: selectedId, epoch }); else open(b.type, selectedId); }}
          style={{ ...btn, background: t.primarySoft, color: t.primary, opacity: canAdd ? 1 : 0.5 }}>+{tr(b.label)}</button>
        {b.type === 'table' && pick && <TableGridPicker t={t} anchor="right" onClose={() => setPick(null)}
          onPick={(rows, cols) => { const p = pick; setPick(null); if (p.epoch === useDocumentStore.getState().docEpoch) open('table', p.nodeId, undefined, { rows, cols }); }} />}
      </span>)}
    </div>}>
      <div data-testid="notes-summary" style={{ fontSize: 11, color: t.textMuted, marginBottom: 8 }}>
        {tr('inspector.notes.count', { all: rows.length, sel: rows.filter((r) => r.nodeId === selectedId).length })}
      </div>
      <div ref={listRef} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
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
              <button type="button" data-testid="map-note-preview" disabled={readOnly} onClick={() => open(block.type, nodeId, block)}
                style={{ background: 'transparent', border: 0, padding: 0, width: '100%', cursor: 'pointer', color: t.text, fontSize: 11, textAlign: 'left', whiteSpace: 'pre-wrap', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflowWrap: 'anywhere' }}>{block.text || '—'}</button>
            </div>
          </div>;
        })}
      </div>
    </InspectorSection>
    {draft && draft.block.type === 'code_block' && <CodeBlockDialog t={t} initialLang={draft.block.lang} initialCode={draft.block.text} onCancel={close} onSave={(lang, text) => save({ lang: lang || undefined, text })} />}
    {draft && draft.block.type === 'table' && <TableDialog t={t} initialMd={draft.existing ? noteTableToMd(draft.block.text) : undefined} initialSize={draft.size} onCancel={close} onSave={(md) => save({ text: noteTableFromMd(md) })} />}
    {draft && draft.block.type !== 'code_block' && draft.block.type !== 'table' && <NoteTextDialog t={t} block={draft.block} onChange={(patch) => setDraft((d) => d && d.session === draft.session ? { ...d, block: { ...d.block, ...patch } } : d)} onCancel={close} onSave={() => save()} />}
  </div>;
}

function NoteTextDialog({ t, block, onChange, onCancel, onSave }: { t: ThemeTokens; block: NoteBlockData; onChange: (p: Partial<NoteBlockData>) => void; onCancel: () => void; onSave: () => void }) {
  const tr = useTr();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.querySelector<HTMLElement>('textarea, input')?.focus(); }, []);
  return createPortal(<div ref={ref} onPointerDown={(e) => e.stopPropagation()} onKeyDown={(e) => {
    e.stopPropagation();
    if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.nativeEvent.isComposing) { e.preventDefault(); if (block.text.trim()) onSave(); }
  }}>
    <DialogFrame t={t} testId="note-text-dialog" title={tr(block.type === 'checklist' ? 'inspector.notes.checkTitle' : 'inspector.notes.paragraphTitle')} onClose={onCancel} width="min(680px, 94vw)" zIndex={1200}
      footer={<div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button type="button" data-testid="note-dialog-cancel" onClick={onCancel}>{tr('common.cancel')} (Esc)</button>
        <button type="button" data-testid="note-dialog-save" disabled={!block.text.trim()} onClick={onSave}>{tr('common.save')} (Ctrl+Enter)</button>
      </div>}>
      <NoteBlockEditor t={t} block={block} onChange={onChange} onRemove={onCancel} />
    </DialogFrame>
  </div>, document.body);
}

// label 은 사전 키 — 렌더할 때 번역한다
const BLOCK_META: Record<string, { icon: string; label: string }> = {
  paragraph: { icon: '¶', label: 'inspector.note.add.paragraph' },
  code_block: { icon: '</>', label: 'inspector.note.add.code' },
  table: { icon: '⊞', label: 'inspector.note.add.table' },
  // ★ 아이콘을 ☑ 로 두면 **바로 아래 진짜 체크 상자와 헷갈린다** —
  //   블록마다 늘 켜져 있는 ☑ 가 머리글에 붙어 있으니 "체크했는데
  //   왜 위에도 체크가 있지"가 된다 (2026-08-09 보고). 목록 글리프로.
  checklist: { icon: '☰', label: 'inspector.note.checklist' },
  // 폐기된 옛 타입(warning/tip) 데이터 하위호환 — 문단으로 취급
  warning: { icon: '¶', label: 'inspector.note.add.paragraph' },
  tip: { icon: '¶', label: 'inspector.note.add.paragraph' },
};

function NoteBlockEditor({
  t, block, onChange, onRemove, onEnterNext, onEditTable,
}: {
  t: ThemeTokens;
  block: NoteBlockData;
  onChange: (patch: Partial<NoteBlockData>) => void;
  onRemove: () => void;
  // 체크리스트 전용 — Enter/Shift+Enter 로 다음 항목 추가
  onEnterNext?: () => void;
  // 표 전용 — 표 팝업(격자/MD)으로 고치기
  onEditTable?: () => void;
}) {
  // 노트 사진이 **우리 저장소**에 있으면 그릴 때 토큰을 붙인다 (2026-08-20).
  // 토큰은 문서에 저장하지 않는다 — 저장하면 만료되는 날 사진이 전부 깨진다.
  const tr = useTr();
  const currentBlock = useRef(block); currentBlock.current = block;
  const resolveNoteHtml = useNoteHtmlResolver();
  // 노트 글꼴·크기 (맵 설정) — 뷰어 팝업과 동일 규칙 (기본 13pt)
  const noteFont = useDocumentStore((st) => st.map.settings?.noteFont);
  const noteFs = noteFont?.size && noteFont.size > 0 ? noteFont.size : 13;
  const noteFamily = noteFont?.family && noteFont.family.trim() ? noteFont.family : undefined;
  const meta = BLOCK_META[block.type] ?? BLOCK_META.paragraph;
  const accent =
    block.type === 'code_block' ? t.accent
    : block.type === 'table' ? t.primary
    : block.type === 'checklist' ? t.success
    : t.borderStrong;

  return (
    <div style={{
      borderRadius: 6,
      background: t.surfaceAlt,
      border: `1px solid ${t.border}`,
      borderLeft: `3px solid ${accent}`,
      overflow: 'hidden',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 5,
        padding: '4px 8px',
        fontSize: 9.5, fontWeight: 700, color: accent,
        letterSpacing: 0.3, textTransform: 'uppercase',
        borderBottom: `1px solid ${t.divider}`,
      }}>
        <span style={{ fontSize: 10 }}>{meta.icon}</span>
        <span>{tr(meta.label)}</span>
        {block.type === 'code_block' && (
          <select
            value={block.lang ?? ''}
            onChange={(e) => onChange({ lang: e.target.value })}
            style={{
              width: 104, fontSize: 9.5, padding: '1px 3px', borderRadius: 3,
              border: `1px solid ${t.border}`, background: t.surface,
              color: t.text, outline: 'none', fontWeight: 500,
              textTransform: 'none', letterSpacing: 0, cursor: 'pointer',
            }}
          >
            <option value="">{tr('inspector.note.pickLang')}</option>
            {CODE_LANGUAGES.map((lang) => (
              <option key={lang} value={lang}>{lang === CODE_LANG_OTHER ? tr('inspector.note.langOther') : lang}</option>
            ))}
          </select>
        )}
        {block.type === 'table' && (
          <button
            data-testid="note-table-edit"
            onClick={onEditTable}
            title={tr('inspector.note.editTable')}
            style={{
              marginLeft: 'auto', background: 'transparent', border: 'none',
              color: accent, cursor: 'pointer', fontSize: 12, lineHeight: 1, padding: '0 4px',
            }}
          >✎</button>
        )}
        <button onClick={onRemove} title={tr('inspector.note.removeBlock')} style={{
          marginLeft: block.type === 'table' ? 0 : 'auto', background: 'transparent', border: 'none',
          color: t.textMuted, cursor: 'pointer', fontSize: 13, lineHeight: 1,
        }}>×</button>
      </div>

      <div style={{ padding: '6px 8px' }}>
        {block.type === 'table' ? (
          <NoteTableView t={t} text={block.text} fs={noteFs} family={noteFamily} onEdit={onEditTable} />
        ) : block.type === 'checklist' ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            {/* 클릭 판정은 6px 여유를 둔 래퍼가 받는다 — 14px 사각형만 노리면
                빗나가기 쉽다 (docs/05-implementation/coding-conventions.md §5-1-5).
                음수 margin으로 겉보기 배치는 그대로. */}
            <span
              data-testid="note-check-toggle"
              role="checkbox" tabIndex={0} aria-checked={!!block.checked}
              onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); e.stopPropagation(); onChange({ checked: !block.checked }); } }}
              // 다른 세 자리(맵 노드·아웃라인·팝업)와 같은 표식 —
              // 상태를 **취소선 같은 겉모습으로** 알아내려 하면, 표시
              // 규칙을 바꿀 때마다 검사가 함께 깨진다 (§5-1-6)
              data-checked={block.checked ? '1' : '0'}
              onClick={() => onChange({ checked: !block.checked })}
              style={{
                padding: 6, margin: -6, cursor: 'pointer', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              {/* 체크 표시는 **✓ 자체가 크고 뚜렷해야** 한다 — 예전에는
                  9px 짜리 ✓ 가 초록 칠 위에 묻혀 "녹색 네모"로만 보였다
                  (2026-08-09 보고: "체크가 잘 인식이 안 된다").
                  상자를 키우고(16) ✓ 도 키웠다(13, 굵기 3). */}
              <span style={{
                width: 16, height: 16, borderRadius: 4,
                border: `1.5px solid ${block.checked ? t.success : t.borderStrong}`,
                background: block.checked ? t.success : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                {block.checked && (
                  <I.Check size={13} strokeWidth={3} style={{ color: '#fff' }} />
                )}
              </span>
            </span>
            <input
              // 새로 추가된 빈 체크 항목은 바로 입력할 수 있게 자동 포커스
              // (Enter로 다음 항목을 만들면 그 항목으로 커서가 넘어간다)
              autoFocus={block.text === ''}
              value={block.text}
              onChange={(e) => onChange({ text: e.target.value })}
              // Enter / Shift+Enter → 다음 체크 항목 추가. 내용이 비어 있으면
              // 빈 항목이 쌓이지 않도록 아무 것도 하지 않는다.
              onKeyDown={(e) => {
                if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
                e.preventDefault();
                if (block.text.trim()) onEnterNext?.();
              }}
              placeholder={tr('inspector.note.todo')}
              // 완료해도 **취소선을 긋지 않는다** (2026-08-09 사용자 결정).
              // 맵 노드 안의 체크(- [x])도 긋지 않는데 여기만 그어서
              // 규칙이 갈렸고, 글자가 지워진 것처럼 보여 읽기도 나빴다.
              // 완료 표시는 ✓ 하나로 충분하다.
              style={{
                flex: 1, fontSize: 12, border: 'none', outline: 'none',
                background: 'transparent', color: t.text, minWidth: 0,
              }}
            />
          </div>
        ) : (
          <textarea
            // 새로 추가된 빈 블록은 바로 입력·붙여넣기할 수 있게 자동 포커스
            // (포커스가 없으면 Ctrl+V가 노드 쪽으로 가는 혼동 방지)
            autoFocus={block.text === ''}
            value={block.text}
            // 리치 붙여넣기 뒤 글을 고치면 — **사진은 버리지 않는다**
            // (2026-09-11). 전에는 글자 하나(Enter 하나)에 html 을 통째로
            // 버려 사진·서식이 함께 사라졌다. 글은 새 글로, 사진은 원래
            // 자리에 다시 끼운다(`rebuildRichHtml`). 사진이 없는 서식은
            // 전처럼 평문으로 돌아간다.
            onChange={(e) => {
              const v = e.target.value;
              onChange({ text: v, html: block.html ? rebuildRichHtml(block.html, v) : undefined });
            }}
            onPaste={(e) => {
              // 문단 블록: 웹 기사 등에서 복사한 내용(text/html)이 있으면
              // 사진+텍스트를 서식째 살려 붙여넣는다 (sanitize 통과분만).
              if (block.type !== 'paragraph') return;
              const raw = e.clipboardData?.getData('text/html');
              if (!raw) return;
              const clean = sanitizeRichHtml(raw);
              if (!clean.html) return;
              e.preventDefault();
              onChange({ html: clean.html, text: clean.text });
              // 사진 다운로드 내장 — 기사 삭제·오프라인에도 보존.
              // 완료 시 블록 html이 그대로일 때만 교체 (그 사이 사용자가
              // 텍스트를 수정해 서식이 제거됐으면 되살리지 않는다)
              void embedRichHtmlImages(clean.html).then((h2) => {
                if (!h2) return;
                const cur = currentBlock.current;
                if (!cur?.html) return;
                if (cur.html === clean.html) { onChange({ html: h2 }); return; }
                // 그 사이 글을 고쳤어도(html 이 다시 짜였어도) 사진 주소는
                // 옮긴다 — 안 옮기면 기사 원본 주소가 남는다 (2026-09-11)
                const remapped = remapImgSrcs(cur.html, clean.html, h2);
                if (remapped !== cur.html) onChange({ html: remapped });
              });
            }}
            rows={NOTE_INPUT_ROWS[block.type] ?? 15}
            placeholder={
              block.type === 'code_block'
                ? tr('inspector.note.codePlaceholder')
                : tr('inspector.note.textPlaceholder')
            }
            style={{
              width: '100%', resize: 'vertical', border: 'none', outline: 'none',
              background: 'transparent', color: t.text,
              // 노트 글꼴·크기 (맵 설정 — 기본 13pt, 코드/표는 고정폭 유지)
              fontSize: block.type === 'code_block' ? Math.max(9, noteFs - 2) : noteFs,
              lineHeight: 1.5,
              fontFamily: block.type === 'code_block'
                ? 'ui-monospace, SFMono-Regular, Menlo, monospace'
                : (noteFamily ?? 'inherit'),
              padding: 0,
            }}
          />
        )}

        {/* 리치 붙여넣기(사진+서식) 미리보기 — 문단 블록에 html이 있을 때.
            배지·"서식 제거" 버튼 등 부가 UI는 두지 않는다(2026-07 사용자
            피드백: 사진+텍스트만 깔끔하게). 위 텍스트를 수정하면 서식은
            자연히 제거된다(onChange에서 html: undefined). */}
        {block.type === 'paragraph' && block.html && (
          <div style={{ marginTop: 6 }}>
            <div
              className="mm-rich-note"
              style={{
                maxHeight: 220, overflow: 'auto', fontSize: 11, lineHeight: 1.6,
                border: `1px solid ${t.border}`, borderRadius: 5,
                background: t.surface, color: t.text, padding: '6px 8px',
              }}
              // sanitizeRichHtml()을 통과한 안전한 HTML만 저장·표시된다
              dangerouslySetInnerHTML={{ __html: resolveNoteHtml(block.html) ?? '' }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * 노트 표 블록 — 그려 보이는 표 (2026-09-19). 원문 textarea 대신 노트 뷰어와
 * 같은 모양으로 보여 주고, 더블클릭 또는 머리글 ✎ 로 표 팝업을 연다.
 * 표로 읽히지 않는 원문(옛 데이터의 한 줄 등)은 그대로 글로 보인다.
 */
function NoteTableView({
  t, text, fs, family, onEdit,
}: {
  t: ThemeTokens; text: string; fs: number; family?: string; onEdit?: () => void;
}) {
  const tr = useTr();
  const cells = noteTableCells(text);
  const cellStyle = (align: string | null, head: boolean) => ({
    border: `1px solid ${t.border}`, padding: '3px 6px',
    textAlign: (align ?? 'left') as 'left' | 'center' | 'right',
    background: head ? t.surface : 'transparent', fontWeight: head ? 700 : 400,
    whiteSpace: 'pre-wrap' as const, wordBreak: 'break-word' as const,
  });
  // 셀 안 `<br>` = 줄바꿈 (2026-10-15) — 맵·뷰어·내보내기와 같은 규칙
  // 빈 칸도 한 줄 높이로 — 새로 넣은 빈 표의 행이 납작하게 붙어 안 보였다 (2026-11-08)
  const cellBody = (v: string) => (v.trim() === '' ? '\u00a0' : cellLines(v).map((ln, i) => (
    <Fragment key={i}>{i > 0 ? <br /> : null}{ln}</Fragment>
  )));
  return (
    <div
      data-testid="note-table-view"
      onDoubleClick={onEdit}
      title={tr('inspector.note.dblclickTable')}
      style={{ cursor: 'pointer', fontSize: Math.max(9, fs - 1), fontFamily: family ?? 'inherit', color: t.text }}
    >
      {cells ? (
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr>{cells.headers.map((h, c) => <th key={c} style={cellStyle(cells.aligns[c], true)}>{cellBody(h)}</th>)}</tr>
          </thead>
          <tbody>
            {cells.rows.map((r, i) => (
              <tr key={i}>{r.map((v, c) => <td key={c} style={cellStyle(cells.aligns[c], false)}>{cellBody(v)}</td>)}</tr>
            ))}
          </tbody>
        </table>
      ) : text.trim() ? (
        <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>{text}</pre>
      ) : (
        <div style={{ fontSize: 10.5, color: t.textSubtle }}>{tr('inspector.note.emptyTable')}</div>
      )}
    </div>
  );
}
