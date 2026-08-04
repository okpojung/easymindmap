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
// 2026-08-04 실사용 보고 반영: "코드블록 하나로만"만으로는 ChatGPT 가
// 마크다운을 그대로 렌더해 버린다(여러 블록 + 텍스트) — 렌더 화면을
// 드래그 복사하면 ##·>·표 문법이 사라져 뒷부분이 뭉개진다. 커스텀 GPT
// 규칙 B 와 동일하게 **~~~ 물결 펜스**를 명시해 답변 전체가 복사 버튼
// 달린 코드블록 하나로 나오게 한다 (백틱이면 EMM 안의 ``` 코드 펜스가
// 바깥 블록을 조기에 닫는다).
export const OUTPUT_DIRECTIVE =
  '중요: 답변 전체를 반드시 ~~~ 로 시작해 ~~~ 로 끝나는 **코드블록 ' +
  '하나** 안에 출력하라 (물결 3개 펜스 — 백틱 ``` 이 아니라 ~~~ 다. ' +
  'EMM 안의 ``` 코드 펜스와 충돌하지 않기 위함). 코드블록 앞뒤에 ' +
  '설명·인사 등 다른 말은 쓰지 마라.';

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
 * 코드펜스가 있으면 그중 **가장 긴 블록**의 안쪽만(잡담 혼재가
 * 대부분이라 이 단계가 핵심), 없으면 전체를 그대로.
 *
 * 펜스는 백틱(```)과 **물결(~~~)** 둘 다 지원한다 — EMM 안에 ``` 코드
 * 펜스가 들어가므로, 커스텀 GPT('EasyMindMap Copilot')는 바깥을 ~~~ 로
 * 감싸도록 지시한다 (easymindmap-copilot-gpt.md 규칙 B). 닫는 펜스는
 * 같은 문자·같은 길이 이상·정보 문자열 없음일 때만으로 판정해, 블록
 * 안의 다른 종류 펜스가 바깥을 조기에 닫지 않게 한다.
 */
export function extractMapSource(pasted: string): string {
  const text = String(pasted || '');
  const lines = text.split(/\r?\n/);
  const blocks: string[] = [];
  let open: { ch: string; len: number; buf: string[] } | null = null;
  for (const line of lines) {
    const m = line.match(/^\s*(`{3,}|~{3,})\s*([a-zA-Z-]*)\s*$/);
    if (m && open && m[1][0] === open.ch && m[1].length >= open.len && !m[2]) {
      blocks.push(open.buf.join('\n'));
      open = null;
      continue;
    }
    if (m && !open) {
      open = { ch: m[1][0], len: m[1].length, buf: [] };
      continue;
    }
    if (open) open.buf.push(line);
  }
  if (open && open.buf.length) blocks.push(open.buf.join('\n')); // 닫는 펜스 유실
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

  // blockPlacement 'node' (2026-08-04) — 문단·코드·표를 숨은 노트가
  // 아니라 **노드 본문**에 넣는다. MD 파일 불러오기 기본과 동일하고,
  // 템플릿 v4 규칙 4("블록은 노드 본문에 표시된다")와 한 쌍이다.
  const emm = parseEmm(candidate, 'AI 생성 맵', { blockPlacement: 'node' });
  if (emm) return { ok: true, map: emm, nodeCount: countMapNodes(emm) };

  const imported = parseMarkdownMapFile(candidate, 'AI 생성 맵',
    { blockPlacement: 'node' });
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

/**
 * 붙여넣은 원문에서 시도할 맵 후보 텍스트들 (우선순위 순).
 * ① 코드펜스 추출본(최장 블록) ② 펜스 줄만 걷어낸 전체 텍스트 —
 * ②는 AI 가 바깥을 ``` 로 감쌌는데 안에 ``` 코드 펜스가 있어 블록이
 * 조기에 잘리는 사례, 그리고 **답변이 렌더된 채 드래그 복사돼 작은
 * 예시 코드블록들만 펜스로 남은 사례**(2026-08-04 실사용 보고 —
 * 최장 블록이 예시 블록이라 ①이 엉뚱한 조각을 집는다)를 흡수한다.
 * 새 맵·선택 노드 삽입이 같은 후보 체인을 쓴다.
 */
export function mapSourceCandidates(pasted: string): string[] {
  const text = String(pasted || '');
  const out = [extractMapSource(text)];
  if (/^\s*[`~]{3,}/m.test(text)) {
    out.push(text.replace(/^\s*[`~]{3,}[^\n]*$/gm, '').trim());
  }
  return out.filter((s, i, a) => s && a.indexOf(s) === i);
}

/** 붙여넣은 원문 → 맵 (패널 공용 진입점) — 후보를 차례로 시도 */
export function answerFromPaste(pasted: string): AnswerMapOk | AnswerMapFail {
  let first: AnswerMapOk | AnswerMapFail | null = null;
  for (const candidate of mapSourceCandidates(pasted)) {
    const res = answerToMap(candidate);
    if (res.ok) return res;
    first = first ?? res;
  }
  return first ?? { ok: false, reason: '붙여넣은 내용이 비어 있습니다.' };
}

/** 파싱 실패 시 AI 채팅창에 다시 보낼 요청 문구 (⧉ 복사 버튼용) */
export const RETRY_REQUEST_TEXT =
  '방금 답변 전체를 다른 말 없이, ~~~ 로 시작해 ~~~ 로 끝나는 코드블록 ' +
  '하나 안에 EMM Markdown 으로 다시 출력해줘 (물결 3개 펜스 — 백틱 아님). ' +
  '중심 주제는 "# 제목" 한 줄, 하위 항목은 "##/###" 또는 "-" 목록으로.';

/** ③단계 바로가기 — 새 탭으로 여는 AI 웹 주소 (자동 입력은 하지 않는다) */
export const AI_SHORTCUTS: {
  key: string; label: string; url: string; tip?: string;
}[] = [
  { key: 'claude', label: 'Claude', url: 'https://claude.ai/new' },
  {
    key: 'chatgpt',
    label: 'ChatGPT',
    // 'EasyMindMap Copilot' 커스텀 GPT (2026-08-04 등록 —
    // easymindmap-copilot-gpt.md). EMM 템플릿이 GPT 안에 내장돼 있어
    // ① 프롬프트 복사 없이 주제만 입력해도 EMM 코드블록이 나온다.
    url: 'https://chatgpt.com/g/g-6a713796a3a48191b6099a674f0d80d2-easymindmap-copilot',
    tip: 'EasyMindMap Copilot GPT를 새 탭으로 엽니다 — EMM 템플릿이 내장돼 있어 ① 복사 없이 주제만 입력해도 됩니다',
  },
  { key: 'gemini', label: 'Gemini', url: 'https://gemini.google.com/app' },
];
