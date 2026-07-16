// KanbanBoard — alternative canvas renderer when layoutType = 'kanban'.
// Spec: docs/03-editor-core/layout/08-layout.md § 7.6, updated:
// - depth-1 nodes are columns, depth-2 nodes are cards, depth-3+ descendants
//   render INSIDE the column as an indented tree-right outline (nested cards).
// - 카드 드래그 이동: 카드(하위 서브트리 포함)를 다른 컬럼/카드로 끌어
//   이동한다 — 컬럼에 놓으면 그 컬럼의 카드로, 카드의 위/아래 30%에
//   놓으면 형제(앞/뒤), 가운데에 놓으면 그 카드의 하위로 (맵과 동일한
//   moveNodeRelative — 하위가 있으면 통째로 이동).
// - 카드 더블클릭 = 편집: 강조 툴바(B/I/S/U/H)·Ctrl+B/I/U·사진 붙여넣기
//   (맵 노드 편집과 동일 — MarkToolbar / toggleMarkRange / clipboardImage).
// - 카드 추가 / 컬럼 추가 버튼 동작 (addChildNode).

import { useEffect, useRef, useState } from 'react';
import type { ThemeTokens } from '@/components/design-tokens/theme';
import type { KanbanBoardData, KanbanCard } from '@/editor/__samples__/types';
import { I } from '@/components/icons';
import { resolveTagColor } from '@/editor/node-renderer/resolveTagColor';
import { parseInlineMarks, toggleMarkRange } from '@/editor/node-renderer/inlineMarks';
import { MarkToolbar } from '@/editor/node-renderer/MarkToolbar';
import { extractClipboardImage } from '@/utils/clipboardImage';
import { useDocumentStore } from '@/stores/documentStore';

interface Props {
  t: ThemeTokens;
  kanban: KanbanBoardData;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

const CHILD_INDENT = 16; // px per depth level inside a column (tree-right feel)

type DropPos = 'before' | 'after' | 'child' | 'col';
interface DropTarget { id: string; pos: DropPos }

// 인라인 강조(**굵게** ==하이라이트== 등)를 카드 제목에 그대로 표시
function InlineTitle({ text }: { text: string }) {
  return (
    <>
      {String(text).split('\n').map((line, i) => (
        <div key={i}>
          {parseInlineMarks(line).map((sg, k) => (
            <span
              key={k}
              style={{
                fontWeight: sg.b ? 700 : undefined,
                fontStyle: sg.i ? 'italic' : undefined,
                textDecoration:
                  [sg.s ? 'line-through' : '', sg.u ? 'underline' : '']
                    .filter(Boolean).join(' ') || undefined,
                background: sg.h ? '#FFE066' : undefined,
                borderRadius: sg.h ? 2 : undefined,
              }}
            >
              {sg.text}
            </span>
          ))}
        </div>
      ))}
    </>
  );
}

// One card box + its descendants, indented tree-right style.
function CardNode({
  t, card, depth, selectedId, onSelect, dragId, dropTarget,
}: {
  t: ThemeTokens;
  card: KanbanCard;
  depth: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  dragId: string | null;
  dropTarget: DropTarget | null;
}) {
  const updateNodeText = useDocumentStore((s) => s.updateNodeText);
  const setNodeImage = useDocumentStore((s) => s.setNodeImage);
  const tc = card.tag ? resolveTagColor(card.tag, t) : null;
  const hasChildren = (card.children?.length ?? 0) > 0;

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(card.title);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const startEdit = () => {
    setDraft(card.title);
    setEditing(true);
    onSelect(card.id);
  };
  const commitEdit = () => {
    const v = draft.trim();
    if (v && v !== card.title) updateNodeText(card.id, v);
    setEditing(false);
  };

  // 선택 구간에 인라인 마커 토글 (맵/아웃라인 편집창과 동일)
  const wrapSelection = (mark: string) => {
    const ta = inputRef.current;
    if (!ta) return;
    const s0 = ta.selectionStart ?? 0;
    const e0 = ta.selectionEnd ?? s0;
    const r = toggleMarkRange(draft, s0, e0, mark);
    setDraft(r.next);
    window.setTimeout(() => {
      ta.focus();
      ta.setSelectionRange(r.selStart, r.selEnd);
    }, 0);
  };

  useEffect(() => {
    if (!editing) return;
    window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
  }, [editing]);

  const isDrop = dropTarget?.id === card.id;
  const dropPos = isDrop ? dropTarget!.pos : null;

  return (
    <div style={{ position: 'relative', opacity: dragId === card.id ? 0.35 : 1 }}>
      {/* 형제(앞/뒤) 드롭 표시 막대 */}
      {dropPos === 'before' && (
        <div style={{ height: 4, borderRadius: 2, background: t.success, marginBottom: 3 }} />
      )}
      <div
        data-kanban-card={card.id}
        onClick={() => onSelect(card.id)}
        onDoubleClick={(e) => { e.stopPropagation(); startEdit(); }}
        style={{
          background: t.surface,
          border: `1px solid ${card.active || selectedId === card.id ? t.primary : t.border}`,
          outline: dropPos === 'child' ? `2px solid ${t.success}` : undefined,
          borderRadius: 8,
          padding: depth === 0 ? 10 : '7px 9px',
          marginBottom: 6,
          cursor: editing ? 'text' : 'grab',
          boxShadow: card.active ? `0 0 0 3px ${t.primary}22` : 'none',
        }}
      >
        {editing ? (
          <div data-kanban-edit onPointerDown={(e) => e.stopPropagation()}>
            <MarkToolbar
              t={t}
              onApply={wrapSelection}
              style={{ display: 'inline-flex', marginBottom: 4 }}
            />
            <textarea
              ref={inputRef}
              value={draft}
              rows={Math.min(8, Math.max(2, draft.split('\n').length))}
              onChange={(e) => setDraft(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onPaste={(e) => {
                // 사진/기사 붙여넣기 — 텍스트는 입력창에, 사진은 노드에
                const kind = extractClipboardImage(e.clipboardData, (img) =>
                  setNodeImage(card.id, img),
                );
                if (kind === 'file') e.preventDefault();
              }}
              onMouseDown={(e) => {
                const ta2 = e.currentTarget as HTMLTextAreaElement;
                if (!e.shiftKey && ta2.selectionStart !== ta2.selectionEnd) {
                  ta2.setSelectionRange(ta2.selectionStart, ta2.selectionStart);
                }
              }}
              onDragStart={(e) => e.preventDefault()}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && !e.altKey) {
                  const k = e.key.toLowerCase();
                  if (k === 'b') { e.preventDefault(); wrapSelection('**'); return; }
                  if (k === 'i') { e.preventDefault(); wrapSelection('*'); return; }
                  if (k === 'u') { e.preventDefault(); wrapSelection('__'); return; }
                }
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitEdit(); }
                if (e.key === 'Escape') { e.preventDefault(); setDraft(card.title); setEditing(false); }
              }}
              onBlur={commitEdit}
              style={{
                width: '100%', boxSizing: 'border-box', resize: 'none',
                border: `1px solid ${t.primaryBorder}`, borderRadius: 5,
                background: t.surface, color: t.text,
                fontSize: 12, lineHeight: 1.45, padding: '5px 7px',
                outline: 'none', fontFamily: 'inherit',
              }}
            />
          </div>
        ) : (
          <>
            <div
              style={{
                fontSize: depth === 0 ? 12.5 : 11.5,
                color: t.text,
                fontWeight: 500,
                marginBottom: tc || card.image ? 6 : 0,
                lineHeight: 1.35,
              }}
            >
              <InlineTitle text={card.title} />
            </div>
            {card.image && (
              // 노드에 붙여넣은 사진 — 카드 안 썸네일
              <img
                src={card.image.src}
                alt=""
                draggable={false}
                style={{
                  width: '100%', maxHeight: 110, objectFit: 'cover',
                  borderRadius: 5, marginBottom: tc ? 6 : 0, display: 'block',
                }}
              />
            )}
            {tc && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span
                  style={{
                    fontSize: 10, padding: '1px 6px', borderRadius: 3,
                    background: tc.bg, color: tc.text,
                    border: `1px solid ${tc.border}`,
                    fontWeight: 600, letterSpacing: 0.2,
                  }}
                >
                  #{card.tag}
                </span>
              </div>
            )}
          </>
        )}
      </div>
      {dropPos === 'after' && (
        <div style={{ height: 4, borderRadius: 2, background: t.success, marginBottom: 3 }} />
      )}

      {hasChildren && (
        <div style={{ position: 'relative', marginLeft: CHILD_INDENT }}>
          <div
            style={{
              position: 'absolute', left: -CHILD_INDENT + 6, top: -6, bottom: 12,
              width: 1.5, background: t.borderStrong, borderRadius: 1,
            }}
          />
          {card.children!.map((child) => (
            <div key={child.id} style={{ position: 'relative' }}>
              <div
                style={{
                  position: 'absolute', left: -CHILD_INDENT + 6, top: 14,
                  width: CHILD_INDENT - 8, height: 1.5,
                  background: t.borderStrong, borderRadius: 1,
                }}
              />
              <CardNode
                t={t} card={child} depth={depth + 1}
                selectedId={selectedId} onSelect={onSelect}
                dragId={dragId} dropTarget={dropTarget}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function KanbanBoard({ t, kanban, selectedId, onSelect }: Props) {
  const moveNodeRelative = useDocumentStore((s) => s.moveNodeRelative);
  const addChildNode = useDocumentStore((s) => s.addChildNode);

  // 카드 드래그 이동 상태 — 보드 레벨에서 위임 처리 (컬럼을 넘나들므로)
  const dragRef = useRef<{
    pointerId: number; id: string; startX: number; startY: number; moved: boolean;
  } | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const dropRef = useRef<DropTarget | null>(null);
  const [ghost, setGhost] = useState<{ x: number; y: number; title: string } | null>(null);

  const findTarget = (clientX: number, clientY: number, dragging: string): DropTarget | null => {
    const el = document.elementFromPoint(clientX, clientY);
    if (!el) return null;
    const cardEl = el.closest('[data-kanban-card]');
    if (cardEl) {
      const id = cardEl.getAttribute('data-kanban-card')!;
      if (id !== dragging) {
        const r = cardEl.getBoundingClientRect();
        const rel = (clientY - r.y) / Math.max(1, r.height);
        // 위/아래 30% = 형제(앞/뒤), 가운데 = 그 카드의 하위
        const pos: DropPos = rel < 0.3 ? 'before' : rel > 0.7 ? 'after' : 'child';
        return { id, pos };
      }
      return null;
    }
    const colEl = el.closest('[data-kanban-col]');
    if (colEl) return { id: colEl.getAttribute('data-kanban-col')!, pos: 'col' };
    return null;
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('[data-kanban-edit]') || target.tagName === 'TEXTAREA') return;
    if (target.closest('button')) return;
    const cardEl = target.closest('[data-kanban-card]');
    if (!cardEl) return;
    dragRef.current = {
      pointerId: e.pointerId,
      id: cardEl.getAttribute('data-kanban-card')!,
      startX: e.clientX, startY: e.clientY, moved: false,
    };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    if (!d.moved && Math.abs(e.clientX - d.startX) + Math.abs(e.clientY - d.startY) > 5) {
      d.moved = true;
      setDragId(d.id);
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }
    if (!d.moved) return;
    const tgt = findTarget(e.clientX, e.clientY, d.id);
    dropRef.current = tgt;
    setDropTarget(tgt);
    const cardEl = document.querySelector(`[data-kanban-card="${d.id}"]`);
    setGhost({ x: e.clientX + 10, y: e.clientY + 8, title: cardEl?.textContent?.slice(0, 24) || '' });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    dragRef.current = null;
    if (d.moved) {
      const tgt = findTarget(e.clientX, e.clientY, d.id) ?? dropRef.current;
      if (tgt) {
        const moved = moveNodeRelative(
          d.id, tgt.id, tgt.pos === 'col' ? 'child' : tgt.pos,
        );
        if (moved) onSelect(d.id);
      }
    }
    dropRef.current = null;
    setDragId(null);
    setDropTarget(null);
    setGhost(null);
  };

  const addCard = (colId: string) => {
    const id = addChildNode(colId);
    if (id) onSelect(id);
  };
  const addColumn = () => {
    const id = addChildNode('root');
    if (id) onSelect(id);
  };

  return (
    <div
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      style={{
        flex: 1, minWidth: 0, overflow: 'auto', position: 'relative',
        background: `${t.canvas} radial-gradient(circle at center, ${t.border}aa 1px, transparent 1px) 0 0 / 24px 24px repeat`,
        padding: '40px 30px',
        userSelect: dragId ? 'none' : undefined,
      }}
    >
      <div style={{
        position: 'absolute', top: 14, left: 14, zIndex: 5,
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '5px 10px', borderRadius: 20,
        background: t.surface, border: `1px solid ${t.border}`,
        boxShadow: t.shadowSm,
        fontSize: 11, color: t.textMuted, fontWeight: 500,
      }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: t.primary }} />
        Kanban 보드 · 카드 드래그로 이동 · 더블클릭 편집
      </div>

      <div style={{ fontSize: 20, fontWeight: 700, color: t.text, marginBottom: 20, paddingLeft: 4 }}>
        📋 {kanban.title}
      </div>

      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
        {kanban.columns.map(col => (
          <div
            key={col.id}
            data-kanban-col={col.id}
            style={{
              width: 260, flexShrink: 0,
              background: t.surfaceAlt,
              border: `1px solid ${dropTarget?.pos === 'col' && dropTarget.id === col.id ? t.success : t.border}`,
              outline: dropTarget?.pos === 'col' && dropTarget.id === col.id
                ? `2px solid ${t.success}` : undefined,
              borderRadius: 10,
              padding: 10,
            }}
          >
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '2px 6px 10px',
              borderBottom: `1px solid ${t.divider}`,
              marginBottom: 8,
            }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: col.color }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: t.text }}>{col.title}</span>
              <span style={{
                fontSize: 11, color: t.textMuted, marginLeft: 'auto',
                background: t.surface, padding: '1px 6px', borderRadius: 8,
              }}>
                {col.count}
              </span>
            </div>
            {col.cards.map(card => (
              <CardNode
                key={card.id}
                t={t} card={card} depth={0}
                selectedId={selectedId} onSelect={onSelect}
                dragId={dragId} dropTarget={dropTarget}
              />
            ))}
            <button
              onClick={() => addCard(col.id)}
              style={{
                width: '100%', padding: '6px 8px',
                background: 'transparent', border: `1px dashed ${t.border}`,
                borderRadius: 6, color: t.textMuted, cursor: 'pointer',
                fontSize: 12, fontWeight: 500,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
              }}>
              <I.Plus size={12} /> 카드 추가
            </button>
          </div>
        ))}
        <button
          onClick={addColumn}
          style={{
            width: 200, flexShrink: 0,
            padding: 14, background: 'transparent',
            border: `1px dashed ${t.borderStrong}`, borderRadius: 10,
            color: t.textMuted, cursor: 'pointer',
            fontSize: 13, fontWeight: 500,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}>
          <I.Plus size={14} /> 컬럼 추가
        </button>
      </div>

      {/* 드래그 고스트 — 커서를 따라다니는 카드 제목 */}
      {ghost && (
        <div style={{
          position: 'fixed', left: ghost.x, top: ghost.y, zIndex: 50,
          background: t.surface, border: `1.5px solid ${t.primary}`,
          borderRadius: 7, padding: '5px 10px', fontSize: 11.5,
          color: t.text, boxShadow: '0 4px 14px rgba(60,45,15,0.25)',
          pointerEvents: 'none', maxWidth: 220, overflow: 'hidden',
          whiteSpace: 'nowrap', textOverflow: 'ellipsis',
        }}>
          {ghost.title}
        </div>
      )}
    </div>
  );
}
