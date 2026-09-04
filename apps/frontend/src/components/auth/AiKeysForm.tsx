// AiKeysForm — 계정 메뉴의 'AI API 키' (2026-09-04 사용자 요청).
//
// "브라우저가 다르거나 PC 가 바뀔 때마다 등록하는 것은 아니다" — 키를
// 계정에 붙여 어디서 로그인하든 따라오게 한다. 입력칸은 AI 탭과 **같은
// 컴포넌트**(AiKeyInput)라 규칙이 한 벌이다. 모델 선택은 AI 탭에서 한다.

import type { ThemeTokens } from '@/components/design-tokens/theme';
import { useAiSettingsStore } from '@/stores/aiSettingsStore';
import { aiKeyStorageNotice } from '@/services/cloud/aiKeysSync';
import { AiKeyInput } from '@/editor/inspector-panels/AiKeyInput';
import { PROVIDERS } from '@/utils/aiProviders';

export function AiKeysForm({ t }: { t: ThemeTokens }) {
  // 서버 상태가 바뀌면 안내 문장도 바뀌어야 한다 — 구독해 둔다
  const server = useAiSettingsStore((s) => s.server);
  return (
    <div data-testid="ai-keys-form">
      <div data-testid="ai-keys-notice" style={{
        fontSize: 11.5, color: server.enabled === false ? '#B45309' : t.textMuted,
        lineHeight: 1.6, marginBottom: 12,
      }}>
        {aiKeyStorageNotice()}
      </div>
      {server.error && (
        <div data-testid="ai-keys-error" style={{
          fontSize: 11.5, color: '#B91C1C', background: '#FEF2F2',
          border: '1px solid #FECACA', borderRadius: 6, padding: '6px 9px', marginBottom: 10,
        }}>{server.error}</div>
      )}
      {PROVIDERS.map((p) => <AiKeyInput key={p} t={t} p={p} />)}
      <div style={{ fontSize: 10.5, color: t.textSubtle, lineHeight: 1.5 }}>
        키를 지우려면 칸을 비우세요. 모델 선택과 프롬프트 템플릿은 왼쪽 레일의
        AI 생성 → 설정에 있습니다.
      </div>
    </div>
  );
}
