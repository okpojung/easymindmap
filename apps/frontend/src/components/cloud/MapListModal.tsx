// 클라우드 문서 목록 모달 — "클라우드에서 열기"와 "맵 닫기 후 문서
// 목록"이 같은 UI 를 쓴다 (B7). 목록 로드·열기·이름변경·삭제까지
// 자족적으로 처리하므로 호출부는 <MapListModal …/> 한 줄이면 된다.
import { useEffect, useState } from 'react';
import type { ThemeTokens } from '@/components/design-tokens/theme';
import { useDocumentStore } from '@/stores/documentStore';
import { useCloudStore } from '@/stores/cloudStore';
import { useAutosaveStore } from '@/stores/autosaveStore';
import { suppressCloudAutosave } from '@/hooks/useCloudAutosave';
import { cloudApi, CloudError, type MapListItem } from '@/services/cloud/apiClient';

export function MapListModal({
  t, title, emptyHint, onClose, onFlash, onOpened,
}: {
  t: ThemeTokens;
  /** 모달 제목 — 열기 진입은 "클라우드에서 열기", 닫기 후는 "문서 목록" */
  title: string;
  /** 목록이 비었을 때 안내 문구 */
  emptyHint: string;
  onClose: () => void;
  onFlash: (msg: string) => void;
  /** 문서를 실제로 열었을 때 (호출부가 패널을 닫는 등) */
  onOpened?: () => void;
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
    useCloudStore.getState().setBusy('opening');
    try {
      const { doc, updatedAt } = await cloudApi.getDocument(mapId);
      const loadedMap = (doc as { map?: unknown }).map;
      if (!loadedMap) throw new CloudError(0, '문서 형식을 인식할 수 없습니다.');
      suppressCloudAutosave(); // 방금 불러온 문서를 곧바로 재저장하지 않도록
      useDocumentStore.getState().loadMap(loadedMap as never);
      useCloudStore.getState().link(mapId, updatedAt);
      useAutosaveStore.getState().setSaveState('saved');
      onClose();
      onOpened?.();
      onFlash('☁ 클라우드에서 불러왔습니다.');
    } catch (e) {
      onFlash('⚠ ' + (e instanceof CloudError ? e.message : '불러오기 중 오류가 발생했습니다.'));
    } finally {
      useCloudStore.getState().setBusy('idle');
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
