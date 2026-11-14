// MapActions — 상단 툴바의 "현재 맵" 동작: 저장 · 맵 닫기.
//
// 저장 규칙 (2026-08-02 사용자 확정)
//   · 이미 서버에 있는 맵  → 묻지 않고 **열었던 그 이름 그대로** 덮어쓴다
//   · 아직 저장한 적 없는 맵 → **폴더·이름·유형을 묻는다**(SaveMapDialog).
//     같은 폴더에 같은 이름이 있으면 서버가 막고, 대화상자가 안내한다.
//
// 닫기 규칙
//   · 저장된 맵   → 마지막 내용을 저장한 뒤 닫는다(저장 실패 시 닫지 않음)
//   · 미저장 맵   → **"저장되지 않았습니다" 경고** 후 사용자가 고른다
//     (저장하고 닫기 / 저장 없이 닫기 / 취소)
// 닫은 뒤에는 편집 영역에 문서함(MapBrowser)을 연다.

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ThemeTokens } from '@/components/design-tokens/theme';
import { I } from '@/components/icons';
import { useCloudStore } from '@/stores/cloudStore';
import { newMapTitle, useDocumentStore } from '@/stores/documentStore';
import { useEditorUiStore } from '@/stores/editorUiStore';
import { useCloudAutosave } from '@/hooks/useCloudAutosave';
import { useLocalDraft, clearLocalDraft } from '@/hooks/useLocalDraft';
import { CloudError } from '@/services/cloud/apiClient';
import { SaveMapDialog } from '@/components/cloud/SaveMapDialog';
import {
  clearCurrentMap, isCurrentMapEmpty, isUnsavedMap, needLogin,
  saveAndCloseMap, saveCurrentMap,
} from '@/services/cloud/mapSession';
import { authEnabled, useAuthStore } from '@/stores/authStore';
import { ProCollabSession, ProDashboardLive, ProDashboardToggle } from '@pro';
import { DialogXButton } from '@/components/ui/DialogFrame';
import { LANG_LOCALE, useLang, useTr } from '@/i18n';
import { useCoarse } from '@/hooks/useViewport';
import { useAutosaveStore } from '@/stores/autosaveStore';
import { MenuItem, MenuSep } from './OverflowMenu';
import { openGuestMap } from '@/services/guestMap';
import { titleFromCenter } from '@/utils/centerTitle';
import toolbarCopy from './toolbar-copy.json';
import { TooltipButton } from './Tooltip';

/** 저장 대화상자를 띄운 이유 — 저장만인지, 닫기까지 이어갈지 */
type SaveIntent = null | 'save' | 'close' | 'saveAs';

export function MapActions(
  // iconOnly — 툴바가 좁아지면 라벨을 숨기고 아이콘만 남긴다.
  // **버튼 자체는 없애지 않는다**. 이름은 title 로 그대로 남는다.
  //
  // phone — 폰 상단 막대 (모바일 웹 2026-10-05). 막대에는 저장 단추(상태 점이
  //   붙은 아이콘)만 남기고, 나머지(보관·다른 이름으로 저장·맵 닫기·읽기 전용
  //   안내·대시보드 전환)는 `menuSlot` 이 가리키는 "⋯" 메뉴 안에 그린다.
  //   **이 컴포넌트는 메뉴가 닫혀도 계속 살아 있다** — 자동저장 훅과 저장
  //   대화상자가 여기 있기 때문이다. 그래서 메뉴 안에는 포털로 항목만 넣는다.
  { t, flash, iconOnly = false, phone = false, menuSlot = null, onMenuPick, stateDot, closeSlot = null, saveStatus, saveTip, saveState }:
  {
    t: ThemeTokens; flash: (m: string) => void; iconOnly?: boolean;
    phone?: boolean;
    /** "⋯" 메뉴가 열려 있을 때 항목을 넣을 자리 (닫혀 있으면 null) */
    menuSlot?: HTMLElement | null;
    /** 메뉴 항목을 누른 뒤 — 메뉴를 닫는다 */
    onMenuPick?: () => void;
    /** 폰: 저장 단추에 얹을 저장 상태 점 색 */
    stateDot?: string;
    closeSlot?: HTMLElement | null;
    saveStatus?: string;
    saveTip?: string;
    saveState?: string;
  },
) {
  const coarse = useCoarse();
  const collabDriving = useAutosaveStore((s) => s.collabDrivingMapId);
  const tr = useTr();
  const lang = useLang();
  const copy = toolbarCopy[lang] ?? toolbarCopy.en;
  const cloudMapId = useCloudStore((s) => s.cloudMapId);
  // 협업맵인가 — 세션 자리에 그대로 넘긴다(판정은 서버가 내린 kind 다)
  const cloudKind = useCloudStore((s) => s.cloudKind);
  // 읽기 전용으로 연 맵 (단일 세션 편집 잠금 — 2026-08-04)
  const readOnlyInfo = useCloudStore((s) => s.readOnlyInfo);
  const cloudTitle = useCloudStore((s) => s.cloudTitle);
  const lastSavedAt = useCloudStore((s) => s.lastSavedAt);
  const lastSavedVersion = useCloudStore((s) => s.lastSavedVersion);
  const setNavTab = useEditorUiStore((s) => s.setNavTab);
  const setHistoryPinTarget = useEditorUiStore((s) => s.setHistoryPinTarget);
  const busy = useCloudStore((s) => s.busy);
  const mapTitle = useDocumentStore((s) => s.map.title);
  const setBrowserOpen = useEditorUiStore((s) => s.setBrowserOpen);
  // Guest 체험 (2026-10-22 사용자 요청) — 저장·맵 닫기는 끄고 [초기화] 를 준다.
  // 게스트에게는 저장할 곳도, 닫고 돌아갈 문서함도 없다.
  const isGuest = useAuthStore((s) => s.guest && !s.session) && authEnabled;

  const [saveIntent, setSaveIntent] = useState<SaveIntent>(null);
  // 미저장 맵 닫기 경고 (규칙 4)
  const [warnUnsaved, setWarnUnsaved] = useState(false);

  // 문서가 서버 맵에 연결돼 있으면 편집 후 자동 저장(디바운스)
  useCloudAutosave();
  // 편집을 1초마다 브라우저(IndexedDB)에도 적어 둔다 — 크래시·오프라인
  // 으로 서버에 못 간 편집을 다음 실행에서 되살리기 위해 (감사 R1·R2)
  useLocalDraft();

  const savedHint = lastSavedAt
    ? tr('shell.mapActions.savedAt', { time: new Date(lastSavedAt).toLocaleString(LANG_LOCALE[lang]) })
    : tr('shell.mapActions.neverSaved');

  const handleSave = async (keepVersion = false) => {
    if (busy !== 'idle' || readOnlyInfo?.viewer || collabDriving) return;
    // 열려 있는 맵이 없으면 저장할 것도 없다 (맵 닫기와 같은 안내 —
    // 2026-08-02 사용자 보고: 빈 상태에서 저장 대화상자가 떴다)
    if (isCurrentMapEmpty()) { flash(tr('shell.mapActions.noMap')); return; }
    // Guest 체험 (2026-08-04) — 서버 저장 없음, 내보내기로 안내
    if (authEnabled && useAuthStore.getState().guest) {
      flash(tr('shell.mapActions.guestSave'));
      return;
    }
    if (needLogin()) { flash(tr('shell.mapActions.needLogin')); return; }
    if (isUnsavedMap()) { setSaveIntent('save'); return; } // 폴더·이름 묻기
    try {
      const r = await saveCurrentMap({ keepVersion });
      flash(r.unchanged
        ? tr('shell.mapActions.unchanged', { title: cloudTitle ?? mapTitle })
        : keepVersion ? tr('shell.mapActions.savedKeep', { title: cloudTitle ?? mapTitle }) : tr('shell.mapActions.savedNew', { title: cloudTitle ?? mapTitle }));
    } catch (err) {
      const m = err instanceof CloudError ? err.message : tr('shell.mapActions.saveError');
      useCloudStore.getState().setError(m);
      flash('⚠ ' + m);
    }
  };

  // Keep one listener across blur-triggered renders. Read the latest callback
  // after the editor commits its draft, never the pre-blur map closure.
  const shortcutState = useRef({ save: handleSave, blocked: false });
  shortcutState.current = {
    save: handleSave,
    blocked: isGuest || !!readOnlyInfo?.viewer || !!collabDriving || !!saveIntent || warnUnsaved,
  };
  useEffect(() => {
    let disposed = false;
    let pendingSave: ReturnType<typeof setTimeout> | undefined;
    const hasModal = () => !!document.querySelector('dialog[open], [role="dialog"][aria-modal="true"]');
    const blockedNow = () => {
      const cloud = useCloudStore.getState();
      const auth = useAuthStore.getState();
      return shortcutState.current.blocked || cloud.busy !== 'idle' || !!cloud.readOnlyInfo?.viewer
        || !!useAutosaveStore.getState().collabDrivingMapId || (authEnabled && auth.guest) || hasModal();
    };
    const onSaveKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.key.toLowerCase() !== 's' || event.defaultPrevented) return;
      event.preventDefault();
      if (event.isComposing || event.keyCode === 229 || event.repeat || pendingSave !== undefined || blockedNow()) return;
      const epoch = useDocumentStore.getState().docEpoch;
      const mapId = useCloudStore.getState().cloudMapId;
      // Inline editors commit synchronously in onBlur.
      const active = document.activeElement;
      if (active instanceof HTMLElement && (active.matches('input, textarea, [role="textbox"]') || active.isContentEditable)) active.blur();
      if (disposed) return;
      // React's blur updates finish before this task; coalesce repeated presses.
      pendingSave = setTimeout(() => {
        pendingSave = undefined;
        if (disposed || blockedNow() || useDocumentStore.getState().docEpoch !== epoch
          || useCloudStore.getState().cloudMapId !== mapId) return;
        void shortcutState.current.save();
      }, 0);
    };
    window.addEventListener('keydown', onSaveKey);
    return () => {
      disposed = true;
      clearTimeout(pendingSave);
      window.removeEventListener('keydown', onSaveKey);
    };
  }, []);

  const handleClose = async () => {
    // 읽기 전용으로 보던 맵은 저장 없이 닫힌다 — 안내 문구 구분
    const wasReadOnly = !!useCloudStore.getState().readOnlyInfo;
    const r = await saveAndCloseMap(flash);
    if (r === 'unsaved') { setWarnUnsaved(true); return; }
    // **닫을 맵이 없으면 문서함으로 간다** (2026-09-04 사용자 보고).
    // 예전에는 "열려 있는 맵이 없습니다" 만 띄우고 끝이라, `?map=` 탭에서
    // 열기에 실패한 사용자는 '문서 없음' 화면에 갇혔다 — 닫기 버튼이
    // 유일하게 눈에 띄는 출구인데 아무 데도 데려가지 않았다.
    if (r === 'empty') { setBrowserOpen(true); return; }
    if (r !== 'closed') return;
    flash(wasReadOnly ? tr('shell.mapActions.closedReadOnly') : tr('shell.mapActions.closedSaved'));
    setBrowserOpen(true);
  };

  const handleGuestReset = () => {
    if (!window.confirm(tr('shell.mapActions.guestResetConfirm'))) return;
    void openGuestMap({ reset: true }).then(() => flash(tr('shell.mapActions.guestResetDone')));
  };
  const guestOff = { opacity: 0.45, cursor: 'not-allowed' } as const;

  const btn = {
    display: 'flex', alignItems: 'center', gap: 5,
    height: 32, padding: '0 10px', borderRadius: 8,
    cursor: busy === 'idle' ? 'pointer' : 'default',
    fontSize: 12.5, fontWeight: 600,
    whiteSpace: 'nowrap', flexShrink: 0,
  } as const;

  const pick = (fn: () => void) => () => { onMenuPick?.(); fn(); };
  const canDashboard = !!(cloudMapId || readOnlyInfo?.dashboard) && !readOnlyInfo?.viewer;
  const dialogs = (
    <>
      {/* 미저장 맵 닫기 경고 (규칙 4) */}
      {warnUnsaved && (
        <UnsavedWarning
          t={t}
          mapTitle={mapTitle}
          onCancel={() => setWarnUnsaved(false)}
          onSaveClose={() => { setWarnUnsaved(false); setSaveIntent('close'); }}
          onCloseAnyway={() => {
            setWarnUnsaved(false);
            // **버리기로 한 문서의 로컬 초안도 버린다** (2026-08-07).
            // 안 지우면 다음에 앱을 열 때 "저장되지 않은 맵이
            // 있습니다 — 복구할까요?" 가 계속 뜬다 — 방금 사용자가
            // "저장하지 않는다"고 답한 그 문서를 두고 묻는 셈이다.
            void clearLocalDraft(useCloudStore.getState().cloudMapId);
            clearCurrentMap();
            flash(tr('shell.mapActions.closedWithoutSave'));
            setBrowserOpen(true);
          }}
        />
      )}

      {/* 첫 저장 — 폴더·이름·유형 (규칙 3) */}
      {saveIntent && (
        <SaveMapDialog
          t={t}
          defaultTitle={saveIntent === 'saveAs'
            ? tr('shell.mapActions.copyTitle', { title: cloudTitle ?? mapTitle })
            // '새 맵' 비교는 문서에 들어 있는 기본 제목(데이터)이라 번역하지 않는다.
            // 기본 제목 그대로면 **첫 중심주제**를 이름으로 제안한다 (2026-10-26 사용자 요청)
            : mapTitle && mapTitle !== '새 맵' && mapTitle !== tr('shell.mapActions.newMapTitle') && mapTitle !== newMapTitle() ? mapTitle
              : titleFromCenter(useDocumentStore.getState().map.root?.text) ?? tr('shell.mapActions.newMapTitle')}
          note={saveIntent === 'close'
            ? tr('shell.mapActions.noteClose')
            : saveIntent === 'saveAs'
              ? tr('shell.mapActions.noteSaveAs', { title: cloudTitle ?? mapTitle })
              : undefined}
          onCancel={() => setSaveIntent(null)}
          onSaved={({ title }) => {
            const intent = saveIntent;
            setSaveIntent(null);
            flash(tr('shell.mapActions.savedNew', { title }));
            if (intent === 'close') {
              clearCurrentMap();
              setBrowserOpen(true);
            }
          }}
        />
      )}
    </>
  );

  const size = coarse ? 40 : 32;
    const menu = menuSlot && createPortal(
      <>
        {saveTip && <div role="status" style={{ padding: '7px 10px', fontSize: 12, lineHeight: 1.5, color: t.textMuted }}>{saveTip}</div>}
        {readOnlyInfo && (
          <div
            data-testid="readonly-badge"
            style={{
              margin: '2px 4px 6px', padding: '7px 10px', borderRadius: 7,
              background: '#FEF3C7', border: '1px solid #F59E0B',
              color: '#92400E', fontSize: 12, fontWeight: 700, lineHeight: 1.45,
            }}
          >
            {tr('shell.mapActions.readOnlyBadge', { reason: readOnlyInfo.reason ?? tr('shell.mapActions.readOnlyShort') })}
            <div style={{ fontWeight: 500, marginTop: 3 }}>{tr('shell.mapActions.readOnlyHint')}</div>
          </div>
        )}
        {canDashboard && (
          <div style={{ padding: '2px 6px' }}>
            <ProDashboardToggle
              t={t}
              map={{
                mapId: (cloudMapId ?? readOnlyInfo?.mapId) as string,
                title: cloudTitle ?? mapTitle,
                kind: cloudMapId ? cloudKind : readOnlyInfo?.kind,
                viewMode: readOnlyInfo?.dashboard ? 'dashboard' : 'edit',
                publishId: null,
              }}
              compact={false}
            />
          </div>
        )}
        {cloudMapId && !readOnlyInfo && !collabDriving && !isGuest && (
          <MenuItem t={t} testId="map-save-version" icon={<I.Cloud size={15} />}
            label={copy.saveVersion} disabled={busy !== 'idle'}
            onClick={pick(() => void handleSave(true))} />
        )}
        {cloudMapId && lastSavedVersion !== null && !readOnlyInfo && (
          <MenuItem
            t={t} testId="map-pin-last" icon="☆"
            label={tr('shell.mapActions.pin')}
            desc={`v${lastSavedVersion}`}
            title={tr('shell.mapActions.pinTitle', { v: lastSavedVersion })}
            onClick={pick(() => { setHistoryPinTarget(lastSavedVersion); setNavTab('history'); })}
          />
        )}
        {cloudMapId && !readOnlyInfo?.viewer && (
          <MenuItem
            t={t} testId="map-save-as" icon={<I.Copy size={15} />}
            label={tr('shell.m.saveAs')}
            title={tr('shell.mapActions.saveAsTitle')}
            disabled={busy !== 'idle'}
            onClick={pick(() => setSaveIntent('saveAs'))}
          />
        )}
        {isGuest && (
          <MenuItem
            t={t} testId="map-guest-reset" icon="↺"
            label={tr('shell.mapActions.guestReset')}
            title={tr('shell.mapActions.guestResetTitle')}
            onClick={pick(handleGuestReset)}
          />
        )}
        <MenuSep t={t} />
      </>,
      menuSlot,
    );

  const closeButton = <TooltipButton data-testid="map-close" aria-label={tr('shell.mapActions.close')}
    title={tr('shell.mapActions.close')}
    disabled={busy !== 'idle' || isGuest} onClick={() => void handleClose()}
    style={{ ...btn, width: size, height: size, padding: 0, justifyContent: 'center', background: 'transparent', border: 'none', color: t.text, ...(isGuest ? guestOff : {}) }}>
    <I.X size={17} />
  </TooltipButton>;
  const status = <><I.Cloud size={16} /><span style={{ width: 6, height: 6, borderRadius: '50%', background: stateDot ?? t.textMuted, flexShrink: 0 }} /><span>{readOnlyInfo?.viewer ? tr('shell.mapActions.readOnlyShort') : saveStatus ?? tr('common.save')}</span></>;
  return <>
    <ProCollabSession mapId={cloudMapId ?? (readOnlyInfo?.viewer ? readOnlyInfo.mapId : null)} kind={cloudMapId ? cloudKind : readOnlyInfo?.kind} />
    <ProDashboardLive t={t} mapId={readOnlyInfo?.dashboard ? readOnlyInfo.mapId : null} />
    {collabDriving || readOnlyInfo?.viewer ?
      <span data-testid="save-badge" data-save-state={saveState} role="status" title={saveTip ?? readOnlyInfo?.reason}
        style={{ ...btn, cursor: 'default', background: t.surfaceAlt, color: t.textMuted, borderRadius: 20, fontSize: 11 }}>{status}</span> :
      <TooltipButton data-testid="map-save" data-save-state={saveState} aria-label={tr('common.save') + ' · ' + (saveStatus ?? '')}
        title={tr('common.save') + ' (Ctrl/⌘+S)'}
        disabled={busy !== 'idle' || isGuest} onClick={() => void handleSave()}
        style={{ ...btn, height: size, background: t.surfaceAlt, color: t.text, border: '1px solid ' + t.border, borderRadius: 20, fontSize: 11, ...(isGuest ? guestOff : {}) }}>{status}</TooltipButton>}
    {closeSlot ? createPortal(closeButton, closeSlot) : !phone && closeButton}
    {menu}{dialogs}
  </>;
}

/** 미저장 맵 닫기 경고 (규칙 4) — 막대 모양(데스크톱·폰)과 상관없이 같은 대화상자 */
function UnsavedWarning({ t, mapTitle, onCancel, onSaveClose, onCloseAnyway }: {
  t: ThemeTokens; mapTitle: string;
  onCancel: () => void; onSaveClose: () => void; onCloseAnyway: () => void;
}) {
  const tr = useTr();
  const coarse = useCoarse();
  // 손가락 입력이면 단추 높이를 40px 로 — 데스크톱은 예전 크기 그대로
  const h = (desk: number) => (coarse ? 40 : desk);
  return (
    <div
      onClick={onCancel}
      style={{
        position: 'fixed', inset: 0, zIndex: 220, background: 'rgba(0,0,0,0.35)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        data-testid="unsaved-warning"
        role="dialog" aria-modal="true" aria-label={tr('shell.mapActions.unsavedTitle')}
        style={{
          position: 'relative',
          width: 'min(420px, calc(100vw - 24px))', background: t.surface, color: t.text,
          border: `1px solid ${t.border}`, borderRadius: 12, padding: 20,
          boxShadow: '0 16px 48px rgba(0,0,0,0.3)',
        }}
      >
        <DialogXButton t={t} testId="unsaved-warning-x" onClose={onCancel} />
        <div style={{ fontSize: 15.5, fontWeight: 800, marginBottom: 6, paddingRight: 34 }}>
          {tr('shell.mapActions.unsavedTitle')}
        </div>
        <div style={{ fontSize: 12.5, color: t.textMuted, lineHeight: 1.7, marginBottom: 16 }}>
          {tr('shell.mapActions.unsavedBody', { title: mapTitle })}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <button
            data-testid="unsaved-save-close"
            onClick={onSaveClose}
            style={{
              height: h(36), borderRadius: 7, border: 'none', cursor: 'pointer',
              background: t.primary, color: '#fff', fontSize: 13, fontWeight: 700,
            }}
          >{tr('shell.mapActions.saveAndClose')}</button>
          <button
            data-testid="unsaved-close-anyway"
            onClick={onCloseAnyway}
            style={{
              height: h(34), borderRadius: 7, cursor: 'pointer',
              border: `1px solid ${t.border}`, background: t.surfaceAlt,
              color: t.text, fontSize: 12.5, fontWeight: 600,
            }}
          >{tr('shell.mapActions.closeWithoutSave')}</button>
          <button
            data-testid="unsaved-cancel"
            onClick={onCancel}
            style={{
              height: h(32), borderRadius: 7, cursor: 'pointer',
              border: 'none', background: 'transparent',
              color: t.textSubtle, fontSize: 12.5,
            }}
          >{tr('common.cancel')}</button>
        </div>
      </div>
    </div>
  );
}
