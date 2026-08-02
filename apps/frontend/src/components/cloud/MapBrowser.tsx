// MapBrowser — 문서함(서버 맵 목록)을 **편집 영역 안에** 여는 화면.
//
// 2026-08-02 사용자 지시: "서버 맵 불러오기는 팝업창이 아니라 오른쪽
// 편집 화면 영역에 표시하고 선택할 수 있도록". 팝업 모달(MapListModal)을
// 대체한다 — 목록이 길어도 화면을 다 쓰고, 폴더 이동·정렬이 편하다.
//
// 담는 것
//   · 홈 > 폴더 breadcrumb (폴더 트리 탐색)
//   · 폴더 먼저, 그다음 맵 (ThinkWise 문서함과 같은 배치)
//   · **이름·수정일 오름/내림 정렬** (머리글 클릭 — 규칙 6)
//   · 맵 유형 표시: 👤 단독맵 / 👥 협업맵 (규칙 7)
//   · 새 폴더 · 이름 변경 · 삭제 · 폴더 이동
//
// 여는 방식은 mapSession 규칙을 따른다 — 편집 중이면 브라우저 새 탭,
// 잃을 것이 없으면 이 탭.
import { useCallback, useEffect, useState } from 'react';
import type { ThemeTokens } from '@/components/design-tokens/theme';
import {
  cloudApi, CloudError,
  type FolderItem, type MapKind, type MapListItem,
} from '@/services/cloud/apiClient';
import { useCloudStore } from '@/stores/cloudStore';
import { canReuseThisTab, openMapHere, openMapInNewTab } from '@/services/cloud/mapSession';
import { flattenFolders, folderPath } from './folderTree';

type SortKey = 'title' | 'updatedAt';
type SortOrder = 'asc' | 'desc';

export function MapBrowser({
  t, onClose, onFlash, onOpened,
}: {
  t: ThemeTokens;
  onClose: () => void;
  onFlash: (msg: string) => void;
  /** 이 탭에 문서를 실제로 열었을 때 (호출부가 브라우저를 닫는다) */
  onOpened?: () => void;
}) {
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [maps, setMaps] = useState<MapListItem[] | null>(null);
  const [cwd, setCwd] = useState<string | null>(null); // null = 홈
  const [sort, setSort] = useState<SortKey>('updatedAt');
  const [order, setOrder] = useState<SortOrder>('desc');
  const [err, setErr] = useState<string | null>(null);
  const [newFolder, setNewFolder] = useState<string | null>(null); // 입력 중인 이름
  const cloudMapId = useCloudStore((s) => s.cloudMapId);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const [f, m] = await Promise.all([
        cloudApi.listFolders(),
        cloudApi.listMaps({ folder: cwd ?? 'root', sort, order }),
      ]);
      setFolders(f.folders);
      setMaps(m.maps);
    } catch (e) {
      setMaps([]);
      setErr(e instanceof CloudError ? e.message : '문서함을 불러오지 못했습니다.');
    }
  }, [cwd, sort, order]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const childFolders = folders
    .filter((f) => f.parentId === cwd)
    .sort((a, b) => (sort === 'title' && order === 'desc'
      ? b.name.localeCompare(a.name, 'ko')
      : a.name.localeCompare(b.name, 'ko')));
  const path = folderPath(folders, cwd);

  // ── 동작 ────────────────────────────────────────────────────
  const openMap = async (m: MapListItem) => {
    if (cloudMapId === m.mapId) {
      onFlash('이미 이 탭에서 편집 중인 맵입니다.');
      return;
    }
    if (canReuseThisTab()) {
      try {
        await openMapHere(m.mapId);
        onFlash(`☁ '${m.title}'을(를) 불러왔습니다.`);
        onOpened?.();
        onClose();
      } catch (e) {
        onFlash('⚠ ' + (e instanceof CloudError ? e.message : '불러오기 실패'));
      }
      return;
    }
    const ok = openMapInNewTab(m.mapId);
    onFlash(ok
      ? `↗ '${m.title}'을(를) 새 탭에서 열었습니다.`
      : '⚠ 팝업이 차단되어 새 탭을 열지 못했습니다. 브라우저의 팝업 차단을 해제해 주세요.');
  };

  const createFolder = async (name: string) => {
    const clean = name.trim();
    setNewFolder(null);
    if (!clean) return;
    try {
      await cloudApi.createFolder(clean, cwd);
      onFlash(`📁 '${clean}' 폴더를 만들었습니다.`);
      void load();
    } catch (e) {
      onFlash('⚠ ' + (e instanceof CloudError ? e.message : '폴더를 만들지 못했습니다.'));
    }
  };

  const renameFolder = async (f: FolderItem) => {
    const next = window.prompt('폴더 새 이름', f.name);
    if (next == null || !next.trim() || next.trim() === f.name) return;
    try {
      await cloudApi.renameFolder(f.folderId, next.trim());
      void load();
    } catch (e) {
      onFlash('⚠ ' + (e instanceof CloudError ? e.message : '이름 변경 실패'));
    }
  };

  const deleteFolder = async (f: FolderItem) => {
    if (!window.confirm(`“${f.name}” 폴더를 삭제할까요?`)) return;
    try {
      await cloudApi.deleteFolder(f.folderId);
      void load();
    } catch (e) {
      // 비어 있지 않으면 409 — 서버 메시지가 몇 개 남았는지 알려 준다
      onFlash('⚠ ' + (e instanceof CloudError ? e.message : '폴더 삭제 실패'));
    }
  };

  const renameMap = async (m: MapListItem) => {
    const next = window.prompt('맵 새 이름', m.title);
    if (next == null || !next.trim() || next.trim() === m.title) return;
    try {
      await cloudApi.updateMap(m.mapId, { title: next.trim() });
      if (cloudMapId === m.mapId) {
        useCloudStore.getState().link(m.mapId, new Date().toISOString(), { title: next.trim() });
      }
      void load();
    } catch (e) {
      onFlash('⚠ ' + (e instanceof CloudError ? e.message : '이름 변경 실패'));
    }
  };

  const moveMap = async (m: MapListItem) => {
    const options = [
      { id: null as string | null, label: '홈 (최상위)' },
      ...flattenFolders(folders).map((f) => ({
        id: f.folderId as string | null,
        label: `${'　'.repeat(f.depth)}${f.name}`,
      })),
    ];
    const answer = window.prompt(
      '옮길 폴더 번호를 입력하세요\n' +
      options.map((o, i) => `${i}. ${o.label}`).join('\n'),
      '0',
    );
    if (answer == null) return;
    const idx = Number(answer);
    if (!Number.isInteger(idx) || idx < 0 || idx >= options.length) return;
    try {
      await cloudApi.updateMap(m.mapId, { folderId: options[idx].id });
      void load();
    } catch (e) {
      onFlash('⚠ ' + (e instanceof CloudError ? e.message : '이동 실패'));
    }
  };

  const toggleKind = async (m: MapListItem) => {
    const next: MapKind = m.kind === 'collab' ? 'solo' : 'collab';
    try {
      await cloudApi.updateMap(m.mapId, { kind: next });
      void load();
    } catch (e) {
      onFlash('⚠ ' + (e instanceof CloudError ? e.message : '유형 변경 실패'));
    }
  };

  const deleteMap = async (m: MapListItem) => {
    if (!window.confirm(`“${m.title || '제목 없음'}” 맵을 삭제할까요? 되돌릴 수 없습니다.`)) return;
    try {
      await cloudApi.deleteMap(m.mapId);
      if (cloudMapId === m.mapId) useCloudStore.getState().unlink();
      void load();
    } catch (e) {
      onFlash('⚠ ' + (e instanceof CloudError ? e.message : '삭제 실패'));
    }
  };

  // ── 스타일 ──────────────────────────────────────────────────
  const th = (label: string, key: SortKey) => (
    <button
      data-testid={`browser-sort-${key}`}
      onClick={() => {
        if (sort === key) setOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
        else { setSort(key); setOrder(key === 'title' ? 'asc' : 'desc'); }
      }}
      title={`${label} 기준 정렬 (다시 누르면 오름/내림 전환)`}
      style={{
        display: 'flex', alignItems: 'center', gap: 4,
        background: 'transparent', border: 'none', cursor: 'pointer',
        color: sort === key ? t.primary : t.textMuted,
        fontSize: 11.5, fontWeight: 700, padding: 0,
      }}
    >
      {label}
      <span style={{ fontSize: 9 }}>{sort === key ? (order === 'asc' ? '▲' : '▼') : '⇅'}</span>
    </button>
  );

  const rowStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: '28px 1fr 92px 150px 116px',
    alignItems: 'center',
    gap: 8,
    padding: '7px 10px',
    borderBottom: `1px solid ${t.divider}`,
    fontSize: 13,
  };

  const iconBtn: React.CSSProperties = {
    background: 'transparent', border: 'none', cursor: 'pointer',
    color: t.textSubtle, padding: '3px 5px', borderRadius: 5, fontSize: 13,
  };

  return (
    <div
      data-testid="map-browser"
      style={{
        flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column',
        background: t.surface, color: t.text, overflow: 'hidden',
      }}
    >
      {/* 헤더 — breadcrumb + 도구 */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '12px 14px', borderBottom: `1px solid ${t.border}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1, minWidth: 0, flexWrap: 'wrap' }}>
          <strong style={{ fontSize: 15, marginRight: 6 }}>내 문서</strong>
          <button
            data-testid="browser-crumb-home"
            onClick={() => setCwd(null)}
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: cwd === null ? t.text : t.primary, fontSize: 12.5,
              fontWeight: cwd === null ? 700 : 500, padding: '2px 4px',
            }}
          >홈</button>
          {path.map((f, i) => (
            <span key={f.folderId} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ color: t.textSubtle, fontSize: 11 }}>›</span>
              <button
                onClick={() => setCwd(f.folderId)}
                style={{
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  color: i === path.length - 1 ? t.text : t.primary, fontSize: 12.5,
                  fontWeight: i === path.length - 1 ? 700 : 500, padding: '2px 4px',
                }}
              >{f.name}</button>
            </span>
          ))}
        </div>
        <button
          data-testid="browser-new-folder"
          onClick={() => setNewFolder('')}
          title="이 위치에 새 폴더 만들기"
          style={{
            height: 30, padding: '0 10px', borderRadius: 7, cursor: 'pointer',
            border: `1px solid ${t.border}`, background: t.surfaceAlt, color: t.text,
            fontSize: 12, fontWeight: 600,
          }}
        >＋ 새 폴더</button>
        <button
          data-testid="browser-close"
          onClick={onClose}
          title="문서함 닫기 (Esc)"
          style={{ ...iconBtn, fontSize: 17 }}
        >✕</button>
      </div>

      {/* 새 폴더 입력 줄 */}
      {newFolder !== null && (
        <div style={{ padding: '8px 14px', borderBottom: `1px solid ${t.divider}`, display: 'flex', gap: 6 }}>
          <input
            data-testid="browser-new-folder-name"
            autoFocus
            value={newFolder}
            placeholder="폴더 이름"
            onChange={(e) => setNewFolder(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void createFolder(newFolder);
              if (e.key === 'Escape') setNewFolder(null);
            }}
            style={{
              flex: 1, height: 30, padding: '0 9px', borderRadius: 6, fontSize: 12.5,
              border: `1px solid ${t.border}`, background: t.surfaceAlt, color: t.text,
            }}
          />
          <button
            onClick={() => void createFolder(newFolder)}
            style={{
              height: 30, padding: '0 12px', borderRadius: 6, border: 'none',
              background: t.primary, color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 700,
            }}
          >만들기</button>
          <button
            onClick={() => setNewFolder(null)}
            style={{
              height: 30, padding: '0 10px', borderRadius: 6, cursor: 'pointer',
              border: `1px solid ${t.border}`, background: t.surface, color: t.text, fontSize: 12,
            }}
          >취소</button>
        </div>
      )}

      {/* 오류 배너 — 서버가 준 이유를 그대로 보여 준다. 스키마 미적용
          (503)이면 "schema.sql 을 적용하라"는 안내가 여기에 뜬다. */}
      {err && (
        <div
          data-testid="browser-error"
          style={{
            margin: '10px 14px 0', padding: '10px 12px', borderRadius: 8,
            background: '#d9534f11', border: '1px solid #d9534f55',
            color: '#b33', fontSize: 12.5, lineHeight: 1.65,
          }}
        >
          ⚠ {err}
        </div>
      )}

      {/* 열 머리글 */}
      <div style={{
        ...rowStyle,
        background: t.surfaceAlt, borderBottom: `1px solid ${t.border}`,
        color: t.textMuted, fontWeight: 700, fontSize: 11.5,
      }}>
        <span />
        {th('이름', 'title')}
        <span>유형</span>
        {th('수정일', 'updatedAt')}
        <span style={{ textAlign: 'right' }}>관리</span>
      </div>

      {/* 목록 */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {childFolders.map((f) => (
          <div key={f.folderId} data-testid="browser-folder" style={rowStyle}>
            <span style={{ fontSize: 15 }}>📁</span>
            <button
              onClick={() => setCwd(f.folderId)}
              title="폴더 열기"
              style={{
                textAlign: 'left', background: 'transparent', border: 'none',
                color: t.text, cursor: 'pointer', fontSize: 13, fontWeight: 600,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: 0,
              }}
            >{f.name}</button>
            <span style={{ color: t.textSubtle, fontSize: 11 }}>폴더</span>
            <span style={{ color: t.textSubtle, fontSize: 11.5 }}>
              맵 {f.mapCount}개
            </span>
            <span style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
              <button style={iconBtn} title="이름 변경" onClick={() => void renameFolder(f)}>✏</button>
              <button style={{ ...iconBtn, color: '#d9534f' }} title="삭제 (비어 있을 때만)"
                onClick={() => void deleteFolder(f)}>🗑</button>
            </span>
          </div>
        ))}

        {maps === null ? (
          <div style={{ padding: '28px 14px', color: t.textSubtle, fontSize: 13, textAlign: 'center' }}>
            불러오는 중…
          </div>
        ) : maps.length === 0 && childFolders.length === 0 ? (
          <div data-testid="browser-empty"
            style={{ padding: '32px 14px', color: t.textSubtle, fontSize: 13, textAlign: 'center', lineHeight: 1.7 }}>
            {err ? '목록을 표시할 수 없습니다 — 위 안내를 확인해 주세요.' : (
              <>이 위치에 문서가 없습니다.<br />
              맵을 만들어 <b>☁ 저장</b>할 때 이 폴더를 고르면 여기에 쌓입니다.</>
            )}
          </div>
        ) : (
          maps.map((m) => (
            <div key={m.mapId} data-testid="browser-map" style={rowStyle}>
              <span style={{ fontSize: 15 }}>🗺</span>
              <button
                data-testid="browser-map-open"
                onClick={() => void openMap(m)}
                title="이 맵 열기"
                style={{
                  textAlign: 'left', background: 'transparent', border: 'none',
                  color: cloudMapId === m.mapId ? t.primary : t.text, cursor: 'pointer',
                  fontSize: 13, fontWeight: 500, padding: 0,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}
              >
                {m.title || '(제목 없음)'}
                {cloudMapId === m.mapId && (
                  <span style={{ fontSize: 10, marginLeft: 6, color: t.textSubtle }}>편집 중</span>
                )}
              </button>
              <button
                data-testid="browser-map-kind"
                onClick={() => void toggleKind(m)}
                title={m.kind === 'collab'
                  ? '협업맵 — 누르면 단독맵으로 바꿉니다'
                  : '단독맵 — 누르면 협업맵으로 바꿉니다'}
                style={{
                  justifySelf: 'start', background: 'transparent', cursor: 'pointer',
                  border: `1px solid ${t.border}`, borderRadius: 8, padding: '1px 7px',
                  color: m.kind === 'collab' ? t.primary : t.textSubtle, fontSize: 10.5, fontWeight: 600,
                }}
              >
                {m.kind === 'collab' ? '👥 협업맵' : '👤 단독맵'}
              </button>
              <span style={{ color: t.textSubtle, fontSize: 11.5 }}>
                {new Date(m.updatedAt).toLocaleString()}
              </span>
              <span style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                <button style={iconBtn} title="이름 변경" onClick={() => void renameMap(m)}>✏</button>
                <button style={iconBtn} title="다른 폴더로 이동" onClick={() => void moveMap(m)}>📂</button>
                <button style={{ ...iconBtn, color: '#d9534f' }} title="삭제"
                  onClick={() => void deleteMap(m)}>🗑</button>
              </span>
            </div>
          ))
        )}
      </div>

      <div style={{
        padding: '8px 14px', borderTop: `1px solid ${t.border}`,
        color: t.textSubtle, fontSize: 11, lineHeight: 1.6,
      }}>
        편집 중인 맵이 있으면 다른 맵은 <b>브라우저 새 탭</b>에서 열립니다.
        폴더는 <b>비어 있을 때만</b> 삭제할 수 있습니다.
      </div>
    </div>
  );
}
