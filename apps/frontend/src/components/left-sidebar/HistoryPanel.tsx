// HistoryPanel — 저장 버전 이력 (B8, 서버 저장 연결 후 실기능).
//
// 되돌리기(Ctrl+Z)와 히스토리는 **별개**다 (2026-07 사용자 결정):
//   · 되돌리기 = 이 편집 세션 안에서만, 최대 99단계 (메모리 내 —
//     새로고침·세션 종료 시 사라짐. 카운터는 두 자리 -99까지)
//   · 히스토리 = **저장할 때마다** 저장일시(날짜·시간)별 버전을 서버에
//     보관 (☁ 저장·맵 닫기 시점 — 자동저장은 남기지 않는다. 스냅샷에
//     이미지가 data URL 로 들어가 용량이 크기 때문)
//   · 특정 시점 복귀는 현재 맵을 덮어쓰지 않고 **새 맵(제목_history_
//     YYMMDD_HHMM)** 으로 만들어 **브라우저 새 탭**에서 연다
//     (2026-08-02 — 지금 보던 맵을 밀어내지 않는다).

import { useCallback, useEffect, useState } from 'react';
import type { ThemeTokens } from '@/components/design-tokens/theme';
import { useCloudStore } from '@/stores/cloudStore';
import { useEditorUiStore } from '@/stores/editorUiStore';
import {
  cloudApi, CloudError,
  type MapVersionItem, type VersionPinInfo, type VersionPrunePreview,
} from '@/services/cloud/apiClient';
import { openMapInNewTab } from '@/services/cloud/mapSession';
import { currentLocale, tr as trNow, useLang, useTr, LANG_LOCALE } from '@/i18n';
import { rich } from '@/i18n/rich';

// 영구보관(별표) — 13a §3 (2026-09-06).
//   · **이름을 붙이는 것이 곧 보관하는 것이다.** 버튼은 하나(☆)이고, 누르면
//     이름 입력창이 그 자리에 뜬다. 기본값은 시각이 든 문구 — 그대로 [보관].
//   · 상한(개설자 요금제)에 닿으면 저장이 아니라 **별표만** 막힌다 — 어느
//     것을 해제하고 대신 보관할지 그 자리에서 고른다(§3.3).
//   · 해제는 경고를 띄운다(§3.4). 보관 기간이 이미 지난 버전이면 다음
//     정리에서 사라진다고 말한다.
//   · "곧 정리되는 버전" 카드(§3.2 ③) — 사용자가 "무엇을 남길까" 를
//     생각하는 유일한 순간. 서버의 정리 미리보기(expiring)로 그린다.

/** 기본 이름 — "2026-09-06 오후 3:25 버전" (지금 언어로 — 서버에 이름으로 남는다) */
function defaultLabel(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  const time = d.toLocaleTimeString(currentLocale(), { hour: 'numeric', minute: '2-digit' });
  return trNow('panel.history.versionLabel', {
    date: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`, time,
  });
}

// 제목_history_YYMMDD_HHMM — 같은 날 여러 번 복원해도 구분되도록 분까지
function historyTitle(base: string, iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  const stamp =
    `${p(d.getFullYear() % 100)}${p(d.getMonth() + 1)}${p(d.getDate())}` +
    `_${p(d.getHours())}${p(d.getMinutes())}`;
  return `${base}_history_${stamp}`;
}

export function HistoryPanel({ t }: { t: ThemeTokens }) {
  const tr = useTr();
  const locale = LANG_LOCALE[useLang()];
  const cloudMapId = useCloudStore((s) => s.cloudMapId);
  const [versions, setVersions] = useState<MapVersionItem[] | null>(null);
  const [pin, setPin] = useState<VersionPinInfo | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busyVer, setBusyVer] = useState<number | null>(null);
  const [msg, setMsg] = useState('');
  // 별표 흐름 — 한 번에 하나만 열린다
  const [naming, setNaming] = useState<{ version: number; label: string; rename: boolean; swap: number | null; full: boolean } | null>(null);
  const [unpinning, setUnpinning] = useState<number | null>(null);
  // 곧 정리되는 버전 (13a §3.2 ③)
  const [preview, setPreview] = useState<VersionPrunePreview | null>(null);
  const [noticeDismissed, setNoticeDismissed] = useState(false);
  const [keep, setKeep] = useState<Set<number>>(new Set());
  const pinTarget = useEditorUiStore((s) => s.historyPinTarget);
  const setPinTarget = useEditorUiStore((s) => s.setHistoryPinTarget);

  const flash = (m: string) => {
    setMsg(m);
    window.setTimeout(() => setMsg((cur) => (cur === m ? '' : cur)), 3000);
  };

  const load = useCallback(async () => {
    if (!cloudMapId) { setVersions(null); return; }
    setErr(null);
    try {
      const { versions: list, pin: info } = await cloudApi.listVersions(cloudMapId);
      setVersions(list);
      setPin(info ?? null);
      // 곧 정리되는 버전 — 칸이 있는 서버에서만 묻는다. 실패해도 목록은 산다.
      if (info?.ready) {
        cloudApi.prunePreview(cloudMapId).then(setPreview).catch(() => setPreview(null));
      } else {
        setPreview(null);
      }
    } catch (e) {
      setVersions([]);
      setErr(e instanceof CloudError ? e.message : trNow('panel.history.loadFailed'));
    }
  }, [cloudMapId]);

  // 저장이 일어나면(lastSavedAt) 목록을 다시 읽는다 — 패널을 열어 둔 채
  // 저장해도 방금 생긴 버전이 곧바로 보인다
  const lastSavedAt = useCloudStore((s) => s.lastSavedAt);
  useEffect(() => { void load(); }, [load, lastSavedAt]);

  // 툴바의 "☆ 이 버전 보관" — 그 버전이 목록에 오면 이름 입력창을 연다.
  // 아직 목록에 없으면(방금 저장, 다시 읽는 중) 기다린다 — 비우지 않는다.
  useEffect(() => {
    if (pinTarget === null || !versions) return;
    const v = versions.find((x) => x.version === pinTarget);
    if (!v) return;
    setPinTarget(null);
    if (!v.pinned) setNaming({ version: v.version, label: defaultLabel(v.createdAt), rename: false, swap: null, full: false });
  }, [pinTarget, versions, setPinTarget]);

  // ── 영구보관 ────────────────────────────────────────────────
  const startPin = (v: MapVersionItem) => {
    setUnpinning(null);
    setNaming({
      version: v.version,
      label: v.pinned ? (v.label ?? defaultLabel(v.createdAt)) : defaultLabel(v.createdAt),
      rename: !!v.pinned, swap: null, full: false,
    });
  };
  const pinned = (versions ?? []).filter((v) => v.pinned);
  const isFull = pin?.limit !== null && pin?.limit !== undefined && pinned.length >= pin.limit;

  const commitPin = async () => {
    if (!cloudMapId || !naming) return;
    setBusyVer(naming.version);
    try {
      // 가득 찼으면(§3.3) 고른 것을 먼저 해제하고 보관한다
      if (!naming.rename && naming.full) {
        if (naming.swap === null) { flash(tr('panel.history.pickUnpin')); return; }
        await cloudApi.unpinVersion(cloudMapId, naming.swap);
      }
      const r = await cloudApi.pinVersion(cloudMapId, naming.version, naming.label.trim() || undefined);
      flash(r.renamed
        ? tr('panel.history.renamed', { label: r.label ?? '' })
        : tr('panel.history.pinned', { label: r.label ?? `v${naming.version}` }));
      setNaming(null);
      // 방금 저장한 버전을 보관했으면 툴바의 링크도 내린다
      if (useCloudStore.getState().lastSavedVersion === naming.version) useCloudStore.getState().setLastSavedVersion(null);
      void load();
    } catch (e) {
      if (e instanceof CloudError && e.status === 409 && !naming.rename) {
        // 상한 — 그 자리에서 교체를 묻는다 (저장이 아니라 별표만 막힌 것)
        setNaming({ ...naming, full: true });
        return;
      }
      flash('⚠ ' + (e instanceof CloudError ? e.message : tr('panel.history.pinFailed')));
    } finally {
      setBusyVer(null);
    }
  };

  const commitUnpin = async (version: number) => {
    if (!cloudMapId) return;
    setBusyVer(version);
    try {
      await cloudApi.unpinVersion(cloudMapId, version);
      setUnpinning(null);
      flash(tr('panel.history.unpinned'));
      void load();
    } catch (e) {
      flash('⚠ ' + (e instanceof CloudError ? e.message : tr('panel.history.unpinFailed')));
    } finally {
      setBusyVer(null);
    }
  };

  /** 보관 기간이 이미 지났나 — 해제 경고에 "다음 정리에서 삭제" 를 붙인다 */
  const pastRetention = (v: MapVersionItem) =>
    pin?.versionDays !== null && pin?.versionDays !== undefined
    && Date.now() - new Date(v.createdAt).getTime() > pin.versionDays * 86_400_000;

  // "곧 정리되는 버전" 카드 — 남길 항목에 별표를 한꺼번에
  const keepChecked = async () => {
    if (!cloudMapId || !preview) return;
    const targets = preview.expiring.filter((e) => keep.has(e.version));
    if (!targets.length) { flash(tr('panel.history.pickKeep')); return; }
    let done = 0;
    for (const e of targets) {
      try {
        await cloudApi.pinVersion(cloudMapId, e.version, defaultLabel(e.createdAt));
        done += 1;
      } catch (err) {
        flash('⚠ ' + (err instanceof CloudError ? err.message : tr('panel.history.pinFailed')));
        break;
      }
    }
    if (done) flash(tr('panel.history.keptN', { n: done }));
    setKeep(new Set());
    void load();
  };

  // 특정 버전 → 새 맵으로 만들어 **브라우저 새 탭**에서 연다.
  // 현재 탭에서 편집하던 맵은 그대로 남는다 (2026-08-02 사용자 결정).
  const restore = async (v: MapVersionItem) => {
    if (!cloudMapId) return;
    setBusyVer(v.version);
    try {
      const snap = await cloudApi.getVersion(cloudMapId, v.version);
      const loadedMap = (snap.doc as { map?: unknown })?.map;
      if (!loadedMap) throw new CloudError(0, tr('panel.history.badFormat'));
      let newTitle = historyTitle(v.title || tr('panel.history.untitledMap'), v.createdAt);
      // 새 맵으로 저장 — 제목만 바꾸고 내용은 그 시점 그대로.
      // 같은 폴더·유형에 만들고(문서함 규칙), 같은 이름이 이미 있으면
      // (같은 분에 두 번 복원) 뒤에 번호를 붙여 다시 시도한다.
      const cloud = useCloudStore.getState();
      let created: { mapId: string };
      try {
        created = await cloudApi.createMap(newTitle, {
          folderId: cloud.cloudFolderId, kind: cloud.cloudKind,
        });
      } catch (e) {
        if (!(e instanceof CloudError) || e.status !== 409) throw e;
        newTitle = `${newTitle}_2`;
        created = await cloudApi.createMap(newTitle, {
          folderId: cloud.cloudFolderId, kind: cloud.cloudKind,
        });
      }
      await cloudApi.saveDocument(
        created.mapId,
        {
          ...(snap.doc as Record<string, unknown>),
          map: { ...(loadedMap as Record<string, unknown>), title: newTitle },
        },
        newTitle,
      );
      const opened = openMapInNewTab(created.mapId);
      flash(opened
        ? tr('panel.history.openedTab', { title: newTitle })
        : tr('panel.history.popupBlocked', { title: newTitle }));
      void load();
    } catch (e) {
      flash('⚠ ' + (e instanceof CloudError ? e.message : tr('panel.history.restoreFailed')));
    } finally {
      setBusyVer(null);
    }
  };

  const label = (v: MapVersionItem) => {
    const d = new Date(v.createdAt);
    return `${d.toLocaleDateString(locale)} ${d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}`;
  };

  // 저장 시점 상세 줄 (2026-08-03 — ThinkWise 편집 이력 참고 요청):
  // 레이아웃 · 총 노드 수 · 문서 크기(내장 첨부 포함) · 서버 첨부 용량.
  // 컬럼 도입 전 버전은 레이아웃·노드 수가 null 이라 있는 것만 보여준다.
  const LAYOUT_KEY: Record<string, string> = {
    'radial-bidirectional': 'panel.history.layout.radialBoth', 'radial-right': 'panel.history.layout.radialRight',
    'tree-right': 'panel.history.layout.treeRight', 'tree-down': 'panel.history.layout.treeDown',
    'hierarchy-right': 'panel.history.layout.hierarchy', 'process-tree-right': 'panel.history.layout.processTree',
    timeline: 'panel.history.layout.timeline', 'timeline-center': 'panel.history.layout.timelineCenter',
    kanban: 'panel.history.layout.kanban', freeform: 'panel.history.layout.freeform',
  };
  const fmtKB = (b: number) =>
    b >= 1024 * 1024 ? `${Math.round(b / 1024 / 1024 * 10) / 10}MB`
      : `${Math.max(1, Math.round(b / 1024))}KB`;
  const detail = (v: MapVersionItem) => {
    const parts: string[] = [];
    if (v.layoutType) parts.push(LAYOUT_KEY[v.layoutType] ? tr(LAYOUT_KEY[v.layoutType]) : v.layoutType);
    if (v.nodeCount !== null && v.nodeCount !== undefined) parts.push(tr('panel.history.nodesN', { n: v.nodeCount }));
    parts.push(tr('panel.history.docSize', { size: fmtKB(v.bytes) }));
    // 첨부 개수 + 총 용량(내장 + 서버) — 2026-08-03 2차.
    // attachCount 도입 전 버전은 용량만(있으면) 표시.
    if (v.attachCount) {
      parts.push(tr('panel.history.attachN', { n: v.attachCount, size: fmtKB(v.attachBytes ?? 0) }));
    } else if (v.attachBytes) {
      parts.push(tr('panel.history.attachSize', { size: fmtKB(v.attachBytes) }));
    }
    return parts.join(' · ');
  };

  // 저장한 자리 (2026-08-09 사용자 요청) — 플랫폼 · 브라우저 · IP.
  // 이 정보 도입 전 버전은 셋 다 null 이라 줄 자체를 그리지 않는다.
  const origin = (v: MapVersionItem) =>
    [v.platform, v.browser, v.ip].filter(Boolean).join(' · ');

  return (
    <div style={{ padding: '12px 12px 16px' }} data-testid="history-panel">
      <div style={{
        fontSize: 11, color: t.textSubtle, marginBottom: 8,
        textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: 600,
      }}>{tr('panel.history.title')}</div>

      {/* 곧 정리되는 버전 (13a §3.2 ③) — 7일 유예 안에 별표로 남길 수 있다 */}
      {preview && preview.expiring.length > 0 && !noticeDismissed && pin?.canPin && (
        <div data-testid="history-prune-notice" style={{
          marginBottom: 10, padding: '9px 10px', borderRadius: 8,
          background: t.surfaceAlt, border: `1px solid ${t.primary}`,
          fontSize: 11.5, color: t.text, lineHeight: 1.6,
        }}>
          <div style={{ fontWeight: 700 }}>{tr('panel.history.pruneTitle')}</div>
          <div style={{ color: t.textMuted, fontSize: 11 }}>
            {rich(tr('panel.history.pruneBody', {
              days: preview.versionDays ?? '',
              n: preview.expiring.length,
              date: new Date(Math.min(...preview.expiring.map((e) => new Date(e.deleteAt).getTime()))).toLocaleDateString(locale),
            }))}
          </div>
          <div style={{ margin: '6px 0' }}>
            {preview.expiring.map((e) => (
              <label key={e.version} data-testid="history-prune-item" style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 11 }}>
                <input type="checkbox" checked={keep.has(e.version)}
                  onChange={(ev) => setKeep((cur) => { const n = new Set(cur); if (ev.target.checked) n.add(e.version); else n.delete(e.version); return n; })} />
                <span>v{e.version} · {label({ createdAt: e.createdAt } as MapVersionItem)}</span>
              </label>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
            <button data-testid="history-prune-dismiss" onClick={() => setNoticeDismissed(true)}
              style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, border: `1px solid ${t.border}`, background: t.surface, color: t.textMuted, cursor: 'pointer' }}>{tr('panel.history.pruneDismiss')}</button>
            <button data-testid="history-prune-keep" onClick={() => void keepChecked()}
              style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, border: 'none', background: t.primary, color: '#fff', cursor: 'pointer', fontWeight: 700 }}>{tr('panel.history.pruneKeep')}</button>
          </div>
        </div>
      )}

      {pin?.ready && pin.limit !== null && versions && versions.length > 0 && (
        <div data-testid="history-pin-count" style={{ fontSize: 10.5, color: t.textSubtle, marginBottom: 6 }}>
          {tr('panel.history.pinCount', { n: pinned.length, limit: pin.limit })}
          {pin.versionDays !== null && tr('panel.history.pinDays', { days: pin.versionDays })}
        </div>
      )}

      {!cloudMapId ? (
        <div
          data-history-placeholder
          style={{
            padding: '10px 12px', borderRadius: 8,
            background: t.surfaceAlt, border: `1px solid ${t.border}`,
            fontSize: 12, color: t.textMuted, lineHeight: 1.65,
          }}
        >
          <b style={{ color: t.text }}>{tr('panel.history.notOnServer')}</b>
          <br />
          {rich(tr('panel.history.notOnServerBody'))}
        </div>
      ) : versions === null ? (
        <div style={{ fontSize: 12, color: t.textSubtle, padding: '8px 2px' }}>{tr('common.loading')}</div>
      ) : versions.length === 0 ? (
        <div
          data-testid="history-empty"
          style={{
            padding: '10px 12px', borderRadius: 8,
            background: t.surfaceAlt, border: `1px solid ${t.border}`,
            fontSize: 12, color: t.textMuted, lineHeight: 1.65,
          }}
        >
          {err ?? rich(tr('panel.history.empty'))}
        </div>
      ) : (
        <div data-testid="history-list">
          {versions.map((v) => (
            <div key={v.version}>
            <div
              data-testid="history-item"
              style={{
                display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5,
                padding: '7px 9px', borderRadius: 8,
                background: t.surfaceAlt, border: `1px solid ${t.border}`,
              }}
            >
              {pin?.ready && (
                // ☆ 보관 · ★ 해제 — 편집 권한이 없으면(읽기만) 표시만 한다
                <button
                  data-testid={v.pinned ? 'history-unpin' : 'history-pin'}
                  disabled={!pin.canPin || busyVer !== null}
                  title={!pin.canPin ? (v.pinned ? tr('panel.history.pinnedVersion') : tr('panel.history.readOnlyNoPin'))
                    : v.pinned ? tr('panel.history.unpinTip') : tr('panel.history.pinTip')}
                  onClick={() => (v.pinned ? (setNaming(null), setUnpinning(v.version)) : startPin(v))}
                  style={{
                    flexShrink: 0, width: 22, height: 22, borderRadius: 6, border: 'none',
                    background: 'transparent', cursor: pin.canPin ? 'pointer' : 'default',
                    color: v.pinned ? '#D97706' : t.textSubtle, fontSize: 15, lineHeight: 1, padding: 0,
                  }}
                >{v.pinned ? '★' : '☆'}</button>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                {v.pinned && (
                  // 붙인 이름 — 개설자 또는 내가 붙인 것이면 눌러서 바꾼다
                  <div data-testid="history-label"
                    title={pin?.isOwner || v.pinnedByMe ? tr('common.rename') : tr('panel.history.pinnedByOther')}
                    onClick={() => { if (pin?.canPin && (pin.isOwner || v.pinnedByMe)) startPin(v); }}
                    style={{
                      fontSize: 11.5, color: '#B45309', fontWeight: 700,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      cursor: pin?.canPin && (pin.isOwner || v.pinnedByMe) ? 'text' : 'default',
                    }}
                  >{v.label || tr('panel.history.pinnedVersion')}</div>
                )}
                <div style={{
                  fontSize: 11.5, color: t.text, fontWeight: v.pinned ? 500 : 600,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {label(v)}
                </div>
                <div style={{
                  fontSize: 10, color: t.textSubtle, marginTop: 1,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  v{v.version} · {v.title || tr('panel.history.untitled')}
                </div>
                <div data-testid="history-detail" style={{
                  fontSize: 10, color: t.textSubtle, marginTop: 1,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {detail(v)}
                </div>
                {origin(v) && (
                  // 패널이 좁아 한 줄에 다 안 들어간다 — 말줄임으로 IP 를
                  // 잘라 먹지 말고 **접어서** 다 보여 준다 (골라 복사도 된다)
                  <div
                    data-testid="history-origin"
                    title={tr('panel.history.originTip', { origin: origin(v) })}
                    style={{
                      fontSize: 10, color: t.textSubtle, marginTop: 1,
                      // break-all 로 하면 IP 한가운데("12 / 7.0.0.1")가
                      // 갈린다 — 칸에 안 들어가는 낱말만 넘긴다
                      whiteSpace: 'normal', overflowWrap: 'break-word', lineHeight: 1.45,
                    }}
                  >
                    🖥 {origin(v)}
                  </div>
                )}
              </div>
              <button
                data-testid="history-restore"
                disabled={busyVer !== null}
                onClick={() => void restore(v)}
                title={tr('panel.history.restoreTip')}
                style={{
                  flexShrink: 0, fontSize: 11, padding: '4px 8px', borderRadius: 6,
                  border: `1px solid ${t.border}`, background: t.surface,
                  color: busyVer === v.version ? t.textSubtle : t.text,
                  cursor: busyVer !== null ? 'default' : 'pointer', fontWeight: 600,
                }}
              >
                {busyVer === v.version ? tr('panel.history.opening') : tr('panel.history.openInTab')}
              </button>
            </div>
            {naming?.version === v.version && (
              // 이름 입력 = 보관 (§3.2 ①). 가득 찼으면 교체할 것을 고른다(§3.3)
              <div data-testid="history-pin-dialog" style={{
                margin: '-2px 0 8px', padding: '8px 10px', borderRadius: 8,
                border: `1px solid ${t.primary}`, background: t.surface, fontSize: 11.5, lineHeight: 1.6,
              }}>
                <div style={{ fontWeight: 700 }}>{naming.rename ? tr('common.rename') : tr('panel.history.pinDialogTitle')}</div>
                <input
                  data-testid="history-pin-label"
                  autoFocus
                  value={naming.label}
                  maxLength={120}
                  onChange={(e) => setNaming({ ...naming, label: e.target.value })}
                  onKeyDown={(e) => { if (e.key === 'Enter') void commitPin(); if (e.key === 'Escape') setNaming(null); }}
                  style={{ width: '100%', boxSizing: 'border-box', margin: '4px 0', padding: '4px 6px', fontSize: 12, borderRadius: 6, border: `1px solid ${t.border}`, background: t.surfaceAlt, color: t.text }}
                />
                {!naming.rename && !naming.full && (
                  <div style={{ color: t.textMuted, fontSize: 11 }}>{tr('panel.history.pinNoPrune')}</div>
                )}
                {naming.full && (
                  <div data-testid="history-pin-full" style={{ color: t.textMuted, fontSize: 11 }}>
                    {rich(tr('panel.history.pinFull', { n: pin?.limit ?? '' }))}
                    <select
                      data-testid="history-pin-swap"
                      value={naming.swap ?? ''}
                      onChange={(e) => setNaming({ ...naming, swap: e.target.value ? Number(e.target.value) : null })}
                      style={{ display: 'block', width: '100%', margin: '4px 0', fontSize: 11.5, padding: 3, borderRadius: 6, border: `1px solid ${t.border}`, background: t.surfaceAlt, color: t.text }}
                    >
                      <option value="">{tr('panel.history.pickUnpinOption')}</option>
                      {pinned.filter((p) => pin?.isOwner || p.pinnedByMe).map((p) => (
                        <option key={p.version} value={p.version}>{p.label || `v${p.version}`} ({label(p)})</option>
                      ))}
                    </select>
                  </div>
                )}
                <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 4 }}>
                  <button data-testid="history-pin-cancel" onClick={() => setNaming(null)}
                    style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, border: `1px solid ${t.border}`, background: t.surface, color: t.textMuted, cursor: 'pointer' }}>{tr('common.cancel')}</button>
                  <button data-testid="history-pin-commit" disabled={busyVer !== null} onClick={() => void commitPin()}
                    style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, border: 'none', background: t.primary, color: '#fff', cursor: 'pointer', fontWeight: 700 }}>
                    {naming.rename ? tr('panel.history.renameBtn') : naming.full ? tr('panel.history.swapPin') : tr('panel.history.pin')}
                  </button>
                </div>
              </div>
            )}
            {unpinning === v.version && (
              // 해제 경고 (§3.4)
              <div data-testid="history-unpin-dialog" style={{
                margin: '-2px 0 8px', padding: '8px 10px', borderRadius: 8,
                border: `1px solid ${t.danger}`, background: t.surface, fontSize: 11.5, lineHeight: 1.6,
              }}>
                {tr('panel.history.unpinWarn')}
                {pastRetention(v) && (
                  <div data-testid="history-unpin-past" style={{ color: t.danger }}>
                    {tr('panel.history.unpinPast', { days: pin?.versionDays ?? '' })}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 4 }}>
                  <button data-testid="history-unpin-cancel" onClick={() => setUnpinning(null)}
                    style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, border: `1px solid ${t.border}`, background: t.surface, color: t.textMuted, cursor: 'pointer' }}>{tr('common.cancel')}</button>
                  <button data-testid="history-unpin-commit" disabled={busyVer !== null} onClick={() => void commitUnpin(v.version)}
                    style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, border: 'none', background: t.danger, color: '#fff', cursor: 'pointer', fontWeight: 700 }}>{tr('panel.history.unpin')}</button>
                </div>
              </div>
            )}
            </div>
          ))}
        </div>
      )}

      {msg && (
        <div data-testid="history-toast" style={{
          marginTop: 8, fontSize: 11, color: t.primary, lineHeight: 1.5,
        }}>{msg}</div>
      )}

      <div style={{
        marginTop: 10, fontSize: 11, color: t.textSubtle, lineHeight: 1.6,
      }}>
        {rich(tr('panel.history.footer'))}
        {pin?.ready && <> {rich(tr('panel.history.footerPin'))}</>}
        {' '}{rich(tr('panel.history.footerUndo'))}
        <br />
        {rich(tr('panel.history.footerOrigin'))}
      </div>
    </div>
  );
}
