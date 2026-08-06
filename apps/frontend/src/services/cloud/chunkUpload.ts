// 대용량 첨부 — 청크(분할) 업로드 클라이언트 (2026-08-06, §12.6).
//
// 큰 파일을 **조각으로 잘라** 여러 번의 짧은 요청으로 보낸다.
//   · 파일을 메모리로 읽지 않는다 — `File.slice()` 가 돌려주는 Blob 을
//     그대로 `fetch` 본문에 넘기면 브라우저가 알아서 흘려 보낸다.
//   · 조각 PUT 은 **멱등**이라(서버가 덮어쓴다) 재시도가 안전하다.
//   · 진행률은 **보낸 조각 수 / 전체 조각 수**. 요청 내부 진행률까지
//     들여다볼 필요가 없다 (8MB 조각이면 1GB 가 128단계라 충분히 부드럽다).
//
// 동시 전송을 3개로 묶는 이유: 브라우저의 같은 출처 동시 연결 한도가 6이라,
// 여기서 다 써 버리면 **자동저장·문서함 요청이 굶는다.** 업로드가 앱을
// 멈춰 세우지 않게 절반만 쓴다.

import { CloudError, cloudApi } from './apiClient';

/** 조각 하나가 실패했을 때 다시 보내는 간격 — 자동저장 재시도와 같은 감각 */
const RETRY_DELAYS = [1000, 3000, 10_000];
/** 동시에 날리는 조각 수 */
const CONCURRENCY = 3;

export interface ChunkUploadOptions {
  mapId?: string;
  /** 0~1 — 조각이 하나 끝날 때마다 부른다 */
  onProgress?: (ratio: number) => void;
  /** 취소용. abort 하면 서버 세션도 정리한다 */
  signal?: AbortSignal;
}

/** 사용자가 [취소]를 눌러 중단됐다 — 오류로 떠들지 않기 위한 구분용 */
export class UploadAborted extends Error {
  constructor() {
    super('업로드를 취소했습니다.');
    this.name = 'UploadAborted';
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function aborted(signal?: AbortSignal): boolean {
  return !!signal?.aborted;
}

/**
 * 조각 하나를 **끝까지** 보낸다 (재시도 포함).
 * 400·413 처럼 다시 보내도 같은 답이 올 오류는 재시도하지 않는다.
 */
async function sendPart(
  uploadId: string, index: number, part: Blob, signal?: AbortSignal,
): Promise<void> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt += 1) {
    if (aborted(signal)) throw new UploadAborted();
    try {
      await cloudApi.putUploadPart(uploadId, index, part, signal);
      return;
    } catch (err) {
      if (aborted(signal) || (err as Error)?.name === 'AbortError') throw new UploadAborted();
      lastErr = err;
      // 서버가 "이건 다시 보내도 같다"고 말한 것들 — 즉시 포기한다.
      const st = err instanceof CloudError ? err.status : 0;
      if (st === 401 || st === 403 || st === 404 || st === 413) throw err;
      if (attempt === RETRY_DELAYS.length) break;
      await sleep(RETRY_DELAYS[attempt]);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(`조각 ${index} 전송 실패`);
}

/**
 * 파일을 청크로 올리고 **완성된 첨부의 id** 를 돌려준다.
 * 실패·취소하면 서버의 임시 조각을 정리한다.
 */
export async function uploadInChunks(
  file: File, opts: ChunkUploadOptions = {},
): Promise<{ id: string; url: string }> {
  const { mapId, onProgress, signal } = opts;
  if (aborted(signal)) throw new UploadAborted();

  // ① 세션 시작 — 여기서 쿼터·상한을 먼저 검사받는다. 다 올린 뒤에
  //    "용량 부족"을 듣는 것이 가장 나쁘다.
  const s = await cloudApi.startUpload({
    name: file.name, mime: file.type || undefined, size: file.size, mapId,
  });
  onProgress?.(0);

  try {
    // ② 조각 전송 — 이미 서버에 있는 조각은 건너뛴다(이어받기 대비).
    const done = new Set(s.received);
    let sent = done.size;
    const queue: number[] = [];
    for (let i = 0; i < s.parts; i += 1) if (!done.has(i)) queue.push(i);

    let cursor = 0;
    const worker = async () => {
      for (;;) {
        const i = cursor;
        cursor += 1;
        if (i >= queue.length) return;
        const index = queue[i];
        const start = index * s.partSize;
        await sendPart(
          s.uploadId, index, file.slice(start, Math.min(start + s.partSize, file.size)), signal,
        );
        sent += 1;
        onProgress?.(sent / s.parts);
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, queue.length || 1) }, worker),
    );

    // ③ 확정. 조각이 비었다면(409) **빠진 것만** 다시 보내고 한 번 더 시도한다.
    try {
      const att = await cloudApi.completeUpload(s.uploadId);
      onProgress?.(1);
      return { id: att.id, url: att.url };
    } catch (err) {
      if (!(err instanceof CloudError) || err.status !== 409) throw err;
      const again = await cloudApi.uploadStatus(s.uploadId);
      const have = new Set(again.received);
      for (let i = 0; i < again.parts; i += 1) {
        if (have.has(i)) continue;
        const start = i * again.partSize;
        await sendPart(
          s.uploadId, i,
          file.slice(start, Math.min(start + again.partSize, file.size)), signal,
        );
      }
      const att = await cloudApi.completeUpload(s.uploadId);
      onProgress?.(1);
      return { id: att.id, url: att.url };
    }
  } catch (err) {
    // 남은 조각을 서버에 방치하지 않는다 (실패해도 24시간 뒤 GC 가 치운다)
    void cloudApi.abortUpload(s.uploadId).catch(() => undefined);
    throw err;
  }
}
