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

// 영구보관(별표) — 13a §3 (2026-09-06).
//   · **이름을 붙이는 것이 곧 보관하는 것이다.** 버튼은 하나(☆)이고, 누르면
//     이름 입력창이 그 자리에 뜬다. 기본값은 시각이 든 문구 — 그대로 [보관].
//   · 상한(개설자 요금제)에 닿으면 저장이 아니라 **별표만** 막힌다 — 어느
//     것을 해제하고 대신 보관할지 그 자리에서 고른다(§3.3).
//   · 해제는 경고를 띄운다(§3.4). 보관 기간이 이미 지난 버전이면 다음
//     정리에서 사라진다고 말한다.
//   · "곧 정리되는 버전" 카드(§3.2 ③) — 사용자가 "무엇을 남길까" 를
//     생각하는 유일한 순간. 서버의 정리 미리보기(expiring)로 그린다.

/** 기본 이름 — "2026-09-06 오후 3:25 버전" */
function defaultLabel(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  const time = d.toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' });
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${time} 버전`;
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
      setErr(e instanceof CloudError ? e.message : '이력을 불러오지 못했습니다.');
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
        if (naming.swap === null) { flash('해제할 버전을 골라 주세요.'); return; }
        await cloudApi.unpinVersion(cloudMapId, naming.swap);
      }
      const r = await cloudApi.pinVersion(cloudMapId, naming.version, naming.label.trim() || undefined);
      flash(r.renamed ? `이름을 '${r.label}' 로 바꿨습니다.` : `★ '${r.label ?? `v${naming.version}`}' 로 보관했습니다 — 정리되지 않습니다.`);
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
      flash('⚠ ' + (e instanceof CloudError ? e.message : '보관하지 못했습니다.'));
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
      flash('보관을 해제했습니다 — 이제 자동 정리 대상입니다.');
      void load();
    } catch (e) {
      flash('⚠ ' + (e instanceof CloudError ? e.message : '해제하지 못했습니다.'));
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
    if (!targets.length) { flash('남길 버전을 골라 주세요.'); return; }
    let done = 0;
    for (const e of targets) {
      try {
        await cloudApi.pinVersion(cloudMapId, e.version, defaultLabel(e.createdAt));
        done += 1;
      } catch (err) {
        flash('⚠ ' + (err instanceof CloudError ? err.message : '보관하지 못했습니다.'));
        break;
      }
    }
    if (done) flash(`★ ${done}개를 보관했습니다 — 정리되지 않습니다.`);
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
      if (!loadedMap) throw new CloudError(0, '문서 형식을 인식할 수 없습니다.');
      let newTitle = historyTitle(v.title || '맵', v.createdAt);
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
        ? `↗ '${newTitle}'을(를) 새 탭에서 열었습니다.`
        : `'${newTitle}'로 저장했습니다 — 팝업이 차단되어 새 탭은 열지 못했습니다. ` +
          '새 맵 > ☁ 서버 맵 불러오기에서 열어 주세요.');
      void load();
    } catch (e) {
      flash('⚠ ' + (e instanceof CloudError ? e.message : '복원에 실패했습니다.'));
    } finally {
      setBusyVer(null);
    }
  };

  const label = (v: MapVersionItem) => {
    const d = new Date(v.createdAt);
    return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  };

  // 저장 시점 상세 줄 (2026-08-03 — ThinkWise 편집 이력 참고 요청):
  // 레이아웃 · 총 노드 수 · 문서 크기(내장 첨부 포함) · 서버 첨부 용량.
  // 컬럼 도입 전 버전은 레이아웃·노드 수가 null 이라 있는 것만 보여준다.
  const LAYOUT_KO: Record<string, string> = {
    'radial-bidirectional': '방사형 · 양쪽', 'radial-right': '방사형 · 오른쪽',
    'tree-right': '트리 · 오른쪽', 'tree-down': '트리 · 아래',
    'hierarchy-right': '계층형', 'process-tree-right': '진행트리',
    timeline: '시간배치', 'timeline-center': '시간배치·중앙',
    kanban: 'Kanban', freeform: '자유 배치',
  };
  const fmtKB = (b: number) =>
    b >= 1024 * 1024 ? `${Math.round(b / 1024 / 1024 * 10) / 10}MB`
      : `${Math.max(1, Math.round(b / 1024))}KB`;
  const detail = (v: MapVersionItem) => {
    const parts: string[] = [];
    if (v.layoutType) parts.push(LAYOUT_KO[v.layoutType] ?? v.layoutType);
    if (v.nodeCount !== null && v.nodeCount !== undefined) parts.push(`${v.nodeCount}노드`);
    parts.push(`문서 ${fmtKB(v.bytes)}`);
    // 첨부 개수 + 총 용량(내장 + 서버) — 2026-08-03 2차.
    // attachCount 도입 전 버전은 용량만(있으면) 표시.
    if (v.attachCount) {
      parts.push(`첨부 ${v.attachCount}개 · ${fmtKB(v.attachBytes ?? 0)}`);
    } else if (v.attachBytes) {
      parts.push(`첨부 ${fmtKB(v.attachBytes)}`);
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
      }}>저장 버전 이력</div>

      {/* 곧 정리되는 버전 (13a §3.2 ③) — 7일 유예 안에 별표로 남길 수 있다 */}
      {preview && preview.expiring.length > 0 && !noticeDismissed && pin?.canPin && (
        <div data-testid="history-prune-notice" style={{
          marginBottom: 10, padding: '9px 10px', borderRadius: 8,
          background: t.surfaceAlt, border: `1px solid ${t.primary}`,
          fontSize: 11.5, color: t.text, lineHeight: 1.6,
        }}>
          <div style={{ fontWeight: 700 }}>곧 정리되는 버전이 있습니다</div>
          <div style={{ color: t.textMuted, fontSize: 11 }}>
            보관 기간 {preview.versionDays}일이 지난 버전 <b>{preview.expiring.length}개</b>가
            {' '}{new Date(Math.min(...preview.expiring.map((e) => new Date(e.deleteAt).getTime()))).toLocaleDateString()}부터 정리됩니다.
            남길 것에 표시하고 [남길 항목 보관]을 누르세요.
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
              style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, border: `1px solid ${t.border}`, background: t.surface, color: t.textMuted, cursor: 'pointer' }}>그냥 정리</button>
            <button data-testid="history-prune-keep" onClick={() => void keepChecked()}
              style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, border: 'none', background: t.primary, color: '#fff', cursor: 'pointer', fontWeight: 700 }}>남길 항목 보관</button>
          </div>
        </div>
      )}

      {pin?.ready && pin.limit !== null && versions && versions.length > 0 && (
        <div data-testid="history-pin-count" style={{ fontSize: 10.5, color: t.textSubtle, marginBottom: 6 }}>
          ★ 보관 {pinned.length} / {pin.limit}
          {pin.versionDays !== null && <> · 자동 버전은 {pin.versionDays}일 보관</>}
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
          <b style={{ color: t.text }}>이 맵은 아직 서버에 없습니다.</b>
          <br />
          상단 <b>☁ 저장</b>을 하면, 그때부터 <b>저장할 때마다</b> 이 자리에
          저장일시별 버전이 쌓입니다.
        </div>
      ) : versions === null ? (
        <div style={{ fontSize: 12, color: t.textSubtle, padding: '8px 2px' }}>불러오는 중…</div>
      ) : versions.length === 0 ? (
        <div
          data-testid="history-empty"
          style={{
            padding: '10px 12px', borderRadius: 8,
            background: t.surfaceAlt, border: `1px solid ${t.border}`,
            fontSize: 12, color: t.textMuted, lineHeight: 1.65,
          }}
        >
          {err ?? (
            <>아직 저장 버전이 없습니다. <b>☁ 저장</b> 또는 <b>맵 닫기</b>를
            하면 그 시점이 버전으로 남습니다.</>
          )}
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
                  title={!pin.canPin ? (v.pinned ? '보관된 버전' : '읽기만 권한으로는 보관할 수 없습니다')
                    : v.pinned ? '보관 해제' : '이 버전을 이름 붙여 영구보관합니다 — 정리되지 않습니다'}
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
                    title={pin?.isOwner || v.pinnedByMe ? '이름 바꾸기' : '다른 사람이 보관한 버전'}
                    onClick={() => { if (pin?.canPin && (pin.isOwner || v.pinnedByMe)) startPin(v); }}
                    style={{
                      fontSize: 11.5, color: '#B45309', fontWeight: 700,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      cursor: pin?.canPin && (pin.isOwner || v.pinnedByMe) ? 'text' : 'default',
                    }}
                  >{v.label || '보관된 버전'}</div>
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
                  v{v.version} · {v.title || '(제목 없음)'}
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
                    title={`이 버전을 저장한 기기·브라우저·IP — ${origin(v)}`}
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
                title="이 시점 내용을 새 맵으로 만들어 브라우저 새 탭에서 엽니다 (지금 편집 중인 맵은 그대로 둡니다)"
                style={{
                  flexShrink: 0, fontSize: 11, padding: '4px 8px', borderRadius: 6,
                  border: `1px solid ${t.border}`, background: t.surface,
                  color: busyVer === v.version ? t.textSubtle : t.text,
                  cursor: busyVer !== null ? 'default' : 'pointer', fontWeight: 600,
                }}
              >
                {busyVer === v.version ? '여는 중…' : '새 탭으로'}
              </button>
            </div>
            {naming?.version === v.version && (
              // 이름 입력 = 보관 (§3.2 ①). 가득 찼으면 교체할 것을 고른다(§3.3)
              <div data-testid="history-pin-dialog" style={{
                margin: '-2px 0 8px', padding: '8px 10px', borderRadius: 8,
                border: `1px solid ${t.primary}`, background: t.surface, fontSize: 11.5, lineHeight: 1.6,
              }}>
                <div style={{ fontWeight: 700 }}>{naming.rename ? '이름 바꾸기' : '이 버전을 보관합니다'}</div>
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
                  <div style={{ color: t.textMuted, fontSize: 11 }}>보관한 버전은 정리되지 않습니다.</div>
                )}
                {naming.full && (
                  <div data-testid="history-pin-full" style={{ color: t.textMuted, fontSize: 11 }}>
                    보관 버전이 <b>{pin?.limit}개</b>로 가득 찼습니다. 하나를 해제하고 이 버전을 보관하시겠습니까?
                    <select
                      data-testid="history-pin-swap"
                      value={naming.swap ?? ''}
                      onChange={(e) => setNaming({ ...naming, swap: e.target.value ? Number(e.target.value) : null })}
                      style={{ display: 'block', width: '100%', margin: '4px 0', fontSize: 11.5, padding: 3, borderRadius: 6, border: `1px solid ${t.border}`, background: t.surfaceAlt, color: t.text }}
                    >
                      <option value="">해제할 버전 고르기…</option>
                      {pinned.filter((p) => pin?.isOwner || p.pinnedByMe).map((p) => (
                        <option key={p.version} value={p.version}>{p.label || `v${p.version}`} ({label(p)})</option>
                      ))}
                    </select>
                  </div>
                )}
                <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 4 }}>
                  <button data-testid="history-pin-cancel" onClick={() => setNaming(null)}
                    style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, border: `1px solid ${t.border}`, background: t.surface, color: t.textMuted, cursor: 'pointer' }}>취소</button>
                  <button data-testid="history-pin-commit" disabled={busyVer !== null} onClick={() => void commitPin()}
                    style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, border: 'none', background: t.primary, color: '#fff', cursor: 'pointer', fontWeight: 700 }}>
                    {naming.rename ? '바꾸기' : naming.full ? '교체하여 보관' : '보관'}
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
                보관을 해제하면 이 버전은 자동 정리 대상이 됩니다.
                {pastRetention(v) && (
                  <div data-testid="history-unpin-past" style={{ color: t.danger }}>
                    보관 기간({pin?.versionDays}일)이 이미 지난 버전이므로 다음 정리에서 삭제됩니다.
                  </div>
                )}
                <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 4 }}>
                  <button data-testid="history-unpin-cancel" onClick={() => setUnpinning(null)}
                    style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, border: `1px solid ${t.border}`, background: t.surface, color: t.textMuted, cursor: 'pointer' }}>취소</button>
                  <button data-testid="history-unpin-commit" disabled={busyVer !== null} onClick={() => void commitUnpin(v.version)}
                    style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, border: 'none', background: t.danger, color: '#fff', cursor: 'pointer', fontWeight: 700 }}>해제</button>
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
        버전은 <b>☁ 저장·맵 닫기</b> 시점마다 쌓입니다(자동저장은 제외).
        {pin?.ready && <> 오래된 자동 버전은 정리되지만 <b>☆ 로 이름을 붙인 버전은 남습니다.</b></>}
        지금 편집 중인 내용을 되돌리려면 <b>되돌리기(Ctrl+Z)</b>를 쓰세요 —
        이 세션 안에서 최대 <b>99단계</b>입니다.
        <br />
        🖥 줄은 <b>그 버전을 저장한 기기·브라우저·IP</b>입니다 — 내 계정의
        맵 이력에만 남고 다른 사람에게는 보이지 않습니다.
      </div>
    </div>
  );
}
