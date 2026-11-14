import { useEffect, useRef, useState } from 'react';
import type { ThemeTokens } from '@/components/design-tokens/theme';
import type { Collaborator } from '@/editor/__samples__/types';
import { I } from '@/components/icons';
import { TooltipButton, TooltipIconBtn as IconBtn } from './Tooltip';
import { MapActions } from './MapActions';
import { mobileSaveDot, mobileToolbarSize } from './toolbar-layout';
import { UserMenu } from './UserMenu';
import { ProShareDialog } from '@pro';
import { PublishPanel } from '@/components/cloud/PublishPanel';
import { useDocumentStore } from '@/stores/documentStore';
import { useEditorUiStore } from '@/stores/editorUiStore';
import { withHtmlAssetExport } from '@/components/ui/htmlAssetExportDialog';
import { downloadMapAsMarkdown } from '@/export/exportMarkdown';
import { useCloudStore } from '@/stores/cloudStore';
import { useAutosaveStore } from '@/stores/autosaveStore';
import { useLang, useTr } from '@/i18n';
import { HelpDrawer, isHelpShortcut } from '@/components/help/HelpDrawer';
import toolbarCopy from './toolbar-copy.json';
import { useCoarse, usePhoneLayout } from '@/hooks/useViewport';
import { MenuItem } from './OverflowMenu';
import { openGantt } from '@/editor/gantt/GanttDock';
import { authEnabled, useAuthStore } from '@/stores/authStore';

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

/**
 * 편집 화면의 상단 막대. **문서함이 열려 있을 때는 그리지 않는다** —
 * EditorPage 가 DocsToolbar 로 바꿔 단다 (2026-09-07). 여기 있는 것은
 * 전부 "열린 맵" 에 대한 일이다.
 */
export function TopToolbar({
  t,
  collabs: _collabs,
  mapTitle,
  saveState: rawSaveState = 'saved',
}: Props) {
  const tr = useTr();
  const lang = useLang();
  const copy = toolbarCopy[lang] ?? toolbarCopy.en;
  const [helpOpen, setHelpOpen] = useState(false);
  useEffect(() => {
    const onHelp = (event: KeyboardEvent) => {
      if (!isHelpShortcut(event)) return;
      event.preventDefault();
      setHelpOpen(true);
    };
    window.addEventListener('keydown', onHelp);
    return () => window.removeEventListener('keydown', onHelp);
  }, []);
  const [closeSlot, setCloseSlot] = useState<HTMLDivElement | null>(null);
  const [saveSlot, setSaveSlot] = useState<HTMLDivElement | null>(null);
  const [distributionSlot, setDistributionSlot] = useState<HTMLDivElement | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [distributionOpen, setDistributionOpen] = useState(false);
  const saveRef = useRef<HTMLDivElement>(null);
  const distributionRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (document.querySelector('dialog[open], [role="dialog"][aria-modal="true"]')) return;
      if (!saveRef.current?.contains(event.target as Node)) setSaveOpen(false);
      if (!distributionRef.current?.contains(event.target as Node)) setDistributionOpen(false);
    };
    const esc = (event: KeyboardEvent) => { if (event.key === 'Escape') { setSaveOpen(false); setDistributionOpen(false); } };
    window.addEventListener('pointerdown', outside); window.addEventListener('keydown', esc);
    return () => { window.removeEventListener('pointerdown', outside); window.removeEventListener('keydown', esc); };
  }, []);
  const map = useDocumentStore((s) => s.map);
  const layoutType = useEditorUiStore((s) => s.layoutType);
  const themeName = useEditorUiStore((s) => s.themeName);
  const mainView = useEditorUiStore((s) => s.mainView);
  const outlineSplit = useEditorUiStore((s) => s.outlineSplit);
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
  const savedText = (() => {
    if (!lastSavedAt) return tr('shell.toolbar.saved');
    const min = Math.floor((Date.now() - lastSavedAt) / 60_000);
    return min < 1 ? tr('shell.toolbar.savedJustNow') : tr('shell.toolbar.savedMinAgo', { n: min });
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
  // A fresh local map has no persisted server copy, even before its first edit.
  const saveState = collabDriving ? 'collab'
    : rawSaveState === 'saved' && !shareMapId && !readOnly?.mapId ? 'unsaved'
    : rawSaveState;

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
  const phoneLayout = usePhoneLayout();
  const coarse = useCoarse();
  const phone = phoneLayout || (coarse && barW < 960);
  useEffect(() => {
    const closeMenus = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setGanttOpen(false); setExportOpen(false);
    };
    window.addEventListener('keydown', closeMenus);
    return () => window.removeEventListener('keydown', closeMenus);
  }, []);
  // 간트 메뉴 (2026-11-07) — 아래에 열기 · 새 탭 · 새 창
  const [ganttOpen, setGanttOpen] = useState(false);
  const ganttRef = useRef<HTMLDivElement | null>(null);
  const ganttDock = useEditorUiStore((s) => s.ganttDock);
  useEffect(() => {
    if (!ganttOpen) return;
    const off = (e: MouseEvent) => { if (!ganttRef.current?.contains(e.target as Node)) setGanttOpen(false); };
    document.addEventListener('mousedown', off);
    return () => document.removeEventListener('mousedown', off);
  }, [ganttOpen]);
  const openDocs = () => useEditorUiStore.getState().setBrowserOpen(true);

  // 내보내기 — 데스크톱과 모바일에서 같은 메뉴 동작을 쓴다
  const runExportHtml = async () => {
    await withHtmlAssetExport({ map,
      view: { layoutType, spacing: { x: spacingX, y: spacingY }, dark: themeName === 'dark' },
      protected: false,
    });
  };
  const runExportEncryptedHtml = async () => {
    await withHtmlAssetExport({ map,
      view: { layoutType, spacing: { x: spacingX, y: spacingY }, dark: themeName === 'dark' },
      protected: true,
    });
  };
  const runExportMd = async () => {
    const pkg = await downloadMapAsMarkdown(map, layoutType, { x: spacingX, y: spacingY });
    if (pkg.external > 0) {
      flash(tr('shell.toolbar.exportMdSkipped', { n: pkg.external }));
    }
  };

  const guestMode = useAuthStore((s) => s.guest && !s.session) && authEnabled;
  const saveStateInfo = ({
    saved: { text: savedText, short: tr('shell.toolbar.saved'), color: t.textMuted, dot: t.success },
    saving: { text: tr('common.saving'), short: tr('shell.toolbar.savingShort'), color: t.accent, dot: t.accent },
    dirty: {
      text: tr('shell.toolbar.dirty', { n: pendingEdits }),
      short: tr('shell.toolbar.dirtyShort', { n: pendingEdits }),
      color: t.warning, dot: t.warning,
    },
    // **'저장 안 됨'은 오해를 샀다** (2026-09-02). unsaved 는 실패가
    // 아니라 "이 문서가 아직 서버에 없다"는 **정상 초기 상태**다(아래
    // 툴팁이 처음부터 그렇게 적고 있었다). 새 맵을 만들자마자 경고색
    // 문구가 뜨니 사용자는 뭔가 실패한 줄 알았다 — 사실형 문구에
    // 중립색으로 바꾼다. error·retrying 은 진짜 문제라 경고색 그대로다.
    // Guest 체험은 저장할 곳이 없다 — '저장을 눌러' 라고 권하지 않는다 (2026-10-22)
    unsaved: {
      text: guestMode ? tr('shell.toolbar.guestUnsaved') : tr('shell.toolbar.unsaved'),
      short: guestMode ? tr('shell.toolbar.guestUnsavedShort') : tr('shell.toolbar.unsavedShort'),
      color: t.textMuted, dot: t.textMuted,
    },
    retrying: { text: tr('shell.toolbar.retrying'), short: tr('shell.toolbar.retryingShort'), color: t.warning, dot: t.warning },
    error: { text: tr('shell.toolbar.error'), short: tr('shell.toolbar.errorShort'), color: t.danger, dot: t.danger },
    // 협업이 몰고 있다 — 통째 저장 대신 **글자 단위로 서버에 합쳐진다**.
    // '저장됨' 이라고 쓰지 않는 이유: 배지는 저장 방식이 달라졌다는
    // 사실까지 말해야 한다(잠시 뒤 반영되는 것과 이미 반영된 것은 다르다).
    collab: { text: copy.collab, short: copy.collab, color: t.textMuted, dot: t.success },
  } as const)[saveState];
  // 저장 배지의 설명 — 실패했을 때는 **왜** 실패했는지 보여 준다 (2026-08-05).
  // 데스크톱은 마우스를 올려(title), 폰은 저장 옵션 메뉴 맨 위에 글로 보여 준다.
  const saveStateTip = saveState === 'error' || saveState === 'retrying'
    ? (cloudError ?? tr('shell.toolbar.saveFailedTip'))
    // '저장 안 됨'도 이유가 있을 수 있다 — 편집권을 잃어 연결이
    // 끊긴 경우가 그렇다 (2026-08-06 R3)
    : saveState === 'unsaved'
      ? (cloudError ?? tr('shell.toolbar.unsavedTip'))
      : saveState === 'dirty'
        ? tr('shell.toolbar.dirtyTip', { n: pendingEdits })
        : undefined;

  const shareDialog = shareOpen && (
    <ProShareDialog t={t} mapId={shareMapId} onClose={() => setShareOpen(false)} />
  );
  const publishDialog = publishOpen && publishMapId && (
    <PublishPanel
      t={t}
      mapId={publishMapId}
      mapTitle={mapTitle}
      flash={flash}
      onClose={() => setPublishOpen(false)}
    />
  );
  const toastEl = toast && (
    <div
      data-testid="cloud-toast"
      style={{
        position: 'absolute', top: 'calc(46px + env(safe-area-inset-top, 0px))',
        right: phone ? 8 : 14, zIndex: 80,
        // 긴 안내가 폰 화면 밖으로 나가지 않게 — 넓은 화면은 예전처럼 한 줄
        maxWidth: 'calc(100vw - 16px)', whiteSpace: phone ? 'normal' : 'nowrap',
        background: t.text, color: t.surface, padding: '6px 12px', borderRadius: 8,
        fontSize: 12, lineHeight: 1.45, boxShadow: '0 6px 18px rgba(0,0,0,0.22)',
        // 안내가 그 아래 버튼(문서함 '새 폴더' 등) 클릭을 막지 않도록
        pointerEvents: 'none',
      }}
    >
      {toast}
    </div>
  );
  const size = phone ? mobileToolbarSize(Math.min(barW, typeof window === 'undefined' ? barW : window.innerWidth)) : coarse ? 42 : 38;
  const groupStyle = { display: 'flex', alignItems: 'center', gap: phone ? 0 : 2, flexShrink: 0, padding: phone ? 0 : '3px 5px', border: phone ? 'none' : '1px solid ' + t.border, borderRadius: phone ? 0 : 9, background: phone ? 'transparent' : t.surfaceAlt } as const;
  const menuStyle = { position: 'absolute', top: 'calc(100% + 4px)', right: 0, zIndex: 60, width: 270, maxWidth: 'calc(100vw - 16px)', maxHeight: '70vh', overflowY: 'auto', padding: 6, borderRadius: 10, border: '1px solid ' + t.border, background: t.surface, boxShadow: '0 8px 24px #0003' } as const;
  const buttonStyle = { width: size, height: phone ? 40 : size, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2, border: 'none', borderRadius: 7, background: 'transparent', color: t.text, cursor: 'pointer' } as const;
  const closeMenus = () => { setExportOpen(false); setGanttOpen(false); setSaveOpen(false); setDistributionOpen(false); };
  const selectView = (view: 'map' | 'split' | 'outline' | 'gantt') => {
    const ui = useEditorUiStore.getState();
    if (view === 'gantt') openGantt('dock', () => flash(tr('editor.gantt.popupBlocked')));
    else { ui.setGanttDock(false); ui.setOutlineSplit(view === 'split'); ui.setMainView(view === 'outline' ? 'outline' : 'map'); }
    closeMenus();
  };
  const oppositeView = mainView === 'outline' && !outlineSplit ? 'map' : 'outline';
  return (
    <div ref={barRef} data-testid="top-toolbar" data-layout={phone ? 'phone' : 'desktop'}
      style={{ position: 'relative', zIndex: 20, flexShrink: 0, background: t.surface, borderBottom: '1px solid ' + t.border,
        padding: 'calc(env(safe-area-inset-top, 0px) + 4px) max(6px, env(safe-area-inset-right, 0px)) 4px max(6px, env(safe-area-inset-left, 0px))',
        display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: phone ? 2 : 8, minHeight: 56 }}>
      <button data-testid="map-title" title={tr('shell.toolbar.crumbTitle')} onClick={openDocs}
        style={{ display: 'flex', alignItems: 'center', gap: 6, flex: phone || barW < 1100 ? '1 0 100%' : '1 1 100px', minWidth: 0,
          padding: '5px 4px', background: 'none', border: 'none', color: t.text, cursor: 'pointer', textAlign: 'left' }}>
        <I.Logo size={26} /><span style={{ overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', fontWeight: 600 }}>{mapTitle}</span><I.ChevronDown size={14} />
      </button>
      <div data-testid="toolbar-actions" style={{ display: phone ? 'flex' : 'contents', flexWrap: 'nowrap', alignItems: 'center', justifyContent: 'space-between', gap: 2, width: '100%', minWidth: 0 }}>
      <div role="group" aria-label={copy.document} data-toolbar-group="document" style={{ ...groupStyle, maxWidth: '100%', boxSizing: 'border-box', flexWrap: phone ? 'nowrap' : 'wrap' }}>
        <IconBtn t={t} compactSize={phone ? size : undefined} testId="toolbar-undo" title={tr('shell.toolbar.undo')} disabled={!canUndo || !!readOnly} onClick={undo}><I.Undo size={22} /></IconBtn>
        <output data-testid="undo-depth" aria-label={tr('shell.toolbar.undoDepth', { n: undoDepth })} title={tr('shell.toolbar.undoDepth', { n: undoDepth })}
          style={{ minWidth: phone ? 20 : 22, width: phone ? 20 : undefined, textAlign: 'center', fontSize: phone ? 11 : 14, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: undoDepth ? t.primary : t.textMuted }}>{phone && undoDepth > 99 ? '99+' : undoDepth}</output>
        <IconBtn t={t} compactSize={phone ? size : undefined} testId="toolbar-redo" title={tr('shell.toolbar.redo')} disabled={!canRedo || !!readOnly} onClick={redo}><I.Redo size={22} /></IconBtn>
        <MapActions t={t} flash={flash} phone iconOnly compactSize={phone ? size : undefined} saveMenuSlot={saveSlot} distributionSlot={distributionSlot} closeSlot={closeSlot}
          onMenuPick={closeMenus} stateDot={phone ? mobileSaveDot(saveState, guestMode || !!readOnly?.viewer) : saveStateInfo.dot} saveStatus={saveStateInfo.short} saveTip={guestMode ? saveStateInfo.text : saveStateTip ?? saveStateInfo.text} saveState={saveState} />
        <div ref={saveRef} style={{ position: phone ? 'static' : 'relative' }}>
          <TooltipButton data-testid="save-options-toggle" title={copy.saveOptions} aria-expanded={saveOpen} aria-haspopup="menu"
            onClick={() => { const next = !saveOpen; closeMenus(); setSaveOpen(next); }} style={{ ...buttonStyle, background: saveOpen ? t.primarySoft : 'transparent' }}>
            <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M5 3h12l3 3v13H5zM8 3v6h8V3M8 19v-6h9M2 7v15h14" /></svg>{!phone && <I.ChevronDown size={10} />}
          </TooltipButton>
          <div data-testid="save-options-menu" role="menu" aria-label={copy.saveOptions} style={{ ...menuStyle, display: saveOpen ? 'block' : 'none', ...(phone ? { left: 8, right: 'auto' } : {}) }}><div ref={setSaveSlot} />
            {undoDepth > 0 && <MenuItem t={t} testId="undo-depth-reset" label={tr('shell.toolbar.undoDepth', { n: undoDepth })} onClick={() => { commitCurrentAsLatest(); closeMenus(); }} />}
          </div>
        </div>
        <div ref={exportRef} style={{ position: phone ? 'static' : 'relative' }}>
          <TooltipButton title={tr('shell.toolbar.export')} aria-expanded={exportOpen} aria-haspopup="menu" data-testid="export-toggle"
            onClick={() => { const next = !exportOpen; closeMenus(); setExportOpen(next); }} style={buttonStyle}><I.Download size={22} />{!phone && <I.ChevronDown size={10} />}</TooltipButton>
          {exportOpen && <div data-testid="export-menu" role="menu" style={{ ...menuStyle, ...(phone ? { left: 8, right: 'auto' } : {}) }}>
            <MenuItem t={t} label={tr('shell.toolbar.exportHtml')} desc={tr('shell.toolbar.exportHtmlDesc')} onClick={() => { closeMenus(); void runExportHtml(); }} />
            <MenuItem t={t} label={tr('io.encrypted.export')} desc={tr('io.encrypted.desc')} onClick={() => { closeMenus(); void runExportEncryptedHtml(); }} />
            <MenuItem t={t} label={tr('shell.toolbar.exportMd')} desc={tr('shell.toolbar.exportMdDesc')} onClick={() => { closeMenus(); void runExportMd(); }} />
            <div style={{ fontSize: 11, padding: 8, color: t.textMuted }}>{tr('shell.toolbar.exportZipNote')}</div>
          </div>}
        </div>
      </div>
      <div role="group" aria-label={copy.view} data-toolbar-group="view" style={groupStyle}>
        {!phone && <>
        <TooltipButton data-testid="view-toggle" title={copy[oppositeView]} onClick={() => selectView(oppositeView)} style={buttonStyle}>
          {oppositeView === 'map' ? <I.MindMap size={22} /> : <I.Outline size={22} />}
        </TooltipButton>
        <TooltipButton data-testid="view-split" title={copy.split} aria-pressed={outlineSplit && !ganttDock} onClick={() => selectView(outlineSplit ? 'map' : 'split')}
          style={{ ...buttonStyle, background: outlineSplit && !ganttDock ? t.primarySoft : 'transparent', color: outlineSplit && !ganttDock ? t.primary : t.text }}>
          <svg width="22" height="22" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><rect x="2" y="3" width="16" height="14" rx="2" /><path d="M9 3v14M4.5 7h2M4.5 10h2M4.5 13h2M12 8h3M12 12h3" /></svg>
        </TooltipButton>
        </>}
        <IconBtn t={t} compactSize={phone ? size : undefined} testId="theme-toggle" title={tr(themeName === 'dark' ? 'shell.toolbar.toLight' : 'shell.toolbar.toDark')} onClick={() => setThemeName(themeName === 'dark' ? 'light' : 'dark')}>
          {themeName === 'dark' ? <I.Sun size={22} /> : <I.Moon size={22} />}</IconBtn>
      </div>
      <div ref={ganttRef} role="group" aria-label={copy.gantt} data-toolbar-group="gantt" style={{ ...groupStyle, position: phone ? 'static' : 'relative' }}>
        {!phone && <TooltipButton data-testid="view-gantt" title={copy.gantt} aria-pressed={ganttDock} onClick={() => ganttDock ? selectView('map') : selectView('gantt')} style={{ ...buttonStyle, background: ganttDock ? t.primarySoft : 'transparent', color: ganttDock ? t.primary : t.text }}><I.Gantt size={22} /></TooltipButton>}
        <TooltipButton data-testid="gantt-toggle" title={phone ? copy.gantt : copy.gantt + ' · ' + copy.more} aria-haspopup="menu" aria-expanded={ganttOpen} onClick={() => { const next = !ganttOpen; closeMenus(); setGanttOpen(next); }} style={{ ...buttonStyle, width: phone ? size : 22, background: phone && ganttDock ? t.primarySoft : 'transparent' }}>{phone ? <I.Gantt size={22} /> : <I.ChevronDown size={14} />}</TooltipButton>
        {ganttOpen && <div data-testid="gantt-menu" role="menu" style={{ ...menuStyle, ...(phone ? { right: 8 } : { left: 0, right: 'auto' }) }}>
          <MenuItem t={t} testId="gantt-open-dock" icon={<I.Gantt size={20} />} label={phone && ganttDock ? copy.map : tr('editor.gantt.dock')} onClick={() => selectView(phone && ganttDock ? 'map' : 'gantt')} />
          <MenuItem t={t} testId="gantt-open-tab" label={tr('editor.gantt.newTab')} onClick={() => { closeMenus(); openGantt('tab', () => flash(tr('editor.gantt.popupBlocked'))); }} />
          <MenuItem t={t} testId="gantt-open-window" label={tr('editor.gantt.newWindow')} onClick={() => { closeMenus(); openGantt('window', () => flash(tr('editor.gantt.popupBlocked'))); }} />
        </div>}
      </div>
      <div ref={distributionRef} role="group" aria-label={copy.distribution} data-toolbar-group="distribution" style={{ ...groupStyle, position: phone ? 'static' : 'relative' }}>
        <TooltipButton data-testid="distribution-toggle" title={copy.distribution} aria-expanded={distributionOpen} aria-haspopup="menu" onClick={() => { const next = !distributionOpen; closeMenus(); setDistributionOpen(next); }} style={buttonStyle}><I.Share size={22} />{!phone && <I.ChevronDown size={10} />}</TooltipButton>
        <div data-testid="distribution-menu" role="menu" aria-label={copy.distribution} style={{ ...menuStyle, display: distributionOpen ? 'block' : 'none' }}>
          <MenuItem t={t} testId="map-share" icon={<I.Share size={20} />} label={tr('shell.toolbar.share')} disabled={!shareMapId} onClick={() => { closeMenus(); setShareOpen(true); }} />
          <MenuItem t={t} testId="map-publish" icon={<I.Globe size={20} />} label={tr('shell.toolbar.publish')} disabled={!publishMapId} onClick={() => { closeMenus(); setPublishOpen(true); }} />
          <div ref={setDistributionSlot} />
        </div>
      </div>
      <div role="group" aria-label={copy.other} data-toolbar-group="other" style={{ ...groupStyle, marginLeft: phone ? 0 : 'auto' }}>
        <IconBtn t={t} compactSize={phone ? size : undefined} testId="toolbar-help" title={copy.help + ' (?)'} onClick={() => { closeMenus(); setHelpOpen(true); }}><span aria-hidden="true" style={{ width: 22, height: 22, border: '1.8px solid currentColor', borderRadius: '50%', fontSize: 16, fontWeight: 700 }}>?</span></IconBtn>
        <div ref={setCloseSlot} style={{ display: 'flex' }} /><UserMenu t={t} onFlash={flash} compactSize={phone ? size : undefined} />
      </div>
      </div>
      {shareDialog}{publishDialog}{toastEl}
      {helpOpen && <HelpDrawer open={helpOpen} t={t} onClose={() => setHelpOpen(false)} />}
    </div>
  );
}
