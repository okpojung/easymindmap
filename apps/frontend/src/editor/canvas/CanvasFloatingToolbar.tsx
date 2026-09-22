// CanvasFloatingToolbar — top-right floating toolbar with two groups:
// (1) Node-scoped actions  (2) View controls
// Spec: docs/03-editor-core/canvas/10-canvas.md § 21.2

import { useEffect, useState, type ReactNode } from 'react';
import type { ThemeTokens } from '@/components/design-tokens/theme';
import { I } from '@/components/icons';
import { findNodeInMap, findParentId, getNodeDepth, isCenterRootId, useDocumentStore } from '@/stores/documentStore';
import { snapshotNodeStyle } from './stylePainter';
import { CalendarNodeDialog } from '@/editor/dialogs/CalendarNodeDialog';
import { parseYearMonth, type YearMonth } from '@/utils/calendarNodes';
import { expandScope } from '@/utils/expandScope';
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
  /**
   * ★ [모두 펼치기]·[모두 접기]가 **어디에 걸리나** (2026-09-21 사용자 결정).
   *
   *   아무것도 안 골랐으면 맵 전체, 노드를 골랐으면 **그 노드의 하위만**.
   *   중심을 고른 것은 전체와 같다 — 셈은 `utils/expandScope.ts` 한 곳에
   *   있고 아웃라인 머리말의 같은 단추도 그것을 쓴다.
   */
  const rootIds = useDocumentStore((state) => mapCenters(state.map).map((c) => c.root.id));
  const scope = expandScope(selectedId, multiSelectedIds, rootIds);

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
  const requestCenterNode = useViewportStore((state) => state.requestCenterNode);
  // 선택이 있을 때의 +/− 뒤 화면: **맵 전체 맞추기가 아니라** 고른 노드를
  // 100% 로 화면 중앙에 (2026-09-21 사용자 보고: "노드를 선택하고 모두 펼치기
  // 하면 100% 로 보여야 하는데 전체 맵이 보이도록 아주 작아진다"). 선택이
  // 없으면(맵 전체) 예전처럼 전체 맞추기.
  const afterFold = (scopeIds: string[] | 'all') => {
    if (scopeIds === 'all') { onFitView?.(); return; }
    const focus = selectedId && scopeIds.includes(selectedId) ? selectedId : scopeIds[0];
    if (focus) requestCenterNode(focus, 100); else onFitView?.();
  };

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

  // [+] 의 두 얼굴 (2026-09-22 사용자 요청) —
  //   · 선택이 없으면: 빈 캔버스에 **중심 노드** 추가 (새 중심주제 버튼과 같다)
  //   · 선택이 있으면: 메뉴 → "자식 노드 추가" / "달력 노드 추가…"
  // 달력은 노드 글(과 조상)에서 년도·월을 읽어 미리 채운 창을 띄운다.
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [calendar, setCalendar] = useState<{ parentId: string; parentLabel: string; initial: YearMonth } | null>(null);
  useEffect(() => {
    if (!addMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!(e.target as Element).closest?.('[data-testid="add-menu"], [data-testid="add-node"]')) setAddMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setAddMenuOpen(false); };
    document.addEventListener('mousedown', onDown, true);
    document.addEventListener('keydown', onKey, true);
    return () => { document.removeEventListener('mousedown', onDown, true); document.removeEventListener('keydown', onKey, true); };
  }, [addMenuOpen]);
  const handleAddClick = () => {
    if (!selectedId) { handleAddCenter(); return; }
    setAddMenuOpen((v) => !v);
  };
  const openCalendar = () => {
    setAddMenuOpen(false);
    if (!selectedId) return;
    const map = useDocumentStore.getState().map;
    const node = findNodeInMap(map, selectedId);
    if (!node) return;
    const ancestors: string[] = [];
    for (let pid = findParentId(map, selectedId); pid; pid = findParentId(map, pid)) {
      const p = findNodeInMap(map, pid);
      if (p) ancestors.push(p.text);
    }
    setCalendar({ parentId: selectedId, parentLabel: node.text || '(빈 노드)', initial: parseYearMonth(node.text, ancestors) });
  };

  // 연결선 (2026-09-22) — [연결] 은 선택 노드를 시작점으로 연결 모드를 켠다
  // (다시 누르면 끈다). 끝 노드 클릭·Esc·빈 곳 클릭은 Canvas 가 맡는다.
  // 연결선을 고른 상태면 휴지통이 그 연결선을 지운다.
  const connectMode = useInteractionStore((state) => state.connectMode);
  const setConnectMode = useInteractionStore((state) => state.setConnectMode);
  const selectedConnectorId = useInteractionStore((state) => state.selectedConnectorId);
  const setSelectedConnectorId = useInteractionStore((state) => state.setSelectedConnectorId);
  const removeConnector = useDocumentStore((state) => state.removeConnector);
  const handleConnect = () => {
    if (connectMode) { setConnectMode(null); return; }
    if (!selectedId) return;
    setConnectMode({ fromId: selectedId });
  };

  const handleDeleteNode = () => {
    if (selectedConnectorId) {
      removeConnector(selectedConnectorId);
      setSelectedConnectorId(null);
      return;
    }
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
    const map = useDocumentStore.getState().map;
    const src = findNodeInMap(map, selectedId);
    if (!src) return;
    // 깊이를 함께 준다 — colorKey 없는 흰 노드의 "보이는" 계열까지 뜨도록
    setStylePainter({ sourceId: selectedId, snap: snapshotNodeStyle(src, getNodeDepth(map, selectedId)) });
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
      <span style={{ position: 'relative', display: 'inline-flex' }}>
        <ToolbarBtn
          t={t}
          title={hasSelection
            ? '노드 추가 — 자식 노드 · 달력 노드(년도 → 1월~12월, 년월 → 주별)'
            : '중심 노드 추가 (노드를 고르면 그 아래에 자식 노드 추가)'}
          highlight={hasSelection || addMenuOpen}
          onClick={handleAddClick}
          testId="add-node"
        >
          <I.Plus size={15} />
        </ToolbarBtn>
        {addMenuOpen && (
          <div
            data-testid="add-menu"
            style={{
              position: 'absolute', top: 32, left: 0, zIndex: 20, minWidth: 190,
              background: t.surface, border: `1px solid ${t.border}`, borderRadius: 8,
              boxShadow: '0 8px 24px rgba(60,45,15,0.25)', padding: 4,
              display: 'flex', flexDirection: 'column', gap: 2,
            }}
          >
            <MenuItem t={t} testId="add-menu-child" label="자식 노드 추가" hint="선택 노드 아래에 하나" onClick={() => { setAddMenuOpen(false); handleAddNode(); }} />
            <MenuItem t={t} testId="add-menu-calendar" label="달력 노드 추가…" hint="년도 → 1월~12월 · 년월 → 주별(일~토)" onClick={openCalendar} />
          </div>
        )}
      </span>
      {calendar && (
        <CalendarNodeDialog
          t={t}
          parentId={calendar.parentId}
          parentLabel={calendar.parentLabel}
          initial={calendar.initial}
          onClose={() => setCalendar(null)}
        />
      )}
      
      {!kanban && (
      <ToolbarBtn
        t={t}
        title={connectMode
          ? '연결 모드 끄기 (Esc)'
          : '연결선 — 선택 노드에서 시작해, 다음에 클릭하는 노드까지 연결선을 긋는다'}
        highlight={!!connectMode}
        disabled={!connectMode && !hasSelection}
        onClick={handleConnect}
        testId="connect-node"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <rect x="1.5" y="2" width="5" height="4" rx="1.2" />
          <rect x="9.5" y="10" width="5" height="4" rx="1.2" />
          <path d="M6.5 4 H8.5 A1.5 1.5 0 0 1 10 5.5 V8 A1.5 1.5 0 0 0 11.5 9.5" />
          <path d="M10.2 8.2 L11.5 9.6 L12.8 8.2" />
        </svg>
      </ToolbarBtn>
      )}
      <ToolbarBtn
       t={t}
       title={selectedConnectorId ? '선택한 연결선 삭제 (Del)' : '선택 노드 삭제 (Del)'}
       danger
       disabled={!hasSelection && !selectedConnectorId}
       onClick={handleDeleteNode}
       testId="delete-node"
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
            title={scope === 'all'
              ? '모두 펼치기 — 맵 전체 (노드를 고르면 그 아래만)'
              : '선택한 노드의 하위 모두 펼치기 (선택을 풀면 맵 전체)'}
            testId="expand-all"
            onClick={() => {
              if (scope === 'all') expandAll(); else expandSubtree(scope);
              afterFold(scope);
            }}
          >
            <span style={{ fontSize: 15, fontWeight: 700, lineHeight: 1 }}>+</span>
          </ToolbarBtn>
          <ToolbarBtn
            t={t}
            title={scope === 'all'
              ? '모두 접기 — 2레벨만 남기고 전부 (노드를 고르면 그 아래만)'
              : '선택한 노드의 하위 모두 접기 — 직계 자식만 남기고'}
            testId="collapse-all"
            onClick={() => {
              if (scope === 'all') collapseAll(); else collapseSubtree(scope);
              afterFold(scope);
            }}
          >
            <span style={{ fontSize: 15, fontWeight: 700, lineHeight: 1 }}>−</span>
          </ToolbarBtn>
          {/* ★ 전용 단추 ⊞/⊟ 는 **없앴다** (2026-09-21). 위의 +/− 가
              선택에 따라 같은 일을 하므로, 두면 **같은 기호가 둘**이 된다
              (§5-1-6). 단축키 `Alt+=`·`Alt+-` 는 그대로 둔다 — 선택이
              있을 때만 도는 것도 그대로다. */}
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

function MenuItem({ t, label, hint, onClick, testId }: { t: ThemeTokens; label: string; hint: string; onClick: () => void; testId: string }) {
  const [h, setH] = useState(false);
  return (
    <button
      data-testid={testId}
      onClick={onClick}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        textAlign: 'left', border: 'none', borderRadius: 6, cursor: 'pointer',
        padding: '6px 10px', background: h ? t.surfaceAlt : 'transparent', color: t.text,
        display: 'flex', flexDirection: 'column', gap: 1,
      }}
    >
      <span style={{ fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap' }}>{label}</span>
      <span style={{ fontSize: 10.5, color: t.textMuted, whiteSpace: 'nowrap' }}>{hint}</span>
    </button>
  );
}
