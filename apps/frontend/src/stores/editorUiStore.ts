// Editor UI Store — panels, dialogs, active tool, sidebar collapsed flag.
// Spec: docs/03-editor-core/state-architecture.md § 5.1

import { create } from 'zustand';
import type { ThemeName } from '@/components/design-tokens/theme';
import type { LayoutType } from '@/editor/__samples__/types';
import type { NavTabKey, InspectorTabKey, SidebarSection } from '@/components/unified-sidebar/UnifiedSidebar';
import { useInteractionStore } from './interactionStore';

// 아웃라인을 여는 순간 처음 보여줄 노드를 캡처한다 (2026-07 사용성):
//   · 선택한 노드가 있으면 그 노드
//   · 없으면 맵 화면 중앙에서 가장 가까운 노드 (DOM 실측 — 전체
//     아웃라인 모드로 바뀌면 맵 DOM이 사라지므로 "토글 시점"에 잰다)
// 아웃라인 페인이 마운트될 때 이 행으로 스크롤해, 큰 맵을 확대해 보던
// 위치가 아웃라인에서도 이어진다.
function captureOutlineFocus(): string | null {
  const sel = useInteractionStore.getState().selectedId;
  if (sel) return sel;
  const rootG = document.querySelector('svg g[data-node-id="root"]');
  const svg = rootG ? rootG.closest('svg') : null;
  if (!svg) return null;
  const r = svg.getBoundingClientRect();
  const cx = r.x + r.width / 2;
  const cy = r.y + r.height / 2;
  let best: string | null = null;
  let bestD = Infinity;
  svg.querySelectorAll('g[data-node-id]').forEach((g) => {
    const b = g.getBoundingClientRect();
    const dx = b.x + b.width / 2 - cx;
    const dy = b.y + b.height / 2 - cy;
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = g.getAttribute('data-node-id');
    }
  });
  return best;
}

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

  // 아웃라인 분할 화면 — 켜면 메인 편집 영역이 좌(아웃라인 편집)/우(맵)로
  // 나뉜다. ratio = 아웃라인 영역 비율 (0.2~0.75)
  outlineSplit: boolean;
  outlineSplitRatio: number;
  // 메인 편집 영역 전체 모드 — 'map'(맵 전체) / 'outline'(아웃라인 전체).
  // 분할 화면(outlineSplit)과 별개: 분할이 켜져 있으면 이 토글은 비활성.
  mainView: 'map' | 'outline';
  // 아웃라인을 열 때 처음 보여줄 노드 id — 열기 액션이 captureOutlineFocus로
  // 채우고, 아웃라인 페인이 마운트 시 그 행으로 스크롤한다 (1회성)
  outlineFocusId: string | null;

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
  toggleOutlineSplit: () => void;
  setOutlineSplit: (v: boolean) => void;
  setOutlineSplitRatio: (v: number) => void;
  setMainView: (v: 'map' | 'outline') => void;
  toggleMainView: () => void;
}

// 다크 모드 지속 — 브라우저별 저장 (서버 연결 후 users.ui_preferences로 이관)
const THEME_KEY = 'easymindmap.theme';
function initialTheme(): ThemeName {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export const useEditorUiStore = create<EditorUiState>((set) => ({
  themeName: initialTheme(),
  layoutType: 'radial-bidirectional',
  navTab: 'newMap',
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
  outlineSplit: false,
  outlineSplitRatio: 0.42,
  mainView: 'map',
  outlineFocusId: null,

  setThemeName: (themeName) => {
    try { localStorage.setItem(THEME_KEY, themeName); } catch { /* 저장 실패 무시 */ }
    set({ themeName });
  },
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
  toggleOutlineSplit: () => set((s) => ({
    outlineSplit: !s.outlineSplit,
    // 여는 순간(맵 DOM이 아직 있을 때) 시작 위치 캡처
    outlineFocusId: !s.outlineSplit ? captureOutlineFocus() : s.outlineFocusId,
  })),
  setOutlineSplit: (outlineSplit) => set((s) => ({
    outlineSplit,
    outlineFocusId: outlineSplit && !s.outlineSplit
      ? captureOutlineFocus() : s.outlineFocusId,
  })),
  setOutlineSplitRatio: (v) =>
    set({ outlineSplitRatio: Math.min(0.75, Math.max(0.2, v)) }),
  setMainView: (mainView) => set((s) => ({
    mainView,
    outlineFocusId: mainView === 'outline' && s.mainView !== 'outline'
      ? captureOutlineFocus() : s.outlineFocusId,
  })),
  toggleMainView: () => set((s) => ({
    mainView: s.mainView === 'map' ? 'outline' : 'map',
    outlineFocusId: s.mainView === 'map' ? captureOutlineFocus() : s.outlineFocusId,
  })),
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
