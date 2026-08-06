// 첨부 파일 → 문서에 저장할 URL.
//
// ① ≤2MB 파일은 data URL 로 읽어 **문서(맵 JSON) 안에 내장**한다 — 서버
//    저장·새로고침·재로그인 후에도 원본이 살아 있어, 내보내기 ZIP 패키징과
//    첨부 열기가 항상 동작한다. (2026-08-02 사용자 보고: 저장했다 다시 연
//    맵을 HTML 내보내기 하면 blob: 원본이 죽어 첨부 없는 html 만 만들어졌다.)
// ② 2MB 초과 파일은 **로그인 상태면 서버 첨부 저장소(B9)에 업로드**하고
//    문서에는 서버 URL 만 남긴다 — 쿼터(DB+첨부 합산) 안에서
//    어디서 다시 열어도 원본이 유지된다. 쿼터 초과·업로드 실패는
//    CloudError 로 던지므로 호출부가 안내를 띄운다.
// ③ 로그인하지 않은 상태(개발 모드 포함)의 2MB 초과 파일은 종전대로
//    blob URL — 이 세션에서만 유효하다 (내보내기가 안내 메시지로 알린다).
//
// 한도 2MB 는 내보내기 인라인 한도(INLINE_ATTACHMENT_LIMIT)와 같은 값.
//
// ⑤ **8MB 초과는 청크(분할) 업로드** (2026-08-06, attachment-storage.md §12):
//    단일 요청은 파일 전체가 서버 메모리에 올라가 상한이 낮다(200MB).
//    조각으로 나눠 보내면 서버 메모리가 파일 크기와 무관해져 **1GB** 까지
//    열린다. 사용자에게는 **경로를 나누지 않는다** — 같은 드롭·같은
//    메뉴로 올리고, 여기서 크기를 보고 고른다. 진행률·취소가 필요하면
//    `attachFileWithProgress` 를 쓴다(§12.7).
//
// ④ **맵당 내장 합계 상한 10MB** (2026-08-03 결정): 개당 2MB 이하라도
//    그 맵에 이미 내장된 첨부 합계 + 이 파일이 10MB 를 넘으면, 로그인
//    상태에서는 서버 저장소로 우회한다 — 작은 파일 다수로 문서(JSON)가
//    비대해져 자동저장·히스토리 버전이 무거워지는 것을 막는다.
//    비로그인 상태는 서버가 없으므로 내장을 유지한다(서버 왕복이 없어
//    문서 크기가 커져도 로컬 부담뿐).

import { INLINE_ATTACHMENT_LIMIT } from '@/export/mapMeta';
import { cloudApi, serverAttachmentUrl } from '@/services/cloud/apiClient';
import { uploadInChunks } from '@/services/cloud/chunkUpload';
import { authEnabled, useAuthStore } from '@/stores/authStore';
import { useCloudStore } from '@/stores/cloudStore';
import { useDocumentStore } from '@/stores/documentStore';
import { useUploadStore } from '@/stores/uploadStore';

/** 맵당 내장(data URL) 첨부 합계 상한 — 원본 바이트 기준 */
export const EMBED_TOTAL_LIMIT = 10 * 1024 * 1024;

/**
 * **이보다 크면 청크 업로드**로 간다 (2026-08-06, §12.8).
 *
 * 조각 하나로 끝날 크기(서버 기본 조각 = 8MB)라면 왕복이 세 번(세션 시작
 * ·조각·완료)인 청크보다 **단일 업로드가 빠르다.** 그 경계를 그대로 쓴다.
 */
export const CHUNK_ROUTE_MIN = 8 * 1024 * 1024;

export interface AttachOptions {
  /** 0~1 — 청크 경로에서만 불린다 (작은 파일은 진행률이 의미 없다) */
  onProgress?: (ratio: number) => void;
  /** 재시도 등 "지금 무슨 일이 일어나는지" 한 줄 (평소 null) */
  onNotice?: (msg: string | null) => void;
  signal?: AbortSignal;
}

// 맵에 이미 내장된 첨부(data URL)의 원본 바이트 합계 추정.
// base64 는 원본의 4/3 배이므로 문자열 길이 × 3/4 로 되돌린다.
function embeddedAttachmentBytes(): number {
  const map = useDocumentStore.getState().map;
  let total = 0;
  const count = (atts?: { url?: string }[]) => {
    for (const a of atts ?? []) {
      if (a.url?.startsWith('data:')) total += Math.floor(a.url.length * 0.75);
    }
  };
  count(map.root.attachments);
  const walk = (nodes: { attachments?: { url?: string }[]; children?: unknown[] }[]) => {
    for (const n of nodes) {
      count(n.attachments);
      walk((n.children ?? []) as typeof nodes);
    }
  };
  walk(map.branches as never);
  return total;
}

export async function attachmentUrlForFile(
  f: File, opts: AttachOptions = {},
): Promise<string> {
  const canServer = authEnabled && !!useAuthStore.getState().session;
  const withinPerFile = f.size <= INLINE_ATTACHMENT_LIMIT;
  const withinMapTotal = embeddedAttachmentBytes() + f.size <= EMBED_TOTAL_LIMIT;

  if (withinPerFile && (withinMapTotal || !canServer)) {
    return await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(r.error ?? new Error('file read failed'));
      r.readAsDataURL(f);
    });
  }
  if (canServer) {
    const mapId = useCloudStore.getState().cloudMapId ?? undefined;
    // ⑤ **큰 파일은 청크로** (2026-08-06) — 단일 요청은 파일 전체가 서버
    //    메모리에 올라가 상한이 낮다. 사용자에게는 경로를 나누지 않는다:
    //    같은 드롭·같은 메뉴로 올리고 여기서 알아서 고른다 (§12.7).
    if (f.size > CHUNK_ROUTE_MIN) {
      const up = await uploadInChunks(f, { mapId, ...opts });
      return serverAttachmentUrl(up.id);
    }
    const up = await cloudApi.uploadAttachment(f, mapId);
    return serverAttachmentUrl(up.id);
  }
  return URL.createObjectURL(f);
}

/**
 * `attachmentUrlForFile` 에 **진행률 표시와 취소**를 얹은 것.
 *
 * 첨부를 시작하는 곳이 여럿이다(노드에 드롭 · 첨부 탭 문서/미디어). 각자
 * 진행률 UI 를 만들면 어느 하나는 반드시 빠지므로, 여기서 스토어에 등록만
 * 하고 **그리는 것은 UploadProgress 한 곳**에서 한다 (§12.7).
 *
 * 청크 경로가 아닌 작은 파일은 바로 끝나므로 목록에 넣지 않는다 — 깜빡이는
 * 줄이 오히려 방해가 된다.
 */
export async function attachFileWithProgress(f: File): Promise<string> {
  const canServer = authEnabled && !!useAuthStore.getState().session;
  if (!canServer || f.size <= CHUNK_ROUTE_MIN) return attachmentUrlForFile(f);

  const store = useUploadStore.getState();
  const key = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const ctrl = new AbortController();
  store.begin({ key, name: f.name, size: f.size, ratio: 0, abort: () => ctrl.abort() });
  try {
    return await attachmentUrlForFile(f, {
      signal: ctrl.signal,
      onProgress: (r) => useUploadStore.getState().progress(key, r),
      onNotice: (msg) => useUploadStore.getState().notice(key, msg),
    });
  } finally {
    useUploadStore.getState().end(key);
  }
}
