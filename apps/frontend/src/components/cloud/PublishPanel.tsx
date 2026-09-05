// PublishPanel — 무료 퍼블리싱(링크 만들기) 대화상자.
// 설계: docs/04-extensions/publish/27-publish-share.md (PUBL-01·02·04)
//
// 여기서 하는 말이 세 가지다. 퍼블리싱은 되돌릴 수는 있어도 **이미 본 사람의
// 기억은 되돌릴 수 없으므로**, 누르기 전에 무엇이 나가는지 분명히 적는다.
//   ① 링크를 가진 사람은 **로그인 없이** 읽는다 (검색 노출은 아니지만
//      링크가 퍼지면 누구나 본다)
//   ② **공개 중인 맵은 완성본**이라 편집이 막힌다. 고치려면
//      **비공개(보관)로 돌린다 → 고친다 → 다시 공개**한다
//   ③ 주소는 **등록**에 붙는다 — 상태를 오가도 그대로다. 주소가 죽는 것은
//      **[퍼블리싱 취소]** 하나뿐이고, 그때는 다시 등록해도 새 주소다

import { useEffect, useState } from 'react';
import type { ThemeTokens } from '@/components/design-tokens/theme';
import {
  cloudApi, CloudError, publishedPreviewUrl,
  type PublishStatus, type PublishVisibility,
} from '@/services/cloud/apiClient';
import { buildSilhouette } from '@/export/silhouette';
import { useDocumentStore } from '@/stores/documentStore';
import { useEditorUiStore } from '@/stores/editorUiStore';
import { useCloudStore } from '@/stores/cloudStore';

/** 퍼블리싱 주소 — 브라우저 주소는 `/p/{publishId}` 다 (API 경로와 다르다) */
export function publicMapUrl(publishId: string): string {
  return `${window.location.origin}/p/${publishId}`;
}

export function PublishPanel(
  { t, mapTitle, mapId, onClose, flash }: {
    t: ThemeTokens;
    mapTitle: string;
    mapId: string;
    onClose: () => void;
    flash: (m: string) => void;
  },
) {
  const [status, setStatus] = useState<PublishStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  // 미리보기를 다시 받아오게 하는 값 — 같은 주소의 내용이 바뀌므로
  // 이것이 없으면 브라우저가 낡은 그림을 계속 보여 준다
  const [previewV, setPreviewV] = useState(() => Date.now());
  const [previewBusy, setPreviewBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    cloudApi.publishStatus(mapId)
      .then((s) => { if (alive) setStatus(s); })
      .catch((err) => {
        if (alive) setError(err instanceof CloudError ? err.message : '퍼블리싱 상태를 읽지 못했습니다.');
      });
    return () => { alive = false; };
  }, [mapId]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof CloudError ? err.message : '요청이 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  /**
   * 실루엣을 **이 브라우저에서** 만들어 올린다 (27a §2.2).
   *
   * 실패해도 퍼블리싱은 살린다 — 미리보기가 없는 것은 아쉬운 일이고,
   * 링크가 안 만들어지는 것은 기능이 안 되는 일이다. 둘을 같은 무게로
   * 다루면 그림 하나 때문에 공유 자체가 막힌다.
   */
  const uploadPreview = async (): Promise<boolean> => {
    try {
      const st = useDocumentStore.getState();
      const ui = useEditorUiStore.getState();
      const { blob } = await buildSilhouette(
        st.map, ui.layoutType, { x: ui.spacingX, y: ui.spacingY });
      const s = await cloudApi.putPublishPreview(mapId, blob);
      setStatus(s);
      setPreviewV(Date.now());
      return true;
    } catch {
      return false;
    }
  };

  /**
   * ★ **공개하면 이 탭도 곧바로 읽기 전용이 된다** (2026-09-05).
   *
   * 공개 중인 맵은 완성본이라 서버가 저장을 막는다. 화면이 그것을 모르면
   * 사용자는 계속 고치다가 **자동저장이 403 을 만날 때에야** 안다 —
   * 그때는 이미 그 편집이 갈 곳이 없다. 그래서 공개한 순간 화면도 같은
   * 사실을 갖게 한다(다시 열 때와 같은 상태다).
   *
   * ★ **잠그는 기준은 등록이 아니라 공개다.** 비공개(보관)로 돌리면 이
   *   자물쇠도 함께 풀린다 — 그것이 "내려서 고친다" 의 전부다.
   */
  const lockThisTab = (locked: boolean) => {
    const c = useCloudStore.getState();
    if (locked) {
      if (c.readOnlyInfo?.mapId === mapId) return; // 이미 잠겨 있다
      const meta = { title: c.cloudTitle ?? mapTitle, kind: c.cloudKind };
      c.unlink();
      useCloudStore.getState().setReadOnlyInfo({
        mapId, title: meta.title,
        reason: '공개 중인 맵입니다 — 고치려면 비공개(보관)로 바꾸세요',
        viewer: false, kind: meta.kind,
      });
    } else {
      if (!c.readOnlyInfo) return; // 이미 풀려 있다
      const ro = c.readOnlyInfo;
      useCloudStore.getState().link(mapId, c.lastSavedAt ?? new Date().toISOString(), {
        title: ro?.title ?? c.cloudTitle ?? mapTitle, kind: ro?.kind ?? c.cloudKind,
      });
    }
  };

  /** 등록 — 기본은 무료공개다(버튼을 누른 뜻이 그것이다) */
  const doPublish = (visibility: PublishVisibility = 'public') => run(async () => {
    const s = await cloudApi.publishMap(mapId, visibility);
    setStatus(s);
    if (visibility === 'public') {
      flash('🔗 퍼블리싱했습니다 — 이제 이 맵은 읽기 전용입니다.');
      lockThisTab(true);
    } else {
      flash('퍼블리싱 문서함에 넣었습니다 — 아직 비공개(보관)라 남에게는 보이지 않습니다.');
    }
    setPreviewBusy(true);
    const ok = await uploadPreview();
    setPreviewBusy(false);
    if (!ok) flash('등록은 됐습니다 — 미리보기 이미지만 실패했습니다. [다시 만들기]를 눌러 주세요.');
  });

  /**
   * 상태 전환 — **주소는 그대로다.**
   *
   * 화면의 자물쇠도 함께 움직인다. 서버가 편집을 막는 기준과 화면이 잠기는
   * 기준이 **같아야** 한다 — 어긋나면 고칠 수 있어 보이는데 저장이 안 되거나,
   * 그 반대가 된다.
   */
  const doSetVisibility = (v: PublishVisibility) => run(async () => {
    const s = await cloudApi.setPublishVisibility(mapId, v);
    setStatus(s);
    lockThisTab(v === 'public');
    flash(v === 'public'
      ? '공개했습니다 — 같은 주소로 열립니다. 이제 이 맵은 읽기 전용입니다.'
      : '비공개(보관)로 바꿨습니다 — 주소는 그대로 두고 남에게만 닫혔습니다. 이제 다시 편집할 수 있습니다.');
  });

  const doRemakePreview = () => run(async () => {
    setPreviewBusy(true);
    const ok = await uploadPreview();
    setPreviewBusy(false);
    flash(ok ? '미리보기를 다시 만들었습니다.' : '⚠ 미리보기를 만들지 못했습니다.');
  });

  /**
   * 등록 취소 — **이것만이 주소를 죽인다.** 잠시 내리는 것은 위의
   * `doSetVisibility('private')` 다. 둘을 한 버튼에 두면 "고치려고
   * 내렸다가 링크를 잃는" 사고가 생긴다.
   */
  const doUnpublish = () => run(async () => {
    await cloudApi.unpublishMap(mapId);
    setStatus({
      available: true, publishId: null, publishedAt: null,
      publishable: true, canSetVisibility: status?.canSetVisibility,
    });
    setCopied(false);
    lockThisTab(false); // 다시 고칠 수 있다
    flash('퍼블리싱을 취소했습니다 — 그 주소는 영구히 죽습니다. 다시 등록하면 새 주소가 나옵니다.');
  });

  const url = status?.publishId ? publicMapUrl(status.publishId) : '';

  const doCopy = () => {
    if (!url) return;
    // 클립보드가 막힌 환경(비 HTTPS·권한 거부)에서도 **주소는 화면에 있다**.
    // 복사가 안 됐는데 됐다고 말하지 않는다.
    const ok = () => { setCopied(true); flash('링크를 복사했습니다.'); };
    const fail = () => flash('⚠ 복사하지 못했습니다 — 아래 주소를 직접 선택해 복사해 주세요.');
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(url).then(ok, fail);
    } else {
      fail();
    }
  };

  const btn = {
    height: 36, borderRadius: 7, cursor: busy ? 'default' : 'pointer',
    fontSize: 13, fontWeight: 700, border: 'none',
  } as const;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 220, background: 'rgba(0,0,0,0.35)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        data-testid="publish-panel"
        style={{
          width: 'min(500px, 94vw)', background: t.surface, color: t.text,
          border: `1px solid ${t.border}`, borderRadius: 12, padding: 20,
          boxShadow: '0 16px 48px rgba(0,0,0,0.3)',
        }}
      >
        <div style={{ fontSize: 15.5, fontWeight: 800, marginBottom: 4 }}>
          🔗 퍼블리싱 — 링크로 공유
        </div>
        <div style={{ fontSize: 12, color: t.textSubtle, marginBottom: 14 }}>
          {mapTitle}
        </div>

        {error && (
          <div
            data-testid="publish-error"
            style={{
              padding: '9px 11px', borderRadius: 7, marginBottom: 12,
              background: '#FEF2F2', border: '1px solid #FCA5A5',
              color: '#991B1B', fontSize: 12.5, lineHeight: 1.6,
            }}
          >⚠ {error}</div>
        )}

        {status === null && !error && (
          <div style={{ fontSize: 12.5, color: t.textMuted }}>퍼블리싱 상태를 확인하는 중…</div>
        )}

        {/* 서버에 퍼블리싱 표가 없는 배포 — 버튼을 주고 실패시키지 않는다 */}
        {status?.available === false && (
          <div
            data-testid="publish-unavailable"
            style={{ fontSize: 12.5, color: t.textMuted, lineHeight: 1.7 }}
          >
            이 서버에는 아직 퍼블리싱 기능이 준비되지 않았습니다.
            <br />관리자가 <code>published_maps</code> 스키마 델타를 적용하면 바로 쓸 수 있습니다.
          </div>
        )}

        {/* ★ **단독맵만 퍼블리싱한다** (2026-09-05 결정). 이유는 권한이 아니라
            **완성도**다 — 협업 중이라는 것은 아직 완료되지 않은 맵이다.
            눌러 보고 나서야 거절당하지 않도록 서버가 준 이유를 **미리**
            보여 준다. 규칙도 문장도 서버가 갖는다 — 화면이 같은 판정을 한 벌
            더 가지면 언젠가 서버와 다른 말을 한다. */}
        {status?.available && status.publishable === false && !status.publishId && (
          <div
            data-testid="publish-blocked"
            style={{ fontSize: 12.5, color: t.textMuted, lineHeight: 1.8 }}
          >
            {status.blockedReason}
            <br />지금 내용을 퍼블리싱하려면 <b>다른 이름으로 저장</b>하세요 — 사본은 단독맵으로 만들어집니다.
          </div>
        )}

        {status?.available && status.publishable !== false && !status.publishId && (
          <>
            <div style={{ fontSize: 12.5, color: t.textMuted, lineHeight: 1.8, marginBottom: 16 }}>
              퍼블리싱하면 이 맵이 <b>퍼블리싱 문서함</b>으로 들어갑니다 —
              쇼핑몰에 상품을 등록하는 것과 같습니다.
              <br />★ <b>무료공개</b>면 링크를 가진 사람이 로그인 없이 읽습니다.
              공개 중인 맵은 완성본이라 <b>읽기 전용</b>이 되고 협업자를 초대할 수 없습니다.
              <br />★ <b>비공개(보관)</b>로 넣어 두면 남에게는 보이지 않고
              <b> 계속 고칠 수 있습니다.</b> 다 되면 공개로 바꾸면 됩니다.
              <br />★ <b>주소는 등록에 붙습니다</b> — 비공개 ↔ 공개를 오가도 그대로입니다.
            </div>
            <button
              data-testid="publish-create"
              disabled={busy}
              onClick={() => void doPublish('public')}
              style={{ ...btn, width: '100%', background: t.primary, color: '#fff' }}
            >{busy ? '만드는 중…' : '퍼블리싱하기 (무료공개)'}</button>
            {status.canSetVisibility && (
              <button
                data-testid="publish-create-private"
                disabled={busy}
                onClick={() => void doPublish('private')}
                style={{
                  ...btn, width: '100%', marginTop: 8, height: 32,
                  border: `1px solid ${t.border}`, background: t.surfaceAlt, color: t.text,
                  fontSize: 12.5, fontWeight: 600,
                }}
              >비공개(보관)로 등록만 하기</button>
            )}
          </>
        )}

        {status?.available && status.publishId && (
          <>
            <div style={{ fontSize: 12.5, color: t.textMuted, marginBottom: 8 }}>
              퍼블리싱 등록됨 · {status.publishedAt ? new Date(status.publishedAt).toLocaleString() : ''}
            </div>

            {/* ★ **상태 전환** (2026-09-05 사용자 결정) — 주소는 그대로다.
                등록(주소를 만든다)과 노출(남에게 보인다)을 나눈 자리다.
                칸이 없는 서버(델타 미적용)에서는 아예 그리지 않는다 —
                눌러 보고 나서야 실패를 만나지 않게. */}
            {status.canSetVisibility && (
              <div data-testid="publish-visibility" style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', gap: 6 }}>
                  {([
                    ['private', '🔒 비공개(보관)'],
                    ['public', '🌐 무료공개'],
                  ] as const).map(([v, label]) => {
                    const on = (status.visibility ?? 'public') === v;
                    return (
                      <button
                        key={v}
                        data-testid={`publish-vis-${v}`}
                        aria-pressed={on}
                        disabled={busy || on}
                        onClick={() => void doSetVisibility(v)}
                        style={{
                          ...btn, flex: 1, height: 32, fontSize: 12.5,
                          cursor: on ? 'default' : 'pointer',
                          border: `1px solid ${on ? t.primary : t.border}`,
                          background: on ? t.primary : t.surfaceAlt,
                          color: on ? '#fff' : t.text,
                        }}
                      >{label}</button>
                    );
                  })}
                </div>
                <div style={{ fontSize: 11.5, color: t.textSubtle, lineHeight: 1.6, marginTop: 6 }}>
                  {(status.visibility ?? 'public') === 'private'
                    ? '지금은 남에게 보이지 않습니다 (주소를 열면 404). 이 상태에서는 맵을 고칠 수 있습니다.'
                    : '링크를 가진 누구나 읽습니다. 고치려면 [비공개(보관)]로 바꾸세요 — 주소는 그대로입니다.'}
                  <br />유료공개는 아직 준비 중입니다 (값·결제·정산이 붙은 뒤에 열립니다).
                </div>
              </div>
            )}

            {/* 미리보기 실루엣 — 링크 카드·목록 썸네일이 이 그림을 쓴다.
                **글자가 없는 것이 정상이다**(27a §2.1): 흐리게 만든 것이
                아니라 글자를 아예 안 그린 것이라, 확대해도 복원되지 않는다.
                그 사실을 화면이 말해 주지 않으면 "깨진 이미지" 로 보인다. */}
            <div
              style={{
                borderRadius: 8, overflow: 'hidden', marginBottom: 8,
                border: `1px solid ${t.border}`, background: t.surfaceAlt,
                aspectRatio: '1200 / 630',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              {status.hasPreview ? (
                <img
                  data-testid="publish-preview-img"
                  src={publishedPreviewUrl(status.publishId, previewV)}
                  alt="미리보기 실루엣"
                  style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
                />
              ) : (
                <span style={{ fontSize: 12, color: t.textSubtle }}>
                  {previewBusy ? '미리보기 만드는 중…' : '미리보기 없음'}
                </span>
              )}
            </div>
            <div style={{ fontSize: 11.5, color: t.textSubtle, lineHeight: 1.6, marginBottom: 10 }}>
              글자 대신 회색 막대로 그립니다 — 확대해도 내용이 읽히지 않습니다.
              맵을 고친 뒤에는 [미리보기 다시 만들기]를 눌러 주세요.
            </div>
            <button
              data-testid="publish-preview-remake"
              disabled={busy || previewBusy}
              onClick={() => void doRemakePreview()}
              style={{
                ...btn, width: '100%', height: 32, marginBottom: 10,
                border: `1px solid ${t.border}`, background: t.surfaceAlt, color: t.text,
                fontSize: 12.5, fontWeight: 600,
              }}
            >{previewBusy ? '만드는 중…' : '미리보기 다시 만들기'}</button>
            <input
              data-testid="publish-url"
              readOnly
              value={url}
              onFocus={(e) => e.currentTarget.select()}
              style={{
                width: '100%', boxSizing: 'border-box', height: 36, padding: '0 10px',
                borderRadius: 7, border: `1px solid ${t.border}`,
                background: t.surfaceAlt, color: t.text, fontSize: 12.5,
              }}
            />
            <div style={{ display: 'flex', gap: 7, marginTop: 10 }}>
              <button
                data-testid="publish-copy"
                onClick={doCopy}
                style={{ ...btn, flex: 1, background: t.primary, color: '#fff' }}
              >{copied ? '복사됨 ✓' : '링크 복사'}</button>
              <a
                data-testid="publish-open"
                href={url}
                target="_blank"
                rel="noreferrer"
                style={{
                  ...btn, flex: 1, display: 'flex', alignItems: 'center',
                  justifyContent: 'center', textDecoration: 'none',
                  border: `1px solid ${t.border}`, background: t.surfaceAlt, color: t.text,
                }}
              >새 탭에서 열기</a>
            </div>
            <button
              data-testid="publish-stop"
              disabled={busy}
              onClick={() => void doUnpublish()}
              style={{
                ...btn, width: '100%', marginTop: 10, height: 34,
                border: `1px solid ${t.border}`, background: t.surface, color: '#B91C1C',
                fontWeight: 600, fontSize: 12.5,
              }}
            >{busy ? '처리 중…' : '퍼블리싱 취소 (주소가 사라집니다)'}</button>
          </>
        )}

        <button
          data-testid="publish-close"
          onClick={onClose}
          style={{
            ...btn, width: '100%', marginTop: 12, height: 32,
            background: 'transparent', color: t.textSubtle, fontWeight: 600, fontSize: 12.5,
          }}
        >닫기</button>
      </div>
    </div>
  );
}
