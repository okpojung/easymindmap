// HistoryPanel — 저장 버전 이력 (B8, 서버 저장 연결 후 실기능).
//
// 되돌리기(Ctrl+Z)와 히스토리는 **별개**다 (2026-07 사용자 결정):
//   · 되돌리기 = 이 편집 세션 안에서만, 최대 99단계 (메모리 내 —
//     새로고침·세션 종료 시 사라짐. 카운터는 두 자리 -99까지)
//   · 히스토리 = **저장할 때마다** 저장일시(날짜·시간)별 버전을 서버에
//     보관 (☁ 저장·맵 닫기 시점 — 자동저장은 남기지 않는다. 스냅샷에
//     이미지가 data URL 로 들어가 용량이 크기 때문)
//   · 특정 시점 복귀는 현재 맵을 덮어쓰지 않고
//     **새 맵(제목_history_YYMMDD_HHMM)** 으로 연다.

import { useCallback, useEffect, useState } from 'react';
import type { ThemeTokens } from '@/components/design-tokens/theme';
import { useDocumentStore } from '@/stores/documentStore';
import { useCloudStore } from '@/stores/cloudStore';
import { useAutosaveStore } from '@/stores/autosaveStore';
import { suppressCloudAutosave } from '@/hooks/useCloudAutosave';
import { cloudApi, CloudError, type MapVersionItem } from '@/services/cloud/apiClient';

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
  const [err, setErr] = useState<string | null>(null);
  const [busyVer, setBusyVer] = useState<number | null>(null);
  const [msg, setMsg] = useState('');

  const flash = (m: string) => {
    setMsg(m);
    window.setTimeout(() => setMsg((cur) => (cur === m ? '' : cur)), 3000);
  };

  const load = useCallback(async () => {
    if (!cloudMapId) { setVersions(null); return; }
    setErr(null);
    try {
      const { versions: list } = await cloudApi.listVersions(cloudMapId);
      setVersions(list);
    } catch (e) {
      setVersions([]);
      setErr(e instanceof CloudError ? e.message : '이력을 불러오지 못했습니다.');
    }
  }, [cloudMapId]);

  useEffect(() => { void load(); }, [load]);

  // 특정 버전 → 새 맵으로 열기 (현재 맵은 그대로 둔다)
  const restore = async (v: MapVersionItem) => {
    if (!cloudMapId) return;
    setBusyVer(v.version);
    try {
      const snap = await cloudApi.getVersion(cloudMapId, v.version);
      const loadedMap = (snap.doc as { map?: unknown })?.map;
      if (!loadedMap) throw new CloudError(0, '문서 형식을 인식할 수 없습니다.');
      const newTitle = historyTitle(v.title || '맵', v.createdAt);
      // 새 맵으로 저장 → 그 맵을 연다 (현재 맵 덮어쓰기 없음)
      const created = await cloudApi.createMap(newTitle);
      await cloudApi.saveDocument(created.mapId, snap.doc, newTitle);
      suppressCloudAutosave();
      useDocumentStore.getState().loadMap({
        ...(loadedMap as Record<string, unknown>), title: newTitle,
      } as never);
      useCloudStore.getState().link(created.mapId, new Date().toISOString());
      useAutosaveStore.getState().setSaveState('saved');
      flash(`'${newTitle}' 새 맵으로 열었습니다.`);
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

  return (
    <div style={{ padding: '12px 12px 16px' }} data-testid="history-panel">
      <div style={{
        fontSize: 11, color: t.textSubtle, marginBottom: 8,
        textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: 600,
      }}>저장 버전 이력</div>

      {!cloudMapId ? (
        <div
          data-history-placeholder
          style={{
            padding: '10px 12px', borderRadius: 8,
            background: t.surfaceAlt, border: `1px solid ${t.border}`,
            fontSize: 12, color: t.textMuted, lineHeight: 1.65,
          }}
        >
          <b style={{ color: t.text }}>이 맵은 아직 클라우드에 없습니다.</b>
          <br />
          ☁ 클라우드 → 저장을 하면, 그때부터 <b>저장할 때마다</b> 이 자리에
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
            <div
              key={v.version}
              data-testid="history-item"
              style={{
                display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5,
                padding: '7px 9px', borderRadius: 8,
                background: t.surfaceAlt, border: `1px solid ${t.border}`,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 11.5, color: t.text, fontWeight: 600,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {label(v)}
                </div>
                <div style={{
                  fontSize: 10, color: t.textSubtle, marginTop: 1,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  v{v.version} · {v.title || '(제목 없음)'} · {Math.max(1, Math.round(v.bytes / 1024))}KB
                </div>
              </div>
              <button
                data-testid="history-restore"
                disabled={busyVer !== null}
                onClick={() => void restore(v)}
                title="이 시점 내용을 새 맵으로 엽니다 (현재 맵은 그대로 둡니다)"
                style={{
                  flexShrink: 0, fontSize: 11, padding: '4px 8px', borderRadius: 6,
                  border: `1px solid ${t.border}`, background: t.surface,
                  color: busyVer === v.version ? t.textSubtle : t.text,
                  cursor: busyVer !== null ? 'default' : 'pointer', fontWeight: 600,
                }}
              >
                {busyVer === v.version ? '여는 중…' : '새 맵으로'}
              </button>
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
        지금 편집 중인 내용을 되돌리려면 <b>되돌리기(Ctrl+Z)</b>를 쓰세요 —
        이 세션 안에서 최대 <b>99단계</b>입니다.
      </div>
    </div>
  );
}
