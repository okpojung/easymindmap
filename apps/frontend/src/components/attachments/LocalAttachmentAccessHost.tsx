// 로컬 첨부 접근 오류 모달 — 서비스가 보내는 `emm:local-attachment-error` 를 듣는다.
//   · 페이지 로드 때 선택창/권한을 열지 않는다. [폴더 다시 연결] 을 눌렀을 때만 connectLocalFolder.
//   · 오류가 난 시점의 계정/맵(docEpoch)을 잡아 두고, 바뀌면 모달을 닫고 재시도도 하지 않는다.
import { useEffect, useRef, useState } from 'react';
import type { ThemeTokens } from '@/components/design-tokens/theme';
import { captureAuthIdentity, isAuthIdentityCurrent, useAuthStore, type AuthIdentity } from '@/stores/authStore';
import { useDocumentStore } from '@/stores/documentStore';
import { approveLocalAttachment, connectLocalFolder, getLocalFolderState, initializeLocalFolders, isLocalAttachmentUrl, localRootId } from '@/utils/localAttachments';
import { useTr } from '@/i18n';
import { hostActionFor, type HostReason } from './attachmentSource';
import './register';

type Reason = HostReason;
interface Pending { reason: Reason; url: string; retry?: () => void; identity: AuthIdentity; epoch: number }

const REASONS: readonly string[] = ['disconnected', 'missing', 'unsupported', 'changed', 'failed', 'unapproved'];

/** 순수 규칙 — 재연결 단추를 보일 수 있나 (신뢰할 수 있는 local URL + 루트 id 가 있을 때만) */
export function canOfferReconnect(reason: Reason, url: string): boolean {
  return hostActionFor(reason, validLocal(url)) === 'reconnect';
}
function validLocal(url: string): boolean {
  try { return isLocalAttachmentUrl(url) && !!localRootId(url); } catch { return false; }
}

export function LocalAttachmentAccessHost({ t }: { t: ThemeTokens }) {
  const tr = useTr();
  const [pending, setPending] = useState<Pending | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const generation = useAuthStore((s) => s.generation);
  const userId = useAuthStore((s) => s.session?.userId ?? null);
  const epoch = useDocumentStore((s) => s.docEpoch);
  const dialog = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(null);

  // 저장된 루트를 미리 읽어 둔다 — 선택창/권한 요청 없음
  useEffect(() => { void Promise.resolve(initializeLocalFolders()).catch(() => undefined); }, []);
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent).detail as { reason?: string; url?: string; retry?: () => void } | undefined;
      if (!d || typeof d.url !== 'string' || !REASONS.includes(d.reason ?? '')) return;
      opener.current = document.activeElement;
      setFailed(false); setBusy(false);
      setPending({ reason: d.reason as Reason, url: d.url, retry: typeof d.retry === 'function' ? d.retry : undefined, identity: captureAuthIdentity(), epoch: useDocumentStore.getState().docEpoch });
    };
    window.addEventListener('emm:local-attachment-error', on);
    return () => window.removeEventListener('emm:local-attachment-error', on);
  }, []);

  // 계정/맵이 바뀌면 닫는다
  useEffect(() => {
    setPending((p) => (p && (!isAuthIdentityCurrent(p.identity) || p.epoch !== useDocumentStore.getState().docEpoch) ? null : p));
  }, [generation, userId, epoch]);

  useEffect(() => { if (pending) dialog.current?.querySelector<HTMLButtonElement>('button')?.focus(); }, [pending]);

  if (!pending) return null;
  const close = () => { setPending(null); (opener.current as HTMLElement | null)?.focus?.(); };
  const action = hostActionFor(pending.reason, validLocal(pending.url));
  const offer = action === 'reconnect';
  const message = (pending.reason === 'disconnected' || pending.reason === 'unapproved') && action === 'none' ? tr('localAtt.host.failed') : tr('localAtt.host.' + pending.reason);
  // 파일 확인·연결 — approveLocalAttachment 는 클릭 핸들러에서 동기로 시작(선택창은 그 안에서 열린다).
  // 맵 메타데이터/프로필/내보내기로 자동 승인하지 않는다.
  const approve = () => {
    if (busy) return;
    const p = pending;
    if (!isAuthIdentityCurrent(p.identity) || p.epoch !== useDocumentStore.getState().docEpoch) { setPending(null); return; }
    setBusy(true); setFailed(false);
    let done: Promise<void>;
    try { done = Promise.resolve(approveLocalAttachment(p.url)); } catch { setBusy(false); setFailed(true); return; }
    done.then(() => {
      if (!isAuthIdentityCurrent(p.identity) || p.epoch !== useDocumentStore.getState().docEpoch) { setPending(null); return; }
      setPending(null);
      try { p.retry?.(); } catch { /* 서비스가 다시 오류 이벤트를 보낸다 */ }
    }, (e: unknown) => {
      if (!isAuthIdentityCurrent(p.identity) || p.epoch !== useDocumentStore.getState().docEpoch) { setPending(null); return; }
      setBusy(false);
      if ((e as { name?: string })?.name !== 'AbortError') setFailed(true);
    });
  };

  // 클릭 핸들러 안에서 동기로 connectLocalFolder 를 시작한다(사용자 제스처).
  const reconnect = () => {
    if (busy) return;
    const p = pending;
    if (!isAuthIdentityCurrent(p.identity) || p.epoch !== useDocumentStore.getState().docEpoch) { setPending(null); return; }
    setBusy(true); setFailed(false);
    const done = connectLocalFolder(localRootId(p.url));
    Promise.resolve(done).then((st) => {
      if (!isAuthIdentityCurrent(p.identity) || p.epoch !== useDocumentStore.getState().docEpoch) { setPending(null); return; }
      const ok = st ? st.status === 'connected' : getLocalFolderState(localRootId(p.url)).status === 'connected';
      if (!ok) { setBusy(false); setFailed(true); return; }
      setPending(null);
      try { p.retry?.(); } catch { /* 서비스가 다시 오류 이벤트를 보낸다 */ }
    }, () => { if (isAuthIdentityCurrent(p.identity)) { setBusy(false); setFailed(true); } else setPending(null); });
  };
  const btn = { height: 34, padding: '0 14px', borderRadius: 7, border: `1px solid ${t.border}`, background: t.surface, color: t.text, fontSize: 13, fontWeight: 600, cursor: 'pointer' } as const;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12 }}
      onPointerDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="local-att-title" aria-describedby="local-att-msg" data-testid="local-attachment-modal" data-reason={pending.reason}
        onKeyDown={(e) => {
          if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
          if (e.key === 'Tab') { const b = [...(dialog.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])]; if (!b.length) return; const i = b.indexOf(document.activeElement as HTMLButtonElement); const n = e.shiftKey ? (i <= 0 ? b.length - 1 : i - 1) : (i + 1) % b.length; e.preventDefault(); b[n].focus(); }
        }}
        style={{ width: 'min(380px, 100%)', background: t.surface, color: t.text, border: `1px solid ${t.border}`, borderRadius: 10, padding: 16, display: 'grid', gap: 10, boxShadow: t.shadowSm }}>
        <b id="local-att-title" style={{ fontSize: 14 }}>{tr('localAtt.host.title')}</b>
        <div id="local-att-msg" style={{ fontSize: 13, lineHeight: 1.55 }}>{message}</div>
        {failed && <div role="alert" data-testid="local-attachment-reconnect-failed" style={{ fontSize: 12, color: t.danger }}>{tr('localAtt.host.reconnectFailed')}</div>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          {action === 'approve' && <button type="button" data-testid="local-attachment-approve" disabled={busy} onClick={approve} style={{ ...btn, background: t.primary, color: '#fff', border: 'none', opacity: busy ? .6 : 1 }}>{tr('localAtt.host.approve')}</button>}
          {offer && <button type="button" data-testid="local-attachment-reconnect" disabled={busy} onClick={reconnect} style={{ ...btn, background: t.primary, color: '#fff', border: 'none', opacity: busy ? .6 : 1 }}>{tr('localAtt.host.reconnect')}</button>}
          <button type="button" data-testid="local-attachment-close" onClick={close} style={btn}>{tr('localAtt.host.close')}</button>
        </div>
      </div>
    </div>
  );
}
