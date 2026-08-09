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
import { cloudApi, CloudError, type MapVersionItem } from '@/services/cloud/apiClient';
import { openMapInNewTab } from '@/services/cloud/mapSession';

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
        <br />
        🖥 줄은 <b>그 버전을 저장한 기기·브라우저·IP</b>입니다 — 내 계정의
        맵 이력에만 남고 다른 사람에게는 보이지 않습니다.
      </div>
    </div>
  );
}
