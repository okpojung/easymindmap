import { tr } from '@/i18n';
import { passwordValidationError } from '@/export/encryptedHtml';

/** Passwords are transient. Never store/log them or expose raw crypto errors. */
export function withHtmlPassword<T>(options: {
  confirm: boolean;
  run: (password: string) => Promise<T>;
}): Promise<T | null> {
  return new Promise((resolve) => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = document.createElement('dialog');
    dialog.dataset.testid = 'html-password-dialog';
    dialog.setAttribute('aria-labelledby', 'html-password-title');
    Object.assign(dialog.style, { width: 'min(440px, calc(100vw - 32px))', boxSizing: 'border-box', border: '1px solid #94a3b8', borderRadius: '12px', padding: '22px', background: '#fff', color: '#172033', maxHeight: '90vh', overflow: 'auto', fontFamily: 'inherit' });
    const form = document.createElement('form');
    form.autocomplete = 'off';
    const title = document.createElement('h2');
    title.id = 'html-password-title';
    title.textContent = tr(options.confirm ? 'io.encrypted.export' : 'io.encrypted.import');
    title.style.fontSize = '18px';
    form.append(title);
    for (const key of ['protect', 'links', 'lost', 'server']) {
      const note = document.createElement('p');
      note.textContent = tr('io.encrypted.' + key);
      Object.assign(note.style, { fontSize: '12px', lineHeight: '1.55', margin: '6px 0' });
      form.append(note);
    }
    const makeInput = (key: string) => {
      const label = document.createElement('label');
      label.textContent = tr('io.encrypted.' + key);
      Object.assign(label.style, { display: 'block', fontSize: '13px', marginTop: '12px' });
      const input = document.createElement('input');
      input.type = 'password';
      input.autocomplete = options.confirm ? 'new-password' : 'off';
      input.spellcheck = false;
      input.autocapitalize = 'off';
      input.setAttribute('data-testid', 'html-password-' + key);
      Object.assign(input.style, { display: 'block', width: '100%', boxSizing: 'border-box', marginTop: '5px', padding: '9px', fontSize: '16px', border: '1px solid #94a3b8', borderRadius: '6px', color: '#172033', background: '#fff' });
      label.append(input); form.append(label); return input;
    };
    const password = makeInput('password');
    const confirmation = options.confirm ? makeInput('confirm') : null;
    if (options.confirm) {
      const rule = document.createElement('p');
      rule.textContent = tr('io.encrypted.rule');
      Object.assign(rule.style, { fontSize: '12px', lineHeight: '1.5' });
      form.append(rule);
    }
    const showLabel = document.createElement('label');
    const show = document.createElement('input');
    show.type = 'checkbox';
    showLabel.append(show, document.createTextNode(tr('io.encrypted.show')));
    showLabel.style.fontSize = '13px';
    show.onchange = () => { password.type = show.checked ? 'text' : 'password'; if (confirmation) confirmation.type = password.type; };
    form.append(showLabel);
    const error = document.createElement('p');
    error.setAttribute('role', 'alert');
    Object.assign(error.style, { color: '#b91c1c', fontSize: '13px', lineHeight: '1.5' });
    form.append(error);
    const buttons = document.createElement('div');
    Object.assign(buttons.style, { display: 'flex', gap: '10px', justifyContent: 'flex-end' });
    const cancel = document.createElement('button');
    cancel.type = 'button'; cancel.textContent = tr('common.cancel');
    const submit = document.createElement('button');
    submit.type = 'submit';
    const actionLabel = tr(options.confirm ? 'io.encrypted.exportAction' : 'io.encrypted.importAction');
    submit.textContent = actionLabel;
    for (const button of [cancel, submit]) Object.assign(button.style, { padding: '9px 14px', borderRadius: '6px', cursor: 'pointer', border: '1px solid #94a3b8', background: '#f1f5f9', color: '#172033' });
    buttons.append(cancel, submit); form.append(buttons); dialog.append(form); document.body.append(dialog);
    let busy = false;
    let settled = false;
    const clear = () => { password.value = ''; if (confirmation) confirmation.value = ''; show.checked = false; password.type = 'password'; if (confirmation) confirmation.type = 'password'; };
    const finish = (result: T | null) => {
      if (settled) return;
      settled = true; clear(); dialog.remove(); previous?.focus(); resolve(result);
    };
    const setBusy = (value: boolean) => {
      busy = value;
      for (const input of [password, confirmation, show, cancel, submit]) if (input) input.disabled = value;
      submit.textContent = value ? tr('io.encrypted.busy') : actionLabel;
      form.setAttribute('aria-busy', String(value));
    };
    cancel.onclick = () => { if (!busy) finish(null); };
    dialog.addEventListener('cancel', (event) => { event.preventDefault(); if (!busy) finish(null); });
    form.onsubmit = async (event) => {
      event.preventDefault(); if (busy) return;
      error.textContent = '';
      if (!password.value) { error.textContent = tr('io.encrypted.empty'); password.focus(); return; }
      if (options.confirm && passwordValidationError(password.value)) { error.textContent = tr('io.encrypted.rule'); password.focus(); return; }
      if (confirmation && confirmation.value !== password.value) { error.textContent = tr('io.encrypted.mismatch'); confirmation.value = ''; confirmation.focus(); return; }
      let secret = password.value;
      clear(); setBusy(true);
      try {
        const pending = options.run(secret);
        secret = '';
        finish(await pending);
      } catch {
        secret = ''; clear(); setBusy(false);
        error.textContent = tr(options.confirm ? 'io.encrypted.exportFailed' : 'io.encrypted.importFailed');
        password.focus();
      }
    };
    dialog.showModal(); password.focus();
  });
}
