// 계정 프로필의 '이 PC 첨부 폴더' — 클라이언트 전용. 서버/프로필 API 로는 아무것도 보내지 않는다.
import { useState } from 'react';
import type { ThemeTokens } from '@/components/design-tokens/theme';
import { connectLocalFolder, disconnectLocalFolder } from '@/utils/localAttachments';
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
  const btn = { height: 30, padding: '0 10px', borderRadius: 7, border: `1px solid ${t.border}`, background: t.surface, color: t.text, fontSize: 12, fontWeight: 600, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.55 : 1 } as const;

  // 선택창/권한 요청은 클릭 핸들러에서 동기로 시작해야 한다(첫 await 전에 호출).
  const connect = () => {
    if (busy || unsupported) return;
    setBusy(true); setError(null);
    let p: Promise<unknown>;
    try { p = connectLocalFolder(state.rootId); } catch { setBusy(false); setError(tr('localAtt.profile.failed')); return; }
    p.catch((e: unknown) => { if ((e as { name?: string })?.name !== 'AbortError') setError(tr('localAtt.profile.failed')); })
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
    <div data-testid="local-folder-settings" style={{ borderTop: `1px solid ${t.divider}`, paddingTop: 10, display: 'grid', gap: 6 }}>
      <div style={{ fontSize: 11.5, fontWeight: 700, color: t.textMuted }}>{tr('localAtt.profile.title')}</div>
      {unsupported ? (
        <div data-testid="local-folder-unsupported" role="note" style={{ fontSize: 12, lineHeight: 1.5, color: t.text }}>{tr('localAtt.profile.unsupported')}</div>
      ) : (
        <>
          <div style={{ fontSize: 12.5, color: t.text, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'baseline' }}>
            <span>{tr('localAtt.profile.folder')}:</span>
            <b data-testid="local-folder-name" style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{hasFolder ? state.name : tr('localAtt.profile.none')}</b>
            <span data-testid="local-folder-status" data-status={state.status} role="status" style={{ fontSize: 11.5, color: state.status === 'disconnected' ? '#B45309' : t.textMuted }}>[{statusText}]</span>
          </div>
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
