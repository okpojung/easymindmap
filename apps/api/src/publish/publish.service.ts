/**
 * 무료 게시 — 맵을 **로그인 없이 읽을 수 있는 URL** 로 연다.
 * 설계: `docs/04-extensions/publish/27-publish-share.md` (PUBL-01~04)
 *
 * ★ 공개되는 것은 **저장된 문서 스냅샷 하나**다
 *   `map_documents.doc` 을 그대로 준다. 노드 표(`nodes`)를 따로 열지
 *   않는다 — 공개 화면은 에디터가 아니라 뷰어이고, 뷰어가 읽는 것은
 *   스냅샷 하나뿐이다. 열어 주는 문을 하나로 두면 "무엇이 새어 나가는가"
 *   를 한 줄로 답할 수 있다.
 *
 * ★ 무료 게시는 **지금 저장된 판**을 보여 준다
 *   저자가 고쳐 저장하면 공개 화면도 따라 바뀐다. 판을 박제하는 것은
 *   유료 게시(구매 = 다운로드)의 규칙이고 이번 범위가 아니다
 *   (`27a-paid-publish.md` §4).
 *
 * ★ 표가 없는 서버에서도 죽지 않는다
 *   `published_maps` 델타를 적용하지 않았으면 **게시 기능만** 꺼진다.
 *   맵 열기·저장이 함께 죽어서는 안 된다 (`common/table-ready.ts`).
 */

import {
  ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException,
} from '@nestjs/common';
import { randomInt } from 'node:crypto';
import { DatabaseService } from '../database/database.service';
import { tableReady } from '../common/table-ready';
import { findAccessibleMap } from '../maps/map-access';

const PUBLISHED_TABLE = 'public.published_maps';

/**
 * publish_id 문자 집합 — **헷갈리는 글자를 뺐다**(0/O, 1/l/I).
 * 링크를 눈으로 읽어 옮겨 적는 사람이 있고, 그때 틀리면 404 를 만난다.
 */
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
/** 길이 12 — 31^12 ≈ 7.8e17. 무작위로 찍어 맞히는 것은 사실상 불가능하다 */
const ID_LENGTH = 12;

function newPublishId(): string {
  let out = '';
  for (let i = 0; i < ID_LENGTH; i += 1) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

export interface PublishStatus {
  /** 이 서버에 게시 기능이 켜져 있는가 (표가 없으면 false) */
  available: boolean;
  publishId: string | null;
  publishedAt: string | null;
}

interface PublishedRow {
  publish_id: string;
  published_at: Date;
}

@Injectable()
export class PublishService {
  constructor(private readonly db: DatabaseService) {}

  /** 게시 기능을 쓸 수 있는 서버인가 */
  private async ready(): Promise<boolean> {
    return tableReady(this.db, PUBLISHED_TABLE);
  }

  private async requireReady(): Promise<void> {
    if (!(await this.ready())) {
      throw new ServiceUnavailableException(
        '이 서버에는 아직 게시 기능이 준비되지 않았습니다(published_maps 표 없음). 관리자에게 문의해 주세요.',
      );
    }
  }

  /**
   * 게시할 수 있는 사람인가 — **소유자만** (설계 §8).
   * 편집자·열람자는 남의 문서를 세상에 여는 결정을 할 수 없다.
   */
  private async requireOwner(userId: string, mapId: string): Promise<void> {
    const map = await findAccessibleMap<{ id: string }>(this.db, mapId, userId);
    // 없는 맵과 권한 없는 맵을 구분하지 않는다 (map-access.ts 와 같은 이유)
    if (!map) throw new NotFoundException('맵을 찾을 수 없거나 권한이 없습니다.');
    if (map.access_role !== 'owner') {
      throw new ForbiddenException('맵을 게시할 수 있는 사람은 맵 주인뿐입니다.');
    }
  }

  /**
   * PUBL-01 — 게시. **이미 게시 중이면 그 링크를 그대로 돌려준다.**
   *
   * 1단계 정책은 "맵 1개당 활성 링크 1개"다(설계 §6). 부를 때마다 새
   * 링크를 만들면 **이미 남에게 보낸 링크가 조용히 죽는다** — 버튼을 두
   * 번 누른 것만으로. 그래서 이 호출은 멱등으로 둔다. 링크를 새로 뽑는
   * 것(regenerate)은 "지금 링크를 죽이겠다"는 별개의 결정이라, 필요해질
   * 때 별도 요청으로 만든다.
   */
  async publish(userId: string, mapId: string): Promise<PublishStatus> {
    await this.requireReady();
    await this.requireOwner(userId, mapId);

    const cur = await this.activeRow(mapId);
    if (cur) return this.toStatus(cur);

    // publish_id 는 UNIQUE 다. 충돌 확률은 무시할 만하지만 0 은 아니므로
    // 몇 번 다시 뽑는다 — 여기서 포기하면 사용자에게는 이유 없는 실패다.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const publishId = newPublishId();
      try {
        const { rows } = await this.db.query<PublishedRow>(
          `INSERT INTO public.published_maps (map_id, publish_id)
                VALUES ($1, $2)
             RETURNING publish_id, published_at`,
          [mapId, publishId],
        );
        return this.toStatus(rows[0]);
      } catch (err) {
        // 23505 = unique_violation. 그 외 오류는 그대로 올린다 —
        // 삼키면 DB 장애가 "게시 실패"로 둔갑해 원인을 못 찾는다.
        const code = (err as { code?: string; cause?: { code?: string } }).code
          ?? (err as { cause?: { code?: string } }).cause?.code;
        if (code !== '23505') throw err;
      }
    }
    throw new ServiceUnavailableException('공개 링크를 만들지 못했습니다. 잠시 뒤 다시 시도해 주세요.');
  }

  /** PUBL-02 — 게시 취소. 이미 취소돼 있어도 성공이다(멱등) */
  async unpublish(userId: string, mapId: string): Promise<void> {
    await this.requireReady();
    await this.requireOwner(userId, mapId);
    await this.db.query(
      `UPDATE public.published_maps
          SET unpublished_at = NOW()
        WHERE map_id = $1 AND unpublished_at IS NULL`,
      [mapId],
    );
  }

  /**
   * 게시 상태 — 맵을 볼 수 있는 사람이면 누구나 읽는다.
   *
   * 게시 기능이 없는 서버에서는 `available:false` 를 **오류가 아니라
   * 값으로** 준다. 화면이 이 값을 보고 버튼을 감추면, 델타를 적용하지
   * 않은 서버에서 사용자가 눌러 보고 나서야 실패를 만나는 일이 없다.
   */
  async status(userId: string, mapId: string): Promise<PublishStatus> {
    if (!(await this.ready())) {
      return { available: false, publishId: null, publishedAt: null };
    }
    const map = await findAccessibleMap<{ id: string }>(this.db, mapId, userId);
    if (!map) throw new NotFoundException('맵을 찾을 수 없거나 권한이 없습니다.');
    const cur = await this.activeRow(mapId);
    return cur
      ? this.toStatus(cur)
      : { available: true, publishId: null, publishedAt: null };
  }

  /**
   * PUBL-03 — **비인증** 공개 조회.
   *
   * 지운 맵은 열지 않는다. `published_maps` 는 맵을 **완전히** 지울 때만
   * CASCADE 로 함께 지워지는데, 우리 삭제는 soft-delete(`deleted_at`)라
   * 행이 그대로 남는다. 조인해서 직접 막지 않으면 **휴지통에 있는 맵이
   * 계속 공개된다.**
   */
  async getPublished(publishId: string) {
    if (!(await this.ready())) throw new NotFoundException('페이지를 찾을 수 없습니다.');
    const { rows } = await this.db.query<{
      map_id: string; title: string; published_at: Date;
      doc: unknown; updated_at: Date | null;
    }>(
      `SELECT p.map_id, m.title, p.published_at, d.doc, d.updated_at
         FROM public.published_maps p
         JOIN public.maps m ON m.id = p.map_id
    LEFT JOIN public.map_documents d ON d.map_id = p.map_id
        WHERE p.publish_id = $1
          AND p.unpublished_at IS NULL
          AND m.deleted_at IS NULL`,
      [publishId],
    );
    const row = rows[0];
    // 없는 링크·취소된 링크·지워진 맵을 **구분하지 않는다** — 구분하면
    // "그런 링크가 있었다"는 사실을 알려 주는 셈이다.
    if (!row || row.doc == null) {
      throw new NotFoundException('페이지를 찾을 수 없습니다. 링크가 만료되었거나 게시가 취소되었습니다.');
    }
    return {
      publishId,
      mapId: row.map_id,
      title: row.title,
      doc: row.doc,
      publishedAt: row.published_at,
      updatedAt: row.updated_at,
    };
  }

  private async activeRow(mapId: string): Promise<PublishedRow | undefined> {
    const { rows } = await this.db.query<PublishedRow>(
      `SELECT publish_id, published_at
         FROM public.published_maps
        WHERE map_id = $1 AND unpublished_at IS NULL
     ORDER BY published_at DESC
        LIMIT 1`,
      [mapId],
    );
    return rows[0];
  }

  private toStatus(row: PublishedRow): PublishStatus {
    return {
      available: true,
      publishId: row.publish_id,
      publishedAt: row.published_at.toISOString(),
    };
  }
}
