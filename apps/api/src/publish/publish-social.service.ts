// 지식창고 설명문·태그·좋아요·댓글 (2026-10-26, 홈페이지 API 계약 v0.4 §4 · 단계 3).
//
//   published_maps.description / tags / comments_enabled   — 게시자가 정한다 (PATCH /maps/:id/publish/meta)
//   published_map_likes (map_id, user_id)                   — 로그인 회원 누구나, 맵마다 한 번
//   published_map_comments                                   — 로그인 회원 누구나, **게시자가 허용한 맵만**
//
// 좋아요·댓글은 퍼블리싱 **행**이 아니라 **맵**에 붙는다(map_id). 비공개로 내렸다 다시 열어도
// 같은 주소이고, 같은 맵이기 때문이다.
//
// ★ 표·칸이 없는 서버(델타 미적용)에서는 **조용히 꺼진다** — 목록은 예전 칸만 주고
//   (설명 null · 태그 [] · 0건 · 댓글 닫힘), 쓰기 문은 503 으로 "준비 안 됨"을 말한다.
//   퍼블리싱 자체가 멈추지 않게 하는 publish.service 의 규칙과 같다.
import {
  BadRequestException, ForbiddenException, HttpException, HttpStatus, Injectable,
  NotFoundException, ServiceUnavailableException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { columnReady, tableReady } from '../common/table-ready';
import { findAccessibleMap } from '../maps/map-access';

const PUBLISHED = 'public.published_maps';
const LIKES = 'public.published_map_likes';
const COMMENTS = 'public.published_map_comments';

export const DESCRIPTION_MAX = 500;
export const TAGS_MAX = 10;
export const TAG_MAX_LEN = 30;
export const COMMENT_MAX = 1000;
/** 한 회원이 한 시간에 남길 수 있는 댓글 수 (도배 방지) */
const COMMENTS_PER_HOUR = 30;
/** 댓글 하나에 넣을 수 있는 링크 수 */
const COMMENT_LINKS_MAX = 3;

export interface PublishMeta { description: string | null; tags: string[]; commentsEnabled: boolean }
export interface MapCounts { likeCount: number; commentCount: number }

/** 제어문자 → 공백, 앞뒤 공백 정리 (줄바꿈은 살린다) */
function cleanText(v: string, max: number): string {
  return v.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, ' ').trim().slice(0, max);
}

/**
 * 태그 한 개 정규화 — 앞의 `#` 를 떼고, 소문자로, 안쪽 공백은 하나로.
 * 글자·숫자·공백·`-`·`_`·`.`·`+` 만 남긴다(한글 포함). 빈 값이면 null.
 */
export function normalizeTag(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const t = raw.normalize('NFC').replace(/^#+/, '').toLowerCase()
    .replace(/[^\p{L}\p{N} _\-.+]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, TAG_MAX_LEN).trim();
  return t || null;
}

/** 태그 목록 정규화 — 중복 제거, 최대 10개. 배열이 아니면 null(잘못된 입력) */
export function normalizeTags(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const out: string[] = [];
  for (const r of raw) {
    const t = normalizeTag(r);
    if (t && !out.includes(t)) out.push(t);
    if (out.length >= TAGS_MAX) break;
  }
  return out;
}

/** 작성자 이름 — 별명, 없으면 실명 가운데를 가린 형태(정*영), 둘 다 없으면 '회원' (게시판과 같은 규칙) */
export function authorName(displayName: string | null | undefined, fullName: string | null | undefined): string {
  const d = (displayName ?? '').trim();
  if (d) return d.slice(0, 40);
  const f = (fullName ?? '').trim();
  if (!f) return '회원';
  const ch = [...f];
  if (ch.length === 1) return ch[0];
  if (ch.length === 2) return `${ch[0]}*`;
  return `${ch[0]}${'*'.repeat(ch.length - 2)}${ch[ch.length - 1]}`;
}

/** 아바타는 **이모지만** 내보낸다 (사진 주소는 공개 목록에 싣지 않는다) */
function emojiAvatar(v: string | null | undefined): string | null {
  const s = (v ?? '').trim();
  return s && s.length <= 16 && !/[/:.]/.test(s) ? s : null;
}

@Injectable()
export class PublishSocialService {
  constructor(private readonly db: DatabaseService) {}

  /** 설명문·태그·댓글 허용 칸이 있는가 */
  async metaReady(): Promise<boolean> {
    return (await columnReady(this.db, PUBLISHED, 'description'))
      && (await columnReady(this.db, PUBLISHED, 'tags'))
      && (await columnReady(this.db, PUBLISHED, 'comments_enabled'));
  }
  async likesReady(): Promise<boolean> { return tableReady(this.db, LIKES); }
  async commentsReady(): Promise<boolean> { return tableReady(this.db, COMMENTS); }

  /** 손님에게 열린 퍼블리싱 — publish.service 의 openWhere 와 같은 조건 */
  private async openRow(publishId: string): Promise<{ map_id: string; owner_id: string; comments_enabled: boolean } | null> {
    const vis = (await columnReady(this.db, PUBLISHED, 'visibility')) ? `AND p.visibility IN ('public', 'paid')` : '';
    const ce = (await this.metaReady()) ? 'p.comments_enabled' : 'false';
    const { rows } = await this.db.query<{ map_id: string; owner_id: string; comments_enabled: boolean }>(
      `SELECT p.map_id, m.owner_id, ${ce} AS comments_enabled
         FROM ${PUBLISHED} p JOIN public.maps m ON m.id = p.map_id
        WHERE p.publish_id = $1 AND p.unpublished_at IS NULL AND m.deleted_at IS NULL ${vis}`,
      [publishId],
    );
    return rows[0] ?? null;
  }

  private async requireOpen(publishId: string) {
    const r = await this.openRow(publishId);
    if (!r) throw new NotFoundException('페이지를 찾을 수 없습니다.');
    return r;
  }

  // ── 게시자: 설명문·태그·댓글 허용 ─────────────────────────────
  async metaFor(mapId: string): Promise<PublishMeta | null> {
    if (!(await this.metaReady())) return null;
    const { rows } = await this.db.query<{ description: string | null; tags: string[] | null; comments_enabled: boolean }>(
      `SELECT description, tags, comments_enabled FROM ${PUBLISHED}
        WHERE map_id = $1 AND unpublished_at IS NULL ORDER BY published_at DESC LIMIT 1`, [mapId]);
    const r = rows[0];
    return r ? { description: r.description, tags: r.tags ?? [], commentsEnabled: !!r.comments_enabled } : null;
  }

  async setMeta(userId: string, mapId: string, body: { description?: unknown; tags?: unknown; commentsEnabled?: unknown }): Promise<PublishMeta> {
    if (!(await this.metaReady())) throw new ServiceUnavailableException('이 서버에는 아직 설명문·태그 기능이 준비되지 않았습니다.');
    const map = await findAccessibleMap<{ id: string }>(this.db, mapId, userId);
    if (!map) throw new NotFoundException('맵을 찾을 수 없거나 권한이 없습니다.');
    if (map.access_role !== 'owner') throw new ForbiddenException('설명문·태그는 맵 주인만 바꿀 수 있습니다.');
    const sets: string[] = [];
    const params: unknown[] = [mapId];
    if (body.description !== undefined) {
      if (body.description !== null && typeof body.description !== 'string') throw new BadRequestException('description 은 글자 또는 null 이어야 합니다.');
      const d = typeof body.description === 'string' ? cleanText(body.description, DESCRIPTION_MAX + 1) : '';
      if (d.length > DESCRIPTION_MAX) throw new BadRequestException(`설명문은 ${DESCRIPTION_MAX}자까지 쓸 수 있습니다.`);
      params.push(d || null); sets.push(`description = $${params.length}`);
    }
    if (body.tags !== undefined) {
      const t = normalizeTags(body.tags);
      if (!t) throw new BadRequestException('tags 는 글자 목록이어야 합니다.');
      params.push(t); sets.push(`tags = $${params.length}::text[]`);
    }
    if (body.commentsEnabled !== undefined) {
      if (typeof body.commentsEnabled !== 'boolean') throw new BadRequestException('commentsEnabled 는 true 또는 false 여야 합니다.');
      params.push(body.commentsEnabled); sets.push(`comments_enabled = $${params.length}`);
    }
    if (!sets.length) throw new BadRequestException('바꿀 값(description · tags · commentsEnabled)을 주세요.');
    const { rowCount } = await this.db.query(
      `UPDATE ${PUBLISHED} SET ${sets.join(', ')} WHERE map_id = $1 AND unpublished_at IS NULL`, params);
    if (!rowCount) throw new BadRequestException('퍼블리싱된 맵에서만 설명문·태그를 정할 수 있습니다.');
    return (await this.metaFor(mapId))!;
  }

  // ── 목록에 싣는 숫자 ──────────────────────────────────────────
  async countsFor(mapIds: string[]): Promise<Map<string, MapCounts>> {
    const out = new Map<string, MapCounts>();
    for (const id of mapIds) out.set(id, { likeCount: 0, commentCount: 0 });
    if (!mapIds.length) return out;
    if (await this.likesReady()) {
      const { rows } = await this.db.query<{ map_id: string; n: number }>(
        `SELECT map_id, count(*)::int AS n FROM ${LIKES} WHERE map_id = ANY($1::uuid[]) GROUP BY map_id`, [mapIds]);
      for (const r of rows) out.get(r.map_id)!.likeCount = r.n;
    }
    if (await this.commentsReady()) {
      const { rows } = await this.db.query<{ map_id: string; n: number }>(
        `SELECT map_id, count(*)::int AS n FROM ${COMMENTS}
          WHERE map_id = ANY($1::uuid[]) AND hidden_at IS NULL AND deleted_at IS NULL GROUP BY map_id`, [mapIds]);
      for (const r of rows) out.get(r.map_id)!.commentCount = r.n;
    }
    return out;
  }

  /** 지식창고 태그 — 진열·공개 중인 맵에서 많이 쓰인 순 */
  async tags(limit: number): Promise<{ items: { tag: string; count: number }[] }> {
    if (!(await this.metaReady()) || !(await columnReady(this.db, PUBLISHED, 'listed'))) return { items: [] };
    const vis = (await columnReady(this.db, PUBLISHED, 'visibility')) ? `AND p.visibility IN ('public', 'paid')` : '';
    const { rows } = await this.db.query<{ tag: string; count: number }>(
      `SELECT t.tag, count(*)::int AS count
         FROM ${PUBLISHED} p JOIN public.maps m ON m.id = p.map_id
         CROSS JOIN LATERAL unnest(p.tags) AS t(tag)
        WHERE p.listed AND p.unpublished_at IS NULL AND m.deleted_at IS NULL ${vis}
     GROUP BY t.tag ORDER BY count(*) DESC, t.tag ASC LIMIT $1`, [limit]);
    return { items: rows };
  }

  // ── 좋아요 ────────────────────────────────────────────────────
  private async likeState(mapId: string, userId: string | null): Promise<{ liked: boolean; likeCount: number }> {
    const { rows } = await this.db.query<{ n: number; mine: boolean }>(
      `SELECT count(*)::int AS n, coalesce(bool_or(user_id = $2), false) AS mine FROM ${LIKES} WHERE map_id = $1`,
      [mapId, userId]);
    return { liked: !!rows[0]?.mine, likeCount: rows[0]?.n ?? 0 };
  }

  async me(publishId: string, userId: string) {
    const r = await this.requireOpen(publishId);
    const likes = (await this.likesReady()) ? await this.likeState(r.map_id, userId) : { liked: false, likeCount: 0 };
    return { ...likes, isOwner: r.owner_id === userId, commentsEnabled: r.comments_enabled };
  }

  async setLike(publishId: string, userId: string, on: boolean) {
    if (!(await this.likesReady())) throw new ServiceUnavailableException('이 서버에는 아직 좋아요 기능이 준비되지 않았습니다.');
    const r = await this.requireOpen(publishId);
    if (on) {
      await this.db.query(`INSERT INTO ${LIKES} (map_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [r.map_id, userId]);
    } else {
      await this.db.query(`DELETE FROM ${LIKES} WHERE map_id = $1 AND user_id = $2`, [r.map_id, userId]);
    }
    return this.likeState(r.map_id, userId);
  }

  // ── 댓글 ──────────────────────────────────────────────────────
  async listComments(publishId: string, limitRaw: unknown, cursor: unknown, viewerId: string | null) {
    if (!(await this.commentsReady())) throw new NotFoundException('댓글을 볼 수 없습니다.');
    const r = await this.requireOpen(publishId);
    if (!r.comments_enabled) throw new NotFoundException('이 맵은 댓글을 받지 않습니다.');
    const limit = Math.min(100, Math.max(1, Number.parseInt(String(limitRaw ?? ''), 10) || 50));
    const params: unknown[] = [r.map_id, limit + 1];
    let after = '';
    if (typeof cursor === 'string' && cursor.includes('|')) {
      const [at, id] = cursor.split('|');
      if (at && /^[0-9a-f-]{36}$/.test(id ?? '') && !Number.isNaN(Date.parse(at))) {
        params.push(at, id); after = `AND (c.created_at, c.id) > ($3::timestamptz, $4::uuid)`;
      }
    }
    const { rows } = await this.db.query<{
      id: string; body: string; created_at: Date; updated_at: Date; author_id: string | null;
      display_name: string | null; full_name: string | null; avatar: string | null;
    }>(
      `SELECT c.id, c.body, c.created_at, c.updated_at, c.author_id, u.display_name, u.full_name, u.avatar
         FROM ${COMMENTS} c LEFT JOIN public.users u ON u.id = c.author_id
        WHERE c.map_id = $1 AND c.hidden_at IS NULL AND c.deleted_at IS NULL ${after}
     ORDER BY c.created_at ASC, c.id ASC LIMIT $2`, params);
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    return {
      items: page.map((c) => ({
        id: c.id,
        author: { displayName: authorName(c.display_name, c.full_name), avatarUrl: emojiAvatar(c.avatar) },
        body: c.body,
        createdAt: c.created_at.toISOString(),
        updatedAt: c.updated_at.toISOString(),
        mine: !!viewerId && c.author_id === viewerId,
        /** 게시자는 자기 맵의 댓글을 지울 수 있다 */
        canDelete: !!viewerId && (c.author_id === viewerId || r.owner_id === viewerId),
      })),
      nextCursor: rows.length > limit && last ? `${last.created_at.toISOString()}|${last.id}` : null,
    };
  }

  private cleanComment(raw: unknown): string {
    if (typeof raw !== 'string') throw new BadRequestException('body 를 글자로 주세요.');
    const b = cleanText(raw, COMMENT_MAX + 1);
    if (!b) throw new BadRequestException('댓글 내용을 입력해 주세요.');
    if (b.length > COMMENT_MAX) throw new BadRequestException(`댓글은 ${COMMENT_MAX}자까지 쓸 수 있습니다.`);
    if ((b.match(/https?:\/\//gi) ?? []).length > COMMENT_LINKS_MAX) throw new BadRequestException(`댓글에는 링크를 ${COMMENT_LINKS_MAX}개까지 넣을 수 있습니다.`);
    return b;
  }

  async addComment(publishId: string, userId: string, raw: unknown) {
    if (!(await this.commentsReady())) throw new ServiceUnavailableException('이 서버에는 아직 댓글 기능이 준비되지 않았습니다.');
    const r = await this.requireOpen(publishId);
    if (!r.comments_enabled) throw new ForbiddenException('이 맵은 댓글을 받지 않습니다.');
    const body = this.cleanComment(raw);
    const { rows: rc } = await this.db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM ${COMMENTS} WHERE author_id = $1 AND created_at > now() - interval '1 hour'`, [userId]);
    if ((rc[0]?.n ?? 0) >= COMMENTS_PER_HOUR) {
      throw new HttpException('댓글을 너무 자주 쓰고 있습니다. 잠시 뒤에 다시 써 주세요.', HttpStatus.TOO_MANY_REQUESTS);
    }
    const { rows } = await this.db.query<{ id: string }>(
      `INSERT INTO ${COMMENTS} (map_id, author_id, body) VALUES ($1, $2, $3) RETURNING id`, [r.map_id, userId, body]);
    return { id: rows[0].id };
  }

  async editComment(publishId: string, userId: string, commentId: string, raw: unknown) {
    if (!(await this.commentsReady())) throw new ServiceUnavailableException('이 서버에는 아직 댓글 기능이 준비되지 않았습니다.');
    const r = await this.requireOpen(publishId);
    const body = this.cleanComment(raw);
    const { rowCount } = await this.db.query(
      `UPDATE ${COMMENTS} SET body = $1, updated_at = now()
        WHERE id = $2 AND map_id = $3 AND author_id = $4 AND deleted_at IS NULL AND hidden_at IS NULL`,
      [body, commentId, r.map_id, userId]);
    if (!rowCount) throw new NotFoundException('고칠 수 있는 댓글이 아닙니다.');
    return { ok: true };
  }

  /** 지우기 — 쓴 사람 또는 게시자. 행은 남기고 표시만 지운다(deleted_at) */
  async deleteComment(publishId: string, userId: string, commentId: string) {
    if (!(await this.commentsReady())) throw new ServiceUnavailableException('이 서버에는 아직 댓글 기능이 준비되지 않았습니다.');
    const r = await this.requireOpen(publishId);
    const ownerCan = r.owner_id === userId;
    const { rowCount } = await this.db.query(
      `UPDATE ${COMMENTS} SET deleted_at = now(), updated_at = now()
        WHERE id = $1 AND map_id = $2 AND deleted_at IS NULL AND (author_id = $3 OR $4::boolean)`,
      [commentId, r.map_id, userId, ownerCan]);
    if (!rowCount) throw new NotFoundException('지울 수 있는 댓글이 아닙니다.');
  }
}
