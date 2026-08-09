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
  const [lang, setLang] = useState(initialLang ?? '');
  const [code, setCode] = useState(initialCode ?? '');
  const codeRef = useRef<HTMLTextAreaElement | null>(null);

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
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(640px, calc(100vw - 48px))',
          background: t.surface,
          border: `1.5px solid ${t.border}`,
          borderRadius: 12,
          boxShadow: '0 12px 40px rgba(20,15,5,0.45)',
          padding: 16,
          display: 'flex', flexDirection: 'column', gap: 10,
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 700, color: t.text }}>
          코드 블록 {initialCode ? '수정' : '삽입'}
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, color: t.textMuted, flexShrink: 0 }}>언어</span>
          <input
            data-testid="code-lang-input"
            value={lang}
            onChange={(e) => setLang(e.target.value)}
            placeholder="예: bash, js, python — 비우면 code"
            style={{
              flex: 1, boxSizing: 'border-box', padding: '6px 9px',
              borderRadius: 7, border: `1px solid ${t.border}`,
              background: t.surface, color: t.text,
              fontSize: 12.5, outline: 'none',
              fontFamily: "ui-monospace, 'Consolas', monospace",
            }}
          />
        </label>
        <textarea
          ref={codeRef}
          data-testid="code-body-input"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          rows={10}
          placeholder="코드를 입력하세요 (여러 줄 가능)"
          spellCheck={false}
          style={{
            width: '100%', boxSizing: 'border-box', resize: 'vertical',
            minHeight: 140,
            padding: '8px 10px', borderRadius: 8,
            border: `1px solid ${t.border}`,
            background: '#ECEFF3', color: '#334155',
            fontSize: 12.5, lineHeight: 1.5, outline: 'none',
            fontFamily: "ui-monospace, 'Cascadia Mono', 'Consolas', 'D2Coding', monospace",
            whiteSpace: 'pre', overflowX: 'auto',
          }}
        />
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
            취소 (Esc)
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
            확인 (Ctrl+Enter)
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

// 기존 텍스트의 첫 번째 ``` 펜스 블록을 새 언어·코드로 교체한다.
// (펜스가 없으면 끝에 덧붙인다 — 방어적)
export function replaceCodeBlock(
  value: string,
  lang: string,
  code: string,
): string {
  const lines = String(value || '').split('\n');
  const block = ['```' + lang, ...code.split('\n'), '```'];
  for (let i = 0; i < lines.length; i++) {
    if (!/^\s*```/.test(lines[i])) continue;
    let j = i + 1;
    while (j < lines.length && !/^\s*```/.test(lines[j])) j++;
    const end = j < lines.length ? j + 1 : lines.length;
    return [...lines.slice(0, i), ...block, ...lines.slice(end)].join('\n');
  }
  return (value ? value + '\n' : '') + block.join('\n');
}
