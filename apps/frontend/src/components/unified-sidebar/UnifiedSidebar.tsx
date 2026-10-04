// UnifiedSidebar — left-docked panel that combines:
//   - Navigation group ("탐색"):  Outline / Search / Templates / History
//   - Inspector  group ("속성"):   Style / Layout / Content / Note·Tag / AI
// Layout: 44px icon rail + 300px content panel = 344px total. Collapses to rail-only.
//
// Spec: docs/03-editor-core/canvas/10-canvas.md § 21 (unified left sidebar).

import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { ThemeTokens } from '@/components/design-tokens/theme';
import type { Collaborator } from '@/editor/__samples__/types';
import { I } from '@/components/icons';
import { useInteractionStore } from '@/stores/interactionStore';
import { useEditorUiStore } from '@/stores/editorUiStore';
import { authEnabled, useAuthStore } from '@/stores/authStore';
import {
  useDocumentStore,
  findNodeInMap,
  findParentId,
  getNodeDepth,
} from '@/stores/documentStore';

import { SearchPanel }  from '@/components/left-sidebar/SearchPanel';
import { TemplatePanel } from '@/components/left-sidebar/TemplatePanel';
import { HistoryPanel }  from '@/components/left-sidebar/HistoryPanel';
import { MapSettingsPanel } from '@/components/left-sidebar/MapSettingsPanel';
import { NewMapPanel } from '@/components/left-sidebar/NewMapPanel';

import { StyleTab }   from '@/editor/inspector-panels/StyleTab';
import { LayoutTab }  from '@/editor/inspector-panels/LayoutTab';
import { IconTab }    from '@/editor/inspector-panels/IconTab';
import { ContentTab } from '@/editor/inspector-panels/ContentTab';
import { NoteTagTab } from '@/editor/inspector-panels/NoteTagTab';
import { AITab }      from '@/editor/inspector-panels/AITab';
import { flattenNodeText } from '@/editor/node-renderer/RichTextHtml';
// 유료 화면 모듈 — vite 별칭. 유료 UI 가 없으면 코어의 스텁으로 간다
// (docs/04-extensions/open-core-boundary.md §5).
import { ProFeaturePanel } from '@pro';
import { useTr } from '@/i18n';
import { useCoarse, usePhoneLayout } from '@/hooks/useViewport';

export type NavTabKey       = 'newMap' | 'search' | 'template' | 'history' | 'mapSettings' | 'collab';
export type InspectorTabKey = 'style' | 'layout' | 'icon' | 'content' | 'note' | 'ai';
export type SidebarSection  = 'nav' | 'inspector';

interface Props {
  t: ThemeTokens;
  collabs: Collaborator[];
  navTab: NavTabKey;
  onNavTabChange: (v: NavTabKey) => void;
  inspectorTab: InspectorTabKey;
  onInspectorTabChange: (v: InspectorTabKey) => void;
  activeSection: SidebarSection;
  onActiveSectionChange: (v: SidebarSection) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  outlineSplit: boolean;
  onToggleOutlineSplit: () => void;
}

export function UnifiedSidebar({
  t, collabs,
  navTab, onNavTabChange,
  inspectorTab, onInspectorTabChange,
  activeSection, onActiveSectionChange,
  collapsed, onToggleCollapsed,
  outlineSplit, onToggleOutlineSplit,
}: Props) {
  const tr = useTr();
  // **폰에서는 겹쳐 뜨는 서랍** (모바일 웹 2026-10-05). 데스크톱처럼 레일(44px)과
  // 패널(300px)을 캔버스 옆에 붙이면 390px 화면에서 캔버스가 거의 사라진다.
  // 폰에서는 접혀 있으면 아무것도 그리지 않고(하단 막대의 ☰ 가 연다), 열리면
  // 레일+패널이 캔버스 **위에** 미끄러져 나온다 — 캔버스 크기는 그대로다.
  const phone = usePhoneLayout();
  const coarse = useCoarse();
  const mainView = useEditorUiStore((s) => s.mainView);
  const toggleMainView = useEditorUiStore((s) => s.toggleMainView);
  // 폰 배치로 바뀌는 순간 열려 있던 패널은 접는다 — 데스크톱에서 펼쳐 둔
  // 패널이 폰 화면을 통째로 덮은 채 시작하지 않게.
  useEffect(() => {
    if (phone && !useEditorUiStore.getState().sidebarCollapsed) {
      useEditorUiStore.setState({ sidebarCollapsed: true });
    }
  }, [phone]);
  // 서랍이 열려 있으면 Esc 로 닫는다
  useEffect(() => {
    if (!phone || collapsed) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onToggleCollapsed(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [phone, collapsed, onToggleCollapsed]);
  // 사이드바(패널)와 맵 화면 사이 세로 스플리터 — 드래그로 패널 폭 조절
  const sidebarWidth = useEditorUiStore((s) => s.sidebarWidth);
  const setSidebarWidth = useEditorUiStore((s) => s.setSidebarWidth);
  const splitRef = useRef<{ pointerId: number; x: number; w: number } | null>(null);
  const [resizing, setResizing] = useState(false);
  // **'새 맵' 은 문서함이 없는 Guest 에게만** (2026-09-07 사용자 결정).
  // 문서함이 있으면 새 맵은 문서함 상단 [＋ 새 맵 ▾] 에서만 만든다 —
  // 편집 화면에서 "현재 맵을 닫고 진행할까요?" 를 묻는 문이 사라진다.
  const guest = useAuthStore((s) => s.guest);
  const session = useAuthStore((s) => s.session);
  const railNewMap = authEnabled && guest && !session;
  const navItems = [
    // 새 맵 만들기 — 기본 맵 또는 등록된 템플릿에서 시작 (Guest 만)
    ...(railNewMap ? [{ key: 'newMap' as NavTabKey, label: tr('shell.sidebar.newMap'), icon: <I.Plus size={17} /> }] : []),
    { key: 'search'   as NavTabKey, label: tr('common.search'), icon: <I.Search size={17} /> },
    { key: 'template' as NavTabKey, label: tr('shell.sidebar.template'), icon: <I.Template size={17} /> },
    { key: 'history'  as NavTabKey, label: tr('shell.sidebar.history'), icon: <I.History size={17} /> },
    // 맵 전체 설정 (레벨별 폰트 등) — 특정 노드가 아닌 맵 단위 설정 메뉴
    { key: 'mapSettings' as NavTabKey, label: tr('shell.sidebar.mapSettings'), icon: <I.Settings size={17} /> },
  ];
  const inspectorItems = [
    { key: 'style'   as InspectorTabKey, label: tr('shell.sidebar.style'), icon: <I.Palette size={17} /> },
    { key: 'layout'  as InspectorTabKey, label: tr('shell.sidebar.layout'), icon: <I.Layout size={17} /> },
    { key: 'icon'    as InspectorTabKey, label: tr('shell.sidebar.icon'), icon: <span style={{ fontSize: 15, lineHeight: 1 }}>🙂</span> },
    { key: 'content' as InspectorTabKey, label: tr('shell.sidebar.content'), icon: <I.Link size={17} /> },
    { key: 'note'    as InspectorTabKey, label: tr('shell.sidebar.note'), icon: <I.Note size={17} /> },
    { key: 'ai'      as InspectorTabKey, label: 'AI',        icon: <I.Sparkles size={17} /> },
  ];

  // 펼침은 setNavTab/setInspectorTab(store)이 담당한다 — 여기서 토글을
  // 또 부르면 store 가 이미 펼친 것을 도로 접는다 (2026-08-02 수정).
  // 폰에는 분할 보기가 없다 — 그 자리의 단추는 아웃라인/맵을 한 화면씩 바꾼다
  const splitActive = phone ? mainView === 'outline' : outlineSplit;
  const splitTitle = phone
    ? (mainView === 'outline' ? tr('shell.toolbar.toMapMode') : tr('shell.toolbar.toOutlineMode'))
    : (outlineSplit ? tr('shell.sidebar.outlineSplitClose') : tr('shell.sidebar.outlineSplitOpen'));
  const onSplitClick = phone
    ? () => { toggleMainView(); onToggleCollapsed(); }
    : onToggleOutlineSplit;

  function handleRailClick(section: SidebarSection, key: string) {
    if (section === 'nav') onNavTabChange(key as NavTabKey);
    else onInspectorTabChange(key as InspectorTabKey);
    onActiveSectionChange(section);
  }

  // 폰: 접혀 있으면 자리를 차지하지 않는다 (여는 문은 하단 막대의 ☰)
  if (phone && collapsed) return null;

  const railW = phone && coarse ? 52 : 44;
  const body = (
    <>
      {/* Icon rail — 항목이 화면보다 많으면(낮은 창·눕힌 폰) 레일 안에서 스크롤 */}
      <div style={{
        width: railW, flexShrink: 0,
        background: t.surfaceSunken,
        borderRight: `1px solid ${t.divider}`,
        display: 'flex', flexDirection: 'column',
        padding: phone ? 'max(8px, env(safe-area-inset-top, 0px)) 0 max(8px, env(safe-area-inset-bottom, 0px))' : '8px 0',
        overflowY: 'auto', overflowX: 'hidden',
        scrollbarWidth: 'none',
      }}>
        <button
          data-testid={phone ? 'm-drawer-close' : 'sidebar-toggle'}
          title={phone
            ? tr('shell.sidebar.panelClose')
            : collapsed ? tr('shell.sidebar.expand') : tr('shell.sidebar.collapse')}
          aria-label={phone
            ? tr('shell.sidebar.panelClose')
            : collapsed ? tr('shell.sidebar.expand') : tr('shell.sidebar.collapse')}
          onClick={onToggleCollapsed}
          style={{
            margin: `0 ${(railW - (phone && coarse ? 40 : 30)) / 2}px 8px`,
            width: phone && coarse ? 40 : 30, height: phone && coarse ? 40 : 30, borderRadius: 6,
            flexShrink: 0,
            background: t.primarySoft, color: t.primary,
            border: `1px solid ${t.primaryBorder}40`,
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
          {collapsed ? <I.ChevronRight size={15} /> : <I.ChevronLeft size={15} />}
        </button>

        <div style={{ margin: '0 10px 6px', height: 1, background: t.divider }} />
        <RailGroupLabel t={t}>{tr('shell.sidebar.groupNav')}</RailGroupLabel>
        {/* 아웃라인 — 사이드 패널이 아니라 메인 화면을 좌(아웃라인)/우(맵)로
            나누는 분할 보기 토글. 아이콘도 분할 화면 모양. */}
        <RailIcon t={t} title={splitTitle}
                  active={splitActive}
                  expanded={!collapsed}
                  big={phone && coarse}
                  testId="rail-outline"
                  onClick={onSplitClick}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <line x1="12" y1="4" x2="12" y2="20" />
            <line x1="6" y1="9" x2="9.5" y2="9" />
            <line x1="6" y1="12.5" x2="9.5" y2="12.5" />
            <line x1="6" y1="16" x2="9.5" y2="16" />
            <circle cx="16.5" cy="12.5" r="1.7" fill="currentColor" stroke="none" />
          </svg>
        </RailIcon>
        {navItems.map(it => (
          <RailIcon key={it.key} t={t} title={it.label}
                    active={activeSection === 'nav' && navTab === it.key}
                    expanded={!collapsed}
                    big={phone && coarse}
                    testId={`rail-${it.key}`}
                    onClick={() => handleRailClick('nav', it.key)}>
            {it.icon}
          </RailIcon>
        ))}

        <div style={{ margin: '10px 10px 6px', height: 1, background: t.divider }} />
        <RailGroupLabel t={t}>{tr('shell.sidebar.groupInspector')}</RailGroupLabel>
        {inspectorItems.map(it => (
          <RailIcon key={it.key} t={t} title={it.label}
                    active={activeSection === 'inspector' && inspectorTab === it.key}
                    expanded={!collapsed}
                    big={phone && coarse}
                    testId={`rail-${it.key}`}
                    onClick={() => handleRailClick('inspector', it.key)}>
            {it.icon}
          </RailIcon>
        ))}

        <div style={{ flex: 1, minHeight: 8 }} />

        {/* 협업 — 유료 기능의 **자리**. 알맹이는 유료 모듈이 채운다
            (open-core-boundary.md §3.1 ③). 눌러야 왜 못 쓰는지 알 수 있다.
            빨간 점(읽지 않은 메시지 표시)은 뺐다 — 오지도 않은 메시지를
            왔다고 말하는 표시였다. */}
        <RailIcon t={t} title={tr('shell.sidebar.collab')}
                  active={activeSection === 'nav' && navTab === 'collab'}
                  expanded={!collapsed}
                  big={phone && coarse}
                  testId="rail-collab"
                  onClick={() => handleRailClick('nav', 'collab')}>
          <I.Users size={16} />
        </RailIcon>
      </div>

      {/* Content area (only when expanded) */}
      {!collapsed && (
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          minWidth: 0, overflow: 'hidden',
        }}>
          {activeSection === 'nav'
            ? <NavContent t={t} tab={railNewMap || navTab !== 'newMap' ? navTab : 'search'} onClose={onToggleCollapsed} />
            : <InspectorContent t={t} tab={inspectorTab} collabs={collabs}
                                onClose={onToggleCollapsed} />}
        </div>
      )}

      {/* 세로 스플리터 — 사이드바(아웃라인 등)와 맵 화면의 영역을 드래그로
          조절 (220~640px). 더블클릭 시 기본 폭(300px)으로 복귀.
          폰 서랍은 화면 폭에 맞춰 정해지므로 손잡이가 없다. */}
      {!collapsed && !phone && (
        <div
          title={tr('shell.sidebar.resizeTitle')}
          onPointerDown={(e) => {
            splitRef.current = { pointerId: e.pointerId, x: e.clientX, w: sidebarWidth };
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            setResizing(true);
            e.preventDefault();
          }}
          onPointerMove={(e) => {
            const d = splitRef.current;
            if (!d || d.pointerId !== e.pointerId) return;
            setSidebarWidth(d.w + (e.clientX - d.x));
          }}
          onPointerUp={(e) => {
            if (splitRef.current?.pointerId === e.pointerId) {
              splitRef.current = null;
              setResizing(false);
            }
          }}
          onDoubleClick={() => setSidebarWidth(300)}
          style={{
            position: 'absolute', top: 0, right: 0, bottom: 0, width: 6,
            cursor: 'col-resize', zIndex: 5,
            background: resizing ? `${t.primary}33` : 'transparent',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.background = `${t.primary}22`;
          }}
          onMouseLeave={(e) => {
            if (!resizing) (e.currentTarget as HTMLElement).style.background = 'transparent';
          }}
        />
      )}
    </>
  );

  if (phone) {
    // 서랍 — 어두운 막(scrim)을 누르거나 ✕·‹ 를 누르면 닫힌다. 막과 서랍은
    // 화면에 **겹쳐** 뜬다(fixed) — 아래 캔버스의 크기는 그대로다.
    return (
      <>
        <div
          data-testid="m-drawer-scrim"
          onClick={onToggleCollapsed}
          style={{
            position: 'fixed', inset: 0, zIndex: 120,
            background: 'rgba(20,14,4,0.38)',
            animation: 'emm-fade-in 160ms ease-out',
          }}
        />
        <div
          data-testid="m-drawer"
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed', top: 0, bottom: 0, left: 0, zIndex: 121,
            // 오른쪽에 캔버스가 조금 비쳐야 "덮인 것" 임을 안다 (최소 40px)
            width: `min(${railW + 340}px, calc(100vw - 40px))`,
            paddingLeft: 'env(safe-area-inset-left, 0px)',
            background: t.surfaceAlt,
            borderRight: `1px solid ${t.border}`,
            boxShadow: '8px 0 28px rgba(0,0,0,0.22)',
            display: 'flex', overflow: 'hidden',
            animation: 'emm-drawer-in 200ms cubic-bezier(.4,0,.2,1)',
          }}
        >
          {body}
        </div>
        <style>{'@keyframes emm-drawer-in { from { transform: translateX(-100%) } to { transform: none } }'
          + '@keyframes emm-fade-in { from { opacity: 0 } to { opacity: 1 } }'
          + '@media (prefers-reduced-motion: reduce) { [data-testid="m-drawer"], [data-testid="m-drawer-scrim"] { animation: none !important } }'}</style>
      </>
    );
  }

  return (
    <div style={{
      width: collapsed ? 44 : 44 + sidebarWidth, flexShrink: 0,
      background: t.surfaceAlt,
      borderRight: `1px solid ${t.border}`,
      display: 'flex',
      overflow: 'hidden',
      position: 'relative',
      // 스플리터 드래그 중에는 전환 애니메이션을 꺼서 즉시 따라오게
      transition: resizing ? 'none' : 'width 180ms cubic-bezier(.4,0,.2,1)',
    }}>
      {body}
    </div>
  );
}

function RailGroupLabel({ t, children }: { t: ThemeTokens; children: ReactNode }) {
  return (
    <div style={{
      fontSize: 9, fontWeight: 700,
      color: t.textSubtle, textTransform: 'uppercase', letterSpacing: 0.6,
      textAlign: 'center', padding: '2px 0 4px',
    }}>{children}</div>
  );
}

interface RailIconProps {
  t: ThemeTokens;
  title: string;
  active: boolean;
  expanded: boolean;
  /** 폰(손가락 입력) — 누를 자리 40px */
  big?: boolean;
  testId?: string;
  onClick: () => void;
  children: ReactNode;
}

function RailIcon({ t, title, active, expanded, big, testId, onClick, children }: RailIconProps) {
  const [h, setH] = useState(false);
  const showIndicator = active && expanded;
  return (
    <button title={title}
      aria-label={title}
      data-testid={testId}
      onClick={onClick}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        margin: big ? '2px 6px' : '1px 7px',
        width: big ? 40 : 30, height: big ? 40 : 30, borderRadius: 6, flexShrink: 0,
        background: showIndicator ? t.primarySoft : (h ? t.surfaceAlt : 'transparent'),
        color:      showIndicator ? t.primary     : (h ? t.text      : t.textMuted),
        border: 'none', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        position: 'relative',
        transition: 'background 120ms, color 120ms',
      }}>
      {children}
      {showIndicator && (
        <span style={{
          position: 'absolute', left: big ? -6 : -7, top: 5, bottom: 5,
          width: 3, borderRadius: 2,
          background: t.primary,
        }} />
      )}
    </button>
  );
}

function NavContent({ t, tab, onClose }: {
  t: ThemeTokens; tab: NavTabKey; onClose: () => void;
}) {
  const tr = useTr();
  const title = tr(({
    newMap:      'shell.sidebar.newMap',
    search:      'common.search',
    template:    'shell.sidebar.template',
    history:     'shell.sidebar.history',
    mapSettings: 'shell.sidebar.mapSettings',
    collab:      'shell.sidebar.collab',
  } as const)[tab]);

  const subtitle =
    tab === 'mapSettings' ? tr('shell.sidebar.subMapSettings')
    : tab === 'newMap' ? tr('shell.sidebar.subNewMap')
    : tab === 'collab' ? tr('shell.sidebar.subCollab')
    : tr('shell.sidebar.subBrowse');

  return (
    <>
      <ContentHeader t={t} title={title} subtitle={subtitle} onClose={onClose} />
      <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
        {tab === 'newMap'      && <NewMapPanel t={t} />}
        {tab === 'search'      && <SearchPanel t={t} />}
        {tab === 'template'    && <TemplatePanel t={t} />}
        {tab === 'history'     && <HistoryPanel t={t} />}
        {tab === 'mapSettings' && <MapSettingsPanel t={t} />}
        {tab === 'collab'      && <ProFeaturePanel t={t} featureId="collab" />}
      </div>
    </>
  );
}

function InspectorContent({ t, tab, onClose }: {
  t: ThemeTokens;
  tab: InspectorTabKey;
  collabs: Collaborator[];
  onClose: () => void;
}) {
  const tr = useTr();
  const selectedId = useInteractionStore((s) => s.selectedId);
  // 연결선을 고른 상태 (2026-09-22) — 머리말이 "연결선" 이라고 알려 준다
  const selectedConnectorId = useInteractionStore((s) => s.selectedConnectorId);
  const multiCount = useInteractionStore((s) => s.multiSelectedIds.length);
  const map = useDocumentStore((s) => s.map);

  const node = findNodeInMap(map, selectedId);
  const depth = getNodeDepth(map, selectedId);
  const parentId = findParentId(map, selectedId);
  const parentNode = findNodeInMap(map, parentId);

  const title = tr(({
    style:   'shell.sidebar.style',
    layout:  'shell.sidebar.layout',
    icon:    'shell.sidebar.iconTitle',
    content: 'shell.sidebar.contentTitle',
    note:    'shell.sidebar.noteTitle',
    ai:      'shell.toolbar.ai',
  } as const)[tab]);

  return (
    <>
      {/* Selected node summary header */}
      <div style={{
        padding: '10px 14px',
        borderBottom: `1px solid ${t.divider}`,
        background: t.surface,
      }}>
        <div style={{
          fontSize: 10, fontWeight: 700, color: t.textSubtle,
          textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 3,
        }}>{multiCount > 1 ? tr('shell.sidebar.multiSelected', { n: multiCount })
          // 레벨 표기 = 중심 주제가 1레벨 (내부 depth 0 기준 → 표시 +1)
          : node ? tr(depth === 0 ? 'shell.sidebar.selectedCentral' : 'shell.sidebar.selectedLevel', { n: depth + 1 })
          : selectedConnectorId ? tr('shell.sidebar.selectedConnector') : tr('shell.sidebar.noSelection')}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: t.primary, flexShrink: 0 }} />
          <div style={{
            fontSize: 13.5, fontWeight: 600, color: node || selectedConnectorId ? t.text : t.textMuted,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{/* 블록 마커는 접어 표시 — ⧉코드·☑/☐·⊞표 (P4) */}
            {node ? flattenNodeText(node.text) : selectedConnectorId ? tr('shell.sidebar.connectorDesc') : tr('shell.sidebar.selectNode')}</div>
        </div>
        {parentNode && parentId !== selectedId && (
          <div style={{ fontSize: 10.5, color: t.textMuted, marginTop: 3 }}>
            {flattenNodeText(parentNode.text)}
          </div>
        )}
      </div>

      <ContentHeader t={t} title={title} compact onClose={onClose} />

      <div style={{ flex: 1, overflow: 'auto', minHeight: 0, background: t.surface }}>
        {tab === 'style'   && <StyleTab t={t} selectedId={selectedId} />}
        {tab === 'layout'  && <LayoutTab t={t} />}
        {tab === 'icon'    && <IconTab t={t} selectedId={selectedId} />}
        {tab === 'content' && <ContentTab t={t} selectedId={selectedId} />}
        {tab === 'note'    && <NoteTagTab t={t} selectedId={selectedId} />}
        {tab === 'ai'      && <AITab t={t} />}
      </div>
    </>
  );
}

function ContentHeader({ t, title, subtitle, compact, onClose }: {
  t: ThemeTokens;
  title: string;
  subtitle?: string;
  compact?: boolean;
  onClose: () => void;
}) {
  const tr = useTr();
  const coarse = useCoarse();
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: compact ? '8px 14px' : '12px 14px',
      borderBottom: `1px solid ${t.divider}`,
      background: compact ? t.surfaceAlt : t.surface,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: compact ? 11 : 13, fontWeight: 700, color: t.text,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{title}</div>
        {subtitle && (
          <div style={{ fontSize: 10.5, color: t.textMuted, marginTop: 2 }}>{subtitle}</div>
        )}
      </div>
      {/* 패널 닫기 — 예전에는 아무 동작도 없는 ⋯ 버튼이었다. 메뉴를 볼
          만큼 봤으면 왼쪽 레일의 '패널 접기'까지 찾아가야 했다는 보고를
          받아, 있던 자리를 ✕(닫기 = 패널 접기)로 바꿨다 (2026-08-05).
          아이콘만 있는 버튼이라 툴팁·aria-label 을 남긴다
          (coding-conventions §5-1-1 예외). */}
      <button
        data-testid="panel-close"
        onClick={onClose}
        title={tr('shell.sidebar.panelClose')}
        aria-label={tr('shell.sidebar.panelClose')}
        style={{
          background: 'none', border: 'none', color: t.textMuted,
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 2, flexShrink: 0,
          // 손가락 입력이면 누를 자리를 40px 로 (모바일 웹 2026-10-05)
          ...(coarse ? { width: 40, height: 40, margin: '-8px -10px -8px 0' } : null),
        }}>
        <I.X size={coarse ? 18 : 14} />
      </button>
    </div>
  );
}
