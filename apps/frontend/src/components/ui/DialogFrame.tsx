// DialogFrame — 계정 메뉴 계열 **팝업의 공통 틀** (2026-09-08 사용자 결정).
//
// 규칙 (coding-conventions.md §5-1-7):
//   ① 오른쪽 위에 닫기 **×** — 아래 [닫기]와 같은 일을 한다.
//   ② 내용이 길어 스크롤되어도 **제목은 고정**된다 — 본문만 스크롤한다.
//      (AI 설정처럼 긴 창에서 제목·× 가 함께 밀려 올라가던 것을 막는다)
//   ③ 바깥(어두운 배경)을 누르면 닫힌다. Esc 는 부르는 쪽이 이미 처리한다.
//   ④ 맨 아래 [닫기] 같은 발 버튼은 `footer` 로 — 본문과 함께 스크롤되지 않는다.
//
// 구조: overlay > panel(flex column, maxHeight 88vh) > header(고정) + body(overflow) + footer(고정)

import type { ReactNode } from 'react';
import type { ThemeTokens } from '@/components/design-tokens/theme';

export function DialogFrame({
  t, testId, title, subtitle, onClose, width = 'min(430px, 92vw)', zIndex = 245, children, footer, closeDisabled,
}: {
  t: ThemeTokens;
  /** 패널의 data-testid — × 는 `${testId}-x` */
  testId: string;
  title: ReactNode;
  subtitle?: ReactNode;
  onClose: () => void;
  width?: string;
  zIndex?: number;
  children: ReactNode;
  footer?: ReactNode;
  /** 진행 중(삭제 중 등)이라 닫으면 안 될 때 */
  closeDisabled?: boolean;
}) {
  const close = () => { if (!closeDisabled) onClose(); };
  return (
    <div
      onClick={close}
      style={{
        position: 'fixed', inset: 0, zIndex, background: 'rgba(0,0,0,0.35)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        data-testid={testId}
        role="dialog"
        aria-modal="true"
        style={{
          position: 'relative', width, maxHeight: '88vh',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          background: t.surface, color: t.text,
          border: `1px solid ${t.border}`, borderRadius: 12,
          boxShadow: '0 16px 48px rgba(0,0,0,0.3)',
        }}
      >
        {/* 머리 — 스크롤되지 않는다 */}
        <div data-testid={`${testId}-head`} style={{ flexShrink: 0, padding: '18px 44px 8px 20px' }}>
          <div style={{ fontSize: 15.5, fontWeight: 800 }}>{title}</div>
          {subtitle && (
            <div style={{ fontSize: 11.5, color: t.textMuted, lineHeight: 1.6, marginTop: 4 }}>{subtitle}</div>
          )}
        </div>
        <DialogXButton t={t} testId={`${testId}-x`} onClose={close} disabled={closeDisabled} />
        {/* 본문 — 여기만 스크롤 */}
        <div data-testid={`${testId}-body`} style={{ flex: '1 1 auto', minHeight: 0, overflowY: 'auto', padding: '4px 20px 12px' }}>
          {children}
        </div>
        {footer && (
          <div data-testid={`${testId}-foot`} style={{ flexShrink: 0, padding: '8px 20px 18px' }}>{footer}</div>
        )}
      </div>
    </div>
  );
}

/** 발에 두는 표준 [닫기] 버튼 */
export function DialogCloseButton({ t, onClick, testId, label = '닫기' }: { t: ThemeTokens; onClick: () => void; testId: string; label?: string }) {
  return (
    <button
      data-testid={testId}
      onClick={onClick}
      style={{
        width: '100%', height: 34, borderRadius: 7,
        border: `1px solid ${t.border}`, background: t.surfaceAlt,
        color: t.text, fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
      }}
    >{label}</button>
  );
}

/**
 * 팝업 오른쪽 위의 **닫기 ×** (coding-conventions §5-1-7).
 *
 * `DialogFrame` 이 쓰는 그 버튼을 **따로 내보낸다** (2026-09-18). 아직
 * `DialogFrame` 으로 옮기지 못한 팝업들(퍼블리싱·저장·폴더 고르기·표·
 * 코드·다중 추가…)이 **같은 × 를 같은 자리에** 두게 하려는 것이다 —
 * 손으로 그리면 팝업마다 크기·색·위치가 조금씩 달라지고, 그것이
 * §5-1-6("같은 개념은 어디서나 같은 모습") 위반이다.
 *
 * ★ 두는 쪽이 지킬 것: **감싸는 패널에 `position: 'relative'`** 가 있어야
 *   하고, 제목 줄의 오른쪽 여백을 40px 쯤 비워야 글자가 × 밑으로
 *   들어가지 않는다.
 */
export function DialogXButton({
  t, testId, onClose, disabled,
}: {
  t: ThemeTokens;
  /** `{대화상자 testId}-x` 로 준다 */
  testId: string;
  onClose: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      title="닫기"
      aria-label="닫기"
      onClick={() => { if (!disabled) onClose(); }}
      disabled={disabled}
      style={{
        position: 'absolute', top: 10, right: 10, width: 28, height: 28, borderRadius: 7,
        border: 'none', background: 'transparent', color: t.textMuted,
        cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.4 : 1,
        fontSize: 18, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = t.surfaceAlt; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
    >
      ×
    </button>
  );
}
