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
import { DraftRecoveryBanner } from '@/components/cloud/DraftRecoveryBanner';
import { UploadProgress } from '@/components/cloud/UploadProgress';
import { WelcomeScreen } from '@/components/auth/WelcomeScreen';
import { GuestBrowserNotice } from '@/components/auth/GuestBrowserNotice';
import { MapBrowser } from '@/components/cloud/MapBrowser';
import { authEnabled, useAuthStore } from '@/stores/authStore';
import {
  clearCurrentMap, detachFromServer, editSessionKey, initialMapId, openMapHere,
} from '@/services/cloud/mapSession';
import { writeLocalDraftNow } from '@/hooks/useLocalDraft';
import { pullAiKeys } from '@/services/cloud/aiKeysSync';
import { useCloudStore } from '@/stores/cloudStore';
import { useNoticeStore } from '@/stores/noticeStore';
import { cloudApi, CloudError } from '@/services/cloud/apiClient';
import {
  useDocumentStore,
  useEditorUiStore,
  useViewportStore,
  useInteractionStore,
  useAutosaveStore,
} from '@/stores';
import { isDocumentEmpty, setHistoryPaused } from '@/stores/documentStore';

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

  const zoom = useViewportStore((s) => s.zoom);
  const setZoom = useViewportStore((s) => s.setZoom);

  const selectedId = useInteractionStore((s) => s.selectedId);
  const setSelectedId = useInteractionStore((s) => s.setSelectedId);

  const saveState = useAutosaveStore((s) => s.saveState);
  const session = useAuthStore((s) => s.session);
  const guest = useAuthStore((s) => s.guest);
  // **계정의 정체** — 아래 "전환 리셋" 효과는 이것만 본다 (2026-09-04).
  // `session` 객체는 **토큰을 갱신할 때마다 새 객체**가 된다
  // (`getFreshAccessToken` → `setSession`). 객체를 의존성으로 쓰면 로그인
  // 1시간 뒤 첫 API 호출(저장·폴더 조회·하트비트…)이 "로그인 전환"으로
  // 잡혀 **편집 중인 문서를 통째로 지웠다** — '문서 없음' 이 저장·내보내기
  // 까지 이어진 사고의 원인이다. 계정이 바뀌는 것은 userId 가 바뀔 때뿐이다.
  const authUserId = session?.userId ?? null;
  // 인증이 켜진 배포에서 로그인 전에는 에디터를 열지 않는다 (2026-08-02).
  // Guest 체험(2026-08-04)은 게이트를 통과한다 — 로컬 편집만 가능.
  const gated = authEnabled && !session && !guest;

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
    // 개발 모드(인증 꺼짐) 전용 — 초기 샘플 맵 주입. "편집"이 아니므로
    // undo 히스토리에 기록하지 않아 첫 실행 상태에서 되돌리기가 비활성
    // 이고, 새 맵/불러오기의 확인도 뜨지 않는다 (편집 이력 기준).
    // `?map=<id>` 탭은 서버 문서를 열 자리라 샘플로 덮지 않는다.
    if (authEnabled || initialMapId) return;
    setHistoryPaused(true);
    setSample();
    setHistoryPaused(false);
  }, [setSample]);

  // **로그인/로그아웃 전환 리셋** (인증 켜진 배포 — 2026-08-02).
  // **계정이** 바뀔 때마다 문서·서버 링크·undo 히스토리를 비운다:
  //  · 로그아웃: 이전 계정의 문서가 화면·Ctrl+Z 에 남으면 안 된다.
  //    특히 cloudMapId 가 남으면 재로그인 후 문서함이 그 맵을 "편집 중"
  //    으로 표시하고 열기를 거부했다 (사용자 실사용 보고 #4).
  //  · 로그인: 아무 맵도 열지 않은 빈 화면 + 문서함으로 시작한다.
  //    (샘플 맵은 개발 모드 전용 — 위 효과 참조)
  //
  // ★ **의존성은 `session` 객체가 아니라 `authUserId` 다** (2026-09-04).
  //   토큰 갱신은 로그인 전환이 아니다 — 같은 사람이 계속 일하고 있다.
  //   예전에는 `[session, guest]` 라서 갱신 때마다 여기가 돌았고, 사용자는
  //   저장 대화상자를 여는 순간 뒤에서 문서가 '문서 없음' 으로 바뀐 것을
  //   모른 채 저장했다(가지 0개 문서가 서버에 남고, HTML 내보내기도
  //   '문서 없음' 이었다). e2e184 가 이 경로를 되돌려 깨뜨리며 지킨다.
  useEffect(() => {
    if (!authEnabled) return;
    setHistoryPaused(true);
    clearCurrentMap();                              // 문서 비움 + 서버 링크 해제
    useDocumentStore.getState().clearHistory();     // 계정 경계 — undo 도 비움
    useInteractionStore.getState().setSelectedId(null);
    // `?map=<id>` 탭은 아래 URL 로딩 효과가 문서함 대신 그 맵을 연다
    useEditorUiStore.getState().setBrowserOpen(!!session && !initialMapId);
    // 로그인/Guest 첫 화면의 좌측 패널 = **새 맵 메뉴** 고정 (2026-08-04
    // 보고 — 시크릿창처럼 저장된 UI 상태가 없으면 '스타일' 탭이 떴다.
    // 문서함이 메인인 첫 화면에서 노드 속성 패널은 무의미하다)
    //
    // ★ **`setNavTab` 을 쓰지 않는다** (2026-08-20). 그 동작은 탭을 고르는
    //   김에 **사이드바를 펼치는 부수효과**를 갖고 있다
    //   (`sidebarCollapsed: false`). 사용자가 아이콘을 눌렀을 때는 그게
    //   맞지만, 여기는 **아무도 누르지 않았다** — 로그인했을 뿐이다.
    //   그래서 접어 두기로 한 기본값(#306)이 매번 다시 펼쳐졌다.
    //   여기서 정할 것은 **"열면 무엇이 보이나"** 지 "열어라" 가 아니다.
    if (session || guest) {
      useEditorUiStore.setState({ navTab: 'newMap', activeSection: 'nav' });
    }
    // 계정에 보관된 AI API 키를 받아 온다 (2026-09-04) — 브라우저에만 있던
    // 키는 계정으로 올린다. 실패해도 예전처럼 브라우저 키로 동작한다.
    if (session) void pullAiKeys();
    // Guest 체험 — 빈 화면 대신 곧바로 만져 볼 샘플 맵을 연다
    if (guest && !session && !initialMapId) {
      setSample();
      useInteractionStore.getState().setSelectedId('root');
    }
    setHistoryPaused(false);
    // `session` 을 안에서 읽지만 의존성은 계정 정체뿐이다 — 위 주석 참조.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUserId, guest]);

  // `?map=<id>` — 다른 맵을 "브라우저 새 탭"으로 여는 경로 (2026-08-02).
  // 앱 안에서 탭을 관리하는 대신 브라우저 탭을 쓰기로 했고, 그 탭이
  // 부팅될 때 여기서 해당 문서를 불러온다. 로그인 게이트가 걸려 있으면
  // 로그인이 끝난 뒤에 불러온다.
  const [urlMapErr, setUrlMapErr] = useState<string | null>(null);
  // **맵이 열리면 안내를 거둔다** (2026-09-04 사용자 보고 — "계속 뜬다").
  // 부팅 때 `?map=` 열기에 실패한 안내가 상태로 남아, 그 뒤 문서함에서
  // 다른 맵을 열거나 새 맵을 만들어도 화면 위에 계속 떠 있었다. 안내가
  // 시킨 일("목록에서 다시 선택")을 사용자가 했으면 안내는 할 일을 다한 것이다.
  useEffect(() => {
    if (urlMapErr && !isDocumentEmpty(map)) setUrlMapErr(null);
  }, [map, urlMapErr]);
  // 문서함 안내(열기·폴더 생성 결과) — 화면 위쪽에 잠깐 표시
  const [browserMsg, setBrowserMsgRaw] = useState<string | null>(null);

  // 사진 붙여넣기 등의 한 줄 안내 (stores/noticeStore.ts) — 잠깐 띄우고 지운다.
  // `seq` 까지 보는 이유: 같은 문구가 다시 와도 다시 띄워야 한다.
  const appNotice = useNoticeStore((s) => s.notice);
  const appNoticeSeq = useNoticeStore((s) => s.seq);
  useEffect(() => {
    if (!appNotice) return undefined;
    const id = window.setTimeout(() => useNoticeStore.getState().clear(), 7000);
    return () => window.clearTimeout(id);
  }, [appNotice, appNoticeSeq]);
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
      .then(({ readOnly }) => {
        if (alive && readOnly) {
          setBrowserMsg('🔒 다른 세션(브라우저)에서 편집 중이라 읽기 전용으로 열었습니다 — 변경은 이 맵에 저장되지 않습니다.');
        }
      })
      .catch((e: unknown) => {
        if (!alive) return;
        // **왜** 못 열었는지 서버의 말을 그대로 붙인다 (2026-09-04) —
        // "열 수 없습니다" 만으로는 사용자가 무엇을 해야 할지 모른다
        // (문서가 없는 맵 · 지워진 맵 · 권한 없음이 전부 같은 문장이었다).
        const why = e instanceof CloudError ? e.message : '';
        setUrlMapErr(`이 맵을 열 수 없습니다${why ? ` — ${why}` : '.'} 목록에서 다시 선택해 주세요.`);
        // **갈 곳을 준다.** 예전에는 '문서 없음' 빈 화면에 안내만 떠 있었고,
        // '맵 닫기' 는 "열려 있는 맵이 없습니다" 만 되풀이해 이 탭에서
        // 빠져나갈 길이 없었다(2026-09-04 사용자 보고). 문서함을 연다.
        useEditorUiStore.getState().setBrowserOpen(true);
      })
      .finally(() => setHistoryPaused(false));
    return () => { alive = false; };
  }, [gated]);

  // 편집 잠금 하트비트 (2026-08-04) — 편집권을 쥔 탭(cloudMapId 연결)이
  // 25초마다 갱신한다. 놓치면 TTL(60초) 뒤 다른 세션이 가져간다.
  const cloudMapIdForLock = useCloudStore((s) => s.cloudMapId);
  useEffect(() => {
    if (!cloudMapIdForLock) return;
    const timer = window.setInterval(() => {
      void cloudApi.editHeartbeat(cloudMapIdForLock, editSessionKey())
        .then((r) => {
          // held=false = 편집권을 잃었다 (TTL 만료 후 다른 세션이 가져감).
          // 이 상태로 계속 편집하면 저장이 409 로 막혀 그 편집분이 사라진다.
          // 예전에는 응답을 아무도 보지 않았다 (2026-08-05 감사).
          if (r && r.held === false) {
            // **① 지금 화면의 내용을 먼저 브라우저에 적는다** — 이 뒤로는
            //    이 맵에 저장할 수 없으므로, 여기서 놓치면 유실이다.
            void writeLocalDraftNow();
            // **② 그 맵과의 연결을 끊는다.** 예전에는 연결을 남겨 둬서
            //    자동저장이 409 로 계속 튕겼고, 배지만 '저장 실패'로
            //    굳은 채 사용자는 계속 편집했다 — 그 편집분이 사라졌다.
            //    끊어 두면 이후 편집은 '저장 안 됨'으로 표시되고 초안에
            //    쌓이며, ☁ 저장을 누르면 **새 이름의 새 맵**으로 간다.
            detachFromServer();
            useCloudStore.getState().setError(
              '다른 창에서 이 맵을 편집 중이라 편집권을 잃었습니다 — '
              + '지금 내용은 이 브라우저에 보관했습니다. '
              + '☁ 저장을 누르면 새 이름의 맵으로 저장됩니다.',
            );
            // detachFromServer 가 'saved' 로 되돌리므로 그 뒤에 세운다
            useAutosaveStore.getState().setSaveState('unsaved');
          }
        })
        .catch(() => { /* 일시 오류 — 다음 주기·저장이 하트비트를 겸한다 */ });
    }, 25_000);
    return () => window.clearInterval(timer);
  }, [cloudMapIdForLock]);

  // **저장되지 않은 채 창을 닫으면 브라우저가 한 번 묻게 한다**
  // (2026-08-05 저장 감사). 자동저장은 1.5초 디바운스라 그 사이에 탭을
  // 닫으면 마지막 편집이 사라진다 — 지금까지는 아무 경고도 없었다.
  // beforeunload 에서 동기 저장은 불가능하므로(비동기 fetch 는 취소된다)
  // "정말 나가시겠습니까?"로 사용자에게 결정권을 준다.
  useEffect(() => {
    const risky = saveState === 'dirty'
      || saveState === 'saving'
      || saveState === 'retrying'
      || saveState === 'error'
      // 서버에 한 번도 저장되지 않은 문서 — 닫으면 통째로 사라진다.
      // 손대지 않은 새 맵 골격까지 붙잡지는 않는다(편집 이력이 있을 때만).
      || (saveState === 'unsaved'
          && useDocumentStore.getState().past.length > 0);
    if (!risky) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = ''; // 크롬은 브라우저 기본 문구를 쓴다
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [saveState]);

  // 커서가 설명 텍스트를 가리지 않는 전역 커스텀 툴팁 (요소 위쪽 표시)
  useEffect(() => {
    installGlobalTooltip();
  }, []);

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
            {/* 저장되지 않은 맵 복구 안내 (감사 R1·R2 — localDraft) */}
            <DraftRecoveryBanner t={t} />
            {/* 큰 첨부 업로드 진행률 — 어느 경로로 시작했든 여기서만 그린다 */}
            <UploadProgress t={t} />
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
              // 문서함 — 팝업이 아니라 편집 영역을 그대로 쓴다 (2026-08-02).
              // Guest 는 서버 문서함이 없다 — 빈 목록 대신 안내 + 가입 유도
              guest && !session ? (
                <GuestBrowserNotice t={t} />
              ) : (
              <MapBrowser
                t={t}
                onClose={() => setBrowserOpen(false)}
                onFlash={(m) => setBrowserMsg(m)}
                onOpened={() => setBrowserOpen(false)}
              />
              )
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
        collabs={SAMPLE_COLLABS}
        zoom={zoom}
        onZoomChange={setZoom}
      />

      {/* Hide canvas-only overlays (collapse toggles, +indicators) when printing
          or exporting to image. */}
      <style>{`@media print { .mm-overlay-controls { display: none !important; } }`}</style>

      {/* 사진 붙여넣기 안내 — **네 화면(캔버스·노드 편집창·아웃라인·칸반)
          어디서 붙여넣어도** 같은 자리에 뜬다. 업로드가 실패했는데 아무
          말이 없으면 사용자는 노드에 빈 자리가 남은 이유를 알 수 없다
          (stores/noticeStore.ts) */}
      {appNotice && (
        <div
          data-testid="app-notice"
          style={{
            position: 'fixed', top: 62, left: '50%', transform: 'translateX(-50%)',
            zIndex: 320, maxWidth: 620, background: t.surface, color: t.text,
            border: `1px solid ${t.warning}`, borderLeft: `4px solid ${t.warning}`,
            borderRadius: 9, padding: '9px 14px', fontSize: 12.5, lineHeight: 1.5,
            boxShadow: '0 10px 28px rgba(0,0,0,0.2)',
          }}
        >
          {appNotice}
        </div>
      )}

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
          <button
            data-testid="url-map-error-close"
            title="이 안내 닫기"
            aria-label="이 안내 닫기"
            onClick={() => setUrlMapErr(null)}
            style={{
              marginLeft: 10, border: 'none', background: 'transparent',
              color: t.textMuted, cursor: 'pointer', fontSize: 13, padding: 0,
            }}
          >✕</button>
        </div>
      )}

      <MultiAddDialog t={t} />
    </div>
  );
}