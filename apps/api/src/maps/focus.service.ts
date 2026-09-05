import { Injectable } from '@nestjs/common';

/**
 * **사용자가 지금 앱에서 열어 둔 맵과 선택한 노드** (2026-09-05).
 *
 * MCP 대화에서 "지금 열려 있는 맵의 선택한 노드 아래에 붙여 줘" 를 받으려면
 * 서버가 그 자리를 알아야 한다. 앱이 하트비트(`POST /maps/:id/edit-heartbeat`)
 * 에 실어 보내고, 여기 **메모리에만** 둔다 — 표를 만들지 않는 이유:
 *   · 값이 몇 초마다 바뀌고 몇 초 지나면 쓸모없다(TTL 60초). 디스크에 남길
 *     이유가 없다.
 *   · API 가 재시작되면 잃지만 앱이 5초 안에 다시 보낸다.
 *   · 단일 인스턴스 전제다. 여러 인스턴스로 가면 그때 Redis 같은 공유 자리로
 *     옮긴다(값의 모양은 그대로).
 *
 * 사용자당 하나만 기억한다 — 탭이 여럿이면 **가장 최근에 보낸 것**이 이긴다.
 * 그것이 "지금 보고 있는 것" 에 가장 가깝다.
 */
export interface Focus {
  mapId: string;
  sessionKey: string;
  /** null = 선택 없음, 'root' = 중심 주제 */
  nodeId: string | null;
  /** 가지 → … → 노드 이름 경로 (루트·선택 없음이면 []) */
  path: string[];
  at: number;
}

/** 이보다 오래 조용하면 "열린 맵이 없다" 로 본다 — 하트비트 5초의 열두 배 */
export const FOCUS_TTL_MS = 60_000;

@Injectable()
export class FocusService {
  private readonly byUser = new Map<string, Focus>();

  set(userId: string, f: Omit<Focus, 'at'>): void {
    this.byUser.set(userId, { ...f, at: Date.now() });
  }

  /** 살아 있는 것만 — 죽었으면 null */
  get(userId: string): Focus | null {
    const f = this.byUser.get(userId);
    if (!f) return null;
    if (Date.now() - f.at > FOCUS_TTL_MS) { this.byUser.delete(userId); return null; }
    return f;
  }

  /** 그 맵을 그 세션이 닫았다 — 다른 탭의 것이면 그대로 둔다 */
  clear(userId: string, mapId: string, sessionKey: string): void {
    const f = this.byUser.get(userId);
    if (f && f.mapId === mapId && f.sessionKey === sessionKey) this.byUser.delete(userId);
  }
}
