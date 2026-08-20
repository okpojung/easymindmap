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
