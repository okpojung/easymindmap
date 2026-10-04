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
import { useEditorUiStore } from '@/stores/editorUiStore';
import { useTr } from '@/i18n';
import { usePhoneLayout, useCoarse } from '@/hooks/useViewport';
import { primeTouchKeyboard } from './touchKeyboard';

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
  const promoteToCenter = useDocumentStore((state) => state.promoteToCenter);
  const mergeCentersInto = useDocumentStore((state) => state.mergeCentersInto);
  const centerCount = useDocumentStore((state) => 1 + (state.map.centers?.length ?? 0));
  const selectedIsCenter = useDocumentStore((state) => isCenterRootId(state.map, selectedId));
  // 1레벨 가지(부모가 중심주제 루트)만 중심주제로 올릴 수 있다
  const selectedIsLevel1 = useDocumentStore((state) =>
    !!selectedId && !isCenterRootId(state.map, selectedId)
    && isCenterRootId(state.map, findParentId(state.map, selectedId)));

  // 새 중심주제 = **배치 모드** (2026-10-02 사용자 보고 "원하는 위치에 추가할 수
  // 없다"). 전에는 누르는 즉시 맨 오른쪽에 자동 배치됐다. 이제 단추는 모드를
  // 켜고, 캔버스의 빈 자리를 클릭하면 **거기에** 생긴다 (Canvas handlePointerDown).
  // 재클릭·Esc 는 취소. `addCenter` 자체는 그대로 쓸 수 있다(자리 없이 = 자동).
  const placingCenter = useViewportStore((state) => state.placingCenter);
  const setPlacingCenter = useViewportStore((state) => state.setPlacingCenter);
  const addCenter = useDocumentStore((state) => state.addCenter);
  const handleAddCenter = () => {
    setPlacingCenter(!placingCenter);
  };
  // 칸반에는 Canvas 가 없어 배치 모드를 받을 곳이 없다 (Codex #609) — 켜져 있던
  // 모드는 끄고, 선택 없는 [+] 는 전처럼 즉시(자동 배치) 만든다.
  useEffect(() => {
    if (kanban && placingCenter) setPlacingCenter(false);
  }, [kanban, placingCenter, setPlacingCenter]);
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

  const tr = useTr();
  // 폰 폭 — 자주 쓰는 단추 몇 개 + [더 보기] 메뉴로 접는다 (모바일 웹, 2026-10-05).
  // 390px 에 단추 13개(손가락 40px)를 한 줄로 두면 왼쪽으로 넘쳐 잘렸다.
  const compact = usePhoneLayout();
  const coarse = useCoarse();
  const [moreOpen, setMoreOpen] = useState(false);
  // 노드를 길게 누르면 캔버스가 요청한다 → 메뉴를 펼친다 (처음 값은 무시)
  const nodeMenuSeq = useInteractionStore((state) => state.nodeMenuSeq);
  const [seenMenuSeq, setSeenMenuSeq] = useState(nodeMenuSeq);
  useEffect(() => {
    if (nodeMenuSeq === seenMenuSeq) return;
    setSeenMenuSeq(nodeMenuSeq);
    if (compact && !kanban) setMoreOpen(true);
  }, [nodeMenuSeq, seenMenuSeq, compact, kanban]);
  useEffect(() => {
    if (!moreOpen) return;
    const onDown = (e: PointerEvent) => {
      if (!(e.target as Element).closest?.('[data-testid="m-canvas-more-panel"], [data-testid="m-canvas-more"]')) setMoreOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMoreOpen(false); };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey, true);
    return () => { document.removeEventListener('pointerdown', onDown, true); document.removeEventListener('keydown', onKey, true); };
  }, [moreOpen]);
  useEffect(() => { if (!compact) setMoreOpen(false); }, [compact]);
  const requestEdit = useInteractionStore((state) => state.requestEdit);
  // iPhone Safari 는 문서 전체화면을 지원하지 않는다 — 없는 기능의 단추는 숨긴다
  const fullscreenSupported = typeof document !== 'undefined'
    && (document.fullscreenEnabled ?? typeof document.documentElement?.requestFullscreen === 'function');
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
  // 여러 노드 추가 창 (2026-09-28 사용자 보고: Ctrl+Space 가 다른 프로그램에 잡혀 있어
  // 단축키만으로는 열 수 없다 — 메뉴에서도 연다)
  const setMultiAddOpen = useEditorUiStore((state) => state.setMultiAddOpen);
  const [calendar, setCalendar] = useState<{ parentId: string; parentLabel: string; initial: YearMonth } | null>(null);
  useEffect(() => {
    if (!addMenuOpen) return;
    // pointerdown — 캔버스는 손가락의 호환 mousedown 을 막으므로 mousedown 만 들으면 폰에서 안 닫힌다
    const onDown = (e: PointerEvent) => {
      if (!(e.target as Element).closest?.('[data-testid="add-menu"], [data-testid="add-node"]')) setAddMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setAddMenuOpen(false); };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey, true);
    return () => { document.removeEventListener('pointerdown', onDown, true); document.removeEventListener('keydown', onKey, true); };
  }, [addMenuOpen]);
  const handleAddClick = () => {
    if (!selectedId) {
      if (kanban) { setSelectedId(addCenter()); return; }
      handleAddCenter();
      return;
    }
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
    setCalendar({ parentId: selectedId, parentLabel: node.text || tr('editor.toolbar.emptyNode'), initial: parseYearMonth(node.text, ancestors) });
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
      void document.exitFullscreen().catch(() => { /* 무시 */ });
    } else {
      void document.documentElement.requestFullscreen?.()?.catch(() => { /* 지원 안 함 */ });
    }
  };

  // [+] 메뉴 — 데스크톱은 단추 바로 아래 왼쪽 정렬, 폰 폭은 도구 모음 오른쪽 끝에
  // 맞춰 화면 안에 들어오게 (단추 감싸개를 relative 로 두지 않아 도구 모음 기준이 된다)
  const addMenu = addMenuOpen && (
    <div
      data-testid="add-menu"
      style={{
        position: 'absolute', zIndex: 20, minWidth: 190,
        ...(compact
          ? { top: (coarse ? 40 : 28) + 12, right: 0, width: 'min(300px, calc(100vw - 16px))', boxSizing: 'border-box' as const }
          : { top: coarse ? 44 : 32, left: 0 }),
        background: t.surface, border: `1px solid ${t.border}`, borderRadius: 8,
        boxShadow: '0 8px 24px rgba(60,45,15,0.25)', padding: 4,
        display: 'flex', flexDirection: 'column', gap: 2,
      }}
    >
      <MenuItem t={t} wrap={compact} testId="add-menu-child" label={tr('editor.toolbar.addChild')} hint={tr('editor.toolbar.addChildHint')} onClick={() => { setAddMenuOpen(false); handleAddNode(); }} />
      <MenuItem t={t} wrap={compact} testId="add-menu-multi" label={tr('editor.toolbar.addMulti')} hint={tr('editor.toolbar.addMultiHint')} onClick={() => { setAddMenuOpen(false); setMultiAddOpen(true); }} />
      <MenuItem t={t} wrap={compact} testId="add-menu-calendar" label={tr('editor.toolbar.addCalendar')} hint={tr('editor.toolbar.addCalendarHint')} onClick={openCalendar} />
    </div>
  );
  const calendarDlg = calendar && (
    <CalendarNodeDialog
      t={t}
      parentId={calendar.parentId}
      parentLabel={calendar.parentLabel}
      initial={calendar.initial}
      onClose={() => setCalendar(null)}
    />
  );
  const connectIcon = (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1.5" y="2" width="5" height="4" rx="1.2" />
      <rect x="9.5" y="10" width="5" height="4" rx="1.2" />
      <path d="M6.5 4 H8.5 A1.5 1.5 0 0 1 10 5.5 V8 A1.5 1.5 0 0 0 11.5 9.5" />
      <path d="M10.2 8.2 L11.5 9.6 L12.8 8.2" />
    </svg>
  );

  // ── 폰 폭: [+] [휴지통] [맞추기] [더 보기 ⋯] + 펼치는 메뉴 ──────────────
  if (compact) {
    const close = (fn: () => void) => () => { setMoreOpen(false); fn(); };
    const groups: { label: string; items: MoreItem[] }[] = [
      {
        label: tr('editor.toolbar.groupNode'),
        items: [
          {
            key: 'edit', icon: <I.Pencil size={16} />, label: tr('editor.toolbar.m.editText'),
            disabled: !hasSelection || !selectedId || !!kanban,
            onClick: () => {
              setMoreOpen(false);
              if (!selectedId) return;
              primeTouchKeyboard(); // 누른 처리 안에서 — iOS 키보드
              requestEdit(selectedId);
            },
            hidden: !!kanban,
          },
          { key: 'child', icon: <I.Plus size={16} />, label: tr('editor.toolbar.addChild'), disabled: !hasSelection, onClick: close(handleAddNode) },
          { key: 'multi', icon: <span style={{ fontWeight: 700, fontSize: 13 }}>≡+</span>, label: tr('editor.toolbar.addMulti'), disabled: !hasSelection, onClick: close(() => setMultiAddOpen(true)) },
          { key: 'calendar', icon: <span style={{ fontSize: 14 }}>📅</span>, label: tr('editor.toolbar.addCalendar'), disabled: !hasSelection, onClick: () => { setMoreOpen(false); openCalendar(); } },
          {
            key: 'connect', icon: connectIcon, testId: 'connect-node', hidden: !!kanban,
            label: connectMode ? tr('editor.toolbar.m.connectOff') : tr('editor.toolbar.m.connect'),
            highlight: !!connectMode, disabled: !connectMode && !hasSelection, onClick: close(handleConnect),
          },
          {
            key: 'style', icon: <I.Brush size={16} />, testId: 'style-copy', hidden: !!kanban,
            label: stylePainter ? tr('editor.toolbar.m.stylePainterOff') : tr('editor.toolbar.m.stylePainter'),
            highlight: !!stylePainter, disabled: !stylePainter && !hasSelection, onClick: close(handleStyleCopy),
          },
        ],
      },
      ...(kanban ? [] : [{
        label: tr('editor.toolbar.groupCenter'),
        items: [
          {
            key: 'center-add', icon: <I.Center size={16} />, testId: 'center-add',
            label: placingCenter ? tr('editor.toolbar.m.placingCenter') : tr('editor.toolbar.m.addCenter'),
            highlight: placingCenter, onClick: close(handleAddCenter),
          },
          { key: 'promote', icon: <I.ArrowUp size={16} />, testId: 'center-promote', label: tr('editor.toolbar.m.promote'), disabled: !selectedIsLevel1, onClick: close(handlePromote) },
          { key: 'merge', icon: <I.FolderMove size={16} />, testId: 'center-merge', label: tr('editor.toolbar.m.merge'), disabled: !selectedIsCenter || centerCount < 2, onClick: close(handleMerge) },
        ] as MoreItem[],
      }]),
      {
        label: tr('editor.toolbar.groupView'),
        items: [
          { key: 'pan', icon: <I.Hand size={16} />, label: tr('editor.toolbar.m.pan'), highlight: panMode, hidden: !!kanban, onClick: close(togglePanMode) },
          {
            key: 'focus', icon: focusActive ? <I.FocusOff size={16} /> : <I.Focus size={16} />,
            label: kanban ? tr('editor.toolbar.m.scrollToCard') : focusActive ? tr('editor.toolbar.m.focusOff') : tr('editor.toolbar.m.focus'),
            highlight: focusActive, disabled: !focusActive && !hasSelection, onClick: close(() => onFocusSelected?.()),
          },
          {
            key: 'expand', icon: <span style={{ fontSize: 16, fontWeight: 700 }}>+</span>, testId: 'expand-all', hidden: !!kanban,
            label: scope === 'all' ? tr('editor.toolbar.m.expandAll') : tr('editor.toolbar.m.expandSubtree'),
            onClick: close(() => { if (scope === 'all') expandAll(); else expandSubtree(scope); afterFold(scope); }),
          },
          {
            key: 'collapse', icon: <span style={{ fontSize: 16, fontWeight: 700 }}>−</span>, testId: 'collapse-all', hidden: !!kanban,
            label: scope === 'all' ? tr('editor.toolbar.m.collapseAll') : tr('editor.toolbar.m.collapseSubtree'),
            onClick: close(() => { if (scope === 'all') collapseAll(); else collapseSubtree(scope); afterFold(scope); }),
          },
          {
            key: 'fullscreen', icon: isFullscreen ? <I.FullscreenExit size={16} /> : <I.FullscreenEnter size={16} />,
            label: isFullscreen ? tr('editor.toolbar.m.fullscreenExit') : tr('editor.toolbar.m.fullscreen'),
            highlight: isFullscreen, hidden: !fullscreenSupported, onClick: close(handleFullscreen),
          },
        ],
      },
    ];
    return (
      <div
        data-testid="m-canvas-toolbar"
        style={{
          position: 'absolute', top: 8, right: 8, zIndex: 5,
          display: 'flex', alignItems: 'center', gap: 2,
          padding: 3, borderRadius: 10,
          background: t.surface,
          border: `1px solid ${t.border}`,
          boxShadow: t.shadowSm,
        }}
      >
        <span style={{ display: 'inline-flex' }}>
          <ToolbarBtn
            t={t}
            title={hasSelection ? tr('editor.toolbar.addNodeMenu') : tr('editor.toolbar.addCenterNode')}
            highlight={hasSelection || addMenuOpen}
            onClick={() => { setMoreOpen(false); handleAddClick(); }}
            testId="add-node"
          >
            <I.Plus size={17} />
          </ToolbarBtn>
          {addMenu}
        </span>
        {calendarDlg}
        <ToolbarBtn
          t={t}
          title={selectedConnectorId ? tr('editor.toolbar.deleteConnector') : tr('editor.toolbar.deleteNode')}
          danger
          disabled={!hasSelection && !selectedConnectorId}
          onClick={handleDeleteNode}
          testId="delete-node"
        >
          <I.Trash size={16} />
        </ToolbarBtn>
        <ToolbarBtn t={t} title={kanban ? tr('editor.toolbar.boardHome') : tr('editor.toolbar.fit')} onClick={onFitView} testId="m-canvas-fit">
          <I.Fit size={16} />
        </ToolbarBtn>
        <ToolbarBtn
          t={t}
          title={tr('editor.toolbar.m.more')}
          highlight={moreOpen || !!connectMode || !!stylePainter || placingCenter || panMode}
          onClick={() => { setAddMenuOpen(false); setMoreOpen((v) => !v); }}
          testId="m-canvas-more"
          ariaExpanded={moreOpen}
        >
          <I.MoreH size={17} />
        </ToolbarBtn>
        {moreOpen && (
          <div
            data-testid="m-canvas-more-panel"
            role="menu"
            style={{
              position: 'absolute', top: (coarse ? 40 : 28) + 12, right: 0, zIndex: 20,
              width: 'min(320px, calc(100vw - 16px))', boxSizing: 'border-box',
              maxHeight: 'calc(100dvh - 180px)', overflowY: 'auto', overscrollBehavior: 'contain',
              background: t.surface, border: `1px solid ${t.border}`, borderRadius: 12,
              boxShadow: '0 10px 30px rgba(60,45,15,0.28)', padding: '6px 6px 8px',
            }}
          >
            {groups.map((g) => {
              const items = g.items.filter((it) => !it.hidden);
              if (!items.length) return null;
              return (
                <div key={g.label} style={{ marginBottom: 4 }}>
                  <div style={{ padding: '6px 6px 4px' }}><GroupLabel t={t}>{g.label}</GroupLabel></div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                    {items.map((it) => <MoreBtn key={it.key} t={t} item={it} />)}
                  </div>
                </div>
              );
            })}
            {!kanban && (
              <div style={{ fontSize: 11, color: t.textMuted, lineHeight: 1.45, padding: '6px 6px 0', borderTop: `1px solid ${t.divider}`, marginTop: 4 }}>
                {tr('editor.toolbar.m.touchHint')}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{
      position: 'absolute', top: 14, right: 14, zIndex: 5,
      display: 'flex', alignItems: 'center', gap: 4,
      // 좁은 창(태블릿 세로 등)에서는 왼쪽으로 넘치지 않고 줄을 바꾼다
      flexWrap: 'wrap', justifyContent: 'flex-end', maxWidth: 'calc(100% - 28px)',
      padding: 4, borderRadius: 8,
      background: t.surface,
      border: `1px solid ${t.border}`,
      boxShadow: t.shadowSm,
    }}>
      <GroupLabel t={t}>{tr('editor.toolbar.groupNode')}</GroupLabel>
      <span style={{ position: 'relative', display: 'inline-flex' }}>
        <ToolbarBtn
          t={t}
          title={hasSelection
            ? tr('editor.toolbar.addNodeMenu')
            : tr('editor.toolbar.addCenterNode')}
          highlight={hasSelection || addMenuOpen}
          onClick={handleAddClick}
          testId="add-node"
        >
          <I.Plus size={15} />
        </ToolbarBtn>
        {addMenu}
      </span>
      {calendarDlg}
      
      {!kanban && (
      <ToolbarBtn
        t={t}
        title={connectMode
          ? tr('editor.toolbar.connectOff')
          : tr('editor.toolbar.connect')}
        highlight={!!connectMode}
        disabled={!connectMode && !hasSelection}
        onClick={handleConnect}
        testId="connect-node"
      >
        {connectIcon}
      </ToolbarBtn>
      )}
      <ToolbarBtn
       t={t}
       title={selectedConnectorId ? tr('editor.toolbar.deleteConnector') : tr('editor.toolbar.deleteNode')}
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
          ? tr('editor.toolbar.stylePainterOff')
          : tr('editor.toolbar.stylePainter')}
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
          <GroupLabel t={t}>{tr('editor.toolbar.groupCenter')}</GroupLabel>
          <ToolbarBtn
            t={t}
            title={placingCenter
              ? tr('editor.toolbar.placingCenter')
              : tr('editor.toolbar.addCenter')}
            highlight={placingCenter}
            onClick={handleAddCenter}
            testId="center-add"
          >
            <I.Center size={15} />
          </ToolbarBtn>
          <ToolbarBtn
            t={t}
            title={tr('editor.toolbar.promote')}
            disabled={!selectedIsLevel1}
            onClick={handlePromote}
            testId="center-promote"
          >
            <I.ArrowUp size={15} />
          </ToolbarBtn>
          <ToolbarBtn
            t={t}
            title={tr('editor.toolbar.merge')}
            disabled={!selectedIsCenter || centerCount < 2}
            onClick={handleMerge}
            testId="center-merge"
          >
            <I.FolderMove size={15} />
          </ToolbarBtn>
        </>
      )}

      <div style={{ width: 1, background: t.divider, margin: '4px 4px', alignSelf: 'stretch' }} />

      <GroupLabel t={t}>{tr('editor.toolbar.groupView')}</GroupLabel>
      {!kanban && (
        <ToolbarBtn
          t={t}
          title={tr('editor.toolbar.pan')}
          highlight={panMode}
          onClick={togglePanMode}
        >
          <I.Hand size={15} />
        </ToolbarBtn>
      )}
      <ToolbarBtn
        t={t}
        title={kanban
          ? tr('editor.toolbar.scrollToCard')
          : focusActive ? tr('editor.toolbar.focusOff') : tr('editor.toolbar.focus')}
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
              ? tr('editor.fold.expandAll')
              : tr('editor.fold.expandSubtree')}
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
              ? tr('editor.fold.collapseAll')
              : tr('editor.fold.collapseSubtree')}
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
        title={kanban ? tr('editor.toolbar.boardHome') : tr('editor.toolbar.fit')}
        onClick={onFitView}
      >
        <I.Fit size={15} />
      </ToolbarBtn>
      {fullscreenSupported && (
        <ToolbarBtn
          t={t}
          title={isFullscreen ? tr('editor.toolbar.fullscreenExit') : tr('editor.toolbar.fullscreen')}
          highlight={isFullscreen}
          onClick={handleFullscreen}
        >
          {isFullscreen ? <I.FullscreenExit size={16} /> : <I.FullscreenEnter size={16} />}
        </ToolbarBtn>
      )}
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
  ariaExpanded?: boolean;
}

function ToolbarBtn({ t, title, children, highlight, danger, disabled, onClick, testId, ariaExpanded }: ToolbarBtnProps) {
  const [h, setH] = useState(false);
  // 손가락 — 누를 자리 40px (마우스는 예전 28px)
  const coarse = useCoarse();
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
      aria-label={title}
      aria-expanded={ariaExpanded}
      disabled={disabled}
      onClick={onClick}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        width: coarse ? 40 : 28, height: coarse ? 40 : 28, borderRadius: coarse ? 8 : 5,
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

function MenuItem({ t, label, hint, onClick, testId, wrap }: { t: ThemeTokens; label: string; hint: string; onClick: () => void; testId: string; wrap?: boolean }) {
  const [h, setH] = useState(false);
  const coarse = useCoarse();
  return (
    <button
      data-testid={testId}
      onClick={onClick}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        textAlign: 'left', border: 'none', borderRadius: 6, cursor: 'pointer',
        padding: coarse ? '9px 12px' : '6px 10px', background: h ? t.surfaceAlt : 'transparent', color: t.text,
        display: 'flex', flexDirection: 'column', gap: 1,
        minHeight: coarse ? 44 : undefined, justifyContent: 'center',
      }}
    >
      {/* 폰 폭(wrap)은 화면 안에서 줄을 바꾼다 */}
      <span style={{ fontSize: coarse ? 13.5 : 12.5, fontWeight: 600, whiteSpace: wrap ? 'normal' : 'nowrap' }}>{label}</span>
      <span style={{ fontSize: coarse ? 11.5 : 10.5, color: t.textMuted, whiteSpace: wrap ? 'normal' : 'nowrap' }}>{hint}</span>
    </button>
  );
}

interface MoreItem {
  key: string;
  icon: ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  highlight?: boolean;
  hidden?: boolean;
  testId?: string;
}

/** 폰 폭 [더 보기] 메뉴의 한 칸 — 아이콘 + 짧은 이름, 높이 44px (모바일 웹, 2026-10-05) */
function MoreBtn({ t, item }: { t: ThemeTokens; item: MoreItem }) {
  const { disabled, highlight } = item;
  return (
    <button
      type="button"
      role="menuitem"
      data-testid={item.testId ? `m-more-${item.testId}` : `m-more-${item.key}`}
      disabled={disabled}
      onClick={item.onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 8, minHeight: 44,
        padding: '6px 8px', borderRadius: 8, textAlign: 'left',
        border: `1px solid ${highlight ? t.primary : 'transparent'}`,
        background: highlight ? t.primarySoft : t.surfaceAlt,
        color: disabled ? t.textSubtle : highlight ? t.primary : t.text,
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? 'default' : 'pointer',
        fontSize: 12.5, fontWeight: 600, lineHeight: 1.25,
        minWidth: 0, overflowWrap: 'anywhere',
      }}
    >
      <span style={{ width: 20, display: 'inline-flex', justifyContent: 'center', flexShrink: 0 }}>{item.icon}</span>
      <span style={{ minWidth: 0 }}>{item.label}</span>
    </button>
  );
}
