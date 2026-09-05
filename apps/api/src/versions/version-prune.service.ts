// 버전 정리 워커 — `version-prune` (2026-09-06, 13a §2.2 · schema-overhaul-plan §3).
//
// 저장할 때마다 문서 전체 스냅샷이 1건씩 영구히 쌓였다(표준 사용자 용량의
// 98% 가 히스토리, infra-architecture §18.5). 여기서 **개설자 요금제의
// 보관 기간**(`plan_quotas.version_days`)과 밀도 규칙(version-prune-plan.ts)
// 으로 솎아낸다. 영구보관(`pinned`)은 절대 손대지 않는다.
//
// ★ 언제 도나 — 둘 다 (13a §8 이 미정으로 둔 것을 여기서 정했다)
//   ① 저장 뒤 60초(디바운스, 같은 맵은 합친다) — 활발한 맵은 저장이 곧 정리다.
//      저장 트랜잭션 안에서 하지 않는다: 버전 100개 지우느라 저장이 멈추면
//      사용자는 이유를 모른다. 60초는 저장 경로의 사진 GC(gcMapImages) 가
//      먼저 끝나게 두는 간격이기도 하다(13a §2.2 ⚠).
//   ② 하루 한 번 전체 훑기 — 저장이 끊긴 맵(Free 7일이 지나도록 열지 않은
//      맵)의 만료는 ①로는 영영 안 온다.
//   BullMQ 는 쓰지 않는다 — 이 저장소에 큐가 아직 없고, vault 미러가 같은
//   방식(setTimeout 디바운스)으로 잘 돌고 있다. 큐가 생기면 그때 옮긴다.
//
// ★ 없으면 아무것도 안 한다 — 델타(#380 B) 가 안 들어간 서버에는 `pinned`·
//   `version_days` 칸이 없다. 그때 정리를 돌리면 **영구보관을 구분 못 한 채**
//   지우게 된다. 칸이 있는지 먼저 보고(columnReady), 없으면 로그 한 줄만.
//
// ★ 소급하지 않는다 — `VERSION_PRUNE_SINCE` 이전 버전은 건드리지 않는다
//   (13a §6). 기본값은 스키마 정비로 DB 를 비운 날(2026-09-04).

import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../database/database.service';
import { columnReady } from '../common/table-ready';
import type { AppEnv } from '../config/env.validation';
import { planPrune, type PruneCandidate, type PrunePlan } from './version-prune-plan';

export interface PruneResult {
  mapId: string;
  versionDays: number | null;
  deleted: number;
  expired: number;
  thinned: number;
  kept: number;
}

export interface PruneStatus {
  enabled: boolean;
  /** 칸이 있어 실제로 돌 수 있는가 — null 은 아직 안 물어봤다 */
  ready: boolean | null;
  graceDays: number;
  since: string | null;
  lastSweepAt: string | null;
  lastSweepMaps: number;
  lastSweepDeleted: number;
  /** 기동 뒤 지운 버전 수 누계 (저장 뒤 정리 + 훑기) */
  deletedTotal: number;
}

const VERSIONS = 'public.map_document_versions';

@Injectable()
export class VersionPruneService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('VersionPrune');
  private readonly enabled: boolean;
  private readonly debounceMs: number;
  private readonly sweepMs: number;
  private readonly graceDays: number;
  private readonly since: Date | null;
  private readonly pending = new Map<string, NodeJS.Timeout>();
  private sweepTimer: NodeJS.Timeout | null = null;
  private sweeping = false;
  private ready: boolean | null = null;
  private lastSweepAt: Date | null = null;
  private lastSweepMaps = 0;
  private lastSweepDeleted = 0;
  private deletedTotal = 0;

  constructor(
    private readonly db: DatabaseService,
    config: ConfigService<AppEnv, true>,
  ) {
    this.enabled = config.get('VERSION_PRUNE_ENABLED', { infer: true });
    this.debounceMs = config.get('VERSION_PRUNE_DEBOUNCE_MS', { infer: true });
    this.sweepMs = config.get('VERSION_PRUNE_SWEEP_HOURS', { infer: true }) * 3_600_000;
    this.graceDays = config.get('VERSION_PRUNE_GRACE_DAYS', { infer: true });
    const since = config.get('VERSION_PRUNE_SINCE', { infer: true });
    this.since = since ? new Date(since) : null;
  }

  onModuleInit(): void {
    if (!this.enabled) { this.log.log('버전 정리: 꺼짐 (VERSION_PRUNE_ENABLED=false)'); return; }
    this.log.log(
      `버전 정리: 켜짐 — 저장 뒤 ${Math.round(this.debounceMs / 1000)}초 · ` +
      `전체 훑기 ${this.sweepMs > 0 ? `${this.sweepMs / 3_600_000}시간마다` : '없음'} · ` +
      `유예 ${this.graceDays}일 · 소급 기준 ${this.since?.toISOString() ?? '없음'}`,
    );
    if (this.sweepMs > 0) {
      // 첫 훑기는 기동 5분 뒤 — 배포 직후의 소란(재시작·마이그레이션)과 겹치지 않게
      const first = setTimeout(() => void this.sweep(), Math.min(5 * 60_000, this.sweepMs));
      first.unref?.();
      this.sweepTimer = first;
    }
  }

  onModuleDestroy(): void {
    for (const t of this.pending.values()) clearTimeout(t);
    this.pending.clear();
    if (this.sweepTimer) clearTimeout(this.sweepTimer);
  }

  status(): PruneStatus {
    return {
      enabled: this.enabled,
      ready: this.ready,
      graceDays: this.graceDays,
      since: this.since?.toISOString() ?? null,
      lastSweepAt: this.lastSweepAt?.toISOString() ?? null,
      lastSweepMaps: this.lastSweepMaps,
      lastSweepDeleted: this.lastSweepDeleted,
      deletedTotal: this.deletedTotal,
    };
  }

  /** 칸 둘이 다 있어야 돈다. "없다" 는 60초마다 다시 본다(columnReady 규칙) */
  async isReady(): Promise<boolean> {
    const ok = (await columnReady(this.db, VERSIONS, 'pinned'))
      && (await columnReady(this.db, 'public.plan_quotas', 'version_days'));
    if (this.ready !== ok) {
      this.ready = ok;
      if (!ok) this.log.warn('버전 정리 건너뜀 — map_document_versions.pinned / plan_quotas.version_days 칸이 없다 (델타 2026-09-04-schema-overhaul-abc.sql)');
    }
    return ok;
  }

  /** 저장 뒤 부른다 — 같은 맵의 연속 저장은 하나로 합친다 */
  schedule(mapId: string): void {
    if (!this.enabled) return;
    const prev = this.pending.get(mapId);
    if (prev) clearTimeout(prev);
    const t = setTimeout(() => {
      this.pending.delete(mapId);
      this.pruneMap(mapId).catch((err: unknown) => {
        // 정리는 실패해도 다음 저장·다음 훑기에서 다시 한다 — 로그로만
        this.log.warn(`버전 정리 실패 (map=${mapId}): ${(err as Error).message}`);
      });
    }, this.debounceMs);
    t.unref?.();
    this.pending.set(mapId, t);
  }

  /** 지우지 않고 계획만 — 화면의 "곧 정리됩니다" 와 검증이 쓴다 */
  async preview(mapId: string, now = new Date()): Promise<PrunePlan & { versionDays: number | null; graceDays: number; ready: boolean }> {
    const ready = await this.isReady();
    if (!ready) {
      return { expired: [], thinned: [], expiring: [], kept: [], versionDays: null, graceDays: this.graceDays, ready };
    }
    const { plan, versionDays } = await this.planFor(mapId, now);
    return { ...plan, versionDays, graceDays: this.graceDays, ready };
  }

  async pruneMap(mapId: string, now = new Date()): Promise<PruneResult | null> {
    if (!this.enabled || !(await this.isReady())) return null;
    const { plan, versionDays } = await this.planFor(mapId, now);
    const gone = [...plan.expired, ...plan.thinned];
    if (gone.length) {
      // id 로만 지운다 — 계획을 세운 뒤 새로 생긴 버전은 건드리지 않는다.
      // pinned = FALSE 를 한 번 더 거는 이유: 계획과 삭제 사이에 누가 별표를
      // 눌렀을 수 있다. 그 사이의 별표는 이긴다.
      await this.db.query(
        `DELETE FROM public.map_document_versions
          WHERE map_id = $1 AND pinned = FALSE AND id = ANY($2::uuid[])`,
        [mapId, gone.map((v) => v.id)],
      );
      this.deletedTotal += gone.length;
      this.log.log(
        `버전 정리 map=${mapId}: 만료 ${plan.expired.length} · 솎음 ${plan.thinned.length} · ` +
        `남김 ${plan.kept.length} (보관 ${versionDays ?? '무제한'}일)`,
      );
    }
    return {
      mapId, versionDays, deleted: gone.length,
      expired: plan.expired.length, thinned: plan.thinned.length, kept: plan.kept.length,
    };
  }

  /**
   * 전체 훑기 — 하루 한 번. 정리할 것이 **있을 법한** 맵만 고른다: 영구보관이
   * 아닌 버전이 하루 이상 된 맵. 맵 하나씩 차례로(동시에 돌리지 않는다 —
   * DB 를 밀치지 않으려고).
   */
  async sweep(now = new Date()): Promise<{ maps: number; deleted: number }> {
    if (this.sweeping) return { maps: 0, deleted: 0 };
    this.sweeping = true;
    let maps = 0;
    let deleted = 0;
    try {
      if (!(await this.isReady())) return { maps, deleted };
      const { rows } = await this.db.query<{ map_id: string }>(
        `SELECT DISTINCT v.map_id
           FROM public.map_document_versions v
           JOIN public.maps m ON m.id = v.map_id
          WHERE v.pinned = FALSE
            AND v.created_at < $1::timestamptz - INTERVAL '1 day'
            ${this.since ? 'AND v.created_at >= $2::timestamptz' : ''}`,
        this.since ? [now, this.since] : [now],
      );
      for (const r of rows) {
        try {
          const res = await this.pruneMap(r.map_id, now);
          maps += 1;
          deleted += res?.deleted ?? 0;
        } catch (err) {
          this.log.warn(`버전 정리 실패 (map=${r.map_id}): ${(err as Error).message}`);
        }
      }
      this.lastSweepAt = now;
      this.lastSweepMaps = maps;
      this.lastSweepDeleted = deleted;
      this.log.log(`버전 정리 전체 훑기: 맵 ${maps}개 · 지움 ${deleted}개`);
      return { maps, deleted };
    } finally {
      this.sweeping = false;
      if (this.enabled && this.sweepMs > 0) {
        const t = setTimeout(() => void this.sweep(), this.sweepMs);
        t.unref?.();
        this.sweepTimer = t;
      }
    }
  }

  private async planFor(mapId: string, now: Date): Promise<{ plan: PrunePlan; versionDays: number | null }> {
    // 보관 기간은 **개설자** 요금제 (13a §4.5) — 참가자 요금제는 보지 않는다
    const { rows: q } = await this.db.query<{ version_days: number | null; latest: number | null }>(
      `SELECT pq.version_days,
              (SELECT MAX(version) FROM public.map_document_versions WHERE map_id = m.id) AS latest
         FROM public.maps m
         JOIN public.users u ON u.id = m.owner_id
         LEFT JOIN public.plan_quotas pq ON pq.plan = u.plan
        WHERE m.id = $1`,
      [mapId],
    );
    const versionDays = q[0]?.version_days ?? null;
    const latest = q[0]?.latest ?? 0;
    const { rows } = await this.db.query<{ id: string; version: number; created_at: Date }>(
      `SELECT id, version, created_at FROM public.map_document_versions
        WHERE map_id = $1 AND pinned = FALSE`,
      [mapId],
    );
    const candidates: PruneCandidate[] = rows.map((r) => ({ id: r.id, version: r.version, createdAt: r.created_at }));
    const plan = planPrune(candidates, latest, now, { versionDays, graceDays: this.graceDays, since: this.since });
    return { plan, versionDays };
  }
}
