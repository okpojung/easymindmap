// OverflowMenu — 폰 상단 막대의 "⋯" 메뉴 항목 (모바일 웹, 2026-10-05).
//
// 폰 폭에서는 데스크톱 막대의 단추(공유·퍼블리싱·아웃라인·다크·저장·닫기·
// 내보내기…)가 한 줄에 들어가지 않는다. 버튼을 **없애지 않고** 이 메뉴로
// 옮긴다 — 데스크톱에서 할 수 있는 일은 폰에서도 전부 닿아야 한다.
// 항목은 손가락으로 누르기 좋게 44px 높이다.

import type { ReactNode } from 'react';
import type { ThemeTokens } from '@/components/design-tokens/theme';

export function MenuItem({ t, icon, label, desc, title, disabled, active, danger, testId, onClick }: {
  t: ThemeTokens;
  icon?: ReactNode;
  label: ReactNode;
  desc?: ReactNode;
  title?: string;
  disabled?: boolean;
  active?: boolean;
  danger?: boolean;
  testId?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      data-testid={testId}
      title={title}
      disabled={disabled}
      onClick={onClick}
      className="mm-list-row"
      style={{
        display: 'flex', alignItems: 'center', gap: 10, width: '100%',
        minHeight: 44, padding: '6px 10px', textAlign: 'left',
        background: active ? t.primarySoft : 'transparent',
        color: disabled ? t.textSubtle : danger ? t.danger : active ? t.primary : t.text,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.55 : 1,
        fontSize: 13.5, fontWeight: 600,
        ['--row-hover' as string]: t.surfaceAlt,
      }}
    >
      <span style={{
        width: 22, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 15,
      }}>{icon}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', overflowWrap: 'anywhere' }}>{label}</span>
        {desc && (
          <span style={{
            display: 'block', fontSize: 11, fontWeight: 500, color: t.textMuted,
            marginTop: 1, lineHeight: 1.4,
          }}>{desc}</span>
        )}
      </span>
    </button>
  );
}

export function MenuSep({ t }: { t: ThemeTokens }) {
  return <div role="separator" style={{ height: 1, background: t.divider, margin: '4px 6px' }} />;
}
