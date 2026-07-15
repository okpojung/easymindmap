// UnifiedSidebar — left-docked panel that combines:
//   - Navigation group ("탐색"):  Outline / Search / Templates / History
//   - Inspector  group ("속성"):   Style / Layout / Content / Note·Tag / AI
// Layout: 44px icon rail + 300px content panel = 344px total. Collapses to rail-only.
//
// Spec: docs/03-editor-core/canvas/10-canvas.md § 21 (unified left sidebar).

import { useRef, useState, type ReactNode } from 'react';
import type { ThemeTokens } from '@/components/design-tokens/theme';
import type { Collaborator } from '@/editor/__samples__/types';
import { I } from '@/components/icons';
import { useInteractionStore } from '@/stores/interactionStore';
import { useEditorUiStore } from '@/stores/editorUiStore';
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

export type NavTabKey       = 'newMap' | 'search' | 'template' | 'history' | 'mapSettings';
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
  // 사이드바(패널)와 맵 화면 사이 세로 스플리터 — 드래그로 패널 폭 조절
  const sidebarWidth = useEditorUiStore((s) => s.sidebarWidth);
  const setSidebarWidth = useEditorUiStore((s) => s.setSidebarWidth);
  const splitRef = useRef<{ pointerId: number; x: number; w: number } | null>(null);
  const [resizing, setResizing] = useState(false);
  const navItems = [
    // 새 맵 만들기 — 기본 맵 또는 등록된 템플릿에서 시작
    { key: 'newMap'   as NavTabKey, label: '새 맵',    icon: <I.Plus size={17} /> },
    { key: 'search'   as NavTabKey, label: '검색',     icon: <I.Search size={17} /> },
    { key: 'template' as NavTabKey, label: '템플릿',   icon: <I.Template size={17} /> },
    { key: 'history'  as NavTabKey, label: '히스토리', icon: <I.History size={17} /> },
    // 맵 전체 설정 (레벨별 폰트 등) — 특정 노드가 아닌 맵 단위 설정 메뉴
    { key: 'mapSettings' as NavTabKey, label: '맵 설정', icon: <I.Settings size={17} /> },
  ];
  const inspectorItems = [
    { key: 'style'   as InspectorTabKey, label: '스타일',   icon: <I.Palette size={17} /> },
    { key: 'layout'  as InspectorTabKey, label: '레이아웃', icon: <I.Layout size={17} /> },
    { key: 'icon'    as InspectorTabKey, label: '아이콘',   icon: <span style={{ fontSize: 15, lineHeight: 1 }}>🙂</span> },
    { key: 'content' as InspectorTabKey, label: '링크·첨부', icon: <I.Link size={17} /> },
    { key: 'note'    as InspectorTabKey, label: '노트·태그', icon: <I.Note size={17} /> },
    { key: 'ai'      as InspectorTabKey, label: 'AI',        icon: <I.Sparkles size={17} /> },
  ];

  function handleRailClick(section: SidebarSection, key: string) {
    if (section === 'nav') onNavTabChange(key as NavTabKey);
    else onInspectorTabChange(key as InspectorTabKey);
    onActiveSectionChange(section);
    if (collapsed) onToggleCollapsed();
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
      {/* Icon rail */}
      <div style={{
        width: 44, flexShrink: 0,
        background: t.surfaceSunken,
        borderRight: `1px solid ${t.divider}`,
        display: 'flex', flexDirection: 'column',
        padding: '8px 0',
      }}>
        <button
          title={collapsed ? '패널 펼치기' : '패널 접기'}
          onClick={onToggleCollapsed}
          style={{
            margin: '0 7px 8px',
            width: 30, height: 30, borderRadius: 6,
            background: t.primarySoft, color: t.primary,
            border: `1px solid ${t.primaryBorder}40`,
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
          {collapsed ? <I.ChevronRight size={15} /> : <I.ChevronLeft size={15} />}
        </button>

        <div style={{ margin: '0 10px 6px', height: 1, background: t.divider }} />
        <RailGroupLabel t={t}>탐색</RailGroupLabel>
        {/* 아웃라인 — 사이드 패널이 아니라 메인 화면을 좌(아웃라인)/우(맵)로
            나누는 분할 보기 토글. 아이콘도 분할 화면 모양. */}
        <RailIcon t={t} title={outlineSplit ? '아웃라인 분할 닫기' : '아웃라인 분할 보기'}
                  active={outlineSplit}
                  expanded={!collapsed}
                  onClick={onToggleOutlineSplit}>
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
                    onClick={() => handleRailClick('nav', it.key)}>
            {it.icon}
          </RailIcon>
        ))}

        <div style={{ margin: '10px 10px 6px', height: 1, background: t.divider }} />
        <RailGroupLabel t={t}>속성</RailGroupLabel>
        {inspectorItems.map(it => (
          <RailIcon key={it.key} t={t} title={it.label}
                    active={activeSection === 'inspector' && inspectorTab === it.key}
                    expanded={!collapsed}
                    onClick={() => handleRailClick('inspector', it.key)}>
            {it.icon}
          </RailIcon>
        ))}

        <div style={{ flex: 1 }} />

        {/* Collab indicator */}
        <button title="협업 채팅"
          style={{
            margin: '6px 7px',
            width: 30, height: 30, borderRadius: 6,
            background: 'transparent',
            color: t.textMuted,
            border: 'none', cursor: 'pointer',
            position: 'relative',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
          <I.Users size={16} />
          <span style={{
            position: 'absolute', top: 4, right: 4,
            width: 7, height: 7, borderRadius: '50%',
            background: t.danger,
            border: `1.5px solid ${t.surfaceSunken}`,
          }} />
        </button>
      </div>

      {/* Content area (only when expanded) */}
      {!collapsed && (
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          minWidth: 0, overflow: 'hidden',
        }}>
          {activeSection === 'nav'
            ? <NavContent t={t} tab={navTab} />
            : <InspectorContent t={t} tab={inspectorTab} collabs={collabs} />}
        </div>
      )}

      {/* 세로 스플리터 — 사이드바(아웃라인 등)와 맵 화면의 영역을 드래그로
          조절 (220~640px). 더블클릭 시 기본 폭(300px)으로 복귀. */}
      {!collapsed && (
        <div
          title="드래그: 패널 폭 조절 · 더블클릭: 기본 폭"
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
  onClick: () => void;
  children: ReactNode;
}

function RailIcon({ t, title, active, expanded, onClick, children }: RailIconProps) {
  const [h, setH] = useState(false);
  const showIndicator = active && expanded;
  return (
    <button title={title}
      onClick={onClick}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        margin: '1px 7px',
        width: 30, height: 30, borderRadius: 6,
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
          position: 'absolute', left: -7, top: 5, bottom: 5,
          width: 3, borderRadius: 2,
          background: t.primary,
        }} />
      )}
    </button>
  );
}

function NavContent({ t, tab }: { t: ThemeTokens; tab: NavTabKey }) {
  const title = ({
    newMap:      '새 맵',
    search:      '검색',
    template:    '템플릿',
    history:     '히스토리',
    mapSettings: '맵 설정',
  } as const)[tab];

  const subtitle =
    tab === 'mapSettings' ? '맵 전체에 적용'
    : tab === 'newMap' ? '기본 맵 또는 템플릿에서 시작'
    : '전체 맵 탐색';

  return (
    <>
      <ContentHeader t={t} title={title} subtitle={subtitle} />
      <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
        {tab === 'newMap'      && <NewMapPanel t={t} />}
        {tab === 'search'      && <SearchPanel t={t} />}
        {tab === 'template'    && <TemplatePanel t={t} />}
        {tab === 'history'     && <HistoryPanel t={t} />}
        {tab === 'mapSettings' && <MapSettingsPanel t={t} />}
      </div>
    </>
  );
}

function InspectorContent({ t, tab }: {
  t: ThemeTokens;
  tab: InspectorTabKey;
  collabs: Collaborator[];
}) {
  const selectedId = useInteractionStore((s) => s.selectedId);
  const map = useDocumentStore((s) => s.map);

  const node = findNodeInMap(map, selectedId);
  const depth = getNodeDepth(map, selectedId);
  const parentId = findParentId(map, selectedId);
  const parentNode = findNodeInMap(map, parentId);

  const title = ({
    style:   '스타일',
    layout:  '레이아웃',
    icon:    '아이콘 · 기호',
    content: '링크 · 첨부 · 배경',
    note:    '노트 · 태그',
    ai:      'AI 생성',
  } as const)[tab];

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
        }}>{node ? `선택 · depth ${depth}` : '선택된 노드 없음'}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: t.primary, flexShrink: 0 }} />
          <div style={{
            fontSize: 13.5, fontWeight: 600, color: node ? t.text : t.textMuted,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{node ? node.text : '노드를 선택하세요'}</div>
        </div>
        {parentNode && parentId !== selectedId && (
          <div style={{ fontSize: 10.5, color: t.textMuted, marginTop: 3 }}>{parentNode.text}</div>
        )}
      </div>

      <ContentHeader t={t} title={title} compact />

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

function ContentHeader({ t, title, subtitle, compact }: {
  t: ThemeTokens;
  title: string;
  subtitle?: string;
  compact?: boolean;
}) {
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
      <button style={{
        background: 'none', border: 'none', color: t.textMuted,
        cursor: 'pointer', display: 'flex', padding: 2,
      }}>
        <I.MoreH size={14} />
      </button>
    </div>
  );
}
