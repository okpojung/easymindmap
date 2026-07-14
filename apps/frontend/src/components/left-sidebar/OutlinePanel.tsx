// OutlinePanel — 편집 중인 맵의 전체 구조. 캔버스와 양방향 연동:
//   · 행 클릭 = 노드 선택
//   · 더블클릭(또는 Enter/F2) = 텍스트 인라인 수정 → 맵에 반영
//   · Tab = 들여쓰기(앞 형제의 자식으로), Shift+Tab = 내어쓰기(부모의
//     다음 형제로) — 아웃라인 들여쓰기가 곧 맵의 레벨이 된다
// 이동은 documentStore.moveNodeRelative를 사용하므로 캔버스 드래그 이동과
// 동일한 규칙(깊이 제한 등)을 따른다. Ctrl+Z로 되돌리기 가능.

import { useEffect, useRef, useState } from 'react';
import type { ThemeTokens } from '@/components/design-tokens/theme';
import type { OutlineNode as OutlineNodeData, MindNode } from '@/editor/__samples__/types';
import { I } from '@/components/icons';
import { useInteractionStore } from '@/stores/interactionStore';
import { useDocumentStore, findNodeInMap, findParentId } from '@/stores/documentStore';

interface PanelProps {
  t: ThemeTokens;
  outline: OutlineNodeData[];
}

export function OutlinePanel({ t, outline }: PanelProps) {
  return (
    <div style={{ padding: '10px 6px 12px' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '4px 10px 2px',
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: t.textSubtle,
            textTransform: 'uppercase',
            letterSpacing: 0.5,
          }}
        >
          전체 구조
        </div>

        <button
          style={{
            background: 'none',
            border: 'none',
            color: t.textMuted,
            cursor: 'pointer',
            display: 'flex',
            padding: 2,
          }}
        >
          <I.MoreH size={14} />
        </button>
      </div>
      <div style={{ fontSize: 9.5, color: t.textSubtle, padding: '0 10px 8px', lineHeight: 1.5 }}>
        더블클릭: 수정 · Tab: 들여쓰기 · Shift+Tab: 내어쓰기
      </div>

      {outline.map((node) => (
        <OutlineRow key={node.id} t={t} node={node} />
      ))}
    </div>
  );
}

function OutlineRow({ t, node }: { t: ThemeTokens; node: OutlineNodeData }) {
  const [expanded, setExpanded] = useState(node.expanded !== false);
  const hasChildren = !!node.children && node.children.length > 0;
  // 아웃라인 행 클릭 = 캔버스의 노드 선택과 연동
  const setSelectedId = useInteractionStore((s) => s.setSelectedId);
  const map = useDocumentStore((s) => s.map);
  const updateNodeText = useDocumentStore((s) => s.updateNodeText);
  const moveNodeRelative = useDocumentStore((s) => s.moveNodeRelative);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(node.text);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (editing) window.setTimeout(() => { inputRef.current?.focus(); inputRef.current?.select(); }, 0);
  }, [editing]);

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

  // 같은 부모 아래에서의 형제 목록 (부모가 루트면 branches)
  const siblingsOf = (): MindNode[] => {
    const parentId = findParentId(map, node.id);
    if (!parentId || parentId === 'root') return map.branches;
    const parent = findNodeInMap(map, parentId) as MindNode | null;
    return parent?.children ?? [];
  };

  // Tab — 들여쓰기: 바로 앞 형제의 자식으로 이동 (레벨 +1)
  const indent = () => {
    if (node.id === 'root') return;
    const sibs = siblingsOf();
    const idx = sibs.findIndex((s) => s.id === node.id);
    if (idx <= 0) return; // 앞 형제가 없으면 들여쓰기 불가
    moveNodeRelative(node.id, sibs[idx - 1].id, 'child');
    setSelectedId(node.id);
  };

  // Shift+Tab — 내어쓰기: 부모의 다음 형제로 이동 (레벨 -1)
  const outdent = () => {
    if (node.id === 'root' || node.depth <= 1) return; // 1레벨은 루트의 자식이 한계
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
      startEdit();
    }
  };

  return (
    <div>
      <div
        data-outline-id={node.id}
        tabIndex={0}
        onClick={() => setSelectedId(node.id)}
        onDoubleClick={(e) => { e.stopPropagation(); startEdit(); }}
        onKeyDown={handleKeyDown}
        title="더블클릭: 수정 · Tab: 들여쓰기 · Shift+Tab: 내어쓰기"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '5px 6px 5px',
          paddingLeft: 8 + node.depth * 14,
          borderRadius: 6,
          background: node.selected ? t.primarySoft : 'transparent',
          color: node.selected ? t.primary : t.text,
          fontSize: 13,
          fontWeight: node.depth === 0 ? 600 : node.selected ? 600 : 400,
          cursor: 'pointer',
          position: 'relative',
          marginBottom: 1,
          outline: 'none',
        }}
      >
        <button
          onClick={(e) => { e.stopPropagation(); setExpanded((x) => !x); }}
          tabIndex={-1}
          style={{
            width: 16,
            height: 16,
            background: 'none',
            border: 'none',
            color: t.textMuted,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            visibility: hasChildren ? 'visible' : 'hidden',
            padding: 0,
          }}
        >
          {expanded ? (
            <I.ChevronDown size={12} strokeWidth={2} />
          ) : (
            <I.ChevronRight size={12} strokeWidth={2} />
          )}
        </button>

        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: '50%',
            background:
              node.depth === 0
                ? t.primary
                : node.selected
                  ? t.primary
                  : t.borderStrong,
            flexShrink: 0,
            border: node.depth === 0 ? `2px solid ${t.primary}` : 'none',
          }}
        />

        {editing ? (
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onBlur={commitEdit}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') { e.preventDefault(); commitEdit(); }
              if (e.key === 'Escape') { e.preventDefault(); setDraft(node.text); setEditing(false); }
              if (e.key === 'Tab') {
                e.preventDefault();
                commitEdit();
                if (e.shiftKey) outdent();
                else indent();
              }
            }}
            style={{
              flex: 1,
              minWidth: 0,
              fontSize: 13,
              padding: '1px 5px',
              borderRadius: 4,
              border: `1px solid ${t.primaryBorder}`,
              background: t.surface,
              color: t.text,
              outline: 'none',
            }}
          />
        ) : (
          <span
            style={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {node.text}
          </span>
        )}

        {node.selected && !editing && (
          <span
            style={{
              marginLeft: 'auto',
              fontSize: 9,
              color: t.primary,
              fontWeight: 700,
            }}
          >
            ●
          </span>
        )}
      </div>

      {expanded &&
        hasChildren &&
        node.children!.map((c) => <OutlineRow key={c.id} t={t} node={c} />)}
    </div>
  );
}
