import { useEffect, useRef, useState } from 'react';
import { ApiError, sendInquiry } from '../community-api';
import { INQUIRY_CATEGORIES, INQUIRY_LIMITS, inquiryPayload, validateInquiry, type InquiryForm } from '../community-rules';
import { Link } from '../App';
import { Turnstile, type TurnstileHandle } from './Turnstile';

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
  useEffect(() => { document.title = '문의하기 | EasyMindMap'; }, []);

  const set = <K extends keyof InquiryForm>(k: K, v: InquiryForm[K]) => { setForm(f => ({ ...f, [k]: v })); if (error?.field === k) setError(null); };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sending) return;
    const bad = validateInquiry(form);
    if (bad) { setError(bad); document.getElementById(`inq-${bad.field}`)?.focus(); return; }
    if (!token) { setError({ message: '아래 스팸 방지 확인을 마친 뒤 보내 주세요.' }); return; }
    setSending(true); setError(null);
    try {
      await sendInquiry(inquiryPayload(form, openedAt.current, token));
      setDone(true); setForm(EMPTY); window.scrollTo(0, 0);
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) setError({ message: `문의가 너무 잦습니다. ${err.retryAfter ? `${Math.ceil(err.retryAfter / 60)}분 ` : '잠시 '}뒤에 다시 보내 주세요.` });
      else setError({ message: err instanceof Error ? err.message : '문의를 보내지 못했습니다.' });
    } finally { setSending(false); captcha.current?.reset(); }
  };

  const len = form.body.trim().length;
  return (
    <div className="cm">
      <section className="wrap head">
        <h1>문의하기</h1>
        <p>사용 방법, 오류, 요금, 제휴 등 궁금한 점을 남겨 주세요. 담당자가 확인한 뒤 입력하신 이메일로 답변드립니다.</p>
      </section>
      <section className="wrap">
        {done ? (
          <div className="note cm-done">
            <b>문의가 접수되었습니다.</b>
            <div style={{ marginTop: 6 }}>확인한 뒤 입력하신 이메일로 답변드리겠습니다.</div>
            <div className="row" style={{ marginTop: 16, display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button className="btn ghost" onClick={() => { setDone(false); openedAt.current = Date.now(); }}>다른 문의 쓰기</button>
              <Link className="btn ghost" to="/board">게시판 보기</Link>
            </div>
          </div>
        ) : (
          <form className="cm-form" onSubmit={submit} noValidate>
            <p className="cm-hint">사용 소감이나 버그는 <Link to="/board">게시판</Link>에 남기시면 다른 사용자와 함께 볼 수 있습니다.</p>
            <label>이름 <input id="inq-name" value={form.name} maxLength={INQUIRY_LIMITS.nameMax} autoComplete="name" onChange={e => set('name', e.target.value)} aria-invalid={error?.field === 'name'} /></label>
            <label>회신받을 이메일 <input id="inq-email" type="email" value={form.email} autoComplete="email" onChange={e => set('email', e.target.value)} aria-invalid={error?.field === 'email'} /></label>
            <label>문의 종류
              <select id="inq-category" value={form.category} onChange={e => set('category', e.target.value as InquiryForm['category'])} aria-invalid={error?.field === 'category'}>
                <option value="">골라 주세요</option>
                {INQUIRY_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </label>
            <label>문의 내용
              <textarea id="inq-body" rows={8} value={form.body} maxLength={INQUIRY_LIMITS.bodyMax} onChange={e => set('body', e.target.value)} aria-invalid={error?.field === 'body'} aria-describedby="inq-body-help" />
              <span id="inq-body-help" className="cm-hint">{len}/{INQUIRY_LIMITS.bodyMax}자 · {INQUIRY_LIMITS.bodyMin}자 이상, 링크는 {INQUIRY_LIMITS.linksMax}개까지</span>
            </label>
            {/* 사람은 보지 못하는 칸 — 채워져 오면 서버가 스팸으로 분류한다 */}
            <div className="cm-hp" aria-hidden="true">
              <label>웹사이트(비워 두세요) <input name="website" tabIndex={-1} autoComplete="off" value={form.website} onChange={e => set('website', e.target.value)} /></label>
            </div>
            <fieldset className="cm-consent">
              <legend>개인정보 수집·이용 동의 (필수)</legend>
              <ul>
                <li>수집 항목: 이름, 이메일, 문의 내용</li>
                <li>이용 목적: 문의 답변</li>
                <li>보관 기간: 처리 완료 후 1년</li>
                <li>동의하지 않으면 문의를 보낼 수 없습니다.</li>
              </ul>
              <label className="cm-check"><input id="inq-privacyConsent" type="checkbox" checked={form.privacyConsent} onChange={e => set('privacyConsent', e.target.checked)} aria-invalid={error?.field === 'privacyConsent'} /> 위 내용에 동의합니다.</label>
            </fieldset>
            <Turnstile ref={captcha} onToken={setToken} />
            {error && <p className="cm-error" role="alert">{error.message}</p>}
            <button className="btn" type="submit" disabled={sending || !token} title={token ? undefined : '스팸 방지 확인을 먼저 마쳐 주세요'}>{sending ? '보내는 중…' : '문의 보내기'}</button>
          </form>
        )}
      </section>
    </div>
  );
}
