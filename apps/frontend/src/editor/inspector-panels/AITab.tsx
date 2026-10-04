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

import { Fragment, useRef, useState, type ReactNode } from 'react';
import type { ThemeTokens } from '@/components/design-tokens/theme';
import { I } from '@/components/icons';
import { InspectorSection } from './InspectorSection';
import { useAiSettingsStore } from '@/stores/aiSettingsStore';
import { authEnabled, useAuthStore } from '@/stores/authStore';
import { useDocumentStore, findNodeInMap } from '@/stores/documentStore';
import { useEditorUiStore } from '@/stores/editorUiStore';
import { useInteractionStore } from '@/stores/interactionStore';
import { buildExpandContext, reassignIds } from '@/utils/aiProjectContext';
import { detachFromServer } from '@/services/cloud/mapSession';
import {
  DEFAULT_MODELS,
  PROVIDERS,
  PROVIDER_LABELS,
  generateWithAi,
  type AiProvider,
} from '@/utils/aiProviders';
import {
  resolveProvider,
  type AiProviderChoice,
} from '@/stores/aiSettingsStore';
import { GENERATION_TYPES, withOutputLanguage } from '@/utils/emmSystemPrompt';
import { sourceMarker } from '@/utils/aiProjectContext';
import { LANG_LOCALE, useLang, useTr } from '@/i18n';
import { parseEmm } from '@/utils/importMarkdown';
import { countMapNodes } from '@/export/mapMeta';
import { WebAiPanel } from './WebAiPanel';
import { AiConfirmPopover, type ConfirmRequest } from './AiConfirmPopover';
import { rich } from '@/i18n/rich';


export function AITab({ t }: { t: ThemeTokens }) {
  // Guest 체험 (2026-08-04) — API 키 등록·호출 없음: 웹 AI(클립보드
  // 왕복)만 제공하고 모드 스위치를 숨긴다.
  const guest = useAuthStore((s) => s.guest);
  const isGuest = authEnabled && guest;
  // 'AI 설정' 은 이제 우상단 아바타 메뉴의 대화상자다 (2026-09-04 사용자
  // 요청 — 키·우선순위·프롬프트 템플릿은 계정 설정이지 생성 패널의 탭이
  // 아니다). 키가 없으면 거기로 데려간다.
  const openAiSettings = useEditorUiStore((s) => s.setAiSettingsOpen);

  if (isGuest) {
    return (
      <div>
        <WebAiPanel t={t} />
      </div>
    );
  }

  return (
    <div>
      <GenerateView t={t} onNeedKey={() => openAiSettings(true)} />
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
  /** 키가 없을 때 'AI 설정' 대화상자(아바타 메뉴)로 데려간다 (2026-08-06 보고) */
  onNeedKey: () => void;
}) {
  const tr = useTr();
  const lang = useLang();
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
      // 화면 언어가 한국어가 아니면 출력 언어 지시를 맨 끝에 (한국어면 그대로)
      const system = withOutputLanguage(addition ? `${systemPrompt}\n\n${addition}` : systemPrompt);
      const md = await generateWithAi(
        effective, keys[effective],
        models[effective] || DEFAULT_MODELS[effective], system, q,
      );
      // blockPlacement 'node' — 문단·코드·표를 노드 본문에 (웹 AI 모드
      // answerToMap·MD 불러오기 기본과 동일, 템플릿 v4 규칙 4와 한 쌍)
      const map = parseEmm(md, tr('inspector.ai.defaultMapTitle'), { blockPlacement: 'node' });
      if (!map) {
        throw new Error(tr('inspector.ai.noStructure'));
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
      tr('inspector.ai.confirmNewMap', { n: result.nodeCount }),
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
      setError(tr('inspector.ai.selectNodeFirst'));
      return;
    }
    setError('');
    // 답변 맨 앞의 # 줄은 제거하고 타깃 제목으로 감싸 자식만 꺼낸다
    const body = result.md.trim().replace(/^\s*#\s[^\n]*\n+/, '');
    const wrapped = `# ${selectedNode.text || '노드'}\n\n${body}`;
    const parsed = parseEmm(wrapped, '삽입', { blockPlacement: 'node' });
    const kids = parsed ? reassignIds(parsed.branches as never) : [];
    if (!kids.length) {
      setError(tr('inspector.ai.noChildren'));
      return;
    }
    askConfirm(
      tr('inspector.ai.confirmInsert', { node: selectedNode.text || tr('inspector.ai.nodeFallback'), n: kids.length }),
      () => {
        appendChildren(selectedId, kids as never);
        setSelectedId(selectedId);
        pushHistory({
          prompt: tr('inspector.ai.histInsert', { prompt: result.prompt }),
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
      if (!ctx) throw new Error(tr('inspector.ai.nodeNotFound'));
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
        throw new Error(tr('inspector.ai.expandNoChildren'));
      }
      const ok = window.confirm(
        tr('inspector.ai.confirmExpand', { node: ctx.targetText, n: kids.length }),
      );
      if (!ok) return;
      appendChildren(selectedId, kids as never);
      setSelectedId(selectedId);
      pushHistory({
        prompt: tr('inspector.ai.histExpand', { node: ctx.targetText }),
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
        ['web', tr('inspector.ai.modeWeb')],
        ['api', tr('inspector.ai.modeApi')],
      ] as const).map(([k, label]) => (
        <button
          key={k}
          data-ai-mode={k}
          onClick={() => setGenMode(k)}
          title={k === 'web'
            ? tr('inspector.ai.modeWebTitle')
            : tr('inspector.ai.modeApiTitle')}
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
      <InspectorSection t={t} title={tr('inspector.ai.genTitle')}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
          <div style={{ flex: 1.4 }}>
            <div style={{ fontSize: 10.5, color: t.textSubtle, marginBottom: 3 }}>AI</div>
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value as AiProviderChoice)}
              title={tr('inspector.ai.providerTitle')}
              style={selectStyle(t)}
            >
              <option value="auto">
                {tr('inspector.ai.autoOption', { name: PROVIDER_LABELS[effective].split(' ')[0] })}
              </option>
              {PROVIDERS.map((p) => (
                <option key={p} value={p}>
                  {PROVIDER_LABELS[p]}{keys[p]?.trim() ? '' : tr('inspector.ai.noKeySuffix')}
                </option>
              ))}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10.5, color: t.textSubtle, marginBottom: 3 }}>{tr('inspector.ai.genType')}</div>
            <select
              value={genType}
              onChange={(e) => setGenType(e.target.value)}
              title={tr('inspector.ai.genTypeTitle')}
              style={selectStyle(t)}
            >
              {GENERATION_TYPES.map((g) => (
                <option key={g.key} value={g.key}>{tr(g.label)}</option>
              ))}
            </select>
          </div>
        </div>

        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={tr('inspector.ai.promptPlaceholder')}
          style={{
            width: '100%', boxSizing: 'border-box', padding: 10,
            fontSize: 12.5, borderRadius: 7, resize: 'vertical',
            minHeight: 96, outline: 'none',
            background: t.surfaceAlt, color: t.text,
            border: `1px solid ${t.border}`,
            fontFamily: 'inherit',
          }} />

        <div style={{ fontSize: 10.5, color: t.textSubtle, margin: '4px 0 0', lineHeight: 1.5 }}>
          {rich(tr('inspector.ai.templateNote'), { tpl: <b>{tr('inspector.ai.templateName')}</b> })}
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
            ? tr('inspector.ai.askTitle')
            : tr('inspector.ai.goSettingsTitle')}
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
          {busy ? tr('inspector.ai.waiting')
            : hasKey ? tr('inspector.ai.ask') : tr('inspector.ai.needKey')}
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
              {rich(tr('inspector.ai.gotAnswer'), {
                nodes: <b>{tr('inspector.ai.nodesCount', { n: result.nodeCount })}</b>,
                where: <b>{tr('inspector.ai.whereToPut')}</b>,
              })}
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              <button
                data-ai-apply-newmap
                onClick={applyAsNewMap}
                title={tr('inspector.ai.newMapTitle')}
                style={applyBtn(t, true)}
              >{tr('inspector.ai.newMap')}</button>
              {/* 노드를 안 골랐어도 **버튼은 보인다** — 누르면 노드를
                  먼저 고르라고 알려 준다 (웹 AI 모드와 같은 규칙) */}
              <button
                data-ai-apply-insert
                onClick={applyToSelected}
                title={selectedNode
                  ? tr('inspector.ai.insertTitle', { node: selectedNode.text })
                  : tr('inspector.ai.insertNoNodeTitle')}
                style={applyBtn(t, false)}
              >{tr('inspector.ai.insert')}</button>
            </div>
            <button
              data-ai-result-discard
              onClick={() => setResult(null)}
              style={{
                marginTop: 5, background: 'none', border: 'none', padding: 0,
                color: t.textSubtle, fontSize: 10.5, cursor: 'pointer',
                textDecoration: 'underline',
              }}>{tr('inspector.ai.discard')}</button>
          </div>
        )}
        {!hasKey && (
          <div data-ai-nokey style={{
            marginTop: 6, fontSize: 10.5, color: t.textSubtle, lineHeight: 1.55,
          }}>
            {rich(tr('inspector.ai.noKeyNote'), {
              api: <b>{tr('inspector.ai.noKeyNoteApi')}</b>,
              web: <b>{tr('inspector.ai.noKeyNoteWeb')}</b>,
              nokey: <b>{tr('inspector.ai.noKeyNoteNoKey')}</b>,
            })}
          </div>
        )}
      </InspectorSection>

      <InspectorSection t={t} title={tr('inspector.ai.expandTitle')}>
        <div style={{ fontSize: 10.5, color: t.textSubtle, lineHeight: 1.5, marginBottom: 6 }}>
          {rich(tr('inspector.ai.expandHelp1'), {
            ctx: <b>{tr('inspector.ai.expandHelp1Ctx')}</b>,
            detail: <b>{tr('inspector.ai.expandHelp1Detail')}</b>,
          })}
          <br />
          {rich(tr('inspector.ai.expandHelp2'), {
            also: <b>{tr('inspector.ai.expandHelp2Also')}</b>,
            follow: <b>{tr('inspector.ai.expandHelp2Follow')}</b>,
          })}
</div>
        <div data-ai-expand-target style={{
          fontSize: 11.5, padding: '6px 9px', borderRadius: 6, marginBottom: 6,
          background: t.surfaceAlt, border: `1px solid ${t.border}`,
          color: selectedNode ? t.text : t.textSubtle,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {selectedNode
            ? tr('inspector.ai.expandTarget', { node: selectedNode.text || tr('inspector.conn.emptyNode') })
            : tr('inspector.ai.expandPick')}
        </div>
        {/* 위 버튼과 같은 규칙 — 키가 없으면 눌러서 'AI 설정'으로 간다 */}
        <button
          onClick={hasKey ? runExpand : onNeedKey}
          disabled={hasKey && (expandBusy || !selectedNode)}
          data-ai-expand
          title={!hasKey ? tr('inspector.ai.goSettingsTitle')
            : !selectedNode ? tr('inspector.ai.selectNode')
              : tr('inspector.ai.expandBtnTitle')}
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
          {expandBusy ? tr('inspector.ai.expanding')
            : hasKey ? tr('inspector.ai.expandTitle') : tr('inspector.ai.needKey')}
        </button>
        <ExpandHelp t={t} />
      </InspectorSection>

      <InspectorSection t={t} title={tr('inspector.ai.history')}>
        {history.length === 0 && (
          <div style={{ fontSize: 11, color: t.textSubtle, lineHeight: 1.5 }}>
            {tr('inspector.ai.historyEmpty')}
          </div>
        )}
        {history.map((h, i) => (
          <div
            key={i}
            onClick={() => setPrompt(h.prompt)}
            title={tr('inspector.ai.historyItemTitle')}
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
              <span>{new Date(h.at).toLocaleString(LANG_LOCALE[lang])}</span>
              <span>·</span>
              <span>{tr('inspector.ai.nodesCount', { n: h.nodes })}</span>
              <span>·</span>
              <span>{PROVIDER_LABELS[h.provider]}</span>
            </div>
          </div>
        ))}
      </InspectorSection>
    </div>
  );
}

// 선택 노드 확장 — 프로젝트 지침·@소스·전달 범위 도움말 (접이식)
function ExpandHelp({ t }: { t: ThemeTokens }) {
  const tr = useTr();
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
        {open ? '▾' : '▸'} {tr('inspector.ai.expandHelpToggle')}
      </button>
      {open && (
        <div style={{
          marginTop: 5, padding: '8px 10px', borderRadius: 6,
          background: t.surfaceAlt, border: `1px solid ${t.border}`,
          fontSize: 10.5, color: t.textMuted, lineHeight: 1.6,
        }}>
          <div style={{ marginBottom: 5 }}>
            <b style={{ color: t.text }}>{tr('inspector.ai.guide1Title')}</b>
            {rich(tr('inspector.ai.guide1'), { where: <b>{tr('inspector.ai.guide1Where')}</b> })}
          </div>
          <div style={{ marginBottom: 5 }}>
            <b style={{ color: t.text }}>{tr('inspector.ai.guide2Title')}</b>
            {rich(tr('inspector.ai.guide2'), {
              level: <b>{tr('inspector.ai.guide2Level')}</b>,
              node: <b>{rich(tr('inspector.ai.guide2Node'), { marker: <code>{sourceMarker()}</code> })}</b>,
              parts: <b>{tr('inspector.ai.guide2Parts')}</b>,
            })}
          </div>
          <div>
            {rich(tr('inspector.ai.guide3'), {
              only: <b style={{ color: t.text }}>{tr('inspector.ai.guide3Only')}</b>,
              write: <b>{tr('inspector.ai.guide3Write')}</b>,
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function selectStyle(t: ThemeTokens) {
  return {
    width: '100%', padding: '5px 8px', borderRadius: 5,
    border: `1px solid ${t.border}`,
    background: t.surface, color: t.text,
    fontSize: 12, fontFamily: 'inherit' as const,
  };
}
