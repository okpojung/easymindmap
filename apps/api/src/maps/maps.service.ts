import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import type { CreateMapDto } from './dto/create-map.dto';
import type { UpdateMapDto } from './dto/update-map.dto';

/** DB row → API 응답(camelCase) 매핑용 내부 타입 */
interface MapRow {
  id: string;
  title: string;
  default_layout_type: string;
  view_mode: string;
  refresh_interval_seconds: number;
  current_version: number;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

@Injectable()
export class MapsService {
  constructor(private readonly db: DatabaseService) {}

  /** POST /maps — 새 맵 생성 */
  async create(userId: string, dto: CreateMapDto) {
    const { rows } = await this.db.query<MapRow>(
      `INSERT INTO public.maps (owner_id, title, workspace_id, default_layout_type)
       VALUES ($1, $2, $3, COALESCE($4, 'radial-bidirectional'))
       RETURNING *`,
      [userId, dto.title ?? 'Untitled', dto.workspaceId ?? null, dto.defaultLayoutType ?? null],
    );
    const m = rows[0];
    return {
      mapId: m.id,
      title: m.title,
      currentVersion: m.current_version,
      createdAt: m.created_at,
    };
  }

  /** GET /maps — 내 맵 목록 (소유 기준, 소프트삭제 제외 기본) */
  async list(userId: string, opts: { deleted?: boolean; page?: number; limit?: number }) {
    const page = Math.max(1, opts.page ?? 1);
    const limit = Math.min(100, Math.max(1, opts.limit ?? 20));
    const offset = (page - 1) * limit;
    const wantDeleted = opts.deleted === true;

    const where = `owner_id = $1 AND deleted_at IS ${wantDeleted ? 'NOT NULL' : 'NULL'}`;

    const [list, count] = await Promise.all([
      this.db.query<MapRow>(
        `SELECT * FROM public.maps WHERE ${where}
         ORDER BY updated_at DESC LIMIT $2 OFFSET $3`,
        [userId, limit, offset],
      ),
      this.db.query<{ total: string }>(
        `SELECT COUNT(*)::text AS total FROM public.maps WHERE ${where}`,
        [userId],
      ),
    ]);

    return {
      maps: list.rows.map((m) => ({
        mapId: m.id,
        title: m.title,
        deletedAt: m.deleted_at,
        updatedAt: m.updated_at,
      })),
      total: Number(count.rows[0]?.total ?? 0),
    };
  }

  /** GET /maps/:id — 맵 전체(현재 단계: 노드 목록은 빈 배열, 다음 PR에서 채움) */
  async getOne(userId: string, mapId: string) {
    const m = await this.requireOwnedMap(userId, mapId);
    // 노드 모듈은 다음 단계 — 지금은 존재하는 노드를 그대로(없으면 빈 배열) 반환
    const nodes = await this.db.query(
      `SELECT id, parent_id, text, depth, order_index, path::text AS path,
              layout_type, collapsed, shape_type, style_json, node_type
         FROM public.nodes WHERE map_id = $1 ORDER BY depth, order_index`,
      [mapId],
    );
    return {
      mapId: m.id,
      title: m.title,
      currentVersion: m.current_version,
      nodes: nodes.rows,
      updatedAt: m.updated_at,
    };
  }

  /** PATCH /maps/:id — 메타 업데이트(변경 필드만) */
  async update(userId: string, mapId: string, dto: UpdateMapDto) {
    await this.requireOwnedMap(userId, mapId);

    const sets: string[] = [];
    const params: unknown[] = [];
    let i = 1;
    if (dto.title !== undefined) { sets.push(`title = $${i++}`); params.push(dto.title); }
    if (dto.viewMode !== undefined) { sets.push(`view_mode = $${i++}`); params.push(dto.viewMode); }
    if (dto.refreshIntervalSeconds !== undefined) { sets.push(`refresh_interval_seconds = $${i++}`); params.push(dto.refreshIntervalSeconds); }
    if (dto.defaultLayoutType !== undefined) { sets.push(`default_layout_type = $${i++}`); params.push(dto.defaultLayoutType); }
    sets.push('updated_at = NOW()');

    params.push(mapId);
    const { rows } = await this.db.query<MapRow>(
      `UPDATE public.maps SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
      params,
    );
    const m = rows[0];
    return {
      mapId: m.id,
      title: m.title,
      viewMode: m.view_mode,
      refreshIntervalSeconds: m.refresh_interval_seconds,
      defaultLayoutType: m.default_layout_type,
      updatedAt: m.updated_at,
    };
  }

  /** DELETE /maps/:id — 소프트 삭제(deleted_at) */
  async remove(userId: string, mapId: string): Promise<void> {
    const { rowCount } = await this.db.query(
      `UPDATE public.maps SET deleted_at = NOW(), updated_at = NOW()
        WHERE id = $1 AND owner_id = $2 AND deleted_at IS NULL`,
      [mapId, userId],
    );
    if (!rowCount) throw new NotFoundException('맵을 찾을 수 없거나 권한이 없습니다.');
  }

  /** 소유한 활성 맵을 조회하고, 없으면 404 */
  private async requireOwnedMap(userId: string, mapId: string): Promise<MapRow> {
    const { rows } = await this.db.query<MapRow>(
      `SELECT * FROM public.maps WHERE id = $1 AND owner_id = $2 AND deleted_at IS NULL`,
      [mapId, userId],
    );
    if (!rows[0]) throw new NotFoundException('맵을 찾을 수 없거나 권한이 없습니다.');
    return rows[0];
  }
}
