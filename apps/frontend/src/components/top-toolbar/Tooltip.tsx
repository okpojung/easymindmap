import { forwardRef, useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type MouseEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { ThemeTokens } from '@/components/design-tokens/theme';
import { useCoarse } from '@/hooks/useViewport';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { title?: string };

/** Short single-line hints. Omit native title to avoid duplicate browser hints. */
export const TooltipButton = forwardRef<HTMLButtonElement, Props>(function TooltipButton(
  { title, children, 'aria-label': ariaLabel, 'aria-describedby': describedBy, ...props }, forwardedRef,
) {
  const id = useId();
  const anchor = useRef<HTMLSpanElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const [point, setPoint] = useState<{ x: number; y: number; above: boolean } | null>(null);
  const label = (title || ariaLabel || '').replace(/\s+/g, ' ').trim();
  const hide = () => { clearTimeout(timer.current); setPoint(null); };
  const show = () => {
    clearTimeout(timer.current);
    if (!label) return;
    timer.current = setTimeout(() => {
      const box = anchor.current?.getBoundingClientRect();
      if (!box) return;
      const above = box.bottom + 42 > window.innerHeight;
      setPoint({ x: Math.max(8, Math.min(box.left + box.width / 2, window.innerWidth - 8)), y: above ? box.top - 7 : box.bottom + 7, above });
    }, 400);
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (!point) return;
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') hide(); };
    window.addEventListener('keydown', key);
    window.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);
    return () => { window.removeEventListener('keydown', key); window.removeEventListener('scroll', hide, true); window.removeEventListener('resize', hide); };
  }, [point]);
  return <span ref={anchor} style={{ display: 'inline-flex', flexShrink: 0 }}
    onPointerEnter={(event) => { if (event.pointerType !== 'touch') show(); }} onPointerLeave={hide}
    onFocus={show} onBlur={hide} onPointerDown={hide}>
    <button {...props} ref={forwardedRef} aria-label={ariaLabel ?? label}
      aria-describedby={[describedBy, point ? id : null].filter(Boolean).join(' ') || undefined}>{children}</button>
    {point && createPortal(<span id={id} role="tooltip" data-testid="toolbar-tooltip"
      ref={(element) => {
        if (!element) return;
        const width = element.getBoundingClientRect().width;
        element.style.left = Math.max(8, Math.min(point.x - width / 2, window.innerWidth - width - 8)) + 'px';
      }}
      style={{ position: 'fixed', left: point.x, top: point.y, transform: point.above ? 'translateY(-100%)' : undefined,
        zIndex: 10000, maxWidth: 'calc(100vw - 16px)', boxSizing: 'border-box', overflow: 'hidden', textOverflow: 'ellipsis',
        whiteSpace: 'nowrap', pointerEvents: 'none', padding: '6px 9px', borderRadius: 6, background: '#20242B', color: '#fff',
        fontSize: 12, lineHeight: '18px', fontWeight: 500, boxShadow: '0 3px 12px #0003' }}>{label}</span>, document.body)}
  </span>;
});

/** Same API and dimensions as IconBtn, with shared focus/hover hints. */
export function TooltipIconBtn({ t, title, children, disabled, active, testId, onClick }: {
  t: ThemeTokens; title: string; children: ReactNode; disabled?: boolean; active?: boolean;
  testId?: string; onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
  const [hover, setHover] = useState(false);
  const size = useCoarse() ? 42 : 38;
  return <TooltipButton title={title} aria-label={title} data-testid={testId} disabled={disabled} onClick={onClick}
    onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
    style={{ width: size, height: size, borderRadius: 6, flexShrink: 0, background: active ? t.primarySoft : hover && !disabled ? t.surfaceAlt : 'transparent',
      color: disabled ? t.textSubtle : active ? t.primary : t.text, border: 'none', cursor: disabled ? 'default' : 'pointer',
      display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: disabled ? .5 : 1, transition: 'background 120ms' }}>{children}</TooltipButton>;
}
