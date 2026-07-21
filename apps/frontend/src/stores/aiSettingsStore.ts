// aiSettingsStore — AI 생성 설정 (API 키·모델·우선순위·시스템 프롬프트)
// + 생성 기록.
//
// localStorage에 영속된다(zustand persist). API 키는 이 브라우저에만
// 저장되며 어디로도 전송되지 않는다 (호출 시 해당 AI 사에만 전달).
// 시스템 프롬프트 기본값 = EMM 템플릿(emmSystemPrompt.ts) — 질문할 때
// 항상 이 템플릿이 시스템 프롬프트로 사용된다.
//
// 우선순위(priority): 키를 여러 개 등록했을 때 어떤 AI를 먼저 쓸지의
// 순서. 생성 뷰의 '자동' 선택은 이 순서에서 키가 등록된 첫 회사를 쓴다.

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AiProvider } from '@/utils/aiProviders';
import { DEFAULT_MODELS, PROVIDERS } from '@/utils/aiProviders';
import {
  EMM_SYSTEM_PROMPT,
  EMM_SYSTEM_PROMPT_PREVIOUS,
} from '@/utils/emmSystemPrompt';

export interface AiHistoryEntry {
  prompt: string;
  at: string; // ISO
  nodes: number;
  provider: AiProvider;
}

// 'auto' = 우선순위 순서에서 키가 등록된 첫 회사를 자동 선택
export type AiProviderChoice = AiProvider | 'auto';

interface AiSettingsState {
  provider: AiProviderChoice;
  priority: AiProvider[];
  keys: Record<AiProvider, string>;
  models: Record<AiProvider, string>;
  systemPrompt: string;
  history: AiHistoryEntry[];

  setProvider: (p: AiProviderChoice) => void;
  movePriority: (p: AiProvider, dir: -1 | 1) => void;
  setKey: (p: AiProvider, key: string) => void;
  setModel: (p: AiProvider, model: string) => void;
  setSystemPrompt: (s: string) => void;
  resetSystemPrompt: () => void;
  pushHistory: (e: AiHistoryEntry) => void;
}

// '자동' 선택 해석 — 우선순위 순서에서 키가 등록된 첫 회사
export function resolveProvider(
  choice: AiProviderChoice,
  priority: AiProvider[],
  keys: Record<AiProvider, string>,
): AiProvider {
  if (choice !== 'auto') return choice;
  return priority.find((p) => keys[p]?.trim()) ?? priority[0] ?? 'anthropic';
}

export const useAiSettingsStore = create<AiSettingsState>()(
  persist(
    (set) => ({
      provider: 'auto',
      priority: [...PROVIDERS],
      keys: { anthropic: '', openai: '', gemini: '' },
      models: { ...DEFAULT_MODELS },
      systemPrompt: EMM_SYSTEM_PROMPT,
      history: [],

      setProvider: (p) => set({ provider: p }),
      movePriority: (p, dir) =>
        set((s) => {
          const order = [...s.priority];
          const i = order.indexOf(p);
          const j = i + dir;
          if (i < 0 || j < 0 || j >= order.length) return {};
          [order[i], order[j]] = [order[j], order[i]];
          return { priority: order };
        }),
      setKey: (p, key) =>
        set((s) => ({ keys: { ...s.keys, [p]: key } })),
      setModel: (p, model) =>
        set((s) => ({ models: { ...s.models, [p]: model } })),
      setSystemPrompt: (systemPrompt) => set({ systemPrompt }),
      resetSystemPrompt: () => set({ systemPrompt: EMM_SYSTEM_PROMPT }),
      pushHistory: (e) =>
        set((s) => ({ history: [e, ...s.history].slice(0, 10) })),
    }),
    {
      name: 'easymindmap-ai-settings',
      version: 2,
      // v1 → v2: 우선순위 필드 추가 + 옛 "기본" 템플릿을 그대로 쓰던
      // 사용자는 새 기본 템플릿(상세함 규칙 포함)으로 자동 갱신.
      // 사용자가 직접 수정한 템플릿은 건드리지 않는다.
      migrate: (persisted: unknown) => {
        const s = (persisted ?? {}) as Partial<AiSettingsState>;
        if (!Array.isArray(s.priority) || s.priority.length === 0) {
          s.priority = [...PROVIDERS];
        }
        if (!s.provider) s.provider = 'auto';
        if (
          typeof s.systemPrompt === 'string' &&
          EMM_SYSTEM_PROMPT_PREVIOUS.some((prev) => s.systemPrompt === prev)
        ) {
          s.systemPrompt = EMM_SYSTEM_PROMPT;
        }
        return s as AiSettingsState;
      },
    },
  ),
);
