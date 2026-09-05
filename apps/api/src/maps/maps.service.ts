import {
  ConflictException, ForbiddenException, Injectable, Logger, NotFoundException,
} from '@nestjs/common';
import { AttachmentsService } from '../attachments/attachments.service';
import { VaultService } from '../vault/vault.service';
import { DatabaseService } from '../database/database.service';
import { columnReady, tableReady } from '../common/table-ready';
import { FoldersService } from '../folders/folders.service';
import { NODE_COLUMNS, serializeNode, type NodeRow } from '../nodes/node.serializer';
import type { CreateMapDto } from './dto/create-map.dto';
import type { UpdateMapDto } from './dto/update-map.dto';
import {
  canWrite, findAccessibleMap, hasMapMembersTable, type MapRole,
} from './map-access';
import {
  collectAttachmentRefs,
  findDocImages,
  isExtractedImageName,
  rewriteDocImages,
} from './doc-images';

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

/**
 * 협업맵인가 — **단일 세션 편집 잠금을 비켜 줄지**를 이것 하나로 정한다
 * (2026-08-16, B16 ①. 설계: docs/04-extensions/collaboration/27-sync-model.md §7).
 *
 * 판정을 한 자리에 모아 둔 이유: 잠금은 **저장·열기·하트비트·해제** 네
 * 군데에서 걸린다. 한 군데만 빠뜨려도 협업맵이 조용히 잠긴다 — 특히
 * 하트비트를 빠뜨리면 25초마다 프런트가 편집권을 잃었다고 판단해
 * **맵과의 연결을 끊는다.**
 *
 * **잠금 자체는 코어가 들고 있는다.** 유료 모듈이 코어의 잠금을 우회하게
 * 만들면, 모듈이 없는 서버에서 협업맵이 잠긴 채로 남는다.
 */
function isCollabMap(map: Pick<MapRow, 'kind'>): boolean {
  return map.kind === 'collab';
}

@Injectable()
export class MapsService {
  private readonly log = new Logger(MapsService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly folders: FoldersService,
    private readonly attachments: AttachmentsService, // 저장 용량 쿼터 (B9)
    private readonly vault: VaultService,             // 파일 미러 (셀프호스트)
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
   *  · q: **내용 검색** (2026-08-08) — 맵 제목뿐 아니라 맵 안(노드 텍스트·
   *    노트·태그·링크·첨부 파일명)까지 찾고, 내용에서 맞은 **건수**를
   *    matchCount 로 함께 준다. 매칭 대상은 저장할 때 DB 트리거가 만들어 둔
   *    map_documents.search_text (schema.sql 참조) — 조회 때 doc 을 파싱
   *    하지 않으므로 맵이 많아도 느려지지 않는다.
   */
  async list(
    userId: string,
    opts: {
      deleted?: boolean; page?: number; limit?: number;
      folder?: string;
      sort?: 'title' | 'createdAt' | 'updatedAt'
        | 'nodeCount' | 'docBytes' | 'attachCount' | 'attachBytes';
      order?: 'asc' | 'desc';
      q?: string;
    },
  ) {
    const page = Math.max(1, opts.page ?? 1);
    const limit = Math.min(500, Math.max(1, opts.limit ?? 20));
    const offset = (page - 1) * limit;
    const wantDeleted = opts.deleted === true;

    const params: unknown[] = [userId];
    let where = `m.owner_id = $1 AND m.deleted_at IS ${wantDeleted ? 'NOT NULL' : 'NULL'}`;

    // 검색어 — ILIKE 패턴 문자(%, _)와 이스케이프 문자는 그대로 찾도록
    // 막는다. 안 그러면 '_' 하나로 아무 한 글자나 걸린다.
    const raw = (opts.q ?? '').trim();
    const searching = raw.length > 0;
    let pLike = 0;
    /** 검색 중일 때 두 질의(목록·개수) 앞에 붙는 공통 CTE */
    let hitsCte = '';
    if (searching) {
      params.push(`%${raw.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
      pLike = params.length;
      // 내용 조건은 **MATERIALIZED CTE** 로 뺀다. 실측으로 정한 형태다
      // (맵 3,000개 · 색인 42MB · 3글자 검색):
      //  · `m.title ILIKE … OR d.search_text ILIKE …` (조인한 두 테이블에
      //    걸친 OR)                                   → 337ms
      //  · 하위 질의(IN)                              → 276ms
      //      OR 안의 하위 질의는 hashed SubPlan 이 되는데, 그 안에서
      //      플래너가 trigram 인덱스를 버리고 통째로 훑는다.
      //  · **MATERIALIZED CTE**                       → 1.8ms
      //      CTE 를 먼저 독립적으로 계산하므로 trigram 인덱스를 탄다.
      //
      // CTE 안의 소유자 조인도 중요하다. 없으면 **2글자 검색**(한국어에서
      // 매우 흔한데 trigram 이 못 도는 패턴)이 다른 사용자의 문서까지
      // 훑는다 — 느린 것도 문제지만 남의 데이터를 훑는 것 자체가 문제다.
      // 조인이 있으면 플래너가 둘 중 작은 쪽부터 돈다: 내 맵이 몇 개뿐이면
      // 내 문서만 보고(0.25ms), 내가 전부 가졌으면 전부 보지만 그건 어차피
      // 내 데이터다.
      hitsCte = `WITH hits AS MATERIALIZED (
           SELECT s.map_id FROM public.map_documents s
             JOIN public.maps m2 ON m2.id = s.map_id AND m2.owner_id = $1
            WHERE s.search_text ILIKE $${pLike} ESCAPE '\\'
         ) `;
      where += ` AND (m.title ILIKE $${pLike} ESCAPE '\\'`
        + ` OR m.id IN (SELECT map_id FROM hits))`;
    }

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
    // CTE 밖에서 다시 정렬할 때 쓸 같은 기준 (컬럼은 p.* 로 노출된다).
    // ★ CTE 안의 ORDER BY 는 "어느 행을 가져올지"만 정한다 — 바깥 SELECT
    //   에 ORDER BY 가 없으면 반환 순서는 보장되지 않는다.
    const SORT_SQL_OUT: Record<string, string> = {
      title: 'lower(btrim(p.title))',
      createdAt: 'p.created_at',
      updatedAt: 'p.updated_at',
      nodeCount: 'p.node_count',
      docBytes: 'p.doc_bytes',
      attachCount: 'p.attach_count',
      attachBytes: 'p.attach_bytes',
    };
    const sortCol = SORT_SQL[opts.sort ?? 'updatedAt'] ?? 'm.updated_at';
    const sortColOut = SORT_SQL_OUT[opts.sort ?? 'updatedAt'] ?? 'p.updated_at';
    const dir = opts.order === 'asc' ? 'ASC' : 'DESC';

    // 검색 결과 **건수** — "이 맵의 내용에서 몇 군데 맞았나" 하나만 준다.
    // 미리보기 문장을 실어 보내다가 바꿨다(2026-08-08 2차 사용자 결정):
    // 맵 하나에서 여러 노드·노트가 걸리면 무엇을 보여줄지가 끝없이
    // 복잡해진다. 이름 일치는 프런트가 **글자 하이라이트**로 보여 주고,
    // 내용 일치는 **`맵(12건)`** 처럼 건수만 말한다.
    // 1건 = 맞은 조각 하나(노드 텍스트/노트/태그/링크/첨부명) — search_text
    // 가 조각당 한 줄이라 줄 수가 곧 건수다.
    //
    // 서버 부담을 늘리지 않는 것이 조건이라 두 가지를 지킨다:
    //  ⑴ 먼저 페이지(LIMIT) 를 CTE 로 확정하고, **그 행에 대해서만** 센다.
    //     목록 SELECT 에 그냥 넣으면 정렬 전에 매칭된 전체 행에서 돈다.
    //  ⑵ search_text 는 CTE 안에서만 쓰고 밖으로 내보내지 않는다 —
    //     큰 맵의 평문(수십 KB)이 응답에 실려 나가지 않는다.
    // ★ search_text 는 **검색할 때만** 고른다 — 늘 참조하면 스키마를
    //   아직 적용하지 않은 서버에서 문서함 목록이 통째로 죽는다
    //   (검색만 안 되는 게 아니라 목록 자체가 503).
    const matchCountSql = searching
      ? `, (SELECT count(*)
             FROM unnest(string_to_array(p.search_text, E'\\n')) AS ln
            WHERE ln ILIKE $${pLike} ESCAPE '\\')::int AS match_count`
      : '';

    // 마지막 저장 자리(플랫폼·브라우저·IP) — 문서함 상세 카드에 쓴다
    // (2026-08-09). LATERAL 로 **페이지에 실린 맵만** 최신 버전 1행을
    // 집어 온다 — (map_id, version DESC) 인덱스를 그대로 타서 가볍다.
    // 델타 SQL 미적용 서버에서는 컬럼이 없으므로 통째로 뺀다.
    const withClient = await this.hasVersionClientCols();
    const lastJoin = withClient
      ? `LEFT JOIN LATERAL (
             SELECT client_platform, client_browser, client_ip, created_at AS saved_at
               FROM public.map_document_versions vv
              WHERE vv.map_id = p.id
              ORDER BY vv.version DESC LIMIT 1
           ) lv ON TRUE`
      : '';
    const lastCols = withClient
      ? ', lv.client_platform, lv.client_browser, lv.client_ip, lv.saved_at'
      : '';

    // **지금 퍼블리싱 중인 링크** (2026-09-05) — 문서함에서 "무엇을 퍼블리싱해 뒀는지"
    // 를 볼 수 있어야 한다. 링크는 만들고 나면 대화상자를 닫는 순간 사라져
    // 다시 찾을 방법이 없었고, 그래서 **잊고 퍼블리싱해 두는 일**이 생긴다.
    //
    // `lastJoin` 과 같은 LATERAL 방식이다 — 페이지에 실린 맵만 1행씩 집는다.
    // 표가 없는 서버(델타 미적용)에서는 통째로 뺀다. 퍼블리싱이 안 되는 것과
    // **문서함이 죽는 것**은 전혀 다른 일이다.
    //
    // 상태(`visibility`)까지 함께 집는다 (2026-09-05) — 문서함이
    // **보관 중**과 **공개 중**을 다르게 그려야 하기 때문이다. 칸이 없는
    // 서버에서는 그 칸만 빼고, 화면은 전부 공개로 본다(지금까지와 같다).
    const withPublish = await tableReady(this.db, 'public.published_maps');
    const withVis = withPublish
      && await columnReady(this.db, 'public.published_maps', 'visibility');
    const pubJoin = withPublish
      ? `LEFT JOIN LATERAL (
             SELECT pm.publish_id${withVis ? ', pm.visibility' : ''}
               FROM public.published_maps pm
              WHERE pm.map_id = p.id AND pm.unpublished_at IS NULL
              ORDER BY pm.published_at DESC LIMIT 1
           ) pub ON TRUE`
      : '';
    const pubCols = withPublish
      ? `, pub.publish_id${withVis ? ', pub.visibility' : ''}` : '';

    const [list, count] = await Promise.all([
      this.db.query<MapRow & {
        created_at: Date;
        node_count: number | null;
        attach_count: number | null;
        attach_bytes: string | null;
        doc_bytes: string | null;
        match_count?: number;
        client_platform?: string | null;
        client_browser?: string | null;
        client_ip?: string | null;
        saved_at?: Date | null;
        publish_id?: string | null;
        visibility?: string | null;
      }>(
        `${hitsCte}${hitsCte ? ', p AS (' : 'WITH p AS ('}
           SELECT m.id, m.title, m.folder_id, m.kind, m.deleted_at,
                  m.created_at, m.updated_at,
                  d.node_count, d.attach_count, d.attach_bytes,
                  octet_length(d.doc::text) AS doc_bytes${searching ? ',\n                  d.search_text' : ''}
             FROM public.maps m
             LEFT JOIN public.map_documents d ON d.map_id = m.id
            WHERE ${where}
            ORDER BY ${sortCol} ${dir} NULLS LAST, m.id
            LIMIT $${params.length + 1} OFFSET $${params.length + 2}
         )
         SELECT p.id, p.title, p.folder_id, p.kind, p.deleted_at,
                p.created_at, p.updated_at, p.node_count, p.attach_count,
                p.attach_bytes, p.doc_bytes${matchCountSql}${lastCols}${pubCols}
           FROM p
           ${lastJoin}
           ${pubJoin}
          ORDER BY ${sortColOut} ${dir} NULLS LAST, p.id`,
        [...params, limit, offset],
      ),
      this.db.query<{ total: string }>(
        `${hitsCte}SELECT COUNT(*)::text AS total FROM public.maps m WHERE ${where}`,
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
        // 검색 중에만 채워진다 — **맵 내용에서 맞은 건수**(0 = 이름만 맞음)
        ...(searching ? { matchCount: m.match_count ?? 0 } : {}),
        // 마지막 저장 자리 (2026-08-09) — 그 이전 버전·미적용 서버는 null
        lastPlatform: m.client_platform ?? null,
        lastBrowser: m.client_browser ?? null,
        lastIp: m.client_ip ?? null,
        lastSavedAt: m.saved_at ?? null,
        // 지금 퍼블리싱 등록된 링크 — 없으면 null (표가 없는 서버도 null)
        publishId: m.publish_id ?? null,
        // 그 등록의 상태 — 칸이 없는 서버에서는 등록된 것이 곧 공개다
        publishVisibility: m.publish_id ? (m.visibility ?? 'public') : null,
      })),
      total: Number(count.rows[0]?.total ?? 0),
    };
  }

  /**
   * GET /maps/shared — **나에게 공유된 맵** (2026-08-18).
   *
   * 목록을 따로 두는 이유는 컨트롤러 주석에 있다(남의 폴더 배치를 내
   * 트리에 섞지 않는다).
   *
   * **참가자 표가 없는 서버에서는 빈 목록**이다 — 503 이 아니다. 아직
   * 공유를 켜지 않은 서버에서 문서함이 열리지 않으면 그게 더 큰 사고다.
   */
  async listShared(userId: string, opts: { q?: string; limit?: number } = {}) {
    const limit = Math.min(200, Math.max(1, opts.limit ?? 100));
    const raw = (opts.q ?? '').trim();
    const params: unknown[] = [userId, limit];
    let titleWhere = '';
    if (raw) {
      // 내용 검색은 아직 하지 않는다 — **이름만**. (내용 검색은 소유자
      // 목록의 CTE 를 그대로 태워야 해서 함께 손볼 일이다)
      params.push(`%${raw.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
      titleWhere = ` AND m.title ILIKE $3 ESCAPE '\\'`;
    }
    // **표가 있는지 먼저 묻는다.** 오류를 통째로 삼키면(옛 구현) 컬럼
    // 이름 하나 틀린 것까지 "공유가 없다"로 보여, **아무도 원인을 못
    // 찾는다** — 실제로 그렇게 한 번 틀렸다. 없는 것은 표 하나뿐이고,
    // 그것만 확인하면 나머지 오류는 그대로 드러나야 한다.
    //
    // 묻는 자리는 `map-access.ts` 와 **같은 한 곳**이다 (2026-09-05) —
    // 같은 표를 두 곳에서 따로 물으면 판정이 갈릴 수 있고, 여기는
    // 문서함을 열 때마다 불리므로 그쪽 기억을 함께 쓰는 편이 싸다.
    if (!(await hasMapMembersTable(this.db))) return { maps: [], total: 0 };

    let rows: Array<MapRow & {
      owner_email: string | null; role: string;
      node_count: number | null; attach_count: number | null;
      attach_bytes: string | null; doc_bytes: string | null;
    }> = [];
    {
      const r = await this.db.query<(typeof rows)[number]>(
        `SELECT m.id, m.title, m.folder_id, m.kind, m.deleted_at,
                m.created_at, m.updated_at,
                -- 이메일은 auth.users 에 있다 (public.users 에는 없다).
                -- 관리자 화면도 같은 자리에서 읽는다 (admin.service.ts).
                -- 검증에서 잡았다: u.email 로 썼다가 질의가 통째로 실패해
                -- 공유 목록이 늘 비어 있었다.
                mm.role,
                COALESCE(a.email, u.display_name) AS owner_email,
                d.node_count, d.attach_count, d.attach_bytes,
                octet_length(d.doc::text) AS doc_bytes
           FROM public.map_members mm
           JOIN public.maps m ON m.id = mm.map_id AND m.deleted_at IS NULL
           LEFT JOIN public.map_documents d ON d.map_id = m.id
           LEFT JOIN public.users u ON u.id = m.owner_id
           LEFT JOIN auth.users a ON a.id = m.owner_id
          WHERE mm.user_id = $1${titleWhere}
          ORDER BY m.updated_at DESC
          LIMIT $2`,
        params,
      );
      rows = r.rows;
    }
    return {
      maps: rows.map((m) => ({
        mapId: m.id,
        title: m.title,
        folderId: null,          // 내 폴더가 아니다 — 트리에 끼우지 않는다
        kind: m.kind,
        createdAt: m.created_at,
        updatedAt: m.updated_at,
        nodeCount: m.node_count,
        docBytes: m.doc_bytes === null ? null : Number(m.doc_bytes),
        attachCount: m.attach_count,
        attachBytes: m.attach_bytes === null ? null : Number(m.attach_bytes),
        /** 누가 나눠 줬는지 — 이게 없으면 "이게 왜 여기 있지"가 된다 */
        ownerEmail: m.owner_email,
        /** `editor` 는 고칠 수 있고 `viewer` 는 읽기만 */
        role: m.role,
        shared: true as const,
      })),
      total: rows.length,
    };
  }

  /** GET /maps/:id — 맵 전체(현재 단계: 노드 목록은 빈 배열, 다음 PR에서 채움) */
  async getOne(userId: string, mapId: string) {
    const m = await this.requireAccessibleMap(userId, mapId);
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

    // ★ **퍼블리싱 중인 맵은 협업맵으로 만들 수 없다** (2026-09-05 사용자 결정).
    //
    // 반대 방향(협업맵 → 퍼블리싱)은 퍼블리싱 쪽이 막는다(`publish.service.ts`).
    // 양쪽을 다 막아야 규칙이 닫힌다 — 한쪽만 막으면 "퍼블리싱해 두고 초대"
    // 라는 우회로가 남아, **아직 완성되지 않은 문서가 퍼블리싱된 채로 여럿이
    // 고치는** 상태가 만들어진다. 그게 이 규칙이 막으려던 바로 그것이다.
    //
    // 되돌릴 길은 열어 둔다 — **퍼블리싱 등록을 취소하면** 협업맵으로 바꿀
    // 수 있다. 그래서 안내가 "먼저 퍼블리싱을 취소해 주세요" 로 끝난다.
    //
    // ★ **보관(비공개) 중이어도 막는다** (2026-09-05). 여기가 지키는 것은
    //   "지금 남이 보고 있는가" 가 아니라 **"이것은 상품인가"** 다 —
    //   퍼블리싱 문서함에 든 맵은 저자 한 사람의 것이라야 수익 배분
    //   문제가 아예 생기지 않는다(27a §5.0). 그래서 상태가 아니라
    //   **등록 여부**(`isRegistered`)를 본다.
    if (dto.kind === 'collab' && cur.kind !== 'collab'
        && await this.isRegistered(mapId)) {
      throw new ForbiddenException(
        '퍼블리싱 등록된 맵은 협업맵으로 만들 수 없습니다. 먼저 퍼블리싱을 취소해 주세요.',
      );
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
    allowEmpty = false,
    /**
     * 저장한 자리 (2026-08-09) — 히스토리 버전에만 기록한다.
     * ip 는 컨트롤러가 요청에서 뽑은 값이다(클라이언트 입력이 아니다).
     */
    client?: { platform?: string; browser?: string; ip?: string },
  ) {
    const map = await this.requireAccessibleMap(userId, mapId, 'write');

    // ★ **공개 중인 맵은 고칠 수 없다** (2026-09-05 사용자 결정).
    //
    //   공개된 맵은 **편집이 끝난 완성본**이다 — 내 홈페이지에 걸거나 콘텐츠로
    //   파는 물건이다. 보는 사람은 완성된 글로 읽는데 그 아래에서 계속
    //   달라지면, 같은 주소가 어제와 오늘 다른 글이 된다. 파는 물건이라면
    //   더 그렇다: 산 사람과 지금 보는 사람이 다른 것을 갖게 된다.
    //
    //   ★ **보관(비공개)이면 고칠 수 있다.** 잠그는 것은 "등록됐다" 가
    //     아니라 **"지금 남이 보고 있다"** 이기 때문이다. 고치는 순서가
    //     그래서 이렇게 된다 — **비공개로 돌린다 → 고친다 → 다시 공개.**
    //     주소는 그동안 그대로다(옛 규칙은 이 자리에서 주소를 죽였다).
    //
    //   자동저장까지 여기서 막힌다 — 화면은 공개 중인 맵을 **읽기 전용으로
    //   연다**(`getDocument` 의 `published`). 그래도 서버가 다시 막는 이유는,
    //   막을 거면 **문이 있는 모든 곳**을 막아야 하기 때문이다(옛 탭·다른
    //   기기·직접 호출).
    if (await this.isPublicallyVisible(mapId)) {
      throw new ForbiddenException(
        '공개 중인 맵은 편집할 수 없습니다. 고치려면 먼저 비공개(보관)로 바꿔 주세요.',
      );
    }

    // 단일 세션 편집 잠금 (2026-08-04) — 다른 살아 있는 세션이 이 맵을
    // 편집 중이면 저장을 거절한다 (읽기 전용으로 연 탭·죽지 않은 옛
    // 탭의 자동저장이 편집 중인 내용을 덮어쓰는 사고 방지).
    //
    // **협업맵은 비켜 준다** (2026-08-16, B16 ①) — 여러 세션이 동시에
    // 여는 것이 정상이다. 이 줄이 없으면 둘째 사람의 저장이 409 로
    // 막히고, 프런트는 그것을 "편집권 상실"로 읽어 **맵과의 연결을
    // 끊는다.** 협업이 첫날 막히는 자리가 여기다.
    if (!isCollabMap(map)) {
      if (await this.isLockedByOther(mapId, editSession)) {
        throw new ConflictException(
          '다른 세션(브라우저)에서 편집 중인 맵입니다 — 그쪽에서 맵을 닫은 뒤 다시 시도하세요.',
        );
      }
      // 내 세션의 저장은 하트비트를 겸한다
      if (editSession) await this.tryAcquireEditLock(mapId, userId, editSession);
    }

    // 사진을 저장소로 옮긴다 (B16 ②) — **쿼터를 재기 전에** 한다.
    // 옮기고 나면 문서가 그만큼 작아지므로, 순서를 바꾸면 같은 바이트를
    // 문서와 첨부에서 **두 번 센다**.
    doc = await this.extractDocImages(userId, mapId, doc);

    // 저장 용량 쿼터 (B9) — DB(문서+버전) + 첨부 합산이 한도를 넘으면
    // 저장을 거부한다. 증가분 = 새 문서 크기 - 이 맵의 기존 문서 크기
    // (+ 히스토리 버전을 남기면 새 문서 크기만큼 한 번 더).
    const docJson = JSON.stringify(doc);
    const newBytes = Buffer.byteLength(docJson);
    const { rows: cur } = await this.db.query<{
      b: string; same: boolean; branches: number | null;
    }>(
      `SELECT COALESCE(octet_length(doc::text), 0) AS b,
              (doc = $2::jsonb) AS same,
              jsonb_array_length(doc -> 'map' -> 'branches') AS branches
         FROM public.map_documents WHERE map_id = $1`,
      [mapId, docJson],
    );
    const sameDoc = cur[0]?.same === true;

    // ── 마지막 방어선: **빈 문서는 내용 있는 맵을 덮어쓸 수 없다** ─────
    // 가지가 하나도 없는 문서로 내용이 있던 맵을 덮어쓰는 저장은
    // 거부한다. 처음에는 자동저장(keepVersion=false)만 막았지만,
    // **명시 저장에도 같은 사고가 났다** (2026-08-05 세 번째 유실):
    // 서버 맵을 연 뒤 Ctrl+Z 를 몇 번 더 누르면 '열기 이전' 문서
    // (문서 없음 자리표시)가 현재 문서가 되는데, 그 상태로 ☁ 저장을
    // 누르면 사용자의 맵이 통째로 비워졌다.
    //
    // 그래서 이제 **자동저장·명시 저장 모두** 막고, 프런트가 확인
    // 대화상자에서 사용자의 뜻을 받아 allowEmpty=true 로 보낼 때만
    // 통과시킨다. 즉 "맵을 비우는 저장"은 언제나 사용자가 그렇게
    // 답한 경우에만 일어난다.
    const snapForGuard = doc as { map?: { branches?: unknown[] } };
    const newBranches = snapForGuard?.map?.branches?.length ?? 0;
    const oldBranches = cur[0]?.branches ?? 0;
    if (!allowEmpty && newBranches === 0 && oldBranches > 0) {
      this.log.warn(
        `빈 문서 저장 거부: 내용 있는 맵을 덮어쓰려 했다 ` +
        `(map=${mapId}, 기존 가지=${oldBranches}, keepVersion=${keepVersion})`,
      );
      return { mapId, updatedAt: map.updated_at, unchanged: true as const };
    }
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
      // **여기서도 정리한다** (B16 ② 슬라이스 4). 사진을 지운 저장은
      // 한 번뿐이고 그때는 유예기간(24시간) 안이라 못 지운다. 이 줄이
      // 없으면 그 뒤로는 문서가 그대로라 **정리할 기회가 영영 안 온다** —
      // 사용자는 지운 사진이 용량을 계속 먹는 것을 보게 된다.
      // 이 시점의 DB 는 이미 최종 상태라 그대로 세면 된다.
      await this.gcMapImages(userId, mapId);
      // 문서가 그대로여도 **폴더나 형제 맵의 이름이 바뀌었을 수** 있다 —
      // 그러면 이 맵의 파일 자리도 달라진다. 예약해 두고 판단은 미러가 한다.
      this.vault.scheduleMirror(userId, mapId);
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
      // 접속 정보 컬럼(2026-08-09)은 델타 SQL 을 적용한 서버에만 있다 —
      // 아직 안 적용된 서버에서 **저장 자체가 실패하면 안 되므로**
      // 컬럼이 있을 때만 함께 넣는다 (hasVersionClientCols 참고).
      const withClient = await this.hasVersionClientCols();
      const { rows: vr } = await this.db.query<{ version: number }>(
        `INSERT INTO public.map_document_versions
           (map_id, version, title, doc, created_by,
            layout_type, node_count, attach_bytes, attach_count${
              withClient ? ', client_platform, client_browser, client_ip' : ''})
         SELECT $1,
                COALESCE(MAX(version), 0) + 1,
                $2, $3::jsonb, $4, $5, $6, $7, $8${
                  withClient ? ', $9, $10, $11' : ''}
           FROM public.map_document_versions WHERE map_id = $1
         RETURNING version`,
        [mapId, title ?? map.title, docJson, userId,
         layoutType, nodeCount, attachBytes, attachCount,
         ...(withClient
           ? [client?.platform ?? null, client?.browser ?? null, client?.ip ?? null]
           : [])],
      );
      version = vr[0]?.version;
    }

    // 안 쓰는 사진 정리 (B16 ② 슬라이스 4) — **히스토리 버전을 넣은 뒤**에
    // 한다. 방금 만든 버전이 참조하는 사진을 지우면 그 버전이 깨진다.
    await this.gcMapImages(userId, mapId);

    // vault 미러 — **기다렸다** 쓴다(5초 디바운스). 자동저장마다 쓰면 손을
    // 멈출 때마다 디스크에 수 MB 를 쓰게 된다. 실패해도 저장은 이미 끝났다.
    this.vault.scheduleMirror(userId, mapId);

    return { mapId, updatedAt: rows[0].updated_at, ...(version ? { version } : {}) };
  }

  /**
   * 이 맵에서 **더는 쓰지 않는** 사진을 지운다 (2026-08-16, B16 ② 슬라이스 4).
   *
   * **사용자 파일을 지우는 코드다.** 안전장치를 셋 둔다.
   *
   * ① **우리가 옮긴 사진만** 건드린다(`img-<해시>.<확장자>` 이름).
   *    사람이 올린 파일은 이 꼴이 될 수 없으므로, 이 코드가 잘못 돌아도
   *    **직접 올린 파일은 안전하다.**
   * ② 참조는 **현재 문서 + 이 맵의 모든 히스토리 버전**에서 모은다.
   *    현재 문서만 보고 지우면 **과거 버전이 깨진다.**
   * ③ **하루가 지난 것만** 지운다. 사진을 지우고 자동저장이 돈 직후
   *    되돌리기(Ctrl+Z)를 누르면 그 사진이 다시 필요해지는데, 곧바로
   *    지우면 **되살릴 수 없다.** 그동안 용량이 안 줄지만, 못 되돌리는
   *    것보다 낫다.
   */
  private async gcMapImages(userId: string, mapId: string): Promise<void> {
    const { rows: cand } = await this.db.query<{
      id: string; name: string; size_bytes: string;
    }>(
      `SELECT id, name, size_bytes FROM public.attachments
        WHERE map_id = $1 AND owner_id = $2
          AND created_at < NOW() - INTERVAL '1 day'`,
      [mapId, userId],
    );
    const ours = cand.filter((a) => isExtractedImageName(a.name));
    if (!ours.length) return;

    // 현재 문서 + 모든 히스토리 버전
    const { rows: docs } = await this.db.query<{ doc: unknown }>(
      `SELECT doc FROM public.map_documents WHERE map_id = $1
       UNION ALL
       SELECT doc FROM public.map_document_versions WHERE map_id = $1`,
      [mapId],
    );
    const used = new Set<string>();
    for (const d of docs) for (const id of collectAttachmentRefs(d.doc)) used.add(id);

    const dead = ours.filter((a) => !used.has(a.id));
    if (!dead.length) return;

    let freed = 0;
    for (const a of dead) {
      try {
        await this.attachments.remove(userId, a.id);
        freed += Number(a.size_bytes) || 0;
      } catch (err) {
        // 못 지워도 저장은 이미 끝났다 — 다음 저장에서 다시 시도한다
        this.log.warn(`사진 정리 실패(${a.name}): ${(err as Error).message}`);
      }
    }
    // **지운 것은 반드시 남긴다.** 사용자가 "사진이 없어졌다"고 할 때
    // 이 줄이 없으면 언제 무엇이 지워졌는지 알 길이 없다.
    this.log.log(
      `사진 정리 — ${dead.length}장 삭제 (${Math.round(freed / 1024)}KB) map=${mapId}`,
    );
  }

  /**
   * GET /maps/:id/versions — 저장 시점별 버전 목록 (B8).
   * doc 은 제외하고 메타만 — 목록이 가벼워야 패널이 빠르게 열린다.
   */
  async listVersions(userId: string, mapId: string) {
    await this.requireAccessibleMap(userId, mapId);
    // 접속 정보 컬럼은 델타 SQL 을 적용한 서버에만 있다 — 없으면 빼고
    // 조회한다. (검색 기능 때 겪은 사고와 같은 함정: 새 컬럼을 무조건
    // SELECT 하면 스키마 미적용 서버에서 목록이 통째로 503 이 된다)
    const withClient = await this.hasVersionClientCols();
    const { rows } = await this.db.query<{
      version: number; title: string; created_at: Date; size: string;
      layout_type: string | null; node_count: number | null;
      attach_bytes: string | null; attach_count: number | null;
      client_platform?: string | null; client_browser?: string | null;
      client_ip?: string | null;
    }>(
      `SELECT version, title, created_at,
              pg_column_size(doc)::text AS size,
              layout_type, node_count, attach_bytes, attach_count${
                withClient ? ', client_platform, client_browser, client_ip' : ''}
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
        // 저장한 자리 (2026-08-09) — 그 이전 버전·미적용 서버는 null
        platform: r.client_platform ?? null,
        browser: r.client_browser ?? null,
        ip: r.client_ip ?? null,
      })),
      total: rows.length,
    };
  }

  /**
   * map_document_versions 에 접속 정보 컬럼(2026-08-09)이 있는가.
   * 1분 캐시 — **양쪽으로** 다시 본다. 있다고 영구히 믿으면 컬럼이
   * 사라진 DB(롤백·복구본)에서 목록·저장이 통째로 503 이 된다.
   * 없다고 영구히 믿으면 델타 SQL 을 적용해도 재기동 전까지 안 붙는다.
   */
  private clientColsAt = 0;
  private clientColsCache: boolean | null = null;
  private async hasVersionClientCols(): Promise<boolean> {
    const now = Date.now();
    if (this.clientColsCache !== null && now - this.clientColsAt < 60_000) {
      return this.clientColsCache;
    }
    this.clientColsAt = now;
    try {
      const { rows } = await this.db.query<{ n: string }>(
        `SELECT COUNT(*)::text AS n FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'map_document_versions'
            AND column_name IN ('client_platform', 'client_browser', 'client_ip')`,
      );
      this.clientColsCache = Number(rows[0]?.n ?? 0) === 3;
    } catch {
      this.clientColsCache = false;
    }
    return this.clientColsCache;
  }

  /** GET /maps/:id/versions/:version — 특정 버전의 문서 스냅샷 (B8) */
  async getVersion(userId: string, mapId: string, version: number) {
    await this.requireAccessibleMap(userId, mapId);
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
    const map = await this.requireAccessibleMap(userId, mapId);
    const { rows } = await this.db.query<{ doc: unknown; updated_at: Date }>(
      `SELECT doc, updated_at FROM public.map_documents WHERE map_id = $1`,
      [mapId],
    );
    if (!rows[0]) throw new NotFoundException('저장된 문서 스냅샷이 없습니다.');

    // 단일 세션 편집 잠금 (2026-08-04) — editSession 을 준 호출은 "편집
    // 하려고 여는" 것이다. 잠금이 없거나 죽었거나(하트비트 TTL 초과)
    // 내 세션이면 획득(acquired), 다른 살아 있는 세션이면 busy — 프런트
    // 는 busy 를 읽기 전용(서버 연결 없이 열기)으로 처리한다.
    //
    // **협업맵은 잠그지 않는다** (2026-08-16, B16 ①). editLock 을 아예
    // 주지 않으므로 프런트는 읽기 전용으로 열지 않는다 — 'acquired' 라고
    // 거짓말하지 않기 위해서다(잠근 적이 없다).
    let editLock: 'acquired' | 'busy' | undefined;
    if (editSession && !isCollabMap(map)) {
      editLock = (await this.tryAcquireEditLock(mapId, userId, editSession))
        ? 'acquired' : 'busy';
    }

    return {
      mapId: map.id,
      title: map.title,
      folderId: map.folder_id,
      kind: map.kind,
      // **내가 이 맵에서 무엇을 할 수 있는가** (2026-08-19).
      //
      // 이게 없으면 화면은 열람자에게도 편집을 **허용하는 것처럼** 보인다.
      // 실사용에서 그대로 걸렸다 — 읽기만 권한으로 초대받은 사람이 맵을
      // 고치고 되돌리기까지 했고, **저장할 때에야** 403 을 만났다.
      // 그때는 이미 한참 작업한 뒤라 그 편집이 갈 곳이 없다.
      //
      // 서버는 처음부터 알고 있었다(`requireAccessibleMap` 이 판정한다).
      // 알면서 말하지 않은 것이 문제였다.
      role: map.access_role,
      // **퍼블리싱 중이면 읽기 전용으로 연다** (2026-09-05). 화면이 이것을
      // 모르면 사용자는 한참 고친 뒤 저장할 때에야 403 을 만난다 — 그때는
      // 이미 그 편집이 갈 곳이 없다(열람자 문제에서 똑같이 겪었다).
      published: await this.isPublicallyVisible(mapId),
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

  /**
   * 문서 안의 data URL 사진을 첨부 저장소로 옮기고 **참조만** 남긴다
   * (2026-08-16, B16 ②. 설계: content-permanence.md §7.1).
   *
   * **상대 경로**(`/v1/attachments/<id>`)를 넣는다 — 서버는 브라우저가
   * 어느 주소로 접속했는지 모르고, 도메인이 바뀌면 절대 URL 은 전부
   * 깨진다. 프런트의 `serverAttachmentId()` 가 둘 다 알아본다.
   *
   * **옮기다 실패하면 그 사진만 원래대로 둔다.** 저장 자체를 실패시키면
   * 사용자는 사진 한 장 때문에 편집분 전체를 잃는다. 다만 **쿼터 초과
   * (413)는 그대로 올린다** — 조용히 넘기면 한도를 넘겨 저장하게 된다.
   */
  private async extractDocImages(
    userId: string, mapId: string, doc: unknown,
  ): Promise<unknown> {
    const found = findDocImages(doc);
    if (!found.length) return doc;

    const urlBySrc = new Map<string, string>();
    let moved = 0;
    let reused = 0;
    for (const img of found) {
      // 같은 내용의 사진이 이 맵에 이미 있으면 그것을 쓴다 — 화면이
      // 메모리에 data URL 을 들고 있어 자동저장마다 다시 보내기 때문이다.
      const { rows } = await this.db.query<{ id: string }>(
        `SELECT id FROM public.attachments
          WHERE map_id = $1 AND owner_id = $2 AND name = $3 LIMIT 1`,
        [mapId, userId, img.name],
      );
      if (rows[0]) {
        urlBySrc.set(img.dataUrl, `/v1/attachments/${rows[0].id}`);
        reused += 1;
        continue;
      }
      try {
        const meta = await this.attachments.upload(userId, {
          originalname: Buffer.from(img.name, 'utf8').toString('latin1'),
          mimetype: img.mime,
          size: img.bytes.length,
          buffer: img.bytes,
        }, mapId);
        urlBySrc.set(img.dataUrl, `/v1/attachments/${meta.id}`);
        moved += 1;
      } catch (err) {
        // 쿼터 초과는 사용자가 알아야 한다 — 삼키면 한도를 넘겨 저장된다
        if ((err as { status?: number })?.status === 413) throw err;
        this.log.warn(`사진 이관 실패(원본 유지): ${(err as Error).message}`);
      }
    }
    if (!urlBySrc.size) return doc;
    this.log.log(`사진 이관 — 새로 ${moved}장 · 이미 있던 것 ${reused}장 (map=${mapId})`);
    return rewriteDocImages(doc, urlBySrc);
  }

  /** POST /maps/:id/edit-heartbeat — 편집 탭이 25초마다 잠금을 연장 */
  async editHeartbeat(userId: string, mapId: string, sessionKey: string) {
    const map = await this.requireAccessibleMap(userId, mapId, 'write');
    // **협업맵은 잃을 잠금이 없다** (2026-08-16, B16 ①). 표를 그냥 두면
    // 갱신된 행이 0이라 held=false 가 나가고, 프런트는 그것을 편집권
    // 상실로 읽어 **맵과의 연결을 끊는다**. 조용히 편집이 로컬 초안으로
    // 빠지는 사고가 25초마다 일어난다.
    if (isCollabMap(map)) return { held: true };
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
    const map = await this.requireAccessibleMap(userId, mapId, 'write');
    // 협업맵은 애초에 잠근 적이 없다 — 지울 것이 없다 (B16 ①)
    if (isCollabMap(map)) return { ok: true };
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

  /**
   * 소유한 활성 맵을 조회하고, 없으면 404.
   * **소유자만** — 이름 변경·삭제·공유처럼 맵 자체를 좌우하는 일에 쓴다.
   */
  /**
   * **퍼블리싱 문서함에 들어 있는가** (상태와 무관하다).
   *
   * 표가 없는 서버에서는 false — 표가 없으면 등록 자체가 안 되고, 여기서
   * 막으면 델타를 적용하지 않은 서버에서 협업 초대가 통째로 막힌다.
   *
   * 이 값이 막는 것은 **협업 전환**이다(`update`). 상품으로 등록해 둔
   * 맵은 저자 한 사람의 것이라야 한다 — 수익 배분 문제가 아예 생기지
   * 않게 하는 것이 규칙의 목적이다(27a §5.0). 보관 중이어도 마찬가지다.
   */
  private async isRegistered(mapId: string): Promise<boolean> {
    if (!(await tableReady(this.db, 'public.published_maps'))) return false;
    const { rows } = await this.db.query<{ ok: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM public.published_maps
          WHERE map_id = $1 AND unpublished_at IS NULL
       ) AS ok`,
      [mapId],
    );
    return rows[0]?.ok === true;
  }

  /**
   * **지금 남에게 열려 있는가** — 편집을 막는 것은 이쪽이다 (2026-09-05).
   *
   * ★ 등록만 해 둔 **보관(비공개) 상태에서는 고칠 수 있다.** 그것이
   *   상태를 셋으로 나눈 이유다 — 쇼핑몰에서 노출을 내리고 상품을
   *   손보는 것과 같다. 세상에 걸려 있는 동안에만 잠근다.
   *
   * `visibility` 칸이 없는 서버(델타 미적용)에서는 등록된 것이 곧 공개다 —
   * 지금까지의 동작 그대로다.
   */
  private async isPublicallyVisible(mapId: string): Promise<boolean> {
    if (!(await tableReady(this.db, 'public.published_maps'))) return false;
    const open = (await columnReady(this.db, 'public.published_maps', 'visibility'))
      ? `AND visibility = 'public'` : '';
    const { rows } = await this.db.query<{ ok: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM public.published_maps
          WHERE map_id = $1 AND unpublished_at IS NULL ${open}
       ) AS ok`,
      [mapId],
    );
    return rows[0]?.ok === true;
  }

  private async requireOwnedMap(userId: string, mapId: string): Promise<MapRow> {
    const { rows } = await this.db.query<MapRow>(
      `SELECT * FROM public.maps WHERE id = $1 AND owner_id = $2 AND deleted_at IS NULL`,
      [mapId, userId],
    );
    if (!rows[0]) throw new NotFoundException('맵을 찾을 수 없거나 권한이 없습니다.');
    return rows[0];
  }

  /**
   * **볼 수 있는** 맵을 조회한다 — 소유자 또는 참가자(`map_members`).
   *
   * `need: 'write'` 면 열람자(viewer)를 막는다. 없는 맵과 권한 없는 맵을
   * **구분하지 않는다** — 구분하면 남의 맵 id 가 존재하는지 알려 주는 셈이다.
   * 쓰기 거절만 다른 문장을 준다(들어와 있는 사람에게는 "왜 저장이 안
   * 되는지"를 말해 줘야 한다).
   */
  private async requireAccessibleMap(
    userId: string, mapId: string, need: 'read' | 'write' = 'read',
  ): Promise<MapRow & { access_role: MapRole }> {
    const map = await findAccessibleMap<MapRow>(this.db, mapId, userId);
    if (!map) throw new NotFoundException('맵을 찾을 수 없거나 권한이 없습니다.');
    if (need === 'write' && !canWrite(map.access_role)) {
      throw new ForbiddenException('이 맵에는 읽기 권한만 있습니다. 저장할 수 없습니다.');
    }
    return map;
  }
}
