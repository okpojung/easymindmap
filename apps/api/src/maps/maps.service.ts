import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
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
  private readonly log = new Logger(MapsService.name);

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
                p.attach_bytes, p.doc_bytes${matchCountSql}${lastCols}
           FROM p
           ${lastJoin}
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
    allowEmpty = false,
    /**
     * 저장한 자리 (2026-08-09) — 히스토리 버전에만 기록한다.
     * ip 는 컨트롤러가 요청에서 뽑은 값이다(클라이언트 입력이 아니다).
     */
    client?: { platform?: string; browser?: string; ip?: string },
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

    return { mapId, updatedAt: rows[0].updated_at, ...(version ? { version } : {}) };
  }

  /**
   * GET /maps/:id/versions — 저장 시점별 버전 목록 (B8).
   * doc 은 제외하고 메타만 — 목록이 가벼워야 패널이 빠르게 열린다.
   */
  async listVersions(userId: string, mapId: string) {
    await this.requireOwnedMap(userId, mapId);
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
