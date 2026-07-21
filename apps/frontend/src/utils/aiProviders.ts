// aiProviders — Anthropic(Claude) / OpenAI(ChatGPT) / Google(Gemini) API를
// 브라우저에서 직접 호출해 EMM Markdown 답변을 받는다.
//
// 웹 채팅에서 질문하고 답을 받는 것과 동일한 경험을 앱 안에서 재현한다:
// 시스템 프롬프트(= EMM 템플릿, AI 설정에서 편집 가능) + 사용자 프롬프트
// → 답변 텍스트. API 키는 사용자가 AI 설정에 등록한 것을 쓰며 브라우저
// (localStorage)에만 저장된다 — 서버로 보내지 않는다.
// [서버 연결 예정] SaaS에서는 서버가 키를 보관·호출하는 프록시로 이관.

export type AiProvider = 'anthropic' | 'openai' | 'gemini';

export const PROVIDER_LABELS: Record<AiProvider, string> = {
  anthropic: 'Anthropic (Claude)',
  openai: 'OpenAI (ChatGPT)',
  gemini: 'Google (Gemini)',
};

// 기본 모델 — AI 설정에서 자유롭게 바꿀 수 있다
export const DEFAULT_MODELS: Record<AiProvider, string> = {
  anthropic: 'claude-sonnet-5',
  openai: 'gpt-4o-mini',
  gemini: 'gemini-2.0-flash',
};

// 회사별 알려진 모델 목록 (첫 항목 = 기본) — 목록에 없는 새 모델은
// AI 설정의 '직접 입력'으로 쓸 수 있다
export const KNOWN_MODELS: Record<AiProvider, string[]> = {
  anthropic: [
    'claude-sonnet-5',
    'claude-opus-4-8',
    'claude-haiku-4-5-20251001',
  ],
  openai: [
    'gpt-4o-mini',
    'gpt-4o',
    'gpt-4.1-mini',
    'gpt-4.1',
  ],
  gemini: [
    'gemini-2.0-flash',
    'gemini-2.5-flash',
    'gemini-2.5-pro',
    'gemini-1.5-pro',
  ],
};

export const PROVIDERS: AiProvider[] = ['anthropic', 'openai', 'gemini'];

// API 키 발급 방법 — AI 설정 메뉴의 도움말 (IT 초보자 단계 안내)
export const KEY_HELP: Record<AiProvider, { url: string; steps: string[] }> = {
  anthropic: {
    url: 'https://console.anthropic.com/settings/keys',
    steps: [
      'console.anthropic.com 에 접속해 계정을 만들고 로그인합니다.',
      '왼쪽 메뉴 Settings → API Keys 로 이동합니다.',
      "'Create Key' 버튼을 누르고 이름을 아무거나 정합니다.",
      "만들어진 'sk-ant-' 로 시작하는 키를 복사해 아래 칸에 붙여넣습니다 (키는 만들 때 한 번만 보입니다).",
      '사용하려면 Billing 메뉴에서 결제 수단(크레딧)을 등록해야 합니다.',
    ],
  },
  openai: {
    url: 'https://platform.openai.com/api-keys',
    steps: [
      'platform.openai.com 에 접속해 계정을 만들고 로그인합니다 (ChatGPT 계정과 같은 계정).',
      '왼쪽 메뉴 API keys 로 이동합니다.',
      "'Create new secret key' 버튼을 누릅니다.",
      "만들어진 'sk-' 로 시작하는 키를 복사해 아래 칸에 붙여넣습니다 (키는 만들 때 한 번만 보입니다).",
      'Settings → Billing 에서 결제 수단을 등록해야 호출이 됩니다 (ChatGPT Plus 구독과는 별개 요금).',
    ],
  },
  gemini: {
    url: 'https://aistudio.google.com/apikey',
    steps: [
      'aistudio.google.com/apikey 에 접속해 Google 계정으로 로그인합니다.',
      "'API 키 만들기(Create API key)' 버튼을 누릅니다.",
      "만들어진 'AIza' 로 시작하는 키를 복사해 아래 칸에 붙여넣습니다.",
      '무료 사용량이 제공되어 결제 등록 없이 바로 시험해 볼 수 있습니다.',
    ],
  },
};

// 모델이 답변 전체를 ```markdown … ``` 하나로 감싼 경우 바깥 펜스만 벗긴다
// (EMM 본문 안의 코드 펜스는 건드리지 않는다 — 첫 줄/끝 줄만 검사)
export function unwrapOuterFence(text: string): string {
  const lines = text.trim().split('\n');
  if (
    lines.length >= 2 &&
    /^```(markdown|md)?\s*$/i.test(lines[0]) &&
    /^```\s*$/.test(lines[lines.length - 1])
  ) {
    return lines.slice(1, -1).join('\n');
  }
  return text.trim();
}

async function readError(res: Response): Promise<string> {
  try {
    const j = await res.json();
    const msg =
      j?.error?.message ?? j?.message ?? j?.error?.type ?? JSON.stringify(j).slice(0, 200);
    return `${res.status} ${msg}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

// 프롬프트를 보내고 답변 텍스트를 받는다. 실패 시 사람이 읽을 수 있는
// 메시지의 Error를 던진다.
export async function generateWithAi(
  provider: AiProvider,
  apiKey: string,
  model: string,
  system: string,
  user: string,
): Promise<string> {
  if (!apiKey.trim()) throw new Error('API 키가 등록되지 않았습니다 — AI 설정에서 등록하세요');

  if (provider === 'anthropic') {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        // 브라우저 직접 호출 허용 (Anthropic CORS 요구 헤더)
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model,
        max_tokens: 8192,
        system,
        messages: [{ role: 'user', content: user }],
      }),
    });
    if (!res.ok) throw new Error(`Anthropic 호출 실패: ${await readError(res)}`);
    const data = await res.json();
    const text = (data.content ?? [])
      .filter((b: { type?: string }) => b.type === 'text')
      .map((b: { text?: string }) => b.text ?? '')
      .join('');
    if (!text.trim()) throw new Error('Anthropic 응답이 비어 있습니다');
    return unwrapOuterFence(text);
  }

  if (provider === 'openai') {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    });
    if (!res.ok) throw new Error(`OpenAI 호출 실패: ${await readError(res)}`);
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content ?? '';
    if (!text.trim()) throw new Error('OpenAI 응답이 비어 있습니다');
    return unwrapOuterFence(text);
  }

  // gemini
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
      }),
    },
  );
  if (!res.ok) throw new Error(`Gemini 호출 실패: ${await readError(res)}`);
  const data = await res.json();
  const text = (data.candidates?.[0]?.content?.parts ?? [])
    .map((p: { text?: string }) => p.text ?? '')
    .join('');
  if (!text.trim()) throw new Error('Gemini 응답이 비어 있습니다');
  return unwrapOuterFence(text);
}
