// 클라우드 문서 목록 모달 — "서버 맵 불러오기"와 "맵 닫기 후 문서
// 목록"이 같은 UI 를 쓴다 (B7). 목록 로드·열기·이름변경·삭제까지
// 자족적으로 처리하므로 호출부는 <MapListModal …/> 한 줄이면 된다.
//
// 열기 방식(2026-08-02 사용자 결정): 편집 중인 맵이 있으면 **브라우저 새
// 탭**(`?map=<id>`)으로 연다 — 지금 보던 맵을 밀어내지 않는다. 잃을 것이
// 없을 때(맵 닫기 직후 / 첫 화면 그대로)만 이 탭에 불러온다.
import { useEffect, useState } from 'react';
import type { ThemeTokens } from '@/components/design-tokens/theme';
import { useCloudStore } from '@/stores/cloudStore';
import { useAutosaveStore } from '@/stores/autosaveStore';
import { cloudApi, CloudError, type MapListItem } from '@/services/cloud/apiClient';
import { canReuseThisTab, openMapHere, openMapInNewTab } from '@/services/cloud/mapSession';

export function MapListModal({
  t, title, emptyHint, onClose, onFlash, onOpened, openMode = 'auto',
}: {
  t: ThemeTokens;
  /** 모달 제목 — 열기 진입은 "서버 맵 불러오기", 닫기 후는 "내 문서" */
  title: string;
  /** 목록이 비었을 때 안내 문구 */
  emptyHint: string;
  onClose: () => void;
  onFlash: (msg: string) => void;
  /** 문서를 실제로 열었을 때 (호출부가 패널을 닫는 등) */
  onOpened?: () => void;
  /**
   * 'auto'(기본) = 편집 중이면 새 탭, 잃을 것이 없으면 이 탭 /
   * 'here' = 항상 이 탭 / 'newTab' = 항상 새 탭
   */
  openMode?: 'auto' | 'here' | 'newTab';
}) {
  const [maps, setMaps] = useState<MapListItem[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Esc 로 닫기 (배경 클릭·✕ 와 동일)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    let alive = true;
    useCloudStore.getState().setBusy('opening');
    cloudApi.listMaps()
      .then(({ maps: list }) => { if (alive) setMaps(list); })
      .catch((e) => {
        if (!alive) return;
        setMaps([]);
        setErr(e instanceof CloudError ? e.message : '목록을 불러오지 못했습니다.');
      })
      .finally(() => { useCloudStore.getState().setBusy('idle'); });
    return () => { alive = false; };
  }, []);

  const handleOpen = async (mapId: string) => {
    // 이미 이 탭에서 편집 중인 맵 — 새 탭을 또 열면 두 탭이 같은 맵을
    // 자동저장하며 서로 덮어쓴다. 열지 않고 알린다.
    if (useCloudStore.getState().cloudMapId === mapId) {
      onClose();
      onFlash('이미 이 탭에서 편집 중인 맵입니다.');
      return;
    }
    // 편집 중인 맵을 밀어내지 않도록 — 열려 있으면 새 탭
    const here = openMode === 'here' || (openMode === 'auto' && canReuseThisTab());
    if (!here) {
      const ok = openMapInNewTab(mapId);
      onClose();
      onOpened?.();
      onFlash(ok
        ? '↗ 새 탭에서 열었습니다.'
        : '⚠ 팝업이 차단되어 새 탭을 열지 못했습니다. 브라우저의 팝업 차단을 해제해 주세요.');
      return;
    }
    try {
      await openMapHere(mapId);
      onClose();
      onOpened?.();
      onFlash('☁ 서버에서 불러왔습니다.');
    } catch (e) {
      onFlash('⚠ ' + (e instanceof CloudError ? e.message : '불러오기 중 오류가 발생했습니다.'));
    }
  };

  const handleRename = async (m: MapListItem) => {
    const next = window.prompt('새 이름', m.title || '');
    if (next == null || next.trim() === '' || next.trim() === m.title) return;
    try {
      await cloudApi.renameMap(m.mapId, next.trim());
      setMaps((list) =>
        (list ?? []).map((x) => (x.mapId === m.mapId ? { ...x, title: next.trim() } : x)));
    } catch (e) {
      onFlash('⚠ ' + (e instanceof CloudError ? e.message : '이름 변경 실패'));
    }
  };

  const handleDelete = async (m: MapListItem) => {
    if (!window.confirm(`“${m.title || '제목 없음'}” 맵을 삭제할까요? 되돌릴 수 없습니다.`)) return;
    try {
      await cloudApi.deleteMap(m.mapId);
      setMaps((list) => (list ?? []).filter((x) => x.mapId !== m.mapId));
      if (useCloudStore.getState().cloudMapId === m.mapId) {
        useCloudStore.getState().unlink();
        useAutosaveStore.getState().setSaveState('saved');
      }
    } catch (e) {
      onFlash('⚠ ' + (e instanceof CloudError ? e.message : '삭제 실패'));
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.35)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        data-testid="cloud-list-modal"
        style={{
          width: 'min(480px, 92vw)', maxHeight: '70vh', overflow: 'auto',
          background: t.surface, color: t.text, border: `1px solid ${t.border}`,
          borderRadius: 12, padding: 18, boxShadow: '0 16px 48px rgba(0,0,0,0.3)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <strong style={{ fontSize: 15 }}>{title}</strong>
          <button onClick={onClose}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: t.textSubtle, fontSize: 18 }}>✕</button>
        </div>
        {maps === null ? (
          <div style={{ color: t.textSubtle, fontSize: 13, padding: '24px 4px', textAlign: 'center' }}>
            불러오는 중…
          </div>
        ) : maps.length === 0 ? (
          <div data-testid="cloud-list-empty"
            style={{ color: t.textSubtle, fontSize: 13, padding: '24px 4px', textAlign: 'center', lineHeight: 1.6 }}>
            {err ?? emptyHint}
          </div>
        ) : (
          maps.map((m) => (
            <div
              key={m.mapId}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6,
                borderRadius: 8, background: t.surfaceAlt, border: `1px solid ${t.border}`,
                padding: '4px 6px 4px 12px',
              }}
            >
              <button
                data-testid="cloud-list-item"
                onClick={() => void handleOpen(m.mapId)}
                title="이 맵 열기"
                style={{
                  flex: 1, display: 'flex', justifyContent: 'space-between', gap: 10,
                  textAlign: 'left', background: 'transparent', border: 'none', color: t.text,
                  cursor: 'pointer', padding: '6px 0', overflow: 'hidden',
                }}
              >
                <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {m.title || '(제목 없음)'}
                </span>
                <span style={{ color: t.textSubtle, fontSize: 11, flexShrink: 0 }}>
                  {new Date(m.updatedAt).toLocaleDateString()}
                </span>
              </button>
              <button
                data-testid="cloud-item-rename"
                onClick={() => void handleRename(m)}
                title="이름 변경"
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: t.textSubtle, padding: 6, borderRadius: 6, fontSize: 14 }}
              >✏</button>
              <button
                data-testid="cloud-item-delete"
                onClick={() => void handleDelete(m)}
                title="삭제"
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#d9534f', padding: 6, borderRadius: 6, fontSize: 14 }}
              >🗑</button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
