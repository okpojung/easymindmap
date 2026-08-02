// SaveMapDialog — 새 맵을 **처음 서버에 저장**할 때 폴더·이름·유형을 묻는다.
//
// 2026-08-02 사용자 규칙 3:
//   "새 맵은 제목을 만들지 말고 기본 '새 맵'으로 편집하다가, 편집을 마치고
//    서버에 저장할 때 **저장 폴더 위치와 맵 이름을 물어본다**. 같은 폴더에
//    같은 이름이 있으면 그렇다고 알리고 다른 이름/다른 폴더로 안내한다."
//
// 중복 판정은 **서버**가 한다(409) — 목록을 미리 받아 클라이언트에서만
// 검사하면 다른 탭에서 방금 만든 맵을 놓친다. 여기서는 서버 메시지를
// 그대로 보여 주고 이름 입력에 포커스를 돌려준다.
import { useEffect, useState } from 'react';
import type { ThemeTokens } from '@/components/design-tokens/theme';
import { cloudApi, CloudError, type FolderItem, type MapKind } from '@/services/cloud/apiClient';
import { saveNewMap } from '@/services/cloud/mapSession';
import { flattenFolders } from './folderTree';

export function SaveMapDialog({
  t, defaultTitle, onSaved, onCancel, note,
}: {
  t: ThemeTokens;
  defaultTitle: string;
  /** 저장 성공 — 호출부가 안내를 띄우거나 이어서 닫기를 진행한다 */
  onSaved: (info: { mapId: string; title: string }) => void;
  onCancel: () => void;
  /** 위쪽에 덧붙일 안내 (예: 맵 닫기 흐름에서 왔을 때) */
  note?: string;
}) {
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [title, setTitle] = useState(defaultTitle);
  const [kind, setKind] = useState<MapKind>('solo');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [newFolder, setNewFolder] = useState('');

  useEffect(() => {
    cloudApi.listFolders()
      .then((r) => setFolders(r.folders))
      .catch(() => { /* 폴더가 없어도 홈에는 저장할 수 있다 */ });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const addFolder = async () => {
    const name = newFolder.trim();
    if (!name) return;
    try {
      const f = await cloudApi.createFolder(name, folderId);
      setFolders((list) => [...list, f]);
      setFolderId(f.folderId);
      setNewFolder('');
      setErr(null);
    } catch (e) {
      setErr(e instanceof CloudError ? e.message : '폴더를 만들지 못했습니다.');
    }
  };

  const submit = async () => {
    const clean = title.trim();
    if (!clean) { setErr('맵 이름을 입력해 주세요.'); return; }
    setBusy(true);
    setErr(null);
    try {
      const { mapId } = await saveNewMap({ title: clean, folderId, kind });
      onSaved({ mapId, title: clean });
    } catch (e) {
      // 409 = 같은 폴더에 같은 이름 (서버 메시지에 안내가 들어 있다)
      setErr(e instanceof CloudError ? e.message : '저장 중 오류가 발생했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', height: 34, padding: '0 10px',
    borderRadius: 7, border: `1px solid ${t.border}`, background: t.surfaceAlt,
    color: t.text, fontSize: 13,
  };
  const label: React.CSSProperties = {
    fontSize: 11.5, fontWeight: 700, color: t.textMuted, marginBottom: 5, display: 'block',
  };

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
        data-testid="save-map-dialog"
        style={{
          width: 'min(460px, 92vw)', background: t.surface, color: t.text,
          border: `1px solid ${t.border}`, borderRadius: 12, padding: 20,
          boxShadow: '0 16px 48px rgba(0,0,0,0.3)',
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>맵 저장</div>
        <div style={{ fontSize: 12, color: t.textMuted, lineHeight: 1.6, marginBottom: 16 }}>
          {note ?? '저장할 폴더와 맵 이름을 정해 주세요. 다음부터는 묻지 않고 이 이름으로 저장됩니다.'}
        </div>

        {/* 폴더 */}
        <label style={label}>저장 위치</label>
        <select
          data-testid="save-folder"
          value={folderId ?? ''}
          onChange={(e) => setFolderId(e.target.value || null)}
          style={{ ...inputStyle, marginBottom: 8 }}
        >
          <option value="">홈 (최상위)</option>
          {flattenFolders(folders).map((f) => (
            <option key={f.folderId} value={f.folderId}>
              {' '.repeat(f.depth * 3)}{f.name}
            </option>
          ))}
        </select>
        <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
          <input
            data-testid="save-new-folder"
            value={newFolder}
            placeholder="여기에 새 폴더 만들기"
            onChange={(e) => setNewFolder(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void addFolder(); }}
            style={{ ...inputStyle, height: 30, fontSize: 12 }}
          />
          <button
            onClick={() => void addFolder()}
            disabled={!newFolder.trim()}
            style={{
              height: 30, padding: '0 12px', borderRadius: 6, whiteSpace: 'nowrap',
              border: `1px solid ${t.border}`, background: t.surfaceAlt, color: t.text,
              cursor: newFolder.trim() ? 'pointer' : 'default', fontSize: 12, fontWeight: 600,
            }}
          >폴더 추가</button>
        </div>

        {/* 이름 */}
        <label style={label}>맵 이름</label>
        <input
          data-testid="save-title"
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !busy) void submit(); }}
          style={{ ...inputStyle, marginBottom: 16 }}
        />

        {/* 유형 */}
        <label style={label}>맵 유형</label>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {([
            ['solo', '👤 단독맵', '나만 편집합니다'],
            ['collab', '👥 협업맵', '여러 사람이 함께 쓸 맵으로 표시합니다'],
          ] as const).map(([v, text, tip]) => (
            <button
              key={v}
              data-testid={`save-kind-${v}`}
              title={tip}
              onClick={() => setKind(v)}
              style={{
                flex: 1, height: 34, borderRadius: 7, cursor: 'pointer', fontSize: 12.5,
                fontWeight: 600,
                border: `1px solid ${kind === v ? t.primaryBorder : t.border}`,
                background: kind === v ? t.primarySoft : t.surfaceAlt,
                color: kind === v ? t.primary : t.text,
              }}
            >{text}</button>
          ))}
        </div>

        {err && (
          <div data-testid="save-error" style={{
            color: '#d9534f', fontSize: 12, lineHeight: 1.6, marginBottom: 12,
            background: '#d9534f11', border: '1px solid #d9534f44',
            borderRadius: 7, padding: '8px 10px',
          }}>{err}</div>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            data-testid="save-submit"
            disabled={busy}
            onClick={() => void submit()}
            style={{
              flex: 1, height: 36, borderRadius: 7, border: 'none', cursor: 'pointer',
              background: t.primary, color: '#fff', fontSize: 13.5, fontWeight: 700,
              opacity: busy ? 0.6 : 1,
            }}
          >{busy ? '저장 중…' : '저장'}</button>
          <button
            data-testid="save-cancel"
            onClick={onCancel}
            style={{
              flex: 1, height: 36, borderRadius: 7, cursor: 'pointer',
              border: `1px solid ${t.border}`, background: t.surfaceAlt,
              color: t.text, fontSize: 13.5, fontWeight: 600,
            }}
          >취소</button>
        </div>
      </div>
    </div>
  );
}
