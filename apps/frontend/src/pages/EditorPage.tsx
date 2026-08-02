// File: src/pages/EditorPage.tsx
// Version: MVP-Layout-Kanban-Fix-v1

import { useEffect, useMemo, useState } from 'react';
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
import { installGlobalTooltip } from '@/utils/globalTooltip';
import { WelcomeScreen } from '@/components/auth/WelcomeScreen';
import { MapBrowser } from '@/components/cloud/MapBrowser';
import { authEnabled, useAuthStore } from '@/stores/authStore';
import { initialMapId, openMapHere } from '@/services/cloud/mapSession';
import {
  useDocumentStore,
  useEditorUiStore,
  useViewportStore,
  useInteractionStore,
  useAutosaveStore,
} from '@/stores';
import { setHistoryPaused } from '@/stores/documentStore';

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
  style?: KanbanCard['style'];
  children?: any[];
}): KanbanCard {
  return {
    id: node.id,
    title: node.text,
    tag: node.tag ?? node.tags?.[0],
    // 카드 썸네일 — 인라인 사진(기사 붙여넣기)이 있으면 첫 장을 쓴다
    image: node.image ?? (node as { images?: KanbanCard['image'][] }).images?.[0],
    style: node.style, // 노드 지정 색(채움·테두리·글자) — 카드에도 반영
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
      style: branch.style,
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
  const mainView = useEditorUiStore((s) => s.mainView);
  const setMainView = useEditorUiStore((s) => s.setMainView);
  // 문서함(서버 맵 목록)을 편집 영역에 띄운 상태 (2026-08-02)
  const browserOpen = useEditorUiStore((s) => s.browserOpen);
  const setBrowserOpen = useEditorUiStore((s) => s.setBrowserOpen);
  // 아웃라인 전체 모드 = 분할이 아니고 mainView가 'outline'일 때
  const fullOutline = !outlineSplit && mainView === 'outline';
  const tweaksOpen = useEditorUiStore((s) => s.tweaksOpen);
  const setTweaksOpen = useEditorUiStore((s) => s.setTweaksOpen);
  const sampleTopic = useEditorUiStore((s) => s.sampleTopic);
  const setSampleTopic = useEditorUiStore((s) => s.setSampleTopic);

  const zoom = useViewportStore((s) => s.zoom);
  const setZoom = useViewportStore((s) => s.setZoom);

  const selectedId = useInteractionStore((s) => s.selectedId);
  const setSelectedId = useInteractionStore((s) => s.setSelectedId);

  const saveState = useAutosaveStore((s) => s.saveState);
  const session = useAuthStore((s) => s.session);
  // 인증이 켜진 배포에서 로그인 전에는 에디터를 열지 않는다 (2026-08-02)
  const gated = authEnabled && !session;

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
    // `?map=<id>` 로 들어온 탭은 서버 문서를 열 자리다 — 샘플로 덮지 않는다
    if (initialMapId) return;

    // **인증이 켜진 배포(= 실제 서비스)에서는 아무 맵도 열지 않는다**
    // (2026-08-02 사용자 지시). 로그인 직후 남의 문서처럼 보이는 샘플
    // 맵이 떠 있으면 "내 문서"인지 헷갈리고, 거기서 편집을 시작하면
    // 저장할 곳이 애매해진다. 대신 **문서함**을 열어 다음 행동
    // (열기 / 새 맵)을 바로 고르게 한다.
    //   · 샘플 맵은 인증이 꺼진 개발 모드(로컬·E2E)에서만 주입된다 —
    //     테스트 픽스처로 계속 필요하기 때문이다.
    setHistoryPaused(true);
    if (authEnabled) {
      useDocumentStore.getState().closeMap();
      useEditorUiStore.getState().setBrowserOpen(true);
    } else {
      // 초기 샘플 맵 주입은 "편집"이 아니다 — undo 히스토리에 기록하지
      // 않아 첫 실행 상태에서 되돌리기가 비활성이고, 새 맵/불러오기의
      // "현재 맵을 닫고 진행할까요?" 확인도 뜨지 않는다 (편집 이력 기준).
      setSample(sampleTopic);
    }
    setHistoryPaused(false);
  }, [sampleTopic, setSample]);

  // `?map=<id>` — 다른 맵을 "브라우저 새 탭"으로 여는 경로 (2026-08-02).
  // 앱 안에서 탭을 관리하는 대신 브라우저 탭을 쓰기로 했고, 그 탭이
  // 부팅될 때 여기서 해당 문서를 불러온다. 로그인 게이트가 걸려 있으면
  // 로그인이 끝난 뒤에 불러온다.
  const [urlMapErr, setUrlMapErr] = useState<string | null>(null);
  // 문서함 안내(열기·폴더 생성 결과) — 화면 위쪽에 잠깐 표시
  const [browserMsg, setBrowserMsgRaw] = useState<string | null>(null);
  const setBrowserMsg = (m: string) => {
    setBrowserMsgRaw(m);
    window.setTimeout(() => setBrowserMsgRaw((cur) => (cur === m ? null : cur)), 3500);
  };
  useEffect(() => {
    if (!initialMapId || gated) return;
    let alive = true;
    setHistoryPaused(true);
    // 불러오는 동안 샘플 맵이 잠깐 비치지 않도록 먼저 비운다
    useDocumentStore.getState().closeMap();
    openMapHere(initialMapId)
      .catch(() => { if (alive) setUrlMapErr('이 맵을 열 수 없습니다. 목록에서 다시 선택해 주세요.'); })
      .finally(() => setHistoryPaused(false));
    return () => { alive = false; };
  }, [gated]);

  // 커서가 설명 텍스트를 가리지 않는 전역 커스텀 툴팁 (요소 위쪽 표시)
  useEffect(() => {
    installGlobalTooltip();
  }, []);

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

  // 로그인 전에는 소개 + 로그인만 (인증이 켜진 배포에서만 — 개발 모드는
  // authEnabled=false 라 그대로 에디터가 열린다)
  if (gated) return <WelcomeScreen t={t} />;

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
            {browserOpen ? (
              // 문서함 — 팝업이 아니라 편집 영역을 그대로 쓴다 (2026-08-02)
              <MapBrowser
                t={t}
                onClose={() => setBrowserOpen(false)}
                onFlash={(m) => setBrowserMsg(m)}
                onOpened={() => setBrowserOpen(false)}
              />
            ) : fullOutline ? (
              // 아웃라인 전체 모드 — 편집 영역을 아웃라인 하나로 채운다.
              // ✕(또는 상단 토글)로 맵 모드로 돌아간다.
              <div style={{ flex: 1, minWidth: 0 }}>
                <OutlineEditorPane
                  t={t}
                  outline={outline}
                  onClose={() => setMainView('map')}
                  closeTitle="맵 모드로 전환"
                />
              </div>
            ) : layoutType === 'kanban' ? (
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

      {browserMsg && (
        <div
          data-testid="browser-toast"
          style={{
            position: 'fixed', top: 62, left: '50%', transform: 'translateX(-50%)',
            zIndex: 300, background: t.text, color: t.surface,
            borderRadius: 9, padding: '8px 14px', fontSize: 12.5,
            boxShadow: '0 10px 28px rgba(0,0,0,0.2)', whiteSpace: 'nowrap',
            pointerEvents: 'none', // 아래 요소 클릭을 막지 않는다
          }}
        >
          {browserMsg}
        </div>
      )}

      {/* `?map=<id>` 로 연 탭에서 문서를 불러오지 못했을 때 */}
      {urlMapErr && (
        <div
          data-testid="url-map-error"
          style={{
            position: 'fixed', top: 62, left: '50%', transform: 'translateX(-50%)',
            zIndex: 300, background: t.surface, color: t.text,
            border: `1px solid ${t.border}`, borderRadius: 9, padding: '9px 14px',
            fontSize: 12.5, boxShadow: '0 10px 28px rgba(0,0,0,0.2)',
          }}
        >
          ⚠ {urlMapErr}
        </div>
      )}

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