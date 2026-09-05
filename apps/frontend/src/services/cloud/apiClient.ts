// EasyMindMap 백엔드 API 클라이언트 (클라우드 저장/열기).
//   기본 주소: VITE_API_URL 또는 http://localhost:3000
//   인증(Phase 3): VITE_SUPABASE_URL 이 설정된 배포에서는 로그인 세션의
//   JWT 를 Authorization 헤더로 첨부한다(만료 시 자동 갱신). 미설정
//   (개발 모드)이면 헤더 없이 호출 — 백엔드 AUTH_MODE=dev 가 처리.
import { authEnabled, getFreshAccessToken } from '@/stores/authStore';
import { getClientInfo } from '@/utils/clientInfo';
import type { LoginHistory } from '@/components/auth/LoginHistoryList';

const BASE = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/$/, '');

export class CloudError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'CloudError';
  }
}

/**
 * @param anon **로그인 전에 부르는 요청**은 토큰을 붙이지 않는다
 *   (2026-08-09 가입 이메일 인증). 이 표시가 없으면 인증이 켜진 배포에서
 *   토큰이 없다는 이유로 401 을 내며, 가입하려는 사람은 영영 토큰이
 *   없으므로 가입 자체가 막힌다.
 */
async function req<T>(
  method: string, path: string, body?: unknown, anon = false,
): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (authEnabled && !anon) {
    const token = await getFreshAccessToken();
    if (!token) throw new CloudError(401, '로그인이 필요합니다.');
    headers.Authorization = `Bearer ${token}`;
  }
  let res: Response;
  try {
    res = await fetch(`${BASE}/v1${path}`, {
      method,
      headers,
      // 목록·문서 조회가 **캐시된 옛 응답**으로 돌아오지 않게 한다
      // (2026-08-05 보고: 저장·맵 닫기 뒤에도 문서함 목록이 그대로여서
      // 새로고침해야 반영됐다 — 로컬에서는 재현되지 않고 배포 환경의
      // 중간 캐시에서만 나타났다).
      cache: 'no-store',
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new CloudError(0, '서버에 연결할 수 없습니다. 백엔드가 켜져 있는지 확인하세요.');
  }
  if (!res.ok) {
    let msg = `요청 실패 (${res.status})`;
    try {
      const j = await res.json();
      msg = j.message || j.error || msg;
    } catch { /* 본문 없음 */ }
    if (res.status === 401 && authEnabled) msg = '세션이 만료되었습니다. 다시 로그인해 주세요.';
    throw new CloudError(res.status, msg);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

/**
 * **multipart 요청** — 파일을 보낼 때 쓴다.
 *
 * `req()` 를 못 쓰는 이유는 하나다: `Content-Type` 을 우리가 정하면 안
 * 된다. multipart 는 본문에 경계 문자열(boundary)이 들어가는데 그 값을
 * 아는 것은 브라우저뿐이라, 헤더를 손으로 붙이면 서버가 본문을 못 읽는다.
 * 그것 말고 인증·오류 문장 처리는 `req()` 와 같아야 하므로 여기 한 벌만 둔다.
 */
async function reqForm<T>(method: string, path: string, form: FormData): Promise<T> {
  const headers: Record<string, string> = {};
  if (authEnabled) {
    const token = await getFreshAccessToken();
    if (!token) throw new CloudError(401, '로그인이 필요합니다.');
    headers.Authorization = `Bearer ${token}`;
  }
  let res: Response;
  try {
    res = await fetch(`${BASE}/v1${path}`, { method, headers, body: form });
  } catch {
    throw new CloudError(0, '서버에 연결할 수 없습니다. 백엔드가 켜져 있는지 확인하세요.');
  }
  if (!res.ok) {
    let msg = `업로드 실패 (${res.status})`;
    try { msg = (await res.json()).message || msg; } catch { /* 본문 없음 */ }
    throw new CloudError(res.status, msg);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

/** 저장 시점별 문서 버전 (히스토리 — B8). 목록은 doc 을 담지 않는다. */
export interface MapVersionItem {
  version: number;
  title: string;
  createdAt: string;
  bytes: number;
  // 저장 시점 상세 (2026-08-03) — 컬럼 도입 전 버전은 null
  layoutType: string | null;
  nodeCount: number | null;
  /** 첨부 총 용량 = 내장(data URL) + 서버 저장소 합 */
  attachBytes: number | null;
  /** 첨부 개수 (내장·서버·세션 한정 blob 전부) */
  attachCount: number | null;
  // 저장한 자리 (2026-08-09) — 그 이전 버전은 null
  /** 'Windows 11' · 'Android 14' · 'iOS 17' … */
  platform?: string | null;
  /** 'Chrome 126' · 'Edge 126' · 'Safari 17' … */
  browser?: string | null;
  /** 저장 요청이 들어온 IP (서버가 기록) */
  ip?: string | null;
}

/** 청크 업로드 세션 상태 (§12.4) — 조각 크기·개수는 서버가 정한다 */
export interface UploadSession {
  uploadId: string;
  partSize: number;
  parts: number;
  /** 이미 도착한 조각 번호들 (이어받기용) */
  received: number[];
  expiresAt: string;
}

/** 맵 유형 — 단독맵 / 협업맵 (2026-08-02) */
export type MapKind = 'solo' | 'collab';

export interface MapListItem {
  mapId: string;
  title: string;
  /** null = 최상위("홈") */
  folderId: string | null;
  kind: MapKind;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  // 문서함 목록 상세 (2026-08-05) — 저장 시점 통계. 스키마 미적용·
  // 통계 도입 전에 저장된 맵은 null (프런트가 '—' 표시)
  nodeCount: number | null;
  /** 문서(jsonb) 크기 바이트 */
  docBytes: number | null;
  attachCount: number | null;
  /** 첨부 총 용량 = 내장(data URL) + 서버 저장소 합 */
  attachBytes: number | null;
  /**
   * **지금 퍼블리싱 중인 링크** (2026-09-05) — 없으면 null.
   * 문서함이 "무엇을 퍼블리싱해 뒀는지" 를 보여 주는 데 쓴다. 퍼블리싱 표가 없는
   * 서버(델타 미적용)에서도 null 이라 화면은 그냥 배지를 안 그린다.
   */
  publishId?: string | null;
  /**
   * 그 등록의 **상태** (2026-09-05) — 등록돼 있을 때만 온다.
   * `visibility` 칸이 없는 서버에서는 등록된 것이 전부 `'public'` 이다.
   */
  publishVisibility?: PublishVisibility | null;
  /**
   * 내용 검색(q) 결과에만 실린다 (2026-08-08).
   * **맵 안에서 맞은 건수** — 1건 = 조각 하나(노드 텍스트/노트/태그/
   * 링크/첨부 파일명). 0 이면 이름만 맞은 것이다.
   */
  matchCount?: number;
  /**
   * **나에게 공유된 맵**인가 (2026-08-18). 내 맵 목록에는 실리지 않는다.
   * 공유 목록(`listSharedMaps`)의 항목만 이 값을 들고 온다.
   */
  shared?: true;
  /** 공유받은 맵의 **주인** — "이게 왜 여기 있지"를 없앤다 */
  ownerEmail?: string | null;
  /** `editor` 는 고칠 수 있고 `viewer` 는 읽기만 */
  role?: 'editor' | 'viewer';
  // 마지막 저장 자리 (2026-08-09) — 히스토리 최신 버전에서 가져온다.
  // 접속 정보 도입 전에 저장된 맵은 null.
  /** 'Windows 11' · 'Android 14' · 'iOS 17' … */
  lastPlatform?: string | null;
  /** 'Chrome 126' · 'Edge 126' … */
  lastBrowser?: string | null;
  /** 그때 저장 요청이 들어온 IP */
  lastIp?: string | null;
  /** 그 버전이 만들어진 시각 */
  lastSavedAt?: string | null;
}

/** 회원 프로필 — 가입 시 받은 정보 (요금제는 서버가 정한다) */
export interface AccountProfile {
  fullName: string | null;
  /** '+82' 형태 */
  phoneCountry: string | null;
  /** 숫자만 */
  phoneNumber: string | null;
  plan: string;
  emailVerifiedAt: string | null;
  /** 휴대폰 인증은 아직 없다 — 항상 null */
  phoneVerifiedAt: string | null;
  /** 가입 정보를 다 채웠는가 (성명이 기준) */
  complete: boolean;
}

/** MCP 커넥터 토큰 한 개 (2026-09-04) — **원문은 여기 없다**(발급 응답에만 한 번) */
export interface McpToken {
  id: string;
  name: string;
  /** 화면에서 알아보는 앞자리 ('emm_a1b2c3d4') */
  prefix: string;
  createdAt: string;
  /** 마지막으로 쓰인 때 — 하루 한 번만 갱신된다(서버가 부하를 줄인다) */
  lastUsedAt: string | null;
  /** 값이 있으면 **폐기됨** */
  revokedAt: string | null;
}

export interface FolderItem {
  folderId: string;
  parentId: string | null;
  name: string;
  /** 그 폴더에 직접 들어 있는 맵 수 */
  mapCount: number;
  createdAt: string;
  updatedAt: string;
}

/** 문서 브라우저 목록 조회 옵션 (폴더·정렬) */
export interface MapListQuery {
  /** 'root' = 최상위만 · <folderId> = 그 폴더만 · 생략 = 전부 */
  folder?: string;
  sort?: 'title' | 'createdAt' | 'updatedAt'
    | 'nodeCount' | 'docBytes' | 'attachCount' | 'attachBytes';
  order?: 'asc' | 'desc';
  limit?: number;
  /**
   * 내용 검색어 (2026-08-08) — 맵 **제목 + 맵 안(노드 텍스트·노트·태그·
   * 링크·첨부 파일명)** 을 서버에서 찾는다. 결과에는 맵 안에서 맞은
   * 건수(matchCount)가 함께 온다.
   */
  q?: string;
}

function qs(q: MapListQuery = {}): string {
  const p = new URLSearchParams();
  if (q.folder) p.set('folder', q.folder);
  if (q.sort) p.set('sort', q.sort);
  if (q.order) p.set('order', q.order);
  if (q.q?.trim()) p.set('q', q.q.trim());
  p.set('limit', String(q.limit ?? 200));
  return `?${p.toString()}`;
}

/**
 * 퍼블리싱 문서함 안의 상태 (2026-09-05 사용자 결정).
 *
 *   `private` 보관    — 등록만 해 뒀다. 남에게는 404. **고칠 수 있다.**
 *   `public`  무료공개 — 링크를 가진 누구나 읽는다. **고칠 수 없다.**
 *   `paid`    유료공개 — 값을 매겨 판다 (27a, **아직 준비 중**).
 *
 * ★ 주소는 **등록**에 붙는다 — 상태를 오가도 그대로다.
 */
export type PublishVisibility = 'private' | 'public' | 'paid';

export const VISIBILITY_LABEL: Record<PublishVisibility, string> = {
  private: '비공개(보관)',
  public: '무료공개',
  paid: '유료공개',
};

/** 퍼블리싱 상태 (PUBL). available:false = 이 서버에 퍼블리싱 기능이 없다 */
export interface PublishStatus {
  available: boolean;
  publishId: string | null;
  publishedAt: string | null;
  /** 미리보기 실루엣이 올라와 있는가 (27a §2) */
  hasPreview?: boolean;
  /**
   * 이 맵을 **새로 퍼블리싱할 수 있는가** — 협업맵이면 false (2026-09-05 결정).
   * 규칙은 서버가 갖는다. 화면은 이 값을 보고 버튼 대신 이유를 낸다.
   */
  publishable?: boolean;
  /** 퍼블리싱할 수 없으면 그 이유 (서버가 준 문장) */
  blockedReason?: string;
  /** 지금 상태 — 등록돼 있을 때만 온다 */
  visibility?: PublishVisibility;
  /**
   * 이 서버가 상태 전환을 할 수 있는가(`visibility` 칸이 있는가).
   * false 면 화면은 전환 단추를 **아예 그리지 않는다** — 눌러 보고 나서야
   * 실패를 만나지 않게.
   */
  canSetVisibility?: boolean;
}

/** 퍼블리싱된 맵 — 비인증으로 받는다. doc 은 저장 스냅샷 그대로다 */
export interface PublishedMap {
  publishId: string;
  mapId: string;
  title: string;
  doc: unknown;
  publishedAt: string;
  updatedAt: string | null;
}

export const cloudApi = {
  health: () => req<{ status: string; db: string }>('GET', '/health'),
  listMaps: (q?: MapListQuery) =>
    req<{ maps: MapListItem[]; total: number }>('GET', `/maps${qs(q)}`),
  /**
   * **나에게 공유된 맵** (2026-08-18). 내 목록과 따로 부른다 — 공유받은
   * 맵의 폴더는 **소유자의 폴더**라 내 트리에 끼울 수 없다.
   * 공유가 없거나 서버가 아직 참가자 표를 안 만들었으면 빈 목록이다.
   */
  listSharedMaps: (q?: { q?: string; limit?: number }) =>
    req<{ maps: MapListItem[]; total: number }>('GET', `/maps/shared${qs(q)}`),
  // 새 맵 생성 — 폴더·유형 지정 가능. 같은 폴더에 같은 이름이 있으면 409
  createMap: (title: string, opts?: { folderId?: string | null; kind?: MapKind }) =>
    req<{ mapId: string; title: string; folderId: string | null; kind: MapKind }>(
      'POST', '/maps',
      { title, folderId: opts?.folderId ?? null, kind: opts?.kind ?? 'solo' }),
  // 이름 변경 · 폴더 이동 · 유형 변경 (중복 이름이면 409)
  updateMap: (
    mapId: string,
    patch: { title?: string; folderId?: string | null; kind?: MapKind },
  ) => req<{ mapId: string; title: string; folderId: string | null; kind: MapKind }>(
    'PATCH', `/maps/${mapId}`, patch),
  renameMap: (mapId: string, title: string) =>
    req<{ mapId: string; title: string }>('PATCH', `/maps/${mapId}`, { title }),

  // ── 문서함(폴더) ────────────────────────────────────────────
  listFolders: () => req<{ folders: FolderItem[]; total: number }>('GET', '/folders'),
  createFolder: (name: string, parentId?: string | null) =>
    req<FolderItem>('POST', '/folders', { name, parentId: parentId ?? null }),
  renameFolder: (folderId: string, name: string) =>
    req<FolderItem>('PATCH', `/folders/${folderId}`, { name }),
  moveFolder: (folderId: string, parentId: string | null) =>
    req<FolderItem>('PATCH', `/folders/${folderId}`, { parentId }),
  deleteFolder: (folderId: string) => req<void>('DELETE', `/folders/${folderId}`),
  // keepVersion: 이 저장을 히스토리 버전으로도 남긴다 (B8 — 명시적
  // 저장·맵 닫기에서만 true. 자동저장은 남기지 않는다)
  // unchanged: 내용·제목이 그대로라 서버가 아무것도 쓰지 않았다
  // (2026-08-03 — 조회만 하고 닫아도 히스토리가 생기던 문제)
  // editSession(탭 고유 키): 단일 세션 편집 잠금 (2026-08-04) — 다른
  // 살아 있는 세션이 편집 중이면 서버가 409 로 거절한다.
  // allowEmpty: 가지 0개 문서로 **내용 있는 맵을 덮어쓰는 것**을 사용자가
  // 확인했다는 표시 (2026-08-05). 서버는 이 값이 없으면 그런 저장을
  // 거부한다 — 자동저장이든 명시 저장이든.
  // client(플랫폼·브라우저)는 여기서 붙인다 — 저장 경로가 여러 곳이라
  // 호출부마다 넘기면 빠뜨리기 쉽다. 서버는 히스토리 버전에만 기록하고,
  // IP 는 요청에서 직접 읽는다(우리가 보내지 않는다 — 2026-08-09).
  saveDocument: async (
    mapId: string, doc: unknown, title?: string,
    keepVersion?: boolean, editSession?: string, allowEmpty?: boolean,
  ) =>
    req<{ mapId: string; updatedAt: string; version?: number; unchanged?: boolean }>(
      'PUT', `/maps/${mapId}/document`,
      { doc, title, keepVersion, editSession, allowEmpty, client: await getClientInfo() }),
  // 편집 잠금 — 하트비트(25초 주기, held=false 면 잠금을 잃음)·해제
  editHeartbeat: (mapId: string, sessionKey: string) =>
    req<{ held: boolean }>('POST', `/maps/${mapId}/edit-heartbeat`, { sessionKey }),
  editRelease: (mapId: string, sessionKey: string) =>
    req<{ ok: boolean }>('POST', `/maps/${mapId}/edit-release`, { sessionKey }),
  listVersions: (mapId: string) =>
    req<{ mapId: string; versions: MapVersionItem[]; total: number }>(
      'GET', `/maps/${mapId}/versions`),
  getVersion: (mapId: string, version: number) =>
    req<{ mapId: string; version: number; title: string; doc: unknown; createdAt: string }>(
      'GET', `/maps/${mapId}/versions/${version}`),
  // editSession 을 주면 편집 잠금을 시도한다 — editLock 'acquired' =
  // 이 탭이 편집권, 'busy' = 다른 세션이 편집 중(읽기 전용으로 열기)
  getDocument: (mapId: string, editSession?: string) =>
    req<{
      mapId: string; title: string; folderId: string | null;
      kind: MapKind; doc: unknown; updatedAt: string;
      /** 이 맵에서 내 역할 — 'viewer' 면 읽기 전용으로 연다 (2026-08-19) */
      role?: 'owner' | 'editor' | 'viewer';
      /**
       * **퍼블리싱 중인 맵인가** (2026-09-05). 퍼블리싱한 맵은 편집이 끝난 완성본이라
       * 고칠 수 없다 — 읽기 전용으로 연다. 서버도 저장을 막는다.
       */
      published?: boolean;
      editLock?: 'acquired' | 'busy';
    }>(
      'GET',
      `/maps/${mapId}/document${
        editSession ? `?editSession=${encodeURIComponent(editSession)}` : ''}`,
    ),
  deleteMap: (mapId: string) => req<void>('DELETE', `/maps/${mapId}`),

  // ── 회원가입 (2026-08-09) ──────────────────────────────────
  // 이메일 인증 두 개는 **로그인 전**에 부르므로 토큰이 없다.
  /** [이메일 인증] — 6자리 인증번호 발송. devCode 는 개발 모드 + 메일
   *  미설정일 때만 온다 (화면에 그대로 보여 주고 그 사실을 밝힌다). */
  sendEmailCode: (email: string) =>
    req<{ sent: boolean; expiresInMin: number; devCode?: string; message?: string }>(
      'POST', '/account/email-code', { email }, true),
  /** 인증번호 확인 → emailToken (가입 마무리에 쓴다, 유효 30분) */
  verifyEmailCode: (email: string, code: string) =>
    req<{ verified: boolean; emailToken: string }>(
      'POST', '/account/email-code/verify', { email, code }, true),
  getProfile: () => req<AccountProfile>('GET', '/account/profile'),
  // ── AI API 키 보관 (2026-09-04) — 계정에 암호화 저장, 본인에게만 복호화 ──
  /** 내 키 전부. `enabled:false` 면 `reason` — 'secret'(서버 미설정) · 'schema'(표 없음) */
  getAiKeys: () => req<{
    enabled: boolean;
    reason?: 'secret' | 'schema';
    keys: Record<string, { key: string; hint: string; updatedAt: string }>;
  }>('GET', '/account/ai-keys'),
  /** AI 설정(우선순위·모델·프롬프트 템플릿) — 비밀이 아니라 AI_KEY_SECRET 과 무관 */
  getAiSettings: () => req<{
    available: boolean;
    settings: { priority?: string[]; models?: Record<string, string>; systemPrompt?: string } | null;
    updatedAt: string | null;
  }>('GET', '/account/ai-settings'),
  saveAiSettings: (settings: { priority: string[]; models: Record<string, string>; systemPrompt: string }) =>
    req<{ saved: boolean }>('PUT', '/account/ai-settings', settings),
  /** 등록/교체(빈 문자열 = 삭제). 보관이 꺼져 있으면 503 + 이유 문장 */
  saveAiKey: (provider: string, key: string) =>
    req<{ provider: string; saved: boolean; hint?: string }>(
      'PUT', '/account/ai-keys', { provider, key }),
  /** 가입 마무리 — 성명·휴대폰 저장 (emailToken 이 있으면 이메일 인증도 기록) */
  saveProfile: (p: {
    fullName: string; phoneCountry?: string; phoneNumber?: string; emailToken?: string;
  }) => req<AccountProfile>('PUT', '/account/profile', p),

  /** **내 로그인 기록** (2026-08-13) — 남의 것은 볼 수 없다(서버가 토큰 주인만 본다) */
  myLogins: () => req<LoginHistory>('GET', '/account/logins'),

  // ── MCP 커넥터 토큰 (2026-09-04) ───────────────────────────
  // docs/04-extensions/ai/mcp-connector.md §3 — 발급·목록·폐기가 **한 화면**에
  // 있어야 한다는 요건이 이 셋으로 충족된다(McpTokensView).
  /**
   * 내 토큰 목록 + 막힐 이유 두 가지.
   *   `available:false` — 이 배포는 MCP 를 열지 않는다(`AUTH_MODE=dev`)
   *   `ready:false`     — 델타 SQL(`api_tokens` 표)이 아직 적용되지 않았다
   */
  mcpTokens: () =>
    req<{ available: boolean; ready: boolean; tokens: McpToken[] }>('GET', '/mcp-tokens'),
  /** 발급 — 응답의 `token` 이 **원문이고, 이 한 번뿐이다**(서버도 다시 못 본다) */
  issueMcpToken: (name: string) =>
    req<McpToken & { token: string }>('POST', '/mcp-tokens', { name }),
  /** 폐기 — 행을 지우지 않고 revokedAt 을 채운다(언제 껐는지 남긴다) */
  revokeMcpToken: (id: string) => req<McpToken>('DELETE', `/mcp-tokens/${id}`),
  /** 로그인 직후 한 번 — 서버가 **그때의 IP** 를 남긴다 (2026-08-14).
   *  IP 는 보내지 않는다: 서버가 요청에서 직접 본다(위조 방지). */
  recordLogin: async () =>
    req<{ recorded: boolean }>('POST', '/account/login-event', await getClientInfo()),

  // ── 비밀번호 재설정 (2026-08-13) ───────────────────────────
  // 로그인 전이라 **셋 다 토큰을 붙이지 않는다**(anon).
  /** ① 인증번호 발송. **계정이 없어도 같은 모양으로 답한다**(계정 열거 방지) */
  resetStart: (email: string) =>
    req<{ sent: boolean; expiresInMin: number; devCode?: string; message?: string }>(
      'POST', '/account/password-reset/start', { email }, true),
  /** ② 인증번호 확인 → 재설정표(30분) */
  resetVerify: (email: string, code: string) =>
    req<{ verified: boolean; resetToken: string }>(
      'POST', '/account/password-reset/verify', { email, code }, true),
  /** ③ 새 비밀번호로 교체 — 서버가 GoTrue 에서 바꾼다 */
  resetConfirm: (resetToken: string, password: string) =>
    req<{ changed: true; email: string }>(
      'POST', '/account/password-reset/confirm', { resetToken, password }, true),

  // ── 회원탈퇴 (2026-08-11) ──────────────────────────────────
  /** 무엇이 사라지는지 — 확인 화면에 숫자로 보여 준다 */
  deletePreview: () =>
    req<{
      maps: number; attachments: number;
      fileBytes: number; docBytes: number; usedBytes: number;
      /** 사용자가 입력해야 하는 확인 문구 — **서버가 정한다** */
      confirmPhrase: string;
      /** 내가 개설자인 활성 협업맵 — 비어 있지 않으면 탈퇴가 409 로 막힌다 (2026-09-04) */
      collabMaps: { mapId: string; title: string; memberCount: number | null; updatedAt: string }[];
      /** 그 맵들의 참여자 수(사람 수). 참가자 표가 없는 서버면 null */
      memberTotal: number | null;
      blocked: boolean;
    }>('GET', '/account/delete-preview'),
  /** 되돌릴 수 없다. confirm 은 deletePreview 가 준 문구와 정확히 같아야 한다 */
  deleteAccount: (confirm: string) =>
    req<{
      deleted: true; maps: number; attachments: number; usedBytes: number;
      /** false = 자료는 지워졌지만 **같은 이메일로 재가입이 막힌다** */
      loginAccountRemoved: boolean;
    }>('DELETE', '/account', { confirm }),

  // ── 첨부 저장소 (B9) ───────────────────────────────────────
  uploadAttachment: async (file: File, mapId?: string) => {
    const form = new FormData();
    form.append('file', file);
    return reqForm<{
      id: string; name: string; mime: string; sizeBytes: number; url: string;
    }>('POST', `/attachments${mapId ? `?mapId=${encodeURIComponent(mapId)}` : ''}`, form);
  },
  /**
   * **원격 사진을 서버가 대신 받아 온다** (2026-08-20, B16 ② 슬라이스 3).
   *
   * 브라우저 fetch 는 CORS 로 막힌다 — 남의 사이트가 우리에게 사진을
   * 내줄 이유가 없다. 서버는 CORS 를 받지 않으므로 이 경로로 돌린다.
   *
   * `store: false` 면 저장하지 않고 **바이트만**(data URL) 돌려준다 —
   * 리치 노트 HTML 속 `<img>` 처럼 **서버 주소를 넣으면 안 되는 자리**에
   * 쓴다 (내보내기의 사진 되돌리기가 노트 HTML 은 훑지 않는다).
   */
  attachmentFromUrl: (url: string, mapId?: string) =>
    req<{
      id: string; name: string; mime: string; sizeBytes: number;
      url: string; reused: boolean;
    }>('POST', '/attachments/from-url', { url, mapId }),

  /** 위와 같지만 **저장하지 않는다** — CORS 를 넘기 위한 대리 다운로드 */
  imageBytesFromUrl: (url: string) =>
    req<{ mime: string; sizeBytes: number; dataUrl: string }>(
      'POST', '/attachments/from-url', { url, store: false },
    ),

  // ── 대용량 첨부 — 청크 업로드 (§12) ─────────────────────────
  // 조각 크기·개수는 **서버가 정한다** — 프록시 본문 제한과 맞물리므로
  // 클라이언트가 고르지 않는다.
  startUpload: (input: { name: string; mime?: string; size: number; mapId?: string }) =>
    req<UploadSession>('POST', '/attachments/uploads', input),
  uploadStatus: (uploadId: string) =>
    req<UploadSession>('GET', `/attachments/uploads/${uploadId}`),
  completeUpload: (uploadId: string) =>
    req<{ id: string; name: string; mime: string; sizeBytes: number; url: string }>(
      'POST', `/attachments/uploads/${uploadId}/complete`),
  abortUpload: (uploadId: string) =>
    req<void>('DELETE', `/attachments/uploads/${uploadId}`),

  /**
   * 조각 하나 전송 — **멱등**이다. 같은 index 를 다시 보내면 서버가
   * 덮어쓰므로 재시도가 안전하다. 본문은 `Blob`(File.slice 결과)을 그대로
   * 넘긴다 — 파일을 메모리로 읽지 않는다.
   */
  putUploadPart: async (
    uploadId: string, index: number, part: Blob,
    opts: { signal?: AbortSignal; onBytes?: (loaded: number) => void } = {},
  ): Promise<{ received: number; parts: number }> => {
    const headers: Record<string, string> = { 'Content-Type': 'application/octet-stream' };
    if (authEnabled) {
      const token = await getFreshAccessToken();
      if (!token) throw new CloudError(401, '로그인이 필요합니다.');
      headers.Authorization = `Bearer ${token}`;
    }
    const { signal, onBytes } = opts;
    if (signal?.aborted) throw new DOMException('aborted', 'AbortError');

    // **fetch 가 아니라 XMLHttpRequest 를 쓴다** (2026-08-06 보고).
    //
    // fetch 에는 **업로드 진행률이 없다.** 그래서 진행률을 "완료된 조각
    // 수"로만 셀 수 있었고, 조각이 8MB 라 느린 회선에서는 몇십 초씩
    // 숫자가 멈춰 있었다 — 사용자에게는 **멈춘 것처럼** 보인다
    // ("16%에서 한참 있다가 다시 올라감"). XHR 의 `upload.onprogress` 는
    // 보낸 바이트를 계속 알려 주므로 막대가 끊기지 않는다.
    return await new Promise<{ received: number; parts: number }>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', `${BASE}/v1/attachments/uploads/${uploadId}/parts/${index}`);
      for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
      xhr.responseType = 'text';

      const onAbort = () => xhr.abort();
      signal?.addEventListener('abort', onAbort);
      const done = () => signal?.removeEventListener('abort', onAbort);

      if (onBytes) xhr.upload.onprogress = (e) => onBytes(e.loaded);
      xhr.onabort = () => { done(); reject(new DOMException('aborted', 'AbortError')); };
      xhr.onerror = () => {
        done();
        reject(new CloudError(0, '서버에 연결할 수 없습니다. 백엔드가 켜져 있는지 확인하세요.'));
      };
      xhr.onload = () => {
        done();
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            resolve(JSON.parse(xhr.responseText) as { received: number; parts: number });
          } catch { resolve({ received: 0, parts: 0 }); }
          return;
        }
        let msg = `조각 전송 실패 (${xhr.status})`;
        try { msg = JSON.parse(xhr.responseText).message || msg; } catch { /* 본문 없음 */ }
        reject(new CloudError(xhr.status, msg));
      };
      xhr.send(part);
    });
  },

  // ── 무료 퍼블리싱 (PUBL-01~04, 2026-09-04) ──────────────────
  // 설계: docs/04-extensions/publish/27-publish-share.md
  //
  // `available:false` 는 **오류가 아니라 값**이다 — 서버에 published_maps
  // 표가 없는 상태(델타 미적용). 화면은 이 값을 보고 버튼을 감춘다.
  /** 퍼블리싱 상태 — 맵을 볼 수 있는 사람이면 누구나 읽는다 */
  publishStatus: (mapId: string) =>
    req<PublishStatus>('GET', `/maps/${mapId}/publish-status`),
  /**
   * 퍼블리싱 — **이미 퍼블리싱 중이면 그 링크를 그대로 돌려준다**(멱등).
   * 부를 때마다 새 링크를 뽑으면 이미 남에게 보낸 링크가 조용히 죽는다.
   */
  publishMap: (mapId: string, visibility: PublishVisibility = 'public') =>
    req<PublishStatus>('POST', `/maps/${mapId}/publish`, { visibility }),
  /**
   * 상태 전환 (비공개 ↔ 무료공개) — **주소는 그대로다** (2026-09-05).
   * 고치는 순서가 이것이다: 비공개로 돌린다 → 고친다 → 다시 공개.
   */
  setPublishVisibility: (mapId: string, visibility: PublishVisibility) =>
    req<PublishStatus>('PATCH', `/maps/${mapId}/publish`, { visibility }),
  /**
   * 퍼블리싱 **등록 취소** — 그 주소는 즉시, 그리고 **영구히** 죽는다.
   * 잠시 내리는 것은 이것이 아니라 `setPublishVisibility('private')` 다.
   */
  unpublishMap: (mapId: string) => req<void>('DELETE', `/maps/${mapId}/publish`),
  /**
   * 미리보기 실루엣 올리기 — 그림은 **이 브라우저가** 만든다
   * (`export/silhouette.ts`). 서버에는 헤드리스 브라우저가 없다.
   */
  putPublishPreview: async (mapId: string, png: Blob) => {
    const form = new FormData();
    form.append('file', png, 'preview.png');
    return reqForm<PublishStatus>('PUT', `/maps/${mapId}/publish/preview`, form);
  },
  /**
   * 퍼블리싱된 맵 조회 — **로그인 없이** 부른다(`anon`).
   * 토큰을 붙이면 인증이 켜진 배포에서 비로그인 방문자가 401 을 만난다.
   */
  getPublished: (publishId: string) =>
    req<PublishedMap>('GET', `/published/${encodeURIComponent(publishId)}`,
      undefined, true),

  deleteAttachment: (id: string) => req<void>('DELETE', `/attachments/${id}`),
  quota: () =>
    req<{
      dbBytes: number; fileBytes: number; usedBytes: number; quotaBytes: number;
      /** 요금제 — 'free' | 'basic' | 'pro' | 'team' (용량은 서버가 정한다) */
      plan: 'free' | 'basic' | 'pro' | 'team';
    }>('GET', '/attachments/quota'),
};

/** 서버 첨부의 절대 URL — 문서에는 이 형태로 저장된다 */
export function serverAttachmentUrl(id: string): string {
  return `${BASE}/v1/attachments/${id}`;
}

/**
 * URL 이 이 서버의 첨부(B9)를 가리키면 그 id, 아니면 null.
 *
 * **절대 URL 과 상대 경로를 모두 받는다** (2026-08-16, B16 ②).
 * 서버가 문서를 고쳐 쓸 때는 **상대 경로**를 넣는다 — 서버는 브라우저가
 * 어느 주소로 접속했는지 모르고, 도메인이 바뀌면 절대 URL 은 전부
 * 깨지기 때문이다. 사람이 붙인 첨부는 지금까지처럼 절대 URL 이라
 * **둘 다 알아봐야 한다.**
 */
export function serverAttachmentId(url: string | undefined): string | null {
  if (!url) return null;
  const path = url.startsWith(`${BASE}/`) ? url.slice(BASE.length) : url;
  if (!path.startsWith('/v1/attachments/')) return null;
  const id = path.slice('/v1/attachments/'.length).split('?')[0].split('/')[0];
  return id || null;
}

/**
 * 퍼블리싱된 맵의 **미리보기 실루엣** 주소 — 로그인 없이 열린다 (27a §2).
 * 링크 카드(Open Graph)와 목록 썸네일이 이 주소를 그대로 쓴다.
 *
 * `v` 는 캐시를 깨기 위한 것이다 — 저자가 "다시 만들기" 를 누르면
 * **같은 주소의 내용이 바뀌므로**, 화면이 낡은 그림을 계속 보여 준다.
 */
export function publishedPreviewUrl(publishId: string, v?: string | number): string {
  const q = v ? `?v=${encodeURIComponent(String(v))}` : '';
  return `${BASE}/v1/published/${encodeURIComponent(publishId)}/preview.png${q}`;
}

/**
 * 퍼블리싱된 맵의 첨부 주소 — **로그인 없이** 열린다 (PUBL-03).
 * 퍼블리싱 화면은 이 주소로 사진을 그린다. 퍼블리싱을 중단하면 함께 닫힌다.
 */
export function publishedAttachmentUrl(publishId: string, attachmentId: string): string {
  return `${BASE}/v1/published/${encodeURIComponent(publishId)}/attachments/${attachmentId}`;
}

/**
 * 상대 경로면 API 주소를 붙인다 — `<img src>` 를 그대로 두면 **프런트
 * 주소로 풀려** 404 가 난다. 토큰을 기다리는 동안 보여 줄 임시 주소로도 쓴다.
 */
export function absolutizeAttachmentUrl(url: string): string {
  return url.startsWith('/') ? `${BASE}${url}` : url;
}

/**
 * 첨부를 fetch/<a href> 로 열 때 쓸 URL — 서버 첨부면 인증 토큰을
 * `?access_token=` 으로 붙인다 (<a href>/window.open 은 헤더를 못 싣고,
 * 내보내기 패키징의 fetch 도 같은 경로를 쓴다. AUTH_MODE=dev 는 무시).
 */
export async function attachmentFetchUrl(url: string): Promise<string> {
  if (!serverAttachmentId(url)) return url;
  const abs = absolutizeAttachmentUrl(url);
  if (!authEnabled) return abs;
  const token = await getFreshAccessToken();
  if (!token) return abs;
  return `${abs}${abs.includes('?') ? '&' : '?'}access_token=${encodeURIComponent(token)}`;
}

export const cloudApiBase = BASE;
