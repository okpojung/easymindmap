// CanvasFloatingToolbar — top-right floating toolbar with two groups:
// (1) Node-scoped actions  (2) View controls
// Spec: docs/03-editor-core/canvas/10-canvas.md § 21.2

import { useEffect, useState, type ReactNode } from 'react';
import type { ThemeTokens } from '@/components/design-tokens/theme';
import { I } from '@/components/icons';
import { findNodeInMap, findParentId, isCenterRootId, useDocumentStore } from '@/stores/documentStore';
import { snapshotNodeStyle } from './stylePainter';
import { mapCenters } from '@/editor/__samples__/types';
import { useInteractionStore } from '@/stores/interactionStore';
import { useViewportStore } from '@/stores/viewportStore';

interface Props {
  t: ThemeTokens;
  hasSelection: boolean;
  focusActive?: boolean;
  onFitView?: () => void;
  onFocusSelected?: () => void;
  /**
   * Kanban 보드 모드 (2026-08-04) — 뷰포트(pan·줌)와 접기가 없는 HTML
   * 보드라 Pan·펼치기/접기 버튼은 숨기고, 중앙 보기/맞추기는 호출부가
   * 스크롤로 구현한다. 노드 추가·삭제·전체화면은 동일.
   */
  kanban?: boolean;
}

export function CanvasFloatingToolbar({
  t, hasSelection, focusActive, onFitView, onFocusSelected, kanban,
}: Props) {
  const selectedId = useInteractionStore((state) => state.selectedId);
  const setSelectedId = useInteractionStore((state) => state.setSelectedId);
  const addChildNode = useDocumentStore((state) => state.addChildNode);
  const deleteNode = useDocumentStore((state) => state.deleteNode);
  const collapseAll = useDocumentStore((state) => state.collapseAll);
  const expandAll = useDocumentStore((state) => state.expandAll);
  // 선택 노드 하위만 펼치기/접기 (2026-09-08) — 다중 선택이면 전부
  const expandSubtree = useDocumentStore((state) => state.expandSubtree);
  const collapseSubtree = useDocumentStore((state) => state.collapseSubtree);
  const multiSelectedIds = useInteractionStore((state) => state.multiSelectedIds);
  const subtreeTargets = multiSelectedIds.length > 1
    ? multiSelectedIds
    : (selectedId && selectedId !== 'root' ? [selectedId] : []);
  // 자식이 있는 노드가 하나라도 있어야 뜻이 있다
  const subtreeHasKids = useDocumentStore((state) => {
    if (!subtreeTargets.length) return false;
    const want = new Set(subtreeTargets);
    let hit = false;
    const walk = (nodes: { id: string; children?: unknown[] }[]) => {
      for (const n of nodes) {
        if (hit) return;
        if (want.has(n.id) && (n.children?.length ?? 0) > 0) { hit = true; return; }
        walk((n.children ?? []) as typeof nodes);
      }
    };
    for (const c of mapCenters(state.map)) walk(c.branches as { id: string; children?: unknown[] }[]);
    return hit;
  });

  // 여러 중심주제 (2026-09-15, 2단계 — emm-spec §3.1 · 10-canvas §21.2)
  const addCenter = useDocumentStore((state) => state.addCenter);
  const promoteToCenter = useDocumentStore((state) => state.promoteToCenter);
  const mergeCentersInto = useDocumentStore((state) => state.mergeCentersInto);
  const centerCount = useDocumentStore((state) => 1 + (state.map.centers?.length ?? 0));
  const selectedIsCenter = useDocumentStore((state) => isCenterRootId(state.map, selectedId));
  // 1레벨 가지(부모가 중심주제 루트)만 중심주제로 올릴 수 있다
  const selectedIsLevel1 = useDocumentStore((state) =>
    !!selectedId && !isCenterRootId(state.map, selectedId)
    && isCenterRootId(state.map, findParentId(state.map, selectedId)));

  const handleAddCenter = () => {
    const id = addCenter();
    setSelectedId(id);
  };
  const handlePromote = () => {
    const id = promoteToCenter(selectedId);
    if (id) setSelectedId(id);
  };
  const handleMerge = () => {
    if (mergeCentersInto(selectedId)) setSelectedId('root');
  };

  const panMode = useViewportStore((state) => state.panMode);
  const togglePanMode = useViewportStore((state) => state.togglePanMode);

  const [isFullscreen, setIsFullscreen] = useState(
    typeof document !== 'undefined' && !!document.fullscreenElement,
  );

  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const handleAddNode = () => {
    const newNodeId = addChildNode(selectedId);
    setSelectedId(newNodeId);
  };

  const handleDeleteNode = () => {
    deleteNode(selectedId);
    setSelectedId(null);
  };

  // 스타일 복사(붓) (2026-09-19) — 선택 노드의 겉모습을 떠서 붓에 담는다.
  // 켜진 상태에서 다시 누르면 끈다. 실제 칠하기·ESC·빈 캔버스 클릭 해제는
  // Canvas 가 맡는다 (docs/03-editor-core/node/05-node-style.md §20).
  const stylePainter = useInteractionStore((state) => state.stylePainter);
  const setStylePainter = useInteractionStore((state) => state.setStylePainter);
  const handleStyleCopy = () => {
    if (stylePainter) { setStylePainter(null); return; }
    if (!selectedId) return;
    const src = findNodeInMap(useDocumentStore.getState().map, selectedId);
    if (!src) return;
    setStylePainter({ sourceId: selectedId, snap: snapshotNodeStyle(src) });
  };

  const handleFullscreen = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void document.documentElement.requestFullscreen();
    }
  };

  return (
    <div style={{
      position: 'absolute', top: 14, right: 14, zIndex: 5,
      display: 'flex', alignItems: 'center', gap: 4,
      padding: 4, borderRadius: 8,
      background: t.surface,
      border: `1px solid ${t.border}`,
      boxShadow: t.shadowSm,
    }}>
      <GroupLabel t={t}>노드</GroupLabel>
      <ToolbarBtn
        t={t}
        title="선택 노드에 자식 노드 추가"
        highlight={hasSelection}
        onClick={handleAddNode}
      >
        <I.Plus size={15} />
      </ToolbarBtn>
      
      <ToolbarBtn
       t={t}
       title="선택 노드 삭제 (Del)"
       danger
       disabled={!hasSelection}
       onClick={handleDeleteNode}
      >
        <I.Trash size={15} />
      </ToolbarBtn>
      {!kanban && (
      <ToolbarBtn
        t={t}
        title={stylePainter
          ? '스타일 복사 끄기 (ESC · 빈 곳 클릭)'
          : '스타일 복사 — 선택 노드의 도형·색·글자맞춤을 붓에 담아 다른 노드에 클릭/드래그로 칠하기'}
        highlight={!!stylePainter}
        disabled={!stylePainter && !hasSelection}
        onClick={handleStyleCopy}
        testId="style-copy"
      >
        <I.Brush size={15} />
      </ToolbarBtn>
      )}

      {!kanban && (
        <>
          <div style={{ width: 1, background: t.divider, margin: '4px 4px', alignSelf: 'stretch' }} />
          <GroupLabel t={t}>중심</GroupLabel>
          <ToolbarBtn
            t={t}
            title="새 중심주제 — 빈 자리에 중심주제를 하나 더 만든다 (끌어서 옮길 수 있다)"
            onClick={handleAddCenter}
            testId="center-add"
          >
            <I.Center size={15} />
          </ToolbarBtn>
          <ToolbarBtn
            t={t}
            title="이 가지를 중심주제로 올리기 — 1레벨 가지를 떼어 새 중심주제로 (하위는 그 가지가 된다)"
            disabled={!selectedIsLevel1}
            onClick={handlePromote}
            testId="center-promote"
          >
            <I.ArrowUp size={15} />
          </ToolbarBtn>
          <ToolbarBtn
            t={t}
            title="다른 중심주제를 이 중심의 가지로 묶기 — 중심주제를 하나로 (각 중심이 가지 하나가 된다)"
            disabled={!selectedIsCenter || centerCount < 2}
            onClick={handleMerge}
            testId="center-merge"
          >
            <I.FolderMove size={15} />
          </ToolbarBtn>
        </>
      )}

      <div style={{ width: 1, background: t.divider, margin: '4px 4px', alignSelf: 'stretch' }} />

      <GroupLabel t={t}>보기</GroupLabel>
      {!kanban && (
        <ToolbarBtn
          t={t}
          title="Pan 모드 — 캔버스 끌기 (H)"
          highlight={panMode}
          onClick={togglePanMode}
        >
          <I.Hand size={15} />
        </ToolbarBtn>
      )}
      <ToolbarBtn
        t={t}
        title={kanban
          ? '선택 카드가 보이게 스크롤'
          : focusActive ? '선택 노드 보기 취소 — 맵 전체 보기' : '선택 노드 화면 중앙 보기 (Alt+F)'}
        highlight={focusActive}
        disabled={!focusActive && !hasSelection}
        onClick={onFocusSelected}
      >
        {focusActive ? <I.FocusOff size={15} /> : <I.Focus size={15} />}
      </ToolbarBtn>
      {/* 모두 펼치기/접기 — HTML 뷰어의 +/− 아이콘과 동일 동작
          (모두 접기 = 자식이 있는 2레벨 이하 노드를 전부 접는다).
          칸반은 접기 개념이 없어 숨긴다. */}
      {!kanban && (
        <>
          <ToolbarBtn
            t={t}
            title="모두 펼치기"
            onClick={() => { expandAll(); onFitView?.(); }}
          >
            <span style={{ fontSize: 15, fontWeight: 700, lineHeight: 1 }}>+</span>
          </ToolbarBtn>
          <ToolbarBtn
            t={t}
            title="모두 접기 — 2레벨만 남기고 전부 접기"
            onClick={() => { collapseAll(); onFitView?.(); }}
          >
            <span style={{ fontSize: 15, fontWeight: 700, lineHeight: 1 }}>−</span>
          </ToolbarBtn>
          {/* 선택 노드 하위만 — 큰 맵에서 보던 가지만 펼치고 접는다 (2026-09-08).
              배치는 펼치는 순간 다시 계산되므로 따로 정리할 것이 없다. */}
          <ToolbarBtn
            t={t}
            title="선택 노드 하위 모두 펼치기 (Alt+=)"
            disabled={!subtreeHasKids}
            onClick={() => expandSubtree(subtreeTargets)}
            testId="expand-subtree"
          >
            <span style={{ fontSize: 13, fontWeight: 700, lineHeight: 1 }}>⊞</span>
          </ToolbarBtn>
          <ToolbarBtn
            t={t}
            title="선택 노드 하위 모두 접기 — 직계 자식만 남기고 (Alt+-)"
            disabled={!subtreeHasKids}
            onClick={() => collapseSubtree(subtreeTargets)}
            testId="collapse-subtree"
          >
            <span style={{ fontSize: 13, fontWeight: 700, lineHeight: 1 }}>⊟</span>
          </ToolbarBtn>
        </>
      )}
      <ToolbarBtn
        t={t}
        title={kanban ? '보드 처음으로 (스크롤 원점)' : '맵 전체를 화면에 맞추기'}
        onClick={onFitView}
      >
        <I.Fit size={15} />
      </ToolbarBtn>
      <ToolbarBtn
        t={t}
        title={isFullscreen ? '전체화면 종료' : '전체화면 모드'}
        highlight={isFullscreen}
        onClick={handleFullscreen}
      >
        {isFullscreen ? <I.FullscreenExit size={16} /> : <I.FullscreenEnter size={16} />}
      </ToolbarBtn>
    </div>
  );
}

function GroupLabel({ t, children }: { t: ThemeTokens; children: ReactNode }) {
  return (
    <span style={{
      fontSize: 9.5, fontWeight: 700, color: t.textSubtle,
      letterSpacing: 0.4, textTransform: 'uppercase',
      padding: '0 4px 0 6px',
    }}>{children}</span>
  );
}

interface ToolbarBtnProps {
  t: ThemeTokens;
  title: string;
  children: ReactNode;
  highlight?: boolean;
  danger?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  testId?: string;
}

function ToolbarBtn({ t, title, children, highlight, danger, disabled, onClick, testId }: ToolbarBtnProps) {
  const [h, setH] = useState(false);
  let bg = 'transparent';
  let color = t.text;

  if (disabled) {
    color = t.textSubtle;
  } else if (highlight) {
    bg = h ? t.primary : t.primarySoft;
    color = h ? '#fff' : t.primary;
  } else if (danger && h) {
    bg = t.danger + '18';
    color = t.danger;
  } else if (h) {
    bg = t.surfaceAlt;
  }

  return (
    <button
      data-testid={testId}
      title={title}
      disabled={disabled}
      onClick={onClick}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        width: 28, height: 28, borderRadius: 5,
        background: bg, color,
        border: 'none',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'background 120ms, color 120ms',
      }}>
      {children}
    </button>
  );
}
