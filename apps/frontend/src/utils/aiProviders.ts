// aiProviders — Anthropic(Claude) / OpenAI(ChatGPT) / Google(Gemini) API를
// 브라우저에서 직접 호출해 EMM Markdown 답변을 받는다.
//
// 웹 채팅에서 질문하고 답을 받는 것과 동일한 경험을 앱 안에서 재현한다:
// 시스템 프롬프트(= EMM 템플릿, AI 설정에서 편집 가능) + 사용자 프롬프트
// → 답변 텍스트. API 키는 사용자가 AI 설정에 등록한 것을 쓰며 브라우저
// (localStorage)에만 저장된다 — 서버로 보내지 않는다.
// [서버 연결 예정] SaaS에서는 서버가 키를 보관·호출하는 프록시로 이관.

import { tr } from '@/i18n';

export type AiProvider = 'anthropic' | 'openai' | 'gemini';

export const PROVIDER_LABELS: Record<AiProvider, string> = {
  anthropic: 'Anthropic (Claude)',
  openai: 'OpenAI (ChatGPT)',
  gemini: 'Google (Gemini)',
};

// 기본 모델 — AI 설정에서 자유롭게 바꿀 수 있다
// 기본 모델 — "웹 채팅과 같은 상세함"이 목표이므로 소형(mini/저가)
// 모델이 아니라 각 사의 표준 모델을 기본으로 한다 (2026-07: 웹
// ChatGPT 대비 답변이 크게 짧던 원인 중 하나가 gpt-4o-mini 기본값).
// 비용을 아끼려면 AI 설정에서 mini/flash 계열로 바꿀 수 있다.
export const DEFAULT_MODELS: Record<AiProvider, string> = {
  anthropic: 'claude-sonnet-5',
  openai: 'gpt-4o',
  // Google은 구형 모델을 빠르게 은퇴시킨다 (2026-07: 2.0-flash에 이어
  // 2.5-flash도 신규 사용자 404). 고정 모델명 대신 구글이 상시 최신
  // flash를 가리키도록 제공하는 별칭을 기본값으로 써서 재발을 막는다.
  gemini: 'gemini-flash-latest',
};

// 회사별 알려진 모델 목록 (첫 항목 = 기본) — 목록에 없는 새 모델은
// AI 설정의 '직접 입력'으로 쓸 수 있고, Gemini는 '지금 키로 사용
// 가능한 모델 불러오기'(listGeminiModels)로 실시간 목록을 조회할 수
// 있다.
export const KNOWN_MODELS: Record<AiProvider, string[]> = {
  anthropic: [
    'claude-sonnet-5',
    'claude-opus-4-8',
    'claude-haiku-4-5-20251001',
  ],
  openai: [
    'gpt-4o',
    'gpt-4o-mini',
    'gpt-4.1',
    'gpt-4.1-mini',
  ],
  gemini: [
    'gemini-flash-latest',
    'gemini-3.6-flash',
    'gemini-3.5-flash',
    'gemini-3.5-flash-lite',
    'gemini-3.1-pro',
  ],
};

// Gemini — 지금 등록한 키로 실제 호출 가능한 모델 목록을 조회한다
// (generateContent 지원 모델만). 구글의 잦은 모델 은퇴로 목록이
// 낡아도 사용자가 스스로 최신 목록을 받아 고를 수 있게 한다.
export async function listGeminiModels(apiKey: string): Promise<string[]> {
  if (!apiKey.trim()) throw new Error(tr('inspector.prov.geminiKeyFirst'));
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?pageSize=200&key=${encodeURIComponent(apiKey)}`,
  );
  if (!res.ok) throw new Error(tr('inspector.prov.listFailed', { msg: await readError(res) }));
  const data = await res.json();
  const names = ((data.models ?? []) as {
    name?: string; supportedGenerationMethods?: string[];
  }[])
    .filter((m) => (m.supportedGenerationMethods ?? []).includes('generateContent'))
    .map((m) => String(m.name ?? '').replace(/^models\//, ''))
    .filter((n) => n.startsWith('gemini'));
  if (!names.length) throw new Error(tr('inspector.prov.noGeminiModels'));
  return names;
}

export const PROVIDERS: AiProvider[] = ['anthropic', 'openai', 'gemini'];

// API 키 발급 방법 — AI 설정 메뉴의 도움말 (IT 초보자 단계 안내)
// steps 는 사전 키 — 렌더할 때 번역한다
export const KEY_HELP: Record<AiProvider, { url: string; steps: string[] }> = {
  anthropic: {
    url: 'https://console.anthropic.com/settings/keys',
    steps: [
      'inspector.prov.help.anthropic.1',
      'inspector.prov.help.anthropic.2',
      'inspector.prov.help.anthropic.3',
      'inspector.prov.help.anthropic.4',
      'inspector.prov.help.anthropic.5',
    ],
  },
  openai: {
    url: 'https://platform.openai.com/api-keys',
    steps: [
      'inspector.prov.help.openai.1',
      'inspector.prov.help.openai.2',
      'inspector.prov.help.openai.3',
      'inspector.prov.help.openai.4',
      'inspector.prov.help.openai.5',
    ],
  },
  gemini: {
    url: 'https://aistudio.google.com/apikey',
    steps: [
      'inspector.prov.help.gemini.1',
      'inspector.prov.help.gemini.2',
      'inspector.prov.help.gemini.3',
      'inspector.prov.help.gemini.4',
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
// opts.cacheSystem: 시스템 프롬프트가 프로젝트 안에서 반복 재사용되는
//   고정 접두사일 때 켠다 — Anthropic은 cache_control로 명시 캐싱해
//   두 번째 호출부터 그 부분 입력 요금을 ~90% 절감(OpenAI·Gemini는
//   자동 캐싱이라 별도 처리 불필요). (ai-project-workspace.md §4)
export async function generateWithAi(
  provider: AiProvider,
  apiKey: string,
  model: string,
  system: string,
  user: string,
  opts?: { cacheSystem?: boolean },
): Promise<string> {
  if (!apiKey.trim()) throw new Error(tr('inspector.prov.noKey'));

  if (provider === 'anthropic') {
    // 캐싱 켜짐 = system을 블록 배열로 보내고 마지막에 cache_control 마킹
    const systemField: unknown = opts?.cacheSystem
      ? [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }]
      : system;
    // max_tokens를 넉넉히 요청한다 — 예전 8192는 "웹 채팅과 같은 상세함"
    // 답변(수만 토큰)이 물리적으로 잘리는 상한이었다 (2026-07). 모델이
    // 지원하는 상한을 넘으면 400이 오므로 절반씩 줄여 재시도한다.
    const tryCall = async (maxTokens: number): Promise<Response> =>
      fetch('https://api.anthropic.com/v1/messages', {
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
          max_tokens: maxTokens,
          system: systemField,
          messages: [{ role: 'user', content: user }],
        }),
      });
    let res = await tryCall(32000);
    if (res.status === 400) {
      const errText = await res.clone().text();
      if (/max_tokens/i.test(errText)) res = await tryCall(16000);
    }
    if (res.status === 400) {
      const errText = await res.clone().text();
      if (/max_tokens/i.test(errText)) res = await tryCall(8192);
    }
    if (!res.ok) throw new Error(tr('inspector.prov.callFailed', { name: 'Anthropic', msg: await readError(res) }));
    const data = await res.json();
    const text = (data.content ?? [])
      .filter((b: { type?: string }) => b.type === 'text')
      .map((b: { text?: string }) => b.text ?? '')
      .join('');
    if (!text.trim()) throw new Error(tr('inspector.prov.empty', { name: 'Anthropic' }));
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
    if (!res.ok) throw new Error(tr('inspector.prov.callFailed', { name: 'OpenAI', msg: await readError(res) }));
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content ?? '';
    if (!text.trim()) throw new Error(tr('inspector.prov.empty', { name: 'OpenAI' }));
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
  if (!res.ok) {
    const msg = await readError(res);
    // 구글이 모델을 은퇴시킨 경우 — 해결 방법을 함께 안내
    const hint = /no longer available|not found/i.test(msg)
      ? tr('inspector.prov.geminiRetiredHint')
      : '';
    throw new Error(tr('inspector.prov.callFailed', { name: 'Gemini', msg }) + hint);
  }
  const data = await res.json();
  const text = (data.candidates?.[0]?.content?.parts ?? [])
    .map((p: { text?: string }) => p.text ?? '')
    .join('');
  if (!text.trim()) throw new Error(tr('inspector.prov.empty', { name: 'Gemini' }));
  return unwrapOuterFence(text);
}
