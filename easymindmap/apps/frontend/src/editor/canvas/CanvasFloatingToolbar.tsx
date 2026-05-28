// CanvasFloatingToolbar — top-right floating toolbar with two groups:
// (1) Node-scoped actions  (2) View controls
// Spec: docs/03-editor-core/canvas/10-canvas.md § 21.2

import { useState, type ReactNode } from 'react';
import type { ThemeTokens } from '@/components/design-tokens/theme';
import { I } from '@/components/icons';

interface Props {
  t: ThemeTokens;
  hasSelection: boolean;
}

export function CanvasFloatingToolbar({ t, hasSelection }: Props) {
  return (
    <div style={{
      position: 'absolute', top: 14, right: 14, zIndex: 5,
      display: 'flex', alignItems: 'center', gap: 4,
      padding: 4, borderRadius: 8,
      background: t.surface,
      border: `1px solid ${t.border}`,
      boxShadow: t.shadowSm,
    }}>
      <GroupLabel t={t}>노드</GroupLabel>
      <ToolbarBtn t={t} title="선택 노드에 다중 자식 추가 (⌃Space)" highlight={hasSelection}>
        <I.Plus size={15} />
      </ToolbarBtn>
      <ToolbarBtn t={t} title="선택 노드 삭제 (Del)" danger disabled={!hasSelection}>
        <I.Trash size={15} />
      </ToolbarBtn>

      <div style={{ width: 1, background: t.divider, margin: '4px 4px', alignSelf: 'stretch' }} />

      <GroupLabel t={t}>보기</GroupLabel>
      <ToolbarBtn t={t} title="Pan 모드 — 캔버스 끌기 (H)"><I.Hand size={15} /></ToolbarBtn>
      <ToolbarBtn t={t} title="선택 노드 화면 가득 보기 (Alt+F)" disabled={!hasSelection}>
        <I.Focus size={15} />
      </ToolbarBtn>
      <ToolbarBtn t={t} title="맵 전체를 화면에 맞추기 (Ctrl+Shift+F)"><I.Fit size={15} /></ToolbarBtn>
      <ToolbarBtn t={t} title="편집기 전체 화면 전환 (F11)"><I.Full size={15} /></ToolbarBtn>
    </div>
  );
}

function GroupLabel({ t, children }: { t: ThemeTokens; children: ReactNode }) {
  return (
    <span style={{
      fontSize: 9.5, fontWeight: 700, color: t.textSubtle,
      letterSpacing: 0.4, textTransform: 'uppercase',
      padding: '0 4px 0 6px',
    }}>{children}</span>
  );
}

interface ToolbarBtnProps {
  t: ThemeTokens;
  title: string;
  children: ReactNode;
  highlight?: boolean;
  danger?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}

function ToolbarBtn({ t, title, children, highlight, danger, disabled, onClick }: ToolbarBtnProps) {
  const [h, setH] = useState(false);
  let bg = 'transparent';
  let color = t.text;

  if (disabled) {
    color = t.textSubtle;
  } else if (highlight) {
    bg = h ? t.primary : t.primarySoft;
    color = h ? '#fff' : t.primary;
  } else if (danger && h) {
    bg = t.danger + '18';
    color = t.danger;
  } else if (h) {
    bg = t.surfaceAlt;
  }

  return (
    <button
      title={title}
      disabled={disabled}
      onClick={onClick}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        width: 28, height: 28, borderRadius: 5,
        background: bg, color,
        border: 'none',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'background 120ms, color 120ms',
      }}>
      {children}
    </button>
  );
}
