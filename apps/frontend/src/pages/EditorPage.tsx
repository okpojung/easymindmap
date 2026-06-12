// File: src/pages/EditorPage.tsx
// Version: MVP-Layout-Kanban-Fix-v1

import { useEffect } from 'react';
import { THEMES } from '@/components/design-tokens/theme';
import { TopToolbar } from '@/components/top-toolbar/TopToolbar';
import { UnifiedSidebar } from '@/components/unified-sidebar/UnifiedSidebar';
import { BottomStatusBar } from '@/components/bottom-status-bar/BottomStatusBar';
import { Canvas } from '@/editor/canvas/Canvas';
import { KanbanBoard } from '@/editor/canvas/KanbanBoard';
import { DesignTweaksPanel } from '@/editor/dialogs/DesignTweaksPanel';
import { SAMPLE_COLLABS, SAMPLE_OUTLINE } from '@/editor/__samples__';
import type {
  KanbanBoardData,
  SampleMap,
} from '@/editor/__samples__/types';
import {
  useDocumentStore,
  useEditorUiStore,
  useViewportStore,
  useInteractionStore,
  useAutosaveStore,
} from '@/stores';

function buildKanbanFromMap(map: SampleMap): KanbanBoardData {
  const colors = ['#d97706', '#0284c7', '#16a34a', '#9333ea', '#dc2626'];

  return {
    title: map.root.text,
    columns: map.branches.map((branch, index) => ({
      id: branch.id,
      title: branch.text,
      count: branch.children?.length ?? 0,
      color: colors[index % colors.length],
      cards: (branch.children ?? []).map((child) => ({
        id: child.id,
        title: child.text,
        tag: child.tag ?? child.tags?.[0] ?? '#MVP',
      })),
    })),
  };
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
  const tweaksOpen = useEditorUiStore((s) => s.tweaksOpen);
  const setTweaksOpen = useEditorUiStore((s) => s.setTweaksOpen);
  const sampleTopic = useEditorUiStore((s) => s.sampleTopic);
  const setSampleTopic = useEditorUiStore((s) => s.setSampleTopic);

  const zoom = useViewportStore((s) => s.zoom);
  const setZoom = useViewportStore((s) => s.setZoom);
  const requestFit = useViewportStore((s) => s.requestFit);

  const selectedId = useInteractionStore((s) => s.selectedId);
  const setSelectedId = useInteractionStore((s) => s.setSelectedId);

  const saveState = useAutosaveStore((s) => s.saveState);

  const kanbanFromMap = buildKanbanFromMap(map);

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
          outline={SAMPLE_OUTLINE}
          collabs={SAMPLE_COLLABS}
          navTab={navTab}
          onNavTabChange={setNavTab}
          inspectorTab={inspectorTab}
          onInspectorTabChange={setInspectorTab}
          activeSection={activeSection}
          onActiveSectionChange={setActiveSection}
          collapsed={sidebarCollapsed}
          onToggleCollapsed={toggleSidebar}
        />

        {layoutType === 'kanban' ? (
          <KanbanBoard
            t={t}
            kanban={kanbanFromMap}
            selectedId={selectedId}
            onSelect={setSelectedId}
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

      <BottomStatusBar
        t={t}
        layoutType={layoutType}
        collabs={SAMPLE_COLLABS}
        zoom={zoom}
        onZoomChange={setZoom}
        onFitView={requestFit}
      />

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