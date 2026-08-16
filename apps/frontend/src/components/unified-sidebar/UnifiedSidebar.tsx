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
import { flattenNodeText } from '@/editor/node-renderer/RichTextHtml';
// 유료 화면 모듈 — vite 별칭. 유료 UI 가 없으면 코어의 스텁으로 간다
// (docs/04-extensions/open-core-boundary.md §5).
import { ProFeaturePanel } from '@pro';

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

  // 펼침은 setNavTab/setInspectorTab(store)이 담당한다 — 여기서 토글을
  // 또 부르면 store 가 이미 펼친 것을 도로 접는다 (2026-08-02 수정).
  function handleRailClick(section: SidebarSection, key: string) {
    if (section === 'nav') onNavTabChange(key as NavTabKey);
    else onInspectorTabChange(key as InspectorTabKey);
    onActiveSectionChange(section);
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

        {/* 협업 — 유료 기능의 **자리**. 알맹이는 유료 모듈이 채운다
            (open-core-boundary.md §3.1 ③). 눌러야 왜 못 쓰는지 알 수 있다.
            빨간 점(읽지 않은 메시지 표시)은 뺐다 — 오지도 않은 메시지를
            왔다고 말하는 표시였다. */}
        <RailIcon t={t} title="협업"
                  active={activeSection === 'nav' && navTab === 'collab'}
                  expanded={!collapsed}
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
            ? <NavContent t={t} tab={navTab} onClose={onToggleCollapsed} />
            : <InspectorContent t={t} tab={inspectorTab} collabs={collabs}
                                onClose={onToggleCollapsed} />}
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

function NavContent({ t, tab, onClose }: {
  t: ThemeTokens; tab: NavTabKey; onClose: () => void;
}) {
  const title = ({
    newMap:      '새 맵',
    search:      '검색',
    template:    '템플릿',
    history:     '히스토리',
    mapSettings: '맵 설정',
    collab:      '협업',
  } as const)[tab];

  const subtitle =
    tab === 'mapSettings' ? '맵 전체에 적용'
    : tab === 'newMap' ? '기본 맵 또는 템플릿에서 시작'
    : tab === 'collab' ? '함께 편집하기'
    : '전체 맵 탐색';

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
  const selectedId = useInteractionStore((s) => s.selectedId);
  const multiCount = useInteractionStore((s) => s.multiSelectedIds.length);
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
        }}>{multiCount > 1 ? `${multiCount}개 노드 선택 · 일괄 편집`
          // 레벨 표기 = 중심 주제가 1레벨 (내부 depth 0 기준 → 표시 +1)
          : node ? `선택 · ${depth + 1}레벨${depth === 0 ? ' (중심 주제)' : ''}` : '선택된 노드 없음'}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: t.primary, flexShrink: 0 }} />
          <div style={{
            fontSize: 13.5, fontWeight: 600, color: node ? t.text : t.textMuted,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{/* 블록 마커는 접어 표시 — ⧉코드·☑/☐·⊞표 (P4) */}
            {node ? flattenNodeText(node.text) : '노드를 선택하세요'}</div>
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
        title="패널 닫기"
        aria-label="패널 닫기"
        style={{
          background: 'none', border: 'none', color: t.textMuted,
          cursor: 'pointer', display: 'flex', padding: 2,
        }}>
        <I.X size={14} />
      </button>
    </div>
  );
}
