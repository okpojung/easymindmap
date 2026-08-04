// EasyMindMap 백엔드 API 클라이언트 (클라우드 저장/열기).
//   기본 주소: VITE_API_URL 또는 http://localhost:3000
//   인증(Phase 3): VITE_SUPABASE_URL 이 설정된 배포에서는 로그인 세션의
//   JWT 를 Authorization 헤더로 첨부한다(만료 시 자동 갱신). 미설정
//   (개발 모드)이면 헤더 없이 호출 — 백엔드 AUTH_MODE=dev 가 처리.
import { authEnabled, getFreshAccessToken } from '@/stores/authStore';

const BASE = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/$/, '');

export class CloudError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'CloudError';
  }
}

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (authEnabled) {
    const token = await getFreshAccessToken();
    if (!token) throw new CloudError(401, '로그인이 필요합니다.');
    headers.Authorization = `Bearer ${token}`;
  }
  let res: Response;
  try {
    res = await fetch(`${BASE}/v1${path}`, {
      method,
      headers,
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
}

function qs(q: MapListQuery = {}): string {
  const p = new URLSearchParams();
  if (q.folder) p.set('folder', q.folder);
  if (q.sort) p.set('sort', q.sort);
  if (q.order) p.set('order', q.order);
  p.set('limit', String(q.limit ?? 200));
  return `?${p.toString()}`;
}

export const cloudApi = {
  health: () => req<{ status: string; db: string }>('GET', '/health'),
  listMaps: (q?: MapListQuery) =>
    req<{ maps: MapListItem[]; total: number }>('GET', `/maps${qs(q)}`),
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
  saveDocument: (
    mapId: string, doc: unknown, title?: string,
    keepVersion?: boolean, editSession?: string,
  ) =>
    req<{ mapId: string; updatedAt: string; version?: number; unchanged?: boolean }>(
      'PUT', `/maps/${mapId}/document`, { doc, title, keepVersion, editSession }),
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
      editLock?: 'acquired' | 'busy';
    }>(
      'GET',
      `/maps/${mapId}/document${
        editSession ? `?editSession=${encodeURIComponent(editSession)}` : ''}`,
    ),
  deleteMap: (mapId: string) => req<void>('DELETE', `/maps/${mapId}`),

  // ── 첨부 저장소 (B9) ───────────────────────────────────────
  // 업로드는 multipart 라 req() 대신 직접 fetch — Content-Type 은
  // 브라우저가 boundary 포함으로 자동 설정한다.
  uploadAttachment: async (file: File, mapId?: string) => {
    const headers: Record<string, string> = {};
    if (authEnabled) {
      const token = await getFreshAccessToken();
      if (!token) throw new CloudError(401, '로그인이 필요합니다.');
      headers.Authorization = `Bearer ${token}`;
    }
    const form = new FormData();
    form.append('file', file);
    let res: Response;
    try {
      res = await fetch(
        `${BASE}/v1/attachments${mapId ? `?mapId=${encodeURIComponent(mapId)}` : ''}`,
        { method: 'POST', headers, body: form },
      );
    } catch {
      throw new CloudError(0, '서버에 연결할 수 없습니다. 백엔드가 켜져 있는지 확인하세요.');
    }
    if (!res.ok) {
      let msg = `업로드 실패 (${res.status})`;
      try { msg = (await res.json()).message || msg; } catch { /* 본문 없음 */ }
      throw new CloudError(res.status, msg);
    }
    return res.json() as Promise<{
      id: string; name: string; mime: string; sizeBytes: number; url: string;
    }>;
  },
  deleteAttachment: (id: string) => req<void>('DELETE', `/attachments/${id}`),
  quota: () =>
    req<{ dbBytes: number; fileBytes: number; usedBytes: number; quotaBytes: number }>(
      'GET', '/attachments/quota'),
};

/** 서버 첨부의 절대 URL — 문서에는 이 형태로 저장된다 */
export function serverAttachmentUrl(id: string): string {
  return `${BASE}/v1/attachments/${id}`;
}

/** URL 이 이 서버의 첨부(B9)를 가리키면 그 id, 아니면 null */
export function serverAttachmentId(url: string | undefined): string | null {
  if (!url) return null;
  const prefix = `${BASE}/v1/attachments/`;
  if (!url.startsWith(prefix)) return null;
  const id = url.slice(prefix.length).split('?')[0];
  return id || null;
}

/**
 * 첨부를 fetch/<a href> 로 열 때 쓸 URL — 서버 첨부면 인증 토큰을
 * `?access_token=` 으로 붙인다 (<a href>/window.open 은 헤더를 못 싣고,
 * 내보내기 패키징의 fetch 도 같은 경로를 쓴다. AUTH_MODE=dev 는 무시).
 */
export async function attachmentFetchUrl(url: string): Promise<string> {
  if (!serverAttachmentId(url) || !authEnabled) return url;
  const token = await getFreshAccessToken();
  if (!token) return url;
  return `${url}${url.includes('?') ? '&' : '?'}access_token=${encodeURIComponent(token)}`;
}

export const cloudApiBase = BASE;
