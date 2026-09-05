import { useEffect, useRef, useState } from 'react';
import type { ThemeTokens } from '@/components/design-tokens/theme';
import type { Collaborator } from '@/editor/__samples__/types';
import { I } from '@/components/icons';
import { IconBtn } from './IconBtn';
import { CollabAvatars } from './CollabAvatars';
import { MapActions } from './MapActions';
import { UserMenu } from './UserMenu';
import { COLLAB_PRESENCE_UI } from '@/config/featureFlags';
import { ProPresenceBar, ProShareDialog } from '@pro';
import { PublishPanel } from '@/components/cloud/PublishPanel';
import { useDocumentStore } from '@/stores/documentStore';
import { useEditorUiStore } from '@/stores/editorUiStore';
import { downloadMapAsHtml } from '@/export/exportHtml';
import { downloadMapAsMarkdown } from '@/export/exportMarkdown';
import { useCloudStore } from '@/stores/cloudStore';
import { useAutosaveStore } from '@/stores/autosaveStore';

// 'retrying' = 저장이 실패했고 **실제로 자동 재시도 중**,
// 'error' = 재시도까지 다 실패해 더는 자동으로 시도하지 않음.
// (2026-08-05: 예전에는 'error' 문구가 "재시도 중"이라고 말했지만
//  재시도 기능 자체가 없어, 기다려도 저장되지 않는 상태를 감췄다)
export type SaveState =
  | 'saved' | 'saving' | 'dirty' | 'retrying' | 'error'
  // 서버에 연결되지 않은 문서(미저장 새 맵·불러온 파일·읽기 전용)를
  // 편집한 상태 — 자동저장 대상이 아니라서 **어디에도 저장돼 있지 않다**.
  // 예전에는 이 상태에서도 배지가 '저장됨'이라고 말했다 (2026-08-05 감사).
  | 'unsaved'
  // 협업 세션이 이 맵을 몰고 있다 — 스냅샷 자동저장 대신 소켓으로
  // 합쳐진다 (2026-08-18). 자리는 코어, 켜는 것은 협업 모듈.
  | 'collab';

interface Props {
  t: ThemeTokens;
  collabs: Collaborator[];
  mapTitle: string;
  saveState?: SaveState;
}

export function TopToolbar({
  t,
  collabs,
  mapTitle,
  saveState: rawSaveState = 'saved',
}: Props) {
  const map = useDocumentStore((s) => s.map);
  const layoutType = useEditorUiStore((s) => s.layoutType);
  const themeName = useEditorUiStore((s) => s.themeName);
  const mainView = useEditorUiStore((s) => s.mainView);
  const outlineSplit = useEditorUiStore((s) => s.outlineSplit);
  const toggleMainView = useEditorUiStore((s) => s.toggleMainView);
  const setInspectorTab = useEditorUiStore((s) => s.setInspectorTab);
  const setThemeName = useEditorUiStore((s) => s.setThemeName);
  const spacingX = useEditorUiStore((s) => s.spacingX);
  const spacingY = useEditorUiStore((s) => s.spacingY);
  const undo = useDocumentStore((s) => s.undo);
  const redo = useDocumentStore((s) => s.redo);
  const canUndo = useDocumentStore((s) => s.past.length > 0);
  const canRedo = useDocumentStore((s) => s.future.length > 0);
  // 되돌린 단계 수 = future 길이 (undo 1회 = +1, redo 1회 = -1, 새 편집 = 0)
  const undoDepth = useDocumentStore((s) => s.future.length);
  const commitCurrentAsLatest = useDocumentStore((s) => s.commitCurrentAsLatest);

  // 상단 툴바 공용 알림 — 맵 저장·닫기, 로그아웃 등 (우측 상단 토스트)
  const [toast, setToast] = useState<string | null>(null);
  const flash = (m: string) => {
    setToast(m);
    window.setTimeout(() => setToast((cur) => (cur === m ? null : cur)), 3500);
  };

  // 내보내기 메뉴 — HTML/MD를 하위 항목으로 구분 (바깥 클릭 시 닫힘)
  const [exportOpen, setExportOpen] = useState(false);
  const exportRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!exportOpen) return;
    const close = (e: PointerEvent) => {
      if (!exportRef.current?.contains(e.target as Node)) setExportOpen(false);
    };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [exportOpen]);

  // 저장 실패 사유 — 배지 툴팁에 그대로 보여 준다 (2026-08-05)
  const cloudError = useCloudStore((s) => s.error);
  // 오류가 아닌 소식(cloudStore.notice) — 같은 토스트로 보여 주고 비운다
  // (2026-09-05: "AI 대화가 이 맵을 갱신했습니다 — 화면을 새로 읽었습니다")
  const cloudNotice = useCloudStore((s) => s.notice);
  useEffect(() => {
    if (!cloudNotice) return;
    flash(cloudNotice);
    useCloudStore.getState().setNotice(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloudNotice]);
  // **미저장 편집 수 · 마지막 저장 시각** (2026-08-06 저장 모델 개편).
  // 실시간 저장을 없앴으므로 "지금 몇 개가 서버에 없는가"를 숫자로
  // 보여 준다 — "저장됨"인지 아닌지 애매한 상태를 남기지 않는다.
  const pendingEdits = useAutosaveStore((s) => s.pendingEdits);
  const lastSavedAt = useAutosaveStore((s) => s.lastSavedAt);
  const agoText = (() => {
    if (!lastSavedAt) return '';
    const min = Math.floor((Date.now() - lastSavedAt) / 60_000);
    return min < 1 ? ' · 방금 전' : ` · ${min}분 전`;
  })();
  // **협업이 몰고 있으면 그것이 우선이다.** 배지는 "지금 무엇이 저장을
  // 책임지고 있나"를 말해야 한다 — 저장 방식이 바뀐 사실을 숨기면
  // 사용자는 잠시 뒤 반영되는 것과 이미 반영된 것을 구분할 수 없다.
  // (검증에서 잡았다: 맵 여는 경로가 뒤늦게 'saved' 로 덮어썼다)
  const collabDriving = useAutosaveStore((s) => s.collabDrivingMapId);
  // 공유 대화상자 — 저장된 맵에서만 연다(서버에 없는 맵은 나눌 것이 없다)
  const shareMapId = useCloudStore((s) => s.cloudMapId);
  // ★ **퍼블리싱 버튼은 읽기 전용에서도 살아 있어야 한다** (2026-09-05).
  //
  // 퍼블리싱하면 그 맵은 읽기 전용이 되고 `cloudMapId` 가 비워진다.
  // 그 값만 보고 버튼을 잠그면, **퍼블리싱한 순간 중단할 문이 사라진다** —
  // 켤 수는 있는데 끌 수 없는 스위치가 된다. 그래서 읽기 전용으로 열린
  // 맵도 **내 맵이면**(공유받은 것이 아니면) 같은 문을 준다.
  const readOnly = useCloudStore((s) => s.readOnlyInfo);
  const publishMapId = shareMapId
    ?? (readOnly && !readOnly.viewer ? readOnly.mapId : null);
  const [shareOpen, setShareOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const saveState = collabDriving ? 'collab' : rawSaveState;

  // **좁은 폭 대응** (2026-09-02). 창을 좁히면(DevTools·창 분할) 배지와
  // 버튼 글자가 세로로 한 글자씩 쌓였다. 재는 것은 **툴바 자신의 폭**
  // 하나뿐이다 — 미디어쿼리와 섞으면 기준이 둘이 되어 어긋난다.
  //   compact  배지 문구를 짧게
  //   iconOnly 배지는 점만, 버튼은 아이콘만 (이름은 title 로 남는다)
  const barRef = useRef<HTMLDivElement>(null);
  const [barW, setBarW] = useState(Infinity);
  useEffect(() => {
    const el = barRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => setBarW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const compact = barW < 1150;
  const iconOnly = barW < 960;

  const saveStateInfo = ({
    saved: { text: `저장됨${agoText}`, short: '저장됨', color: t.textMuted, dot: t.success },
    saving: { text: '저장 중…', short: '저장 중', color: t.accent, dot: t.accent },
    dirty: {
      text: `미저장 편집 ${pendingEdits}개`,
      short: `미저장 ${pendingEdits}`,
      color: t.warning, dot: t.warning,
    },
    // **'저장 안 됨'은 오해를 샀다** (2026-09-02). unsaved 는 실패가
    // 아니라 "이 문서가 아직 서버에 없다"는 **정상 초기 상태**다(아래
    // 툴팁이 처음부터 그렇게 적고 있었다). 새 맵을 만들자마자 경고색
    // 문구가 뜨니 사용자는 뭔가 실패한 줄 알았다 — 사실형 문구에
    // 중립색으로 바꾼다. error·retrying 은 진짜 문제라 경고색 그대로다.
    unsaved: {
      text: '새 문서 — ☁ 저장을 눌러 서버에 보관하세요',
      short: '새 문서',
      color: t.textMuted, dot: t.textMuted,
    },
    retrying: { text: '저장 실패 — 재시도 중…', short: '재시도 중', color: t.warning, dot: t.warning },
    error: { text: '저장 실패 — ☁ 저장을 눌러 주세요', short: '저장 실패', color: t.danger, dot: t.danger },
    // 협업이 몰고 있다 — 통째 저장 대신 **글자 단위로 서버에 합쳐진다**.
    // '저장됨' 이라고 쓰지 않는 이유: 배지는 저장 방식이 달라졌다는
    // 사실까지 말해야 한다(잠시 뒤 반영되는 것과 이미 반영된 것은 다르다).
    collab: { text: '협업 중 — 자동 반영', short: '협업 중', color: t.textMuted, dot: t.success },
  } as const)[saveState];

  return (
    <div
      ref={barRef}
      style={{
        height: 52,
        background: t.surface,
        borderBottom: `1px solid ${t.border}`,
        display: 'flex',
        alignItems: 'center',
        padding: '0 14px',
        gap: 10,
        position: 'relative',
        zIndex: 20,
      }}
    >
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        minWidth: iconOnly ? 0 : compact ? 180 : 280,
      }}>
        {/* EasyMindMap 로고 — 배지형이라 배경 상자 없이 그대로 표시 */}
        <div
          style={{
            width: 32,
            height: 32,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
          }}
          title="EasyMindMap"
        >
          <I.Logo size={30} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15, minWidth: 0 }}>
          {/* '내 문서' 클릭 = 문서함 열기 (2026-08-03 — 왼쪽 '서버 맵
              불러오기' 메뉴를 로그인 시 숨기는 대신 여기가 통로.
              구 '제품팀'은 초기 시안의 하드코딩이라 제거) */}
          <button
            data-testid="crumb-docs"
            title="내 문서(문서함) 열기"
            onClick={() => useEditorUiStore.getState().setBrowserOpen(true)}
            style={{
              fontSize: 11, color: t.textSubtle, fontWeight: 500,
              background: 'none', border: 'none', padding: 0,
              cursor: 'pointer', textAlign: 'left',
            }}
          >
            내 문서
          </button>

          <div
            style={{
              fontSize: 14,
              color: t.text,
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              maxWidth: iconOnly ? 120 : compact ? 180 : 260,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {mapTitle}
            <span style={{ opacity: 0.5, display: 'flex' }}>
              <I.ChevronDown size={14} />
            </span>
          </div>
        </div>
      </div>

      <div style={{ width: 1, height: 28, background: t.divider }} />

      <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
        <IconBtn t={t} title="되돌리기 (Ctrl+Z)" disabled={!canUndo} onClick={undo}>
          <I.Undo size={17} />
        </IconBtn>
        {/* 되돌린 단계 표시 — 원본(최신 상태) = 0, 한 번 되돌릴 때마다
            -1, -2, … (다시 실행하면 다시 줄어든다. 새 편집 = 0으로 복귀)
            **클릭하면 지금 상태를 최신(0)으로 확정한다** (2026-08-06) —
            원래는 아무 편집이나 하면 같은 일이 일어나지만, 편집할 것이
            없는데 확정만 하고 싶을 때 방법이 "맵을 닫았다 열기"뿐이었다. */}
        <span
          data-testid="undo-depth"
          role={undoDepth > 0 ? 'button' : undefined}
          onClick={undoDepth > 0 ? commitCurrentAsLatest : undefined}
          title={undoDepth === 0
            ? '되돌린 단계 없음 (최신 상태) · 이 세션 안에서 최대 99단계까지 되돌릴 수 있습니다'
            : `최신 상태에서 ${undoDepth}단계 되돌린 상태`
              + '\n누르면 지금 이 상태를 최신(0)으로 확정합니다 — 다시 실행'
              + `할 ${undoDepth}단계는 버려집니다.`}
          style={{
            minWidth: 22, textAlign: 'center', fontSize: 10.5, fontWeight: 700,
            fontFamily: 'ui-monospace, monospace',
            color: undoDepth > 0 ? t.warning ?? '#D97706' : t.textSubtle,
            userSelect: 'none',
            cursor: undoDepth > 0 ? 'pointer' : 'default',
          }}
        >
          {undoDepth > 0 ? `-${undoDepth}` : '0'}
        </span>
        <IconBtn t={t} title="다시 실행 (Ctrl+Y)" disabled={!canRedo} onClick={redo}>
          <I.Redo size={17} />
        </IconBtn>
      </div>

      <div style={{ flex: 1 }} />

      <div
        data-testid="save-badge"
        data-save-state={saveState}
        // 실패했을 때는 **왜** 실패했는지 마우스를 올려 볼 수 있게 한다
        title={saveState === 'error' || saveState === 'retrying'
          ? (cloudError ?? '서버에 저장하지 못했습니다.')
          // '저장 안 됨'도 이유가 있을 수 있다 — 편집권을 잃어 연결이
          // 끊긴 경우가 그렇다 (2026-08-06 R3)
          : saveState === 'unsaved'
            ? (cloudError ?? '이 문서는 아직 서버에 저장되지 않았습니다 — ☁ 저장을 눌러 주세요.')
            : saveState === 'dirty'
              ? `아직 서버에 올라가지 않은 편집이 ${pendingEdits}개 있습니다.\n`
                + '자동저장 주기(맵 설정 ▸ 저장)와 탭 전환·창 닫기 때 올라갑니다.\n'
                + '그 사이 편집은 이 브라우저에 보관되지만, PC 가 강제 종료되면 서버에는 반영되지 않습니다.'
              // 문구를 줄였을 때는 전문을 툴팁으로 남긴다 (위의 안내가
              // 있는 상태들은 그 안내가 그대로 우선한다)
              : compact ? saveStateInfo.text : undefined}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 12,
          color: saveStateInfo.color,
          fontWeight: 500,
          padding: iconOnly ? '4px 7px' : '4px 10px',
          borderRadius: 6,
          background: t.surfaceAlt,
          whiteSpace: 'nowrap',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: saveStateInfo.dot,
            boxShadow: `0 0 0 3px ${saveStateInfo.dot}22`,
          }}
        />
        {!iconOnly && (compact ? saveStateInfo.short : saveStateInfo.text)}
      </div>

      {/* [협업 UI 숨김 — MVP] 협업자 아바타 스택(지/민/J).
          협업 기능(V2) 개발 시 featureFlags.ts의 COLLAB_PRESENCE_UI를 true로
          바꾸면 다시 표시된다. 코드는 삭제하지 않고 보존. */}
      {COLLAB_PRESENCE_UI && (
        <>
          <CollabAvatars t={t} collabs={collabs} />

          <div style={{ width: 1, height: 28, background: t.divider }} />
        </>
      )}

      {/* 진짜 접속자 자리 — 공개판에서는 아무것도 그리지 않는다.
          위의 가짜 아바타(샘플 데이터)와 달리 **실제로 붙어 있는 사람**만
          그린다. 둘을 한 화면에 함께 켜지 않는다. */}
      <ProPresenceBar t={t} />

      <button
        onClick={() => setInspectorTab('ai')}
        title="AI에게 질문하고 답변을 그대로 맵으로 변환합니다"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '7px 12px',
          borderRadius: 8,
          background: `linear-gradient(135deg, ${t.primary}, ${t.primaryHover})`,
          color: '#fff',
          border: 'none',
          cursor: 'pointer',
          fontSize: 13,
          fontWeight: 600,
          whiteSpace: 'nowrap',
          flexShrink: 0,
          boxShadow: `0 1px 2px ${t.primary}60, 0 0 0 1px ${t.primary}80`,
        }}
      >
        <I.Sparkles size={15} />{!iconOnly && ' AI 생성'}
      </button>

      {/* **눌리는데 아무 일도 없는 버튼은 고장으로 보인다** (2026-08-18).
          예전에는 onClick 이 없어 정말 아무 일도 일어나지 않았다. 이제
          공유 대화상자를 연다 — 공개판에서는 그 대화상자가 "왜 못 쓰는지"를
          서버가 준 문장 그대로 말한다(가짜 빨간 점을 지운 것과 같은 이유). */}
      <button
        data-testid="map-share"
        onClick={() => setShareOpen(true)}
        disabled={!shareMapId}
        title={shareMapId
          ? '이 맵을 다른 사람과 함께 편집합니다'
          : '먼저 맵을 저장해야 공유할 수 있습니다'}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '7px 12px',
          borderRadius: 8,
          background: t.surfaceAlt,
          color: shareMapId ? t.text : t.textSubtle,
          border: `1px solid ${t.border}`,
          cursor: shareMapId ? 'pointer' : 'not-allowed',
          fontSize: 13,
          fontWeight: 500,
          whiteSpace: 'nowrap',
          flexShrink: 0,
        }}
      >
        <I.Share size={15} />{!iconOnly && ' 공유'}
      </button>
      {shareOpen && (
        <ProShareDialog t={t} mapId={shareMapId} onClose={() => setShareOpen(false)} />
      )}

      {/* 퍼블리싱(무료) — 위의 [공유]와 **다른 일**이라 버튼을 나눴다.
          [공유]는 사람을 불러 **함께 편집**하는 것이고(참가자·권한),
          [퍼블리싱]은 링크를 가진 누구나 **로그인 없이 읽는** 것이다.
          하나의 버튼에 넣으면 "공유했다"가 둘 중 무엇인지 알 수 없다. */}
      <button
        data-testid="map-publish"
        onClick={() => setPublishOpen(true)}
        disabled={!publishMapId}
        title={publishMapId
          ? '퍼블리싱 — 링크를 가진 사람이 로그인 없이 읽습니다 (완성본만, 읽기 전용)'
          : '먼저 맵을 저장해야 퍼블리싱할 수 있습니다'}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '7px 12px',
          borderRadius: 8,
          background: t.surfaceAlt,
          color: publishMapId ? t.text : t.textSubtle,
          border: `1px solid ${t.border}`,
          cursor: publishMapId ? 'pointer' : 'not-allowed',
          fontSize: 13,
          fontWeight: 500,
          whiteSpace: 'nowrap',
          flexShrink: 0,
        }}
      >
        <I.Globe size={15} />{!iconOnly && ' 퍼블리싱'}
      </button>
      {publishOpen && publishMapId && (
        <PublishPanel
          t={t}
          mapId={publishMapId}
          mapTitle={mapTitle}
          flash={flash}
          onClose={() => setPublishOpen(false)}
        />
      )}

      {/* 아웃라인 모드 / 맵 모드 전환 — 다크 토글과 같은 방식. 편집
          영역 전체를 아웃라인 전용/맵 전용으로 바꾼다. 분할 보기가
          켜져 있으면 비활성(분할이 이미 아웃라인+맵이므로). */}
      <button
        title={outlineSplit
          ? '분할 보기 중에는 사용할 수 없습니다 (분할 닫은 뒤 전환)'
          : mainView === 'outline' ? '맵 모드로 전환' : '아웃라인 모드로 전환 (편집 영역 전체)'}
        data-testid="mainview-toggle"
        disabled={outlineSplit}
        onClick={() => !outlineSplit && toggleMainView()}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 34, height: 32, borderRadius: 8,
          background: mainView === 'outline' && !outlineSplit ? t.primarySoft : t.surfaceAlt,
          color: outlineSplit ? t.textSubtle : (mainView === 'outline' ? t.primary : t.text),
          border: `1px solid ${outlineSplit ? t.border : (mainView === 'outline' ? t.primaryBorder + '55' : t.border)}`,
          cursor: outlineSplit ? 'default' : 'pointer',
        }}
      >
        {mainView === 'outline' && !outlineSplit
          ? <I.MindMap size={17} />
          : <I.Outline size={17} />}
      </button>

      {/* 다크 모드 토글 — 라이트/다크 테마 전환 (브라우저에 저장) */}
      <button
        title={themeName === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환'}
        data-testid="theme-toggle"
        onClick={() => setThemeName(themeName === 'dark' ? 'light' : 'dark')}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 34, height: 32, borderRadius: 8,
          background: t.surfaceAlt, color: t.text,
          border: `1px solid ${t.border}`, cursor: 'pointer', fontSize: 15,
        }}
      >
        {themeName === 'dark' ? '☀' : '🌙'}
      </button>

      {/* 현재 맵 — 저장(히스토리 버전 남김) · 맵 닫기(저장 후 닫기).
          여는 것은 좌측 '새 맵 > ☁ 서버 맵 불러오기'로 일원화됐다. */}
      <MapActions t={t} flash={flash} iconOnly={iconOnly} />

      {/* 내보내기 메뉴 — 하위 항목: HTML 파일 / MD 파일. 두 형식 모두
          맵 메타데이터를 내장해 '새 맵 > 불러오기'로 편집 가능하게
          복원되고, 사진·첨부가 있으면 ZIP(파일 + files/)으로 내려간다. */}
      <div ref={exportRef} style={{ position: 'relative' }}>
        <button
          title="내보내기"
          onClick={() => setExportOpen((v) => !v)}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            height: 32, padding: '0 10px', borderRadius: 7,
            border: `1px solid ${exportOpen ? t.primaryBorder : t.border}`,
            background: exportOpen ? t.primarySoft : t.surface,
            color: exportOpen ? t.primary : t.text,
            cursor: 'pointer', fontSize: 12, fontWeight: 600,
            whiteSpace: 'nowrap', flexShrink: 0,
          }}
        >
          <I.Download size={15} />{!iconOnly && ' 내보내기 '}
          <span style={{ fontSize: 8 }}>▼</span>
        </button>
        {exportOpen && (
          <div
            data-testid="export-menu"
            style={{
              position: 'absolute', top: 38, right: 0, zIndex: 40,
              minWidth: 250, background: t.surface,
              border: `1px solid ${t.border}`, borderRadius: 9,
              boxShadow: '0 8px 24px rgba(80,60,20,0.18)', padding: 5,
            }}
          >
            {([
              {
                label: 'HTML 파일 내보내기',
                desc: '읽기 전용 뷰어 · 다시 불러오기 가능',
                title: '내보내기 (HTML — 읽기 전용 뷰어 + 다시 불러오기 가능)',
                run: async () => {
                  // 뷰어는 지금 에디터 모드(라이트/다크) 그대로 열린다
                  const pkg = await downloadMapAsHtml(
                    map, layoutType, { x: spacingX, y: spacingY }, themeName === 'dark');
                  // 원본을 가져오지 못한 첨부가 있으면 묵묵히 넘어가지
                  // 않는다 (2026-08-02: 저장 후 다시 연 맵의 blob: 첨부가
                  // 소리 없이 빠져 "ZIP이 안 나온다" 보고로 이어졌다)
                  if (pkg.external > 0) {
                    flash(pkg.packaged === 0
                      ? `첨부 ${pkg.external}개의 원본을 찾을 수 없어 HTML만 내보냈습니다. 파일을 다시 첨부한 뒤 내보내면 ZIP에 포함됩니다.`
                      : `첨부 ${pkg.external}개는 원본을 찾을 수 없어 ZIP에서 제외했습니다. 다시 첨부한 뒤 내보내면 포함됩니다.`);
                  }
                },
              },
              {
                label: 'MD 파일 내보내기',
                desc: '일반 에디터에서 수정 · 다시 불러오기 가능',
                title: '내보내기 (Markdown — 일반 에디터에서 수정 + 다시 불러오기 가능)',
                run: async () => {
                  const pkg = await downloadMapAsMarkdown(map, layoutType, { x: spacingX, y: spacingY });
                  if (pkg.external > 0) {
                    flash(`첨부 ${pkg.external}개는 원본을 찾을 수 없어 제외했습니다. 다시 첨부한 뒤 내보내면 포함됩니다.`);
                  }
                },
              },
            ] as const).map((item) => (
              <button
                key={item.label}
                title={item.title}
                onClick={() => { setExportOpen(false); void item.run(); }}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: '8px 10px', borderRadius: 6, border: 'none',
                  background: 'transparent', cursor: 'pointer', color: t.text,
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.background = t.surfaceAlt;
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.background = 'transparent';
                }}
              >
                <div style={{ fontSize: 12.5, fontWeight: 700 }}>{item.label}</div>
                <div style={{ fontSize: 10.5, color: t.textMuted, marginTop: 1 }}>{item.desc}</div>
              </button>
            ))}
            <div style={{
              fontSize: 9.5, color: t.textSubtle, padding: '6px 10px 4px',
              borderTop: `1px solid ${t.divider}`, marginTop: 4, lineHeight: 1.5,
            }}>
              사진·첨부가 있으면 ZIP(파일 + files/)으로 내려갑니다
            </div>
          </div>
        )}
      </div>

      {/* 계정 메뉴 — 개인 설정·계정 프로필·구독 상태·로그아웃 */}
      <UserMenu t={t} onFlash={flash} />

      {toast && (
        <div
          data-testid="cloud-toast"
          style={{
            position: 'absolute', top: 46, right: 14, zIndex: 80, whiteSpace: 'nowrap',
            background: t.text, color: t.surface, padding: '6px 12px', borderRadius: 8,
            fontSize: 12, boxShadow: '0 6px 18px rgba(0,0,0,0.22)',
            // 안내가 그 아래 버튼(문서함 '새 폴더' 등) 클릭을 막지 않도록
            pointerEvents: 'none',
          }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}