/**
 * 무료 퍼블리싱 — 맵을 **로그인 없이 읽을 수 있는 URL** 로 연다.
 * 설계: `docs/04-extensions/publish/27-publish-share.md` (PUBL-01~04)
 *
 * ★ 나가는 것은 **저장된 문서 스냅샷 하나**다
 *   `map_documents.doc` 을 그대로 준다. 노드 표(`nodes`)를 따로 열지
 *   않는다 — 퍼블리싱 화면은 에디터가 아니라 뷰어이고, 뷰어가 읽는 것은
 *   스냅샷 하나뿐이다. 열어 주는 문을 하나로 두면 "무엇이 새어 나가는가"
 *   를 한 줄로 답할 수 있다.
 *
 * ★ 퍼블리싱한 맵은 **완성본**이다 — 그동안 편집이 막힌다 (2026-09-05)
 *   저자라도 고칠 수 없다. 고치려면 **중단 → 편집 → 다시 퍼블리싱**이다
 *   (`maps.service.ts` 의 `saveDocument`). 그래서 스냅샷이 저절로
 *   바뀌는 일은 없다 — 링크가 살아 있는 동안 독자가 보는 판은 하나다.
 *
 * ★ 중단하면 그 주소는 **영구히 죽는다** (2026-09-05 사용자 결정)
 *   다시 퍼블리싱하면 **새 주소**가 나온다. 같은 주소로 되살리지 않는
 *   이유는 `publish()` 안에 적었다.
 *
 * ★ 표가 없는 서버에서도 죽지 않는다
 *   `published_maps` 델타를 적용하지 않았으면 **퍼블리싱 기능만** 꺼진다.
 *   맵 열기·저장이 함께 죽어서는 안 된다 (`common/table-ready.ts`).
 */

import {
  BadRequestException, ConflictException,
  ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException,
} from '@nestjs/common';
import { randomInt } from 'node:crypto';
import type { ReadStream } from 'node:fs';
import { DatabaseService } from '../database/database.service';
import { StorageService } from '../storage/storage.service';
import { columnReady, tableReady } from '../common/table-ready';
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

/**
 * 퍼블리싱 문서함 안의 상태 (2026-09-05 사용자 결정).
 *
 *   `private` 보관    — 등록만 해 뒀다. 남에게는 404. **고칠 수 있다.**
 *   `public`  무료공개 — 링크를 가진 누구나 읽는다. **고칠 수 없다.**
 *   `paid`    유료공개 — 값을 매겨 판다 (27a, **아직 준비 중**).
 */
export type PublishVisibility = 'private' | 'public' | 'paid';

export const VISIBILITY_LABEL: Record<PublishVisibility, string> = {
  private: '비공개(보관)',
  public: '무료공개',
  paid: '유료공개',
};

export interface PublishStatus {
  /** 이 서버에 퍼블리싱 기능이 켜져 있는가 (표가 없으면 false) */
  available: boolean;
  publishId: string | null;
  publishedAt: string | null;
  /** 미리보기 실루엣이 올라와 있는가 (27a §2) */
  hasPreview?: boolean;
  /**
   * 이 맵을 **새로 퍼블리싱할 수 있는가** — 협업맵이면 false.
   * 이미 퍼블리싱 중인 맵은 이 값이 false 여도 링크가 살아 있다(위 주석 참조).
   */
  publishable?: boolean;
  /** 퍼블리싱할 수 없으면 그 이유 (사람이 읽는 문장). 규칙은 서버가 갖는다 */
  blockedReason?: string;
  /**
   * 지금 상태 — 등록돼 있을 때만 온다 (2026-09-05).
   * `visibility` 칸이 없는 서버(델타 미적용)에서는 **모두 `public`** 이다.
   */
  visibility?: PublishVisibility;
  /**
   * 이 서버가 상태 전환을 할 수 있는가 — `visibility` 칸이 있는가.
   * 화면은 이 값이 false 면 전환 단추를 아예 그리지 않는다.
   */
  canSetVisibility?: boolean;
}

interface PublishedRow {
  publish_id: string;
  published_at: Date;
  storage_path: string | null;
  visibility?: PublishVisibility;
}

/** 미리보기 PNG 한 장의 상한. 1200×630 실루엣은 보통 100KB 안쪽이다 */
export const PREVIEW_MAX_BYTES = 2 * 1024 * 1024;

@Injectable()
export class PublishService {
  constructor(
    private readonly db: DatabaseService,
    private readonly storage: StorageService,
  ) {}

  /** 퍼블리싱 기능을 쓸 수 있는 서버인가 */
  private async ready(): Promise<boolean> {
    return tableReady(this.db, PUBLISHED_TABLE);
  }

  /**
   * 이 서버가 **상태 전환**을 할 수 있는가 — `visibility` 칸이 있는가.
   *
   * 표는 있는데 이 칸만 없는 서버가 있다(2026-09-04 델타는 적용, 2026-09-05
   * 델타는 아직). 그때는 **모두 무료공개로 보고** 전환 기능만 끈다 —
   * 지금까지의 동작 그대로다. 여기서 막으면 퍼블리싱이 통째로 멈춘다.
   */
  private async hasVisibility(): Promise<boolean> {
    return columnReady(this.db, PUBLISHED_TABLE, 'visibility');
  }

  /** 칸이 없으면 무엇을 읽어도 무료공개다 */
  private static vis(row: { visibility?: string | null } | undefined): PublishVisibility {
    const v = row?.visibility;
    return v === 'private' || v === 'paid' ? v : 'public';
  }

  private async requireReady(): Promise<void> {
    if (!(await this.ready())) {
      throw new ServiceUnavailableException(
        '이 서버에는 아직 퍼블리싱 기능이 준비되지 않았습니다(published_maps 표 없음). 관리자에게 문의해 주세요.',
      );
    }
  }

  /**
   * ★ **단독맵만 퍼블리싱한다** (2026-09-05 사용자 결정).
   *
   * 이유가 둘이다.
   *
   *   ⑴ **완성도** — 협업 중이라는 것은 **아직 완료되지 않은 맵**이라는
   *      뜻이다. 여럿이 아직 고쳐 가는 문서를 세상에 걸어 두면, 보는
   *      사람은 완성된 글로 읽는데 실제로는 매 순간 달라진다.
   *   ⑵ **유료 퍼블리싱의 수익 배분** — 협업맵을 팔 수 있게 두면 참여자
   *      여럿의 몫을 어떻게 나눌지부터 정해야 한다(지분·기여도·탈퇴자).
   *      단독맵만 파는 한 그 문제가 **아예 생기지 않는다**
   *      (27a-paid-publish.md §5.0).
   *
   * 유형을 한 칸에 한 값으로 두기로 한 것도 같은 뜻이다:
   * 단독맵 · 협업맵 · 퍼블리싱맵 · 대시보드맵 중 **하나**다.
   *
   * 이미 퍼블리싱 중이던 단독맵이 나중에 협업맵이 되는 길은 남아 있다
   * (협업자를 초대해 승인되면 전환된다). 그때 **링크를 조용히 죽이지는
   * 않는다** — 남에게 보낸 링크가 예고 없이 404 가 되는 것은 다른 종류의
   * 사고다. 새로 퍼블리싱하는 것만 막는다. 그 상태에서 화면은 `🌐 퍼블리싱맵` 을
   * 보여 주고 협업맵이라는 사실은 툴팁에 남긴다.
   */
  static readonly COLLAB_BLOCKED =
    '협업 중인 맵은 퍼블리싱할 수 없습니다 — 아직 완성된 문서가 아닙니다. 퍼블리싱은 단독맵만 됩니다.';

  /** 이 맵을 퍼블리싱할 수 있는가 — 없거나 권한이 없으면 예외 */
  private async requirePublishable(userId: string, mapId: string): Promise<void> {
    const map = await findAccessibleMap<{ id: string; kind: string }>(this.db, mapId, userId);
    // 없는 맵과 권한 없는 맵을 구분하지 않는다 (map-access.ts 와 같은 이유)
    if (!map) throw new NotFoundException('맵을 찾을 수 없거나 권한이 없습니다.');
    if (map.access_role !== 'owner') {
      throw new ForbiddenException('맵을 퍼블리싱할 수 있는 사람은 맵 주인뿐입니다.');
    }
    if (map.kind === 'collab') throw new ForbiddenException(PublishService.COLLAB_BLOCKED);
  }

  /**
   * 퍼블리싱 **중단·미리보기**는 협업맵이어도 된다 — 이미 열린 것을 닫거나
   * 그림을 고치는 일이라, 막으면 오히려 되돌릴 길이 사라진다.
   */
  private async requireOwner(userId: string, mapId: string): Promise<void> {
    const map = await findAccessibleMap<{ id: string }>(this.db, mapId, userId);
    if (!map) throw new NotFoundException('맵을 찾을 수 없거나 권한이 없습니다.');
    if (map.access_role !== 'owner') {
      throw new ForbiddenException('맵을 퍼블리싱할 수 있는 사람은 맵 주인뿐입니다.');
    }
  }

  /**
   * PUBL-01 — **퍼블리싱 등록.** 이미 등록돼 있으면 그 링크를 그대로 준다.
   *
   * ★ **등록과 노출은 다른 일이다** (2026-09-05 사용자 결정).
   *
   *   완성된 맵 ──[등록]──▶ 퍼블리싱 문서함 { 비공개 · 무료공개 · 유료공개 }
   *
   *   쇼핑몰이 상품을 등록해 두고 아직 노출하지 않을 수 있는 것과 같다.
   *   유튜브의 비공개/일부공개/공개도 같은 모양이다.
   *
   *   **주소(`publish_id`)는 등록에 붙는다 — 상태에 붙지 않는다.** 그래서
   *   비공개로 돌렸다 다시 공개해도 **같은 주소**다. 홈페이지에 걸어 둔
   *   링크가 오탈자 하나 고치는 동안 죽지 않는다.
   *
   *   앞서 "중단하면 주소가 영구히 죽는다" 로 정했던 이유는 하나였다 —
   *   **중단이 "잠시 고치려고" 인지 "이제 그만" 인지 시스템은 알 수
   *   없다.** 상태를 셋으로 나눈 지금은 **사용자가 직접 말해 준다**:
   *   잠시 내리는 것은 `비공개`, 그만두는 것은 `등록 취소`(DELETE)다.
   *   알 수 없던 것이 알 수 있게 됐으므로 추측할 일이 없다.
   *
   *   등록 취소는 여전히 **주소를 죽인다** — 그때는 사용자가 죽이는 것을
   *   이미 골랐다.
   */
  async publish(
    userId: string, mapId: string, visibility: PublishVisibility = 'public',
  ): Promise<PublishStatus> {
    await this.requireReady();
    await this.requirePublishable(userId, mapId);
    const canSet = await this.hasVisibility();
    PublishService.assertUsable(visibility, canSet);

    const cur = await this.activeRow(mapId);
    if (cur) return this.toStatus(cur, canSet);

    // publish_id 는 UNIQUE 다. 충돌 확률은 무시할 만하지만 0 은 아니므로
    // 몇 번 다시 뽑는다 — 여기서 포기하면 사용자에게는 이유 없는 실패다.
    const cols = canSet ? '(map_id, publish_id, visibility)' : '(map_id, publish_id)';
    const vals = canSet ? '($1, $2, $3)' : '($1, $2)';
    const ret = canSet
      ? 'publish_id, published_at, storage_path, visibility'
      : 'publish_id, published_at, storage_path';
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const publishId = newPublishId();
      try {
        const { rows } = await this.db.query<PublishedRow>(
          `INSERT INTO public.published_maps ${cols} VALUES ${vals} RETURNING ${ret}`,
          canSet ? [mapId, publishId, visibility] : [mapId, publishId],
        );
        return this.toStatus(rows[0], canSet);
      } catch (err) {
        // 23505 = unique_violation. 그 외 오류는 그대로 올린다 —
        // 삼키면 DB 장애가 "퍼블리싱 실패"로 둔갑해 원인을 못 찾는다.
        const code = (err as { code?: string; cause?: { code?: string } }).code
          ?? (err as { cause?: { code?: string } }).cause?.code;
        if (code !== '23505') throw err;
      }
    }
    throw new ServiceUnavailableException('퍼블리싱 링크를 만들지 못했습니다. 잠시 뒤 다시 시도해 주세요.');
  }

  /**
   * 지금 쓸 수 있는 상태인가 — **거절은 이유와 함께**.
   *
   * `paid` 는 칸에는 있지만 아직 팔 수 있는 배관(값·결제·정산)이 없다.
   * 값을 못 받는데 "유료공개" 라고 표시해 두면 **저자가 팔았다고 믿는**
   * 상태가 된다. 그래서 지금은 막고, 막는 이유를 말한다 (27a §3·§6).
   */
  private static assertUsable(v: PublishVisibility, canSet: boolean): void {
    if (v === 'paid') {
      throw new BadRequestException(
        '유료공개는 아직 준비 중입니다 — 값·결제·정산이 붙은 뒤에 열립니다. 지금은 비공개(보관) 또는 무료공개를 고를 수 있습니다.',
      );
    }
    if (v !== 'private' && v !== 'public') {
      throw new BadRequestException('상태는 비공개(private) 또는 무료공개(public) 만 고를 수 있습니다.');
    }
    if (v === 'private' && !canSet) {
      throw new ServiceUnavailableException(
        '이 서버에는 아직 퍼블리싱 상태 전환이 준비되지 않았습니다(published_maps.visibility 칸 없음). 관리자에게 문의해 주세요.',
      );
    }
  }

  /**
   * PUBL-06 — **상태 전환** (비공개 ↔ 무료공개). 주소는 그대로다.
   *
   * 등록돼 있지 않으면 바꿀 것이 없다 — 404 로 답한다(먼저 등록해야 한다).
   * 협업맵 여부는 여기서 보지 않는다: 이미 등록된 것을 **닫는 쪽**으로
   * 움직이는 길까지 막으면 되돌릴 수 없다(`unpublish` 와 같은 이유).
   */
  async setVisibility(
    userId: string, mapId: string, visibility: PublishVisibility,
  ): Promise<PublishStatus> {
    await this.requireReady();
    await this.requireOwner(userId, mapId);
    const canSet = await this.hasVisibility();
    PublishService.assertUsable(visibility, canSet);
    if (!canSet) {
      throw new ServiceUnavailableException(
        '이 서버에는 아직 퍼블리싱 상태 전환이 준비되지 않았습니다(published_maps.visibility 칸 없음). 관리자에게 문의해 주세요.',
      );
    }
    const { rows } = await this.db.query<PublishedRow>(
      `UPDATE public.published_maps
          SET visibility = $2
        WHERE map_id = $1 AND unpublished_at IS NULL
    RETURNING publish_id, published_at, storage_path, visibility`,
      [mapId, visibility],
    );
    if (!rows[0]) {
      throw new NotFoundException('퍼블리싱 등록이 되어 있지 않습니다. 먼저 퍼블리싱해 주세요.');
    }
    return this.toStatus(rows[0], true);
  }

  /**
   * PUBL-02 — 퍼블리싱 **등록 취소**. 이미 취소돼 있어도 성공이다(멱등).
   *
   * ★ **공개 중에는 취소할 수 없다 — 먼저 비공개(보관)로** (2026-09-05
   *   사용자 결정). 취소는 **주소를 영구히 죽이는** 일이고, 되돌릴 수
   *   없다. 그런 일이 버튼 한 번으로 일어나면 안 된다.
   *
   *   확인 대화상자로 막는 방법도 있지만, 그건 **화면에만 있는 방벽**이라
   *   직접 호출·옛 탭에는 없다. 여기서는 "한 단계를 먼저 지나게" 한다 —
   *   비공개로 바꾸는 순간 이미 남에게는 닫히므로, 급한 일(잘못 공개했다)은
   *   **그 한 걸음으로 이미 해결돼 있다.** 그러고 나서 천천히 지운다.
   *
   *   `visibility` 칸이 없는 서버에서는 이 문을 세우지 않는다 — 그 서버에는
   *   "비공개로 먼저 바꾸는" 길 자체가 없어서, 막으면 **취소할 방법이
   *   사라진다.**
   */
  async unpublish(userId: string, mapId: string): Promise<void> {
    await this.requireReady();
    await this.requireOwner(userId, mapId);
    if (await this.hasVisibility()) {
      const cur0 = await this.activeRow(mapId);
      if (cur0 && PublishService.vis(cur0) !== 'private') {
        throw new ConflictException(
          '공개 중에는 퍼블리싱을 취소할 수 없습니다 — 먼저 비공개(보관)로 바꿔 주세요.'
          + ' 취소하면 이 주소는 영구히 사라집니다.',
        );
      }
    }
    // 미리보기 파일도 지운다 — 다시 퍼블리싱하면 **새 링크**라 새 키를 쓰므로,
    // 여기서 안 지우면 아무도 못 여는 그림이 저장소에 영영 남는다.
    // 행에는 손대지 않는다(퍼블리싱 기록은 지운 적 없는 사실이다).
    const cur = await this.activeRow(mapId);
    if (cur?.storage_path) {
      // 파일이 없어도 조용히 성공한다. 여기서 실패해도 **퍼블리싱 중단은
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
   * 퍼블리싱 상태 — 맵을 볼 수 있는 사람이면 누구나 읽는다.
   *
   * 퍼블리싱 기능이 없는 서버에서는 `available:false` 를 **오류가 아니라
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
    const canSet = await this.hasVisibility();
    const cur = await this.activeRow(mapId);
    return cur
      ? { ...this.toStatus(cur, canSet), ...gate }
      : {
        available: true, publishId: null, publishedAt: null,
        canSetVisibility: canSet, ...gate,
      };
  }

  /**
   * PUBL-03 — **비인증** 조회.
   *
   * ★ **무료공개만 연다** (2026-09-05). 보관(비공개)은 주소가 살아 있어도
   *   남에게는 없는 것과 같다 — 그래야 "등록해 두고 아직 노출하지 않는"
   *   상태가 뜻을 갖는다. 404 문장은 없는 링크와 **같다**: 구분하면
   *   "그런 주소가 있긴 하다" 는 사실을 알려 주는 셈이다.
   *
   * 지운 맵은 열지 않는다. `published_maps` 는 맵을 **완전히** 지울 때만
   * CASCADE 로 함께 지워지는데, 우리 삭제는 soft-delete(`deleted_at`)라
   * 행이 그대로 남는다. 조인해서 직접 막지 않으면 **휴지통에 있는 맵이
   * 계속 열린다.**
   */
  async getPublished(publishId: string) {
    if (!(await this.ready())) throw new NotFoundException('페이지를 찾을 수 없습니다.');
    const open = (await this.hasVisibility()) ? `AND p.visibility = 'public'` : '';
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
          AND m.deleted_at IS NULL
          ${open}`,
      [publishId],
    );
    const row = rows[0];
    // 없는 링크·취소된 링크·지워진 맵을 **구분하지 않는다** — 구분하면
    // "그런 링크가 있었다"는 사실을 알려 주는 셈이다.
    if (!row || row.doc == null) {
      throw new NotFoundException('페이지를 찾을 수 없습니다. 링크가 만료되었거나 퍼블리싱이 중단되었습니다.');
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
    // 칸이 없는 서버에서는 **고르지 않는다** — 없는 칸을 SELECT 하면 503 이다
    const col = (await this.hasVisibility()) ? ', visibility' : '';
    const { rows } = await this.db.query<PublishedRow>(
      `SELECT publish_id, published_at, storage_path${col}
         FROM public.published_maps
        WHERE map_id = $1 AND unpublished_at IS NULL
     ORDER BY published_at DESC
        LIMIT 1`,
      [mapId],
    );
    return rows[0];
  }

  private toStatus(row: PublishedRow, canSetVisibility: boolean): PublishStatus {
    return {
      available: true,
      publishId: row.publish_id,
      publishedAt: row.published_at.toISOString(),
      hasPreview: !!row.storage_path,
      visibility: PublishService.vis(row),
      canSetVisibility,
    };
  }

  // ── 미리보기 실루엣 (27a §2) ─────────────────────────────────────
  //
  // ★ 저장 자리는 `published_maps.storage_path` 다 — 처음부터 그러라고
  //   있던 칸이다(schema.sql). 첨부 표에 넣지 않는 이유: 이 그림은
  //   **사용자의 파일이 아니라 퍼블리싱이 만든 부산물**이라, 사용자의 저장
  //   용량을 깎으면 안 되고 문서함에 보여서도 안 된다.

  /** 키는 퍼블리싱 링크를 따라간다 — 링크가 죽으면 그림도 갈 곳을 잃는다 */
  private static previewKey(publishId: string): string {
    return `p/${publishId}.png`;
  }

  /**
   * 미리보기 올리기 — **맵 주인만.** 퍼블리싱 중이 아니면 올릴 자리가 없다.
   *
   * 저자가 내용을 고치면 실루엣이 낡는다. 자동 갱신은 저자가 퍼블리싱 화면을
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
    if (!cur) throw new NotFoundException('퍼블리싱 중인 맵이 아닙니다. 먼저 퍼블리싱해 주세요.');

    const key = PublishService.previewKey(cur.publish_id);
    await this.storage.put(key, png);
    await this.db.query(
      `UPDATE public.published_maps SET storage_path = $2
        WHERE map_id = $1 AND unpublished_at IS NULL`,
      [mapId, key],
    );
    return { ...this.toStatus(cur, await this.hasVisibility()), hasPreview: true };
  }

  /**
   * ★ **주인이 보는 미리보기** (2026-09-05) — 인증 경로, **상태와 무관**.
   *
   * 아래 비인증 경로는 무료공개일 때만 연다. 그런데 저자는 **비공개(보관)
   * 상태에서 실루엣을 확인하고 다시 만들** 수 있어야 한다 — 공개하기 전에
   * 어떻게 보이는지 보는 것이 보관 상태의 쓸모다. 그 문이 없으면
   * 대화상자의 그림이 **깨진 채로** 뜬다(실측 2026-09-05).
   */
  async openOwnerPreview(userId: string, mapId: string): Promise<ReadStream> {
    await this.requireReady();
    await this.requireOwner(userId, mapId);
    const cur = await this.activeRow(mapId);
    if (!cur?.storage_path) throw new NotFoundException('미리보기 이미지가 없습니다.');
    return this.storage.stream(cur.storage_path);
  }

  /**
   * 미리보기 읽기 — **비인증**. 여는 조건은 맵 본문과 같다:
   * 지금 그 링크로 **무료공개** 중이고, 맵이 휴지통에 있지 않아야 한다.
   */
  async openPreview(publishId: string): Promise<ReadStream> {
    if (!(await this.ready())) throw new NotFoundException('페이지를 찾을 수 없습니다.');
    const open = (await this.hasVisibility()) ? `AND p.visibility = 'public'` : '';
    const { rows } = await this.db.query<{ storage_path: string | null }>(
      `SELECT p.storage_path
         FROM public.published_maps p
         JOIN public.maps m ON m.id = p.map_id
        WHERE p.publish_id = $1
          AND p.unpublished_at IS NULL
          AND m.deleted_at IS NULL
          ${open}`,
      [publishId],
    );
    const key = rows[0]?.storage_path;
    if (!key) throw new NotFoundException('미리보기 이미지가 없습니다.');
    return this.storage.stream(key);
  }
}
