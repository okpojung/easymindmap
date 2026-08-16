// 유료 확장점 — 화면 쪽 계약 (2026-08-16).
//
// 서버의 `GET /v1/features` 가 **무엇이 켜졌고 왜 꺼졌는지**를 답한다.
// 화면은 그것만 보고 자리를 그린다 (docs/04-extensions/open-core-boundary.md §5).
//
// 유료 UI 가 설치된 배포에서는 vite 별칭 `@pro` 가 그쪽을 가리키고,
// 아니면 이 폴더의 `stub.tsx` 로 간다. **자리와 규칙은 공개, 알맹이는 비공개.**

import { useEffect, useState } from 'react';

export interface ProFeature {
  id: string;
  name: string;
  enabled: boolean;
  /** 꺼져 있으면 **왜** — 그대로 보여 준다. 켜져 있으면 null */
  reason: string | null;
}

export interface ProFeatures {
  /** 이 서버에 유료 모듈이 꽂혀 있는가 */
  installed: boolean;
  features: ProFeature[];
}

const BASE = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/$/, '');

/**
 * **한 번만 부른다.** 기능 목록은 서버 기동 중에 바뀌지 않으므로 모듈
 * 수준에서 약속을 붙들어 둔다 — 메뉴를 열 때마다 부르면 같은 답을 반복해
 * 받는다.
 */
let inflight: Promise<ProFeatures> | null = null;

export function fetchProFeatures(): Promise<ProFeatures> {
  if (!inflight) {
    // **인증을 붙이지 않는다** — 로그인 전에도 메뉴를 그려야 한다.
    inflight = fetch(`${BASE}/v1/features`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .catch(() => {
        // **서버에 못 물었을 때 "꺼졌다"고 단정하지 않는다.** 단정하면
        // 백엔드가 잠깐 죽은 것을 "유료 기능을 안 샀다"로 보여 주게 된다.
        inflight = null;
        return { installed: false, features: [] } as ProFeatures;
      });
  }
  return inflight;
}

export type ProState =
  | { status: 'loading' }
  | { status: 'unknown' }               // 서버에 못 물었다 — 꺼졌다는 뜻이 아니다
  | { status: 'on'; feature: ProFeature }
  | { status: 'off'; feature: ProFeature };

/** 기능 하나의 상태 — 메뉴 자리가 이것만 보고 그린다 */
export function useProFeature(id: string): ProState {
  const [state, setState] = useState<ProState>({ status: 'loading' });
  useEffect(() => {
    let alive = true;
    fetchProFeatures().then((d) => {
      if (!alive) return;
      const f = d.features.find((x) => x.id === id);
      if (!f) return setState({ status: 'unknown' });
      setState({ status: f.enabled ? 'on' : 'off', feature: f });
    });
    return () => { alive = false; };
  }, [id]);
  return state;
}
