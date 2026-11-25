// 첨부할 때 "Cloud 에 올리기 / 이 PC 폴더에 두기" 를 묻는 창 (2026-11-25).
// 편집 화면에 한 번 놓는다. 묻는 쪽은 attachTarget.ts 의 chooseAttachTarget.
import { useEffect, useState, useSyncExternalStore } from 'react';
import type { ThemeTokens } from '@/components/design-tokens/theme';
import { DialogFrame } from '@/components/ui/DialogFrame';
import { useTr } from '@/i18n';
import { useCloudStore } from '@/stores/cloudStore';
import { requestLocalWritePermission } from '@/utils/localAttachments';
import { readFolderPath } from '@/utils/localFolderPath';
import { getAttachAsk, mapFolderName, subscribeAttachAsk } from './attachTarget';
import { useLocalFolderState } from './useLocalFolderState';
import './register';

export function AttachTargetHost({ t }: { t: ThemeTokens }) {
  const ask = useSyncExternalStore(subscribeAttachAsk, getAttachAsk, getAttachAsk);
  const tr = useTr();
  const folder = useLocalFolderState();
  const collab = useCloudStore((s) => s.cloudKind) === 'collab';
  const [remember, setRemember] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { setRemember(false); setBusy(false); setErr(null); }, [ask]);
  useEffect(() => {
    if (!ask) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') ask.resolve(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ask]);
  if (!ask) return null;

  const base = readFolderPath(folder.rootId) ?? folder.name ?? '';
  const sep = base.includes('/') && !base.includes('\\') ? '/' : '\\';
  const dest = base ? base.replace(/[\\/]+$/, '') + sep + mapFolderName() + sep : mapFolderName() + sep;
  const names = ask.names.slice(0, 3).join(', ') + (ask.names.length > 3 ? ' …' : '');

  const pickLocal = () => {
    if (busy) return;
    setBusy(true); setErr(null);
    // 브라우저 쓰기 허용 창은 클릭과 같은 순간에 열어야 한다(첫 await 전).
    requestLocalWritePermission().then((ok) => {
      if (ok) ask.resolve({ target: 'local', remember });
      else { setBusy(false); setErr(tr('localAtt.ask.denied')); }
    });
  };
  const option = (primary: boolean) => ({
    display: 'grid', gap: 3, textAlign: 'left' as const, width: '100%', padding: '10px 12px', borderRadius: 8,
    border: `1px solid ${primary ? t.primaryBorder : t.border}`, background: primary ? t.primarySoft : t.surface,
    color: t.text, cursor: busy ? 'default' : 'pointer', fontFamily: 'inherit',
  });
  return (
    <DialogFrame t={t} testId="attach-target-dialog" width="min(440px, 92vw)" onClose={() => ask.resolve(null)}
      title={`📎 ${tr('localAtt.ask.title')}`}>
      <div style={{ display: 'grid', gap: 8 }}>
        <div style={{ fontSize: 12, color: t.textMuted, overflowWrap: 'anywhere' }}>{tr('localAtt.ask.files', { n: ask.names.length })}: <b style={{ color: t.text }}>{names}</b></div>
        <button type="button" data-testid="attach-target-cloud" autoFocus disabled={busy} style={option(true)}
          onClick={() => ask.resolve({ target: 'cloud', remember })}>
          <b style={{ fontSize: 13 }}>☁ {tr('localAtt.ask.cloud')}</b>
          <span style={{ fontSize: 11.5, color: t.textMuted }}>{tr('localAtt.ask.cloudHelp')}</span>
        </button>
        <button type="button" data-testid="attach-target-local" disabled={busy} style={option(false)} onClick={pickLocal}>
          <b style={{ fontSize: 13 }}>💻 {tr('localAtt.ask.local')}</b>
          <span style={{ fontSize: 11.5, color: t.textMuted }}>{tr('localAtt.ask.localHelp')}</span>
          <span data-testid="attach-target-dest" style={{ fontSize: 11.5, fontFamily: 'ui-monospace, Consolas, monospace', color: t.text, overflowWrap: 'anywhere' }}>{dest}</span>
        </button>
        {collab && <div role="note" style={{ fontSize: 11.5, color: '#B45309' }}>{tr('localAtt.ask.collab')}</div>}
        {err && <div role="alert" style={{ fontSize: 11.5, color: t.danger }}>{err}</div>}
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: t.text }}>
          <input type="checkbox" data-testid="attach-target-remember" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          {tr('localAtt.ask.remember')}
        </label>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button type="button" data-testid="attach-target-cancel" onClick={() => ask.resolve(null)}
            style={{ height: 30, padding: '0 12px', borderRadius: 7, border: `1px solid ${t.border}`, background: t.surface, color: t.text, cursor: 'pointer', fontFamily: 'inherit' }}>
            {tr('common.cancel')}
          </button>
        </div>
      </div>
    </DialogFrame>
  );
}
