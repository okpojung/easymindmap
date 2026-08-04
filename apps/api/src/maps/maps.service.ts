import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AttachmentsService } from '../attachments/attachments.service';
import { DatabaseService } from '../database/database.service';
import { FoldersService } from '../folders/folders.service';
import { NODE_COLUMNS, serializeNode, type NodeRow } from '../nodes/node.serializer';
import type { CreateMapDto } from './dto/create-map.dto';
import type { UpdateMapDto } from './dto/update-map.dto';

/** DB row → API 응답(camelCase) 매핑용 내부 타입 */
interface MapRow {
  id: string;
  title: string;
  folder_id: string | null;
  kind: string;
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
  constructor(
    private readonly db: DatabaseService,
    private readonly folders: FoldersService,
    private readonly attachments: AttachmentsService, // 저장 용량 쿼터 (B9)
  ) {}

  /**
   * POST /maps — 새 맵 생성.
   * 폴더(folderId)와 유형(kind)을 지정할 수 있고, **같은 폴더 안에 같은
   * 이름의 맵이 있으면 409** 로 거절한다 (2026-08-02 사용자 규칙 —
   * "같은 이름의 맵이 존재한다고 알리고 다른 이름/다른 폴더로 안내").
   */
  async create(userId: string, dto: CreateMapDto) {
    const title = dto.title ?? 'Untitled';
    const folderId = dto.folderId ?? null;
    if (folderId) await this.folders.requireOwned(userId, folderId);
    await this.assertTitleAvailable(userId, folderId, title);

    const { rows } = await this.db.query<MapRow>(
      `INSERT INTO public.maps
         (owner_id, title, workspace_id, default_layout_type, folder_id, kind)
       VALUES ($1, $2, $3, COALESCE($4, 'radial-bidirectional'), $5, COALESCE($6, 'solo'))
       RETURNING *`,
      [
        userId, title, dto.workspaceId ?? null, dto.defaultLayoutType ?? null,
        folderId, dto.kind ?? null,
      ],
    );
    const m = rows[0];
    return {
      mapId: m.id,
      title: m.title,
      folderId: m.folder_id,
      kind: m.kind,
      currentVersion: m.current_version,
      createdAt: m.created_at,
    };
  }

  /**
   * 같은 폴더 안 제목 중복 검사 (대소문자·앞뒤 공백 무시).
   *
   * ⚠️ DB 유니크 인덱스를 쓰지 않는다 — 이미 운영 중인 DB 에 중복 제목이
   * 남아 있으면 인덱스 생성이 실패해 스키마 적용 전체가 멈추기 때문이다
   * (schema.sql 주석 참조). 그래서 여기서 막는다. 동시 요청 경합으로
   * 아주 드물게 뚫릴 수 있으나, 사용자 한 명이 같은 이름을 동시에 두 번
   * 만드는 상황이라 실사용 영향은 없다.
   */
  private async assertTitleAvailable(
    userId: string,
    folderId: string | null,
    title: string,
    exceptMapId?: string,
  ): Promise<void> {
    const { rows } = await this.db.query<{ id: string }>(
      `SELECT id FROM public.maps
        WHERE owner_id = $1
          AND folder_id IS NOT DISTINCT FROM $2
          AND deleted_at IS NULL
          AND lower(btrim(title)) = lower(btrim($3))
          AND ($4::uuid IS NULL OR id <> $4)
        LIMIT 1`,
      [userId, folderId, title, exceptMapId ?? null],
    );
    if (rows[0]) {
      throw new ConflictException(
        `같은 폴더에 “${title}” 맵이 이미 있습니다. 다른 이름을 쓰거나 다른 폴더에 저장해 주세요.`,
      );
    }
  }

  /**
   * GET /maps — 내 맵 목록 (소유 기준, 소프트삭제 제외 기본).
   *  · folder: 'root' = 최상위만 · <uuid> = 그 폴더만 · 생략 = 전부
   *  · sort/order: 이름·수정일 오름/내림 (문서 브라우저 정렬 — 2026-08-02)
   */
  async list(
    userId: string,
    opts: {
      deleted?: boolean; page?: number; limit?: number;
      folder?: string;
      sort?: 'title' | 'createdAt' | 'updatedAt'
        | 'nodeCount' | 'docBytes' | 'attachCount' | 'attachBytes';
      order?: 'asc' | 'desc';
    },
  ) {
    const page = Math.max(1, opts.page ?? 1);
    const limit = Math.min(500, Math.max(1, opts.limit ?? 20));
    const offset = (page - 1) * limit;
    const wantDeleted = opts.deleted === true;

    const params: unknown[] = [userId];
    let where = `m.owner_id = $1 AND m.deleted_at IS ${wantDeleted ? 'NOT NULL' : 'NULL'}`;
    if (opts.folder === 'root') {
      where += ' AND m.folder_id IS NULL';
    } else if (opts.folder) {
      params.push(opts.folder);
      where += ` AND m.folder_id = $${params.length}`;
    }

    // 정렬 컬럼은 화이트리스트로만 — 문자열 결합에 사용자 입력을 넣지 않는다
    // (2026-08-05 문서함 목록 상세: 생성일·노드 수·문서 크기·첨부 정렬 추가)
    const SORT_SQL: Record<string, string> = {
      title: 'lower(btrim(m.title))',
      createdAt: 'm.created_at',
      updatedAt: 'm.updated_at',
      nodeCount: 'd.node_count',
      docBytes: 'octet_length(d.doc::text)',
      attachCount: 'd.attach_count',
      attachBytes: 'd.attach_bytes',
    };
    const sortCol = SORT_SQL[opts.sort ?? 'updatedAt'] ?? 'm.updated_at';
    const dir = opts.order === 'asc' ? 'ASC' : 'DESC';

    const [list, count] = await Promise.all([
      this.db.query<MapRow & {
        created_at: Date;
        node_count: number | null;
        attach_count: number | null;
        attach_bytes: string | null;
        doc_bytes: string | null;
      }>(
        `SELECT m.*, d.node_count, d.attach_count, d.attach_bytes,
                octet_length(d.doc::text) AS doc_bytes
           FROM public.maps m
           LEFT JOIN public.map_documents d ON d.map_id = m.id
          WHERE ${where}
          ORDER BY ${sortCol} ${dir} NULLS LAST, m.id
          LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset],
      ),
      this.db.query<{ total: string }>(
        `SELECT COUNT(*)::text AS total FROM public.maps m WHERE ${where}`,
        params,
      ),
    ]);

    return {
      maps: list.rows.map((m) => ({
        mapId: m.id,
        title: m.title,
        folderId: m.folder_id,
        kind: m.kind,
        deletedAt: m.deleted_at,
        createdAt: m.created_at,
        updatedAt: m.updated_at,
        // 스키마 미적용·저장 전 맵은 null — 프런트가 '—' 로 표시
        nodeCount: m.node_count,
        docBytes: m.doc_bytes === null ? null : Number(m.doc_bytes),
        attachCount: m.attach_count,
        attachBytes: m.attach_bytes === null ? null : Number(m.attach_bytes),
      })),
      total: Number(count.rows[0]?.total ?? 0),
    };
  }

  /** GET /maps/:id — 맵 전체(현재 단계: 노드 목록은 빈 배열, 다음 PR에서 채움) */
  async getOne(userId: string, mapId: string) {
    const m = await this.requireOwnedMap(userId, mapId);
    const nodes = await this.db.query<NodeRow>(
      `SELECT ${NODE_COLUMNS} FROM public.nodes WHERE map_id = $1
        ORDER BY depth, order_index`,
      [mapId],
    );
    return {
      mapId: m.id,
      title: m.title,
      currentVersion: m.current_version,
      nodes: nodes.rows.map(serializeNode),
      updatedAt: m.updated_at,
    };
  }

  /** PATCH /maps/:id — 메타 업데이트(변경 필드만). 이름 변경·폴더 이동 포함 */
  async update(userId: string, mapId: string, dto: UpdateMapDto) {
    const cur = await this.requireOwnedMap(userId, mapId);

    // 이름 변경·폴더 이동은 "같은 폴더에 같은 이름 금지"를 다시 확인한다
    const nextFolder = dto.folderId === undefined ? cur.folder_id : dto.folderId;
    const nextTitle = dto.title === undefined ? cur.title : dto.title;
    if (dto.folderId !== undefined && dto.folderId) {
      await this.folders.requireOwned(userId, dto.folderId);
    }
    if (nextTitle !== cur.title || nextFolder !== cur.folder_id) {
      await this.assertTitleAvailable(userId, nextFolder, nextTitle, mapId);
    }

    const sets: string[] = [];
    const params: unknown[] = [];
    let i = 1;
    if (dto.title !== undefined) { sets.push(`title = $${i++}`); params.push(dto.title); }
    if (dto.folderId !== undefined) { sets.push(`folder_id = $${i++}`); params.push(dto.folderId); }
    if (dto.kind !== undefined) { sets.push(`kind = $${i++}`); params.push(dto.kind); }
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
      folderId: m.folder_id,
      kind: m.kind,
      viewMode: m.view_mode,
      refreshIntervalSeconds: m.refresh_interval_seconds,
      defaultLayoutType: m.default_layout_type,
      updatedAt: m.updated_at,
    };
  }

  /** PUT /maps/:id/document — 전체 문서 스냅샷 저장(upsert). title 도 함께 갱신 가능 */
  async saveDocument(
    userId: string,
    mapId: string,
    doc: unknown,
    title?: string,
    keepVersion = false,
    editSession?: string,
  ) {
    const map = await this.requireOwnedMap(userId, mapId);

    // 단일 세션 편집 잠금 (2026-08-04) — 다른 살아 있는 세션이 이 맵을
    // 편집 중이면 저장을 거절한다 (읽기 전용으로 연 탭·죽지 않은 옛
    // 탭의 자동저장이 편집 중인 내용을 덮어쓰는 사고 방지).
    if (await this.isLockedByOther(mapId, editSession)) {
      throw new ConflictException(
        '다른 세션(브라우저)에서 편집 중인 맵입니다 — 그쪽에서 맵을 닫은 뒤 다시 시도하세요.',
      );
    }
    // 내 세션의 저장은 하트비트를 겸한다
    if (editSession) await this.tryAcquireEditLock(mapId, userId, editSession);

    // 저장 용량 쿼터 (B9) — DB(문서+버전) + 첨부 합산이 한도를 넘으면
    // 저장을 거부한다. 증가분 = 새 문서 크기 - 이 맵의 기존 문서 크기
    // (+ 히스토리 버전을 남기면 새 문서 크기만큼 한 번 더).
    const docJson = JSON.stringify(doc);
    const newBytes = Buffer.byteLength(docJson);
    const { rows: cur } = await this.db.query<{ b: string; same: boolean }>(
      `SELECT COALESCE(octet_length(doc::text), 0) AS b,
              (doc = $2::jsonb) AS same
         FROM public.map_documents WHERE map_id = $1`,
      [mapId, docJson],
    );
    const sameDoc = cur[0]?.same === true;
    const sameTitle = title === undefined || title === map.title;

    // 조회만 하고 닫은 맵 (2026-08-03 보고) — 내용이 마지막 버전과
    // 그대로면 히스토리 버전을 또 만들지 않는다. jsonb 등가 비교라 키
    // 순서 차이에 흔들리지 않는다. 버전이 하나도 없으면(레거시 맵)
    // 첫 버전은 남긴다.
    let skipVersion = false;
    if (keepVersion) {
      const { rows: lv } = await this.db.query<{ same: boolean; title: string }>(
        `SELECT (doc = $2::jsonb) AS same, title
           FROM public.map_document_versions
          WHERE map_id = $1 ORDER BY version DESC LIMIT 1`,
        [mapId, docJson],
      );
      skipVersion =
        lv.length > 0 && lv[0].same === true && lv[0].title === (title ?? map.title);
    }
    // 문서·제목·버전 모두 그대로 → 아무것도 쓰지 않는다 (updated_at 도
    // 바뀌지 않아 문서함 정렬이 조회만으로 흔들리지 않는다)
    if (sameDoc && sameTitle && (!keepVersion || skipVersion)) {
      return { mapId, updatedAt: map.updated_at, unchanged: true as const };
    }

    const delta =
      newBytes - Number(cur[0]?.b ?? 0) + (keepVersion && !skipVersion ? newBytes : 0);
    if (delta > 0) await this.attachments.assertQuota(userId, delta);

    // 문서 통계 (2026-08-05 문서함 목록 상세) — 저장 시점에 계산해
    // map_documents 에 함께 기록한다. 목록 조회가 doc 파싱 없이 가볍다.
    // (히스토리 버전(B8)도 같은 값을 쓴다 — 아래 keepVersion 분기)
    interface SnapNode {
      children?: SnapNode[];
      attachments?: { url?: string }[];
    }
    const snap = doc as {
      editor?: { layoutType?: string };
      map?: { root?: SnapNode; branches?: SnapNode[] };
    };
    const countNodes = (ns: SnapNode[]): number =>
      ns.reduce((a, n) => a + 1 + countNodes(n.children ?? []), 0);
    const nodeCount = 1 + countNodes(snap.map?.branches ?? []); // +1 = 중심 주제
    // 첨부 개수·용량 — 개수는 문서의 attachments 항목 전부, 용량 =
    // 내장(data URL, base64 → 원본 크기 환산) + 서버 저장소 합.
    // blob:(비로그인 세션 한정)은 개수에만 잡히고 용량은 0 이다.
    let attachCount = 0;
    let embeddedBytes = 0;
    const walkAttachments = (n: SnapNode) => {
      for (const a of n.attachments ?? []) {
        attachCount += 1;
        if (a.url?.startsWith('data:')) {
          const comma = a.url.indexOf(',');
          embeddedBytes += Math.floor(((a.url.length - comma - 1) * 3) / 4);
        }
      }
      for (const c of n.children ?? []) walkAttachments(c);
    };
    if (snap.map?.root) walkAttachments(snap.map.root);
    for (const b of snap.map?.branches ?? []) walkAttachments(b);
    const { rows: ab } = await this.db.query<{ b: string }>(
      `SELECT COALESCE(SUM(size_bytes), 0) AS b
         FROM public.attachments WHERE map_id = $1`,
      [mapId],
    );
    const attachBytes = embeddedBytes + Number(ab[0]?.b ?? 0);

    const { rows } = await this.db.query<{ updated_at: Date }>(
      `INSERT INTO public.map_documents
         (map_id, doc, node_count, attach_count, attach_bytes)
       VALUES ($1, $2::jsonb, $3, $4, $5)
       ON CONFLICT (map_id) DO UPDATE
         SET doc = EXCLUDED.doc, updated_at = NOW(),
             node_count = EXCLUDED.node_count,
             attach_count = EXCLUDED.attach_count,
             attach_bytes = EXCLUDED.attach_bytes
       RETURNING updated_at`,
      [mapId, docJson, nodeCount, attachCount, attachBytes],
    );
    // 제목은 **달라졌을 때만** 갱신하고, 그때는 중복 검사도 거친다.
    // 서버 맵을 열어 편집한 뒤 저장하면 프런트가 "열었던 그 이름"을 그대로
    // 보내므로(2026-08-02 규칙) 보통 이 분기는 지나간다.
    if (title !== undefined && title !== map.title) {
      await this.assertTitleAvailable(userId, map.folder_id, title, mapId);
      await this.db.query(
        `UPDATE public.maps SET title = $2, updated_at = NOW() WHERE id = $1`,
        [mapId, title],
      );
    } else {
      await this.db.query(
        `UPDATE public.maps SET updated_at = NOW() WHERE id = $1`,
        [mapId],
      );
    }

    // 히스토리 버전 (B8) — 명시적 저장·맵 닫기에서만. 자동저장은 남기지
    // 않는다(스냅샷이 커서 용량 급증). version 은 맵 안에서 1부터 증가.
    // 상세 정보(2026-08-03): 레이아웃·총 노드 수·서버 첨부 합계를 저장
    // 시점에 계산해 함께 기록한다 — 목록 조회가 doc 파싱 없이 가볍다.
    let version: number | undefined;
    if (keepVersion && !skipVersion) {
      const layoutType =
        typeof snap.editor?.layoutType === 'string'
          ? snap.editor.layoutType.slice(0, 50)
          : null;
      const { rows: vr } = await this.db.query<{ version: number }>(
        `INSERT INTO public.map_document_versions
           (map_id, version, title, doc, created_by,
            layout_type, node_count, attach_bytes, attach_count)
         SELECT $1,
                COALESCE(MAX(version), 0) + 1,
                $2, $3::jsonb, $4, $5, $6, $7, $8
           FROM public.map_document_versions WHERE map_id = $1
         RETURNING version`,
        [mapId, title ?? map.title, docJson, userId,
         layoutType, nodeCount, attachBytes, attachCount],
      );
      version = vr[0]?.version;
    }

    return { mapId, updatedAt: rows[0].updated_at, ...(version ? { version } : {}) };
  }

  /**
   * GET /maps/:id/versions — 저장 시점별 버전 목록 (B8).
   * doc 은 제외하고 메타만 — 목록이 가벼워야 패널이 빠르게 열린다.
   */
  async listVersions(userId: string, mapId: string) {
    await this.requireOwnedMap(userId, mapId);
    const { rows } = await this.db.query<{
      version: number; title: string; created_at: Date; size: string;
      layout_type: string | null; node_count: number | null;
      attach_bytes: string | null; attach_count: number | null;
    }>(
      `SELECT version, title, created_at,
              pg_column_size(doc)::text AS size,
              layout_type, node_count, attach_bytes, attach_count
         FROM public.map_document_versions
        WHERE map_id = $1
        ORDER BY version DESC`,
      [mapId],
    );
    return {
      mapId,
      versions: rows.map((r) => ({
        version: r.version,
        title: r.title,
        createdAt: r.created_at,
        bytes: Number(r.size),
        // 상세 정보 — 컬럼 도입(2026-08-03) 이전 버전은 null
        layoutType: r.layout_type,
        nodeCount: r.node_count,
        attachBytes: r.attach_bytes === null ? null : Number(r.attach_bytes),
        attachCount: r.attach_count,
      })),
      total: rows.length,
    };
  }

  /** GET /maps/:id/versions/:version — 특정 버전의 문서 스냅샷 (B8) */
  async getVersion(userId: string, mapId: string, version: number) {
    await this.requireOwnedMap(userId, mapId);
    const { rows } = await this.db.query<{
      title: string; doc: unknown; created_at: Date;
    }>(
      `SELECT title, doc, created_at
         FROM public.map_document_versions
        WHERE map_id = $1 AND version = $2`,
      [mapId, version],
    );
    if (!rows[0]) throw new NotFoundException('해당 버전을 찾을 수 없습니다.');
    return {
      mapId,
      version,
      title: rows[0].title,
      doc: rows[0].doc,
      createdAt: rows[0].created_at,
    };
  }

  /** GET /maps/:id/document — 저장된 문서 스냅샷 조회 */
  async getDocument(userId: string, mapId: string, editSession?: string) {
    const map = await this.requireOwnedMap(userId, mapId);
    const { rows } = await this.db.query<{ doc: unknown; updated_at: Date }>(
      `SELECT doc, updated_at FROM public.map_documents WHERE map_id = $1`,
      [mapId],
    );
    if (!rows[0]) throw new NotFoundException('저장된 문서 스냅샷이 없습니다.');

    // 단일 세션 편집 잠금 (2026-08-04) — editSession 을 준 호출은 "편집
    // 하려고 여는" 것이다. 잠금이 없거나 죽었거나(하트비트 TTL 초과)
    // 내 세션이면 획득(acquired), 다른 살아 있는 세션이면 busy — 프런트
    // 는 busy 를 읽기 전용(서버 연결 없이 열기)으로 처리한다.
    let editLock: 'acquired' | 'busy' | undefined;
    if (editSession) {
      editLock = (await this.tryAcquireEditLock(mapId, userId, editSession))
        ? 'acquired' : 'busy';
    }

    return {
      mapId: map.id,
      title: map.title,
      folderId: map.folder_id,
      kind: map.kind,
      doc: rows[0].doc,
      updatedAt: rows[0].updated_at,
      ...(editLock ? { editLock } : {}),
    };
  }

  /** 편집 잠금 하트비트 TTL — 이보다 오래 조용하면 죽은 세션으로 본다 */
  private static readonly EDIT_LOCK_TTL_MS = 60_000;

  /** 잠금 획득 시도 — 없거나 죽었거나 내 것이면 upsert 후 true */
  private async tryAcquireEditLock(
    mapId: string, userId: string, sessionKey: string,
  ): Promise<boolean> {
    const { rows } = await this.db.query<{ session_key: string; heartbeat_at: Date }>(
      `SELECT session_key, heartbeat_at FROM public.map_edit_locks WHERE map_id = $1`,
      [mapId],
    );
    const cur = rows[0];
    const stale = cur &&
      Date.now() - new Date(cur.heartbeat_at).getTime() > MapsService.EDIT_LOCK_TTL_MS;
    if (cur && !stale && cur.session_key !== sessionKey) return false;
    await this.db.query(
      `INSERT INTO public.map_edit_locks (map_id, session_key, user_id, heartbeat_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (map_id)
       DO UPDATE SET session_key = $2, user_id = $3, heartbeat_at = NOW()`,
      [mapId, sessionKey, userId],
    );
    return true;
  }

  /** 다른 살아 있는 세션이 잠금을 쥐고 있으면 true (저장 거절 판단용) */
  private async isLockedByOther(mapId: string, sessionKey?: string): Promise<boolean> {
    const { rows } = await this.db.query<{ session_key: string; heartbeat_at: Date }>(
      `SELECT session_key, heartbeat_at FROM public.map_edit_locks WHERE map_id = $1`,
      [mapId],
    );
    const cur = rows[0];
    if (!cur) return false;
    const stale =
      Date.now() - new Date(cur.heartbeat_at).getTime() > MapsService.EDIT_LOCK_TTL_MS;
    return !stale && cur.session_key !== (sessionKey ?? '');
  }

  /** POST /maps/:id/edit-heartbeat — 편집 탭이 25초마다 잠금을 연장 */
  async editHeartbeat(userId: string, mapId: string, sessionKey: string) {
    await this.requireOwnedMap(userId, mapId);
    const { rowCount } = await this.db.query(
      `UPDATE public.map_edit_locks SET heartbeat_at = NOW()
        WHERE map_id = $1 AND session_key = $2`,
      [mapId, sessionKey],
    );
    // held=false = 잠금을 잃었다 (TTL 만료 후 다른 세션이 가져감) —
    // 프런트가 알림을 띄울 수 있게 알려 준다
    return { held: (rowCount ?? 0) > 0 };
  }

  /** POST /maps/:id/edit-release — 맵 닫기·페이지 이탈 시 잠금 해제 */
  async editRelease(userId: string, mapId: string, sessionKey: string) {
    await this.requireOwnedMap(userId, mapId);
    await this.db.query(
      `DELETE FROM public.map_edit_locks WHERE map_id = $1 AND session_key = $2`,
      [mapId, sessionKey],
    );
    return { ok: true };
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
