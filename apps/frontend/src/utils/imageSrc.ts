// imageSrc — 화면이 **우리 저장소에 있는 사진**을 그릴 수 있게 한다
// (2026-08-16, B16 ② 슬라이스 2).
//
// 사진이 서버 저장소로 옮겨가면 `image.src` 가 `{API}/v1/attachments/<id>`
// 가 된다. `<img>`·`<image>` 는 **헤더를 못 싣기 때문에** 인증 토큰을
// URL 에 붙여야 한다 — 첨부를 열 때 쓰는 `attachmentFetchUrl()` 과 같다.
//
// **토큰을 문서에 저장하지 않는다.** 토큰은 만료되므로, 저장해 두면
// 어느 날 사진이 전부 깨진다. 그릴 때마다 그때의 토큰을 붙인다.
//
// 훅으로 만들지 않고 **리졸버를 돌려주는 훅**으로 만든 이유: 사진은
// `images.map(...)` 안에서 그려지는데, 반복문 안에서는 훅을 부를 수 없다.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  absolutizeAttachmentUrl,
  attachmentFetchUrl,
  serverAttachmentId,
} from '@/services/cloud/apiClient';

/** 원본 src → 토큰이 붙은 src. 세션 동안만 유지한다(토큰이 만료되므로) */
const resolved = new Map<string, string>();
/** 지금 해결 중인 src — 같은 사진을 여러 노드가 쓸 때 한 번만 부른다 */
const inflight = new Set<string>();
const listeners = new Set<() => void>();

function notify() {
  for (const fn of listeners) fn();
}

/**
 * 사진 src 를 그릴 수 있는 주소로 바꿔 주는 함수를 돌려준다.
 *
 * - 우리 저장소 사진이 아니면(data URL · 남의 사이트 URL) **그대로** 준다
 * - 우리 것이면 토큰 붙인 주소를 준다. 아직 준비 전이면 **원본을 그대로**
 *   주고, 준비되는 대로 다시 그린다
 *
 * 준비 전에 `undefined` 를 주지 않는 이유: 사진 자리가 잠깐 비었다가
 * 채워지면 **레이아웃이 흔들린다.** 원본 주소로 먼저 시도하는 편이
 * 낫다 — 인증이 꺼진 개발 모드에서는 그것만으로 바로 보인다.
 */
export function useImageSrcResolver(): (src: string | undefined) => string | undefined {
  const [, bump] = useState(0);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    const fn = () => { if (alive.current) bump((v) => v + 1); };
    listeners.add(fn);
    return () => { alive.current = false; listeners.delete(fn); };
  }, []);

  return useCallback((src: string | undefined) => {
    if (!src || !serverAttachmentId(src)) return src;
    const got = resolved.get(src);
    if (got) return got;
    if (!inflight.has(src)) {
      inflight.add(src);
      void attachmentFetchUrl(src)
        .then((url) => { resolved.set(src, url); })
        .catch(() => { /* 실패하면 원본 주소로 남는다 */ })
        .finally(() => { inflight.delete(src); notify(); });
    }
    // 토큰이 준비되기 전에는 **절대 주소만이라도** 준다. 상대 경로를
    // 그대로 두면 `<img>` 가 **프런트 주소로 풀어** 404 가 난다.
    return absolutizeAttachmentUrl(src);
  }, []);
}

/**
 * 로그아웃·재로그인 때 비운다 — 옛 토큰이 붙은 주소가 남으면 401 로
 * 깨진 사진이 된다.
 */
export function clearResolvedImageSrcs(): void {
  resolved.clear();
  notify();
}
