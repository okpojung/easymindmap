import { useState, type ReactNode, type MouseEvent } from 'react';
import type { ThemeTokens } from '@/components/design-tokens/theme';

interface Props {
  t: ThemeTokens;
  title: string;
  children: ReactNode;
  disabled?: boolean;
  active?: boolean;
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
}

export function IconBtn({ t, title, children, disabled, active, onClick }: Props) {
  const [hover, setHover] = useState(false);
  return (
    <button
      title={title}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      disabled={disabled}
      style={{
        width: 32, height: 32, borderRadius: 6,
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
