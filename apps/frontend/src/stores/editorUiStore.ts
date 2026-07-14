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
  // Tags hidden from the canvas when showTags is on (per-tag filter).
  hiddenTags: string[];

  // Multi-node add dialog (Ctrl+Space)
  multiAddOpen: boolean;

  // 간격·정렬 (08-layout.md §6.8 layout_config의 MVP 구현):
  // 레이아웃 계산 결과에 루트 기준 축별 배율로 적용되는 간격 조정값.
  // 1 = 기본, 0.9~2.0 허용. 노드 크기는 유지되고 노드 사이 거리만 변한다.
  // (하한 0.9: 그 아래로 줄이면 촘촘한 레이아웃에서 노드 겹침이 생김 — 측정 기준)
  spacingX: number;
  spacingY: number;

  // 사이드바 콘텐츠 패널 폭(px) — 사이드바와 맵 사이 세로 스플리터로 조절
  sidebarWidth: number;

  setThemeName: (v: ThemeName) => void;
  setLayoutType: (v: LayoutType) => void;
  setNavTab: (v: NavTabKey) => void;
  setInspectorTab: (v: InspectorTabKey) => void;
  setActiveSection: (v: SidebarSection) => void;
  toggleSidebar: () => void;
  setTweaksOpen: (v: boolean) => void;
  setSampleTopic: (v: 'roadmap' | 'meta') => void;
  setShowTags: (v: boolean) => void;
  toggleTagHidden: (tag: string) => void;
  setMultiAddOpen: (v: boolean) => void;
  setSpacingX: (v: number) => void;
  setSpacingY: (v: number) => void;
  resetSpacing: () => void;
  setSidebarWidth: (v: number) => void;
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
  hiddenTags: [],
  multiAddOpen: false,
  spacingX: 1,
  spacingY: 1,
  sidebarWidth: 300,

  setThemeName: (themeName) => set({ themeName }),
  setLayoutType: (layoutType) => set({ layoutType }),
  setNavTab: (navTab) => set({ navTab, activeSection: 'nav' }),
  setInspectorTab: (inspectorTab) =>
    set({ inspectorTab, activeSection: 'inspector', sidebarCollapsed: false }),
  setActiveSection: (activeSection) => set({ activeSection }),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setTweaksOpen: (tweaksOpen) => set({ tweaksOpen }),
  setSpacingX: (spacingX) => set({ spacingX: Math.min(2, Math.max(0.9, spacingX)) }),
  setSpacingY: (spacingY) => set({ spacingY: Math.min(2, Math.max(0.9, spacingY)) }),
  resetSpacing: () => set({ spacingX: 1, spacingY: 1 }),
  // 폭 220~640px 허용 — 아웃라인을 넓게 놓고 편집할 수 있게
  setSidebarWidth: (v) => set({ sidebarWidth: Math.min(640, Math.max(220, Math.round(v))) }),
  setSampleTopic: (sampleTopic) => set({ sampleTopic }),
  setShowTags: (showTags) => set({ showTags }),
  toggleTagHidden: (tag) =>
    set((s) => ({
      hiddenTags: s.hiddenTags.includes(tag)
        ? s.hiddenTags.filter((x) => x !== tag)
        : [...s.hiddenTags, tag],
    })),
  setMultiAddOpen: (multiAddOpen) => set({ multiAddOpen }),
}));
