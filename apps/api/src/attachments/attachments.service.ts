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
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { ReadStream } from 'node:fs';
import { DatabaseService } from '../database/database.service';
import { StorageService } from '../storage/storage.service';

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

  /** 추가로 addBytes 를 쓰면 쿼터를 넘는지 검사 — 넘으면 413 */
  async assertQuota(userId: string, addBytes: number): Promise<void> {
    const u = await this.usage(userId);
    if (u.usedBytes + addBytes > u.quotaBytes) {
      // **어느 요금제의 한도인지 밝힌다** — "왜 이 숫자인가"를 사용자가
      // 알아야 올릴지 정리할지 판단할 수 있다.
      throw new PayloadTooLargeException(
        `저장 용량 한도를 초과합니다 — 사용 중 ${fmtGB(u.usedBytes)} / ` +
        `한도 ${fmtGB(u.quotaBytes)} (${PLAN_LABEL[u.plan]} 요금제). ` +
        '첨부나 맵을 정리하거나 요금제를 올려 주세요.',
      );
    }
  }

  async upload(
    userId: string,
    file: { originalname: string; mimetype: string; size: number; buffer: Buffer },
    mapId?: string,
  ): Promise<AttachmentMeta> {
    await this.assertQuota(userId, file.size);

    // multer 는 파일명을 latin1 로 넘긴다 — 한글 파일명 복원
    const name = Buffer.from(file.originalname, 'latin1').toString('utf8');
    const id = randomUUID();
    const key = `u/${userId}/${id}`; // 서버가 UUID 로만 조립 (경로 주입 불가)
    await this.storage.put(key, file.buffer);
    try {
      await this.db.query(
        `INSERT INTO public.attachments (id, owner_id, map_id, name, mime, size_bytes, storage_key)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [id, userId, mapId ?? null, name.slice(0, 255),
         (file.mimetype || 'application/octet-stream').slice(0, 127), file.size, key],
      );
    } catch (err) {
      await this.storage.delete(key).catch(() => undefined); // 고아 파일 방지
      throw err;
    }
    return { id, name, mime: file.mimetype, sizeBytes: file.size };
  }

  async open(
    userId: string,
    id: string,
  ): Promise<AttachmentMeta & { stream: ReadStream }> {
    const { rows } = await this.db.query<{
      name: string; mime: string; size_bytes: string; storage_key: string;
    }>(
      `SELECT name, mime, size_bytes, storage_key
         FROM public.attachments WHERE id = $1 AND owner_id = $2`,
      [id, userId],
    );
    if (!rows[0]) throw new NotFoundException('첨부 파일을 찾을 수 없습니다.');
    const r = rows[0];
    return {
      id,
      name: r.name,
      mime: r.mime,
      sizeBytes: Number(r.size_bytes),
      stream: await this.storage.stream(r.storage_key),
    };
  }

  async remove(userId: string, id: string): Promise<void> {
    const { rows } = await this.db.query<{ storage_key: string }>(
      `DELETE FROM public.attachments WHERE id = $1 AND owner_id = $2
       RETURNING storage_key`,
      [id, userId],
    );
    if (!rows[0]) throw new NotFoundException('첨부 파일을 찾을 수 없습니다.');
    await this.storage.delete(rows[0].storage_key);
  }
}
