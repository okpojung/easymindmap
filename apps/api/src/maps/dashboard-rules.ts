/**
 * **대시보드맵 전환 규칙** (2026-09-30) — 순수 함수만 둔다(DB·DI 모름).
 * 설계: docs/04-extensions/dashboard/22-dashboard.md §4.1 · §5 · §7
 *
 * 대시보드맵은 **유료 기능**이다(open-core-boundary.md §3). 그래도 이 파일이
 * 코어에 있는 이유 — **"대시보드맵은 사람이 고칠 수 없다"는 규칙은 공개**다
 * (§3.1 ③ "자리와 규칙은 공개, 알맹이는 비공개"). 유료 모듈이 없는 서버에
 * 대시보드맵이 남아 있어도(라이선스가 끝났다 등) 잠금은 그대로 지켜져야
 * 한다 — 풀리면 프로그램이 넣던 맵을 사람이 덮어써 버린다.
 */

export const DASHBOARD_VIEW_MODE = 'dashboard';

/** 전환·저장을 거절할 때의 이유 — 화면이 `code` 로 갈래를 치고 `message` 를 그대로 보여 준다 */
export interface DashboardBlock {
  code:
    | 'DASHBOARD_FEATURE_OFF'
    | 'DASHBOARD_PUBLISHED'
    | 'DASHBOARD_COLLAB'
    | 'DASHBOARD_DUP_IDS'
    | 'DASHBOARD_LOCKED';
  message: string;
}

export interface DashboardSwitchInput {
  /** 지금 맵의 view_mode */
  current: string | null | undefined;
  /** 요청한 view_mode (없으면 바꾸지 않는다) */
  next?: string;
  /** 지금 맵의 kind ('solo' | 'collab') */
  kind: string | null | undefined;
  /** 같은 요청이 바꾸려는 kind (없으면 그대로) */
  nextKind?: string;
  /** 퍼블리싱 문서함에 등록돼 있나(공개·보관 모두) */
  registered: boolean;
  /** 유료 모듈의 `dashboard` 기능이 켜져 있나 */
  featureEnabled: boolean;
  /** 꺼져 있으면 그 이유(`/v1/features` 의 문장) */
  featureReason?: string | null;
  /** 문서에서 겹치는 노드 ID */
  duplicateIds: string[];
}

/**
 * `PATCH /maps/:id` 가 view_mode · kind 를 바꿀 때 막아야 하나.
 *
 * ★ **되돌리기(`edit`)는 언제나 된다** — 유료 모듈이 꺼져도. 기능이 꺼졌다고
 *   맵이 영영 잠긴 채 갇히면, 그건 사용자의 문서를 인질로 잡는 셈이다.
 * ★ **협업맵과 퍼블리싱은 서로 막는다**(양쪽을 다 막아야 규칙이 닫힌다 —
 *   `update()` 의 "퍼블리싱 ↔ 협업" 과 같은 이유). 여기서는 대시보드 쪽
 *   두 방향(대시보드로 들어가기 · 대시보드인 채 협업맵이 되기)을 본다.
 *   반대 방향(대시보드맵을 퍼블리싱)은 퍼블리싱 쪽이 막는다.
 */
export function dashboardSwitchBlock(i: DashboardSwitchInput): DashboardBlock | null {
  const isDash = i.current === DASHBOARD_VIEW_MODE;
  const toDash = i.next === DASHBOARD_VIEW_MODE && !isDash;
  const willBeDash = i.next === undefined ? isDash : i.next === DASHBOARD_VIEW_MODE;
  const willBeCollab = (i.nextKind ?? i.kind) === 'collab';

  if (toDash) {
    if (!i.featureEnabled) {
      return {
        code: 'DASHBOARD_FEATURE_OFF',
        message: `대시보드맵은 유료 기능입니다${i.featureReason ? ` — ${i.featureReason}` : '.'}`,
      };
    }
    if (i.registered) {
      return {
        code: 'DASHBOARD_PUBLISHED',
        message: '퍼블리싱 등록된 맵은 대시보드맵으로 바꿀 수 없습니다. 먼저 퍼블리싱을 취소해 주세요.',
      };
    }
    if (i.duplicateIds.length) {
      return {
        code: 'DASHBOARD_DUP_IDS',
        message:
          `같은 ID 의 노드가 있어 프로그램이 가리킬 노드가 겹칩니다(${i.duplicateIds.slice(0, 3).join(', ')}` +
          `${i.duplicateIds.length > 3 ? ' …' : ''}) — 맵을 한 번 열어 저장한 뒤 다시 시도하세요.`,
      };
    }
  }
  if (willBeDash && willBeCollab) {
    return {
      code: 'DASHBOARD_COLLAB',
      message: '협업맵은 아직 대시보드맵으로 쓸 수 없습니다 — 단독맵만 바꿀 수 있습니다.',
    };
  }
  return null;
}

/** 사람의 저장(`saveDocument`)을 막을 때의 이유 */
export function dashboardLockBlock(viewMode: string | null | undefined): DashboardBlock | null {
  if (viewMode !== DASHBOARD_VIEW_MODE) return null;
  return {
    code: 'DASHBOARD_LOCKED',
    message: '대시보드맵은 편집할 수 없습니다 — 고치려면 [일반맵으로 되돌리기] 를 먼저 해 주세요.',
  };
}

interface NodeLike { id?: unknown; children?: unknown }
interface CenterLike { root?: NodeLike; branches?: unknown }

/**
 * 문서에서 **두 번 이상 나오는 노드 ID** — 중심이 여럿인 맵(`centers`)까지.
 *
 * 왜 전환 때 보나: 화면은 불러올 때 겹친 ID 를 새 ID 로 고치는데
 * (`documentStore` 의 dedupe), 대시보드맵은 읽기 전용이라 **그 고침이
 * 저장되지 않는다.** 그러면 화면의 노드 ID 와 서버의 노드 ID 가 어긋나,
 * [데이터 연결] 패널이 복사해 준 ID 로 프로그램이 넣어도 엉뚱한 노드가
 * 바뀐다. 입구에서 막는 것이 가장 싸다.
 */
export function duplicateNodeIds(doc: unknown): string[] {
  const seen = new Set<string>();
  const dup = new Set<string>();
  const visit = (n: unknown): void => {
    if (!n || typeof n !== 'object') return;
    const node = n as NodeLike;
    if (typeof node.id === 'string') {
      if (seen.has(node.id)) dup.add(node.id);
      else seen.add(node.id);
    }
    if (Array.isArray(node.children)) node.children.forEach(visit);
  };
  const visitCenter = (c: unknown): void => {
    if (!c || typeof c !== 'object') return;
    const center = c as CenterLike;
    visit(center.root);
    if (Array.isArray(center.branches)) center.branches.forEach(visit);
  };
  // 서버에 저장된 문서는 `{ map: {...}, editor… }` 모양이다(`mapFromDoc` 과 같다).
  // 맵 자체를 받아도 되게 둘 다 본다.
  const m = doc && typeof doc === 'object' && 'map' in (doc as object)
    ? (doc as { map: unknown }).map
    : doc;
  if (m && typeof m === 'object') {
    const d = m as { root?: unknown; branches?: unknown; centers?: unknown };
    visitCenter({ root: d.root as NodeLike, branches: d.branches });
    if (Array.isArray(d.centers)) d.centers.forEach(visitCenter);
  }
  return [...dup];
}
