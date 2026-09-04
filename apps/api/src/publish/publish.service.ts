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
  BadRequestException,
  ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException,
} from '@nestjs/common';
import { randomInt } from 'node:crypto';
import type { ReadStream } from 'node:fs';
import { DatabaseService } from '../database/database.service';
import { StorageService } from '../storage/storage.service';
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
  /** 미리보기 실루엣이 올라와 있는가 (27a §2) */
  hasPreview?: boolean;
  /**
   * 이 맵을 **새로 공개할 수 있는가** — 협업맵이면 false.
   * 이미 공개 중인 맵은 이 값이 false 여도 링크가 살아 있다(위 주석 참조).
   */
  publishable?: boolean;
  /** 공개할 수 없으면 그 이유 (사람이 읽는 문장). 규칙은 서버가 갖는다 */
  blockedReason?: string;
}

interface PublishedRow {
  publish_id: string;
  published_at: Date;
  storage_path: string | null;
}

/** 미리보기 PNG 한 장의 상한. 1200×630 실루엣은 보통 100KB 안쪽이다 */
export const PREVIEW_MAX_BYTES = 2 * 1024 * 1024;

@Injectable()
export class PublishService {
  constructor(
    private readonly db: DatabaseService,
    private readonly storage: StorageService,
  ) {}

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
   * ★ **단독맵만 공개한다** (2026-09-05 사용자 결정).
   *
   * 이유가 둘이다.
   *
   *   ⑴ **완성도** — 협업 중이라는 것은 **아직 완료되지 않은 맵**이라는
   *      뜻이다. 여럿이 아직 고쳐 가는 문서를 세상에 걸어 두면, 보는
   *      사람은 완성된 글로 읽는데 실제로는 매 순간 달라진다.
   *   ⑵ **유료 게시의 수익 배분** — 협업맵을 팔 수 있게 두면 참여자
   *      여럿의 몫을 어떻게 나눌지부터 정해야 한다(지분·기여도·탈퇴자).
   *      단독맵만 파는 한 그 문제가 **아예 생기지 않는다**
   *      (27a-paid-publish.md §5.0).
   *
   * 유형을 한 칸에 한 값으로 두기로 한 것도 같은 뜻이다:
   * 단독맵 · 협업맵 · 공개맵 · 대시보드맵 중 **하나**다.
   *
   * 이미 공개 중이던 단독맵이 나중에 협업맵이 되는 길은 남아 있다
   * (협업자를 초대해 승인되면 전환된다). 그때 **링크를 조용히 죽이지는
   * 않는다** — 남에게 보낸 링크가 예고 없이 404 가 되는 것은 다른 종류의
   * 사고다. 새로 공개하는 것만 막는다. 그 상태에서 화면은 `🌐 공개맵` 을
   * 보여 주고 협업맵이라는 사실은 툴팁에 남긴다.
   */
  static readonly COLLAB_BLOCKED =
    '협업 중인 맵은 공개할 수 없습니다 — 아직 완성된 문서가 아닙니다. 공개는 단독맵만 됩니다.';

  /** 이 맵을 공개할 수 있는가 — 없거나 권한이 없으면 예외 */
  private async requirePublishable(userId: string, mapId: string): Promise<void> {
    const map = await findAccessibleMap<{ id: string; kind: string }>(this.db, mapId, userId);
    // 없는 맵과 권한 없는 맵을 구분하지 않는다 (map-access.ts 와 같은 이유)
    if (!map) throw new NotFoundException('맵을 찾을 수 없거나 권한이 없습니다.');
    if (map.access_role !== 'owner') {
      throw new ForbiddenException('맵을 게시할 수 있는 사람은 맵 주인뿐입니다.');
    }
    if (map.kind === 'collab') throw new ForbiddenException(PublishService.COLLAB_BLOCKED);
  }

  /**
   * 게시 **취소·미리보기**는 협업맵이어도 된다 — 이미 열린 것을 닫거나
   * 그림을 고치는 일이라, 막으면 오히려 되돌릴 길이 사라진다.
   */
  private async requireOwner(userId: string, mapId: string): Promise<void> {
    const map = await findAccessibleMap<{ id: string }>(this.db, mapId, userId);
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
    await this.requirePublishable(userId, mapId);

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
             RETURNING publish_id, published_at, storage_path`,
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
    // 미리보기 파일도 지운다 — 다시 게시하면 **새 링크**라 새 키를 쓰므로,
    // 여기서 안 지우면 아무도 못 여는 그림이 저장소에 영영 남는다.
    // 행에는 손대지 않는다(게시 기록은 지운 적 없는 사실이다).
    const cur = await this.activeRow(mapId);
    if (cur?.storage_path) {
      // 파일이 없어도 조용히 성공한다. 여기서 실패해도 **게시 취소는
      // 계속돼야 한다** — 링크를 닫는 것이 이 요청의 목적이다.
      await this.storage.delete(cur.storage_path).catch(() => { /* 링크 닫기가 우선 */ });
    }
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
    const map = await findAccessibleMap<{ id: string; kind: string }>(this.db, mapId, userId);
    if (!map) throw new NotFoundException('맵을 찾을 수 없거나 권한이 없습니다.');
    // **왜 규칙을 상태에 실어 보내나** — 화면이 같은 판정을 한 벌 더 갖게
    // 두면 언젠가 서버와 다른 말을 한다. 눌러 보고 나서야 거절당하는 것도
    // 나쁘다. 그래서 "할 수 있는가" 와 "왜 안 되는가" 를 서버가 준다.
    const collab = map.kind === 'collab';
    const gate = collab
      ? { publishable: false, blockedReason: PublishService.COLLAB_BLOCKED }
      : { publishable: true };
    const cur = await this.activeRow(mapId);
    return cur
      ? { ...this.toStatus(cur), ...gate }
      : { available: true, publishId: null, publishedAt: null, ...gate };
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
      `SELECT publish_id, published_at, storage_path
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
      hasPreview: !!row.storage_path,
    };
  }

  // ── 미리보기 실루엣 (27a §2) ─────────────────────────────────────
  //
  // ★ 저장 자리는 `published_maps.storage_path` 다 — 처음부터 그러라고
  //   있던 칸이다(schema.sql). 첨부 표에 넣지 않는 이유: 이 그림은
  //   **사용자의 파일이 아니라 게시가 만든 부산물**이라, 사용자의 저장
  //   용량을 깎으면 안 되고 문서함에 보여서도 안 된다.

  /** 키는 게시 링크를 따라간다 — 링크가 죽으면 그림도 갈 곳을 잃는다 */
  private static previewKey(publishId: string): string {
    return `p/${publishId}.png`;
  }

  /**
   * 미리보기 올리기 — **맵 주인만.** 게시 중이 아니면 올릴 자리가 없다.
   *
   * 저자가 내용을 고치면 실루엣이 낡는다. 자동 갱신은 저자가 게시 화면을
   * 열지 않으면 돌지 않으므로 하지 않는다 — 화면이 "다시 만들기"를
   * 눌러야 한다고 말해 주는 편이 정직하다(27a §2.2).
   */
  async putPreview(userId: string, mapId: string, png: Buffer): Promise<PublishStatus> {
    await this.requireReady();
    await this.requireOwner(userId, mapId);
    if (png.length === 0) throw new BadRequestException('빈 파일입니다.');
    if (png.length > PREVIEW_MAX_BYTES) {
      throw new BadRequestException(
        `미리보기 이미지는 최대 ${Math.round(PREVIEW_MAX_BYTES / 1024 / 1024)}MB 까지입니다.`,
      );
    }
    // **PNG 인지 바이트로 확인한다.** 확장자·Content-Type 은 보내는 쪽이
    // 정하는 값이라, 그것만 믿으면 아무 파일이나 우리 저장소에 들어온다.
    const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    if (!png.subarray(0, 8).equals(PNG_MAGIC)) {
      throw new BadRequestException('PNG 이미지만 올릴 수 있습니다.');
    }

    const cur = await this.activeRow(mapId);
    if (!cur) throw new NotFoundException('게시 중인 맵이 아닙니다. 먼저 공개 링크를 만들어 주세요.');

    const key = PublishService.previewKey(cur.publish_id);
    await this.storage.put(key, png);
    await this.db.query(
      `UPDATE public.published_maps SET storage_path = $2
        WHERE map_id = $1 AND unpublished_at IS NULL`,
      [mapId, key],
    );
    return { ...this.toStatus(cur), hasPreview: true };
  }

  /**
   * 미리보기 읽기 — **비인증**. 여는 조건은 맵 본문과 같다:
   * 지금 그 링크로 공개 중이고, 맵이 휴지통에 있지 않아야 한다.
   */
  async openPreview(publishId: string): Promise<ReadStream> {
    if (!(await this.ready())) throw new NotFoundException('페이지를 찾을 수 없습니다.');
    const { rows } = await this.db.query<{ storage_path: string | null }>(
      `SELECT p.storage_path
         FROM public.published_maps p
         JOIN public.maps m ON m.id = p.map_id
        WHERE p.publish_id = $1
          AND p.unpublished_at IS NULL
          AND m.deleted_at IS NULL`,
      [publishId],
    );
    const key = rows[0]?.storage_path;
    if (!key) throw new NotFoundException('미리보기 이미지가 없습니다.');
    return this.storage.stream(key);
  }
}
