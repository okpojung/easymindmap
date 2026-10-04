// ActionSheet — 폰에서 **줄마다 [⋯] 를 누르면 아래에서 올라오는 메뉴** (모바일 웹, 2026-10-05).
//
// 데스크톱 문서함은 줄 끝에 아이콘 여섯 개를 늘어놓는다. 폰 폭에는 그 자리가
// 없어 관리 칸이 화면 밖으로 잘렸다 — 맵을 지우지도 옮기지도 못했다.
// 폰에서는 그 아이콘들을 **같은 동작 그대로** 이 시트에 세로로 담는다.
// 항목 하나가 48px 높이라 손가락으로 누르기 쉽고, 글자가 함께 있어 아이콘만
// 보고 뜻을 맞힐 필요가 없다.
//
// 닫기: 바깥(어두운 배경) · [취소] · Esc(부르는 쪽이 처리) · 항목을 누르면 저절로.

import type { ReactNode } from 'react';
import type { ThemeTokens } from '@/components/design-tokens/theme';
import { useTr } from '@/i18n';

export interface SheetItem {
  key: string;
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  danger?: boolean;
  /** 지금 켜져 있는 선택(정렬 기준 등) — 오른쪽에 ✓ */
  checked?: boolean;
  testId?: string;
  disabled?: boolean;
}

export function ActionSheet({
  t, title, subtitle, items, extra, onClose, testId = 'm-action-sheet', zIndex = 320,
}: {
  t: ThemeTokens;
  title?: ReactNode;
  subtitle?: ReactNode;
  /** `'divider'` = 가는 선, `{ heading }` = 작은 묶음 제목(누를 수 없다) */
  items: (SheetItem | 'divider' | { key: string; heading: string })[];
  /** 항목 아래에 끼울 것 — 유료 모듈 단추처럼 이쪽이 모양을 정하지 않는 것 */
  extra?: ReactNode;
  onClose: () => void;
  testId?: string;
  zIndex?: number;
}) {
  const tr = useTr();
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex, background: 'rgba(0,0,0,0.35)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
    >
      <div
        data-testid={testId}
        role="menu"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 520,
          maxHeight: 'calc(100dvh - 48px)', overflowY: 'auto', overscrollBehavior: 'contain',
          background: t.surface, color: t.text,
          borderRadius: '14px 14px 0 0', border: `1px solid ${t.border}`, borderBottom: 'none',
          boxShadow: '0 -10px 30px rgba(0,0,0,0.22)',
          padding: '6px 0 calc(8px + env(safe-area-inset-bottom))',
          boxSizing: 'border-box',
        }}
      >
        {/* 끌어내리는 손잡이 모양 — 시트라는 것을 알린다(동작은 바깥 누르기) */}
        <div aria-hidden style={{
          width: 36, height: 4, borderRadius: 2, background: t.border, margin: '4px auto 6px',
        }} />
        {(title || subtitle) && (
          <div style={{ padding: '2px 18px 8px', borderBottom: `1px solid ${t.divider}` }}>
            {title && (
              <div style={{
                fontSize: 14, fontWeight: 800,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{title}</div>
            )}
            {subtitle && (
              <div style={{ fontSize: 12, color: t.textMuted, marginTop: 2, lineHeight: 1.5 }}>{subtitle}</div>
            )}
          </div>
        )}
        {items.map((it, i) => (it === 'divider' ? (
          <div key={`d${i}`} style={{ height: 1, background: t.divider, margin: '4px 0' }} />
        ) : 'heading' in it ? (
          <div key={it.key} style={{
            padding: '10px 18px 4px', fontSize: 11.5, fontWeight: 700, color: t.textSubtle,
          }}>{it.heading}</div>
        ) : (
          <button
            key={it.key}
            type="button"
            role="menuitem"
            data-testid={it.testId}
            disabled={it.disabled}
            onClick={() => { onClose(); it.onSelect(); }}
            style={{
              display: 'flex', alignItems: 'center', gap: 12, width: '100%',
              minHeight: 48, padding: '0 18px', border: 'none', background: 'transparent',
              color: it.danger ? '#d9534f' : t.text, fontSize: 15, fontWeight: 500,
              textAlign: 'left', cursor: it.disabled ? 'default' : 'pointer',
              opacity: it.disabled ? 0.45 : 1,
            }}
          >
            <span aria-hidden style={{
              width: 22, display: 'inline-flex', justifyContent: 'center', flexShrink: 0,
              color: it.danger ? '#d9534f' : t.textMuted,
            }}>{it.icon}</span>
            <span style={{ flex: 1, minWidth: 0 }}>{it.label}</span>
            {it.checked && <span aria-hidden style={{ color: t.primary, fontWeight: 800 }}>✓</span>}
          </button>
        )))}
        {extra && <div style={{ padding: '6px 18px' }}>{extra}</div>}
        <div style={{ padding: '6px 12px 0' }}>
          <button
            type="button"
            data-testid={`${testId}-cancel`}
            onClick={onClose}
            style={{
              width: '100%', height: 44, borderRadius: 10,
              border: `1px solid ${t.border}`, background: t.surfaceAlt,
              color: t.text, fontSize: 15, fontWeight: 600, cursor: 'pointer',
            }}
          >{tr('common.cancel')}</button>
        </div>
      </div>
    </div>
  );
}
