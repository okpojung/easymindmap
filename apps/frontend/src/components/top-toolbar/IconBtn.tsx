import { useState, type ReactNode, type MouseEvent } from 'react';
import type { ThemeTokens } from '@/components/design-tokens/theme';
import { useCoarse } from '@/hooks/useViewport';

interface Props {
  t: ThemeTokens;
  title: string;
  children: ReactNode;
  disabled?: boolean;
  active?: boolean;
  testId?: string;
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
}

export function IconBtn({ t, title, children, disabled, active, testId, onClick }: Props) {
  const [hover, setHover] = useState(false);
  // 손가락 입력이면 누를 자리를 40px 로 (모바일 웹 2026-10-05)
  const size = useCoarse() ? 40 : 32;
  return (
    <button
      title={title}
      aria-label={title}
      data-testid={testId}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      disabled={disabled}
      style={{
        width: size, height: size, borderRadius: 6, flexShrink: 0,
        background: active ? t.primarySoft : (hover && !disabled ? t.surfaceAlt : 'transparent'),
        color: disabled ? t.textSubtle : (active ? t.primary : t.text),
        border: 'none',
        cursor: disabled ? 'default' : 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        opacity: disabled ? 0.5 : 1,
        transition: 'background 120ms',
      }}>
      {children}
    </button>
  );
}
