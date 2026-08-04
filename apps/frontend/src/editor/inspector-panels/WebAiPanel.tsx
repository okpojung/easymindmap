// WebAiPanel — 웹 AI로 맵 만들기 (방법 A: 클립보드 왕복).
//
//   ① 프롬프트 복사 → AI 웹(Claude·ChatGPT·Gemini…)에 붙여넣고 실행
//   ② 답변 복사
//   ③ 여기 붙여넣기 → 미리보기만. **적용은 사용자가 버튼으로** 고른다
//      ('새 맵 생성' 또는 '선택 노드에 삽입' → 확인 팝오버 → 실행)
//
// 2026-08-05 실사용 보고: 붙여넣자마자 자동 실행되고 대상이 미리 골라져
// 있어 원하지 않은 쪽으로 반영됐다 → 자동 실행·기본 선택을 없앴다.
//
// API 키·백엔드 없이 동작한다 — 우리 서버로는 아무것도 전송되지 않는다.
// 조립·추출·변환 로직은 utils/webAiExchange.ts (순수 함수).
// 설계: docs/04-extensions/ai/web-ai-clipboard.md

import { useRef, useState } from 'react';
import type { ThemeTokens } from '@/components/design-tokens/theme';
import { I } from '@/components/icons';
import { InspectorSection } from './InspectorSection';
import { useAiSettingsStore } from '@/stores/aiSettingsStore';
import {
  useDocumentStore, findNodeInMap, isDocumentEmpty,
} from '@/stores/documentStore';
import { useEditorUiStore } from '@/stores/editorUiStore';
import { useInteractionStore } from '@/stores/interactionStore';
import { detachFromServer } from '@/services/cloud/mapSession';
import { buildExpandContext, reassignIds } from '@/utils/aiProjectContext';
import { parseEmm } from '@/utils/importMarkdown';
import { GENERATION_TYPES } from '@/utils/emmSystemPrompt';
import {
  AI_SHORTCUTS,
  aiShortcutUrl,
  OUTPUT_DIRECTIVE,
  RETRY_REQUEST_TEXT,
  answerFromPaste,
  buildWebAiPrompt,
  mapSourceCandidates,
  type AnswerMapOk,
} from '@/utils/webAiExchange';

export function WebAiPanel({ t }: { t: ThemeTokens }) {
  const systemPrompt = useAiSettingsStore((s) => s.systemPrompt);
  const map = useDocumentStore((s) => s.map);
  const loadMap = useDocumentStore((s) => s.loadMap);
  const appendChildren = useDocumentStore((s) => s.appendChildren);
  const setLayoutType = useEditorUiStore((s) => s.setLayoutType);
  const setSpacingX = useEditorUiStore((s) => s.setSpacingX);
  const setSpacingY = useEditorUiStore((s) => s.setSpacingY);
  const resetSpacing = useEditorUiStore((s) => s.resetSpacing);
  const setBrowserOpen = useEditorUiStore((s) => s.setBrowserOpen);
  const setSelectedId = useInteractionStore((s) => s.setSelectedId);
  const selectedId = useInteractionStore((s) => s.selectedId);
  const selectedNode = findNodeInMap(map, selectedId);

  const [topic, setTopic] = useState('');
  const [genType, setGenType] = useState('basic');
  const [copied, setCopied] = useState<'' | 'prompt' | 'expand' | 'retry'>('');
  // 클립보드 API 실패(구형 브라우저·http) 시 수동 복사 폴백에 펼칠 내용
  const [fallbackText, setFallbackText] = useState('');
  const [answer, setAnswer] = useState('');
  const [preview, setPreview] = useState<AnswerMapOk | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // 확인 팝오버 — window.confirm 대체 (2026-08-04 보고: 브라우저 기본
  // confirm 은 화면 상단 중앙에 떠서 어느 작업의 확인인지 눈에 안 들어
  // 왔다). 패널 오른쪽 옆·화면 세로 중앙에 띄운다.
  const panelRef = useRef<HTMLDivElement>(null);
  const [confirmReq, setConfirmReq] =
    useState<{ message: string; onOk: () => void } | null>(null);
  const askConfirm = (message: string, onOk: () => void) => {
    setConfirmReq({ message, onOk });
  };

  const flashCopied = (k: 'prompt' | 'expand' | 'retry') => {
    setCopied(k);
    window.setTimeout(() => setCopied(''), 2500);
  };
  const flashNotice = (msg: string) => {
    setNotice(msg);
    window.setTimeout(() => setNotice(''), 3000);
  };

  const copyText = async (text: string, kind: 'prompt' | 'expand' | 'retry') => {
    setFallbackText('');
    try {
      await navigator.clipboard.writeText(text);
      flashCopied(kind);
    } catch {
      // http·구형 브라우저 — 펼쳐 보여주고 수동 복사 (설계 §5)
      setFallbackText(text);
    }
  };

  const copyPrompt = () => {
    if (!topic.trim()) return;
    void copyText(buildWebAiPrompt({ systemPrompt, topic, typeKey: genType }), 'prompt');
  };

  // AI 사이트 열기 — 가능하면 질문까지 자동 입력하고(?q=), 자동 입력이
  // 막히거나 지원되지 않는 경우를 대비해 클립보드에도 항상 넣어 둔다
  // (2026-08-05 보고: ChatGPT 를 열어도 질문이 입력되지 않았다).
  const openAiSite = (s: (typeof AI_SHORTCUTS)[number]) => {
    const prompt = topic.trim()
      ? buildWebAiPrompt({ systemPrompt, topic, typeKey: genType })
      : '';
    // Copilot GPT 는 규칙 내장 — 주제만, 나머지는 규칙까지 붙은 전체
    const forClipboard = s.prefill === 'topic' && topic.trim() ? topic : prompt;
    if (forClipboard) void navigator.clipboard?.writeText(forClipboard).catch(() => {});
    window.open(aiShortcutUrl(s, { topic, prompt }), '_blank');
  };

  // 선택 노드 확장 프롬프트 — API 모드의 buildExpandContext 를 웹 채팅용
  // 한 덩어리로 합친다 (프로젝트 지침·@소스·상위 경로 포함 규칙 동일)
  const copyExpandPrompt = () => {
    if (!selectedId) return;
    const ctx = buildExpandContext(map, selectedId, systemPrompt);
    if (!ctx) return;
    const oneShot = `${ctx.system}\n\n${ctx.user}\n\n${OUTPUT_DIRECTIVE}`;
    void copyText(oneShot, 'expand');
  };

  // 붙여넣은 답변 → **미리보기만**. 적용은 아래 두 버튼 중 하나를
  // 눌러야 일어난다 (2026-08-05 보고: 자동 실행 제거).
  const process = (text: string): AnswerMapOk | null => {
    setError('');
    setPreview(null);
    if (!text.trim()) return null;
    const res = answerFromPaste(text);
    // (strict:false 라 진리값 내로잉이 안 된다 — 'in' 내로잉 사용)
    if ('reason' in res) {
      setError(res.reason);
      return null;
    }
    setPreview(res);
    return res;
  };

  // 새 맵으로 열기 — **항상** 확인 팝오버를 거친다 (2026-08-05 보고:
  // 눌렀는지 모르는 사이에 맵이 바뀌면 안 된다). 실행 시 서버 연결을
  // 해제해 자동저장이 이전 맵을 덮어쓰지 않게 한다.
  const openAsNewMap = (res: AnswerMapOk) => {
    const doc = useDocumentStore.getState();
    const willLose = !(doc.past.length === 0 || isDocumentEmpty(doc.map));
    askConfirm(
      willLose
        ? `현재 맵을 닫고 생성한 맵(${res.nodeCount}개 노드)을 열까요?\n` +
          '(실행 취소 Ctrl+Z 로 이전 맵으로 되돌릴 수 있습니다)'
        : `'${res.map.title}' 맵(${res.nodeCount}개 노드)을 새로 열까요?`,
      () => runOpenAsNewMap(res),
    );
  };

  const runOpenAsNewMap = (res: AnswerMapOk) => {
    detachFromServer();
    setBrowserOpen(false);
    loadMap(res.map);
    setLayoutType((res.editor?.layoutType as never) ?? 'radial-right');
    if (res.editor?.spacingX) setSpacingX(res.editor.spacingX);
    else resetSpacing();
    if (res.editor?.spacingY) setSpacingY(res.editor.spacingY);
    setSelectedId('root');
    setAnswer('');
    setPreview(null);
    // (🗺 이모지는 윈도에서 우산처럼 깨져 보여 제거 — 2026-08-04 보고)
    flashNotice(`'${res.map.title}' 맵 생성 완료 (${res.nodeCount}개 노드)`);
  };

  // 선택 노드에 하위로 삽입 — API 모드 runExpand 의 답변 처리와 동일:
  // 답변 맨 앞의 # 줄은 제거하고 타깃 제목으로 감싸 자식만 꺼낸다
  const insertToSelected = (text?: string) => {
    // 노드를 안 고르고 눌렀을 때는 조용히 무시하지 않고 이유를 알린다
    // (2026-08-05 보고 — 버튼은 항상 보이되 안내를 준다)
    if (!selectedId || !selectedNode) {
      setPreview(null);
      setError('먼저 맵에서 삽입할 노드를 클릭해 선택하세요 — 그 노드의 하위로 추가됩니다.');
      return;
    }
    setError('');
    const source = text ?? answer;
    // 새 맵 경로와 같은 후보 체인 — 최장 코드블록이 예시 조각인 답변
    // (2026-08-04 실사용 보고: 삽입만 실패)도 펜스 제거 폴백으로 흡수
    let kids: unknown[] = [];
    for (const candidate of mapSourceCandidates(source)) {
      const body = candidate.replace(/^\s*#\s[^\n]*\n+/, '');
      const wrapped = `# ${selectedNode.text || '노드'}\n\n${body}`;
      const parsed = parseEmm(wrapped, '확장', { blockPlacement: 'node' });
      const found = parsed ? reassignIds(parsed.branches as never) : [];
      if (found.length) { kids = found; break; }
    }
    if (!kids.length) {
      setError('답변에서 하위 구조를 인식하지 못했습니다. 확장 프롬프트로 다시 요청해 보세요.');
      return;
    }
    askConfirm(
      `'${selectedNode.text || '노드'}' 아래에 ${kids.length}개 항목을 추가할까요?\n` +
      '(실행 취소 Ctrl+Z 로 되돌릴 수 있습니다)',
      () => {
        appendChildren(selectedId, kids as never);
        setSelectedId(selectedId);
        setAnswer('');
        setPreview(null);
        flashNotice(`'${selectedNode.text}' 아래에 ${kids.length}개 항목을 추가했습니다`);
      },
    );
  };

  const stepLabel = (n: string, text: string) => (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6, margin: '10px 0 4px',
      fontSize: 11.5, fontWeight: 700, color: t.text,
    }}>
      <span style={{
        width: 17, height: 17, borderRadius: 9, flexShrink: 0,
        background: t.primarySoft, color: t.primary,
        fontSize: 10, fontWeight: 800,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>{n}</span>
      {text}
    </div>
  );

  return (
    <div ref={panelRef}>
      {/* 확인 팝오버 — 패널 오른쪽 옆·화면 세로 중앙 (window.confirm 대체,
          2026-08-04 보고: 상단 중앙의 브라우저 confirm 이 눈에 안 들어옴) */}
      {confirmReq && (
        <div
          data-webai-confirm
          style={{
            position: 'fixed',
            left: (panelRef.current?.getBoundingClientRect().right ?? 384) + 14,
            top: '50%', transform: 'translateY(-50%)',
            zIndex: 80, width: 280,
            background: t.surface, color: t.text,
            border: `1.5px solid ${t.primaryBorder}`, borderRadius: 10,
            boxShadow: '0 10px 34px rgba(0,0,0,.22)', padding: '13px 14px',
          }}
        >
          <div style={{ whiteSpace: 'pre-line', fontSize: 12.5, lineHeight: 1.65, marginBottom: 11 }}>
            {confirmReq.message}
          </div>
          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
            <button
              data-webai-confirm-ok
              autoFocus
              onClick={() => {
                const run = confirmReq.onOk;
                setConfirmReq(null);
                run();
              }}
              style={{
                padding: '6px 16px', borderRadius: 6, border: 'none',
                background: `linear-gradient(135deg, ${t.primary}, ${t.primaryHover})`,
                color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer',
              }}>확인</button>
            <button
              data-webai-confirm-cancel
              onClick={() => setConfirmReq(null)}
              style={{
                padding: '6px 14px', borderRadius: 6,
                border: `1px solid ${t.border}`, background: t.surface,
                color: t.text, fontSize: 12, fontWeight: 600, cursor: 'pointer',
              }}>취소</button>
          </div>
        </div>
      )}
      <InspectorSection t={t} title="🌐 웹 AI로 만들기 (API 키 불필요)">
        <div style={{ fontSize: 10.5, color: t.textSubtle, lineHeight: 1.55, marginBottom: 2 }}>
          쓰고 있는 AI 웹 구독(Claude·ChatGPT·Gemini…)으로 맵을 만듭니다 —
          <b> 복사 2번</b>이면 됩니다.
        </div>

        {notice && (
          <div data-webai-notice style={{
            marginTop: 6, padding: '7px 10px', borderRadius: 6,
            background: '#DCFCE7', border: '1px solid #86EFAC',
            color: '#15803D', fontSize: 11.5, fontWeight: 600, lineHeight: 1.5,
          }}>{notice}</div>
        )}

        {stepLabel('1', '무엇을 만들까요?')}
        <textarea
          value={topic}
          data-webai-topic
          onChange={(e) => setTopic(e.target.value)}
          placeholder={'예: 신제품 출시 계획을 마인드맵으로 정리해줘'}
          style={{
            width: '100%', boxSizing: 'border-box', padding: 10,
            fontSize: 12.5, borderRadius: 7, resize: 'vertical',
            minHeight: 72, outline: 'none',
            background: t.surfaceAlt, color: t.text,
            border: `1px solid ${t.border}`, fontFamily: 'inherit',
          }} />
        <div style={{ display: 'flex', gap: 6, marginTop: 6, alignItems: 'center' }}>
          <span style={{ fontSize: 10.5, color: t.textSubtle }}>유형</span>
          <select
            value={genType}
            data-webai-type
            onChange={(e) => setGenType(e.target.value)}
            title="EMM 템플릿에 덧붙일 용도별 추가 지시"
            style={{
              flex: 1, padding: '5px 8px', borderRadius: 5,
              border: `1px solid ${t.border}`,
              background: t.surface, color: t.text, fontSize: 12,
              fontFamily: 'inherit',
            }}
          >
            {GENERATION_TYPES.map((g) => (
              <option key={g.key} value={g.key}>{g.label}</option>
            ))}
          </select>
        </div>
        <button
          onClick={copyPrompt}
          disabled={!topic.trim()}
          data-webai-copy
          title="EMM 프롬프트 템플릿 + 주제를 클립보드에 복사 — AI 채팅창에 붙여넣으세요"
          style={{
            width: '100%', marginTop: 8, padding: 9,
            background: !topic.trim() ? t.surfaceAlt
              : copied === 'prompt' ? '#DCFCE7'
                : `linear-gradient(135deg, ${t.primary}, ${t.primaryHover})`,
            color: !topic.trim() ? t.textSubtle : copied === 'prompt' ? '#15803D' : '#fff',
            border: !topic.trim() || copied === 'prompt' ? `1px solid ${t.border}` : 'none',
            borderRadius: 7, fontSize: 13, fontWeight: 700,
            cursor: !topic.trim() ? 'default' : 'pointer',
          }}>
          {copied === 'prompt' ? '✓ 복사됨 — AI 창에 붙여넣으세요' : '📋 ① 프롬프트 복사'}
        </button>
        <div style={{
          display: 'flex', gap: 5, marginTop: 6, alignItems: 'center',
        }}>
          <span style={{ fontSize: 10.5, color: t.textSubtle, flexShrink: 0 }}>AI 열기:</span>
          {AI_SHORTCUTS.filter((s) => s.kind === 'plain').map((s) => (
            <button
              key={s.key}
              data-webai-open={s.key}
              onClick={() => openAiSite(s)}
              title={s.tip ?? `${s.label} 을(를) 새 탭으로 엽니다`}
              style={{
                flex: 1, padding: '5px 0', borderRadius: 6,
                border: `1px solid ${t.border}`, background: t.surface,
                color: t.text, fontSize: 11, fontWeight: 600, cursor: 'pointer',
              }}>{s.label}</button>
          ))}
        </div>
        {/* 전용 GPT 는 위의 일반 채팅과 **다른 것** — ① 프롬프트 없이
            주제만으로 동작한다 (2026-08-05 지적으로 분리) */}
        {AI_SHORTCUTS.filter((s) => s.kind === 'gpt').map((s) => (
          <button
            key={s.key}
            data-webai-open={s.key}
            onClick={() => openAiSite(s)}
            title={s.tip}
            style={{
              width: '100%', marginTop: 5, padding: '6px 8px', borderRadius: 6,
              border: `1px solid ${t.primaryBorder}`, background: t.primarySoft,
              color: t.primary, fontSize: 10.5, fontWeight: 700, cursor: 'pointer',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>⚡ {s.label}</button>
        ))}
        <div style={{ fontSize: 10, color: t.textSubtle, marginTop: 3, lineHeight: 1.5 }}>
          {topic.trim()
            ? '일반 채팅(Claude·ChatGPT)은 ① 프롬프트 전체가, 전용 GPT는 주제만 자동 입력됩니다. Gemini는 자동 입력을 지원하지 않아 붙여넣기(Ctrl+V) — 어느 쪽이든 클립보드에도 복사해 둡니다.'
            : '먼저 위에 주제를 적으면, 여는 즉시 질문까지 자동 입력됩니다.'}
        </div>

        {fallbackText && (
          <div data-webai-fallback style={{ marginTop: 6 }}>
            <div style={{ fontSize: 10.5, color: '#B45309', marginBottom: 3, lineHeight: 1.5 }}>
              클립보드 복사가 막혀 있습니다 — 아래 내용을 전체 선택(Ctrl+A)해
              직접 복사하세요.
            </div>
            <textarea
              readOnly
              value={fallbackText}
              onFocus={(e) => e.currentTarget.select()}
              rows={6}
              style={{
                width: '100%', boxSizing: 'border-box', padding: 8,
                fontSize: 10.5, borderRadius: 6, resize: 'vertical',
                background: t.surfaceAlt, color: t.text,
                border: `1px solid ${t.border}`,
                fontFamily: 'ui-monospace, monospace',
              }} />
          </div>
        )}

        {stepLabel('2', 'AI 창에 붙여넣고(Ctrl+V) 실행 → 답변을 복사하세요')}
        <div style={{ fontSize: 10, color: '#B45309', lineHeight: 1.5, margin: '2px 0 0' }}>
          답변은 반드시 답변 끝의 <b>⧉ 복사 버튼</b>으로 복사하세요 —
          화면을 드래그해 복사하면 코드·도식 블록의 형식이 사라져 깨집니다.
        </div>

        {stepLabel('3', '답변 붙여넣기')}
        <textarea
          value={answer}
          data-webai-answer
          onChange={(e) => {
            setAnswer(e.target.value);
            if (!e.target.value.trim()) { setPreview(null); setError(''); }
          }}
          onPaste={(e) => {
            const text = e.clipboardData.getData('text/plain');
            if (!text) return;
            // 기본 붙여넣기(입력창 채움)는 그대로 두고, 인식 결과만 미리
            // 보여 준다 — 적용은 아래 두 버튼 중 하나를 눌러야 한다.
            window.setTimeout(() => process(text), 0);
          }}
          placeholder="AI 답변을 여기에 붙여넣으세요 (Ctrl+V)"
          style={{
            width: '100%', boxSizing: 'border-box', padding: 10,
            fontSize: 11.5, borderRadius: 7, resize: 'vertical',
            minHeight: 84, outline: 'none',
            background: t.surfaceAlt, color: t.text,
            border: `1px solid ${t.border}`,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          }} />
        <div style={{ fontSize: 10, color: t.textSubtle, marginTop: 5, lineHeight: 1.5 }}>
          붙여넣으면 <b>인식만</b> 합니다 — 아래에서 <b>새 맵 생성</b> 또는
          <b> 선택 노드에 삽입</b>을 누르면 확인 후 반영됩니다.
        </div>

        {preview && (
          <div data-webai-preview style={{
            marginTop: 8, padding: '8px 10px', borderRadius: 6,
            background: '#DCFCE7', border: '1px solid #86EFAC',
            color: '#15803D', fontSize: 11.5, lineHeight: 1.5, fontWeight: 600,
          }}>
            '{preview.map.title}' · {preview.nodeCount}노드 인식됨 — 아래에서
            반영할 방법을 고르세요
          </div>
        )}
        {error && (
          <div data-webai-error style={{
            marginTop: 8, padding: '8px 10px', borderRadius: 6,
            background: '#FEF2F2', border: '1px solid #FECACA',
            color: '#B91C1C', fontSize: 11.5, lineHeight: 1.5,
          }}>
            {error}
            <button
              data-webai-retry-copy
              onClick={() => void copyText(RETRY_REQUEST_TEXT, 'retry')}
              style={{
                display: 'block', marginTop: 6, padding: '4px 10px',
                borderRadius: 5, border: '1px solid #FECACA',
                background: '#FFF', color: '#B91C1C',
                fontSize: 10.5, fontWeight: 700, cursor: 'pointer',
              }}>
              {copied === 'retry' ? '✓ 복사됨 — AI 창에 붙여넣으세요' : '⧉ 재요청 문구 복사'}
            </button>
          </div>
        )}

        {/* 실행 버튼 — 미리 골라진 대상은 없다. 어느 쪽을 누르든 확인
            팝오버를 거친다 (2026-08-05 보고). */}
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          {(() => {
            const onStyle = {
              background: t.primarySoft, color: t.primary,
              border: `1.5px solid ${t.primaryBorder}`,
            };
            const disabledStyle = {
              background: t.surfaceAlt, color: t.textSubtle,
              border: `1px solid ${t.border}`,
            };
            const baseStyle = {
              flex: 1, padding: 9, borderRadius: 7,
              fontSize: 12.5, fontWeight: 700,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            } as const;
            const off = !answer.trim();
            return (
              <>
                <button
                  onClick={() => {
                    // 미리보기가 없으면(직접 타이핑 등) 지금 인식해서 쓴다
                    const res = preview ?? process(answer);
                    if (res) openAsNewMap(res);
                  }}
                  disabled={off}
                  data-webai-generate
                  title="붙여넣은 답변을 새 맵으로 엽니다 (확인 후 실행)"
                  style={{
                    ...baseStyle,
                    ...(off ? disabledStyle : onStyle),
                    cursor: off ? 'default' : 'pointer',
                    display: 'flex', alignItems: 'center',
                    justifyContent: 'center', gap: 6,
                  }}>
                  <I.Sparkles size={13} /> ③ 새 맵 생성
                </button>
                {/* 노드를 안 골랐어도 **버튼은 보인다** — 누르면 노드를
                    먼저 고르라고 알려 준다 (2026-08-05 보고) */}
                <button
                  onClick={() => insertToSelected()}
                  disabled={off}
                  data-webai-insert
                  title={selectedNode
                    ? `답변을 '${selectedNode.text}' 노드의 하위로 추가합니다 (확인 후 실행)`
                    : '맵에서 노드를 먼저 선택하세요 — 그 노드의 하위로 추가됩니다'}
                  style={{
                    ...baseStyle,
                    ...(off ? disabledStyle : onStyle),
                    cursor: off ? 'default' : 'pointer',
                  }}>선택 노드에 삽입</button>
              </>
            );
          })()}
        </div>

        <div style={{ fontSize: 10, color: t.textSubtle, marginTop: 8, lineHeight: 1.5 }}>
          입력한 내용과 답변은 <b>EasyMindMap 서버로 전송되지 않습니다</b> —
          이 브라우저 안에서만 처리됩니다.
        </div>
      </InspectorSection>

      <InspectorSection t={t} title="선택 노드 자세히 확장 (웹 AI)">
        <div style={{ fontSize: 10.5, color: t.textSubtle, lineHeight: 1.5, marginBottom: 6 }}>
          맵에서 노드를 고르고 확장 프롬프트를 복사해 AI 창에 붙여넣으세요.
          답변을 위 ③에 붙여넣고 <b>[선택 노드에 삽입]</b>을 누르면 하위
          노드로 채워집니다 (중심 주제의 프로젝트 지침·@소스 규칙은 API
          모드와 동일).
        </div>
        <div data-webai-expand-target style={{
          fontSize: 11.5, padding: '6px 9px', borderRadius: 6, marginBottom: 6,
          background: t.surfaceAlt, border: `1px solid ${t.border}`,
          color: selectedNode ? t.text : t.textSubtle,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {selectedNode
            ? `대상: ${selectedNode.text || '(빈 노드)'}`
            : '맵에서 확장할 노드를 선택하세요'}
        </div>
        <button
          onClick={copyExpandPrompt}
          disabled={!selectedNode}
          data-webai-expand-copy
          title={selectedNode
            ? '선택 노드의 확장 프롬프트(상위 경로·프로젝트 지침 포함)를 복사합니다'
            : '맵에서 노드를 선택하세요'}
          style={{
            width: '100%', padding: 9,
            background: !selectedNode ? t.surfaceAlt
              : copied === 'expand' ? '#DCFCE7' : t.primarySoft,
            color: !selectedNode ? t.textSubtle
              : copied === 'expand' ? '#15803D' : t.primary,
            border: `1px solid ${!selectedNode ? t.border : t.primaryBorder}`,
            borderRadius: 7, fontSize: 12.5, fontWeight: 700,
            cursor: !selectedNode ? 'default' : 'pointer',
          }}>
          {copied === 'expand' ? '✓ 복사됨 — AI 창에 붙여넣으세요' : '📋 확장 프롬프트 복사'}
        </button>
      </InspectorSection>
    </div>
  );
}
