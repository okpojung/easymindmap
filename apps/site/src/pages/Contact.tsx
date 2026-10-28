import { useEffect, useRef, useState } from 'react';
import { ApiError, sendInquiry } from '../community-api';
import { INQUIRY_CATEGORIES, INQUIRY_LIMITS, inquiryPayload, validateInquiry, type InquiryForm } from '../community-rules';
import { Link } from '../App';
import { Turnstile, type TurnstileHandle } from './Turnstile';
import { pageText } from '../i18n/pages';

const T = pageText().contact;

/**
 * 입력 검사 결과를 그 언어 문장으로 — community-rules.js 의 문장(한국어)은 시험이 지키므로 그대로 두고,
 * 걸린 칸과 입력값으로 어느 검사였는지 다시 가려 사전 문장을 고른다(검사 순서는 validateInquiry 와 같다).
 */
function inquiryMessage(bad: { field: keyof InquiryForm; message: string }, form: InquiryForm): string {
  const E = T.errors;
  const L = INQUIRY_LIMITS;
  switch (bad.field) {
    case 'name': return form.name.trim() ? E.nameTooLong(L.nameMax) : E.nameRequired;
    case 'email': return E.emailInvalid;
    case 'category': return E.categoryRequired;
    case 'body': {
      const n = form.body.trim().length;
      if (n < L.bodyMin) return E.bodyTooShort(L.bodyMin);
      if (n > L.bodyMax) return E.bodyTooLong(L.bodyMax);
      return E.tooManyLinks(L.linksMax);
    }
    case 'privacyConsent': return E.consentRequired;
    default: return bad.message;
  }
}

const EMPTY: InquiryForm = { name: '', email: '', category: '', body: '', privacyConsent: false, website: '' };

/**
 * 문의하기 — 접수되면 관리자 메일로 전달된다(계약 v0.3 §3).
 * 스팸 방지: 숨은 입력칸(website), 화면을 연 시각(formOpenedAt), 서버의 속도 제한·링크 수 제한.
 */
export default function Contact() {
  const [form, setForm] = useState<InquiryForm>(EMPTY);
  const [error, setError] = useState<{ field?: string; message: string } | null>(null);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const openedAt = useRef(Date.now());
  const [token, setToken] = useState('');
  const captcha = useRef<TurnstileHandle>(null);
  useEffect(() => { document.title = T.docTitle; }, []);

  const set = <K extends keyof InquiryForm>(k: K, v: InquiryForm[K]) => { setForm(f => ({ ...f, [k]: v })); if (error?.field === k) setError(null); };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sending) return;
    const bad = validateInquiry(form);
    if (bad) { setError({ field: bad.field, message: inquiryMessage(bad, form) }); document.getElementById(`inq-${bad.field}`)?.focus(); return; }
    if (!token) { setError({ message: T.captchaFirst }); return; }
    setSending(true); setError(null);
    try {
      await sendInquiry(inquiryPayload(form, openedAt.current, token));
      setDone(true); setForm(EMPTY); window.scrollTo(0, 0);
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) setError({ message: T.tooMany(err.retryAfter ? Math.ceil(err.retryAfter / 60) : null) });
      else setError({ message: err instanceof Error ? err.message : T.sendFailed });
    } finally { setSending(false); captcha.current?.reset(); }
  };

  const len = form.body.trim().length;
  return (
    <div className="cm">
      <section className="wrap head">
        <h1>{T.title}</h1>
        <p>{T.intro}</p>
      </section>
      <section className="wrap">
        {done ? (
          <div className="note cm-done">
            <b>{T.doneTitle}</b>
            <div style={{ marginTop: 6 }}>{T.doneBody}</div>
            <div className="row" style={{ marginTop: 16, display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button className="btn ghost" onClick={() => { setDone(false); openedAt.current = Date.now(); }}>{T.another}</button>
              <Link className="btn ghost" to="/board">{T.viewBoard}</Link>
            </div>
          </div>
        ) : (
          <form className="cm-form" onSubmit={submit} noValidate>
            <p className="cm-hint">{T.boardHint((text) => <Link to="/board">{text}</Link>)}</p>
            <label>{T.name} <input id="inq-name" value={form.name} maxLength={INQUIRY_LIMITS.nameMax} autoComplete="name" onChange={e => set('name', e.target.value)} aria-invalid={error?.field === 'name'} /></label>
            <label>{T.email} <input id="inq-email" type="email" value={form.email} autoComplete="email" onChange={e => set('email', e.target.value)} aria-invalid={error?.field === 'email'} /></label>
            <label>{T.category}
              <select id="inq-category" value={form.category} onChange={e => set('category', e.target.value as InquiryForm['category'])} aria-invalid={error?.field === 'category'}>
                <option value="">{T.choose}</option>
                {INQUIRY_CATEGORIES.map(c => <option key={c.id} value={c.id}>{T.categories[c.id]}</option>)}
              </select>
            </label>
            <label>{T.body}
              <textarea id="inq-body" rows={8} value={form.body} maxLength={INQUIRY_LIMITS.bodyMax} onChange={e => set('body', e.target.value)} aria-invalid={error?.field === 'body'} aria-describedby="inq-body-help" />
              <span id="inq-body-help" className="cm-hint">{T.bodyHelp(len, INQUIRY_LIMITS.bodyMax, INQUIRY_LIMITS.bodyMin, INQUIRY_LIMITS.linksMax)}</span>
            </label>
            {/* 사람은 보지 못하는 칸 — 채워져 오면 서버가 스팸으로 분류한다 */}
            <div className="cm-hp" aria-hidden="true">
              <label>{T.honeypot} <input name="website" tabIndex={-1} autoComplete="off" value={form.website} onChange={e => set('website', e.target.value)} /></label>
            </div>
            <fieldset className="cm-consent">
              <legend>{T.consentLegend}</legend>
              <ul>
                {T.consentItems.map((x) => <li key={x}>{x}</li>)}
              </ul>
              <label className="cm-check"><input id="inq-privacyConsent" type="checkbox" checked={form.privacyConsent} onChange={e => set('privacyConsent', e.target.checked)} aria-invalid={error?.field === 'privacyConsent'} /> {T.consentAgree}</label>
            </fieldset>
            <Turnstile ref={captcha} onToken={setToken} />
            {error && <p className="cm-error" role="alert">{error.message}</p>}
            <button className="btn" type="submit" disabled={sending || !token} title={token ? undefined : T.captchaTitle}>{sending ? T.sending : T.send}</button>
          </form>
        )}
      </section>
    </div>
  );
}
