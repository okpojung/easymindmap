// OutageBanner — "버전 업그레이드 배포 중입니다 / 서버에 연결되지 않습니다" (2026-09-13, B20 ⑧ⓑ).
//
// 자동저장이 **서버에 닿지 않는 실패**를 받으면 뜬다(useCloudAutosave →
// autosaveStore.outageNotice). 저장은 그동안 끝까지 재시도하고 편집은 초안에
// 남으므로 사용자가 할 일은 기다리는 것뿐이다 — 그래서 버튼은 [알겠습니다] 하나다.
// 다음 저장이 성공하면 스스로 사라진다. 모양은 DraftRecoveryBanner 와 같은 띠.
import type { ThemeTokens } from '@/components/design-tokens/theme';
import { useAutosaveStore } from '@/stores/autosaveStore';

export function OutageBanner({ t }: { t: ThemeTokens }) {
  const notice = useAutosaveStore((s) => s.outageNotice);
  const dismissed = useAutosaveStore((s) => s.outageDismissed);
  if (!notice || dismissed) return null;
  return (
    <div
      data-testid="outage-banner"
      data-kind={notice.kind}
      role="status"
      style={{
        position: 'absolute', top: 14, left: '50%', transform: 'translateX(-50%)',
        zIndex: 31, maxWidth: 640, padding: '10px 14px', borderRadius: 8,
        background: t.surface, color: t.text,
        border: `1px solid ${t.warning}`, borderLeft: `4px solid ${t.warning}`,
        boxShadow: '0 6px 20px rgba(60,45,15,0.22)',
        display: 'flex', alignItems: 'center', gap: 12, fontSize: 12.5,
      }}
    >
      <span aria-hidden style={{ color: t.warning, fontSize: 16, lineHeight: 1 }}>⟳</span>
      <div style={{ flex: 1, lineHeight: 1.5 }}>
        <b>{notice.title}</b>
        <div style={{ fontSize: 11.5, color: t.textMuted, marginTop: 2 }}>{notice.detail}</div>
      </div>
      <button
        data-testid="outage-banner-ok"
        onClick={() => useAutosaveStore.getState().dismissOutage()}
        style={{
          fontSize: 12, padding: '6px 10px', borderRadius: 6,
          border: `1px solid ${t.border}`, background: t.surface,
          color: t.textMuted, cursor: 'pointer',
        }}>알겠습니다</button>
    </div>
  );
}
