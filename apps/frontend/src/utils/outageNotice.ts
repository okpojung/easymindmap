// outageNotice — 자동저장 실패가 "서버가 없다"는 뜻인지 판정하고 배너 문구를 만든다 (2026-09-13, B20 ⑧ⓑ).
//
// 운영 배포(compose 교체)는 API 가 5~15초 빈다(ci-cd-github-actions.md §11.4).
// 그동안 자동저장은 끝까지 재시도하고 편집은 IndexedDB 초안에 남으므로 잃는 것은
// 없다 — 사용자에게 보이던 것이 "요청 실패 (502)" 뿐이라 배포 중인지 알 길이
// 없었다. 여기서 "연결 자체가 안 되는 실패"만 골라 배너 문구를 준다.
//
//   MAINTENANCE  NPM 이 502 를 가로채 내주는 점검 응답(§11.4-A ⓐ) — 배포라고 말해도 된다
//   status 0     fetch 가 던졌다 — 서버가 없거나 망이 끊겼다
//   502/503/504  프록시가 뒤를 못 찾았다 — 배포 중 컨테이너 교체가 가장 흔한 원인
//
// 400·401·409·500 같은 것은 **서버가 살아서 대답한 것**이라 여기 해당하지 않는다 —
// 그런 실패에 "배포 중일 수 있다"고 말하면 원인을 감춘다.

export interface OutageNotice {
  /** 굵은 한 줄 */
  title: string;
  /** 그 아래 설명 */
  detail: string;
  /** 'maintenance' = 점검 응답을 받았다 · 'unreachable' = 그냥 닿지 않는다 */
  kind: 'maintenance' | 'unreachable';
}

const DETAIL = '편집은 이 브라우저에 보관되고 있고, 연결이 돌아오면 자동으로 저장됩니다. 잠시만 기다려 주세요.';

/**
 * 실패 원인이 "서버가 없다"면 배너 문구를, 아니면 null 을 돌려준다.
 * `CloudError` 를 직접 import 하지 않는다 — 시험에서 fetch 없이 돌리기 위해서다.
 */
export function outageNoticeFor(err: unknown): OutageNotice | null {
  if (!err || typeof err !== 'object') return null;
  const e = err as { status?: unknown; code?: unknown };
  if (e.code === 'MAINTENANCE') {
    return { kind: 'maintenance', title: '버전 업그레이드 배포 중입니다', detail: DETAIL };
  }
  const st = typeof e.status === 'number' ? e.status : NaN;
  if (st === 0 || st === 502 || st === 503 || st === 504) {
    return { kind: 'unreachable', title: '서버에 연결되지 않습니다 — 배포 중일 수 있습니다', detail: DETAIL };
  }
  return null;
}
