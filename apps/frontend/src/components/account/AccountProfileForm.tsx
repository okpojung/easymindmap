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

import { LinkedAccounts } from './LinkedAccounts';
import { clearPhoneHint, readPhoneHint, type PhoneHint } from '@/services/cloud/socialPhone';
import { ProPhoneVerification } from '@pro';
import { useEffect, useRef, useState } from 'react';
import type { ThemeTokens } from '@/components/design-tokens/theme';
import { cloudApi, CloudError } from '@/services/cloud/apiClient';
import { isAuthIdentityCurrent, useAuthStore, type AuthIdentity } from '@/stores/authStore';
import { profileOwner, useProfileStore } from '@/stores/profileStore';
import { COUNTRIES, DEFAULT_COUNTRY, countryName, formatPhone as formatPhoneInput } from '@/utils/countryCodes';
import { AVATAR_EMOJIS, nameProblem } from '@/utils/profileName';
import { fileToAvatarDataUrl } from '@/utils/avatarImage';
import { AvatarBadge } from './AvatarBadge';
import { useTr } from '@/i18n';
import { useCoarse } from '@/hooks/useViewport';

interface FormProps {
  t: ThemeTokens;
  onSaved?: (m: string) => void;
  /** 회원탈퇴 흐름을 여는 것 — 계정 메뉴에서 이 창으로 옮겼다 (2026-09-08) */
  onDeleteAccount?: () => void;
}
export function AccountProfileForm(props: FormProps) {
  const generation = useAuthStore(s => s.generation);
  const userId = useAuthStore(s => s.session?.userId ?? null);
  return <AccountFormFields key={generation + ':' + userId} {...props} identity={{ generation, userId }} />;
}
function AccountFormFields({ t, onSaved, onDeleteAccount, identity }: FormProps & { identity: AuthIdentity }) {
  const session = useAuthStore((s) => s.session);
  const owner = profileOwner(identity);
  const current = () => isAuthIdentityCurrent(identity);
  const profile = useProfileStore((s) => s.forUser === owner ? s.profile : null);
  const loaded = useProfileStore((s) => s.loaded && s.forUser === owner && !!s.profile);
  const loadError = useProfileStore((s) => s.forUser === owner ? s.error : null);
  const load = useProfileStore((s) => s.load);
  const setProfile = useProfileStore((s) => s.setProfile);
  const [phoneBusy,setPhoneBusy]=useState(false);
  const [editedName, setName] = useState<string | null>(null);
  const name = editedName ?? profile?.fullName ?? '';
  const [dial, setDial] = useState((profile?.phoneCountry ?? '').replace(/\D/g, '') || DEFAULT_COUNTRY.dial);
  const [phone, setPhone] = useState(profile?.phoneNumber ?? '');
  // 카카오·네이버에서 받은 번호로 빈 칸을 채웠는가 (2026-11-28) — 저장 전 안내용
  const [phoneFrom, setPhoneFrom] = useState<PhoneHint['provider'] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 프로필 사진/아바타 (2026-09-08) — undefined = 서버 값 그대로, null = 지움
  const [avatar, setAvatar] = useState<string | null | undefined>(undefined);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const tr = useTr();
  const coarse = useCoarse();
  const shownAvatar = avatar === undefined ? (profile?.avatar ?? null) : avatar;
  const avatarReady = profile?.avatarReady !== false;

  useEffect(() => { void load(); }, [load]);
  // 서버에서 읽어 오면 입력칸을 그 값으로
  useEffect(() => {
    const cc = (profile?.phoneCountry ?? '').replace(/\D/g, '');
    setDial(cc || DEFAULT_COUNTRY.dial);
    setPhone(profile?.phoneNumber ? formatPhoneInput(cc || DEFAULT_COUNTRY.dial, profile.phoneNumber) : '');
    setPhoneFrom(null);
    // 등록된 번호가 없고 방금 카카오·네이버를 연결했다면 그 번호를 **채워만** 둔다(저장은 [저장], 인증은 ARS)
    if (!profile?.phoneNumber && profile) {
      const h = readPhoneHint(session?.userId);
      if (h) {
        const d = h.country.replace(/\D/g, '') || DEFAULT_COUNTRY.dial;
        setDial(d);
        setPhone(formatPhoneInput(d, h.number));
        setPhoneFrom(h.provider);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 프로필의 다른 칸(사진 등)이 바뀌어도 입력 중인 번호를 덮지 않는다
  }, [!!profile, profile?.phoneCountry, profile?.phoneNumber, session?.userId]);

  const phoneDigits = phone.replace(/\D/g, '');
  const savedDigits = (profile?.phoneNumber ?? '').replace(/\D/g, '');
  const savedDial = (profile?.phoneCountry ?? '').replace(/\D/g, '') || DEFAULT_COUNTRY.dial;
  const shownCountry = COUNTRIES.find((country) => country.dial === dial) ?? DEFAULT_COUNTRY;
  const avatarDirty = avatar !== undefined && (avatar ?? null) !== (profile?.avatar ?? null);
  const dirty = name.trim() !== (profile?.fullName ?? '').trim()
    || phoneDigits !== savedDigits
    || (phoneDigits ? dial !== savedDial : false)
    || avatarDirty;

  const save = async () => {
    if (!current() || !canSave) return;
    const fullName = name.trim();
    { const bad = nameProblem(fullName); if (bad) { setError(bad); return; } }
    if (phoneDigits && phoneDigits.length < 6) { setError(tr('auth.profile.phoneTooShort')); return; }
    setBusy(true); setError(null);
    try {
      const p = await cloudApi.saveProfile({
        fullName,
        phoneCountry: phoneDigits ? `+${dial}` : undefined,
        phoneNumber: phoneDigits || undefined,
        ...(avatarDirty ? { avatar: avatar ?? null } : {}),
      });
      if (!current()) return;
      if (phoneFrom) clearPhoneHint();
      setProfile(p, identity);
      if (!current()) return;
      setName(null);
      setAvatar(undefined);
      if (current()) onSaved?.(tr('auth.profile.saved'));
    } catch (err) {
      if (current()) setError(err instanceof CloudError ? err.message : tr('auth.profile.saveFailed'));
    } finally {
      if (current()) setBusy(false);
    }
  };

  const label = { fontSize: 11.5, fontWeight: 700 as const, color: t.textMuted, marginBottom: 4 };
  const box = {
    height: 34, boxSizing: 'border-box' as const, padding: '0 10px',
    borderRadius: 7, border: `1px solid ${t.border}`, fontSize: 13, color: t.text, background: t.surface,
  };
  const ro = { ...box, width: '100%', display: 'flex', alignItems: 'center', background: t.surfaceAlt, color: t.textMuted };
  const changedVerified = !!profile?.phoneVerifiedAt && (phoneDigits !== savedDigits || dial !== savedDial);
  const canSave = loaded && !busy && !phoneBusy && !changedVerified && dirty;

  const pickFile = async (f: File | undefined) => {
    if (!f) return;
    setError(null);
    try {
      const image = await fileToAvatarDataUrl(f);
      if (current()) setAvatar(image);
    } catch (err) {
      if (current()) setError(err instanceof Error ? err.message : tr('auth.profile.photoReadFailed'));
    } finally {
      if (current() && fileRef.current) fileRef.current.value = '';
    }
  };
  const chip = (active: boolean) => ({
    // 손가락이면 40 — 32 는 이웃 칸을 잘못 누르기 쉽다
    width: coarse ? 40 : 32, height: coarse ? 40 : 32, borderRadius: 8, fontSize: 18, lineHeight: 1, cursor: 'pointer',
    border: `1px solid ${active ? t.primary : t.border}`, background: active ? t.surfaceAlt : t.surface,
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
  });

  return (
    // minmax(0, 1fr) — 그냥 grid 면 칸이 가장 넓은 자식(사진 단추 줄)만큼 늘어나
    // 좁은 화면(폰 대화상자 336px)에서 입력칸이 오른쪽으로 삐져나갔다
    <div data-testid="account-profile-form" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 12 }}>
      {/* 사진/아바타 — 네이버 웨일 프로필처럼. 없으면 이름 첫 자 (2026-09-08) */}
      <div>
        <div style={label}>{tr('auth.profile.photo')}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <AvatarBadge t={t} avatar={shownAvatar} fullName={name || profile?.fullName} email={session?.email} size={56} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              <input
                ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden
                data-testid="avatar-file"
                onChange={(e) => void pickFile(e.target.files?.[0])}
              />
              <button
                type="button" data-testid="avatar-pick"
                disabled={busy || !loaded || !avatarReady}
                onClick={() => fileRef.current?.click()}
                style={{ ...box, height: 30, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
              >{tr('auth.profile.pickPhoto')}</button>
              <button
                type="button" data-testid="avatar-clear"
                disabled={busy || !loaded || !shownAvatar}
                onClick={() => setAvatar(null)}
                style={{ ...box, height: 30, cursor: 'pointer', fontSize: 12, opacity: shownAvatar ? 1 : 0.5 }}
              >{tr('auth.profile.resetAvatar')}</button>
            </div>
            <div data-testid="avatar-emojis" style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {AVATAR_EMOJIS.map((ch) => (
                <button
                  key={ch} type="button" title={tr('auth.profile.avatarTitle', { ch })}
                  disabled={busy || !loaded || !avatarReady}
                  onClick={() => setAvatar(`emoji:${ch}`)}
                  style={chip(shownAvatar === `emoji:${ch}`)}
                >{ch}</button>
              ))}
            </div>
          </div>
        </div>
        <div style={{ fontSize: 10.5, color: t.textSubtle, marginTop: 4 }}>
          {!avatarReady
            ? tr('auth.profile.avatarNotReady')
            : tr('auth.profile.avatarNote')}
        </div>
      </div>
      {loadError && (
        <div data-testid="profile-load-error" style={{
          fontSize: 12, lineHeight: 1.5, padding: '8px 10px', borderRadius: 7,
          border: `1px solid ${t.warning}`, borderLeft: `4px solid ${t.warning}`, color: t.text,
        }}>
          {tr('auth.profile.loadError', { why: loadError })}
          <div style={{ fontSize: 10.5, color: t.textSubtle, marginTop: 2 }}>
            {tr('auth.profile.loadErrorHint')} <button type="button" onClick={() => { if (current()) void load({ force: true }); }}>{tr('common.retry')}</button>
          </div>
        </div>
      )}
      <div>
        <div style={label}>{tr('auth.profile.name')}</div>
        <input
          data-testid="profile-name"
          value={name}
          placeholder={loaded ? tr('auth.profile.namePh') : tr('common.loading')}
          maxLength={100}
          disabled={busy || !loaded}
          onChange={(e) => { setName(e.target.value); setError(null); }}
          onKeyDown={(e) => { if (e.key === 'Enter' && canSave) void save(); }}
          style={{ ...box, width: '100%' }}
        />
        <div style={{ fontSize: 10.5, color: t.textSubtle, marginTop: 4 }}>
          {tr('auth.profile.nameNote')}
        </div>
      </div>
      <div>
        <div style={label}>{tr('auth.profile.email')}</div>
        <div data-testid="profile-email" style={ro}>{session?.email ?? '—'}</div>
        <div style={{ fontSize: 10.5, color: t.textSubtle, marginTop: 4 }}>{tr('auth.profile.emailNote')}</div>
      </div>
      {/* 로그인 연결 — 카카오·네이버·구글 (2026-11-28) */}
      <LinkedAccounts t={t} />
      <div>
        <div style={label}>{tr('auth.profile.phone')}</div>
        <div data-testid="profile-phone-fields" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          <select
            data-testid="profile-dial"
            aria-label={`${countryName(shownCountry)} +${dial}`}
            title={`${countryName(shownCountry)} +${dial}`}
            value={dial}
            disabled={busy || !loaded}
            onChange={(e) => { setDial(e.target.value); setPhone((p) => formatPhoneInput(e.target.value, p)); setError(null); }}
            style={{ ...box, width: 160, flex: '0 0 160px', maxWidth: '100%', padding: '0 6px' }}
          >
            {COUNTRIES.map((c) => (
              <option key={c.iso} value={c.dial}>+{c.dial} {c.flag} {countryName(c)}</option>
            ))}
          </select>
          <input
            data-testid="profile-phone"
            value={phone}
            placeholder={loaded ? '010-1234-5678' : tr('common.loading')}
            inputMode="tel"
            autoComplete="tel"
            disabled={busy || !loaded}
            onChange={(e) => { setPhone(formatPhoneInput(dial, e.target.value)); setError(null); }}
            onKeyDown={(e) => { if (e.key === 'Enter' && canSave) void save(); }}
            style={{ ...box, flex: '1 1 150px', minWidth: 0 }}
          />
        </div>
        <div style={{ fontSize: 10.5, color: t.textSubtle, marginTop: 4 }}>
          <ProPhoneVerification key={[session?.userId,dial,phoneDigits].join(':')} mode="profile" country={dial} phone={phoneDigits} verified={!!profile?.phoneVerifiedAt && !changedVerified} disabled={busy || !loaded} onBusy={setPhoneBusy} onSuccess={async () => { if (current()) await load({ force: true }); }} />
          {phoneFrom && phoneDigits && !savedDigits
            ? <span data-testid="profile-phone-from-social">{tr('auth.profile.phoneFromSocial', { provider: tr(`auth.social.name.${phoneFrom}`) })}</span>
            : loaded && !savedDigits && !loadError ? tr('auth.profile.phoneEmpty') : tr('auth.profile.phoneNote')}
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
      >{busy ? tr('common.saving') : tr('common.save')}</button>
      {onDeleteAccount && (
        <div style={{ borderTop: `1px solid ${t.divider}`, paddingTop: 8, textAlign: 'right' }}>
          {/* 회원탈퇴 — 계정 메뉴의 로그아웃 밑에서 여기로 (2026-09-08 사용자 요청:
              잘못 누를 수 있었다). 확인 창은 예전 그대로 문구를 입력해야 열린다. */}
          <button
            type="button" data-testid="profile-delete-account"
            onClick={onDeleteAccount}
            style={{ background: 'transparent', border: 'none', color: t.danger, fontSize: 11.5, cursor: 'pointer', padding: '2px 4px' }}
          >{tr('auth.profile.deleteAccount')}</button>
        </div>
      )}
    </div>
  );
}
