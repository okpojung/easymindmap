// EasyMindMap 백엔드 API 클라이언트 (클라우드 저장/열기).
//   기본 주소: VITE_API_URL 또는 http://localhost:3000
//   인증: 현재 개발 모드(백엔드 AUTH_MODE=dev) — 헤더 없이 호출하면 서버가
//         DEV_USER_ID 로 처리한다. 실제 로그인(Supabase Auth)은 다음 단계.
const BASE = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/$/, '');

export class CloudError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'CloudError';
  }
}

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}/v1${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
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
    throw new CloudError(res.status, msg);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export interface MapListItem {
  mapId: string;
  title: string;
  deletedAt: string | null;
  updatedAt: string;
}

export const cloudApi = {
  health: () => req<{ status: string; db: string }>('GET', '/health'),
  listMaps: () => req<{ maps: MapListItem[]; total: number }>('GET', '/maps'),
  createMap: (title: string) =>
    req<{ mapId: string; title: string }>('POST', '/maps', { title }),
  saveDocument: (mapId: string, doc: unknown, title?: string) =>
    req<{ mapId: string; updatedAt: string }>('PUT', `/maps/${mapId}/document`, { doc, title }),
  getDocument: (mapId: string) =>
    req<{ mapId: string; title: string; doc: unknown; updatedAt: string }>(
      'GET',
      `/maps/${mapId}/document`,
    ),
  deleteMap: (mapId: string) => req<void>('DELETE', `/maps/${mapId}`),
};

export const cloudApiBase = BASE;
