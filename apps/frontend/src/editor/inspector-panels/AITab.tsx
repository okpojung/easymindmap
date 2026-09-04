// AITab — AI 마인드맵 생성 (실동작).
//
// [생성] 프롬프트 입력 → 등록된 API 키의 AI(Anthropic/OpenAI/Gemini)에게
//   시스템 프롬프트(= EMM 템플릿, AI 설정에서 편집)와 함께 질문 → 답변
//   (EMM Markdown)을 parseEmm으로 곧바로 맵으로 변환해 연다.
//   ThinkWise식 "최대 깊이/자식 수" 옵션은 두지 않는다 — 구조는 EMM
//   템플릿 규칙과 AI가 결정한다 (2026-07 사용자 결정).
// [설정] 회사별 API 키·모델 등록 + 시스템 프롬프트(EMM 템플릿) 열람·수정.
//
// 관련 문서: docs/04-extensions/ai/18-ai.md,
//           docs/04-extensions/ai/emm-prompt-templates.md

import { useRef, useState } from 'react';
import type { ThemeTokens } from '@/components/design-tokens/theme';
import { I } from '@/components/icons';
import { InspectorSection } from './InspectorSection';
import { useAiSettingsStore } from '@/stores/aiSettingsStore';
import { AiKeyInput } from './AiKeyInput';
import { aiKeyStorageNotice } from '@/services/cloud/aiKeysSync';
import { authEnabled, useAuthStore } from '@/stores/authStore';
import { useDocumentStore, findNodeInMap } from '@/stores/documentStore';
import { useEditorUiStore } from '@/stores/editorUiStore';
import { useInteractionStore } from '@/stores/interactionStore';
import { buildExpandContext, reassignIds } from '@/utils/aiProjectContext';
import { detachFromServer } from '@/services/cloud/mapSession';
import {
  DEFAULT_MODELS,
  KEY_HELP,
  KNOWN_MODELS,
  PROVIDERS,
  PROVIDER_LABELS,
  generateWithAi,
  listGeminiModels,
  type AiProvider,
} from '@/utils/aiProviders';
import {
  resolveProvider,
  type AiProviderChoice,
} from '@/stores/aiSettingsStore';
import { GENERATION_TYPES } from '@/utils/emmSystemPrompt';
import { parseEmm } from '@/utils/importMarkdown';
import { countMapNodes } from '@/export/mapMeta';
import { WebAiPanel } from './WebAiPanel';
import { AiConfirmPopover, type ConfirmRequest } from './AiConfirmPopover';

export function AITab({ t }: { t: ThemeTokens }) {
  const [view, setView] = useState<'generate' | 'settings'>('generate');
  // Guest 체험 (2026-08-04) — API 키 등록·호출 없음: 웹 AI(클립보드
  // 왕복)만 제공하고 'AI 설정' 탭과 모드 스위치를 숨긴다.
  const guest = useAuthStore((s) => s.guest);
  const isGuest = authEnabled && guest;

  if (isGuest) {
    return (
      <div>
        <WebAiPanel t={t} />
      </div>
    );
  }

  return (
    <div>
      {/* 생성 | 설정 전환 */}
      <div style={{
        display: 'flex', gap: 4, padding: '10px 12px 0',
      }}>
        {([
          ['generate', 'AI 생성'],
          ['settings', 'AI 설정'],
        ] as const).map(([k, label]) => (
          <button
            key={k}
            data-ai-view={k}
            onClick={() => setView(k)}
            style={{
              flex: 1, padding: '7px 0', borderRadius: 7,
              border: `1.5px solid ${view === k ? t.primary : t.border}`,
              background: view === k ? t.primarySoft : t.surfaceAlt,
              color: view === k ? t.primary : t.textMuted,
              fontSize: 12, fontWeight: 700, cursor: 'pointer',
            }}
          >{label}</button>
        ))}
      </div>

      {view === 'generate'
        ? <GenerateView t={t} onNeedKey={() => setView('settings')} />
        : <SettingsView t={t} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 생성 뷰
// ---------------------------------------------------------------------------

/** 적용 버튼(새 맵 / 삽입) — 웹 AI 모드의 두 버튼과 같은 모양·같은 무게 */
function applyBtn(t: ThemeTokens, primary: boolean) {
  return {
    flex: 1, padding: '8px 0', borderRadius: 7, cursor: 'pointer',
    fontSize: 12.5, fontWeight: 700,
    border: primary ? 'none' : `1px solid ${t.primaryBorder}`,
    background: primary
      ? `linear-gradient(135deg, ${t.primary}, ${t.primaryHover})`
      : t.primarySoft,
    color: primary ? '#fff' : t.primary,
  } as const;
}

function GenerateView({ t, onNeedKey }: {
  t: ThemeTokens;
  /** 키가 없을 때 'AI 설정' 탭으로 데려간다 (2026-08-06 보고) */
  onNeedKey: () => void;
}) {
  const provider = useAiSettingsStore((s) => s.provider);
  const setProvider = useAiSettingsStore((s) => s.setProvider);
  const priority = useAiSettingsStore((s) => s.priority);
  const keys = useAiSettingsStore((s) => s.keys);
  // 생성 모드 (방법 A — web-ai-clipboard.md): 'web' = 클립보드 왕복,
  // 'api' = 기존 API 키 호출. 미선택(null)이면 키 등록 여부로 기본 결정
  const genMode = useAiSettingsStore((s) => s.genMode);
  const setGenMode = useAiSettingsStore((s) => s.setGenMode);
  const anyKey = Object.values(keys).some((k) => k?.trim());
  const mode = genMode ?? (anyKey ? 'api' : 'web');
  const models = useAiSettingsStore((s) => s.models);
  const systemPrompt = useAiSettingsStore((s) => s.systemPrompt);
  const history = useAiSettingsStore((s) => s.history);
  const pushHistory = useAiSettingsStore((s) => s.pushHistory);

  const loadMap = useDocumentStore((s) => s.loadMap);
  const map = useDocumentStore((s) => s.map);
  const appendChildren = useDocumentStore((s) => s.appendChildren);
  const setLayoutType = useEditorUiStore((s) => s.setLayoutType);
  const resetSpacing = useEditorUiStore((s) => s.resetSpacing);
  const setSelectedId = useInteractionStore((s) => s.setSelectedId);
  const selectedId = useInteractionStore((s) => s.selectedId);

  const [prompt, setPrompt] = useState('');
  const [genType, setGenType] = useState('basic');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [expandBusy, setExpandBusy] = useState(false);
  /**
   * AI 답변을 **아직 적용하지 않은 상태로** 담아 둔다 (2026-08-06).
   * 적용은 [새 맵 생성] / [선택 노드에 삽입] 중 하나를 눌러야 일어난다 —
   * 웹 AI 모드와 같은 규칙이다.
   */
  const [result, setResult] = useState<
    { md: string; map: ReturnType<typeof parseEmm>; nodeCount: number; prompt: string } | null
  >(null);

  // 확인 팝오버 — 웹 AI 모드와 **같은 컴포넌트·같은 자리**
  const panelRef = useRef<HTMLDivElement>(null);
  const [confirmReq, setConfirmReq] = useState<ConfirmRequest | null>(null);
  const askConfirm = (message: string, onOk: () => void) => setConfirmReq({ message, onOk });

  const selectedNode = findNodeInMap(map, selectedId);

  // '자동'은 우선순위 순서에서 키가 등록된 첫 회사로 해석
  const effective = resolveProvider(provider, priority, keys);
  const hasKey = !!keys[effective]?.trim();

  /**
   * ① AI 에게 묻는다 — **바로 열지 않는다** (2026-08-06 사용자 결정).
   *
   * 예전에는 호출이 끝나면 곧바로 `window.confirm` 하나 띄우고 새 맵으로
   * 열어 버렸다. 그래서 **"이 답을 노드에 붙일까?"를 고를 기회가 없었다.**
   * 웹 AI 모드는 진작 두 갈래(새 맵 / 선택 노드에 삽입)를 사용자가 고르게
   * 다듬어 두었는데(#196·#197·#198), API 키 모드만 그대로 남아 있었다.
   * 이제 답변을 **미리보기로 잡아 두고**, 적용은 아래 두 버튼 중 하나를
   * 눌러야 일어난다 — 두 모드의 규칙이 같아졌다.
   */
  const run = async () => {
    const q = prompt.trim();
    if (!q || busy) return;
    setError('');
    setResult(null);
    setBusy(true);
    try {
      const addition = GENERATION_TYPES.find((g) => g.key === genType)?.addition ?? '';
      const system = addition ? `${systemPrompt}\n\n${addition}` : systemPrompt;
      const md = await generateWithAi(
        effective, keys[effective],
        models[effective] || DEFAULT_MODELS[effective], system, q,
      );
      // blockPlacement 'node' — 문단·코드·표를 노드 본문에 (웹 AI 모드
      // answerToMap·MD 불러오기 기본과 동일, 템플릿 v4 규칙 4와 한 쌍)
      const map = parseEmm(md, 'AI 생성 맵', { blockPlacement: 'node' });
      if (!map) {
        throw new Error('답변에서 마인드맵 구조를 인식하지 못했습니다 — 다시 시도해 보세요');
      }
      setResult({ md, map, nodeCount: countMapNodes(map), prompt: q });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  /** ②-A 새 맵으로 열기 — 확인 후 실행 */
  const applyAsNewMap = () => {
    if (!result) return;
    // **"Ctrl+Z 로 되돌릴 수 있다"고 하지 않는다** (2026-08-06 3차 보고).
    // #210 에서 AI 경로가 `resetHistory: true` 가 되면서 그 약속이 사실이
    // 아니게 됐는데 문구만 남아 있었다.
    askConfirm(
      `현재 맵을 닫고 AI가 생성한 맵(${result.nodeCount}개 노드)을 열까요?\n`
      + '새 문서로 열리므로 되돌리기(Ctrl+Z)로는 지금 맵으로 돌아올 수 없습니다 —\n'
      + '저장하지 않은 편집이 있으면 먼저 ☁ 저장하세요.',
      () => {
        // **서버 맵 연결을 먼저 끊는다** — 끊지 않으면 자동저장이 조금 전까지
        // 열어 두었던 서버 맵을 이 AI 맵으로 덮어쓴다 (2026-08-05 저장 감사).
        detachFromServer();
        // 새 문서다 — 되돌리기가 이전 맵으로 넘어가면 안 된다 (2026-08-06)
        loadMap(result.map, { resetHistory: true });
        setLayoutType('radial-right');
        resetSpacing();
        setSelectedId('root');
        pushHistory({
          prompt: result.prompt,
          at: new Date().toISOString(),
          nodes: result.nodeCount,
          provider: effective,
        });
        setPrompt('');
        setResult(null);
      },
    );
  };

  /**
   * ②-B 선택 노드 하위로 삽입 — 확인 후 실행.
   *
   * 노드를 안 고르고 눌러도 **조용히 무시하지 않는다** — 왜 안 되는지
   * 말해 준다 (웹 AI 모드와 같은 규칙, 2026-08-05 보고).
   */
  const applyToSelected = () => {
    if (!result) return;
    if (!selectedId || !selectedNode) {
      setError('먼저 맵에서 삽입할 노드를 클릭해 선택하세요 — 그 노드의 하위로 추가됩니다.');
      return;
    }
    setError('');
    // 답변 맨 앞의 # 줄은 제거하고 타깃 제목으로 감싸 자식만 꺼낸다
    const body = result.md.trim().replace(/^\s*#\s[^\n]*\n+/, '');
    const wrapped = `# ${selectedNode.text || '노드'}\n\n${body}`;
    const parsed = parseEmm(wrapped, '삽입', { blockPlacement: 'node' });
    const kids = parsed ? reassignIds(parsed.branches as never) : [];
    if (!kids.length) {
      setError('답변에서 하위 구조를 인식하지 못했습니다 — 다시 생성해 보세요.');
      return;
    }
    askConfirm(
      `'${selectedNode.text || '노드'}' 아래에 ${kids.length}개 항목을 추가할까요?\n`
      + '(실행 취소 Ctrl+Z 로 되돌릴 수 있습니다)',
      () => {
        appendChildren(selectedId, kids as never);
        setSelectedId(selectedId);
        pushHistory({
          prompt: `[삽입] ${result.prompt}`,
          at: new Date().toISOString(),
          nodes: kids.length,
          provider: effective,
        });
        setResult(null);
      },
    );
  };

  // 선택 노드 확장 — (루트 프로젝트 지침 + 프로젝트 소스 + 직계 조상
  // 경로 + 이 노드)를 캐싱 호출해 답변을 이 노드의 하위로 붙인다.
  // (ai-project-workspace.md MVP). AI/사용자가 만든 노드 무관.
  const runExpand = async () => {
    if (!selectedId || !selectedNode || expandBusy) return;
    setError('');
    setExpandBusy(true);
    try {
      // 입력창에 적어 둔 질문이 있으면 **함께 보낸다** (2026-08-06 보고 —
      // 적어 둔 질문이 무시돼 맵 문맥대로만 나왔다)
      const ctx = buildExpandContext(map, selectedId, systemPrompt, prompt);
      if (!ctx) throw new Error('선택한 노드를 찾지 못했습니다');
      const md = await generateWithAi(
        effective, keys[effective],
        models[effective] || DEFAULT_MODELS[effective],
        ctx.system, ctx.user, { cacheSystem: true },
      );
      // 확장 답변은 ## 하위 구조만 온다 — 혹시 온 # 줄은 제거하고,
      // 타깃 제목으로 감싼 뒤 파싱해 그 자식(branches)을 꺼낸다.
      const body = md.trim().replace(/^\s*#\s[^\n]*\n+/, '');
      const wrapped = `# ${ctx.targetText}\n\n${body}`;
      const parsed = parseEmm(wrapped, '확장', { blockPlacement: 'node' });
      const kids = parsed ? reassignIds(parsed.branches as never) : [];
      if (!kids.length) {
        throw new Error('확장 결과에서 하위 구조를 인식하지 못했습니다 — 다시 시도해 보세요');
      }
      const ok = window.confirm(
        `'${ctx.targetText}' 아래에 AI가 만든 세부 ${kids.length}개 항목을 추가할까요?\n` +
        '(실행 취소 Ctrl+Z 로 되돌릴 수 있습니다)',
      );
      if (!ok) return;
      appendChildren(selectedId, kids as never);
      setSelectedId(selectedId);
      pushHistory({
        prompt: `[확장] ${ctx.targetText}`,
        at: new Date().toISOString(),
        nodes: kids.length,
        provider: effective,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setExpandBusy(false);
    }
  };

  // 모드 스위치 — [🌐 웹 AI (키 불필요)] / [🔑 API 키]
  const modeSwitch = (
    <div style={{ display: 'flex', gap: 4, padding: '10px 12px 0' }}>
      {([
        ['web', '🌐 웹 AI (키 불필요)'],
        ['api', '🔑 API 키'],
      ] as const).map(([k, label]) => (
        <button
          key={k}
          data-ai-mode={k}
          onClick={() => setGenMode(k)}
          title={k === 'web'
            ? 'Claude·ChatGPT·Gemini 웹 구독으로 맵 생성 (복사 2번, API 키 불필요)'
            : '등록한 API 키로 앱 안에서 바로 생성'}
          style={{
            flex: 1, padding: '6px 0', borderRadius: 7,
            border: `1.5px solid ${mode === k ? t.primary : t.border}`,
            background: mode === k ? t.primarySoft : t.surfaceAlt,
            color: mode === k ? t.primary : t.textMuted,
            fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
          }}
        >{label}</button>
      ))}
    </div>
  );

  if (mode === 'web') {
    return (
      <div>
        {modeSwitch}
        <WebAiPanel t={t} />
      </div>
    );
  }

  return (
    <div ref={panelRef}>
      {/* 확인 팝오버 — 웹 AI 모드와 **같은 컴포넌트·같은 자리** */}
      <AiConfirmPopover
        t={t} panelRef={panelRef} req={confirmReq} testId="aiapi"
        onClose={() => setConfirmReq(null)} />
      {modeSwitch}
      <InspectorSection t={t} title="AI 마인드맵 생성">
        <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
          <div style={{ flex: 1.4 }}>
            <div style={{ fontSize: 10.5, color: t.textSubtle, marginBottom: 3 }}>AI</div>
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value as AiProviderChoice)}
              title="답변을 요청할 AI (키 등록·우선순위는 AI 설정에서)"
              style={selectStyle(t)}
            >
              <option value="auto">
                자동 — 우선순위 순 ({PROVIDER_LABELS[effective].split(' ')[0]})
              </option>
              {PROVIDERS.map((p) => (
                <option key={p} value={p}>
                  {PROVIDER_LABELS[p]}{keys[p]?.trim() ? '' : ' — 키 미등록'}
                </option>
              ))}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10.5, color: t.textSubtle, marginBottom: 3 }}>생성 유형</div>
            <select
              value={genType}
              onChange={(e) => setGenType(e.target.value)}
              title="EMM 템플릿에 덧붙일 용도별 추가 지시"
              style={selectStyle(t)}
            >
              {GENERATION_TYPES.map((g) => (
                <option key={g.key} value={g.key}>{g.label}</option>
              ))}
            </select>
          </div>
        </div>

        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={'웹 채팅에 질문하듯 입력하세요 — 답변이 그대로 맵이 됩니다.\n예: Docker로 WordPress 설치 절차를 정리해줘'}
          style={{
            width: '100%', boxSizing: 'border-box', padding: 10,
            fontSize: 12.5, borderRadius: 7, resize: 'vertical',
            minHeight: 96, outline: 'none',
            background: t.surfaceAlt, color: t.text,
            border: `1px solid ${t.border}`,
            fontFamily: 'inherit',
          }} />

        <div style={{ fontSize: 10.5, color: t.textSubtle, margin: '4px 0 0', lineHeight: 1.5 }}>
          질문에는 항상 <b>EMM 프롬프트 템플릿</b>이 함께 전달됩니다
          (AI 설정에서 열람·수정).
        </div>

        {error && (
          <div data-ai-error style={{
            marginTop: 8, padding: '8px 10px', borderRadius: 6,
            background: '#FEF2F2', border: '1px solid #FECACA',
            color: '#B91C1C', fontSize: 11.5, lineHeight: 1.5,
            wordBreak: 'break-all',
          }}>{error}</div>
        )}

        {/* **키가 없으면 이 버튼이 'AI 설정'으로 데려간다** (2026-08-06 보고).
            예전에는 `disabled` 라서 눌러도 아무 일이 없었다 — 버튼에
            "API 키를 등록하세요"라고 적혀 있어도, 누르면 반응이 없으니
            **고장으로 보인다.** 안내는 길이 있어야 안내다. */}
        <button
          onClick={hasKey ? run : onNeedKey}
          disabled={hasKey && (busy || !prompt.trim())}
          data-ai-generate
          title={hasKey
            ? 'AI에게 질문하고 답변을 맵으로 변환'
            : '눌러서 AI 설정으로 이동 — API 키를 먼저 등록하세요'}
          style={{
            width: '100%', marginTop: 8, padding: 9,
            background: busy || !hasKey
              ? t.surfaceAlt
              : `linear-gradient(135deg, ${t.primary}, ${t.primaryHover})`,
            color: busy ? t.textSubtle : hasKey ? '#fff' : t.primary,
            border: busy || !hasKey ? `1px solid ${hasKey ? t.border : t.primaryBorder}` : 'none',
            borderRadius: 7,
            fontSize: 13, fontWeight: 600,
            cursor: hasKey && (busy || !prompt.trim()) ? 'default' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}>
          <I.Sparkles size={14} />
          {busy ? 'AI 답변을 기다리는 중…'
            : hasKey ? '① AI에게 물어보기' : '🔑 API 키를 등록하세요 — 눌러서 AI 설정으로'}
        </button>

        {/* ② **답변을 어디에 넣을지 고른다** (2026-08-06 사용자 결정).
            웹 AI 모드와 같은 두 갈래·같은 확인 절차다. 어느 쪽도 기본
            선택이 아니다 — 누르는 순간에만 반영된다. */}
        {result && (
          <div data-ai-result style={{ marginTop: 9 }}>
            <div style={{
              fontSize: 11, color: t.text, background: t.surfaceAlt,
              border: `1px solid ${t.border}`, borderRadius: 6,
              padding: '7px 9px', lineHeight: 1.55,
            }}>
              ✨ 답변을 받았습니다 — <b>{result.nodeCount}개 노드</b>.
              아래에서 <b>어디에 넣을지</b> 골라 주세요.
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              <button
                data-ai-apply-newmap
                onClick={applyAsNewMap}
                title="현재 맵을 닫고 새 맵으로 엽니다 (확인 후 실행)"
                style={applyBtn(t, true)}
              >② 새 맵 생성</button>
              {/* 노드를 안 골랐어도 **버튼은 보인다** — 누르면 노드를
                  먼저 고르라고 알려 준다 (웹 AI 모드와 같은 규칙) */}
              <button
                data-ai-apply-insert
                onClick={applyToSelected}
                title={selectedNode
                  ? `답변을 '${selectedNode.text}' 노드의 하위로 추가합니다 (확인 후 실행)`
                  : '맵에서 노드를 먼저 선택하세요 — 그 노드의 하위로 추가됩니다'}
                style={applyBtn(t, false)}
              >선택 노드에 삽입</button>
            </div>
            <button
              data-ai-result-discard
              onClick={() => setResult(null)}
              style={{
                marginTop: 5, background: 'none', border: 'none', padding: 0,
                color: t.textSubtle, fontSize: 10.5, cursor: 'pointer',
                textDecoration: 'underline',
              }}>이 답변 버리기</button>
          </div>
        )}
        {!hasKey && (
          <div data-ai-nokey style={{
            marginTop: 6, fontSize: 10.5, color: t.textSubtle, lineHeight: 1.55,
          }}>
            <b>API 키 방식</b>은 내 키로 AI를 직접 부릅니다 (요금은 그 AI 회사에
            냅니다). 키가 없으면 위 <b>🌐 웹 AI</b> 를 쓰세요 — <b>키 없이</b>
            ChatGPT·Claude 같은 창에 붙여넣고 답을 되가져오는 방식입니다.
          </div>
        )}
      </InspectorSection>

      <InspectorSection t={t} title="선택 노드 자세히 확장">
        <div style={{ fontSize: 10.5, color: t.textSubtle, lineHeight: 1.5, marginBottom: 6 }}>
          맵에서 노드를 고르고 누르면, <b>중심 주제(프로젝트 지침) + 상위
          경로 + 이 노드</b>를 AI에게 보내 <b>세부 내용을 하위 노드로</b>
          채웁니다. AI가 만든 노드든 직접 만든 노드든 상관없습니다.
          <br />
          <b>위 입력창에 적은 요청도 함께 보냅니다</b> — 맵 문맥과 다르면
          <b>적은 요청을 따릅니다</b>. 맵 문맥만으로 확장하려면 입력창을
          비우세요. (2026-08-06)
</div>
        <div data-ai-expand-target style={{
          fontSize: 11.5, padding: '6px 9px', borderRadius: 6, marginBottom: 6,
          background: t.surfaceAlt, border: `1px solid ${t.border}`,
          color: selectedNode ? t.text : t.textSubtle,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {selectedNode
            ? `대상: ${selectedNode.text || '(빈 노드)'}`
            : '맵에서 확장할 노드를 선택하세요'}
        </div>
        {/* 위 버튼과 같은 규칙 — 키가 없으면 눌러서 'AI 설정'으로 간다 */}
        <button
          onClick={hasKey ? runExpand : onNeedKey}
          disabled={hasKey && (expandBusy || !selectedNode)}
          data-ai-expand
          title={!hasKey ? '눌러서 AI 설정으로 이동 — API 키를 먼저 등록하세요'
            : !selectedNode ? '맵에서 노드를 선택하세요'
              : '선택 노드를 AI로 상세 확장 (하위 노드 추가)'}
          style={{
            width: '100%', padding: 9,
            background: expandBusy || !selectedNode || !hasKey ? t.surfaceAlt : t.primarySoft,
            color: expandBusy || !selectedNode || !hasKey ? t.textSubtle : t.primary,
            border: `1px solid ${expandBusy || !selectedNode || !hasKey ? t.border : t.primaryBorder + '40'}`,
            borderRadius: 7, fontSize: 12.5, fontWeight: 700,
            cursor: hasKey && (expandBusy || !selectedNode) ? 'default' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}>
          <I.Sparkles size={13} />
          {expandBusy ? 'AI가 확장 중…'
            : hasKey ? '선택 노드 자세히 확장' : '🔑 API 키를 등록하세요 — 눌러서 AI 설정으로'}
        </button>
        <ExpandHelp t={t} />
      </InspectorSection>

      <InspectorSection t={t} title="최근 생성 기록">
        {history.length === 0 && (
          <div style={{ fontSize: 11, color: t.textSubtle, lineHeight: 1.5 }}>
            아직 생성 기록이 없습니다. 프롬프트를 입력하고 'AI로 맵
            생성'을 눌러 보세요.
          </div>
        )}
        {history.map((h, i) => (
          <div
            key={i}
            onClick={() => setPrompt(h.prompt)}
            title="클릭하면 프롬프트 입력창에 다시 채웁니다"
            style={{
              padding: '8px 10px', borderRadius: 6,
              background: t.surfaceAlt, border: `1px solid ${t.border}`,
              marginBottom: 5, cursor: 'pointer',
            }}>
            <div style={{
              fontSize: 12, color: t.text, fontWeight: 500, marginBottom: 3,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{h.prompt}</div>
            <div style={{ fontSize: 10.5, color: t.textSubtle, display: 'flex', gap: 8 }}>
              <span>{new Date(h.at).toLocaleString('ko-KR')}</span>
              <span>·</span>
              <span>{h.nodes} 노드</span>
              <span>·</span>
              <span>{PROVIDER_LABELS[h.provider]}</span>
            </div>
          </div>
        ))}
      </InspectorSection>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 설정 뷰 — API 키·모델 + 시스템 프롬프트(EMM 템플릿)
// ---------------------------------------------------------------------------

function SettingsView({ t }: { t: ThemeTokens }) {
  const keys = useAiSettingsStore((s) => s.keys);
  const models = useAiSettingsStore((s) => s.models);
  const priority = useAiSettingsStore((s) => s.priority);
  const movePriority = useAiSettingsStore((s) => s.movePriority);
  const setModel = useAiSettingsStore((s) => s.setModel);
  // 계정 보관 상태 — 안내 문장이 이것을 따라 바뀐다 (2026-09-04)
  const keyServer = useAiSettingsStore((s) => s.server);
  const systemPrompt = useAiSettingsStore((s) => s.systemPrompt);
  const setSystemPrompt = useAiSettingsStore((s) => s.setSystemPrompt);
  const resetSystemPrompt = useAiSettingsStore((s) => s.resetSystemPrompt);

  return (
    <div>
      <InspectorSection t={t} title="사용 우선순위">
        <div style={{ fontSize: 10.5, color: t.textSubtle, marginBottom: 8, lineHeight: 1.5 }}>
          키를 여러 개 등록했을 때 어떤 AI를 먼저 쓸지의 순서입니다 —
          생성 화면의 <b>'자동'</b>은 이 순서에서 키가 등록된 첫 회사를
          사용합니다.
        </div>
        {priority.map((p, i) => (
          <div key={p} data-ai-priority={p} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 8px', borderRadius: 6, marginBottom: 4,
            background: t.surfaceAlt, border: `1px solid ${t.border}`,
          }}>
            <span style={{
              width: 18, height: 18, borderRadius: 9, flexShrink: 0,
              background: t.primarySoft, color: t.primary,
              fontSize: 10.5, fontWeight: 800,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>{i + 1}</span>
            <span style={{ flex: 1, fontSize: 11.5, fontWeight: 600, color: t.text }}>
              {PROVIDER_LABELS[p]}
              {!keys[p]?.trim() && (
                <span style={{ color: t.textSubtle, fontWeight: 400 }}> — 키 미등록</span>
              )}
            </span>
            <button
              onClick={() => movePriority(p, -1)}
              disabled={i === 0}
              title="우선순위 올리기"
              data-ai-priority-up={p}
              style={priorityBtnStyle(t, i === 0)}
            >▲</button>
            <button
              onClick={() => movePriority(p, 1)}
              disabled={i === priority.length - 1}
              title="우선순위 내리기"
              style={priorityBtnStyle(t, i === priority.length - 1)}
            >▼</button>
          </div>
        ))}
      </InspectorSection>

      <InspectorSection t={t} title="API 키 등록">
        {/* 어디에 보관되는지는 서버 상태가 정한다 — 계정(암호화) / 브라우저만.
            입력칸은 계정 메뉴의 'AI API 키' 와 같은 컴포넌트다 (2026-09-04) */}
        <div data-ai-key-notice style={{
          fontSize: 10.5, color: keyServer.enabled === false ? '#B45309' : t.textSubtle,
          marginBottom: 8, lineHeight: 1.5,
        }}>
          {aiKeyStorageNotice()}
        </div>
        {keyServer.error && (
          <div data-ai-key-error style={{
            fontSize: 10.5, color: '#B91C1C', marginBottom: 8, lineHeight: 1.5,
          }}>{keyServer.error}</div>
        )}
        {PROVIDERS.map((p) => (
          <AiKeyInput key={p} t={t} p={p}>
            <ModelPicker t={t} p={p} value={models[p]} onChange={(m) => setModel(p, m)} />
            <KeyHelp t={t} p={p} />
          </AiKeyInput>
        ))}
      </InspectorSection>

      <InspectorSection t={t} title="EMM 프롬프트 템플릿 (시스템 프롬프트)">
        <div style={{ fontSize: 10.5, color: t.textSubtle, marginBottom: 6, lineHeight: 1.5 }}>
          질문할 때 <b>항상 기본으로</b> AI에게 함께 전달되는 규칙입니다 —
          답변이 그대로 맵으로 변환되게 합니다. 필요하면 수정할 수
          있습니다 (docs/04-extensions/ai/emm-prompt-templates.md 참조).
        </div>
        <textarea
          value={systemPrompt}
          data-ai-system-prompt
          onChange={(e) => setSystemPrompt(e.target.value)}
          rows={14}
          style={{
            width: '100%', boxSizing: 'border-box', padding: 10,
            fontSize: 11, lineHeight: 1.55, borderRadius: 7,
            resize: 'vertical', outline: 'none',
            background: t.surfaceAlt, color: t.text,
            border: `1px solid ${t.border}`,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          }} />
        <button
          onClick={() => {
            if (window.confirm('시스템 프롬프트를 기본 EMM 템플릿으로 되돌릴까요?')) {
              resetSystemPrompt();
            }
          }}
          style={{
            marginTop: 6, padding: '6px 12px', borderRadius: 6,
            border: `1px solid ${t.border}`, background: t.surface,
            color: t.textMuted, fontSize: 11.5, fontWeight: 600, cursor: 'pointer',
          }}>기본 템플릿 복원</button>
      </InspectorSection>
    </div>
  );
}

// 모델 선택 — 알려진 모델 목록(기본 표시) + '직접 입력…'.
// Gemini는 구글이 구형 모델을 빠르게 은퇴시키므로(2026-07: 2.5-flash도
// 신규 사용자 404) '지금 키로 사용 가능한 모델 불러오기'로 실시간
// 목록을 조회해 고를 수 있다.
function ModelPicker({
  t, p, value, onChange,
}: {
  t: ThemeTokens;
  p: AiProvider;
  value: string;
  onChange: (m: string) => void;
}) {
  const [fetched, setFetched] = useState<string[] | null>(null);
  const [fetchMsg, setFetchMsg] = useState('');
  const known = fetched ?? KNOWN_MODELS[p];
  const isKnown = known.includes(value);
  const [custom, setCustom] = useState(!isKnown && !!value);

  return (
    <div style={{ marginTop: 4 }}>
      <select
        value={custom || !isKnown ? '__custom__' : value}
        data-ai-model-select={p}
        onChange={(e) => {
          if (e.target.value === '__custom__') {
            setCustom(true);
          } else {
            setCustom(false);
            onChange(e.target.value);
          }
        }}
        title="사용할 모델 — 목록에 없는 새 모델은 '직접 입력'"
        style={{
          width: '100%', padding: '5px 8px', borderRadius: 6,
          border: `1px solid ${t.border}`,
          background: t.surface, color: t.textMuted, fontSize: 11,
          fontFamily: 'ui-monospace, monospace',
        }}
      >
        {known.map((m) => (
          <option key={m} value={m}>
            {m}{m === DEFAULT_MODELS[p] ? ' (기본)' : ''}
          </option>
        ))}
        <option value="__custom__">직접 입력…</option>
      </select>
      {p === 'gemini' && (
        <>
          <button
            data-ai-model-refresh="gemini"
            title="등록한 Gemini 키로 지금 실제 호출 가능한 모델 목록을 조회합니다 — 구글이 구형 모델을 없애 404가 날 때 여기서 현재 모델을 고르세요"
            onClick={() => {
              const key = useAiSettingsStore.getState().keys.gemini;
              setFetchMsg('불러오는 중…');
              void listGeminiModels(key)
                .then((list) => {
                  setFetched(list);
                  setFetchMsg(`이 키로 사용 가능한 모델 ${list.length}개`);
                })
                .catch((e: Error) => setFetchMsg(e.message || String(e)));
            }}
            style={{
              marginTop: 4, padding: '3px 8px', borderRadius: 5,
              border: `1px solid ${t.border}`, background: t.surface,
              color: t.textMuted, fontSize: 10.5, fontWeight: 600,
              cursor: 'pointer',
            }}
          >↻ 지금 키로 사용 가능한 모델 불러오기</button>
          {fetchMsg && (
            <div data-ai-model-refresh-msg style={{
              fontSize: 10, color: t.textSubtle, marginTop: 3, lineHeight: 1.4,
            }}>{fetchMsg}</div>
          )}
        </>
      )}
      {(custom || !isKnown) && (
        <input
          value={value}
          data-ai-model={p}
          onChange={(e) => onChange(e.target.value)}
          placeholder={`모델 이름 (예: ${DEFAULT_MODELS[p]})`}
          style={{
            width: '100%', boxSizing: 'border-box', padding: '5px 9px',
            marginTop: 4,
            borderRadius: 6, border: `1px solid ${t.border}`,
            background: t.surfaceAlt, color: t.text, fontSize: 11,
            outline: 'none', fontFamily: 'ui-monospace, monospace',
          }} />
      )}
    </div>
  );
}

// 선택 노드 확장 — 프로젝트 지침·@소스·전달 범위 도움말 (접이식)
function ExpandHelp({ t }: { t: ThemeTokens }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginTop: 6 }}>
      <button
        onClick={() => setOpen(!open)}
        data-ai-expand-help
        style={{
          padding: '3px 8px', borderRadius: 5,
          border: `1px solid ${t.border}`, background: t.surface,
          color: t.textMuted, fontSize: 10.5, fontWeight: 600, cursor: 'pointer',
        }}
      >
        {open ? '▾' : '▸'} 프로젝트 지침·소스 설정 방법
      </button>
      {open && (
        <div style={{
          marginTop: 5, padding: '8px 10px', borderRadius: 6,
          background: t.surfaceAlt, border: `1px solid ${t.border}`,
          fontSize: 10.5, color: t.textMuted, lineHeight: 1.6,
        }}>
          <div style={{ marginBottom: 5 }}>
            <b style={{ color: t.text }}>① 프로젝트 지침</b> — <b>중심 주제
            노드의 노트</b>에 적습니다(중심 주제 선택 → 노트·태그 탭 →
            문단 노트). 모든 확장에 공통 지시로 함께 전달됩니다.
          </div>
          <div style={{ marginBottom: 5 }}>
            <b style={{ color: t.text }}>② 소스(참고 자료)</b> — 중심 주제
            바로 아래(<b>2레벨</b>)에 <b>제목에 <code>@소스</code>가 들어간
            노드</b>를 만들고, 그 노드의 <b>텍스트·노트·하위 노드</b>에
            참고 내용을 적습니다. 확장할 때 자동으로 함께 참고합니다.
          </div>
          <div>
            <b style={{ color: t.text }}>전달되는 것 = 글(텍스트)뿐</b>입니다.
            PDF·이미지 첨부와 하이퍼링크는 AI가 열지 못하므로 참고되지
            않습니다 — 필요한 내용은 <b>글로 적어</b> 두세요.
          </div>
        </div>
      )}
    </div>
  );
}

// API 키 발급 방법 도움말 — 접었다 펴는 단계 안내 (IT 초보자용)
function KeyHelp({ t, p }: { t: ThemeTokens; p: AiProvider }) {
  const [open, setOpen] = useState(false);
  const help = KEY_HELP[p];
  return (
    <div style={{ marginTop: 4 }}>
      <button
        onClick={() => setOpen(!open)}
        data-ai-key-help={p}
        style={{
          padding: '3px 8px', borderRadius: 5,
          border: `1px solid ${t.border}`, background: t.surface,
          color: t.textMuted, fontSize: 10.5, fontWeight: 600, cursor: 'pointer',
        }}
      >
        {open ? '▾' : '▸'} 키 발급 방법 (처음이신가요?)
      </button>
      {open && (
        <div style={{
          marginTop: 5, padding: '8px 10px', borderRadius: 6,
          background: t.surfaceAlt, border: `1px solid ${t.border}`,
          fontSize: 10.5, color: t.textMuted, lineHeight: 1.6,
        }}>
          <div style={{ marginBottom: 4 }}>
            발급 페이지:{' '}
            <a
              href={help.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: t.primary, fontWeight: 600, wordBreak: 'break-all' }}
            >{help.url}</a>
          </div>
          <ol style={{ margin: 0, paddingLeft: 16 }}>
            {help.steps.map((s2, i) => (
              <li key={i} style={{ marginBottom: 2 }}>{s2}</li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

function priorityBtnStyle(t: ThemeTokens, disabled: boolean) {
  return {
    width: 22, height: 20, borderRadius: 4,
    border: `1px solid ${t.border}`,
    background: t.surface, color: disabled ? t.textSubtle : t.text,
    fontSize: 9, cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.4 : 1,
    padding: 0,
  } as const;
}

function selectStyle(t: ThemeTokens) {
  return {
    width: '100%', padding: '5px 8px', borderRadius: 5,
    border: `1px solid ${t.border}`,
    background: t.surface, color: t.text,
    fontSize: 12, fontFamily: 'inherit' as const,
  };
}
