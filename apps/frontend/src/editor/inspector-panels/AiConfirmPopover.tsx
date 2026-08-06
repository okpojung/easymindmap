// AiConfirmPopover — AI 패널의 "정말 적용할까요?" 확인창.
//
// `window.confirm` 을 쓰지 않는다 (2026-08-04 보고): 브라우저 기본
// confirm 은 화면 **상단 중앙**에 떠서, 왼쪽 패널에서 방금 누른 버튼과
// 멀어 **어느 작업의 확인인지 눈에 안 들어왔다.** 패널 오른쪽 옆·화면
// 세로 중앙에 붙여 띄운다.
//
// 웹 AI 패널이 먼저 쓰던 것을 **API 키 패널과 공용**으로 뽑았다
// (2026-08-06 — 두 모드의 적용 흐름을 하나로 맞추면서). 두 곳이 같은
// 모양·같은 자리에 뜨는 것이 이 컴포넌트의 존재 이유다.
import type { RefObject } from 'react';
import type { ThemeTokens } from '@/components/design-tokens/theme';

export interface ConfirmRequest {
  message: string;
  onOk: () => void;
}

export function AiConfirmPopover({ t, panelRef, req, onClose, testId = 'webai' }: {
  t: ThemeTokens;
  /** 이 패널의 오른쪽에 붙여 띄운다 */
  panelRef: RefObject<HTMLDivElement | null>;
  req: ConfirmRequest | null;
  onClose: () => void;
  /** data-* 접두사 — 기존 e2e 선택자(webai)를 그대로 살린다 */
  testId?: string;
}) {
  if (!req) return null;
  return (
    <div
      {...{ [`data-${testId}-confirm`]: '' }}
      style={{
        position: 'fixed',
        left: (panelRef.current?.getBoundingClientRect().right ?? 384) + 14,
        top: '50%', transform: 'translateY(-50%)',
        zIndex: 80, width: 280,
        background: t.surface, color: t.text,
        border: `1.5px solid ${t.primaryBorder}`, borderRadius: 10,
        boxShadow: '0 10px 34px rgba(0,0,0,.22)', padding: '13px 14px',
      }}
    >
      <div style={{
        whiteSpace: 'pre-line', fontSize: 12.5, lineHeight: 1.65, marginBottom: 11,
      }}>
        {req.message}
      </div>
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
        <button
          {...{ [`data-${testId}-confirm-ok`]: '' }}
          autoFocus
          onClick={() => { const run = req.onOk; onClose(); run(); }}
          style={{
            padding: '6px 16px', borderRadius: 6, border: 'none',
            background: `linear-gradient(135deg, ${t.primary}, ${t.primaryHover})`,
            color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer',
          }}>확인</button>
        <button
          {...{ [`data-${testId}-confirm-cancel`]: '' }}
          onClick={onClose}
          style={{
            padding: '6px 14px', borderRadius: 6,
            border: `1px solid ${t.border}`, background: t.surface,
            color: t.text, fontSize: 12, fontWeight: 600, cursor: 'pointer',
          }}>취소</button>
      </div>
    </div>
  );
}
