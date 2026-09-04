// AiKeyInput — AI 회사 API 키 한 칸 (2026-09-04).
//
// **두 곳이 같은 것을 쓴다** — AI 탭의 '설정' 과 우상단 계정 메뉴의
// 'AI API 키'. 입력·배지('등록됨 / 계정에 저장됨 …끝자리 / 저장 중 / 실패')
// 규칙이 두 곳에서 갈리면 어느 쪽이 맞는지 알 수 없게 된다.
//
// 값은 aiSettingsStore(브라우저)에 바로 쓰고, 로그인돼 있으면 잠시 뒤
// 계정으로도 보낸다(services/cloud/aiKeysSync). 서버가 못 맡으면 그
// 사실은 배지가 아니라 위쪽 안내 한 줄(aiKeyStorageNotice)이 말한다.

import type { ThemeTokens } from '@/components/design-tokens/theme';
import { useAiSettingsStore } from '@/stores/aiSettingsStore';
import { pushAiKey } from '@/services/cloud/aiKeysSync';
import { PROVIDER_LABELS, type AiProvider } from '@/utils/aiProviders';

const PLACEHOLDER: Record<AiProvider, string> = {
  anthropic: 'sk-ant-…', openai: 'sk-…', gemini: 'AIza…',
};

export function AiKeyInput({ t, p, children }: {
  t: ThemeTokens;
  p: AiProvider;
  /** 입력칸 아래에 붙일 것 (AI 탭은 모델 선택·도움말을 단다) */
  children?: React.ReactNode;
}) {
  const value = useAiSettingsStore((s) => s.keys[p]);
  const setKey = useAiSettingsStore((s) => s.setKey);
  const server = useAiSettingsStore((s) => s.server);
  const has = !!value?.trim();
  const status = server.status[p];
  const onAccount = server.enabled === true && !!server.hints[p] && status !== 'error';

  const badge = status === 'saving'
    ? { text: '계정에 저장 중…', bg: '#FEF3C7', fg: '#92400E' }
    : status === 'error'
      ? { text: '계정 저장 실패', bg: '#FEE2E2', fg: '#B91C1C' }
      : onAccount
        ? { text: `계정에 저장됨 ${server.hints[p]}`, bg: '#DCFCE7', fg: '#15803D' }
        : has ? { text: '이 브라우저에 등록됨', bg: '#DCFCE7', fg: '#15803D' } : null;

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{
        fontSize: 11, fontWeight: 700, color: t.text, marginBottom: 4,
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        {PROVIDER_LABELS[p]}
        {badge && (
          <span data-ai-key-badge={p} style={{
            fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 3,
            background: badge.bg, color: badge.fg,
          }}>{badge.text}</span>
        )}
      </div>
      <input
        type="password"
        data-ai-key={p}
        value={value}
        onChange={(e) => { setKey(p, e.target.value); pushAiKey(p, e.target.value); }}
        placeholder={PLACEHOLDER[p]}
        autoComplete="off"
        style={{
          width: '100%', boxSizing: 'border-box', padding: '7px 9px',
          borderRadius: 6, border: `1px solid ${t.border}`,
          background: t.surfaceAlt, color: t.text, fontSize: 12,
          outline: 'none', fontFamily: 'ui-monospace, monospace',
        }} />
      {children}
    </div>
  );
}
