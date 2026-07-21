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

import { useState } from 'react';
import type { ThemeTokens } from '@/components/design-tokens/theme';
import { I } from '@/components/icons';
import { InspectorSection } from './InspectorSection';
import { useAiSettingsStore } from '@/stores/aiSettingsStore';
import { useDocumentStore } from '@/stores/documentStore';
import { useEditorUiStore } from '@/stores/editorUiStore';
import { useInteractionStore } from '@/stores/interactionStore';
import {
  DEFAULT_MODELS,
  KEY_HELP,
  KNOWN_MODELS,
  PROVIDERS,
  PROVIDER_LABELS,
  generateWithAi,
  type AiProvider,
} from '@/utils/aiProviders';
import {
  resolveProvider,
  type AiProviderChoice,
} from '@/stores/aiSettingsStore';
import { GENERATION_TYPES } from '@/utils/emmSystemPrompt';
import { parseEmm } from '@/utils/importMarkdown';
import { countMapNodes } from '@/export/mapMeta';

export function AITab({ t }: { t: ThemeTokens }) {
  const [view, setView] = useState<'generate' | 'settings'>('generate');

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

      {view === 'generate' ? <GenerateView t={t} /> : <SettingsView t={t} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 생성 뷰
// ---------------------------------------------------------------------------

function GenerateView({ t }: { t: ThemeTokens }) {
  const provider = useAiSettingsStore((s) => s.provider);
  const setProvider = useAiSettingsStore((s) => s.setProvider);
  const priority = useAiSettingsStore((s) => s.priority);
  const keys = useAiSettingsStore((s) => s.keys);
  const models = useAiSettingsStore((s) => s.models);
  const systemPrompt = useAiSettingsStore((s) => s.systemPrompt);
  const history = useAiSettingsStore((s) => s.history);
  const pushHistory = useAiSettingsStore((s) => s.pushHistory);

  const loadMap = useDocumentStore((s) => s.loadMap);
  const setLayoutType = useEditorUiStore((s) => s.setLayoutType);
  const resetSpacing = useEditorUiStore((s) => s.resetSpacing);
  const setSelectedId = useInteractionStore((s) => s.setSelectedId);

  const [prompt, setPrompt] = useState('');
  const [genType, setGenType] = useState('basic');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // '자동'은 우선순위 순서에서 키가 등록된 첫 회사로 해석
  const effective = resolveProvider(provider, priority, keys);
  const hasKey = !!keys[effective]?.trim();

  const run = async () => {
    const q = prompt.trim();
    if (!q || busy) return;
    setError('');
    setBusy(true);
    try {
      const addition = GENERATION_TYPES.find((g) => g.key === genType)?.addition ?? '';
      const system = addition ? `${systemPrompt}\n\n${addition}` : systemPrompt;
      const md = await generateWithAi(
        effective, keys[effective],
        models[effective] || DEFAULT_MODELS[effective], system, q,
      );
      const map = parseEmm(md, 'AI 생성 맵');
      if (!map) {
        throw new Error('답변에서 마인드맵 구조를 인식하지 못했습니다 — 다시 시도해 보세요');
      }
      const ok = window.confirm(
        `현재 맵을 닫고 AI가 생성한 맵(${countMapNodes(map)}개 노드)을 열까요?\n` +
        '(실행 취소 Ctrl+Z 로 이전 맵으로 되돌릴 수 있습니다)',
      );
      if (!ok) return;
      loadMap(map);
      setLayoutType('radial-right');
      resetSpacing();
      setSelectedId('root');
      pushHistory({
        prompt: q,
        at: new Date().toISOString(),
        nodes: countMapNodes(map),
        provider: effective,
      });
      setPrompt('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
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

        <button
          onClick={run}
          disabled={busy || !prompt.trim() || !hasKey}
          data-ai-generate
          title={hasKey ? 'AI에게 질문하고 답변을 맵으로 변환' : 'AI 설정에서 API 키를 먼저 등록하세요'}
          style={{
            width: '100%', marginTop: 8, padding: 9,
            background: busy || !hasKey
              ? t.surfaceAlt
              : `linear-gradient(135deg, ${t.primary}, ${t.primaryHover})`,
            color: busy || !hasKey ? t.textSubtle : '#fff',
            border: busy || !hasKey ? `1px solid ${t.border}` : 'none',
            borderRadius: 7,
            fontSize: 13, fontWeight: 600,
            cursor: busy || !prompt.trim() || !hasKey ? 'default' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}>
          <I.Sparkles size={14} />
          {busy ? 'AI 답변을 기다리는 중…' : hasKey ? 'AI로 맵 생성' : 'API 키를 등록하세요 (AI 설정)'}
        </button>
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
  const setKey = useAiSettingsStore((s) => s.setKey);
  const setModel = useAiSettingsStore((s) => s.setModel);
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
        <div style={{ fontSize: 10.5, color: t.textSubtle, marginBottom: 8, lineHeight: 1.5 }}>
          키는 이 브라우저(localStorage)에만 저장되며, 질문할 때 해당 AI
          사에만 전달됩니다.
        </div>
        {PROVIDERS.map((p) => (
          <div key={p} style={{ marginBottom: 12 }}>
            <div style={{
              fontSize: 11, fontWeight: 700, color: t.text, marginBottom: 4,
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              {PROVIDER_LABELS[p]}
              {keys[p]?.trim() && (
                <span style={{
                  fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 3,
                  background: '#DCFCE7', color: '#15803D',
                }}>등록됨</span>
              )}
            </div>
            <input
              type="password"
              data-ai-key={p}
              value={keys[p]}
              onChange={(e) => setKey(p, e.target.value)}
              placeholder={
                p === 'anthropic' ? 'sk-ant-…'
                : p === 'openai' ? 'sk-…'
                : 'AIza…'
              }
              autoComplete="off"
              style={{
                width: '100%', boxSizing: 'border-box', padding: '7px 9px',
                borderRadius: 6, border: `1px solid ${t.border}`,
                background: t.surfaceAlt, color: t.text, fontSize: 12,
                outline: 'none', fontFamily: 'ui-monospace, monospace',
              }} />
            <ModelPicker t={t} p={p} value={models[p]} onChange={(m) => setModel(p, m)} />
            <KeyHelp t={t} p={p} />
          </div>
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

// 모델 선택 — 알려진 모델 목록(기본 표시) + '직접 입력…'
function ModelPicker({
  t, p, value, onChange,
}: {
  t: ThemeTokens;
  p: AiProvider;
  value: string;
  onChange: (m: string) => void;
}) {
  const known = KNOWN_MODELS[p];
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
