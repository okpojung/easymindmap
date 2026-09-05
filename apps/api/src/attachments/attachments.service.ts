// 첨부 저장소 + 저장 용량 쿼터 (B9).
//
// 쿼터 정책 (2026-08-02 결정): **DB 용량 + 첨부 용량 합산**이
// users.quota_bytes 이하여야 한다.
//
// 그 한도는 **요금제(users.plan)가 정한다** (2026-08-06 확정, 가격 미정):
//   Free 10MB · Basic 10GB · Pro 30GB · Team 20GB/사용자
// 용량 숫자는 DB 의 `plan_quota_bytes()` 한 곳에만 있고, `users_sync_quota`
// 트리거가 plan 이 바뀔 때 quota_bytes 를 맞춘다 — **API 는 계산하지
// 않는다**(두 곳에 적으면 반드시 어긋난다). attachment-storage.md §8.
//   · DB 용량  = 사용자의 map_documents.doc + map_document_versions.doc
//                (히스토리 버전 포함) 직렬화 크기 합
//   · 첨부 용량 = attachments.size_bytes 합
// 파일 원본은 StorageService 드라이버에, 메타데이터는 attachments 에.

import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { ReadStream } from 'node:fs';
import { DatabaseService } from '../database/database.service';
import { StorageService } from '../storage/storage.service';
import { canWrite, findAccessibleMap, queryAllowingMissingMembers } from '../maps/map-access';
import { columnReady, tableReady } from '../common/table-ready';
import { fetchRemoteImage } from './remote-image';

/**
 * 요금제 — **저장 용량의 단일 기준** (2026-08-06 확정, 가격은 미정).
 *
 * 용량 자체는 DB 가 안다 — `public.plan_quota_bytes()` 가 계산하고
 * `users_sync_quota` 트리거가 `users.quota_bytes` 에 넣어 준다. 여기서는
 * **화면에 이름을 보여 주기 위해서만** 쓴다(값을 두 곳에 적어 두면 어긋난다).
 */
export type UserPlan = 'free' | 'basic' | 'pro' | 'team';
const PLANS: UserPlan[] = ['free', 'basic', 'pro', 'team'];
const PLAN_LABEL: Record<UserPlan, string> = {
  free: 'Free', basic: 'Basic', pro: 'Pro', team: 'Team',
};

export interface QuotaUsage {
  dbBytes: number;
  fileBytes: number;
  usedBytes: number;
  quotaBytes: number;
  /** 화면에 "Basic · 10GB" 처럼 보여 주기 위한 값 */
  plan: UserPlan;
}

export interface AttachmentMeta {
  id: string;
  name: string;
  mime: string;
  sizeBytes: number;
}

/**
 * 첨부의 **주인** — 누구 용량으로 세고 누구 것으로 남길지.
 *
 * ★ **협업맵에서는 올린 사람이 아니라 맵의 주인이다** (2026-09-05,
 *   collaboration/29 §3.4 후속 · 13a §4.5 "협업맵의 기준은 개설자 요금제").
 *   전에는 참가자가 붙인 사진이 참가자 것이어서, 참가자가 탈퇴하면
 *   `owner_id` CASCADE 로 행이 지워지고 **개설자의 맵에서 그림이 사라졌다.**
 *   주인을 맵 주인으로 두면 참가자가 떠나도 맵과 함께 남고, 용량도 개설자
 *   요금제로 한 번만 센다(참가자 요금제가 섞이지 않는다).
 */
export interface AttachmentOwner {
  /** `attachments.owner_id` 에 들어갈 사람 — 맵이 있으면 맵 주인, 없으면 올린 사람 */
  ownerId: string;
  /** 올린 사람과 다른가 — 오류 문장에서 "개설자 용량" 이라고 말하기 위해 */
  onBehalf: boolean;
}

function fmtGB(bytes: number): string {
  const gb = bytes / 1024 ** 3;
  if (gb >= 1) return `${Math.round(gb * 10) / 10}GB`;
  const mb = bytes / 1024 ** 2;
  if (mb >= 1) return `${Math.round(mb)}MB`;
  return `${Math.max(1, Math.round(bytes / 1024))}KB`;
}

@Injectable()
export class AttachmentsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly storage: StorageService,
  ) {}

  async usage(userId: string): Promise<QuotaUsage> {
    const { rows } = await this.db.query<{
      db_bytes: string; file_bytes: string; quota_bytes: string; plan: string;
    }>(
      `SELECT
         COALESCE((SELECT SUM(octet_length(d.doc::text)) FROM public.map_documents d
                   JOIN public.maps m ON m.id = d.map_id WHERE m.owner_id = $1), 0)
       + COALESCE((SELECT SUM(octet_length(v.doc::text)) FROM public.map_document_versions v
                   JOIN public.maps m ON m.id = v.map_id WHERE m.owner_id = $1), 0)
         AS db_bytes,
         COALESCE((SELECT SUM(a.size_bytes) FROM public.attachments a
                   WHERE a.owner_id = $1), 0) AS file_bytes,
         -- 한도는 DB 가 요금제에서 계산해 둔 값을 그대로 쓴다
         -- (users_sync_quota 트리거가 plan 과 묶어 준다)
         COALESCE((SELECT u.quota_bytes FROM public.users u WHERE u.id = $1),
                  10485760) AS quota_bytes,
         COALESCE((SELECT u.plan FROM public.users u WHERE u.id = $1), 'free') AS plan`,
      [userId],
    );
    const r = rows[0];
    const dbBytes = Number(r.db_bytes);
    const fileBytes = Number(r.file_bytes);
    return {
      dbBytes,
      fileBytes,
      usedBytes: dbBytes + fileBytes,
      quotaBytes: Number(r.quota_bytes),
      plan: (PLANS.includes(r.plan as UserPlan) ? r.plan : 'free') as UserPlan,
    };
  }

  /**
   * 추가로 addBytes 를 쓰면 쿼터를 넘는지 검사 — 넘으면 413.
   * `onBehalf` 면 **개설자의** 한도라고 말한다 — 참가자에게 "요금제를
   * 올려 주세요" 라고 하면 자기 요금제를 올리고도 안 되는 일을 겪는다.
   */
  async assertQuota(userId: string, addBytes: number, onBehalf = false): Promise<void> {
    const u = await this.usage(userId);
    if (u.usedBytes + addBytes > u.quotaBytes) {
      // **어느 요금제의 한도인지 밝힌다** — "왜 이 숫자인가"를 사용자가
      // 알아야 올릴지 정리할지 판단할 수 있다.
      throw new PayloadTooLargeException(onBehalf
        ? `이 협업맵의 첨부는 개설자 용량으로 셉니다 — 개설자의 저장 용량 한도를 초과합니다 ` +
          `(사용 중 ${fmtGB(u.usedBytes)} / 한도 ${fmtGB(u.quotaBytes)}, ${PLAN_LABEL[u.plan]} 요금제). ` +
          '개설자에게 첨부를 정리하거나 요금제를 올려 달라고 해 주세요.'
        : `저장 용량 한도를 초과합니다 — 사용 중 ${fmtGB(u.usedBytes)} / ` +
          `한도 ${fmtGB(u.quotaBytes)} (${PLAN_LABEL[u.plan]} 요금제). ` +
          '첨부나 맵을 정리하거나 요금제를 올려 주세요.',
      );
    }
  }

  /**
   * 이 맵에 올리는 첨부의 주인을 정한다 (`AttachmentOwner` 참조).
   *
   * 맵을 지정했으면 **그 맵에 쓸 수 있는 사람이어야 한다** — 전에는 아무
   * 맵 id 나 넣을 수 있었는데(주인이 올린 사람이라 해될 것이 없었다),
   * 이제 주인이 맵 주인이 되므로 남의 맵 id 로 남의 용량을 쓰는 길을
   * 막아야 한다. 볼 수 없는 맵은 없는 맵과 같이 404, 읽기만 참가자는 403.
   */
  async resolveOwner(userId: string, mapId?: string): Promise<AttachmentOwner> {
    if (!mapId) return { ownerId: userId, onBehalf: false };
    const map = await findAccessibleMap<{ owner_id: string }>(this.db, mapId, userId);
    if (!map) throw new NotFoundException('맵을 찾을 수 없습니다.');
    if (!canWrite(map.access_role)) {
      throw new ForbiddenException('읽기만 권한으로는 첨부를 올릴 수 없습니다.');
    }
    return { ownerId: map.owner_id, onBehalf: map.owner_id !== userId };
  }

  async upload(
    userId: string,
    file: { originalname: string; mimetype: string; size: number; buffer: Buffer },
    mapId?: string,
  ): Promise<AttachmentMeta> {
    // 협업맵이면 주인은 맵 주인, 용량도 맵 주인 몫 (AttachmentOwner 참조)
    const { ownerId, onBehalf } = await this.resolveOwner(userId, mapId);
    await this.assertQuota(ownerId, file.size, onBehalf);

    // multer 는 파일명을 latin1 로 넘긴다 — 한글 파일명 복원
    const name = Buffer.from(file.originalname, 'latin1').toString('utf8');
    const id = randomUUID();
    const key = `u/${ownerId}/${id}`; // 서버가 UUID 로만 조립 (경로 주입 불가)
    await this.storage.put(key, file.buffer);
    try {
      await this.db.query(
        `INSERT INTO public.attachments (id, owner_id, map_id, name, mime, size_bytes, storage_key)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [id, ownerId, mapId ?? null, name.slice(0, 255),
         (file.mimetype || 'application/octet-stream').slice(0, 127), file.size, key],
      );
    } catch (err) {
      await this.storage.delete(key).catch(() => undefined); // 고아 파일 방지
      throw err;
    }
    return { id, name, mime: file.mimetype, sizeBytes: file.size };
  }

  /**
   * **원격 사진을 서버가 대신 받아 저장한다** (2026-08-20, B16 ② 슬라이스 3).
   *
   * 브라우저 fetch 는 CORS 로 막히므로 웹 기사에서 복사한 사진이 문서에
   * 내장되지 못하고 원본 URL 링크로만 남았다 — 기사가 지워지면 사진도
   * 사라진다. 서버는 CORS 를 받지 않으므로 여기서 받아 저장한다.
   *
   * **저장은 `upload()` 를 그대로 쓴다** — 쿼터 검사와 고아 파일 방지가
   * 거기 들어 있다. 저장 경로를 새로 만들면 그 둘이 빠진다.
   *
   * SSRF 방어는 전부 `remote-image.ts` 에 있다.
   *
   * ★ **같은 사진을 두 번 올리지 않는다.** 이름이 내용 해시라, 같은 맵에
   *   같은 이름이 이미 있으면 그것을 돌려준다 — 같은 기사를 두 노드에
   *   붙이면 사진이 두 벌 쌓여 사용자 용량을 갉아먹는다
   *   (`maps.service.ts extractDocImages()` 와 같은 판단이다).
   */
  async uploadFromUrl(
    userId: string, url: string, mapId?: string,
  ): Promise<AttachmentMeta & { reused: boolean }> {
    // 맵에 쓸 수 없는 사람이면 원격 사진을 받기 전에 거절한다
    if (mapId) await this.resolveOwner(userId, mapId);
    const img = await fetchRemoteImage(url);

    if (mapId) {
      // **맵 기준으로 찾는다** — 협업맵의 첨부는 누가 올렸든 맵 주인 것이라
      // 올린 사람으로 좁히면 같은 사진이 참가자마다 한 벌씩 쌓인다.
      const { rows } = await this.db.query<{
        id: string; name: string; mime: string; size_bytes: string;
      }>(
        `SELECT id, name, mime, size_bytes FROM public.attachments
          WHERE map_id = $1 AND name = $2 LIMIT 1`,
        [mapId, img.name],
      );
      if (rows[0]) {
        return {
          id: rows[0].id,
          name: rows[0].name,
          mime: rows[0].mime,
          sizeBytes: Number(rows[0].size_bytes),
          reused: true,
        };
      }
    }

    // multer 가 넘겨 주는 모양(latin1 파일명)에 맞춘다 — upload() 가
    // 거기서 utf8 로 되돌린다. 해시 이름은 ASCII 라 왕복이 안전하다.
    const meta = await this.upload(userId, {
      originalname: Buffer.from(img.name, 'utf8').toString('latin1'),
      mimetype: img.mime,
      size: img.bytes.length,
      buffer: img.bytes,
    }, mapId);
    return { ...meta, reused: false };
  }

  /**
   * 첨부 열기 — `range` 를 주면 그 구간만 읽는 스트림을 준다
   * (2026-08-07 동영상 재생: HTTP Range → 206 Partial Content).
   */
  async open(
    userId: string,
    id: string,
    range?: { start: number; end: number },
  ): Promise<AttachmentMeta & { stream: ReadStream }> {
    // **맵을 열 수 있으면 그 맵의 첨부도 열 수 있어야 한다** (2026-08-18).
    // 이게 없으면 공유받은 맵이 **이미지 자리마다 깨진 채로** 열린다 —
    // 맵은 보이는데 그림이 안 보이는 것은 공유가 반쯤 된 것이고,
    // 사용자에게는 그냥 고장으로 보인다.
    // 지우기는 소유자 + **그 맵에 쓸 수 있는 사람**이다(`remove()` 참조, 2026-09-05).
    const rows = await queryAllowingMissingMembers<{
      name: string; mime: string; size_bytes: string; storage_key: string;
    }>(
      this.db,
      `SELECT a.name, a.mime, a.size_bytes, a.storage_key
         FROM public.attachments a
         LEFT JOIN public.maps m
           ON m.id = a.map_id AND m.deleted_at IS NULL
         LEFT JOIN public.map_members mm
           ON mm.map_id = a.map_id AND mm.user_id = $2
        WHERE a.id = $1
          AND (a.owner_id = $2 OR m.owner_id = $2 OR mm.user_id IS NOT NULL)`,
      `SELECT a.name, a.mime, a.size_bytes, a.storage_key
         FROM public.attachments a
         LEFT JOIN public.maps m
           ON m.id = a.map_id AND m.deleted_at IS NULL
        WHERE a.id = $1 AND (a.owner_id = $2 OR m.owner_id = $2)`,
      [id, userId],
    );
    if (!rows[0]) throw new NotFoundException('첨부 파일을 찾을 수 없습니다.');
    const r = rows[0];
    return {
      id,
      name: r.name,
      mime: r.mime,
      sizeBytes: Number(r.size_bytes),
      stream: await this.storage.stream(r.storage_key, range),
    };
  }

  /**
   * **공개 게시된 맵의 첨부** — 로그인 없이 연다 (2026-09-04, PUBL-03).
   *
   * 이게 없으면 공개된 맵은 **사진 자리마다 깨진 채로** 열린다. 사진은
   * 이제 대부분 서버 저장소에 있고(D-1~D-6 이미지 외부화), 그 주소는
   * 인증이 필요하기 때문이다. 맵은 보이는데 그림이 안 보이는 것은
   * 사용자에게 그냥 고장으로 보인다 — `open()` 이 참가자에게 첨부를
   * 열어 주는 것과 **같은 이유**다.
   *
   * 여는 조건이 좁다는 것이 이 함수의 전부다.
   *   · 그 첨부가 **그 맵의 것**이어야 한다 (`a.map_id`)
   *   · 그 맵이 **지금 그 링크로 공개 중**이어야 한다
   *   · 맵이 휴지통에 있으면 안 된다 (`deleted_at`)
   * 게시를 취소하면 사진도 같이 닫힌다 — 링크 하나가 문 하나다.
   */
  async openPublished(
    publishId: string,
    id: string,
    range?: { start: number; end: number },
  ): Promise<AttachmentMeta & { stream: ReadStream }> {
    // 퍼블리싱 표가 없는 서버에서는 공개 자체가 없다 — 물어볼 것도 없다
    if (!(await tableReady(this.db, 'public.published_maps'))) {
      throw new NotFoundException('첨부 파일을 찾을 수 없습니다.');
    }
    // ★ **무료공개 중일 때만 연다** (2026-09-05). 보관(비공개)으로 돌리면
    //   본문과 **같은 순간에** 사진도 닫혀야 한다 — 한쪽만 닫으면 주소를
    //   아는 사람이 사진으로 내용을 짐작한다.
    const open = (await columnReady(this.db, 'public.published_maps', 'visibility'))
      ? `AND p.visibility = 'public'` : '';
    const { rows } = await this.db.query<{
      name: string; mime: string; size_bytes: string; storage_key: string;
    }>(
      `SELECT a.name, a.mime, a.size_bytes, a.storage_key
         FROM public.attachments a
         JOIN public.maps m
           ON m.id = a.map_id AND m.deleted_at IS NULL
         JOIN public.published_maps p
           ON p.map_id = a.map_id AND p.unpublished_at IS NULL
        WHERE a.id = $1 AND p.publish_id = $2
          ${open}`,
      [id, publishId],
    );
    if (!rows[0]) throw new NotFoundException('첨부 파일을 찾을 수 없습니다.');
    const r = rows[0];
    return {
      id,
      name: r.name,
      mime: r.mime,
      sizeBytes: Number(r.size_bytes),
      stream: await this.storage.stream(r.storage_key, range),
    };
  }

  /**
   * 첨부 지우기 — 내 것이거나, **그 맵에 쓸 수 있는 사람**이면 된다
   * (2026-09-05). 협업맵의 첨부는 맵 주인 것이라, 올린 참가자가 노드에서
   * 떼어 낼 때 서버 파일도 함께 지우려면 편집 권한으로 열어 줘야 한다 —
   * 노드에서 뗄 수 있는 사람이 파일은 못 지우면 용량만 남는다.
   * 읽기만 참가자·남은 여전히 404 (있는지도 알려 주지 않는다).
   */
  async remove(userId: string, id: string): Promise<void> {
    const rows = await queryAllowingMissingMembers<{ id: string; storage_key: string }>(
      this.db,
      `SELECT a.id, a.storage_key
         FROM public.attachments a
         LEFT JOIN public.maps m
           ON m.id = a.map_id AND m.deleted_at IS NULL
         LEFT JOIN public.map_members mm
           ON mm.map_id = a.map_id AND mm.user_id = $2 AND mm.role IN ('owner', 'editor')
        WHERE a.id = $1
          AND (a.owner_id = $2 OR m.owner_id = $2 OR mm.user_id IS NOT NULL)`,
      `SELECT a.id, a.storage_key
         FROM public.attachments a
         LEFT JOIN public.maps m
           ON m.id = a.map_id AND m.deleted_at IS NULL
        WHERE a.id = $1 AND (a.owner_id = $2 OR m.owner_id = $2)`,
      [id, userId],
    );
    if (!rows[0]) throw new NotFoundException('첨부 파일을 찾을 수 없습니다.');
    await this.db.query(`DELETE FROM public.attachments WHERE id = $1`, [id]);
    await this.storage.delete(rows[0].storage_key);
  }
}
