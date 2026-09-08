// AvatarBadge — 동그란 아바타 한 개 (2026-09-08).
//
// 사진(data URL) → <img>, 이모지 아바타 → 글자, 없으면 이름 첫 자(성).
// 우상단 아바타 버튼과 계정 프로필 창의 미리보기가 같은 것을 쓴다.

import type { ThemeTokens } from '@/components/design-tokens/theme';
import { avatarInitialOf, avatarView } from '@/utils/profileName';

export function AvatarBadge({
  t, avatar, fullName, email, size, guest,
}: {
  t: ThemeTokens;
  avatar: string | null | undefined;
  fullName: string | null | undefined;
  email: string | null | undefined;
  size: number;
  /** Guest 체험 중 — 'G' */
  guest?: boolean;
}) {
  const v = avatarView(avatar);
  const base = {
    width: size, height: size, borderRadius: '50%', overflow: 'hidden' as const,
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  };
  if (v?.kind === 'image') {
    return (
      <span data-testid="avatar-image" style={{ ...base, background: t.surfaceAlt }}>
        <img src={v.src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      </span>
    );
  }
  if (v?.kind === 'emoji') {
    return (
      <span data-testid="avatar-emoji" style={{ ...base, background: t.surfaceAlt, fontSize: size * 0.62, lineHeight: 1 }}>
        {v.ch}
      </span>
    );
  }
  return (
    <span
      data-testid="avatar-initial"
      style={{
        ...base,
        background: `linear-gradient(135deg, ${t.primary}, ${t.primaryHover})`,
        color: '#fff', fontSize: Math.round(size * 0.4), fontWeight: 700,
      }}
    >
      {guest ? 'G' : avatarInitialOf(fullName, email)}
    </span>
  );
}
