// AccountProfileForm — 계정 메뉴 ▸ 계정 프로필 (2026-09-08).
//
// 이름·이메일·휴대폰을 보여 주고 **이름만 고친다** (사용자 요청). 휴대폰은
// 가입 때 받은 것을 그대로 보여 준다 — 서버 `PUT /account/profile` 은 성명과
// 휴대폰을 함께 받으므로, 이름만 바꿀 때도 지금 휴대폰을 그대로 실어
// 보낸다(안 실으면 지워진다).

import { useEffect, useState } from 'react';
import type { ThemeTokens } from '@/components/design-tokens/theme';
import { cloudApi, CloudError } from '@/services/cloud/apiClient';
import { useAuthStore } from '@/stores/authStore';
import { useProfileStore } from '@/stores/profileStore';
import { formatPhone } from '@/utils/profileName';

export function AccountProfileForm({ t, onSaved }: { t: ThemeTokens; onSaved?: (m: string) => void }) {
  const session = useAuthStore((s) => s.session);
  const profile = useProfileStore((s) => s.profile);
  const loaded = useProfileStore((s) => s.loaded);
  const load = useProfileStore((s) => s.load);
  const setProfile = useProfileStore((s) => s.setProfile);
  const [name, setName] = useState(profile?.fullName ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { void load(); }, [load]);
  // 서버에서 읽어 오면 입력칸을 그 값으로
  useEffect(() => { setName(profile?.fullName ?? ''); }, [profile?.fullName]);

  const phone = formatPhone(profile?.phoneCountry, profile?.phoneNumber);
  const dirty = name.trim() !== (profile?.fullName ?? '').trim();

  const save = async () => {
    const fullName = name.trim();
    if (!fullName) { setError('이름을 입력해 주세요.'); return; }
    if (fullName.length > 100) { setError('이름은 100자까지입니다.'); return; }
    setBusy(true); setError(null);
    try {
      const p = await cloudApi.saveProfile({
        fullName,
        phoneCountry: profile?.phoneCountry ?? undefined,
        phoneNumber: profile?.phoneNumber ?? undefined,
      });
      setProfile(p);
      onSaved?.('이름을 저장했습니다.');
    } catch (err) {
      setError(err instanceof CloudError ? err.message : '저장하지 못했습니다. 잠시 뒤 다시 시도해 주세요.');
    } finally {
      setBusy(false);
    }
  };

  const label = { fontSize: 11.5, fontWeight: 700 as const, color: t.textMuted, marginBottom: 4 };
  const box = {
    width: '100%', height: 34, boxSizing: 'border-box' as const, padding: '0 10px',
    borderRadius: 7, border: `1px solid ${t.border}`, fontSize: 13, color: t.text,
  };
  const ro = { ...box, display: 'flex', alignItems: 'center', background: t.surfaceAlt, color: t.textMuted };

  return (
    <div data-testid="account-profile-form" style={{ display: 'grid', gap: 12 }}>
      <div>
        <div style={label}>이름</div>
        <input
          data-testid="profile-name"
          value={name}
          placeholder={loaded ? '홍길동' : '불러오는 중…'}
          maxLength={100}
          disabled={busy || !loaded}
          onChange={(e) => { setName(e.target.value); setError(null); }}
          onKeyDown={(e) => { if (e.key === 'Enter' && dirty && !busy) void save(); }}
          style={{ ...box, background: t.surface }}
        />
        <div style={{ fontSize: 10.5, color: t.textSubtle, marginTop: 4 }}>
          아바타 글자와 협업 화면의 이름표에 이 이름이 쓰입니다.
        </div>
      </div>
      <div>
        <div style={label}>이메일</div>
        <div data-testid="profile-email" style={ro}>{session?.email ?? '—'}</div>
      </div>
      <div>
        <div style={label}>휴대폰</div>
        <div data-testid="profile-phone" style={ro}>
          {!loaded ? '불러오는 중…' : (phone ?? '등록되지 않음')}
        </div>
      </div>
      {error && (
        <div data-testid="profile-error" style={{ fontSize: 12, color: t.danger }}>{error}</div>
      )}
      <button
        data-testid="profile-save"
        disabled={busy || !loaded || !dirty}
        onClick={() => void save()}
        style={{
          height: 34, borderRadius: 7, border: 'none', fontSize: 12.5, fontWeight: 700,
          background: t.primary, color: '#fff',
          cursor: busy || !dirty ? 'default' : 'pointer', opacity: busy || !loaded || !dirty ? 0.55 : 1,
        }}
      >{busy ? '저장 중…' : '이름 저장'}</button>
    </div>
  );
}
