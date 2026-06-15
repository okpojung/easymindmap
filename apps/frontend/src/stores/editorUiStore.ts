// Editor UI Store — panels, dialogs, active tool, sidebar collapsed flag.
// Spec: docs/03-editor-core/state-architecture.md § 5.1

import { create } from 'zustand';
import type { ThemeName } from '@/components/design-tokens/theme';
import type { LayoutType } from '@/editor/__samples__/types';
import type { NavTabKey, InspectorTabKey, SidebarSection } from '@/components/unified-sidebar/UnifiedSidebar';

interface EditorUiState {
  themeName: ThemeName;
  layoutType: LayoutType;
  navTab: NavTabKey;
  inspectorTab: InspectorTabKey;
  activeSection: SidebarSection;
  sidebarCollapsed: boolean;
  tweaksOpen: boolean;
  sampleTopic: 'roadmap' | 'meta';

  // Display toggles (NODE-15 style)
  showTags: boolean;
  showCollapseIcons: boolean;

  // Multi-node add dialog (Ctrl+Space)
  multiAddOpen: boolean;

  setThemeName: (v: ThemeName) => void;
  setLayoutType: (v: LayoutType) => void;
  setNavTab: (v: NavTabKey) => void;
  setInspectorTab: (v: InspectorTabKey) => void;
  setActiveSection: (v: SidebarSection) => void;
  toggleSidebar: () => void;
  setTweaksOpen: (v: boolean) => void;
  setSampleTopic: (v: 'roadmap' | 'meta') => void;
  setShowTags: (v: boolean) => void;
  setShowCollapseIcons: (v: boolean) => void;
  setMultiAddOpen: (v: boolean) => void;
}

export const useEditorUiStore = create<EditorUiState>((set) => ({
  themeName: 'light',
  layoutType: 'radial-bidirectional',
  navTab: 'outline',
  inspectorTab: 'style',
  activeSection: 'inspector',
  sidebarCollapsed: false,
  tweaksOpen: false,
  sampleTopic: 'roadmap',
  showTags: true,
  showCollapseIcons: true,
  multiAddOpen: false,

  setThemeName: (themeName) => set({ themeName }),
  setLayoutType: (layoutType) => set({ layoutType }),
  setNavTab: (navTab) => set({ navTab, activeSection: 'nav' }),
  setInspectorTab: (inspectorTab) =>
    set({ inspectorTab, activeSection: 'inspector', sidebarCollapsed: false }),
  setActiveSection: (activeSection) => set({ activeSection }),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setTweaksOpen: (tweaksOpen) => set({ tweaksOpen }),
  setSampleTopic: (sampleTopic) => set({ sampleTopic }),
  setShowTags: (showTags) => set({ showTags }),
  setShowCollapseIcons: (showCollapseIcons) => set({ showCollapseIcons }),
  setMultiAddOpen: (multiAddOpen) => set({ multiAddOpen }),
}));
