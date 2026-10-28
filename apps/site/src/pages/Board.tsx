import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ApiError, fetchComments, fetchPost, fetchPosts, fetchRecentNotices,
  type CommentItem, type NoticeItem, type PostDetail, type PostItem,
} from '../community-api';
import { BOARDS, appBoardUrl, boardPath as rawBoardPath, normalizeBoard, type BoardId } from '../community-rules';
import { href as localHref } from '../i18n';
const boardPath = (...args: Parameters<typeof rawBoardPath>) => localHref(rawBoardPath(...args));
import { GITHUB_URL } from '../config';
import { BoardMarkdown, unusedAttachments } from './BoardMarkdown';
import { formatDate, pageText } from '../i18n/pages';

const C = pageText().common;
const T = pageText().board;
/** 게시판 이름은 사전에서 — community-rules.js 의 한국어 label 은 규칙·시험용으로 그대로 둔다 */
const boardLabel = (id: BoardId) => T.names[id] ?? '';

/** 주소가 곧 상태다 — `/board?b=free&q=…`, 글은 `/board?b=free&post=<id>` */
function readUrl() {
  const p = new URLSearchParams(window.location.search);
  return { board: normalizeBoard(p.get('b')), post: p.get('post'), q: p.get('q') ?? '' };
}

function useBoardUrl() {
  const [state, setState] = useState(readUrl);
  useEffect(() => {
    const on = () => setState(readUrl());
    window.addEventListener('popstate', on);
    return () => window.removeEventListener('popstate', on);
  }, []);
  const go = useCallback((to: string, replace = false) => {
    if (replace) window.history.replaceState({}, '', to); else window.history.pushState({}, '', to);
    setState(readUrl());
    if (!replace) window.scrollTo(0, 0);
  }, []);
  return { ...state, go };
}

/** 같은 페이지 안 이동 — 새 탭·가운데 클릭은 브라우저에 맡긴다 */
function onInternal(go: (to: string) => void, to: string) {
  return (e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    go(to);
  };
}

function RecentNotices({ go }: { go: (to: string) => void }) {
  const [items, setItems] = useState<NoticeItem[] | null>(null);
  useEffect(() => {
    let live = true;
    fetchRecentNotices(3).then(r => { if (live) setItems(r.items); }).catch(() => { if (live) setItems([]); });
    return () => { live = false; };
  }, []);
  if (!items || items.length === 0) return null;
  return (
    <section className="cm-notices" aria-label={T.noticesAria}>
      <strong>{T.noticesLabel}</strong>
      <ul>
        {items.map(n => {
          const to = boardPath('notice', { post: n.id });
          return (
            <li key={n.id}>
              <a href={to} onClick={onInternal(go, to)}>
                {n.pinned && <span className="cm-pin">{T.pinned}</span>}
                <span className="cm-notice-title">{n.title}</span>
                <span className="cm-date">{formatDate(n.createdAt)}</span>
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function PostList({ board, q, go }: { board: BoardId; q: string; go: (to: string, replace?: boolean) => void }) {
  const [items, setItems] = useState<PostItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [term, setTerm] = useState(q);
  const gen = useRef(0);

  const load = useCallback(async (after: string | null) => {
    const mine = gen.current += 1;
    setLoading(true); setError(null);
    try {
      const page = await fetchPosts(board, after, q);
      if (gen.current !== mine) return;
      setItems(prev => (after ? [...prev, ...page.items] : page.items));
      setCursor(page.nextCursor);
    } catch (e) {
      if (gen.current !== mine) return;
      setError(e instanceof Error ? e.message : C.listLoadFailed);
    } finally {
      if (gen.current === mine) { setLoading(false); setReady(true); }
    }
  }, [board, q]);

  useEffect(() => { setReady(false); setItems([]); setCursor(null); void load(null); }, [load]);
  useEffect(() => { setTerm(q); }, [q, board]);
  useEffect(() => {
    const t = window.setTimeout(() => { if (term.trim() !== q) go(boardPath(board, { q: term.trim() || undefined }), true); }, 300);
    return () => window.clearTimeout(t);
  }, [term, q, board, go]);

  const meta = BOARDS.find(b => b.id === board)!;
  return (
    <>
      <div className="cm-toolbar">
        <label className="searchbox">
          <span className="ico" aria-hidden="true">🔍</span>
          <input type="search" value={term} onChange={e => setTerm(e.target.value)} placeholder={T.searchPlaceholder} aria-label={T.searchAria(boardLabel(meta.id))} maxLength={100} />
          {term && <button type="button" className="clear" onClick={() => setTerm('')} aria-label={C.clearSearch}>✕</button>}
        </label>
        {meta.writable && (
          <a className="btn" href={appBoardUrl(board, { write: true })}>{T.write}</a>
        )}
      </div>
      {meta.writable && <p className="cm-hint">{T.writeHint}</p>}
      {board === 'bug' && (
        <p className="cm-hint">{T.bugHint(<a href={`${GITHUB_URL}/issues`} target="_blank" rel="noopener noreferrer">GitHub Issues ↗</a>)}</p>
      )}

      {error && (
        <div className="note err"><b>{error}</b>
          <div style={{ marginTop: 12 }}><button className="btn ghost" onClick={() => void load(null)}>{C.retry}</button></div>
        </div>
      )}
      {!error && ready && items.length === 0 && (
        <div className="note"><b>{q ? T.noResults(q) : T.empty(boardLabel(meta.id))}</b>
          {meta.writable && !q && <div style={{ marginTop: 6 }}>{T.firstPost}</div>}
        </div>
      )}
      {items.length > 0 && (
        <ul className="cm-list">
          {items.map(p => {
            const to = boardPath(board, { post: p.id });
            return (
              <li key={p.id} className={p.pinned ? 'pinned' : undefined}>
                <a href={to} onClick={onInternal(go, to)}>
                  <span className="cm-title">
                    {p.pinned && <span className="cm-pin">{T.pinned}</span>}
                    {p.title}
                    {p.commentCount > 0 && <span className="cm-count" aria-label={T.commentCountAria(p.commentCount)}>[{p.commentCount}]</span>}
                    {p.attachmentCount > 0 && <span className="cm-attach" aria-label={T.hasPhotoAria}>📷</span>}
                  </span>
                  {p.excerpt && <span className="cm-excerpt">{p.excerpt}</span>}
                  <span className="cm-meta">{p.author.avatarUrl && <span aria-hidden="true">{p.author.avatarUrl} </span>}{p.author.displayName} · {formatDate(p.createdAt)}</span>
                </a>
              </li>
            );
          })}
        </ul>
      )}
      {cursor && !error && (
        <div className="more"><button className="btn ghost" disabled={loading} onClick={() => void load(cursor)}>{loading ? C.loading : C.more}</button></div>
      )}
      {!ready && !error && <p className="cm-loading">{C.loading}</p>}
    </>
  );
}

function PostView({ board, id, go }: { board: BoardId; id: string; go: (to: string) => void }) {
  const [post, setPost] = useState<PostDetail | null>(null);
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState<{ status: number; message: string } | null>(null);

  useEffect(() => {
    let live = true;
    setPost(null); setError(null); setComments([]); setCursor(null);
    fetchPost(id).then(p => {
      if (!live) return;
      setPost(p);
      // 주소의 게시판과 실제 글의 게시판이 다르면 실제 쪽으로 맞춘다
      if (p.board !== board) window.history.replaceState({}, '', boardPath(p.board, { post: p.id }));
      return fetchComments(id, null).then(c => { if (live) { setComments(c.items); setCursor(c.nextCursor); } });
    }).catch(e => { if (live) setError({ status: e instanceof ApiError ? e.status : 0, message: e instanceof Error ? e.message : T.postLoadFailed }); });
    return () => { live = false; };
  }, [id, board]);

  const back = boardPath(post?.board ?? board);
  const moreComments = () => { if (cursor) fetchComments(id, cursor).then(c => { setComments(prev => [...prev, ...c.items]); setCursor(c.nextCursor); }).catch(() => undefined); };

  return (
    <article className="cm-post">
      <a className="cm-back" href={back} onClick={onInternal(go, back)}>{T.backToList(boardLabel(post?.board ?? board))}</a>
      {error && (
        <div className="note err"><b>{error.status === 404 ? T.notFound : error.message}</b></div>
      )}
      {!error && !post && <p className="cm-loading">{C.loading}</p>}
      {post && (
        <>
          <header className="cm-post-head">
            <span className="cm-board">{boardLabel(post.board)}</span>
            <h1>{post.pinned && <span className="cm-pin">{T.pinned}</span>}{post.title}</h1>
            <p className="cm-meta">{post.author.avatarUrl && <span aria-hidden="true">{post.author.avatarUrl} </span>}{post.author.displayName} · {formatDate(post.createdAt)}{post.updatedAt !== post.createdAt && T.edited}</p>
          </header>
          {/* 본문은 Markdown(계약 v0.4). HTML 원문은 그리지 않는다. */}
          <BoardMarkdown body={post.body} attachments={post.attachments} />
          {unusedAttachments(post.body, post.attachments).length > 0 && (
            <div className="cm-photos">
              {unusedAttachments(post.body, post.attachments).map(a => <a key={a.id} href={a.url} target="_blank" rel="noopener noreferrer"><img src={a.url} alt={T.photoAlt} width={a.width} height={a.height} loading="lazy" /></a>)}
            </div>
          )}
          <section className="cm-comments" id="comments" aria-label={T.commentsAria}>
            <div className="cm-comments-head">
              <h2>{T.commentsTitle(post.commentCount)}</h2>
              <a className="btn ghost" href={appBoardUrl(post.board, { post: post.id })}>{T.writeComment}</a>
            </div>
            {comments.length === 0 && <p className="cm-hint">{T.noComments}</p>}
            <ul>
              {comments.map(c => (
                <li key={c.id}>
                  <p className="cm-meta">{c.author.avatarUrl && <span aria-hidden="true">{c.author.avatarUrl} </span>}<b>{c.author.displayName}</b> · {formatDate(c.createdAt)}</p>
                  <div className="cm-body">{c.body}</div>
                </li>
              ))}
            </ul>
            {cursor && <div className="more"><button className="btn ghost" onClick={moreComments}>{T.moreComments}</button></div>}
            <p className="cm-hint">{T.commentHint}</p>
          </section>
        </>
      )}
    </article>
  );
}

export default function Board() {
  const { board, post, q, go } = useBoardUrl();
  useEffect(() => { document.title = T.docTitle(boardLabel(board)); }, [board]);
  return (
    <div className="cm">
      <section className="wrap head">
        <h1>{T.title}</h1>
        <p>{T.intro}</p>
      </section>
      <section className="wrap">
        <RecentNotices go={go} />
        <nav className="cm-tabs" aria-label={T.tabsAria}>
          {BOARDS.map(b => {
            const to = boardPath(b.id);
            return <a key={b.id} href={to} aria-current={b.id === board ? 'page' : undefined} onClick={onInternal(go, to)}>{boardLabel(b.id)}</a>;
          })}
        </nav>
        {post ? <PostView board={board} id={post} go={go} /> : <PostList key={board} board={board} q={q} go={go} />}
        <aside className="cm-ask">
          <span>{T.askText}</span>
          <a className="btn ghost" href={localHref('/contact')}>{T.askButton}</a>
        </aside>
      </section>
    </div>
  );
}
