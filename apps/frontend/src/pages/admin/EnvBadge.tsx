// 지금 보고 있는 콘솔이 **개발인가 운영인가** (2026-08-14).
//
// 개발(dev.mindmap.ai.kr/admin)과 운영(admin.easymindmap.org)에 콘솔이
// 하나씩 생기면서 **화면이 완전히 똑같아졌다.** 개발인 줄 알고 운영 회원의
// 요금제를 바꾸는 실수가 가능해진다 — 되돌릴 수는 있지만 그 사람에게는
// 이미 한도가 바뀐 뒤다.
//
// 그래서 **로그인 화면에도** 붙인다. 들어간 뒤에 아는 것보다,
// 비밀번호를 넣기 전에 아는 편이 낫다.

import { apiEnv, apiHost } from '@/services/cloud/adminApi';

const LOOK = {
  local: { label: '로컬', bg: '#e8eaed', fg: '#5f6368', border: '#c7c9cc' },
  dev: { label: '개발', bg: '#e3f0ff', fg: '#1a56b0', border: '#9dc2f2' },
  prod: { label: '운영', bg: '#fde8e8', fg: '#b3261e', border: '#f0a9a4' },
} as const;

export function EnvBadge() {
  const look = LOOK[apiEnv()];
  return (
    <span
      data-testid="admin-env-badge"
      data-env={apiEnv()}
      // 어느 API 를 보는지가 판정 근거다 — 마우스를 올리면 그대로 보여 준다
      title={`API: ${apiHost}`}
      style={{
        fontSize: 11, fontWeight: 800, padding: '3px 8px', borderRadius: 999,
        background: look.bg, color: look.fg, border: `1px solid ${look.border}`,
        whiteSpace: 'nowrap', letterSpacing: '0.02em',
      }}
    >
      {look.label}
    </span>
  );
}
