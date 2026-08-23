// vault.service — **언제** 쓰는가, 그리고 무엇을 기억하는가.
//
// 설계: docs/04-extensions/vault-mirror.md §6 · §8
//
// 슬라이스 1 이 "어떤 이름", 2 가 "안전하게 쓰는 법", 3(여기)이 "언제".
//
// ─────────────────────────────────────────────────────────────────────
// ★ 큐 대신 **디바운스 하나**를 쓴다 (설계 §6 의 전제가 틀렸다).
//
// 설계 문서는 "`export`·`ai-generate` 큐가 이미 있으니 그 옆에 붙인다" 고
// 적었는데 **그 큐들은 없다.** BullMQ 도 Redis 도 워커도 이 저장소에 없다.
//
// vault 는 셀프호스트 전용(§2)이라 **API 가 한 벌만 돈다.** 맵 id 별 타이머
// 하나면 "저장 완료 → 5초 뒤 · 같은 맵은 합친다" 가 그대로 된다. 이 기능
// 하나를 위해 사용자에게 Redis 를 띄우라고 할 일이 아니다. 나중에 API 를
// 여러 벌 돌릴 때 큐로 갈아 끼우면 된다 — 그때는 큐가 필요한 다른 이유도
// 생겨 있을 것이다.
//
// ★ **실패해도 사용자를 막지 않는다** (§6). 정본은 DB 에 있다. 미러가
//   실패하면 로그만 남기고 다음 저장에서 다시 시도한다 — 저장 응답을
//   실패시키면 사용자는 **파일 미러 때문에 편집분을 잃는다.**
// ─────────────────────────────────────────────────────────────────────

import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../database/database.service';
import type { AppEnv } from '../config/env.validation';
import { buildVaultPlan, type VaultFolderRow, type VaultMapRow } from './vault-plan';
import {
  ensureVaultRoot, moveVaultFile, trashVaultFile, VaultError,
} from './vault-writer';

/**
 * `doc` → vault 에 쓸 마크다운.
 *
 * ★ **직렬화기를 여기서 다시 만들지 않는다.** 규칙이 두 벌이 되면 어긋나고,
 *   어긋나면 **vault 파일과 내보내기 파일이 다른 문서**가 된다. EMM 직렬화는
 *   `@easymindmap/emm-parser` 한 곳이 원본이다.
 *
 *   그 패키지가 npm 에 올라오면 `VaultModule` 이 여기에 꽂는다(슬라이스 4).
 *   꽂히기 전에는 미러가 **꺼진 것과 같다** — 쓸 내용을 만들 수 없으므로
 *   아무것도 쓰지 않는다.
 */
export type VaultRenderer = (doc: unknown, title: string) => string;

/** 저장 뒤 이만큼 기다렸다 쓴다 — 그 사이 또 저장되면 합친다 (§6) */
export const VAULT_DEBOUNCE_MS = 5_000;

@Injectable()
export class VaultService implements OnModuleDestroy {
  private readonly log = new Logger(VaultService.name);
  private readonly root: string;
  private renderer: VaultRenderer | null = null;
  /** 맵 id → 대기 중인 타이머. 같은 맵이 또 저장되면 **덮어쓴다**(합친다) */
  private readonly pending = new Map<string, NodeJS.Timeout>();
  /** vault 루트를 준비했는가 — 한 번만 확인한다 */
  private rootReady: Promise<void> | null = null;

  constructor(
    private readonly db: DatabaseService,
    config: ConfigService<AppEnv, true>,
  ) {
    this.root = String(config.get('VAULT_DIR', { infer: true }) ?? '').trim();
  }

  /** 마크다운을 만들 수 있는 자를 꽂는다 (슬라이스 4) */
  setRenderer(fn: VaultRenderer): void {
    this.renderer = fn;
  }

  /** vault 미러가 실제로 도는가 — 폴더가 정해졌고 마크다운을 만들 수 있어야 한다 */
  get enabled(): boolean {
    return this.root !== '' && this.renderer !== null;
  }

  /**
   * 저장이 끝났다고 알린다 — **기다렸다** 쓴다 (§6).
   *
   * 자동저장마다 쓰면 손을 멈출 때마다 디스크에 수 MB 를 쓰게 된다.
   * 같은 맵이 5초 안에 또 저장되면 타이머를 새로 잡아 **한 번만** 쓴다.
   *
   * 절대 던지지 않는다 — 저장 경로에서 불리기 때문이다.
   */
  scheduleMirror(userId: string, mapId: string): void {
    if (!this.enabled) return;
    const prev = this.pending.get(mapId);
    if (prev) clearTimeout(prev);
    const t = setTimeout(() => {
      this.pending.delete(mapId);
      this.mirrorMap(userId, mapId).catch((err: unknown) => {
        // 정본은 DB 에 있다. 미러 실패는 로그로만 알리고 다음 저장에서 다시 한다.
        this.log.warn(`vault 미러 실패 (map=${mapId}): ${(err as Error).message}`);
      });
    }, VAULT_DEBOUNCE_MS);
    // 이 타이머 때문에 프로세스가 안 죽으면 안 된다 — 종료를 붙잡지 않는다
    t.unref?.();
    this.pending.set(mapId, t);
  }

  /** 종료할 때 대기 중인 것을 정리한다 (붙잡지는 않는다) */
  onModuleDestroy(): void {
    for (const t of this.pending.values()) clearTimeout(t);
    this.pending.clear();
  }

  private async ensureRoot(): Promise<void> {
    if (!this.rootReady) this.rootReady = ensureVaultRoot(this.root);
    return this.rootReady;
  }

  /**
   * 맵 하나를 vault 에 반영한다 — 지금 바로.
   *
   * 제목·폴더가 바뀌었으면 **옛 파일을 휴지통으로 보내고** 새 자리에 쓴다
   * (§3.2 — `vault_files.rel_path` 가 옛 자리를 기억한다. 이게 없으면
   * 제목을 바꿀 때마다 유령 파일이 쌓인다).
   */
  async mirrorMap(userId: string, mapId: string): Promise<void> {
    if (!this.enabled || !this.renderer) return;
    await this.ensureRoot();

    const { rows: mapRows } = await this.db.query<{
      id: string; title: string; folder_id: string | null;
      created_at: Date; deleted_at: Date | null; doc: unknown;
    }>(
      `SELECT m.id, m.title, m.folder_id, m.created_at, m.deleted_at, d.doc
         FROM public.maps m
         LEFT JOIN public.map_documents d ON d.map_id = m.id
        WHERE m.id = $1 AND m.owner_id = $2`,
      [mapId, userId],
    );
    const map = mapRows[0];
    if (!map) return;                       // 지워졌거나 남의 것 — 아무것도 안 한다

    const { rows: prevRows } = await this.db.query<{
      rel_path: string; content_hash: string;
    }>(`SELECT rel_path, content_hash FROM public.vault_files WHERE map_id = $1`, [mapId]);
    const prev = prevRows[0] ?? null;

    // soft delete 된 맵은 파일도 휴지통으로 (§3.3) — 지우지 않는다
    if (map.deleted_at) {
      if (prev) {
        const moved = await trashVaultFile(this.root, prev.rel_path);
        await this.db.query(`DELETE FROM public.vault_files WHERE map_id = $1`, [mapId]);
        this.log.log(`vault 휴지통 — ${prev.rel_path} → ${moved ?? '(파일 없음)'}`);
      }
      return;
    }
    if (map.doc === null || map.doc === undefined) return;   // 아직 문서가 없다

    const relPath = await this.relPathFor(userId, mapId);
    if (!relPath) return;
    const content = this.renderer(map.doc, map.title);

    const res = await moveVaultFile(
      this.root, prev?.rel_path ?? null, relPath, content, prev?.content_hash ?? null,
    );

    if (res.status === 'conflict') {
      // 사용자가 고친 파일은 그대로 두고 비켜 썼다. **기록은 갱신하지 않는다** —
      // 갱신하면 다음 번에 "우리가 쓴 그대로" 로 보여 그 편집을 덮어쓴다.
      this.log.warn(
        `vault 충돌 — 사용자가 고친 파일을 덮지 않고 ${res.conflictPath} 로 썼습니다`,
      );
      return;
    }

    await this.db.query(
      `INSERT INTO public.vault_files (map_id, rel_path, content_hash, written_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (map_id) DO UPDATE
         SET rel_path = EXCLUDED.rel_path,
             content_hash = EXCLUDED.content_hash,
             written_at = NOW()`,
      [mapId, relPath, res.hash],
    );
  }

  /**
   * 이 맵이 놓일 자리 — **같은 사용자의 문서함 전체를 보고** 정한다.
   *
   * 한 맵만 보고 정할 수 없다. 파일 이름이 겹치는지는 **형제들을 봐야**
   * 알 수 있기 때문이다(§3.1 중복 규칙).
   */
  private async relPathFor(userId: string, mapId: string): Promise<string | null> {
    const { rows: folders } = await this.db.query<{
      id: string; parent_id: string | null; name: string; created_at: Date;
    }>(
      `SELECT id, parent_id, name, created_at FROM public.map_folders WHERE owner_id = $1`,
      [userId],
    );
    const { rows: maps } = await this.db.query<{
      id: string; title: string; folder_id: string | null; created_at: Date;
    }>(
      `SELECT id, title, folder_id, created_at FROM public.maps
        WHERE owner_id = $1 AND deleted_at IS NULL`,
      [userId],
    );

    const plan = buildVaultPlan(
      folders.map((f): VaultFolderRow => ({
        id: f.id, parentId: f.parent_id, name: f.name, createdAt: f.created_at,
      })),
      maps.map((m): VaultMapRow => ({
        mapId: m.id, title: m.title, folderId: m.folder_id, createdAt: m.created_at,
      })),
    );
    return plan.find((p) => p.mapId === mapId)?.relPath ?? null;
  }

  /** 기동 로그 한 줄 — 켜졌는지 꺼졌는지 사용자가 알아야 한다 */
  describe(): string {
    if (!this.root) return 'vault 미러: 꺼짐 (VAULT_DIR 미설정)';
    if (!this.renderer) return `vault 미러: 대기 (VAULT_DIR=${this.root}, 직렬화기 미연결)`;
    return `vault 미러: 켜짐 → ${this.root}`;
  }
}

export { VaultError };
