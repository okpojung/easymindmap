// OutlineEditorPane — 아웃라인 분할 화면의 왼쪽 페인.
// 좌측 레일의 '아웃라인' 아이콘을 켜면 메인 편집 영역이 좌(이 페인)/우(맵)
// 로 나뉜다. 맵과 실시간 양방향 동기화(같은 documentStore).
//
// 아웃라인에서 가능한 편집 (의도적으로 제한):
//   · 텍스트 수정 — 더블클릭(또는 Enter/F2), Enter 저장 · Esc 취소
//   · 레벨 변경 — Tab 들여쓰기 / Shift+Tab 내어쓰기 (들여쓰기 = 맵 레벨)
//   · 노드 추가/삭제 — 행 호버 시 ＋형제 · ＋자식 · 🗑 버튼 (Delete 키도 동작)
// 노트·하이퍼링크·첨부·태그의 "편집"은 맵(속성 탭)에서만 한다. 대신 행에
// 인디케이터를 표시하고, 클릭하면 맵과 동일하게 동작한다:
//   링크 → 열기(여럿이면 목록) · 노트 → 뷰어 팝업 · 첨부/멀티미디어 → 새 탭

import { useEffect, useRef, useState } from 'react';
import type { ThemeTokens } from '@/components/design-tokens/theme';
import type { OutlineNode as OutlineNodeData, MindNode } from '@/editor/__samples__/types';
import { I } from '@/components/icons';
import { useInteractionStore } from '@/stores/interactionStore';

// 아웃라인 연속 입력 — "이 노드를 바로 편집 상태로 열어라" 신호.
// Enter로 형제를 추가하면 새 행이 곧바로 입력 모드가 된다 (노트패드처럼).
let editRequestId: string | null = null;
export function requestOutlineEdit(id: string | null) { editRequestId = id; }
import { useDocumentStore, findNodeInMap, findParentId } from '@/stores/documentStore';
import { useEditorUiStore } from '@/stores/editorUiStore';
import {
  nodeContentIndicators,
  isNoteKind,
  notesOfKind,
  NOTE_KIND_META,
  type ContentKind,
  type NoteKind,
} from '@/editor/node-renderer/nodeContent';
import { NoteViewerPopover } from '@/editor/canvas/NoteViewerPopover';
import { parseInlineMarks } from '@/editor/node-renderer/inlineMarks';
import type { LaidOutNode } from '@/layout/types';

interface PaneProps {
  t: ThemeTokens;
  outline: OutlineNodeData[];
}

interface ListPopup {
  nodeId: string;
  title: string;
  items: { label: string; url?: string }[];
}

export function OutlineEditorPane({ t, outline }: PaneProps) {
  const setOutlineSplit = useEditorUiStore((s) => s.setOutlineSplit);
  const [notePopup, setNotePopup] = useState<{ nodeId: string; kind: NoteKind } | null>(null);
  const [listPopup, setListPopup] = useState<ListPopup | null>(null);
  const map = useDocumentStore((s) => s.map);

  const noteNode = notePopup ? (findNodeInMap(map, notePopup.nodeId) as MindNode | null) : null;
  const noteBlocks = notePopup && noteNode ? notesOfKind(noteNode.notes, notePopup.kind) : [];

  return (
    <div style={{
      height: '100%', display: 'flex', flexDirection: 'column',
      background: t.surface, position: 'relative', minWidth: 0,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '9px 14px', borderBottom: `1px solid ${t.divider}`,
        background: t.surfaceAlt, flexShrink: 0,
      }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: t.text }}>아웃라인</div>
        <div style={{ fontSize: 9.5, color: t.textSubtle, flex: 1, minWidth: 0 }}>
          더블클릭: 입력 · Enter: 아래 행 추가 · Tab/Space: 들여쓰기 · Shift+Enter: 줄바꿈
        </div>
        <button onClick={() => setOutlineSplit(false)} title="아웃라인 닫기"
          style={{
            border: 'none', background: 'none', color: t.textMuted,
            cursor: 'pointer', fontSize: 13, lineHeight: 1, padding: 2,
          }}>✕</button>
      </div>

      <div style={{ flex: 1, overflow: 'auto', minHeight: 0, padding: '8px 6px 16px' }}>
        {outline.map((node) => (
          <PaneRow key={node.id} t={t} node={node}
            onOpenNote={(nodeId, kind) => { setListPopup(null); setNotePopup({ nodeId, kind }); }}
            onOpenList={(p) => { setNotePopup(null); setListPopup(p); }} />
        ))}
      </div>

      {/* 노트 뷰어 팝업 — 맵의 인디케이터 클릭과 동일한 창 (이동·크기 조절) */}
      {notePopup && noteNode && noteBlocks.length > 0 && (
        <NoteViewerPopover
          key={`${notePopup.nodeId}:${notePopup.kind}`}
          t={t}
          title={noteNode.text}
          heading={NOTE_KIND_META[notePopup.kind].label}
          accent={NOTE_KIND_META[notePopup.kind].color}
          notes={noteBlocks}
          onClose={() => setNotePopup(null)}
        />
      )}

      {/* 링크/첨부 목록 팝업 — 항목 클릭 시 새 탭으로 연다 */}
      {listPopup && (
        <div style={{
          position: 'absolute', right: 14, top: 60, width: 260, zIndex: 30,
          background: t.surface, border: `1px solid ${t.border}`, borderRadius: 10,
          boxShadow: '0 8px 24px rgba(80, 60, 20, 0.18)', padding: '10px 12px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: t.text, flex: 1 }}>
              {listPopup.title}
            </div>
            <button onClick={() => setListPopup(null)}
              style={{ border: 'none', background: 'none', color: t.textMuted, cursor: 'pointer' }}>✕</button>
          </div>
          {listPopup.items.map((it, i) => (
            <div key={i}
              onClick={() => it.url && window.open(it.url, '_blank', 'noopener')}
              style={{
                fontSize: 11.5, padding: '5px 6px', borderRadius: 5,
                cursor: it.url ? 'pointer' : 'default',
                color: it.url ? t.primary : t.textMuted,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
              {it.label}{it.url ? ' ↗' : ' (파일 없음)'}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PaneRow({ t, node, onOpenNote, onOpenList }: {
  t: ThemeTokens;
  node: OutlineNodeData;
  onOpenNote: (nodeId: string, kind: NoteKind) => void;
  onOpenList: (p: ListPopup) => void;
}) {
  const [expanded, setExpanded] = useState(node.expanded !== false);
  const [hover, setHover] = useState(false);
  const hasChildren = !!node.children && node.children.length > 0;

  const setSelectedId = useInteractionStore((s) => s.setSelectedId);
  const map = useDocumentStore((s) => s.map);
  const updateNodeText = useDocumentStore((s) => s.updateNodeText);
  const moveNodeRelative = useDocumentStore((s) => s.moveNodeRelative);
  const addChildNode = useDocumentStore((s) => s.addChildNode);
  const addSiblingNode = useDocumentStore((s) => s.addSiblingNode);
  const deleteNode = useDocumentStore((s) => s.deleteNode);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(node.text);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (editing) window.setTimeout(() => { inputRef.current?.focus(); inputRef.current?.select(); }, 0);
  }, [editing]);

  // Enter로 방금 만든 행이면 곧바로 입력 모드로 (노트패드식 연속 입력)
  useEffect(() => {
    if (editRequestId === node.id) {
      editRequestId = null;
      setDraft(node.text);
      setEditing(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node.id]);

  // 인디케이터 — 맵과 동일한 규칙 (nodeContentIndicators)
  const rawNode = (node.id === 'root' ? map.root : findNodeInMap(map, node.id)) as MindNode | null;
  const indicators = rawNode ? nodeContentIndicators(rawNode as unknown as LaidOutNode) : [];

  const startEdit = () => {
    setDraft(node.text);
    setEditing(true);
    setSelectedId(node.id);
  };

  const commitEdit = () => {
    const v = draft.trim();
    if (v && v !== node.text) updateNodeText(node.id, v);
    setEditing(false);
  };

  const siblingsOf = (): MindNode[] => {
    const parentId = findParentId(map, node.id);
    if (!parentId || parentId === 'root') return map.branches;
    const parent = findNodeInMap(map, parentId) as MindNode | null;
    return parent?.children ?? [];
  };

  const indent = () => {
    if (node.id === 'root') return;
    const sibs = siblingsOf();
    const idx = sibs.findIndex((s) => s.id === node.id);
    if (idx <= 0) return;
    moveNodeRelative(node.id, sibs[idx - 1].id, 'child');
    setSelectedId(node.id);
  };

  const outdent = () => {
    if (node.id === 'root' || node.depth <= 1) return;
    const parentId = findParentId(map, node.id);
    if (!parentId || parentId === 'root') return;
    moveNodeRelative(node.id, parentId, 'after');
    setSelectedId(node.id);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      e.stopPropagation();
      if (editing) commitEdit();
      if (e.shiftKey) outdent();
      else indent();
      return;
    }
    if (!editing && (e.key === 'Enter' || e.key === 'F2')) {
      e.preventDefault();
      e.stopPropagation();
      startEdit();
      return;
    }
    if (!editing && (e.key === 'Delete' || e.key === 'Backspace')) {
      if (node.id === 'root') return;
      e.preventDefault();
      e.stopPropagation();
      deleteNode(node.id);
    }
  };

  const indicatorClick = (kind: ContentKind) => {
    if (!rawNode) return;
    setSelectedId(node.id);
    if (isNoteKind(kind)) {
      onOpenNote(node.id, kind);
      return;
    }
    const ind = indicators.find((c) => c.kind === kind);
    if (!ind) return;
    if (ind.items.length === 1 && ind.items[0].url) {
      window.open(ind.items[0].url, '_blank', 'noopener'); // 새 탭에서 열기
      return;
    }
    onOpenList({ nodeId: node.id, title: ind.title, items: ind.items });
  };

  const btn = (label: string, title: string, onClick: () => void) => (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      title={title}
      tabIndex={-1}
      style={{
        border: `1px solid ${t.border}`, background: t.surface, color: t.textMuted,
        borderRadius: 4, fontSize: 10, padding: '1px 5px', cursor: 'pointer',
        lineHeight: 1.4, flexShrink: 0,
      }}>{label}</button>
  );

  return (
    <div>
      <div
        data-outline-id={node.id}
        tabIndex={0}
        onClick={() => setSelectedId(node.id)}
        onDoubleClick={(e) => { e.stopPropagation(); startEdit(); }}
        onKeyDown={handleKeyDown}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          display: 'flex', alignItems: 'flex-start', gap: 4,
          padding: '5px 6px',
          paddingLeft: 8 + node.depth * 16,
          borderRadius: 6,
          background: node.selected ? t.primarySoft : 'transparent',
          color: node.selected ? t.primary : t.text,
          fontSize: 13,
          fontWeight: node.depth === 0 ? 600 : node.selected ? 600 : 400,
          cursor: 'pointer', position: 'relative', marginBottom: 1, outline: 'none',
        }}
      >
        <button
          onClick={(e) => { e.stopPropagation(); setExpanded((x) => !x); }}
          tabIndex={-1}
          style={{
            width: 16, height: 16, background: 'none', border: 'none',
            color: t.textMuted, cursor: 'pointer', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            visibility: hasChildren ? 'visible' : 'hidden', padding: 0,
          }}
        >
          {expanded
            ? <I.ChevronDown size={12} strokeWidth={2} />
            : <I.ChevronRight size={12} strokeWidth={2} />}
        </button>

        <span style={{
          width: 7, height: 7, borderRadius: '50%',
          background: node.depth === 0 || node.selected ? t.primary : t.borderStrong,
          flexShrink: 0,
          border: node.depth === 0 ? `2px solid ${t.primary}` : 'none',
        }} />

        {editing ? (
          <textarea
            ref={inputRef}
            value={draft}
            rows={Math.min(10, Math.max(1, draft.split('\n').length))}
            onChange={(e) => setDraft(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onDragStart={(e) => e.preventDefault()}
            onBlur={commitEdit}
            onKeyDown={(e) => {
              e.stopPropagation();
              // 노트패드식 연속 입력:
              //   Enter        = 저장 + 아래 형제 행 추가 + 이어서 입력
              //   Shift+Enter  = 줄바꿈 (한 노드 안에서)
              //   Tab / (빈 행에서) Space = 들여쓰기 → 하위 노드로
              //   Shift+Tab    = 내어쓰기
              //   (빈 행에서) Backspace   = 행 삭제
              //   Esc          = 취소(입력 종료)
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                commitEdit();
                const newId = node.id === 'root'
                  ? addChildNode('root')
                  : addSiblingNode(node.id, 'after');
                if (newId) {
                  setSelectedId(newId);
                  requestOutlineEdit(newId);
                }
                return;
              }
              if (e.key === 'Escape') { e.preventDefault(); setDraft(node.text); setEditing(false); }
              if (e.key === 'Tab') {
                e.preventDefault();
                commitEdit();
                if (e.shiftKey) outdent();
                else indent();
                requestOutlineEdit(node.id); // 레벨 이동 후 계속 입력
                return;
              }
              const ta = e.currentTarget as HTMLTextAreaElement;
              if (e.key === ' ' && draft === '' && (ta.selectionStart ?? 0) === 0) {
                // 빈 새 행에서 스페이스 = 들여쓰기 (하위 노드로)
                e.preventDefault();
                commitEdit();
                indent();
                requestOutlineEdit(node.id);
                return;
              }
              if (e.key === 'Backspace' && draft === '') {
                // 빈 행에서 백스페이스 = 행 삭제
                e.preventDefault();
                setEditing(false);
                if (node.id !== 'root') deleteNode(node.id);
              }
            }}
            style={{
              flex: 1, minWidth: 0, fontSize: 13, lineHeight: 1.5,
              padding: '2px 6px', resize: 'vertical',
              borderRadius: 4, border: `1px solid ${t.primaryBorder}`,
              background: t.surface, color: t.text, outline: 'none',
              fontFamily: 'inherit',
            }}
          />
        ) : (
          // 노드 내용 전체 표시 — 여러 줄 텍스트(줄바꿈 유지, 인라인
          // 강조 스타일 그대로 표시) + 사진
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.45,
            }}><InlineText text={node.text} /></div>
            {rawNode?.image?.src && (
              <img
                src={rawNode.image.src}
                alt=""
                style={{
                  display: 'block', maxWidth: '75%', maxHeight: 140,
                  borderRadius: 6, margin: '4px 0 2px',
                  border: `1px solid ${t.border}`,
                }}
              />
            )}
          </div>
        )}

        {/* 콘텐츠 인디케이터 — 클릭 시 맵과 동일한 동작 */}
        {!editing && indicators.length > 0 && (
          <span style={{ display: 'inline-flex', gap: 3, marginLeft: 4, flexShrink: 0 }}>
            {indicators.map((ic) => (
              <span key={ic.kind}
                onClick={(e) => { e.stopPropagation(); indicatorClick(ic.kind); }}
                title={ic.title}
                style={
                  isNoteKind(ic.kind)
                    ? {
                        width: 14, height: 14, borderRadius: 3.5,
                        background: NOTE_KIND_META[ic.kind].color, color: '#FFF',
                        fontSize: 9, fontWeight: 800, lineHeight: '14px',
                        textAlign: 'center', cursor: 'pointer',
                        fontFamily: 'Arial, sans-serif',
                      }
                    : { fontSize: 11, cursor: 'pointer', lineHeight: 1 }
                }
              >
                {isNoteKind(ic.kind)
                  ? (ic.kind === 'note-table' ? '⊞' : ic.kind === 'note-check' ? '✓' : NOTE_KIND_META[ic.kind].letter)
                  : ic.icon}
              </span>
            ))}
          </span>
        )}

        {/* 호버 시 추가/삭제 버튼 (아웃라인에서 허용된 편집) */}
        {hover && !editing && (
          <span style={{ display: 'inline-flex', gap: 3, marginLeft: 'auto', flexShrink: 0 }}>
            {node.id !== 'root' && btn('＋형제', '아래에 형제 노드 추가', () => {
              const id = addSiblingNode(node.id, 'after');
              if (id) setSelectedId(id);
            })}
            {btn('＋자식', '자식 노드 추가', () => {
              const id = addChildNode(node.id);
              if (id) setSelectedId(id);
            })}
            {node.id !== 'root' && btn('🗑', '노드 삭제 (하위 포함)', () => deleteNode(node.id))}
          </span>
        )}
      </div>

      {expanded && hasChildren &&
        node.children!.map((c) => (
          <PaneRow key={c.id} t={t} node={c} onOpenNote={onOpenNote} onOpenList={onOpenList} />
        ))}
    </div>
  );
}


// 인라인 강조 표시 — 노드의 **굵게**/*기울임*/~~취소선~~/__밑줄__/
// ==하이라이트== 마커를 맵과 동일한 스타일로 렌더링 (마커 문자 숨김)
function InlineText({ text }: { text: string }) {
  const lines = String(text || '').split('\n');
  return (
    <>
      {lines.map((line, li) => (
        <span key={li}>
          {li > 0 && '\n'}
          {parseInlineMarks(line).map((sg, k) => (
            <span
              key={k}
              style={{
                fontWeight: sg.b ? 700 : undefined,
                fontStyle: sg.i ? 'italic' : undefined,
                textDecoration:
                  [sg.s ? 'line-through' : '', sg.u ? 'underline' : '']
                    .filter(Boolean)
                    .join(' ') || undefined,
                background: sg.h ? '#FFE066' : undefined,
                borderRadius: sg.h ? 2 : undefined,
              }}
            >
              {sg.text}
            </span>
          ))}
        </span>
      ))}
    </>
  );
}
