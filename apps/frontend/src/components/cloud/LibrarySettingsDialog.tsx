import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import type { ThemeTokens } from '@/components/design-tokens/theme';
import { DialogFrame } from '@/components/ui/DialogFrame';
import { cloudApi, type PublishStatus } from '@/services/cloud/apiClient';
import { captureAuthIdentity, isAuthIdentityCurrent, useAuthStore } from '@/stores/authStore';
import { useCloudStore } from '@/stores/cloudStore';
import { tr as trNow, useTr } from '@/i18n';
import { libraryDraft, libraryMeta, libraryUnavailable, LibrarySaveError, saveLibrarySettings, shouldLockLibraryMap, type LibraryDraft } from './librarySettings';

type Props = { t: ThemeTokens; mapId: string; mapTitle: string; onClose: () => void; onSaved: (status: PublishStatus) => void; flash?: (message: string) => void };
const activeId = () => { const c = useCloudStore.getState(); return c.cloudMapId ?? c.readOnlyInfo?.mapId ?? null; };
const explain = (e: unknown) => e instanceof Error ? (e.message.startsWith('publish.') ? trNow(e.message) : e.message) : trNow('publish.err.request');
export function LibrarySettingsDialog(props: Props) {
  return <SettingsForTarget key={props.mapId} {...props} />;
}
function SettingsForTarget({ t, mapId, mapTitle, onClose, onSaved, flash }: Props) {
  const tr = useTr();
  const [target] = useState(() => ({ identity: captureAuthIdentity(), editor: activeId() }));
  const live = useRef(false);
  const expired = useRef(false);
  const busy = useRef(false);
  const panel = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useLayoutEffect(() => { closeRef.current = onClose; }, [onClose]);
  const [stale, setStale] = useState(false);
  const [status, setStatus] = useState<PublishStatus | null>(null);
  const [draft, setDraft] = useState<LibraryDraft | null>(null);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const current = () => live.current && !expired.current && isAuthIdentityCurrent(target.identity) && activeId() === target.editor;

  useLayoutEffect(() => {
    live.current = true;
    const expire = () => { if (!current()) { expired.current = true; setStale(true); } };
    const offAuth = useAuthStore.subscribe(expire), offMap = useCloudStore.subscribe(expire);
    expire();
    return () => { live.current = false; offAuth(); offMap(); };
  }, [target]);
  useLayoutEffect(() => {
    const previous = document.activeElement;
    const dialog = panel.current!.querySelector<HTMLElement>('[role="dialog"]')!;
    dialog.setAttribute('aria-labelledby', 'library-settings-heading');
    dialog.tabIndex = -1;
    dialog.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); if (!busy.current) closeRef.current(); }
      if (e.key !== 'Tab') return;
      const controls = Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled), textarea:not(:disabled), input:not(:disabled)'));
      const first = controls[0], last = controls[controls.length - 1];
      if (!first) { e.preventDefault(); dialog.focus(); return; }
      if (!controls.includes(document.activeElement as HTMLElement) || (e.shiftKey ? document.activeElement === first : document.activeElement === last)) {
        e.preventDefault(); (e.shiftKey ? last : first).focus();
      }
    };
    window.addEventListener('keydown', key, true);
    return () => { window.removeEventListener('keydown', key, true); if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); };
  }, []);
  useEffect(() => {
    let ignore = false;
    if (current()) cloudApi.publishStatus(mapId).then(s => {
      if (!ignore && current()) { setStatus(s); setDraft(d => d ?? libraryDraft(s)); }
    }).catch(e => { if (!ignore && current()) setError(explain(e)); });
    return () => { ignore = true; };
  }, [mapId, target, attempt]);

  function syncLock(s: PublishStatus) {
    const c = useCloudStore.getState();
    if (!current() || !shouldLockLibraryMap(mapId, s, c)) return;
    // Single update: do not transiently detach the current editor or exchange another map's lock.
    useCloudStore.setState({ cloudMapId: null, cloudTitle: null, cloudKind: 'solo', cloudFolderId: null,
      lastSavedAt: null, lastSavedVersion: null, error: null,
      readOnlyInfo: { mapId, title: c.cloudTitle ?? mapTitle, kind: c.cloudKind, viewer: false, reason: tr('publish.lockReason') } });
  }
  async function save() {
    if (!status || !draft || !current() || busy.current) return;
    setSaving(true); setError(''); setSaved(false);
    try {
      const result = await saveLibrarySettings(cloudApi, mapId, status, draft, current, busy);
      if (!result || !current()) return;
      syncLock(result); setStatus(result); setDraft(libraryDraft(result)); setSaved(true);
      onSaved(result); flash?.(tr('publish.library.saved'));
    } catch (e) {
      if (!current()) return;
      if (e instanceof LibrarySaveError) {
        const known = e.actual ?? e.confirmed;
        if (known) syncLock(known);
        setStatus(e.actual); // Keep the draft; require a successful read before retrying.
        const step = e.completed[e.completed.length - 1];
        setError([step && tr('publish.library.partial.' + step), explain(e.cause)].filter(Boolean).join(' '));
      } else setError(explain(e));
    } finally { if (live.current) setSaving(false); }
  }
  const blocked = status && libraryUnavailable(status);
  const editable = !stale && status && draft && !blocked;
  let invalid = '', dirty = false;
  if (editable && status && draft) {
    try { dirty = JSON.stringify(libraryMeta(draft)) !== JSON.stringify(libraryMeta(libraryDraft(status))) || draft.listed !== !!status.listed; }
    catch (e) { invalid = explain(e); }
  }
  const update = (patch: Partial<LibraryDraft>) => { setDraft(d => d && ({ ...d, ...patch })); setSaved(false); };
  const field: CSSProperties = { display: 'block', width: '100%', boxSizing: 'border-box', marginTop: 5, padding: '8px 10px', border: '1px solid ' + t.borderStrong, borderRadius: 6, background: t.surface, color: t.text, font: 'inherit' };
  const button: CSSProperties = { padding: '8px 14px', borderRadius: 7, border: '1px solid ' + t.borderStrong, background: t.surfaceAlt, color: t.text, font: 'inherit', cursor: 'pointer' };
  const close = () => { if (!busy.current) onClose(); };
  const disabled = (!dirty && !error) || !!invalid || saving;
  const footer = <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
    <button style={button} disabled={saving} onClick={close}>{tr('common.close')}</button>
    {editable && draft && status && <button data-testid="library-settings-save" disabled={disabled} onClick={() => void save()}
      style={{ ...button, fontWeight: 700, borderColor: t.primaryBorder, background: t.primarySoft, opacity: disabled ? .55 : 1 }}>
      {tr(saving ? 'publish.processing' : !!status.listed !== draft.listed ? (draft.listed ? 'publish.library.saveOn' : 'publish.library.saveOff') : 'publish.library.save')}
    </button>}
  </div>;
  return <div ref={panel} onClick={e => e.stopPropagation()}><DialogFrame t={t} testId="library-settings-dialog" zIndex={330}
    title={<span id="library-settings-heading">{tr('publish.library.settings')}</span>} subtitle={<span style={{ overflowWrap: 'anywhere' }}>{mapTitle}</span>}
    onClose={close} closeDisabled={saving} footer={footer}>
    <div style={{ display: 'grid', gap: 12, fontSize: 13, lineHeight: 1.5, overflowWrap: 'anywhere' }}>
      {stale ? <p role="alert">{tr('publish.library.stale')}</p> : <>
        {!status && !error && <p role="status">{tr('publish.checking')}</p>}
        {error && <div role="alert" style={{ color: t.danger }}>{error}</div>}
        {!status && error && <button style={button} onClick={() => { setError(''); setAttempt(n => n + 1); }}>{tr('common.retry')}</button>}
        {blocked && <p>{status?.blockedReason || tr(blocked)}</p>}
        {editable && draft && status && <>
          <label>{tr('publish.meta.desc')}<textarea data-testid="library-settings-description" rows={3} style={{ ...field, resize: 'vertical' }}
            disabled={saving} value={draft.description} onChange={e => update({ description: e.target.value })} /></label>
          <label>{tr('publish.meta.tags')}<input data-testid="library-settings-tags" style={field} placeholder={tr('publish.meta.tagsPh')}
            disabled={saving} value={draft.tags} onChange={e => update({ tags: e.target.value })} /></label>
          <label><input type="checkbox" data-testid="library-settings-comments" checked={draft.commentsEnabled} disabled={saving}
            onChange={e => update({ commentsEnabled: e.target.checked })} /> {tr('publish.meta.comments')}</label>
          <div style={{ background: t.surfaceAlt, border: '1px solid ' + t.border, borderRadius: 8, padding: 12 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 9, fontWeight: 700 }}><input type="checkbox" role="switch"
              style={{ appearance: 'none', flexShrink: 0, cursor: saving ? 'default' : 'pointer', width: 36, height: 22, margin: 0,
                borderRadius: 12, border: '1px solid ' + (draft.listed ? t.primaryBorder : t.borderStrong),
                background: 'radial-gradient(circle at ' + (draft.listed ? '25px' : '9px') + ' center, ' + t.text + ' 0 6px, transparent 7px), ' + (draft.listed ? t.primarySoft : t.surfaceSunken) }}
              data-testid="library-settings-listed" checked={draft.listed} disabled={saving}
              onChange={e => update({ listed: e.target.checked })} /> {tr('publish.library.switch')}</label>
            <div style={{ marginTop: 6, color: t.textMuted }}>{tr(draft.listed ? 'publish.library.listHint' : 'publish.library.unlistHint')}</div>
          </div>
          {!status.publishId && <div style={{ color: t.textMuted }}>{tr('publish.library.firstSave')}</div>}
          {invalid && <div role="alert" style={{ color: t.danger }}>{invalid}</div>}
          {saved && <div role="status">{tr('publish.library.saved')}</div>}
        </>}
      </>}
    </div>
  </DialogFrame></div>;
}
