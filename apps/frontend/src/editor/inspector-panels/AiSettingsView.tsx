// AiSettingsView — AI 설정 화면 (2026-09-04, 사용자 요청으로 AI 탭에서 옮김).
//
//   사용 우선순위 · API 키 등록(+모델·키 발급 방법) · EMM 프롬프트 템플릿.
//   우상단 아바타 메뉴 → 'AI 설정' 대화상자가 이것을 그린다. AI 탭에는
//   더 이상 '설정' 이 없다 — 키가 없으면 그 대화상자로 데려간다.
//
//   키는 계정에 암호화 보관(aiKeysSync), 우선순위·모델·프롬프트 템플릿도
//   계정에 저장된다 — 프로필 설정인데 브라우저마다 다르면 반쪽이다.

import { useState } from 'react';
import type { ThemeTokens } from '@/components/design-tokens/theme';
import { InspectorSection } from './InspectorSection';
import { AiKeyInput } from './AiKeyInput';
import { useAiSettingsStore } from '@/stores/aiSettingsStore';
import { aiKeyStorageNotice } from '@/services/cloud/aiKeysSync';
import {
  DEFAULT_MODELS, KEY_HELP, KNOWN_MODELS, PROVIDERS, PROVIDER_LABELS,
  listGeminiModels, type AiProvider,
} from '@/utils/aiProviders';

// ---------------------------------------------------------------------------
// 설정 뷰 — API 키·모델 + 시스템 프롬프트(EMM 템플릿)
// ---------------------------------------------------------------------------

export function AiSettingsView({ t }: { t: ThemeTokens }) {
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

