import type { ReactNode } from 'react';
import type { ThemeTokens } from '@/components/design-tokens/theme';

interface SectionProps {
  t: ThemeTokens;
  title: string;
  action?: ReactNode;
  children: ReactNode;
  pad?: boolean;
}

export function InspectorSection({ t, title, action, children, pad = true }: SectionProps) {
  return (
    <div style={{
      padding: pad ? '14px 14px 2px' : 0,
      borderBottom: `1px solid ${t.divider}`,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 10,
      }}>
        <div style={{
          fontSize: 10.5, fontWeight: 700, color: t.textSubtle,
          textTransform: 'uppercase', letterSpacing: 0.5,
        }}>{title}</div>
        {action}
      </div>
      {children}
      <div style={{ height: 14 }} />
    </div>
  );
}

interface RowProps {
  t: ThemeTokens;
  label: string;
  children: ReactNode;
}

export function InspectorRow({ t, label, children }: RowProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
      <div style={{ width: 58, fontSize: 11.5, color: t.textMuted, flexShrink: 0 }}>{label}</div>
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  );
}

interface ToggleProps {
  t: ThemeTokens;
  on: boolean;
  onChange?: (v: boolean) => void;
}

export function Toggle({ t, on, onChange }: ToggleProps) {
  return (
    <div
      onClick={() => onChange?.(!on)}
      style={{
        width: 32, height: 18, borderRadius: 9,
        background: on ? t.primary : t.borderStrong,
        position: 'relative', cursor: 'pointer',
        transition: 'background 120ms',
      }}>
      <div style={{
        width: 14, height: 14, borderRadius: '50%',
        background: '#fff',
        position: 'absolute', top: 2, left: on ? 16 : 2,
        transition: 'left 120ms',
        boxShadow: '0 1px 2px rgba(0,0,0,0.3)',
      }} />
    </div>
  );
}

interface ColorSwatchProps {
  t: ThemeTokens;
  value: string;
}

export function ColorSwatchInput({ t, value }: ColorSwatchProps) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '4px 6px', borderRadius: 6,
      border: `1px solid ${t.border}`, background: t.surface,
    }}>
      <span style={{
        width: 18, height: 18, borderRadius: 4,
        background: value, border: `1px solid ${t.border}`,
      }} />
      <span style={{
        fontSize: 11, fontFamily: 'ui-monospace, monospace',
        color: t.textMuted,
      }}>{value}</span>
      <span style={{ marginLeft: 'auto', color: t.textMuted, fontSize: 10 }}>▾</span>
    </div>
  );
}
