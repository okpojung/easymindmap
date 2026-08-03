// webAiExchange — 웹 AI 클립보드 왕복의 순수 함수들 (방법 A).
//
//   [EasyMindMap] ①프롬프트 복사 → [AI 웹] 붙여넣기·실행
//   [EasyMindMap] ③맵 생성      ← [AI 웹] ②답변 복사
//
// API 키·백엔드 없이 사용자의 AI 웹 구독(Claude·ChatGPT·Gemini…)으로
// 맵을 만든다. 설계: docs/04-extensions/ai/web-ai-clipboard.md
// UI 는 WebAiPanel.tsx — 여기는 조립·추출·변환만 (단위 검증 가능).

import type { SampleMap } from '@/editor/__samples__/types';
import { GENERATION_TYPES } from '@/utils/emmSystemPrompt';
import { parseEmm } from '@/utils/importMarkdown';
import { parseMarkdownMapFile } from '@/utils/importMapFile';
import { countMapNodes } from '@/export/mapMeta';

/**
 * 웹 채팅창은 시스템/유저 메시지 구분이 없다 — API 모드가 나눠 보내던
 * 것을 한 덩어리로 합치고, 마지막에 "코드블록 하나로만" 출력 지시를
 * 덧붙인다 (AI 가 잡담을 앞뒤에 붙여도 §extractMapSource 가 걷어낸다).
 */
const OUTPUT_DIRECTIVE =
  '중요: 답변은 설명·인사 등 다른 말 없이, 위 규칙을 따른 EMM Markdown ' +
  '**코드블록 하나로만** 출력하라.';

export function buildWebAiPrompt(opts: {
  /** AI 설정의 EMM 시스템 프롬프트 (사용자 수정본 그대로) */
  systemPrompt: string;
  /** 만들 주제 (사용자 입력) */
  topic: string;
  /** GENERATION_TYPES 의 key ('basic' 등) — 유형별 추가 지시 */
  typeKey: string;
}): string {
  const addition = GENERATION_TYPES.find((g) => g.key === opts.typeKey)?.addition ?? '';
  return [
    opts.systemPrompt,
    addition,
    OUTPUT_DIRECTIVE,
    `요청: ${opts.topic.trim()}`,
  ].filter(Boolean).join('\n\n');
}

/**
 * 붙여넣은 AI 답변에서 맵 후보 텍스트를 추출한다.
 * 코드펜스(``` … ```)가 있으면 그중 **가장 긴 블록**의 안쪽만
 * (잡담 혼재가 대부분이라 이 단계가 핵심), 없으면 전체를 그대로.
 */
export function extractMapSource(pasted: string): string {
  const text = String(pasted || '');
  const blocks: string[] = [];
  const re = /```[a-zA-Z-]*\r?\n([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) blocks.push(m[1]);
  if (blocks.length) {
    return blocks.reduce((a, b) => (b.length > a.length ? b : a)).trim();
  }
  return text.trim();
}

export interface AnswerMapOk {
  ok: true;
  map: SampleMap;
  editor?: { layoutType?: string; spacingX?: number; spacingY?: number };
  nodeCount: number;
}
export interface AnswerMapFail {
  ok: false;
  reason: string;
}

/**
 * 후보 텍스트 → 맵. API 모드와 같은 변환기 체인:
 * parseEmm(EMM/일반 MD) → 실패 시 parseMarkdownMapFile 폴백
 * (EasyMindMap 이 내보낸 MD 를 답변으로 붙여넣는 경우까지 흡수).
 */
export function answerToMap(source: string): AnswerMapOk | AnswerMapFail {
  const candidate = source.trim();
  if (!candidate) return { ok: false, reason: '붙여넣은 내용이 비어 있습니다.' };

  const emm = parseEmm(candidate, 'AI 생성 맵');
  if (emm) return { ok: true, map: emm, nodeCount: countMapNodes(emm) };

  const imported = parseMarkdownMapFile(candidate, 'AI 생성 맵');
  if (imported) {
    return {
      ok: true,
      map: imported.map,
      editor: imported.editor,
      nodeCount: countMapNodes(imported.map),
    };
  }
  return {
    ok: false,
    reason: '맵 구조(# 견출·- 리스트)를 찾지 못했습니다. AI에게 아래 재요청 문구를 보낸 뒤 새 답변을 다시 붙여넣으세요.',
  };
}

/** 파싱 실패 시 AI 채팅창에 다시 보낼 요청 문구 (⧉ 복사 버튼용) */
export const RETRY_REQUEST_TEXT =
  '방금 답변을 다른 말 없이 EMM Markdown 코드블록 하나로만 다시 출력해줘. ' +
  '중심 주제는 "# 제목" 한 줄, 하위 항목은 "##/###" 또는 "-" 목록으로.';

/** ③단계 바로가기 — 새 탭으로 여는 AI 웹 주소 (자동 입력은 하지 않는다) */
export const AI_SHORTCUTS: { key: string; label: string; url: string }[] = [
  { key: 'claude', label: 'Claude', url: 'https://claude.ai/new' },
  { key: 'chatgpt', label: 'ChatGPT', url: 'https://chatgpt.com/' },
  { key: 'gemini', label: 'Gemini', url: 'https://gemini.google.com/app' },
];
