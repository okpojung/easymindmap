// CodeBlockDialog — 노드 코드 블록을 팝업에서 편집하는 공용 다이얼로그.
//
// 작은 노드 편집창(textarea) 안에서 여러 줄 코드를 직접 치는 것이 너무
// 어렵다는 피드백으로 도입: 언어와 코드를 한 창에서 입력하고 확인하면
// ``` 펜스 블록으로 노드 텍스트에 반영된다.
//  - 미니 툴바 { } 버튼 → 새 블록 삽입 (커서 위치)
//  - 코드 패널 더블클릭 / 언어 라벨·✎ 클릭 → 기존 블록 수정
// Esc = 취소, Ctrl+Enter = 확인. document.body 포털로 화면 중앙에 띄운다.

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ThemeTokens } from '@/components/design-tokens/theme';
import { DialogXButton } from '@/components/ui/DialogFrame';
import { useDialogDrag } from '@/components/ui/useDialogDrag';
import { useTr } from '@/i18n';
import { codeRenderError, codeRenderOf, ensureCodeRender, htmlBlockDoc, renderLangOf } from './codeRender';
import { useCodeRenderEpoch } from './useCodeRenderEpoch';
import { filterCodeLanguages, useCodeLanguages } from '@/services/cloud/codeLanguages';

const LINE_NUM_KEY = 'emm.code.lineNumbers';
const CODE_FONT_STACK = "ui-monospace, 'Cascadia Mono', 'Consolas', 'D2Coding', monospace";

export function CodeBlockDialog({
  t,
  initialLang,
  initialCode,
  onCancel,
  onSave,
}: {
  t: ThemeTokens;
  initialLang?: string;
  initialCode?: string;
  onCancel: () => void;
  onSave: (lang: string, code: string) => void;
}) {
  const tr = useTr();
  const [lang, setLang] = useState(initialLang ?? '');
  const [code, setCode] = useState(initialCode ?? '');
  const codeRef = useRef<HTMLTextAreaElement | null>(null);
  const drag = useDialogDrag();
  // 언어가 mermaid·html 이면 **code ↔ 그림** 보기를 고른다 (2026-10-28 — 표 편집 창의 격자/MD 처럼)
  const kind = renderLangOf(lang);
  const [view, setView] = useState<'code' | 'render'>('code');
  const showRender = !!kind && view === 'render';
  useCodeRenderEpoch(); // 그림이 끝나면 다시 그린다
  const trimmed = code.replace(/\s+$/, '');
  useEffect(() => { if (showRender && kind && trimmed.trim()) void ensureCodeRender(kind, trimmed); }, [showRender, kind, trimmed]);
  const rendered = showRender ? codeRenderOf(lang, trimmed) : null;
  // 줄 번호 (2026-10-28) — 켜고 끈 것은 이 브라우저가 기억한다
  const [lineNums, setLineNums] = useState<boolean>(() => {
    try { return window.localStorage.getItem(LINE_NUM_KEY) !== '0'; } catch { return true; }
  });
  const toggleLineNums = () => setLineNums((v) => {
    try { window.localStorage.setItem(LINE_NUM_KEY, v ? '0' : '1'); } catch { /* 저장소를 못 써도 화면은 바뀐다 */ }
    return !v;
  });
  const gutterRef = useRef<HTMLDivElement | null>(null);
  const lineCount = Math.max(1, code.split('\n').length);
  // 언어 고르기 (2026-10-28) — 치면 맞는 것만, ☰ 를 누르면 전체 목록 (관리자 > 코드블럭 언어관리)
  const languages = useCodeLanguages();
  const [langOpen, setLangOpen] = useState<'typed' | 'all' | null>(null);
  const [langActive, setLangActive] = useState(0);
  const langList = langOpen === 'all' ? languages : langOpen === 'typed' ? filterCodeLanguages(languages, lang) : [];
  const pickLang = (code: string) => { setLang(code); setLangOpen(null); window.setTimeout(() => codeRef.current?.focus(), 0); };
  const [copied, setCopied] = useState(false);
  const copyCode = () => {
    const done = () => { setCopied(true); window.setTimeout(() => setCopied(false), 1500); };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(code).then(done, done); else done();
  };
  const renderErr = showRender ? codeRenderError(lang, trimmed) : null;

  useEffect(() => {
    window.setTimeout(() => codeRef.current?.focus(), 0);
  }, []);

  const canSave = code.trim().length > 0;
  const save = () => { if (canSave) onSave(lang.trim(), code.replace(/\s+$/, '')); };

  return createPortal(
    <div
      data-testid="code-block-dialog"
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onCancel(); }
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); save(); }
      }}
      style={{
        // ★ 노드 편집 오버레이(zIndex 1000)보다 **위**여야 한다
        //   (2026-08-09 보고: 코드 블록 창을 열면 편집 중이던 노드의 글자와
        //   서식 툴바가 창 위로 비쳐 화면이 겹쳐 보였다). 이 창은 편집 중에
        //   열리는 유일한 모달이므로 앱에서 가장 위에 둔다.
        position: 'fixed', inset: 0, zIndex: 1200,
        background: 'rgba(15,14,10,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={onCancel}
    >
      <div
        ref={drag.panelRef}
        onClick={(e) => e.stopPropagation()}
        data-testid="code-block-panel"
        style={{
          position: 'relative',
          ...drag.panelStyle,
          // 폰 — 좌우 12px 여백 · 키보드가 올라와도 안에서 스크롤 (모바일 웹, 2026-10-05)
          width: 'min(640px, calc(100vw - 59px))', // 59 = 여백 12×2 + 안쪽 16×2 + 테두리 — 화면 끝까지 12px
          maxHeight: 'calc(100dvh - 59px)', overflowY: 'auto',
          background: t.surface,
          border: `1.5px solid ${t.border}`,
          borderRadius: 12,
          boxShadow: '0 12px 40px rgba(20,15,5,0.45)',
          padding: 16,
          display: 'flex', flexDirection: 'column', gap: 10,
        }}
      >
        <DialogXButton t={t} testId="code-block-dialog-x" onClose={onCancel} />
        {/* 제목줄을 끌어 창을 옮긴다 (2026-10-15 사용자 요청 — 표 편집 팝업과 같이) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingRight: 34 }}>
          <div data-testid="code-block-title" onPointerDown={drag.handleProps.onPointerDown}
            title={tr('editor.table.dragTitle')}
            style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 700, color: t.text, ...drag.handleProps.style }}>
            {initialCode ? tr('editor.code.titleEdit') : tr('editor.code.titleInsert')}
          </div>
          <button type="button" data-testid="code-line-numbers" aria-pressed={lineNums}
            title={lineNums ? tr('editor.code.lineNumbersOff') : tr('editor.code.lineNumbersOn')}
            onClick={toggleLineNums}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3,
              height: 28, padding: '0 8px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700,
              background: lineNums ? (t.primarySoft ?? 'rgba(200,120,20,0.18)') : (t.surfaceAlt ?? 'transparent'),
              color: lineNums ? t.primary : t.text,
              border: `1px solid ${lineNums ? `${t.primaryBorder ?? t.primary}55` : t.border}`,
              fontFamily: CODE_FONT_STACK,
            }}
          ><span aria-hidden>1≡</span>{lineNums ? 'On' : 'Off'}</button>
          <button type="button" data-testid="code-copy" title={copied ? tr('common.copied') : tr('editor.note.copyCode')}
            aria-label={tr('editor.note.copyCode')} onClick={copyCode} disabled={!code}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 32, height: 28, borderRadius: 8, cursor: code ? 'pointer' : 'default', fontSize: 14,
              background: copied ? '#DCFCE7' : (t.surfaceAlt ?? 'transparent'),
              color: copied ? '#15803D' : t.text, border: `1px solid ${copied ? '#86EFAC' : t.border}`,
            }}
          >{copied ? '✓' : '⧉'}</button>
          {kind && <span aria-hidden style={{ width: 1, height: 18, background: t.border, margin: '0 2px' }} />}
          {kind && (['code', 'render'] as const).map((v) => {
            const on = view === v;
            return (
              <button key={v} type="button" data-testid={`code-view-${v === 'code' ? 'code' : kind}`} aria-pressed={on}
                title={v === 'code' ? tr('editor.code.viewCodeTitle') : tr('editor.code.viewRenderTitle', { lang: kind })}
                onClick={() => setView(v)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  minWidth: 44, height: 28, padding: '0 9px', borderRadius: 8,
                  background: on ? (t.primarySoft ?? 'rgba(200,120,20,0.18)') : (t.surfaceAlt ?? 'transparent'),
                  color: on ? t.primary : t.text,
                  border: `1px solid ${on ? `${t.primaryBorder ?? t.primary}55` : t.border}`,
                  cursor: 'pointer', fontSize: 12, fontWeight: 700,
                  fontFamily: "ui-monospace, 'Consolas', monospace",
                }}
              >{v === 'code' ? 'code' : kind}</button>
            );
          })}
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, position: 'relative' }}>
          <span style={{ fontSize: 12, color: t.textMuted, flexShrink: 0 }}>{tr('common.language')}</span>
          <input
            data-testid="code-lang-input"
            value={lang}
            role="combobox"
            aria-expanded={langList.length > 0}
            aria-autocomplete="list"
            autoComplete="off"
            onChange={(e) => { setLang(e.target.value); setLangOpen(e.target.value.trim() ? 'typed' : null); setLangActive(0); }}
            onBlur={() => window.setTimeout(() => setLangOpen(null), 150)}
            onKeyDown={(e) => {
              if (!langList.length) {
                if (e.key === 'ArrowDown') { e.preventDefault(); setLangOpen('all'); setLangActive(0); }
                return;
              }
              if (e.key === 'ArrowDown') { e.preventDefault(); setLangActive((i) => Math.min(langList.length - 1, i + 1)); }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setLangActive((i) => Math.max(0, i - 1)); }
              else if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) { e.preventDefault(); pickLang(langList[Math.min(langActive, langList.length - 1)].code); }
              else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setLangOpen(null); }
            }}
            placeholder={tr('editor.code.langPlaceholder')}
            style={{
              flex: 1, boxSizing: 'border-box', padding: '6px 9px',
              borderRadius: 7, border: `1px solid ${t.border}`,
              background: t.surface, color: t.text,
              fontSize: 12.5, outline: 'none',
              fontFamily: "ui-monospace, 'Consolas', monospace",
            }}
          />
          <button type="button" data-testid="code-lang-list" title={tr('editor.code.langListTitle')} aria-label={tr('editor.code.langListTitle')}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => { setLangOpen((v) => (v === 'all' ? null : 'all')); setLangActive(0); }}
            style={{
              flexShrink: 0, width: 32, height: 30, borderRadius: 7, cursor: 'pointer', fontSize: 15,
              border: `1px solid ${langOpen === 'all' ? t.primary : t.border}`,
              background: langOpen === 'all' ? (t.primarySoft ?? t.surfaceAlt) : (t.surfaceAlt ?? t.surface),
              color: langOpen === 'all' ? t.primary : t.text,
            }}
          >☰</button>
          {langList.length > 0 && (
            <div role="listbox" data-testid="code-lang-options"
              style={{
                position: 'absolute', zIndex: 5, top: '100%', left: 44, right: 0, marginTop: 4,
                maxHeight: 260, overflowY: 'auto', borderRadius: 8, padding: 4,
                background: t.surface, border: `1px solid ${t.border}`, boxShadow: '0 8px 24px rgba(0,0,0,0.16)',
              }}>
              {langList.map((x, i) => (
                <div key={x.code} role="option" aria-selected={i === langActive} data-testid="code-lang-option"
                  onMouseDown={(e) => { e.preventDefault(); pickLang(x.code); }}
                  onMouseEnter={() => setLangActive(i)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '5px 9px', borderRadius: 6, cursor: 'pointer',
                    background: i === langActive ? (t.primarySoft ?? t.surfaceAlt) : 'transparent',
                    color: x.code === lang.trim().toLowerCase() ? t.primary : t.text, fontSize: 12.5,
                  }}>
                  <span style={{ flex: 1, fontWeight: 600 }}>{x.name}</span>
                  <span style={{ fontFamily: CODE_FONT_STACK, fontSize: 11.5, color: t.textMuted }}>{x.code}</span>
                </div>
              ))}
            </div>
          )}
        </label>
        {showRender && (
          <div data-testid="code-render-preview" style={{
            minHeight: 140, maxHeight: '60vh', overflow: 'auto', borderRadius: 8,
            border: `1px solid ${t.border}`, background: '#fff', padding: 8,
            display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
          }}>
            {!trimmed.trim() ? (
              <span style={{ fontSize: 12.5, color: t.textMuted, alignSelf: 'center' }}>{tr('editor.code.renderEmpty')}</span>
            ) : renderErr ? (
              <pre data-testid="code-render-error" style={{ margin: 0, fontSize: 12, color: '#B91C1C', whiteSpace: 'pre-wrap', alignSelf: 'stretch' }}>{tr('editor.code.renderFailed')}\n{renderErr}</pre>
            ) : !rendered ? (
              <span style={{ fontSize: 12.5, color: t.textMuted, alignSelf: 'center' }}>{tr('editor.code.rendering')}</span>
            ) : rendered.kind === 'mermaid' ? (
              <img alt="mermaid" src={rendered.src} style={{ maxWidth: '100%', height: 'auto' }} />
            ) : (
              <iframe title="html" sandbox="" srcDoc={htmlBlockDoc(trimmed)} width={rendered.nw} height={rendered.nh}
                style={{ border: 0, maxWidth: '100%', background: '#fff' }} />
            )}
          </div>
        )}
        <div style={{ display: showRender ? 'none' : 'flex', alignItems: 'stretch', borderRadius: 8, border: `1px solid ${t.border}`, background: '#ECEFF3', overflow: 'hidden' }}>
        {lineNums && (
          <div ref={gutterRef} data-testid="code-gutter" aria-hidden style={{
            flexShrink: 0, overflow: 'hidden', padding: '8px 8px 8px 10px', textAlign: 'right',
            background: '#E2E6EC', borderRight: '1px solid #D3D8DF', color: '#94A3B8',
            fontSize: 12.5, lineHeight: 1.5, fontFamily: CODE_FONT_STACK, userSelect: 'none',
            minWidth: `${String(lineCount).length + 1}ch`,
          }}>
            {Array.from({ length: lineCount }, (_, i) => <div key={i}>{i + 1}</div>)}
          </div>
        )}
        <textarea
          ref={codeRef}
          data-testid="code-body-input"
          onScroll={(e) => { if (gutterRef.current) gutterRef.current.scrollTop = e.currentTarget.scrollTop; }}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          rows={10}
          placeholder={tr('editor.code.codePlaceholder')}
          spellCheck={false}
          style={{
            flex: 1, minWidth: 0,
            width: '100%', boxSizing: 'border-box', resize: 'vertical',
            minHeight: 140,
            padding: '8px 10px', borderRadius: 0,
            border: 'none',
            background: '#ECEFF3', color: '#334155',
            fontSize: 12.5, lineHeight: 1.5, outline: 'none',
            fontFamily: "ui-monospace, 'Cascadia Mono', 'Consolas', 'D2Coding', monospace",
            whiteSpace: 'pre', overflowX: 'auto',
          }}
        />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              padding: '7px 14px', borderRadius: 7,
              border: `1px solid ${t.border}`, background: 'transparent',
              color: t.textMuted, fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
            }}
          >
            {tr('editor.dlg.cancelEsc')}
          </button>
          <button
            type="button"
            data-testid="code-dialog-save"
            onClick={save}
            disabled={!canSave}
            style={{
              padding: '7px 16px', borderRadius: 7, border: 'none',
              background: canSave ? t.primary : t.border,
              color: '#fff', fontSize: 12.5, fontWeight: 700,
              cursor: canSave ? 'pointer' : 'default',
            }}
          >
            {tr('editor.dlg.okCtrlEnter')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// 커서 위치에 ```lang\ncode\n``` 블록을 끼워 넣은 텍스트를 돌려준다 —
// 앞뒤가 줄 경계가 아니면 줄바꿈을 보충한다.
export function spliceCodeBlock(
  value: string,
  cursor: number,
  lang: string,
  code: string,
): string {
  const before = value.slice(0, cursor);
  const after = value.slice(cursor);
  const block = '```' + lang + '\n' + code + '\n```';
  const pre = before === '' || before.endsWith('\n') ? before : before + '\n';
  const post = after === '' || after.startsWith('\n') ? after : '\n' + after;
  return pre + block + post;
}

// 기존 텍스트의 index 번째(기본 첫 번째) ``` 펜스 블록을 새 언어·코드로 교체한다.
// (펜스가 없으면 끝에 덧붙인다 — 방어적). 빈 코드 펜스도 한 블록으로 센다
// (splitNodeParts 는 빈 펜스를 글로 두지만, 그런 블록은 그려지지 않아 더블클릭
// 으로 여기 올 수 없다).
export function replaceCodeBlock(
  value: string,
  lang: string,
  code: string,
  index = 0,
): string {
  const lines = String(value || '').split('\n');
  const block = ['```' + lang, ...code.split('\n'), '```'];
  let seen = 0;
  for (let i = 0; i < lines.length; i++) {
    if (!/^\s*```/.test(lines[i])) continue;
    let j = i + 1;
    while (j < lines.length && !/^\s*```/.test(lines[j])) j++;
    const end = j < lines.length ? j + 1 : lines.length;
    if (seen++ < index) { i = end - 1; continue; }
    return [...lines.slice(0, i), ...block, ...lines.slice(end)].join('\n');
  }
  return (value ? value + '\n' : '') + block.join('\n');
}
