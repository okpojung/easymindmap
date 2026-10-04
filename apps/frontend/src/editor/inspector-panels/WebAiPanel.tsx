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

import { Fragment, useRef, useState, type ReactNode } from 'react';
import type { ThemeTokens } from '@/components/design-tokens/theme';
import { I } from '@/components/icons';
import { InspectorSection } from './InspectorSection';
import { AiConfirmPopover, type ConfirmRequest } from './AiConfirmPopover';
import { useAiSettingsStore } from '@/stores/aiSettingsStore';
import {
  useDocumentStore, findNodeInMap, isDocumentEmpty,
} from '@/stores/documentStore';
import { useEditorUiStore } from '@/stores/editorUiStore';
import { useInteractionStore } from '@/stores/interactionStore';
import { detachFromServer } from '@/services/cloud/mapSession';
import { sourceMarker, buildExpandContext, reassignIds } from '@/utils/aiProjectContext';
import { parseEmm } from '@/utils/importMarkdown';
import { GENERATION_TYPES } from '@/utils/emmSystemPrompt';
import {
  AI_SHORTCUTS,
  aiShortcutUrl,
  OUTPUT_DIRECTIVE,
  retryRequestText,
  answerFromPaste,
  buildWebAiPrompt,
  mapSourceCandidates,
  type AnswerMapOk,
} from '@/utils/webAiExchange';
import { useTr } from '@/i18n';
import { rich } from '@/i18n/rich';


// 손가락 기기의 입력칸 16px·누를 자리 40px (data-mm-touch) — 불러오기만 하면 CSS 가 들어간다
import '@/components/ui/mobileCss';
export function WebAiPanel({ t }: { t: ThemeTokens }) {
  const tr = useTr();
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
  const [confirmReq, setConfirmReq] = useState<ConfirmRequest | null>(null);
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
    // 전용 GPT 는 규칙이 내장돼 있어 **주제만**, 일반 채팅은 규칙까지
    // 붙은 전체 프롬프트를 클립보드에 넣는다 (자동 입력이 막히는 곳이
    // 있어 클립보드가 사실상의 주 경로다 — 2026-08-05).
    const forClipboard = s.kind === 'gpt' && topic.trim() ? topic : prompt;
    if (forClipboard) void navigator.clipboard?.writeText(forClipboard).catch(() => {});
    window.open(aiShortcutUrl(s, { topic, prompt }), '_blank');
  };

  // 선택 노드 확장 프롬프트 — API 모드의 buildExpandContext 를 웹 채팅용
  // 한 덩어리로 합친다 (프로젝트 지침·@소스·상위 경로 포함 규칙 동일)
  const copyExpandPrompt = () => {
    if (!selectedId) return;
    // 위 입력창(주제)에 적어 둔 요청이 있으면 함께 보낸다 —
    // API 키 모드와 같은 규칙이다 (2026-08-06 보고)
    const ctx = buildExpandContext(map, selectedId, systemPrompt, topic);
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
        // **되돌릴 수 있다고 하지 않는다** — 새 문서로 열리므로
        // 되돌리기가 이전 맵으로 넘어가지 않는다 (2026-08-06 3차 보고).
        ? tr('inspector.web.confirmReplace', { n: res.nodeCount })
        : tr('inspector.web.confirmOpen', { title: res.map.title, n: res.nodeCount }),
      () => runOpenAsNewMap(res),
    );
  };

  const runOpenAsNewMap = (res: AnswerMapOk) => {
    detachFromServer();
    setBrowserOpen(false);
    // 새 문서다 — 되돌리기가 이전 맵으로 넘어가면 안 된다 (2026-08-06)
    loadMap(res.map, { resetHistory: true });
    setLayoutType((res.editor?.layoutType as never) ?? 'radial-right');
    if (res.editor?.spacingX) setSpacingX(res.editor.spacingX);
    else resetSpacing();
    if (res.editor?.spacingY) setSpacingY(res.editor.spacingY);
    setSelectedId('root');
    setAnswer('');
    setPreview(null);
    // (🗺 이모지는 윈도에서 우산처럼 깨져 보여 제거 — 2026-08-04 보고)
    flashNotice(tr('inspector.web.created', { title: res.map.title, n: res.nodeCount }));
  };

  // 선택 노드에 하위로 삽입 — API 모드 runExpand 의 답변 처리와 동일:
  // 답변 맨 앞의 # 줄은 제거하고 타깃 제목으로 감싸 자식만 꺼낸다
  const insertToSelected = (text?: string) => {
    // 노드를 안 고르고 눌렀을 때는 조용히 무시하지 않고 이유를 알린다
    // (2026-08-05 보고 — 버튼은 항상 보이되 안내를 준다)
    if (!selectedId || !selectedNode) {
      setPreview(null);
      setError(tr('inspector.ai.selectNodeFirst'));
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
      setError(tr('inspector.web.noChildren'));
      return;
    }
    askConfirm(
      tr('inspector.ai.confirmInsert', { node: selectedNode.text || tr('inspector.ai.nodeFallback'), n: kids.length }),
      () => {
        appendChildren(selectedId, kids as never);
        setSelectedId(selectedId);
        setAnswer('');
        setPreview(null);
        flashNotice(tr('inspector.web.inserted', { node: selectedNode.text, n: kids.length }));
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
    <div data-mm-touch="" ref={panelRef}>
      {/* 확인 팝오버 — API 키 패널과 **같은 컴포넌트**를 쓴다
          (2026-08-06: 두 모드의 적용 흐름을 하나로 맞추면서 공용화) */}
      <AiConfirmPopover
        t={t} panelRef={panelRef} req={confirmReq}
        onClose={() => setConfirmReq(null)} />
      <InspectorSection t={t} title={tr('inspector.web.title')}>
        <div style={{ fontSize: 10.5, color: t.textSubtle, lineHeight: 1.55, marginBottom: 2 }}>
          {rich(tr('inspector.web.intro'), { two: <b>{tr('inspector.web.introTwo')}</b> })}
        </div>

        {notice && (
          <div data-webai-notice style={{
            marginTop: 6, padding: '7px 10px', borderRadius: 6,
            background: '#DCFCE7', border: '1px solid #86EFAC',
            color: '#15803D', fontSize: 11.5, fontWeight: 600, lineHeight: 1.5,
          }}>{notice}</div>
        )}

        {stepLabel('1', tr('inspector.web.step1'))}
        <textarea
          value={topic}
          data-webai-topic
          onChange={(e) => setTopic(e.target.value)}
          placeholder={tr('inspector.web.topicPlaceholder')}
          style={{
            width: '100%', boxSizing: 'border-box', padding: 10,
            fontSize: 12.5, borderRadius: 7, resize: 'vertical',
            minHeight: 72, outline: 'none',
            background: t.surfaceAlt, color: t.text,
            border: `1px solid ${t.border}`, fontFamily: 'inherit',
          }} />
        <div style={{ display: 'flex', gap: 6, marginTop: 6, alignItems: 'center' }}>
          <span style={{ fontSize: 10.5, color: t.textSubtle }}>{tr('inspector.web.type')}</span>
          <select
            value={genType}
            data-webai-type
            onChange={(e) => setGenType(e.target.value)}
            title={tr('inspector.ai.genTypeTitle')}
            style={{
              flex: 1, minWidth: 0, padding: '5px 8px', borderRadius: 5,
              border: `1px solid ${t.border}`,
              background: t.surface, color: t.text, fontSize: 12,
              fontFamily: 'inherit',
            }}
          >
            {GENERATION_TYPES.map((g) => (
              <option key={g.key} value={g.key}>{tr(g.label)}</option>
            ))}
          </select>
        </div>
        <button
          onClick={copyPrompt}
          disabled={!topic.trim()}
          data-webai-copy
          title={tr('inspector.web.copyTitle')}
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
          {copied === 'prompt' ? tr('inspector.web.copiedPaste') : tr('inspector.web.copyPrompt')}
        </button>
        <div style={{
          display: 'flex', gap: 5, marginTop: 6, alignItems: 'center',
        }}>
          <span style={{ fontSize: 10.5, color: t.textSubtle, flexShrink: 0 }}>{tr('inspector.web.openAi')}</span>
          {AI_SHORTCUTS.filter((s) => s.kind === 'plain').map((s) => (
            <button
              key={s.key}
              data-webai-open={s.key}
              onClick={() => openAiSite(s)}
              title={s.tip ? tr(s.tip) : tr('inspector.web.openTab', { name: tr(s.label) })}
              style={{
                flex: 1, padding: '5px 0', borderRadius: 6,
                border: `1px solid ${t.border}`, background: t.surface,
                color: t.text, fontSize: 11, fontWeight: 600, cursor: 'pointer',
              }}>{tr(s.label)}</button>
          ))}
        </div>
        {/* 전용 GPT 는 위의 일반 채팅과 **다른 것** — ① 프롬프트 없이
            주제만으로 동작한다 (2026-08-05 지적으로 분리) */}
        {AI_SHORTCUTS.filter((s) => s.kind === 'gpt').map((s) => (
          <button
            key={s.key}
            data-webai-open={s.key}
            onClick={() => openAiSite(s)}
            title={s.tip ? tr(s.tip) : undefined}
            style={{
              width: '100%', marginTop: 5, padding: '6px 8px', borderRadius: 6,
              border: `1px solid ${t.primaryBorder}`, background: t.primarySoft,
              color: t.primary, fontSize: 10.5, fontWeight: 700, cursor: 'pointer',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>⚡ {tr(s.label)}</button>
        ))}
        <div style={{ fontSize: 10, color: t.textSubtle, marginTop: 3, lineHeight: 1.5 }}>
          {topic.trim()
            ? tr('inspector.web.openHelp')
            : tr('inspector.web.openHelpEmpty')}
        </div>

        {fallbackText && (
          <div data-webai-fallback style={{ marginTop: 6 }}>
            <div style={{ fontSize: 10.5, color: '#B45309', marginBottom: 3, lineHeight: 1.5 }}>
              {tr('inspector.web.clipboardBlocked')}
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

        {stepLabel('2', tr('inspector.web.step2'))}
        <div style={{ fontSize: 10, color: '#B45309', lineHeight: 1.5, margin: '2px 0 0' }}>
          {rich(tr('inspector.web.copyWarn'), { btn: <b>{tr('inspector.web.copyWarnBtn')}</b> })}
        </div>

        {stepLabel('3', tr('inspector.web.step3'))}
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
          placeholder={tr('inspector.web.answerPlaceholder')}
          style={{
            width: '100%', boxSizing: 'border-box', padding: 10,
            fontSize: 11.5, borderRadius: 7, resize: 'vertical',
            minHeight: 84, outline: 'none',
            background: t.surfaceAlt, color: t.text,
            border: `1px solid ${t.border}`,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          }} />
        <div style={{ fontSize: 10, color: t.textSubtle, marginTop: 5, lineHeight: 1.5 }}>
          {rich(tr('inspector.web.pasteHelp'), {
            only: <b>{tr('inspector.web.pasteHelpOnly')}</b>,
            newmap: <b>{tr('inspector.web.newMapPlain')}</b>,
            insert: <b>{tr('inspector.ai.insert')}</b>,
          })}
        </div>

        {preview && (
          <div data-webai-preview style={{
            marginTop: 8, padding: '8px 10px', borderRadius: 6,
            background: '#DCFCE7', border: '1px solid #86EFAC',
            color: '#15803D', fontSize: 11.5, lineHeight: 1.5, fontWeight: 600,
          }}>
            {tr('inspector.web.recognized', { title: preview.map.title, n: preview.nodeCount })}
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
              onClick={() => void copyText(retryRequestText(), 'retry')}
              style={{
                display: 'block', marginTop: 6, padding: '4px 10px',
                borderRadius: 5, border: '1px solid #FECACA',
                background: '#FFF', color: '#B91C1C',
                fontSize: 10.5, fontWeight: 700, cursor: 'pointer',
              }}>
              {copied === 'retry' ? tr('inspector.web.copiedPaste') : tr('inspector.web.copyRetry')}
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
                  title={tr('inspector.web.newMapTitle')}
                  style={{
                    ...baseStyle,
                    ...(off ? disabledStyle : onStyle),
                    cursor: off ? 'default' : 'pointer',
                    display: 'flex', alignItems: 'center',
                    justifyContent: 'center', gap: 6,
                  }}>
                  <I.Sparkles size={13} /> {tr('inspector.web.newMap')}
                </button>
                {/* 노드를 안 골랐어도 **버튼은 보인다** — 누르면 노드를
                    먼저 고르라고 알려 준다 (2026-08-05 보고) */}
                <button
                  onClick={() => insertToSelected()}
                  disabled={off}
                  data-webai-insert
                  title={selectedNode
                    ? tr('inspector.ai.insertTitle', { node: selectedNode.text })
                    : tr('inspector.ai.insertNoNodeTitle')}
                  style={{
                    ...baseStyle,
                    ...(off ? disabledStyle : onStyle),
                    cursor: off ? 'default' : 'pointer',
                  }}>{tr('inspector.ai.insert')}</button>
              </>
            );
          })()}
        </div>

        <div style={{ fontSize: 10, color: t.textSubtle, marginTop: 8, lineHeight: 1.5 }}>
          {rich(tr('inspector.web.privacy'), { notsent: <b>{tr('inspector.web.privacyNotSent')}</b> })}
        </div>
      </InspectorSection>

      <InspectorSection t={t} title={tr('inspector.web.expandTitle')}>
        <div style={{ fontSize: 10.5, color: t.textSubtle, lineHeight: 1.5, marginBottom: 6 }}>
          {rich(tr('inspector.web.expandHelp', { marker: sourceMarker() }), {
            insert: <b>[{tr('inspector.ai.insert')}]</b>,
          })}
        </div>
        <div data-webai-expand-target style={{
          fontSize: 11.5, padding: '6px 9px', borderRadius: 6, marginBottom: 6,
          background: t.surfaceAlt, border: `1px solid ${t.border}`,
          color: selectedNode ? t.text : t.textSubtle,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {selectedNode
            ? tr('inspector.ai.expandTarget', { node: selectedNode.text || tr('inspector.conn.emptyNode') })
            : tr('inspector.ai.expandPick')}
        </div>
        <button
          onClick={copyExpandPrompt}
          disabled={!selectedNode}
          data-webai-expand-copy
          title={selectedNode
            ? tr('inspector.web.expandCopyTitle')
            : tr('inspector.ai.selectNode')}
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
          {copied === 'expand' ? tr('inspector.web.copiedPaste') : tr('inspector.web.copyExpand')}
        </button>
      </InspectorSection>
    </div>
  );
}
