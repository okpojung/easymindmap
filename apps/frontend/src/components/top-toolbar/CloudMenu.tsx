import { useEffect, useRef, useState } from 'react';
import type { ThemeTokens } from '@/components/design-tokens/theme';
import { I } from '@/components/icons';
import { useDocumentStore } from '@/stores/documentStore';
import { useCloudStore } from '@/stores/cloudStore';
import { useAutosaveStore } from '@/stores/autosaveStore';
import { useCloudAutosave, suppressCloudAutosave } from '@/hooks/useCloudAutosave';
import { cloudApi, CloudError, type MapListItem } from '@/services/cloud/apiClient';

// 클라우드 문서 스냅샷 포맷 — 프론트 문서(map)와 칸반 보드를 통째로 담는다.
// 임베드 이미지·노트·태그·스타일이 map 안에 그대로 들어 있어 손실 없이 왕복.
const SNAPSHOT_VERSION = 1;

/**
 * 클라우드 저장/열기 메뉴. 개발 모드(백엔드 AUTH_MODE=dev)에서는 로그인 없이
 * 단일 개발 사용자로 저장된다. 실제 로그인은 다음 단계.
 */
export function CloudMenu({ t }: { t: ThemeTokens }) {
  const [open, setOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [maps, setMaps] = useState<MapListItem[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const cloudMapId = useCloudStore((s) => s.cloudMapId);
  const lastSavedAt = useCloudStore((s) => s.lastSavedAt);
  const busy = useCloudStore((s) => s.busy);
  const link = useCloudStore((s) => s.link);

  // 문서가 클라우드에 연결돼 있으면 편집 후 자동 저장(디바운스)
  useCloudAutosave();

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const flash = (m: string) => {
    setMsg(m);
    window.setTimeout(() => setMsg((cur) => (cur === m ? null : cur)), 3500);
  };

  const buildSnapshot = () => {
    const st = useDocumentStore.getState();
    return { v: SNAPSHOT_VERSION, map: st.map, kanban: st.kanban };
  };

  // ── 저장 ────────────────────────────────────────────────
  const handleSave = async () => {
    setOpen(false);
    const st = useDocumentStore.getState();
    const title = st.map.title || '제목 없는 맵';
    useCloudStore.getState().setBusy('saving');
    try {
      let id = cloudMapId;
      if (!id) {
        const created = await cloudApi.createMap(title);
        id = created.mapId;
      }
      const res = await cloudApi.saveDocument(id, buildSnapshot(), title);
      link(id, res.updatedAt);
      // 수동 저장은 맵을 바꾸지 않으므로 자동저장이 트리거되지 않는다(억제 불필요).
      useAutosaveStore.getState().setSaveState('saved');
      flash('☁ 클라우드에 저장했습니다.');
    } catch (err) {
      const m = err instanceof CloudError ? err.message : '저장 중 오류가 발생했습니다.';
      useCloudStore.getState().setError(m);
      flash('⚠ ' + m);
    } finally {
      useCloudStore.getState().setBusy('idle');
    }
  };

  // ── 목록 열기 ───────────────────────────────────────────
  const openList = async () => {
    setOpen(false);
    useCloudStore.getState().setBusy('opening');
    try {
      const { maps: list } = await cloudApi.listMaps();
      setMaps(list);
      setListOpen(true);
    } catch (err) {
      const m = err instanceof CloudError ? err.message : '목록을 불러오지 못했습니다.';
      flash('⚠ ' + m);
    } finally {
      useCloudStore.getState().setBusy('idle');
    }
  };

  // ── 선택 맵 불러오기 ────────────────────────────────────
  const handleOpen = async (mapId: string) => {
    useCloudStore.getState().setBusy('opening');
    try {
      const { doc, updatedAt } = await cloudApi.getDocument(mapId);
      const snap = doc as { map?: Parameters<typeof useDocumentStore.getState>[never] } & {
        map?: unknown;
      };
      const loadedMap = (snap as { map?: unknown }).map;
      if (!loadedMap) throw new CloudError(0, '문서 형식을 인식할 수 없습니다.');
      suppressCloudAutosave(); // 방금 불러온 문서를 곧바로 재저장하지 않도록
      useDocumentStore.getState().loadMap(loadedMap as never);
      link(mapId, updatedAt);
      useAutosaveStore.getState().setSaveState('saved');
      setListOpen(false);
      flash('☁ 클라우드에서 불러왔습니다.');
    } catch (err) {
      const m = err instanceof CloudError ? err.message : '불러오기 중 오류가 발생했습니다.';
      flash('⚠ ' + m);
    } finally {
      useCloudStore.getState().setBusy('idle');
    }
  };

  // ── 목록 항목: 이름변경 / 삭제 ──────────────────────────
  const handleRename = async (m: MapListItem) => {
    const next = window.prompt('새 이름', m.title || '');
    if (next == null || next.trim() === '' || next.trim() === m.title) return;
    try {
      await cloudApi.renameMap(m.mapId, next.trim());
      setMaps((list) => list.map((x) => (x.mapId === m.mapId ? { ...x, title: next.trim() } : x)));
    } catch (err) {
      flash('⚠ ' + (err instanceof CloudError ? err.message : '이름 변경 실패'));
    }
  };

  const handleDelete = async (m: MapListItem) => {
    if (!window.confirm(`“${m.title || '제목 없음'}” 맵을 삭제할까요? 되돌릴 수 없습니다.`)) return;
    try {
      await cloudApi.deleteMap(m.mapId);
      setMaps((list) => list.filter((x) => x.mapId !== m.mapId));
      if (useCloudStore.getState().cloudMapId === m.mapId) {
        useCloudStore.getState().unlink();
        useAutosaveStore.getState().setSaveState('saved');
      }
    } catch (err) {
      flash('⚠ ' + (err instanceof CloudError ? err.message : '삭제 실패'));
    }
  };

  const savedHint = lastSavedAt
    ? `저장됨 · ${new Date(lastSavedAt).toLocaleString()}`
    : '아직 클라우드에 저장하지 않음';

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        title={cloudMapId ? savedHint : '클라우드에 저장/열기'}
        data-testid="cloud-menu"
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: 4,
          height: 32, padding: '0 10px', borderRadius: 8,
          background: t.surfaceAlt, color: t.text,
          border: `1px solid ${cloudMapId ? t.primaryBorder + '66' : t.border}`,
          cursor: 'pointer', fontSize: 13, fontWeight: 500,
        }}
      >
        <I.Cloud size={15} /> 클라우드 <span style={{ fontSize: 8 }}>▼</span>
      </button>

      {open && (
        <div
          style={{
            position: 'absolute', top: 38, right: 0, zIndex: 50, minWidth: 220,
            background: t.surface, border: `1px solid ${t.border}`, borderRadius: 10,
            boxShadow: '0 8px 24px rgba(0,0,0,0.18)', padding: 6,
          }}
        >
          <div style={{ padding: '6px 10px', fontSize: 11, color: t.textSubtle }}>{savedHint}</div>
          <MenuItem t={t} testid="cloud-save" disabled={busy !== 'idle'}
            label={cloudMapId ? '☁ 저장 (덮어쓰기)' : '☁ 클라우드에 저장'} onClick={handleSave} />
          <MenuItem t={t} testid="cloud-open" disabled={busy !== 'idle'}
            label="📂 클라우드에서 열기" onClick={openList} />
        </div>
      )}

      {msg && (
        <div
          data-testid="cloud-toast"
          style={{
            position: 'absolute', top: 38, right: 0, zIndex: 60, whiteSpace: 'nowrap',
            background: t.text, color: t.surface, padding: '6px 12px', borderRadius: 8,
            fontSize: 12, boxShadow: '0 6px 18px rgba(0,0,0,0.22)',
          }}
        >
          {msg}
        </div>
      )}

      {listOpen && (
        <MapListModal
          t={t}
          maps={maps}
          onPick={handleOpen}
          onRename={handleRename}
          onDelete={handleDelete}
          onClose={() => setListOpen(false)}
        />
      )}
    </div>
  );
}

function MenuItem({
  t, label, onClick, disabled, testid,
}: { t: ThemeTokens; label: string; onClick: () => void; disabled?: boolean; testid?: string }) {
  return (
    <button
      data-testid={testid}
      disabled={disabled}
      onClick={onClick}
      style={{
        display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px',
        background: 'transparent', color: disabled ? t.textSubtle : t.text,
        border: 'none', borderRadius: 6, cursor: disabled ? 'default' : 'pointer', fontSize: 13,
      }}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = t.surfaceAlt; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
    >
      {label}
    </button>
  );
}

function MapListModal({
  t, maps, onPick, onRename, onDelete, onClose,
}: {
  t: ThemeTokens;
  maps: MapListItem[];
  onPick: (id: string) => void;
  onRename: (m: MapListItem) => void;
  onDelete: (m: MapListItem) => void;
  onClose: () => void;
}) {
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
          <strong style={{ fontSize: 15 }}>클라우드에서 열기</strong>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: t.textSubtle, fontSize: 18 }}>✕</button>
        </div>
        {maps.length === 0 ? (
          <div style={{ color: t.textSubtle, fontSize: 13, padding: '24px 4px', textAlign: 'center' }}>
            저장된 맵이 없습니다. 먼저 “클라우드에 저장”을 해보세요.
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
                onClick={() => onPick(m.mapId)}
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
                onClick={() => onRename(m)}
                title="이름 변경"
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: t.textSubtle, padding: 6, borderRadius: 6, fontSize: 14 }}
              >✏</button>
              <button
                data-testid="cloud-item-delete"
                onClick={() => onDelete(m)}
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
