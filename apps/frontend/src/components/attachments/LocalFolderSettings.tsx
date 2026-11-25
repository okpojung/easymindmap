// 계정 메뉴 '첨부 폴더' 창의 '이 PC 첨부 폴더' (2026-11-25 프로필에서 분리) — 클라이언트 전용. 서버/프로필 API 로는 아무것도 보내지 않는다.
import { useEffect, useState } from 'react';
import type { ThemeTokens } from '@/components/design-tokens/theme';
import { connectLocalFolder, disconnectLocalFolder, getLocalFolderState } from '@/utils/localAttachments';
import { checkFolderPath, readFolderPath, writeFolderPath } from '@/utils/localFolderPath';
import { useTr } from '@/i18n';
import { useLocalFolderState } from './useLocalFolderState';
import './register';

export function LocalFolderSettings({ t }: { t: ThemeTokens }) {
  const tr = useTr();
  const state = useLocalFolderState();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const unsupported = state.status === 'unsupported';
  const hasFolder = !!state.name;
  const folderName = state.name ?? '';
  // 전체 경로(드라이브명 포함) — 브라우저가 알려 주지 않아 사용자가 한 번 붙여 넣는다(표시 전용).
  const [fullPath, setFullPath] = useState<string | null>(() => readFolderPath(state.rootId));
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [pathErr, setPathErr] = useState<string | null>(null);
  useEffect(() => { setFullPath(readFolderPath(state.rootId)); setPathErr(null); }, [state.rootId, state.name]);
  const savePath = () => {
    if (!state.rootId) return;
    const r = checkFolderPath(draft, folderName);
    if (r.ok === false) { setPathErr(tr('localAtt.profile.pathBad.' + r.reason, { name: folderName })); return; }
    writeFolderPath(state.rootId, r.path); setFullPath(r.path); setEditing(false); setPathErr(null);
  };
  const startEdit = () => { setDraft(fullPath ?? ''); setPathErr(null); setEditing(true); };
  const btn = { height: 30, padding: '0 10px', borderRadius: 7, border: `1px solid ${t.border}`, background: t.surface, color: t.text, fontSize: 12, fontWeight: 600, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.55 : 1 } as const;

  // 선택창/권한 요청은 클릭 핸들러에서 동기로 시작해야 한다(첫 await 전에 호출).
  const connect = () => {
    if (busy || unsupported) return;
    setBusy(true); setError(null);
    let p: Promise<unknown>;
    try { p = connectLocalFolder(state.rootId); } catch { setBusy(false); setError(tr('localAtt.profile.failed')); return; }
    p.then(() => { if (!readFolderPath(getLocalFolderState().rootId)) { setDraft(''); setPathErr(null); setEditing(true); } })
     .catch((e: unknown) => { if ((e as { name?: string })?.name !== 'AbortError') setError(tr('localAtt.profile.failed')); })
      .finally(() => setBusy(false));
  };
  const unlink = () => {
    if (busy || !window.confirm(tr('localAtt.profile.unlinkConfirm'))) return;
    setBusy(true); setError(null);
    Promise.resolve(disconnectLocalFolder(state.rootId))
      .catch(() => setError(tr('localAtt.profile.failed')))
      .finally(() => setBusy(false));
  };
  const statusText = tr('localAtt.profile.status.' + state.status);
  return (
    <div data-testid="local-folder-settings" style={{ display: 'grid', gap: 8 }}>
      <div style={{ fontSize: 12, lineHeight: 1.55, color: t.textMuted }}>{tr('localAtt.profile.intro')}</div>
      <div style={{ fontSize: 11.5, fontWeight: 700, color: t.textMuted }}>{tr('localAtt.profile.title')}</div>
      {unsupported ? (
        <div data-testid="local-folder-unsupported" role="note" style={{ fontSize: 12, lineHeight: 1.5, color: t.text }}>{tr('localAtt.profile.unsupported')}</div>
      ) : (
        <>
          <div style={{ fontSize: 12.5, color: t.text, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'baseline' }}>
            <span>{tr('localAtt.profile.folder')}:</span>
            <b data-testid="local-folder-name" style={{ minWidth: 0, overflowWrap: 'anywhere', fontFamily: fullPath ? 'ui-monospace, Consolas, monospace' : undefined }}>{hasFolder ? (fullPath ?? state.name) : tr('localAtt.profile.none')}</b>
            <span data-testid="local-folder-status" data-status={state.status} role="status" style={{ fontSize: 11.5, color: state.status === 'disconnected' ? '#B45309' : t.textMuted }}>[{statusText}]</span>
          </div>
          {hasFolder && (
            <div data-testid="local-folder-path-box" style={{ display: 'grid', gap: 5, padding: '8px 10px', borderRadius: 8, border: `1px solid ${t.border}`, background: t.surface }}>
              <div style={{ fontSize: 12, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'baseline' }}>
                <span style={{ color: t.textMuted }}>{tr('localAtt.profile.path')}:</span>
                {fullPath
                  ? <b data-testid="local-folder-full-path" style={{ fontFamily: 'ui-monospace, Consolas, monospace', overflowWrap: 'anywhere' }}>{fullPath}</b>
                  : <span data-testid="local-folder-full-path-missing" style={{ color: '#B45309' }}>{tr('localAtt.profile.pathMissing')}</span>}
              </div>
              <div style={{ fontSize: 11, color: t.textSubtle }}>{tr('localAtt.profile.browserName')}: <span style={{ fontFamily: 'ui-monospace, Consolas, monospace' }}>{state.name}</span></div>
              {editing ? (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <input data-testid="local-folder-path-input" autoFocus value={draft} placeholder={tr('localAtt.profile.pathPlaceholder')}
                    aria-label={tr('localAtt.profile.path')}
                    onChange={(e) => { setDraft(e.target.value); setPathErr(null); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); savePath(); } else if (e.key === 'Escape' && fullPath) { e.stopPropagation(); setEditing(false); } }}
                    style={{ flex: '1 1 220px', minWidth: 0, height: 30, padding: '0 8px', borderRadius: 7, border: `1px solid ${pathErr ? t.danger : t.border}`, background: t.surface, color: t.text, fontSize: 12.5, fontFamily: 'ui-monospace, Consolas, monospace' }} />
                  <button type="button" data-testid="local-folder-path-save" onClick={savePath} style={btn}>{tr('localAtt.profile.pathSave')}</button>
                  {fullPath && <button type="button" onClick={() => { setEditing(false); setPathErr(null); }} style={btn}>{tr('localAtt.profile.pathCancel')}</button>}
                </div>
              ) : (
                <div><button type="button" data-testid="local-folder-path-edit" onClick={startEdit} style={btn}>{tr('localAtt.profile.pathEdit')}</button></div>
              )}
              {pathErr && <div data-testid="local-folder-path-error" role="alert" style={{ fontSize: 11.5, color: t.danger }}>{pathErr}</div>}
              <div style={{ fontSize: 10.5, lineHeight: 1.5, color: t.textSubtle }}>{tr('localAtt.profile.pathHelp')}</div>
            </div>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {!hasFolder && state.status !== 'loading' && (
              <button type="button" data-testid="local-folder-connect" disabled={busy} onClick={connect} style={btn}>{tr('localAtt.profile.connect')}</button>
            )}
            {hasFolder && state.status === 'disconnected' && (
              <button type="button" data-testid="local-folder-reconnect" disabled={busy} onClick={connect} style={btn}>{tr('localAtt.profile.reconnect')}</button>
            )}
            {hasFolder && state.status !== 'loading' && (
              <button type="button" data-testid="local-folder-unlink" disabled={busy} onClick={unlink} style={btn}>{tr('localAtt.profile.unlink')}</button>
            )}
          </div>
        </>
      )}
      {error && <div data-testid="local-folder-error" role="alert" style={{ fontSize: 12, color: t.danger }}>{error}</div>}
      <div style={{ fontSize: 10.5, color: t.textSubtle }}>{tr('localAtt.profile.privacy')}</div>
    </div>
  );
}
