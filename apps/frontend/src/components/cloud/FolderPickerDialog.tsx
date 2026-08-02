// FolderPickerDialog — "어느 폴더로 옮길까"를 **눌러서** 고르는 창.
//
// 2026-08-02: 처음에는 window.prompt 로 폴더 번호를 입력받았는데,
// 브라우저 기본 대화상자라 목록을 보면서 고를 수가 없었다(사용자 지적).
// 폴더 트리를 그대로 보여 주고 클릭으로 고르게 바꾼다.
import { useEffect, useState } from 'react';
import type { ThemeTokens } from '@/components/design-tokens/theme';
import type { FolderItem } from '@/services/cloud/apiClient';
import { flattenFolders } from './folderTree';

export function FolderPickerDialog({
  t, title, folders, currentFolderId, disabledIds, onPick, onCancel,
}: {
  t: ThemeTokens;
  /** 창 제목 — 무엇을 옮기는지 알 수 있게 */
  title: string;
  folders: FolderItem[];
  /** 지금 들어 있는 폴더 (null = 홈) — '현재 위치'로 표시 */
  currentFolderId: string | null;
  /** 고를 수 없는 폴더 (폴더를 옮길 때 자기 자신·자손) */
  disabledIds?: string[];
  onPick: (folderId: string | null) => void;
  onCancel: () => void;
}) {
  const [picked, setPicked] = useState<string | null>(currentFolderId);
  const blocked = new Set(disabledIds ?? []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const rows = [
    { folderId: null as string | null, name: '홈 (최상위)', depth: 0, disabled: false },
    ...flattenFolders(folders).map((f) => ({
      folderId: f.folderId as string | null,
      name: f.name,
      depth: f.depth + 1,
      disabled: blocked.has(f.folderId),
    })),
  ];

  return (
    <div
      onClick={onCancel}
      style={{
        position: 'fixed', inset: 0, zIndex: 240, background: 'rgba(0,0,0,0.35)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        data-testid="folder-picker"
        style={{
          width: 'min(420px, 92vw)', maxHeight: '70vh', display: 'flex', flexDirection: 'column',
          background: t.surface, color: t.text, border: `1px solid ${t.border}`,
          borderRadius: 12, padding: 18, boxShadow: '0 16px 48px rgba(0,0,0,0.3)',
        }}
      >
        <div style={{ fontSize: 15.5, fontWeight: 800, marginBottom: 4 }}>{title}</div>
        <div style={{ fontSize: 12, color: t.textMuted, marginBottom: 12 }}>
          옮길 폴더를 고르세요.
        </div>

        <div style={{
          flex: 1, overflowY: 'auto', marginBottom: 14,
          border: `1px solid ${t.border}`, borderRadius: 8,
        }}>
          {rows.map((r) => {
            const isPicked = picked === r.folderId;
            const isCurrent = currentFolderId === r.folderId;
            return (
              <button
                key={r.folderId ?? 'root'}
                data-testid="folder-picker-item"
                disabled={r.disabled}
                onClick={() => setPicked(r.folderId)}
                onDoubleClick={() => !r.disabled && onPick(r.folderId)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                  textAlign: 'left', border: 'none', cursor: r.disabled ? 'default' : 'pointer',
                  padding: `8px 12px 8px ${12 + r.depth * 16}px`,
                  background: isPicked ? t.primarySoft : 'transparent',
                  color: r.disabled ? t.textSubtle : isPicked ? t.primary : t.text,
                  fontSize: 13, fontWeight: isPicked ? 700 : 500,
                }}
              >
                <span>{r.folderId === null ? '🏠' : '📁'}</span>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.name}
                </span>
                {isCurrent && (
                  <span style={{ fontSize: 10, color: t.textSubtle }}>현재 위치</span>
                )}
              </button>
            );
          })}
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            data-testid="folder-picker-ok"
            disabled={picked === currentFolderId}
            onClick={() => onPick(picked)}
            style={{
              flex: 1, height: 36, borderRadius: 7, border: 'none',
              cursor: picked === currentFolderId ? 'default' : 'pointer',
              background: picked === currentFolderId ? t.surfaceAlt : t.primary,
              color: picked === currentFolderId ? t.textSubtle : '#fff',
              fontSize: 13.5, fontWeight: 700,
            }}
          >여기로 옮기기</button>
          <button
            data-testid="folder-picker-cancel"
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
