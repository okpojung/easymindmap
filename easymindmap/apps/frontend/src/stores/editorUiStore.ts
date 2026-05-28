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

  setThemeName: (v: ThemeName) => void;
  setLayoutType: (v: LayoutType) => void;
  setNavTab: (v: NavTabKey) => void;
  setInspectorTab: (v: InspectorTabKey) => void;
  setActiveSection: (v: SidebarSection) => void;
  toggleSidebar: () => void;
  setTweaksOpen: (v: boolean) => void;
  setSampleTopic: (v: 'roadmap' | 'meta') => void;
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

  setThemeName: (themeName) => set({ themeName }),
  setLayoutType: (layoutType) => set({ layoutType }),
  setNavTab: (navTab) => set({ navTab, activeSection: 'nav' }),
  setInspectorTab: (inspectorTab) =>
    set({ inspectorTab, activeSection: 'inspector', sidebarCollapsed: false }),
  setActiveSection: (activeSection) => set({ activeSection }),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setTweaksOpen: (tweaksOpen) => set({ tweaksOpen }),
  setSampleTopic: (sampleTopic) => set({ sampleTopic }),
}));
