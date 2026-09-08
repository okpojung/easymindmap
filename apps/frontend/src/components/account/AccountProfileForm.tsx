// AccountProfileForm — 계정 메뉴 ▸ 계정 프로필 (2026-09-08).
//
// 이름·이메일·휴대폰을 보여 주고 **이름과 휴대폰을 고친다**. 처음엔 이름만
// 고치게 했는데, 실사용에서 가입 때 적은 성명·휴대폰이 비어 있는 계정이
// 나왔다(메일 확인이 켜진 서버는 가입 직후 세션이 없어 프로필 저장 차례가
// 오지 않았다 — profileStore 의 pending 참조). 그 계정이 스스로 채울 수
// 있어야 하므로 휴대폰도 여기서 넣는다. 이메일은 로그인 계정이라 못 바꾼다.
//
// 서버 `PUT /account/profile` 은 성명·휴대폰을 **함께** 받으므로(안 실으면
// 지워진다) 언제나 둘 다 실어 보낸다. 읽기가 실패했으면 "등록되지 않음"이
// 아니라 **실패한 이유**를 보여 준다 — 둘은 다른 상황이다.

import { useEffect, useState } from 'react';
import type { ThemeTokens } from '@/components/design-tokens/theme';
import { cloudApi, CloudError } from '@/services/cloud/apiClient';
import { useAuthStore } from '@/stores/authStore';
import { useProfileStore } from '@/stores/profileStore';
import { COUNTRIES, DEFAULT_COUNTRY, formatPhone as formatPhoneInput } from '@/utils/countryCodes';

export function AccountProfileForm({ t, onSaved }: { t: ThemeTokens; onSaved?: (m: string) => void }) {
  const session = useAuthStore((s) => s.session);
  const profile = useProfileStore((s) => s.profile);
  const loaded = useProfileStore((s) => s.loaded);
  const loadError = useProfileStore((s) => s.error);
  const load = useProfileStore((s) => s.load);
  const setProfile = useProfileStore((s) => s.setProfile);
  const [name, setName] = useState(profile?.fullName ?? '');
  const [dial, setDial] = useState((profile?.phoneCountry ?? '').replace(/\D/g, '') || DEFAULT_COUNTRY.dial);
  const [phone, setPhone] = useState(profile?.phoneNumber ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { void load(); }, [load]);
  // 서버에서 읽어 오면 입력칸을 그 값으로
  useEffect(() => {
    setName(profile?.fullName ?? '');
    const cc = (profile?.phoneCountry ?? '').replace(/\D/g, '');
    setDial(cc || DEFAULT_COUNTRY.dial);
    setPhone(profile?.phoneNumber ? formatPhoneInput(cc || DEFAULT_COUNTRY.dial, profile.phoneNumber) : '');
  }, [profile?.fullName, profile?.phoneCountry, profile?.phoneNumber]);

  const phoneDigits = phone.replace(/\D/g, '');
  const savedDigits = (profile?.phoneNumber ?? '').replace(/\D/g, '');
  const savedDial = (profile?.phoneCountry ?? '').replace(/\D/g, '') || DEFAULT_COUNTRY.dial;
  const dirty = name.trim() !== (profile?.fullName ?? '').trim()
    || phoneDigits !== savedDigits
    || (phoneDigits ? dial !== savedDial : false);

  const save = async () => {
    const fullName = name.trim();
    if (!fullName) { setError('이름을 입력해 주세요.'); return; }
    if (fullName.length > 100) { setError('이름은 100자까지입니다.'); return; }
    if (phoneDigits && phoneDigits.length < 6) { setError('휴대폰 번호가 너무 짧습니다.'); return; }
    setBusy(true); setError(null);
    try {
      const p = await cloudApi.saveProfile({
        fullName,
        phoneCountry: phoneDigits ? `+${dial}` : undefined,
        phoneNumber: phoneDigits || undefined,
      });
      setProfile(p);
      onSaved?.('계정 프로필을 저장했습니다.');
    } catch (err) {
      setError(err instanceof CloudError ? err.message : '저장하지 못했습니다. 잠시 뒤 다시 시도해 주세요.');
    } finally {
      setBusy(false);
    }
  };

  const label = { fontSize: 11.5, fontWeight: 700 as const, color: t.textMuted, marginBottom: 4 };
  const box = {
    height: 34, boxSizing: 'border-box' as const, padding: '0 10px',
    borderRadius: 7, border: `1px solid ${t.border}`, fontSize: 13, color: t.text, background: t.surface,
  };
  const ro = { ...box, width: '100%', display: 'flex', alignItems: 'center', background: t.surfaceAlt, color: t.textMuted };
  const canSave = loaded && !busy && dirty;

  return (
    <div data-testid="account-profile-form" style={{ display: 'grid', gap: 12 }}>
      {loadError && (
        <div data-testid="profile-load-error" style={{
          fontSize: 12, lineHeight: 1.5, padding: '8px 10px', borderRadius: 7,
          border: `1px solid ${t.warning}`, borderLeft: `4px solid ${t.warning}`, color: t.text,
        }}>
          ⚠ 프로필을 서버에서 읽지 못했습니다 — {loadError}
          <div style={{ fontSize: 10.5, color: t.textSubtle, marginTop: 2 }}>
            아래 값은 비어 보이지만 서버에는 있을 수 있습니다. 새로고침한 뒤 다시 열어 주세요.
          </div>
        </div>
      )}
      <div>
        <div style={label}>이름</div>
        <input
          data-testid="profile-name"
          value={name}
          placeholder={loaded ? '홍길동' : '불러오는 중…'}
          maxLength={100}
          disabled={busy || !loaded}
          onChange={(e) => { setName(e.target.value); setError(null); }}
          onKeyDown={(e) => { if (e.key === 'Enter' && canSave) void save(); }}
          style={{ ...box, width: '100%' }}
        />
        <div style={{ fontSize: 10.5, color: t.textSubtle, marginTop: 4 }}>
          아바타 글자와 협업 화면의 이름표에 이 이름이 쓰입니다.
        </div>
      </div>
      <div>
        <div style={label}>이메일</div>
        <div data-testid="profile-email" style={ro}>{session?.email ?? '—'}</div>
        <div style={{ fontSize: 10.5, color: t.textSubtle, marginTop: 4 }}>로그인 계정이라 바꿀 수 없습니다.</div>
      </div>
      <div>
        <div style={label}>휴대폰</div>
        <div style={{ display: 'flex', gap: 6 }}>
          <select
            data-testid="profile-dial"
            value={dial}
            disabled={busy || !loaded}
            onChange={(e) => { setDial(e.target.value); setPhone((p) => formatPhoneInput(e.target.value, p)); setError(null); }}
            style={{ ...box, width: 118, padding: '0 6px' }}
          >
            {COUNTRIES.map((c) => (
              <option key={c.iso} value={c.dial}>{c.flag} {c.name} +{c.dial}</option>
            ))}
          </select>
          <input
            data-testid="profile-phone"
            value={phone}
            placeholder={loaded ? '010-1234-5678' : '불러오는 중…'}
            inputMode="tel"
            autoComplete="tel"
            disabled={busy || !loaded}
            onChange={(e) => { setPhone(formatPhoneInput(dial, e.target.value)); setError(null); }}
            onKeyDown={(e) => { if (e.key === 'Enter' && canSave) void save(); }}
            style={{ ...box, flex: 1, minWidth: 0 }}
          />
        </div>
        <div style={{ fontSize: 10.5, color: t.textSubtle, marginTop: 4 }}>
          {loaded && !savedDigits && !loadError ? '등록된 번호가 없습니다 — 여기서 넣을 수 있습니다.' : '협업맵에서 이름에 마우스를 올린 사람에게 보입니다. 비워 두면 지웁니다.'}
        </div>
      </div>
      {error && (
        <div data-testid="profile-error" style={{ fontSize: 12, color: t.danger }}>{error}</div>
      )}
      <button
        data-testid="profile-save"
        disabled={!canSave}
        onClick={() => void save()}
        style={{
          height: 34, borderRadius: 7, border: 'none', fontSize: 12.5, fontWeight: 700,
          background: t.primary, color: '#fff',
          cursor: canSave ? 'pointer' : 'default', opacity: canSave ? 1 : 0.55,
        }}
      >{busy ? '저장 중…' : '저장'}</button>
    </div>
  );
}
