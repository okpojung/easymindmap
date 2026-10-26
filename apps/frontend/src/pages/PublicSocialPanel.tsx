// 공개 맵 화면의 설명문 · 태그 · 좋아요 · 댓글 (2026-10-26, 지식창고 단계 3).
//
// 맵은 화면 전체를 쓰는 iframe 이라, 이것은 **오른쪽 아래 작은 단추**로 떠 있다가 누르면
// 옆 서랍으로 열린다. 읽기는 누구나(로그인 없이), 좋아요·댓글 쓰기는 로그인 회원만.
// 댓글은 게시자가 허용한 맵에서만 보인다(서버가 같은 규칙으로 막는다).
import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { cloudApi, CloudError, type PublishedComment, type PublishedMap } from '@/services/cloud/apiClient';
import { authEnabled, useAuthStore } from '@/stores/authStore';
import { useTr } from '@/i18n';

const C = { bg: '#FFFDF8', bd: '#E4D9C3', text: '#3A3226', muted: '#8B7D68', primary: '#B45309', soft: '#FEF3C7' };

export function PublicSocialPanel({ data }: { data: PublishedMap }) {
  const tr = useTr();
  const session = useAuthStore((s) => s.session);
  const guest = useAuthStore((s) => s.guest);
  const member = authEnabled && !!session && !guest;
  const [open, setOpen] = useState(false);
  const [likes, setLikes] = useState(data.likeCount ?? 0);
  const [liked, setLiked] = useState(false);
  const [commentCount, setCommentCount] = useState(data.commentCount ?? 0);
  const [items, setItems] = useState<PublishedComment[] | null>(null);
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const commentsOn = !!data.commentsEnabled;

  useEffect(() => {
    if (!member) return;
    cloudApi.publishedMe(data.publishId).then((m) => { setLiked(m.liked); setLikes(m.likeCount); }, () => undefined);
  }, [member, data.publishId]);

  const loadComments = useCallback(async () => {
    if (!commentsOn) return;
    try {
      const r = await cloudApi.publishedComments(data.publishId, member);
      setItems(r.items); setCommentCount(r.items.length);
    } catch (e) { setErr(e instanceof CloudError ? e.message : tr('publish.social.loadFail')); }
  }, [commentsOn, data.publishId, member, tr]);
  useEffect(() => { if (open && items === null) void loadComments(); }, [open, items, loadComments]);

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true); setErr(null);
    try { await fn(); } catch (e) { setErr(e instanceof CloudError ? e.message : tr('publish.social.fail')); } finally { setBusy(false); }
  };
  const toggleLike = () => void act(async () => {
    const r = await cloudApi.setPublishedLike(data.publishId, !liked);
    setLiked(r.liked); setLikes(r.likeCount);
  });
  const send = () => void act(async () => {
    await cloudApi.addPublishedComment(data.publishId, draft.trim());
    setDraft(''); await loadComments();
  });
  const saveEdit = (id: string) => void act(async () => {
    await cloudApi.editPublishedComment(data.publishId, id, editText.trim());
    setEditing(null); await loadComments();
  });
  const remove = (id: string) => {
    if (!confirm(tr('publish.social.confirmDelete'))) return;
    void act(async () => { await cloudApi.deletePublishedComment(data.publishId, id); await loadComments(); });
  };

  const pill: CSSProperties = {
    position: 'fixed', right: 14, bottom: 40, zIndex: 12, display: 'flex', alignItems: 'center', gap: 10,
    padding: '7px 14px', borderRadius: 999, border: `1px solid ${C.bd}`, background: C.bg, color: C.text,
    boxShadow: '0 4px 14px rgba(0,0,0,0.12)', cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
  };
  const btn: CSSProperties = { height: 28, padding: '0 10px', borderRadius: 6, border: `1px solid ${C.bd}`, background: '#fff', color: C.text, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' };
  const when = (iso: string) => new Date(iso).toLocaleString();

  if (!open) {
    return (
      <button type="button" data-testid="public-social-open" style={pill} onClick={() => setOpen(true)} title={tr('publish.social.openTip')}>
        <span>{liked ? '❤️' : '🤍'} {likes}</span>
        {commentsOn && <span>💬 {commentCount}</span>}
        <span style={{ color: C.muted, fontWeight: 600 }}>{tr('publish.social.open')}</span>
      </button>
    );
  }
  return (
    <aside data-testid="public-social-panel" style={{
      position: 'fixed', top: 'calc(var(--viewer-bar, 0px) + var(--viewer-paid, 0px))', right: 0, bottom: 0, zIndex: 12,
      width: 'min(380px, 100vw)', background: C.bg, borderLeft: `1px solid ${C.bd}`, boxShadow: '-6px 0 18px rgba(0,0,0,0.10)',
      display: 'flex', flexDirection: 'column', fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif', color: C.text,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderBottom: `1px solid ${C.bd}` }}>
        <b style={{ flex: 1, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{data.title}</b>
        <button type="button" data-testid="public-social-close" style={btn} onClick={() => setOpen(false)}>{tr('publish.social.close')}</button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
        {data.description && <p data-testid="public-social-desc" style={{ margin: '0 0 10px', fontSize: 13.5, lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>{data.description}</p>}
        {(data.tags?.length ?? 0) > 0 && (
          <div data-testid="public-social-tags" style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 12 }}>
            {data.tags!.map((x) => <span key={x} style={{ fontSize: 11.5, padding: '2px 8px', borderRadius: 10, background: C.soft, color: C.primary }}>#{x}</span>)}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          {member ? (
            <button type="button" data-testid="public-social-like" disabled={busy} onClick={toggleLike}
              style={{ ...btn, height: 32, fontWeight: 700, borderColor: liked ? '#F87171' : C.bd, background: liked ? '#FEF2F2' : '#fff' }}>
              {liked ? '❤️' : '🤍'} {tr('publish.social.like')} {likes}
            </button>
          ) : (
            <span data-testid="public-social-likes" style={{ fontSize: 13 }}>🤍 {likes}</span>
          )}
          {!member && <a href="/" style={{ fontSize: 12, color: C.primary }}>{tr('publish.social.loginToReact')}</a>}
        </div>
        {!commentsOn ? (
          <div style={{ fontSize: 12.5, color: C.muted }}>{tr('publish.social.commentsOff')}</div>
        ) : (
          <>
            <b style={{ fontSize: 13 }}>{tr('publish.social.comments', { n: commentCount })}</b>
            {items === null && <div style={{ fontSize: 12.5, color: C.muted, marginTop: 6 }}>{tr('publish.social.loading')}</div>}
            {items && items.length === 0 && <div style={{ fontSize: 12.5, color: C.muted, marginTop: 6 }}>{tr('publish.social.empty')}</div>}
            {items?.map((c) => (
              <div key={c.id} data-testid="public-social-comment" style={{ padding: '8px 0', borderBottom: `1px solid ${C.bd}` }}>
                <div style={{ fontSize: 11.5, color: C.muted, display: 'flex', gap: 6, alignItems: 'center' }}>
                  <b style={{ color: C.text }}>{c.author.avatarUrl ? `${c.author.avatarUrl} ` : ''}{c.author.displayName}</b>
                  <span>{when(c.createdAt)}{c.updatedAt !== c.createdAt ? ` · ${tr('publish.social.edited')}` : ''}</span>
                  <span style={{ flex: 1 }} />
                  {c.mine && editing !== c.id && <button type="button" style={{ ...btn, height: 22, fontSize: 11 }} onClick={() => { setEditing(c.id); setEditText(c.body); }}>{tr('publish.social.edit')}</button>}
                  {c.canDelete && <button type="button" style={{ ...btn, height: 22, fontSize: 11, color: '#B91C1C' }} onClick={() => remove(c.id)}>{tr('publish.social.delete')}</button>}
                </div>
                {editing === c.id ? (
                  <div style={{ marginTop: 4 }}>
                    <textarea value={editText} maxLength={1000} rows={3} onChange={(e) => setEditText(e.target.value)} style={{ width: '100%', boxSizing: 'border-box', fontFamily: 'inherit', fontSize: 13 }} />
                    <button type="button" style={btn} disabled={busy || !editText.trim()} onClick={() => saveEdit(c.id)}>{tr('publish.social.save')}</button>{' '}
                    <button type="button" style={btn} onClick={() => setEditing(null)}>{tr('publish.social.cancel')}</button>
                  </div>
                ) : (
                  <div style={{ fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap', marginTop: 3, wordBreak: 'break-word' }}>{c.body}</div>
                )}
              </div>
            ))}
          </>
        )}
        {err && <div role="status" style={{ marginTop: 8, fontSize: 12.5, color: '#DC2626' }}>{err}</div>}
      </div>
      {commentsOn && (
        <div style={{ borderTop: `1px solid ${C.bd}`, padding: 10 }}>
          {member ? (
            <div style={{ display: 'flex', gap: 6 }}>
              <textarea data-testid="public-social-input" value={draft} maxLength={1000} rows={2} placeholder={tr('publish.social.placeholder')}
                onChange={(e) => setDraft(e.target.value)} style={{ flex: 1, fontFamily: 'inherit', fontSize: 13, borderRadius: 6, border: `1px solid ${C.bd}`, padding: 6, resize: 'vertical' }} />
              <button type="button" data-testid="public-social-send" disabled={busy || !draft.trim()} onClick={send}
                style={{ ...btn, height: 'auto', background: C.primary, color: '#fff', border: 'none', fontWeight: 700, padding: '0 14px' }}>{tr('publish.social.send')}</button>
            </div>
          ) : (
            <a href="/" style={{ fontSize: 12.5, color: C.primary }}>{tr('publish.social.loginToComment')}</a>
          )}
        </div>
      )}
    </aside>
  );
}
