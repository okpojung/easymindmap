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
  /** 가입 마무리 — 성명·휴대폰 저장 (emailToken 이 있으면 이메일 인증도 기록) */
  saveProfile: (p: {
    fullName: string; phoneCountry?: string; phoneNumber?: string; emailToken?: string;
  }) => req<AccountProfile>('PUT', '/account/profile', p),

  /** **내 로그인 기록** (2026-08-13) — 남의 것은 볼 수 없다(서버가 토큰 주인만 본다) */
  myLogins: () => req<LoginHistory>('GET', '/account/logins'),
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
    }>('GET', '/account/delete-preview'),
  /** 되돌릴 수 없다. confirm 은 deletePreview 가 준 문구와 정확히 같아야 한다 */
  deleteAccount: (confirm: string) =>
    req<{
      deleted: true; maps: number; attachments: number; usedBytes: number;
      /** false = 자료는 지워졌지만 **같은 이메일로 재가입이 막힌다** */
      loginAccountRemoved: boolean;
    }>('DELETE', '/account', { confirm }),

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
