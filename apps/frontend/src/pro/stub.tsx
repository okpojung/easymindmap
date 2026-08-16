// 유료 UI 가 **없을 때**의 자리 (2026-08-16).
//
// 이것이 공개판의 **정상 화면**이다 — 오류가 아니다. 유료 UI 가 설치된
// 배포에서는 vite 별칭 `@pro` 가 그쪽을 가리키므로 이 파일은 안 쓰인다.
//
// 하는 일은 하나 — **왜 못 쓰는지 서버가 준 문장을 그대로 보여 준다.**
// 우리가 문장을 지어내면, 만료된 라이선스와 안 산 기능과 서버 설정 누락이
// 화면에서 같은 말이 된다.

import type { ThemeTokens } from '@/components/design-tokens/theme';
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
