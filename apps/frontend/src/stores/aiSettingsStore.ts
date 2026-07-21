// aiSettingsStore — AI 생성 설정 (API 키·모델·시스템 프롬프트) + 생성 기록.
//
// localStorage에 영속된다(zustand persist). API 키는 이 브라우저에만
// 저장되며 어디로도 전송되지 않는다 (호출 시 해당 AI 사에만 전달).
// 시스템 프롬프트 기본값 = EMM 템플릿(emmSystemPrompt.ts) — 질문할 때
// 항상 이 템플릿이 시스템 프롬프트로 사용된다.

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AiProvider } from '@/utils/aiProviders';
import { DEFAULT_MODELS } from '@/utils/aiProviders';
import { EMM_SYSTEM_PROMPT } from '@/utils/emmSystemPrompt';

export interface AiHistoryEntry {
  prompt: string;
  at: string; // ISO
  nodes: number;
  provider: AiProvider;
}

interface AiSettingsState {
  provider: AiProvider;
  keys: Record<AiProvider, string>;
  models: Record<AiProvider, string>;
  systemPrompt: string;
  history: AiHistoryEntry[];

  setProvider: (p: AiProvider) => void;
  setKey: (p: AiProvider, key: string) => void;
  setModel: (p: AiProvider, model: string) => void;
  setSystemPrompt: (s: string) => void;
  resetSystemPrompt: () => void;
  pushHistory: (e: AiHistoryEntry) => void;
}

export const useAiSettingsStore = create<AiSettingsState>()(
  persist(
    (set) => ({
      provider: 'anthropic',
      keys: { anthropic: '', openai: '', gemini: '' },
      models: { ...DEFAULT_MODELS },
      systemPrompt: EMM_SYSTEM_PROMPT,
      history: [],

      setProvider: (p) => set({ provider: p }),
      setKey: (p, key) =>
        set((s) => ({ keys: { ...s.keys, [p]: key } })),
      setModel: (p, model) =>
        set((s) => ({ models: { ...s.models, [p]: model } })),
      setSystemPrompt: (systemPrompt) => set({ systemPrompt }),
      resetSystemPrompt: () => set({ systemPrompt: EMM_SYSTEM_PROMPT }),
      pushHistory: (e) =>
        set((s) => ({ history: [e, ...s.history].slice(0, 10) })),
    }),
    { name: 'easymindmap-ai-settings' },
  ),
);
