import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { turnstileSiteKey } from '../community-rules';

/**
 * Cloudflare Turnstile 위젯 — 문의하기 스팸 방지.
 * 토큰은 한 번만 쓸 수 있으므로 보낸 뒤에는 reset() 으로 새 토큰을 받는다.
 */
interface TurnstileApi {
  render(el: HTMLElement, opts: Record<string, unknown>): string;
  reset(id?: string): void;
  remove(id?: string): void;
}
declare global { interface Window { turnstile?: TurnstileApi } }

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
let loading: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SCRIPT_SRC;
    s.async = true;
    s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('turnstile')));
    s.onerror = () => { loading = null; reject(new Error('turnstile')); };
    document.head.appendChild(s);
  });
  return loading;
}

export interface TurnstileHandle { reset(): void }

export const Turnstile = forwardRef<TurnstileHandle, { onToken: (token: string) => void }>(function Turnstile({ onToken }, ref) {
  const box = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const cb = useRef(onToken); cb.current = onToken;
  const [failed, setFailed] = useState(false);

  useImperativeHandle(ref, () => ({
    reset() { cb.current(''); if (widget.current && window.turnstile) window.turnstile.reset(widget.current); },
  }), []);

  useEffect(() => {
    let live = true;
    loadTurnstile().then(ts => {
      if (!live || !box.current) return;
      widget.current = ts.render(box.current, {
        sitekey: turnstileSiteKey(window.location.hostname, import.meta.env.VITE_TURNSTILE_SITE_KEY),
        language: 'ko',
        callback: (t: string) => cb.current(t),
        'expired-callback': () => cb.current(''),
        'error-callback': () => { cb.current(''); },
      });
    }).catch(() => { if (live) setFailed(true); });
    return () => { live = false; if (widget.current && window.turnstile) window.turnstile.remove(widget.current); widget.current = null; };
  }, []);

  return (
    <div className="cm-turnstile">
      <div ref={box} />
      {failed && <p className="cm-error" role="alert">스팸 방지 확인 도구를 불러오지 못했습니다. 광고 차단 프로그램을 끄거나 잠시 뒤 새로고침해 주세요.</p>}
    </div>
  );
});
