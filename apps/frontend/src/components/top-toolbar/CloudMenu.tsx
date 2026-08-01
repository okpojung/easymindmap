import { useEffect, useRef, useState } from 'react';
import type { ThemeTokens } from '@/components/design-tokens/theme';
import { I } from '@/components/icons';
import { useDocumentStore } from '@/stores/documentStore';
import { useCloudStore } from '@/stores/cloudStore';
import { useAutosaveStore } from '@/stores/autosaveStore';
import { useCloudAutosave } from '@/hooks/useCloudAutosave';
import { cloudApi, CloudError } from '@/services/cloud/apiClient';
import { MapListModal } from '@/components/cloud/MapListModal';
import { authEnabled, useAuthStore } from '@/stores/authStore';
import { AuthError } from '@/services/cloud/supabaseAuth';

// 클라우드 문서 스냅샷 포맷 — 프론트 문서(map)와 칸반 보드를 통째로 담는다.
// 임베드 이미지·노트·태그·스타일이 map 안에 그대로 들어 있어 손실 없이 왕복.
const SNAPSHOT_VERSION = 1;

/**
 * 클라우드 저장/열기 메뉴. 개발 모드(백엔드 AUTH_MODE=dev)에서는 로그인 없이
 * 단일 개발 사용자로 저장된다. 실제 로그인은 다음 단계.
 */
export function CloudMenu({ t }: { t: ThemeTokens }) {
  const [open, setOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const cloudMapId = useCloudStore((s) => s.cloudMapId);
  const lastSavedAt = useCloudStore((s) => s.lastSavedAt);
  const busy = useCloudStore((s) => s.busy);
  const link = useCloudStore((s) => s.link);
  const session = useAuthStore((s) => s.session);
  // 인증이 켜진 배포에서 비로그인 상태 → 저장/열기 대신 로그인 폼
  const needLogin = authEnabled && !session;

  // 문서가 클라우드에 연결돼 있으면 편집 후 자동 저장(디바운스)
  useCloudAutosave();

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const flash = (m: string) => {
    setMsg(m);
    window.setTimeout(() => setMsg((cur) => (cur === m ? null : cur)), 3500);
  };

  const buildSnapshot = () => {
    const st = useDocumentStore.getState();
    return { v: SNAPSHOT_VERSION, map: st.map, kanban: st.kanban };
  };

  // ── 저장 ────────────────────────────────────────────────
  const handleSave = async () => {
    setOpen(false);
    const st = useDocumentStore.getState();
    const title = st.map.title || '제목 없는 맵';
    useCloudStore.getState().setBusy('saving');
    try {
      let id = cloudMapId;
      if (!id) {
        const created = await cloudApi.createMap(title);
        id = created.mapId;
      }
      const res = await cloudApi.saveDocument(id, buildSnapshot(), title);
      link(id, res.updatedAt);
      // 수동 저장은 맵을 바꾸지 않으므로 자동저장이 트리거되지 않는다(억제 불필요).
      useAutosaveStore.getState().setSaveState('saved');
      flash('☁ 클라우드에 저장했습니다.');
    } catch (err) {
      const m = err instanceof CloudError ? err.message : '저장 중 오류가 발생했습니다.';
      useCloudStore.getState().setError(m);
      flash('⚠ ' + m);
    } finally {
      useCloudStore.getState().setBusy('idle');
    }
  };

  // ── 목록 열기 ───────────────────────────────────────────
  // 목록 열기 — 로드·열기·이름변경·삭제는 MapListModal 이 자체 처리
  const openList = () => {
    setOpen(false);
    setListOpen(true);
  };

  const savedHint = lastSavedAt
    ? `저장됨 · ${new Date(lastSavedAt).toLocaleString()}`
    : '아직 클라우드에 저장하지 않음';

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        title={cloudMapId ? savedHint : '클라우드에 저장/열기'}
        data-testid="cloud-menu"
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: 4,
          height: 32, padding: '0 10px', borderRadius: 8,
          background: t.surfaceAlt, color: t.text,
          border: `1px solid ${cloudMapId ? t.primaryBorder + '66' : t.border}`,
          cursor: 'pointer', fontSize: 13, fontWeight: 500,
        }}
      >
        <I.Cloud size={15} /> 클라우드 <span style={{ fontSize: 8 }}>▼</span>
      </button>

      {open && (
        <div
          style={{
            position: 'absolute', top: 38, right: 0, zIndex: 50, minWidth: 220,
            background: t.surface, border: `1px solid ${t.border}`, borderRadius: 10,
            boxShadow: '0 8px 24px rgba(0,0,0,0.18)', padding: 6,
          }}
        >
          {needLogin ? (
            // 인증이 켜진 배포 + 비로그인 → 로그인/가입 폼 (Phase 3)
            <LoginForm t={t} flash={flash} />
          ) : (
            <>
              {authEnabled && session && (
                <div
                  data-testid="cloud-user"
                  style={{
                    padding: '6px 10px', fontSize: 11, color: t.textSubtle,
                    borderBottom: `1px solid ${t.border}`, marginBottom: 4,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}
                >
                  👤 {session.email}
                </div>
              )}
              <div style={{ padding: '6px 10px', fontSize: 11, color: t.textSubtle }}>{savedHint}</div>
              <MenuItem t={t} testid="cloud-save" disabled={busy !== 'idle'}
                label={cloudMapId ? '☁ 저장 (덮어쓰기)' : '☁ 클라우드에 저장'} onClick={handleSave} />
              <MenuItem t={t} testid="cloud-open" disabled={busy !== 'idle'}
                label="📂 클라우드에서 열기" onClick={openList} />
              {authEnabled && session && (
                <MenuItem t={t} testid="cloud-logout" label="🚪 로그아웃"
                  onClick={() => {
                    setOpen(false);
                    void useAuthStore.getState().signOut().then(() => {
                      useCloudStore.getState().unlink();
                      flash('로그아웃했습니다.');
                    });
                  }} />
              )}
            </>
          )}
        </div>
      )}

      {msg && (
        <div
          data-testid="cloud-toast"
          style={{
            position: 'absolute', top: 38, right: 0, zIndex: 60, whiteSpace: 'nowrap',
            background: t.text, color: t.surface, padding: '6px 12px', borderRadius: 8,
            fontSize: 12, boxShadow: '0 6px 18px rgba(0,0,0,0.22)',
          }}
        >
          {msg}
        </div>
      )}

      {listOpen && (
        <MapListModal
          t={t}
          title="클라우드에서 열기"
          emptyHint="저장된 맵이 없습니다. 먼저 “클라우드에 저장”을 해보세요."
          onClose={() => setListOpen(false)}
          onFlash={flash}
        />
      )}
    </div>
  );
}

// 이메일/비밀번호 로그인·가입 폼 — 메뉴 팝업 안에 표시 (Phase 3)
function LoginForm({ t, flash }: { t: ThemeTokens; flash: (m: string) => void }) {
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const run = async (kind: 'in' | 'up') => {
    if (!email.trim() || !pw) {
      setErr('이메일과 비밀번호를 입력하세요.');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      if (kind === 'in') {
        await useAuthStore.getState().signIn(email.trim(), pw);
        flash('로그인했습니다.');
      } else {
        const done = await useAuthStore.getState().signUp(email.trim(), pw);
        flash(done ? '가입하고 로그인했습니다.' : '가입 확인 메일을 보냈습니다. 메일함을 확인하세요.');
      }
    } catch (e) {
      setErr(e instanceof AuthError ? e.message : '인증 중 오류가 발생했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', height: 30, padding: '0 8px',
    borderRadius: 6, border: `1px solid ${t.border}`, background: t.surfaceAlt,
    color: t.text, fontSize: 12, marginBottom: 6,
  };

  return (
    <div data-testid="cloud-login" style={{ padding: '8px 10px', width: 230 }}>
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>
        클라우드 로그인
      </div>
      <input
        data-testid="login-email"
        type="email" placeholder="이메일" value={email} autoComplete="username"
        onChange={(e) => setEmail(e.target.value)} style={inputStyle}
        onKeyDown={(e) => { if (e.key === 'Enter') void run('in'); }}
      />
      <input
        data-testid="login-password"
        type="password" placeholder="비밀번호" value={pw} autoComplete="current-password"
        onChange={(e) => setPw(e.target.value)} style={inputStyle}
        onKeyDown={(e) => { if (e.key === 'Enter') void run('in'); }}
      />
      {err && (
        <div data-testid="login-error" style={{ color: '#d9534f', fontSize: 11, marginBottom: 6 }}>
          {err}
        </div>
      )}
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          data-testid="login-submit" disabled={busy} onClick={() => void run('in')}
          style={{
            flex: 1, height: 30, borderRadius: 6, border: 'none', cursor: 'pointer',
            background: t.primary, color: '#fff', fontSize: 12, fontWeight: 600,
            opacity: busy ? 0.6 : 1,
          }}
        >로그인</button>
        <button
          data-testid="signup-submit" disabled={busy} onClick={() => void run('up')}
          style={{
            flex: 1, height: 30, borderRadius: 6, cursor: 'pointer',
            border: `1px solid ${t.border}`, background: t.surfaceAlt,
            color: t.text, fontSize: 12, opacity: busy ? 0.6 : 1,
          }}
        >가입</button>
      </div>
      <div style={{ fontSize: 10.5, color: t.textSubtle, marginTop: 8, lineHeight: 1.5 }}>
        저장한 맵은 계정별로 분리되어 어느 기기에서나 열 수 있습니다.
      </div>
    </div>
  );
}

function MenuItem({
  t, label, onClick, disabled, testid,
}: { t: ThemeTokens; label: string; onClick: () => void; disabled?: boolean; testid?: string }) {
  return (
    <button
      data-testid={testid}
      disabled={disabled}
      onClick={onClick}
      style={{
        display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px',
        background: 'transparent', color: disabled ? t.textSubtle : t.text,
        border: 'none', borderRadius: 6, cursor: disabled ? 'default' : 'pointer', fontSize: 13,
      }}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = t.surfaceAlt; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
    >
      {label}
    </button>
  );
}
