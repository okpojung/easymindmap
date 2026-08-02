import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

/**
 * 문서함(폴더) — 사용자별 트리. 2026-08-02 사용자 요청.
 *
 * 규칙
 *  · parent_id NULL = 최상위("홈")
 *  · 같은 부모 안에서 **같은 이름의 폴더**는 만들 수 없다(대소문자 무시)
 *  · 삭제는 **비어 있을 때만** — 안에 폴더나 맵이 있으면 409.
 *    폴더 하나를 지워 그 안의 맵까지 통째로 잃는 사고를 막는다.
 *  · 이동(부모 변경)은 자기 자신/자손으로는 불가(순환 방지)
 */
interface FolderRow {
  id: string;
  parent_id: string | null;
  name: string;
  created_at: Date;
  updated_at: Date;
}

@Injectable()
export class FoldersService {
  constructor(private readonly db: DatabaseService) {}

  /** GET /folders — 내 폴더 전부(트리 구성은 클라이언트가 한다) */
  async list(userId: string) {
    const { rows } = await this.db.query<FolderRow & { map_count: string }>(
      `SELECT f.id, f.parent_id, f.name, f.created_at, f.updated_at,
              (SELECT COUNT(*) FROM public.maps m
                WHERE m.folder_id = f.id AND m.deleted_at IS NULL)::text AS map_count
         FROM public.map_folders f
        WHERE f.owner_id = $1
        ORDER BY f.name`,
      [userId],
    );
    return {
      folders: rows.map((f) => ({
        folderId: f.id,
        parentId: f.parent_id,
        name: f.name,
        mapCount: Number(f.map_count),
        createdAt: f.created_at,
        updatedAt: f.updated_at,
      })),
      total: rows.length,
    };
  }

  /** POST /folders */
  async create(userId: string, name: string, parentId?: string | null) {
    const clean = this.cleanName(name);
    if (parentId) await this.requireOwned(userId, parentId);
    await this.assertNameAvailable(userId, parentId ?? null, clean);
    const { rows } = await this.db.query<FolderRow>(
      `INSERT INTO public.map_folders (owner_id, parent_id, name)
       VALUES ($1, $2, $3) RETURNING *`,
      [userId, parentId ?? null, clean],
    );
    return this.toDto(rows[0]);
  }

  /** PATCH /folders/:id — 이름 변경 / 이동 */
  async update(
    userId: string,
    folderId: string,
    patch: { name?: string; parentId?: string | null },
  ) {
    const cur = await this.requireOwned(userId, folderId);
    const nextParent = patch.parentId === undefined ? cur.parent_id : patch.parentId;
    const nextName = patch.name === undefined ? cur.name : this.cleanName(patch.name);

    if (nextParent) {
      if (nextParent === folderId) {
        throw new BadRequestException('폴더를 자기 자신 안으로 옮길 수 없습니다.');
      }
      await this.requireOwned(userId, nextParent);
      if (await this.isDescendant(userId, folderId, nextParent)) {
        throw new BadRequestException('폴더를 자기 하위 폴더 안으로 옮길 수 없습니다.');
      }
    }
    if (nextName !== cur.name || nextParent !== cur.parent_id) {
      await this.assertNameAvailable(userId, nextParent, nextName, folderId);
    }

    const { rows } = await this.db.query<FolderRow>(
      `UPDATE public.map_folders
          SET name = $3, parent_id = $4, updated_at = NOW()
        WHERE id = $1 AND owner_id = $2
        RETURNING *`,
      [folderId, userId, nextName, nextParent],
    );
    return this.toDto(rows[0]);
  }

  /** DELETE /folders/:id — 비어 있을 때만 */
  async remove(userId: string, folderId: string): Promise<void> {
    await this.requireOwned(userId, folderId);
    const { rows } = await this.db.query<{ maps: string; folders: string }>(
      `SELECT (SELECT COUNT(*) FROM public.maps
                WHERE folder_id = $1 AND deleted_at IS NULL)::text AS maps,
              (SELECT COUNT(*) FROM public.map_folders WHERE parent_id = $1)::text AS folders`,
      [folderId],
    );
    const maps = Number(rows[0]?.maps ?? 0);
    const folders = Number(rows[0]?.folders ?? 0);
    if (maps || folders) {
      throw new ConflictException(
        `폴더가 비어 있지 않습니다 (맵 ${maps}개 · 하위 폴더 ${folders}개). 먼저 옮기거나 삭제해 주세요.`,
      );
    }
    await this.db.query(`DELETE FROM public.map_folders WHERE id = $1 AND owner_id = $2`, [
      folderId,
      userId,
    ]);
  }

  /** 맵 저장 경로 검증용 — 소유한 폴더인지 (maps 쪽에서 호출) */
  async requireOwned(userId: string, folderId: string): Promise<FolderRow> {
    const { rows } = await this.db.query<FolderRow>(
      `SELECT * FROM public.map_folders WHERE id = $1 AND owner_id = $2`,
      [folderId, userId],
    );
    if (!rows[0]) throw new NotFoundException('폴더를 찾을 수 없거나 권한이 없습니다.');
    return rows[0];
  }

  private cleanName(name: string): string {
    const s = (name ?? '').trim();
    if (!s) throw new BadRequestException('폴더 이름을 입력해 주세요.');
    // 경로 구분자는 나중에 내보내기(폴더 구조 ZIP)에서 문제를 일으킨다
    if (/[/\\]/.test(s)) throw new BadRequestException('폴더 이름에 / \\ 는 쓸 수 없습니다.');
    return s;
  }

  private async assertNameAvailable(
    userId: string,
    parentId: string | null,
    name: string,
    exceptId?: string,
  ): Promise<void> {
    const { rows } = await this.db.query<{ id: string }>(
      `SELECT id FROM public.map_folders
        WHERE owner_id = $1
          AND parent_id IS NOT DISTINCT FROM $2
          AND lower(name) = lower($3)
          AND ($4::uuid IS NULL OR id <> $4)
        LIMIT 1`,
      [userId, parentId, name, exceptId ?? null],
    );
    if (rows[0]) throw new ConflictException(`같은 위치에 “${name}” 폴더가 이미 있습니다.`);
  }

  /** candidate 가 folderId 의 자손인가 (순환 이동 방지) */
  private async isDescendant(
    userId: string,
    folderId: string,
    candidate: string,
  ): Promise<boolean> {
    const { rows } = await this.db.query<{ id: string }>(
      `WITH RECURSIVE sub AS (
         SELECT id FROM public.map_folders WHERE id = $1 AND owner_id = $3
         UNION ALL
         SELECT f.id FROM public.map_folders f JOIN sub ON f.parent_id = sub.id
       )
       SELECT id FROM sub WHERE id = $2`,
      [folderId, candidate, userId],
    );
    return rows.length > 0;
  }

  private toDto(f: FolderRow) {
    return {
      folderId: f.id,
      parentId: f.parent_id,
      name: f.name,
      createdAt: f.created_at,
      updatedAt: f.updated_at,
    };
  }
}
