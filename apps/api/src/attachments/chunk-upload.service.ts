// 대용량 첨부 — 청크(분할) 업로드 (2026-08-06, attachment-storage.md §12).
//
// 단일 요청 업로드(`POST /v1/attachments`)는 multer 메모리 버퍼라 **파일
// 전체가 힙에 올라간다.** 1GB 파일 하나에 워커가 죽으므로 상한이 200MB 에
// 묶여 있었다. 여기서는 파일을 조각으로 나눠 받고, 조각을 **스트림 그대로
// 디스크에 흘린다** — 서버 메모리 사용량이 파일 크기와 무관해진다.
//
// 세 단계다.
//   ① start()    세션 시작 — 쿼터를 **미리 예약**하고 조각 크기를 알려 준다
//   ② putPart()  조각 하나 (멱등 — 같은 index 재전송은 덮어쓴다)
//   ③ complete() 조각을 이어붙여 `attachments` 로 확정
//
// **진행 상태는 DB 가 아니라 tmp 디렉터리에 둔다** — 미완성 업로드가
// 목록·쿼터 집계에 섞이지 않게, `attachments` INSERT 는 완료 시점에만 한다.
//
//   STORAGE_LOCAL_DIR/
//     u/<userId>/<attachmentId>        ← 완성된 파일 (기존과 동일)
//     tmp/<userId>/<uploadId>/
//       meta.json                      ← 세션 정보
//       part-0, part-1, …
//
// **경로에 userId 를 넣은 것은 설계(§12.5, `tmp/<uploadId>/`)에서 바꾼
// 부분이다.** 조회 자체를 "인증된 사용자의 디렉터리 안"으로 좁히면 남의
// uploadId 를 넣어도 **찾을 수 없어 404** 가 된다 — meta.json 을 읽고
// 소유자를 비교하는 것보다 실수할 여지가 적다. 사용자별 예약 용량을
// 세는 것도 그 사용자 디렉터리만 훑으면 된다.

import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  PayloadTooLargeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';
import { DatabaseService } from '../database/database.service';
import { StorageService } from '../storage/storage.service';
import type { AppEnv } from '../config/env.validation';
import { AttachmentsService, type AttachmentMeta } from './attachments.service';

/** 미완성 세션을 남겨 두는 기간 — 넘으면 GC 가 지운다 */
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
/** GC 주기 (기동 직후 1회 + 이 간격) */
const GC_INTERVAL_MS = 6 * 60 * 60 * 1000;

interface UploadMeta {
  uploadId: string;
  userId: string;
  name: string;
  mime: string;
  size: number;
  partSize: number;
  parts: number;
  mapId: string | null;
  createdAt: string;
}

export interface UploadSession {
  uploadId: string;
  partSize: number;
  parts: number;
  received: number[];
  expiresAt: string;
}

@Injectable()
export class ChunkUploadService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(ChunkUploadService.name);
  private readonly partSize: number;
  private readonly maxBytes: number;
  private gcTimer?: NodeJS.Timeout;

  constructor(
    private readonly db: DatabaseService,
    private readonly storage: StorageService,
    private readonly attachments: AttachmentsService,
    config: ConfigService<AppEnv, true>,
  ) {
    this.partSize = config.get('ATTACHMENT_PART_KB', { infer: true }) * 1024;
    this.maxBytes = config.get('ATTACHMENT_CHUNK_MAX_MB', { infer: true }) * 1024 * 1024;
  }

  onModuleInit(): void {
    void this.sweepExpired();
    this.gcTimer = setInterval(() => void this.sweepExpired(), GC_INTERVAL_MS);
    // 타이머가 프로세스를 붙잡아 두지 않게 한다 (테스트·graceful shutdown)
    this.gcTimer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.gcTimer) clearInterval(this.gcTimer);
  }

  // ── 경로 ─────────────────────────────────────────────────────────
  private dir(userId: string, uploadId: string): string {
    return `tmp/${userId}/${uploadId}`;
  }
  private metaKey(userId: string, uploadId: string): string {
    return `${this.dir(userId, uploadId)}/meta.json`;
  }
  private partKey(userId: string, uploadId: string, index: number): string {
    return `${this.dir(userId, uploadId)}/part-${index}`;
  }

  /**
   * 세션을 읽는다. **없으면 404** — 남의 uploadId 든 만료된 것이든 똑같이
   * "찾을 수 없다"로 답한다 (존재 여부를 흘리지 않는다).
   */
  private async readMeta(userId: string, uploadId: string): Promise<UploadMeta> {
    // uploadId 는 컨트롤러의 ParseUUIDPipe 를 통과한 값이지만, 경로를
    // 조립하는 곳에서 한 번 더 막는다 (방어선은 겹쳐 둔다).
    if (!/^[0-9a-fA-F-]{36}$/.test(uploadId)) {
      throw new NotFoundException('업로드 세션을 찾을 수 없습니다.');
    }
    const buf = await this.storage.readSmall(this.metaKey(userId, uploadId));
    if (!buf) throw new NotFoundException('업로드 세션을 찾을 수 없습니다.');
    try {
      const m = JSON.parse(buf.toString('utf8')) as UploadMeta;
      if (m.userId !== userId) throw new NotFoundException('업로드 세션을 찾을 수 없습니다.');
      return m;
    } catch (err) {
      if (err instanceof NotFoundException) throw err;
      throw new NotFoundException('업로드 세션을 찾을 수 없습니다.');
    }
  }

  /** 지금 이 사용자가 **올리는 중**인 바이트 합 (쿼터 예약분) */
  private async pendingBytes(userId: string, exceptUploadId?: string): Promise<number> {
    const ids = await this.storage.listChildren(`tmp/${userId}`);
    let total = 0;
    for (const id of ids) {
      if (id === exceptUploadId) continue;
      const buf = await this.storage.readSmall(this.metaKey(userId, id));
      if (!buf) continue;
      try {
        const m = JSON.parse(buf.toString('utf8')) as UploadMeta;
        if (Date.now() - Date.parse(m.createdAt) > SESSION_TTL_MS) continue;
        total += Number(m.size) || 0;
      } catch { /* 깨진 meta 는 GC 가 치운다 */ }
    }
    return total;
  }

  // ── ① 세션 시작 ──────────────────────────────────────────────────
  async start(
    userId: string,
    input: { name: string; mime?: string; size: number; mapId?: string },
  ): Promise<UploadSession> {
    const size = Math.floor(Number(input.size));
    if (!Number.isFinite(size) || size <= 0) {
      throw new BadRequestException('size 는 1 이상의 정수여야 합니다.');
    }
    if (size > this.maxBytes) {
      throw new PayloadTooLargeException(
        `첨부 1개는 최대 ${Math.round(this.maxBytes / 1024 / 1024)}MB 까지입니다.`,
      );
    }
    // **쿼터를 미리 검사한다** — 다 올린 뒤에 거절하면 사용자가 몇 분을
    // 버린다. 동시에 여러 개를 올릴 때 합쳐서 넘지 않도록 예약분도 더한다.
    // 협업맵이면 주인·용량은 맵 주인 몫 (AttachmentsService.resolveOwner)
    const owner = await this.attachments.resolveOwner(userId, input.mapId || undefined);
    await this.attachments.assertQuota(
      owner.ownerId, size + (await this.pendingBytes(userId)), owner.onBehalf,
    );

    const uploadId = randomUUID();
    const parts = Math.ceil(size / this.partSize);
    const meta: UploadMeta = {
      uploadId,
      userId,
      name: String(input.name || '첨부').slice(0, 255),
      mime: String(input.mime || 'application/octet-stream').slice(0, 127),
      size,
      partSize: this.partSize,
      parts,
      mapId: input.mapId || null,
      createdAt: new Date().toISOString(),
    };
    await this.storage.put(
      this.metaKey(userId, uploadId),
      Buffer.from(JSON.stringify(meta), 'utf8'),
    );
    return {
      uploadId, partSize: this.partSize, parts, received: [],
      expiresAt: new Date(Date.parse(meta.createdAt) + SESSION_TTL_MS).toISOString(),
    };
  }

  // ── ② 조각 전송 ──────────────────────────────────────────────────
  /**
   * 조각 하나를 받아 그대로 파일로 흘린다. **멱등** — 같은 index 를 다시
   * 보내면 덮어쓴다. 그래서 재시도가 안전하다.
   */
  async putPart(
    userId: string, uploadId: string, index: number, body: Readable,
  ): Promise<{ received: number; parts: number }> {
    const m = await this.readMeta(userId, uploadId);
    if (!Number.isInteger(index) || index < 0 || index >= m.parts) {
      throw new BadRequestException(`조각 번호는 0~${m.parts - 1} 범위여야 합니다.`);
    }
    // 마지막 조각만 partSize 보다 작다 — 그 밖의 조각이 작으면 잘린 전송이다.
    const expect = index === m.parts - 1
      ? m.size - m.partSize * (m.parts - 1)
      : m.partSize;

    const key = this.partKey(userId, uploadId, index);
    const wrote = await this.storage.putStream(key, body);
    if (wrote !== expect) {
      // 크기가 안 맞는 조각은 남기지 않는다 — 남겨 두면 complete 가
      // "다 왔다"고 착각한다. 지우고 400 을 돌려 재전송하게 한다.
      await this.storage.delete(key).catch(() => undefined);
      throw new BadRequestException(
        `조각 ${index} 의 크기가 다릅니다 (받음 ${wrote} / 기대 ${expect}). 다시 보내 주세요.`,
      );
    }
    const received = await this.receivedParts(userId, uploadId, m);
    return { received: received.length, parts: m.parts };
  }

  /** 실제로 **크기까지 맞게** 도착한 조각 번호들 */
  private async receivedParts(
    userId: string, uploadId: string, m: UploadMeta,
  ): Promise<number[]> {
    const names = new Set(await this.storage.listChildren(this.dir(userId, uploadId)));
    const out: number[] = [];
    for (let i = 0; i < m.parts; i += 1) {
      if (!names.has(`part-${i}`)) continue;
      const expect = i === m.parts - 1 ? m.size - m.partSize * (m.parts - 1) : m.partSize;
      if ((await this.storage.size(this.partKey(userId, uploadId, i))) === expect) out.push(i);
    }
    return out;
  }

  // ── ③ 상태 조회 (이어받기) ───────────────────────────────────────
  async status(userId: string, uploadId: string): Promise<UploadSession> {
    const m = await this.readMeta(userId, uploadId);
    return {
      uploadId,
      partSize: m.partSize,
      parts: m.parts,
      received: await this.receivedParts(userId, uploadId, m),
      expiresAt: new Date(Date.parse(m.createdAt) + SESSION_TTL_MS).toISOString(),
    };
  }

  // ── ④ 완료 ───────────────────────────────────────────────────────
  async complete(userId: string, uploadId: string): Promise<AttachmentMeta> {
    const m = await this.readMeta(userId, uploadId);
    const received = await this.receivedParts(userId, uploadId, m);
    if (received.length !== m.parts) {
      const have = new Set(received);
      const missing: number[] = [];
      for (let i = 0; i < m.parts; i += 1) if (!have.has(i)) missing.push(i);
      // **409 + 빠진 목록** — 클라이언트가 그 조각만 다시 보내면 된다.
      throw new ConflictException({
        message: `조각 ${missing.length}개가 아직 도착하지 않았습니다.`,
        missing: missing.slice(0, 200),
      });
    }
    // 확정 직전에 쿼터를 한 번 더 본다 — 올리는 동안 다른 곳에서 용량을
    // 썼을 수 있다. 이 세션의 예약분은 지금 확정하는 값이므로 뺀다.
    // 주인은 **확정 시점에** 다시 정한다 — 올리는 동안 소유권이 넘어갔거나
    // 참가자에서 빠졌을 수 있다.
    const owner = await this.attachments.resolveOwner(userId, m.mapId ?? undefined);
    await this.attachments.assertQuota(
      owner.ownerId, m.size + (await this.pendingBytes(userId, uploadId)), owner.onBehalf,
    );

    const id = randomUUID();
    const key = `u/${owner.ownerId}/${id}`; // 서버가 UUID 로만 조립 (경로 주입 불가)
    const total = await this.storage.concat(
      key, Array.from({ length: m.parts }, (_, i) => this.partKey(userId, uploadId, i)),
    );
    if (total !== m.size) {
      await this.storage.delete(key).catch(() => undefined);
      await this.storage.deletePrefix(this.dir(userId, uploadId)).catch(() => undefined);
      throw new BadRequestException(
        `합친 크기가 다릅니다 (${total} / ${m.size}). 처음부터 다시 올려 주세요.`,
      );
    }
    try {
      await this.db.query(
        `INSERT INTO public.attachments (id, owner_id, map_id, name, mime, size_bytes, storage_key)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [id, owner.ownerId, m.mapId, m.name, m.mime, m.size, key],
      );
    } catch (err) {
      await this.storage.delete(key).catch(() => undefined); // 고아 파일 방지
      throw err;
    }
    // 여기서부터 실패해도 첨부는 살아 있다 — tmp 는 GC 가 마저 치운다.
    await this.storage.deletePrefix(this.dir(userId, uploadId)).catch(() => undefined);
    return { id, name: m.name, mime: m.mime, sizeBytes: m.size };
  }

  // ── ⑤ 취소 ───────────────────────────────────────────────────────
  async abort(userId: string, uploadId: string): Promise<void> {
    await this.readMeta(userId, uploadId); // 없으면 404
    await this.storage.deletePrefix(this.dir(userId, uploadId));
  }

  // ── 만료 정리 ────────────────────────────────────────────────────
  /** 24시간 넘은 미완성 세션을 지운다 (기동 시 1회 + 주기) */
  async sweepExpired(): Promise<number> {
    let removed = 0;
    try {
      for (const userId of await this.storage.listChildren('tmp')) {
        for (const uploadId of await this.storage.listChildren(`tmp/${userId}`)) {
          const buf = await this.storage.readSmall(this.metaKey(userId, uploadId));
          let stale = true; // meta 를 못 읽는(깨진) 세션은 쓰레기다
          if (buf) {
            try {
              const m = JSON.parse(buf.toString('utf8')) as UploadMeta;
              stale = Date.now() - Date.parse(m.createdAt) > SESSION_TTL_MS;
            } catch { /* stale 유지 */ }
          } else if ((await this.storage.listChildren(`tmp/${userId}/${uploadId}`)).length === 0) {
            // **빈 디렉터리는 건드리지 않는다.** start() 가 mkdir 한 직후
            // meta.json 을 쓰기 전일 수 있다 — 그 찰나에 지우면 방금 시작한
            // 업로드가 죽는다. 빈 디렉터리는 어차피 용량을 먹지 않는다.
            continue;
          }
          if (!stale) continue;
          await this.storage.deletePrefix(`tmp/${userId}/${uploadId}`);
          removed += 1;
        }
      }
    } catch (err) {
      // 저장소가 잠깐 안 붙어도 서버는 계속 돈다 — 다음 주기에 다시 한다.
      this.log.warn(`미완성 업로드 정리 실패: ${(err as Error).message}`);
    }
    if (removed) this.log.log(`만료된 업로드 세션 ${removed}건 정리`);
    return removed;
  }
}
