import { API_URL } from './config';
import type { BoardId } from './community-rules';
import { pageText } from './i18n/pages';

/**
 * 홈페이지가 부르는 게시판·공지·문의 API (계약 v0.3 §2·§3).
 * www 는 읽기와 문의 보내기만 한다 — 쿠키·인증 헤더를 보내지 않는다.
 */
const BASE = `${API_URL}/v1`;

export interface Author { displayName: string; avatarUrl: string | null }
export interface NoticeItem { id: string; title: string; createdAt: string; pinned: boolean }
export interface PostItem {
  id: string; board: BoardId; title: string; excerpt: string; author: Author;
  createdAt: string; updatedAt: string; commentCount: number; attachmentCount: number; pinned: boolean;
}
export interface Attachment { id: string; url: string; width: number; height: number; mime: string }
export interface PostDetail extends PostItem { body: string; attachments: Attachment[] }
export interface CommentItem { id: string; author: Author; body: string; createdAt: string; updatedAt: string }
export interface Page<T> { items: T[]; nextCursor: string | null }

export class ApiError extends Error {
  constructor(public status: number, message: string, public retryAfter: number | null = null) { super(message); }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, { ...init, credentials: 'omit', headers: { Accept: 'application/json', ...(init?.headers ?? {}) } });
  } catch {
    throw new ApiError(0, pageText().api.network);
  }
  if (!res.ok) {
    let message = pageText().api.requestFailed(res.status);
    try { const j = await res.json() as { message?: unknown }; if (typeof j.message === 'string' && j.message) message = j.message; } catch { /* 본문 없음 */ }
    const ra = Number(res.headers.get('Retry-After'));
    throw new ApiError(res.status, message, Number.isFinite(ra) && ra > 0 ? ra : null);
  }
  return res.json() as Promise<T>;
}

export const fetchRecentNotices = (limit = 3) => call<{ items: NoticeItem[] }>(`/notices/recent?limit=${limit}`);

export function fetchPosts(board: BoardId, cursor: string | null, q: string, limit = 20) {
  const p = new URLSearchParams({ board, limit: String(limit) });
  if (cursor) p.set('cursor', cursor);
  if (q) p.set('q', q.slice(0, 100));
  return call<Page<PostItem>>(`/board/posts?${p}`);
}

export const fetchPost = (id: string) => call<PostDetail>(`/board/posts/${encodeURIComponent(id)}`);

export function fetchComments(id: string, cursor: string | null) {
  const p = new URLSearchParams({ limit: '50' });
  if (cursor) p.set('cursor', cursor);
  return call<Page<CommentItem>>(`/board/posts/${encodeURIComponent(id)}/comments?${p}`);
}

export const sendInquiry = (payload: object) => call<{ received: true }>('/inquiries', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
});
