import type { SampleMap } from '@/editor/__samples__/types';
import { tr } from '@/i18n';
import { withHtmlPassword } from './htmlPasswordDialog';
import { prepareHtmlAssets, defaultSelectedHtmlAssets, releaseHtmlAssets, HTML_SELECTED_LIMIT, HTML_ALL_LIMIT, type HtmlAssetPolicy, type PreparedHtmlAssets } from '@/export/htmlAssetPolicy';
import { loadHtmlExportResource, downloadPreparedHtmlExport, type HtmlExportView } from '@/export/htmlAssetExport';
import type { ExportPackage } from '@/export/exportHtml';

const mib = (bytes: number): string => (bytes / (1024 * 1024)).toFixed(2) + ' MiB';

/** Transient export configuration. Raw assets and password are not persisted. */
export function withHtmlAssetExport(options: {
  map: SampleMap; view: HtmlExportView; protected: boolean;
}): Promise<ExportPackage | null> {
  return new Promise(resolve => {
    const previous = document.activeElement as HTMLElement | null;
    const abort = new AbortController();
    const dialog = document.createElement('dialog');
    dialog.dataset.testid = 'html-asset-export-dialog';
    dialog.setAttribute('aria-labelledby', 'html-asset-export-title');
    Object.assign(dialog.style, { width: 'min(760px, calc(100vw - 28px))', maxHeight: '90vh', boxSizing: 'border-box', overflow: 'auto', border: '1px solid #94a3b8', borderRadius: '12px', padding: '22px', background: '#fff', color: '#172033', fontFamily: 'inherit' });
    const form = document.createElement('form');
    const heading = document.createElement('h2');
    heading.id = 'html-asset-export-title';
    heading.textContent = tr(options.protected ? 'io.assets.titleProtected' : 'io.assets.titlePlain');
    Object.assign(heading.style, { fontSize: '19px', margin: '0 0 12px' });
    const note = document.createElement('p');
    note.textContent = tr(options.protected ? 'io.assets.protectedHint' : 'io.assets.plainHint');
    Object.assign(note.style, { fontSize: '13px', lineHeight: '1.6' });
    const limits = document.createElement('p');
    limits.textContent = tr('io.assets.limits');
    Object.assign(limits.style, { fontSize: '12px', color: '#526070', lineHeight: '1.6' });
    const choices = document.createElement('fieldset');
    Object.assign(choices.style, { border: '1px solid #d1d9e1', borderRadius: '8px', padding: '10px 14px' });
    const legend = document.createElement('legend');
    legend.textContent = tr('io.assets.policy'); choices.append(legend);
    let mode: HtmlAssetPolicy['mode'] = 'selected';
    let selected = new Set<string>();
    const radios = new Map<HtmlAssetPolicy['mode'], HTMLInputElement>();
    for (const value of ['all', 'selected', 'none'] as const) {
      const label = document.createElement('label');
      Object.assign(label.style, { display: 'block', margin: '7px 0', fontSize: '14px' });
      const radio = document.createElement('input');
      radio.type = 'radio'; radio.name = 'html-asset-policy'; radio.value = value;
      radio.checked = value === mode; radio.disabled = true;
      radio.dataset.testid = 'html-policy-' + value;
      radio.onchange = () => { mode = value; error.textContent = ''; render(); };
      label.append(radio, document.createTextNode(' ' + tr('io.assets.' + value)));
      choices.append(label); radios.set(value, radio);
    }
    const status = document.createElement('p');
    status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    status.dataset.testid = 'html-assets-summary';
    Object.assign(status.style, { fontSize: '13px', lineHeight: '1.6' });
    const estimate = document.createElement('p');
    Object.assign(estimate.style, { fontSize: '12px', lineHeight: '1.6', color: '#526070' });
    const list = document.createElement('div');
    list.setAttribute('role', 'group'); list.setAttribute('aria-label', tr('io.assets.files'));
    Object.assign(list.style, { maxHeight: '260px', overflow: 'auto', border: '1px solid #d1d9e1', borderRadius: '8px', padding: '5px 10px' });
    const error = document.createElement('p'); error.setAttribute('role', 'alert');
    Object.assign(error.style, { color: '#b91c1c', fontSize: '13px', lineHeight: '1.6' });
    const buttons = document.createElement('div');
    Object.assign(buttons.style, { display: 'flex', gap: '10px', justifyContent: 'flex-end' });
    const cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = tr('common.cancel');
    const submit = document.createElement('button'); submit.type = 'submit'; submit.textContent = tr('io.assets.save'); submit.disabled = true;
    for (const button of [cancel, submit]) Object.assign(button.style, { padding: '9px 14px', borderRadius: '6px', cursor: 'pointer', border: '1px solid #94a3b8', background: '#f1f5f9', color: '#172033' });
    buttons.append(cancel, submit);
    form.append(heading, note, limits, choices, status, estimate, list, error, buttons);
    dialog.append(form); document.body.append(dialog);
    let prepared: PreparedHtmlAssets | null = null;
    let busy = false, settled = false;
    const finish = (result: ExportPackage | null) => {
      if (settled) return;
      settled = true; abort.abort();
      if (prepared) releaseHtmlAssets(prepared);
      prepared = null; dialog.remove(); previous?.focus(); resolve(result);
    };
    const policy = (): HtmlAssetPolicy => mode === 'selected' ? { mode, selectedIds: [...selected] } : { mode };
    const embeddedAssets = () => prepared!.assets.filter(asset => mode === 'all' || (mode === 'selected' && selected.has(asset.id)));
    const render = () => {
      if (!prepared || settled) return;
      const included = embeddedAssets();
      const bytes = included.reduce((sum, asset) => sum + asset.bytes.length, 0);
      const remaining = prepared.assets.length - included.length;
      const repeatedBytes = included.reduce((sum, asset) => sum + asset.bytes.length * asset.references, 0);
      const repeatedLimit = repeatedBytes > HTML_ALL_LIMIT;
      const tooLarge = repeatedLimit || (mode === 'all' ? bytes > HTML_ALL_LIMIT : bytes > HTML_SELECTED_LIMIT);
      for (const radio of radios.values()) radio.disabled = busy;
      status.textContent = tr('io.assets.summary', { included: included.length, separate: remaining, size: mib(bytes), total: mib(prepared.totalBytes) });
      const approximate = 256 * 1024 + Math.ceil(repeatedBytes / 3) * 4 + prepared.totalBytes - bytes;
      const estimateBytes = options.protected && remaining === 0 ? Math.ceil(approximate / 3) * 4 : approximate;
      estimate.textContent = tr('io.assets.estimate', { size: mib(estimateBytes) }) + ' ' + tr('io.assets.processing');
      if (tooLarge) error.textContent = tr(repeatedLimit ? 'io.assets.repeatedLimit' : 'io.assets.chooseError');
      list.replaceChildren();
      if (!prepared.assets.length) {
        const empty = document.createElement('p'); empty.textContent = tr('io.assets.empty'); list.append(empty);
      }
      for (const asset of prepared.assets) {
        const row = document.createElement('label');
        Object.assign(row.style, { display: 'flex', gap: '9px', alignItems: 'baseline', padding: '7px 0', borderBottom: '1px solid #edf0f3', fontSize: '13px', overflowWrap: 'anywhere' });
        const check = document.createElement('input'); check.type = 'checkbox';
        check.checked = mode === 'all' || (mode === 'selected' && selected.has(asset.id));
        check.disabled = busy || mode !== 'selected' || (!check.checked && bytes + asset.bytes.length > HTML_SELECTED_LIMIT);
        check.setAttribute('aria-label', tr('io.assets.include', { name: asset.name }));
        check.dataset.assetId = asset.id;
        check.onchange = () => { if (check.checked) selected.add(asset.id); else selected.delete(asset.id); error.textContent = ''; render(); };
        const name = document.createElement('span'); name.textContent = asset.name; name.style.flex = '1';
        const detail = document.createElement('span');
        detail.textContent = tr(asset.kind === 'image' ? 'io.assets.image' : 'io.assets.attachment') + ' · ' + mib(asset.bytes.length);
        detail.style.color = '#526070';
        row.append(check, name, detail); list.append(row);
      }
      submit.disabled = busy || tooLarge;
      cancel.disabled = busy;
      submit.textContent = tr(busy ? 'io.assets.busy' : 'io.assets.save');
      form.setAttribute('aria-busy', String(busy));
    };
    cancel.onclick = () => { if (!busy) finish(null); };
    dialog.addEventListener('cancel', event => { event.preventDefault(); if (!busy) finish(null); });
    form.onsubmit = async event => {
      event.preventDefault(); if (busy || !prepared) return;
      const snapshot = prepared;
      const chosen = policy();
      const hasSeparate = embeddedAssets().length < snapshot.assets.length;
      error.textContent = ''; busy = true; render();
      try {
        const result = options.protected
          ? await withHtmlPassword({
              confirm: true,
              title: tr(hasSeparate ? 'io.assets.titleProtectedZip' : 'io.encrypted.export'),
              protectText: tr('io.assets.protectedHint'),
              run: password => downloadPreparedHtmlExport(snapshot, chosen, options.view, password),
            })
          : await downloadPreparedHtmlExport(snapshot, chosen, options.view);
        if (result) finish(result);
      } catch {
        error.textContent = tr('io.assets.failed');
      } finally { if (!settled) { busy = false; render(); } }
    };
    dialog.showModal(); cancel.focus();
    status.textContent = tr('io.assets.preparing');
    void prepareHtmlAssets(options.map,
      (src, remaining) => loadHtmlExportResource(src, remaining, abort.signal),
      (done, total) => { if (!settled) status.textContent = tr('io.assets.loading', { done, total }); },
    ).then(result => {
      if (settled) { releaseHtmlAssets(result); return; }
      prepared = result; selected = new Set(defaultSelectedHtmlAssets(result)); render();
    }).catch(() => {
      if (settled) return;
      status.textContent = ''; error.textContent = tr('io.assets.resourceFailed');
    });
  });
}
