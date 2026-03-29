/**
 * node.service.ts
 *
 * 노드 CRUD 및 계층 구조 조작 서비스
 *
 * 설계 기준:
 *   - docs/02-domain/node-hierarchy-storage-strategy.md
 *   - docs/03-editor-core/layout-coordinate-algorithm.md
 *
 * 주요 결정:
 *   - path: LTREE 타입, 'root.n_XXXXXXXX' 형식
 *   - order_index: FLOAT (중간 삽입 O(1))
 *   - depth: 앱단 계산 저장 (DB 트리거 없음)
 *   - 노드 이동: ltree subpath 치환 + depth 재계산 단일 트랜잭션
 */

import {
  Injectable,
  NotFoundException,
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';

// ----------------------------------------------------------------
// DTO 타입 정의
// ----------------------------------------------------------------
export interface CreateNodeDto {
  mapId: string;
  parentId: string | null;
  text?: string;
  orderIndex?: number;
  layoutType?: string;
}

export interface UpdateNodeDto {
  text?: string;
  layoutType?: string;
  collapsed?: boolean;
  shapeType?: string;
  styleJson?: Record<string, unknown>;
  manualPosition?: { x: number; y: number } | null;
}

export interface MoveNodeDto {
  newParentId: string;
  newOrderIndex: number;
}

// ----------------------------------------------------------------
// 내부 유틸
// ----------------------------------------------------------------

/**
 * UUID에서 ltree 레이블 생성
 * ltree 레이블 제약: [A-Za-z0-9_] 만 허용, 하이픈(-) 불가
 * → UUID 앞 8자리에서 하이픈 제거 후 'n_' 접두사 추가
 */
function uuidToLabel(uuid: string): string {
  const clean = uuid.replace(/-/g, '').slice(0, 8);
  return `n_${clean}`;
}

// ----------------------------------------------------------------
// NodeService
// ----------------------------------------------------------------
@Injectable()
export class NodeService {
  constructor(private readonly supabase: SupabaseService) {}

  // ──────────────────────────────────────────────
  // 노드 생성
  // ──────────────────────────────────────────────
  /**
   * 새 노드를 생성하고 DB에 저장합니다.
   *
   * - 루트 노드 (parentId = null): path = 'root', depth = 0
   * - 하위 노드: path = parentPath || uuidToLabel(newId), depth = parent.depth + 1
   * - order_index: parentId 하위 마지막 노드 order_index + 1.0
   *   (중간 삽입 시 호출부에서 orderIndex 직접 지정 가능)
   */
  async createNode(dto: CreateNodeDto) {
    const newId = crypto.randomUUID();
    const label = uuidToLabel(newId);

    let path: string;
    let depth: number;
    let orderIndex = dto.orderIndex;

    if (dto.parentId === null) {
      // 루트 노드
      path = 'root';
      depth = 0;
      orderIndex = orderIndex ?? 0.0;
    } else {
      // 부모 노드 조회
      const { data: parent, error: parentErr } = await this.supabase
        .from('nodes')
        .select('path, depth')
        .eq('id', dto.parentId)
        .single();

      if (parentErr || !parent) {
        throw new NotFoundException(`Parent node ${dto.parentId} not found`);
      }

      path = `${parent.path}.${label}`;
      depth = (parent.depth as number) + 1;

      // orderIndex 미지정 시: 형제 노드 마지막 + 1.0
      if (orderIndex === undefined) {
        const { data: siblings } = await this.supabase
          .from('nodes')
          .select('order_index')
          .eq('map_id', dto.mapId)
          .eq('parent_id', dto.parentId)
          .order('order_index', { ascending: false })
          .limit(1);

        const lastOrder = siblings?.[0]?.order_index ?? -1.0;
        orderIndex = (lastOrder as number) + 1.0;
      }
    }

    const { data, error } = await this.supabase
      .from('nodes')
      .insert({
        id: newId,
        map_id: dto.mapId,
        parent_id: dto.parentId,
        text: dto.text ?? '',
        path,
        depth,
        order_index: orderIndex,
        layout_type: dto.layoutType ?? 'radial-bidirectional',
      })
      .select()
      .single();

    if (error) throw new InternalServerErrorException(error.message);
    return data;
  }

  // ──────────────────────────────────────────────
  // 노드 수정
  // ──────────────────────────────────────────────
  async updateNode(nodeId: string, dto: UpdateNodeDto) {
    const updatePayload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (dto.text !== undefined)           updatePayload.text = dto.text;
    if (dto.layoutType !== undefined)     updatePayload.layout_type = dto.layoutType;
    if (dto.collapsed !== undefined)      updatePayload.collapsed = dto.collapsed;
    if (dto.shapeType !== undefined)      updatePayload.shape_type = dto.shapeType;
    if (dto.styleJson !== undefined)      updatePayload.style_json = dto.styleJson;
    if (dto.manualPosition !== undefined) updatePayload.manual_position = dto.manualPosition;

    const { data, error } = await this.supabase
      .from('nodes')
      .update(updatePayload)
      .eq('id', nodeId)
      .select()
      .single();

    if (error) throw new InternalServerErrorException(error.message);
    return data;
  }

  // ──────────────────────────────────────────────
  // 노드 삭제
  // ──────────────────────────────────────────────
  /**
   * 노드를 hard-delete 합니다.
   * ON DELETE CASCADE 에 의해 하위 노드도 모두 삭제됩니다.
   *
   * 클라이언트는 5~10초 Undo 창을 제공해야 합니다.
   * (docs/02-domain/node-hierarchy-storage-strategy.md 「삭제 정책」 참조)
   */
  async deleteNode(nodeId: string) {
    const { error } = await this.supabase
      .from('nodes')
      .delete()
      .eq('id', nodeId);

    if (error) throw new InternalServerErrorException(error.message);
  }

  // ──────────────────────────────────────────────
  // 노드 이동 (subtree 전체 path/depth 갱신)
  // ──────────────────────────────────────────────
  /**
   * 노드 및 모든 하위 노드를 새로운 부모 아래로 이동합니다.
   *
   * 수행 순서 (단일 트랜잭션 내):
   *   1. 이동 노드의 현재 path, 새 부모의 path 조회
   *   2. ltree subpath 치환으로 subtree 전체 path 일괄 갱신
   *   3. depth = nlevel(new_path) - 1 으로 일괄 재계산
   *   4. 이동 노드의 parent_id, order_index 갱신
   *
   * ※ Supabase JS Client는 복잡한 CTE UPDATE를 직접 지원하지 않으므로
   *    rpc() 를 통해 PostgreSQL 함수를 호출합니다.
   *    해당 함수는 database/functions/move_node_subtree.sql 에 정의됩니다.
   */
  async moveNodeSubtree(nodeId: string, dto: MoveNodeDto): Promise<void> {
    const { newParentId, newOrderIndex } = dto;

    // 순환 참조 방지: 새 부모가 이동 노드의 하위 노드인지 확인
    const { data: targetNode } = await this.supabase
      .from('nodes')
      .select('path, map_id')
      .eq('id', nodeId)
      .single();

    if (!targetNode) throw new NotFoundException(`Node ${nodeId} not found`);

    const { data: newParentNode } = await this.supabase
      .from('nodes')
      .select('path')
      .eq('id', newParentId)
      .single();

    if (!newParentNode) {
      throw new NotFoundException(`Target parent node ${newParentId} not found`);
    }

    // 순환 참조 검사: newParent.path가 이동 노드 path의 하위인 경우 차단
    // 예: 이동 노드 path = 'root.n_A', newParent.path = 'root.n_A.n_B' → 순환
    const targetPath: string = targetNode.path;
    const newParentPath: string = newParentNode.path;

    if (newParentPath.startsWith(targetPath + '.') || newParentPath === targetPath) {
      throw new ConflictException('Cannot move a node into its own descendant');
    }

    // PostgreSQL 함수 호출 (단일 트랜잭션 보장)
    // 함수 정의: apps/api/database/functions/move_node_subtree.sql
    const { error } = await this.supabase.rpc('move_node_subtree', {
      p_node_id:        nodeId,
      p_new_parent_id:  newParentId,
      p_new_order_index: newOrderIndex,
    });

    if (error) throw new InternalServerErrorException(error.message);
  }

  // ──────────────────────────────────────────────
  // 맵 전체 노드 조회
  // ──────────────────────────────────────────────
  /**
   * 맵의 모든 노드를 depth/order_index 순서로 조회합니다.
   * 클라이언트는 반환된 flat 배열을 parent_id 기준으로 트리로 조립합니다.
   * childIds는 DB에 저장하지 않고 클라이언트 런타임에 파생합니다.
   */
  async getMapNodes(mapId: string) {
    const { data, error } = await this.supabase
      .from('nodes')
      .select('*')
      .eq('map_id', mapId)
      .order('depth', { ascending: true })
      .order('order_index', { ascending: true });

    if (error) throw new InternalServerErrorException(error.message);
    return data ?? [];
  }

  // ──────────────────────────────────────────────
  // subtree 조회 (ltree 활용)
  // ──────────────────────────────────────────────
  /**
   * 특정 노드의 subtree 전체를 조회합니다 (자신 포함).
   * GIST 인덱스 덕분에 재귀 CTE 없이 효율적으로 조회됩니다.
   */
  async getSubtree(nodeId: string) {
    // ltree <@ 연산자를 직접 지원하는 Supabase JS 필터가 없으므로 rpc 사용
    const { data, error } = await this.supabase.rpc('get_node_subtree', {
      p_node_id: nodeId,
    });

    if (error) throw new InternalServerErrorException(error.message);
    return data ?? [];
  }
}
