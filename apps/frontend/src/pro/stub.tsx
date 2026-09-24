// 유료 UI 가 **없을 때**의 자리 (2026-08-16).
//
// 이것이 공개판의 **정상 화면**이다 — 오류가 아니다. 유료 UI 가 설치된
// 배포에서는 vite 별칭 `@pro` 가 그쪽을 가리키므로 이 파일은 안 쓰인다.
//
// 하는 일은 하나 — **왜 못 쓰는지 서버가 준 문장을 그대로 보여 준다.**
// 우리가 문장을 지어내면, 만료된 라이선스와 안 산 기능과 서버 설정 누락이
// 화면에서 같은 말이 된다.

import type { ThemeTokens } from '@/components/design-tokens/theme';
import type { LaidOutNode } from '@/layout/types';
import { useEffect } from 'react';
import { useProFeature } from './contract';

export function ProFeaturePanel({ t, featureId }: { t: ThemeTokens; featureId: string }) {
  const s = useProFeature(featureId);

  const box: React.CSSProperties = {
    padding: '18px 16px', display: 'flex', flexDirection: 'column', gap: 10,
  };

  if (s.status === 'loading') {
    return <div style={{ ...box, color: t.textMuted, fontSize: 13 }}>확인 중…</div>;
  }

  // 서버에 못 물었다. **"유료라서 안 됩니다"라고 말하지 않는다** — 백엔드가
  // 잠깐 죽은 것을 "안 샀다"로 보여 주면 사용자는 있지도 않은 결제를 의심한다.
  if (s.status === 'unknown') {
    return (
      <div style={{ ...box, color: t.textMuted, fontSize: 13, lineHeight: 1.6 }}>
        기능 정보를 불러오지 못했습니다.<br />
        서버에 연결된 뒤 다시 열어 주세요.
      </div>
    );
  }

  if (s.status === 'on') {
    // 여기 오면 **유료 UI 가 설치돼야 하는데 안 된 것**이다. 서버는 켜졌다고
    // 하는데 화면이 없다 — 조용히 빈 화면을 주면 원인을 못 찾는다.
    return (
      <div style={{ ...box, fontSize: 13, lineHeight: 1.6, color: t.text }}>
        <b>{s.feature.name}</b> 은(는) 이 서버에서 사용할 수 있지만,
        <br />이 화면 모듈이 설치돼 있지 않습니다.
        <span style={{ color: t.textMuted }}>
          유료 UI 를 포함해 다시 빌드해야 합니다.
        </span>
      </div>
    );
  }

  return (
    <div style={box}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <b style={{ fontSize: 14, color: t.text }}>{s.feature.name}</b>
        <span style={{
          fontSize: 11, padding: '2px 7px', borderRadius: 10,
          background: t.primarySoft, color: t.primary, whiteSpace: 'nowrap',
        }}>
          준비 중
        </span>
      </div>
      {/* 서버가 준 문장 그대로 — 우리가 바꿔 쓰면 갈래가 뭉개진다 */}
      <div style={{ fontSize: 13, lineHeight: 1.65, color: t.textMuted }}>
        {s.feature.reason}
      </div>
    </div>
  );
}


// ── 협업 자리 (2026-08-18) ────────────────────────────────────────────
//
// 여기 있는 셋은 **아무것도 그리지 않는다.** 그것이 공개판의 정상
// 동작이다 — 협업은 파는 기능이고, 없는 기능의 자리에 무엇을 그리면
// "되는 줄 알았는데 안 되는" 화면이 된다.
//
// 유료 UI 가 설치된 빌드에서는 `@pro` 별칭이 그쪽을 가리키므로 이 파일은
// 쓰이지 않는다 (vite.config.ts).
//
// ★ **자리의 모양은 공개다.** 무엇을 넘겨받는지가 공개돼 있어야 유료
//   모듈이 코어를 고치지 않고 갈아 끼울 수 있다 (open-core-boundary.md §5).

/**
 * 협업 세션 — 맵을 열 때 함께 뜨고, 닫으면 함께 내려간다.
 * 실제로 소켓을 열고 문서를 합치는 일은 **유료 모듈**이 한다.
 */
export function ProCollabSession(_p: { mapId: string | null; kind?: string }) {
  return null;
}

/**
 * 공유 대화상자 — 툴바의 **공유** 버튼이 연다.
 *
 * 공개판에서는 **왜 못 쓰는지 서버가 준 문장을 그대로** 보여 준다
 * (`ProFeaturePanel` 과 같은 규칙). 예전에는 이 버튼이 눌려도 아무 일도
 * 일어나지 않았다 — 눌리는데 아무 일도 없는 버튼은 고장으로 보인다.
 */
export function ProShareDialog(
  { t, mapId, onClose }: { t: ThemeTokens; mapId: string | null; onClose: () => void },
) {
  if (!mapId) return null;
  return (
    <div
      data-testid="share-dialog"
      role="dialog"
      aria-label="맵 공유"
      style={{
        position: 'fixed', inset: 0, zIndex: 60, display: 'grid', placeItems: 'center',
        background: 'rgba(0,0,0,.35)',
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 380, background: t.surface, color: t.text,
          border: `1px solid ${t.border}`, borderRadius: 12, overflow: 'hidden',
        }}
      >
        <div style={{
          padding: '12px 16px', borderBottom: `1px solid ${t.divider}`,
          fontWeight: 700, fontSize: 14,
        }}>
          맵 공유
        </div>
        <ProFeaturePanel t={t} featureId="collab" />
        <div style={{ padding: '10px 16px', textAlign: 'right' }}>
          <button
            data-testid="share-close"
            onClick={onClose}
            style={{
              padding: '6px 14px', borderRadius: 8, cursor: 'pointer',
              border: `1px solid ${t.border}`, background: t.surfaceAlt, color: t.text,
            }}
          >닫기</button>
        </div>
      </div>
    </div>
  );
}

/** 상단 툴바의 접속자 자리 */
export function ProPresenceBar(_p: { t: ThemeTokens }) {
  return null;
}

/** 캔버스 위 남의 커서 자리 — 좌표 변환에 필요한 값을 그대로 넘긴다 */
export function ProCursorLayer(_p: {
  t: ThemeTokens;
  W: number;
  H: number;
  nodes: LaidOutNode[];
  scale?: number;
  CX: number;
  CY: number;
  panX?: number;
  panY?: number;
}) {
  return null;
}

/**
 * 협업맵 유형 칸 감싸개 — **공개판은 그대로 돌려준다.**
 * 참가자 목록은 유료 기능이므로 자리만 열어 두고 내용은 두지 않는다
 * (open-core-boundary.md §5 — 자리와 규칙은 공개, 알맹이는 비공개).
 */
export function ProMapMembersTip(
  { children }: { t: unknown; mapId: string; children: JSX.Element },
) {
  return children;
}

// ── 초대·소유권 이전 자리 (2026-09-05) ─────────────────────────────
//
// 받은함과 [나가기]는 유료 모듈이 채운다 (collaboration/29 §8.3).
// 공개판에서는 협업맵이 생기지 않으므로 이 자리에 올 것이 없다 — 둘 다
// 아무것도 그리지 않는 것이 정상이다.

/** 문서함 상단 받은함 — 받은 소유권 제안 · 새로 공유된 맵 */
export function ProInbox(_p: { t: ThemeTokens; onOpenMap: (mapId: string) => void }) {
  return null;
}

/** '공유받은 맵' 행의 [나가기] 자리 */
export function ProSharedMapActions(_p: { t: ThemeTokens; mapId: string; onLeft: () => void }) {
  return null;
}

// ── 맵 판매 자리 (2026-09-22, 27b §8.1) ─────────────────────────────

/**
 * 값 칸의 잠금·셈 자리 — **공개판에서는 잠그지 않는다.**
 *
 * ★ 언뜻 거꾸로 보이지만 이유가 있다. 이 자리가 잠그는 것은 "정산 계좌가
 *   아직" 하나뿐인데, 그 판정을 하는 모듈이 여기엔 없다. **모르면서 잠그면**
 *   화면은 이유를 대지 못하고 칸만 죽는다 — 저자는 왜 안 되는지 알 길이 없다.
 *
 *   그리고 공개판에서는 애초에 값 칸까지 오지 않는다. `map-sales` 가 켜져야
 *   `PriceRow` 가 칸을 그리고, 그것을 켜는 것은 유료 모듈이다. 여기까지
 *   왔다면 **유료 모듈은 있는데 화면 모듈만 빠진 빌드**이고, 그때 막아야 할
 *   자리는 서버다(`checkout` 이 같은 판정을 다시 한다).
 */
export function ProSalesGate(
  { onReady }: { t: ThemeTokens; priceKrw: number | null; onReady: (ready: boolean) => void },
) {
  useEffect(() => { onReady(true); }, [onReady]);
  return null;
}

/** 계정 메뉴 ▸ 판매·정산 — 공개판에서는 **왜 없는지** 서버 문장 그대로 */
export function ProSalesPanel({ t }: { t: ThemeTokens }) {
  return <ProFeaturePanel t={t} featureId="map-sales" />;
}

/** 관리자 콘솔 ▸ 판매관리 — 공개판에는 탭 자체가 없다(자리만 지킨다) */
export function ProSalesAdminPanel({ t }: { t: ThemeTokens }) {
  return <ProFeaturePanel t={t} featureId="map-sales" />;
}

/**
 * 유료 맵 뷰어의 [구매하기] 자리 — **공개판에서는 아무것도 그리지 않는다.**
 *
 * ★ 여기까지 오는 일이 애초에 없다: 코어는 `map-sales` 가 켜진 서버에서만
 *   이 자리를 그리고(아니면 "아직 구매할 수 없습니다"), 그것을 켜는 것은
 *   유료 모듈이다. 여기 왔다면 **유료 모듈은 있는데 화면 모듈만 빠진
 *   빌드**이고, 그때 단추를 그리면 **눌러도 아무 일이 없는 단추**가 된다 —
 *   손님에게 그것보다는 없는 편이 낫다.
 */
export function ProBuyPanel(_p: {
  publishId: string; title: string; priceKrw: number | null;
}) {
  return null;
}
