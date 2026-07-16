// File: src/pages/EditorPage.tsx
// Version: MVP-Layout-Kanban-Fix-v1

import { useEffect, useMemo } from 'react';
import { THEMES } from '@/components/design-tokens/theme';
import { TopToolbar } from '@/components/top-toolbar/TopToolbar';
import { UnifiedSidebar } from '@/components/unified-sidebar/UnifiedSidebar';
import { BottomStatusBar } from '@/components/bottom-status-bar/BottomStatusBar';
import { Canvas } from '@/editor/canvas/Canvas';
import { OutlineEditorPane } from '@/editor/outline/OutlineEditorPane';
import { KanbanBoard } from '@/editor/canvas/KanbanBoard';
import { DesignTweaksPanel } from '@/editor/dialogs/DesignTweaksPanel';
import { MultiAddDialog } from '@/editor/dialogs/MultiAddDialog';
import { SAMPLE_COLLABS } from '@/editor/__samples__';
import type {
  KanbanBoardData,
  KanbanCard,
  SampleMap,
  MindNode,
  OutlineNode,
} from '@/editor/__samples__/types';
import {
  useDocumentStore,
  useEditorUiStore,
  useViewportStore,
  useInteractionStore,
  useAutosaveStore,
} from '@/stores';

// Maps the live document tree onto the Kanban board WITHOUT a depth limit:
// depth-1 nodes become columns, depth-2 nodes become cards, and depth-3+
// descendants are carried along recursively — KanbanBoard renders them as an
// indented tree-right outline under their card inside the column.
function buildKanbanCard(node: {
  id: string;
  text: string;
  tag?: string;
  tags?: string[];
  image?: KanbanCard['image'];
  children?: any[];
}): KanbanCard {
  return {
    id: node.id,
    title: node.text,
    tag: node.tag ?? node.tags?.[0],
    image: node.image,
    children: (node.children ?? []).map(buildKanbanCard),
  };
}

function buildKanbanFromMap(map: SampleMap): KanbanBoardData {
  const colors = ['#d97706', '#0284c7', '#16a34a', '#9333ea', '#dc2626'];

  return {
    title: map.root.text,
    columns: map.branches.map((branch, index) => ({
      id: branch.id,
      title: branch.text,
      count: branch.children?.length ?? 0,
      color: colors[index % colors.length],
      cards: (branch.children ?? []).map(buildKanbanCard),
    })),
  };
}

// 아웃라인/맵 분할 스플리터 — 드래그로 두 화면의 비율을 조절한다.
function OutlineSplitHandle({ t, ratio, onRatioChange }: {
  t: { primary: string };
  ratio: number;
  onRatioChange: (v: number) => void;
}) {
  return (
    <div
      title="드래그: 아웃라인/맵 영역 조절"
      onPointerDown={(e) => {
        const parent = (e.currentTarget as HTMLElement).parentElement!;
        const rect = parent.getBoundingClientRect();
        const el = e.currentTarget as HTMLElement;
        el.setPointerCapture(e.pointerId);
        const move = (ev: PointerEvent) => {
          onRatioChange((ev.clientX - rect.left) / Math.max(1, rect.width));
        };
        const up = () => {
          el.removeEventListener('pointermove', move as any);
          el.removeEventListener('pointerup', up as any);
        };
        el.addEventListener('pointermove', move as any);
        el.addEventListener('pointerup', up as any);
        e.preventDefault();
      }}
      style={{
        width: 6, flexShrink: 0, cursor: 'col-resize', zIndex: 5,
        background: 'transparent',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.background = `${t.primary}22`;
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.background = 'transparent';
      }}
    />
  );
}

export function EditorPage() {
  const map = useDocumentStore((s) => s.map);
  const setSample = useDocumentStore((s) => s.setSample);

  const themeName = useEditorUiStore((s) => s.themeName);
  const setThemeName = useEditorUiStore((s) => s.setThemeName);
  const layoutType = useEditorUiStore((s) => s.layoutType);
  const setLayoutType = useEditorUiStore((s) => s.setLayoutType);
  const navTab = useEditorUiStore((s) => s.navTab);
  const setNavTab = useEditorUiStore((s) => s.setNavTab);
  const inspectorTab = useEditorUiStore((s) => s.inspectorTab);
  const setInspectorTab = useEditorUiStore((s) => s.setInspectorTab);
  const activeSection = useEditorUiStore((s) => s.activeSection);
  const setActiveSection = useEditorUiStore((s) => s.setActiveSection);
  const sidebarCollapsed = useEditorUiStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useEditorUiStore((s) => s.toggleSidebar);
  const outlineSplit = useEditorUiStore((s) => s.outlineSplit);
  const toggleOutlineSplit = useEditorUiStore((s) => s.toggleOutlineSplit);
  const outlineSplitRatio = useEditorUiStore((s) => s.outlineSplitRatio);
  const setOutlineSplitRatio = useEditorUiStore((s) => s.setOutlineSplitRatio);
  const tweaksOpen = useEditorUiStore((s) => s.tweaksOpen);
  const setTweaksOpen = useEditorUiStore((s) => s.setTweaksOpen);
  const sampleTopic = useEditorUiStore((s) => s.sampleTopic);
  const setSampleTopic = useEditorUiStore((s) => s.setSampleTopic);

  const zoom = useViewportStore((s) => s.zoom);
  const setZoom = useViewportStore((s) => s.setZoom);

  const selectedId = useInteractionStore((s) => s.selectedId);
  const setSelectedId = useInteractionStore((s) => s.setSelectedId);

  const saveState = useAutosaveStore((s) => s.saveState);

  const kanbanFromMap = buildKanbanFromMap(map);

  // 아웃라인 패널용 트리 — 실제 편집 중인 맵을 그대로 반영 (텍스트·구조·
  // 접힘 상태·선택 표시). 노드를 클릭하면 캔버스 선택과 연동된다.
  const outline = useMemo<OutlineNode[]>(() => {
    const walk = (n: MindNode, depth: number): OutlineNode => ({
      id: n.id,
      text: n.text,
      depth,
      expanded: !n.collapsed,
      selected: n.id === selectedId,
      children: (n.children ?? []).map((c) => walk(c, depth + 1)),
    });
    return [
      {
        id: 'root',
        text: map.root.text,
        depth: 0,
        expanded: true,
        selected: selectedId === 'root',
        children: map.branches.map((b) => walk(b, 1)),
      },
    ];
  }, [map, selectedId]);

  const t = THEMES[themeName];

  useEffect(() => {
    setSample(sampleTopic);
  }, [sampleTopic, setSample]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 't' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const target = e.target as HTMLElement | null;

        if (
          target &&
          (target.tagName === 'INPUT' ||
            target.tagName === 'TEXTAREA' ||
            target.isContentEditable)
        ) {
          return;
        }

        setTweaksOpen(!tweaksOpen);
      }
    };

    window.addEventListener('keydown', onKey);

    return () => window.removeEventListener('keydown', onKey);
  }, [tweaksOpen, setTweaksOpen]);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: t.bg,
        color: t.text,
        display: 'flex',
        flexDirection: 'column',
        fontFamily:
          "'Pretendard Variable','Pretendard','Inter',-apple-system,BlinkMacSystemFont,system-ui,sans-serif",
      }}
    >
      <TopToolbar
        t={t}
        collabs={SAMPLE_COLLABS}
        mapTitle={map.title}
        saveState={saveState}
      />

      <div
        style={{
          flex: 1,
          display: 'flex',
          minHeight: 0,
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        <UnifiedSidebar
          t={t}
          collabs={SAMPLE_COLLABS}
          outlineSplit={outlineSplit}
          onToggleOutlineSplit={toggleOutlineSplit}
          navTab={navTab}
          onNavTabChange={setNavTab}
          inspectorTab={inspectorTab}
          onInspectorTabChange={setInspectorTab}
          activeSection={activeSection}
          onActiveSectionChange={setActiveSection}
          collapsed={sidebarCollapsed}
          onToggleCollapsed={toggleSidebar}
        />

        {/* 아웃라인 분할 보기: 왼쪽 = 아웃라인 편집, 오른쪽 = 맵/칸반.
            가운데 세로 스플리터로 비율(20~75%) 조절 — 칸반 모드에서도 동작 */}
        {(
          <div style={{ flex: 1, display: 'flex', minWidth: 0, position: 'relative' }}>
            {outlineSplit && (
              <>
                <div style={{
                  width: `${outlineSplitRatio * 100}%`,
                  minWidth: 240, flexShrink: 0,
                  borderRight: `1px solid ${t.border}`,
                  overflow: 'hidden', display: 'flex',
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <OutlineEditorPane t={t} outline={outline} />
                  </div>
                </div>
                <OutlineSplitHandle
                  t={t}
                  ratio={outlineSplitRatio}
                  onRatioChange={setOutlineSplitRatio}
                />
              </>
            )}
            {layoutType === 'kanban' ? (
              <KanbanBoard
                t={t}
                kanban={kanbanFromMap}
                selectedId={selectedId}
                onSelect={(id) => {
                  setSelectedId(id);
                  if (id) setActiveSection('inspector');
                }}
              />
            ) : (
              <Canvas
                t={t}
                sample={map}
                layoutType={layoutType}
                selectedId={selectedId}
                onSelect={(id) => {
                  setSelectedId(id);

                  if (id) {
                    setActiveSection('inspector');
                  }
                }}
                collabs={SAMPLE_COLLABS}
              />
            )}
          </div>
        )}
      </div>

      <BottomStatusBar
        t={t}
        layoutType={layoutType}
        collabs={SAMPLE_COLLABS}
        zoom={zoom}
        onZoomChange={setZoom}
      />

      {/* Hide canvas-only overlays (collapse toggles, +indicators) when printing
          or exporting to image. */}
      <style>{`@media print { .mm-overlay-controls { display: none !important; } }`}</style>

      <MultiAddDialog t={t} />

      {tweaksOpen && (
        <DesignTweaksPanel
          t={t}
          themeName={themeName}
          setThemeName={setThemeName}
          layoutType={layoutType}
          setLayoutType={setLayoutType}
          inspectorTab={inspectorTab}
          setInspectorTab={setInspectorTab}
          sampleTopic={sampleTopic}
          setSampleTopic={setSampleTopic}
          onClose={() => setTweaksOpen(false)}
        />
      )}
    </div>
  );
}