import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { QueryResult, QueryResultRow } from 'pg';
import { DatabaseService } from '../database/database.service';
import { NODE_COLUMNS, nodeColumns, serializeNode, type NodeRow } from './node.serializer';
import { ROOT_PATH, childPath } from './node-path.util';
import type { CreateNodeDto } from './dto/create-node.dto';
import type { UpdateNodeDto } from './dto/update-node.dto';
import type { MoveNodeDto } from './dto/move-node.dto';
import type { AutosaveDto, PatchDto } from './dto/autosave.dto';

/** (text, params) => QueryResult — 풀 또는 트랜잭션 클라이언트 공통 */
type Querier = <T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
) => Promise<QueryResult<T>>;

@Injectable()
export class NodesService {
  constructor(private readonly db: DatabaseService) {}

  private get q(): Querier {
    return (text, params) => this.db.query(text, params ?? []);
  }

  // ── 단건 API ────────────────────────────────────────────────

  async create(userId: string, mapId: string, dto: CreateNodeDto) {
    await this.requireOwnedMap(this.q, userId, mapId);
    const row = await this.insertNode(this.q, mapId, {
      parentId: dto.parentId ?? null,
      text: dto.text,
      orderIndex: dto.orderIndex,
      layoutType: dto.layoutType,
      shapeType: dto.shapeType,
      style: dto.style,
    });
    return serializeNode(row);
  }

  async update(userId: string, nodeId: string, dto: UpdateNodeDto) {
    await this.requireOwnedNode(this.q, userId, nodeId);
    const row = await this.applyUpdate(this.q, nodeId, dto);
    return serializeNode(row);
  }

  async remove(userId: string, nodeId: string): Promise<void> {
    await this.requireOwnedNode(this.q, userId, nodeId);
    // ON DELETE CASCADE 로 하위 subtree 까지 함께 삭제
    await this.q('DELETE FROM public.nodes WHERE id = $1', [nodeId]);
  }

  async move(userId: string, nodeId: string, dto: MoveNodeDto) {
    await this.requireOwnedNode(this.q, userId, nodeId);
    const parent = await this.requireOwnedNode(this.q, userId, dto.newParentId);
    const node = await this.getNodeRow(this.q, nodeId);
    if (parent.map_id !== node.map_id) {
      throw new BadRequestException('다른 맵의 노드로는 이동할 수 없습니다.');
    }
    await this.moveSubtree(this.q, nodeId, dto.newParentId, dto.orderIndex);
    return serializeNode(await this.getNodeRow(this.q, nodeId));
  }

  async setLayout(userId: string, nodeId: string, layoutType: string) {
    await this.requireOwnedNode(this.q, userId, nodeId);
    const { rows } = await this.q<NodeRow>(
      `UPDATE public.nodes SET layout_type = $2, updated_at = NOW()
        WHERE id = $1 RETURNING ${NODE_COLUMNS}`,
      [nodeId, layoutType],
    );
    return serializeNode(rows[0]);
  }

  // ── autosave (배치 patch, 원자적) ───────────────────────────

  async autosave(userId: string, mapId: string, dto: AutosaveDto) {
    return this.db.transaction(async (client) => {
      const q: Querier = (text, params) => client.query(text, params ?? []);

      // 맵 잠금 + 현재 버전 확인 (동시 autosave 직렬화)
      const map = await q<{ current_version: number }>(
        `SELECT m.current_version FROM public.maps m
          WHERE m.id = $1 AND m.owner_id = $2 AND m.deleted_at IS NULL
          FOR UPDATE`,
        [mapId, userId],
      );
      if (!map.rows[0]) throw new NotFoundException('맵을 찾을 수 없거나 권한이 없습니다.');
      const currentVersion = map.rows[0].current_version;

      // 멱등성: 동일 patchId 재수신이면 중복
      const dup = await q(`SELECT 1 FROM public.map_revisions WHERE patch_id = $1`, [dto.patchId]);
      if (dup.rowCount) {
        throw new ConflictException({ error: 'DUPLICATE_PATCH', patchId: dto.patchId });
      }

      // 버전 충돌: 클라이언트가 인지한 버전이 서버와 다르면 거부
      if (dto.baseVersion !== currentVersion) {
        throw new ConflictException({ error: 'VERSION_CONFLICT', currentVersion });
      }

      for (const patch of dto.patches) {
        await this.applyPatch(q, mapId, patch);
      }

      const newVersion = currentVersion + 1;
      await q(`UPDATE public.maps SET current_version = $2, updated_at = NOW() WHERE id = $1`, [
        mapId,
        newVersion,
      ]);
      await q(
        `INSERT INTO public.map_revisions (map_id, version, patch_json, client_id, patch_id, created_by)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [mapId, newVersion, JSON.stringify(dto.patches), dto.clientId, dto.patchId, userId],
      );

      return { newVersion, conflicts: [] as string[] };
    });
  }

  private async applyPatch(q: Querier, mapId: string, patch: PatchDto): Promise<void> {
    const data = (patch.data ?? {}) as Record<string, unknown>;
    switch (patch.op) {
      case 'add':
        await this.insertNode(q, mapId, {
          id: patch.nodeId,
          parentId: (data.parentId as string) ?? null,
          text: data.text as string | undefined,
          orderIndex: data.orderIndex as number | undefined,
          layoutType: data.layoutType as string | undefined,
          shapeType: data.shapeType as string | undefined,
          style: data.style as Record<string, unknown> | undefined,
        });
        return;
      case 'update':
        await this.applyUpdate(q, patch.nodeId, data as UpdateNodeDto);
        return;
      case 'delete':
        await q('DELETE FROM public.nodes WHERE id = $1 AND map_id = $2', [patch.nodeId, mapId]);
        return;
      case 'move':
        await this.moveSubtree(
          q,
          patch.nodeId,
          data.parentId as string,
          (data.orderIndex as number) ?? 0,
        );
        return;
    }
  }

  // ── 공통 헬퍼 ───────────────────────────────────────────────

  /** 노드 INSERT (path/depth 계산 포함). id 미지정 시 서버가 생성 */
  private async insertNode(
    q: Querier,
    mapId: string,
    input: {
      id?: string;
      parentId: string | null;
      text?: string;
      orderIndex?: number;
      layoutType?: string;
      shapeType?: string;
      style?: Record<string, unknown>;
    },
  ): Promise<NodeRow> {
    const id = input.id ?? cryptoRandomUuid();
    let path: string;
    let depth: number;

    if (!input.parentId) {
      // 루트 — 맵당 1개
      const existing = await q(
        `SELECT 1 FROM public.nodes WHERE map_id = $1 AND parent_id IS NULL LIMIT 1`,
        [mapId],
      );
      if (existing.rowCount) {
        throw new BadRequestException('이미 루트 노드가 존재합니다.');
      }
      path = ROOT_PATH;
      depth = 0;
    } else {
      const parent = await q<{ path: string; depth: number; map_id: string }>(
        `SELECT path::text AS path, depth, map_id FROM public.nodes WHERE id = $1`,
        [input.parentId],
      );
      if (!parent.rows[0]) throw new BadRequestException('부모 노드를 찾을 수 없습니다.');
      if (parent.rows[0].map_id !== mapId) {
        throw new BadRequestException('부모 노드가 다른 맵에 속합니다.');
      }
      path = childPath(parent.rows[0].path, id);
      depth = parent.rows[0].depth + 1;
    }

    const orderIndex =
      input.orderIndex ?? (await this.nextOrderIndex(q, mapId, input.parentId));

    const { rows } = await q<NodeRow>(
      `INSERT INTO public.nodes
         (id, map_id, parent_id, text, depth, order_index, path,
          layout_type, shape_type, style_json)
       VALUES ($1,$2,$3,$4,$5,$6,$7::ltree,
          COALESCE($8,'radial-bidirectional'),
          COALESCE($9,'rounded-rectangle'),
          COALESCE($10,'{}')::jsonb)
       RETURNING ${NODE_COLUMNS}`,
      [
        id,
        mapId,
        input.parentId,
        input.text ?? '',
        depth,
        orderIndex,
        path,
        input.layoutType ?? null,
        input.shapeType ?? null,
        input.style ? JSON.stringify(input.style) : null,
      ],
    );
    return rows[0];
  }

  private async applyUpdate(q: Querier, nodeId: string, dto: UpdateNodeDto): Promise<NodeRow> {
    const sets: string[] = [];
    const params: unknown[] = [];
    let i = 1;
    if (dto.text !== undefined) { sets.push(`text = $${i++}`); params.push(dto.text); }
    if (dto.layoutType !== undefined) { sets.push(`layout_type = $${i++}`); params.push(dto.layoutType); }
    if (dto.collapsed !== undefined) { sets.push(`collapsed = $${i++}`); params.push(dto.collapsed); }
    if (dto.shapeType !== undefined) { sets.push(`shape_type = $${i++}`); params.push(dto.shapeType); }
    if (dto.style !== undefined) { sets.push(`style_json = $${i++}::jsonb`); params.push(JSON.stringify(dto.style)); }
    if (dto.manualPosition !== undefined) {
      sets.push(`manual_position = $${i++}::jsonb`);
      params.push(dto.manualPosition === null ? null : JSON.stringify(dto.manualPosition));
    }

    if (!sets.length) {
      // 변경 필드가 없으면 현재 상태 그대로 반환
      return this.getNodeRow(q, nodeId);
    }
    sets.push('updated_at = NOW()');
    params.push(nodeId);
    const { rows } = await q<NodeRow>(
      `UPDATE public.nodes SET ${sets.join(', ')} WHERE id = $${i} RETURNING ${NODE_COLUMNS}`,
      params,
    );
    if (!rows[0]) throw new NotFoundException('노드를 찾을 수 없습니다.');
    return rows[0];
  }

  private async moveSubtree(
    q: Querier,
    nodeId: string,
    newParentId: string,
    orderIndex: number,
  ): Promise<void> {
    try {
      await q('SELECT public.move_node_subtree($1, $2, $3)', [nodeId, newParentId, orderIndex]);
    } catch (err) {
      const msg = (err as Error).message || '';
      if (/own descendant|not found/i.test(msg)) {
        throw new BadRequestException(`노드 이동 실패: ${msg}`);
      }
      throw err;
    }
  }

  private async nextOrderIndex(
    q: Querier,
    mapId: string,
    parentId: string | null,
  ): Promise<number> {
    const { rows } = await q<{ next: number }>(
      `SELECT COALESCE(MAX(order_index), 0) + 1 AS next FROM public.nodes
        WHERE map_id = $1 AND parent_id IS NOT DISTINCT FROM $2`,
      [mapId, parentId],
    );
    return Number(rows[0]?.next ?? 0);
  }

  private async getNodeRow(q: Querier, nodeId: string): Promise<NodeRow> {
    const { rows } = await q<NodeRow>(
      `SELECT ${NODE_COLUMNS} FROM public.nodes WHERE id = $1`,
      [nodeId],
    );
    if (!rows[0]) throw new NotFoundException('노드를 찾을 수 없습니다.');
    return rows[0];
  }

  private async requireOwnedMap(q: Querier, userId: string, mapId: string): Promise<void> {
    const { rows } = await q(
      `SELECT 1 FROM public.maps WHERE id = $1 AND owner_id = $2 AND deleted_at IS NULL`,
      [mapId, userId],
    );
    if (!rows[0]) throw new NotFoundException('맵을 찾을 수 없거나 권한이 없습니다.');
  }

  private async requireOwnedNode(q: Querier, userId: string, nodeId: string): Promise<NodeRow> {
    const { rows } = await q<NodeRow>(
      `SELECT ${nodeColumns('n')} FROM public.nodes n
         JOIN public.maps m ON m.id = n.map_id
        WHERE n.id = $1 AND m.owner_id = $2 AND m.deleted_at IS NULL`,
      [nodeId, userId],
    );
    if (!rows[0]) throw new NotFoundException('노드를 찾을 수 없거나 권한이 없습니다.');
    return rows[0];
  }
}

/** DB default(gen_random_uuid) 대신 앱에서 id 를 만들어 path 를 먼저 계산 */
function cryptoRandomUuid(): string {
  // Node 18+ 전역 crypto
  return (globalThis.crypto as Crypto).randomUUID();
}
