// PublishPanel — 무료 퍼블리싱(링크 만들기) 대화상자.
// 설계: docs/04-extensions/publish/27-publish-share.md (PUBL-01·02·04)
//
// 여기서 하는 말이 세 가지다. 퍼블리싱은 되돌릴 수는 있어도 **이미 본 사람의
// 기억은 되돌릴 수 없으므로**, 누르기 전에 무엇이 나가는지 분명히 적는다.
//   ① 링크를 가진 사람은 **로그인 없이** 읽는다 (검색 노출은 아니지만
//      링크가 퍼지면 누구나 본다)
//   ② 퍼블리싱한 맵은 **완성본**이다 — 퍼블리싱하는 동안 편집이 막힌다.
//      고치려면 중단하고 고친 뒤 다시 퍼블리싱한다
//   ③ 중단하면 링크는 **즉시** 죽고, **다시 살아나지 않는다** —
//      다시 퍼블리싱하면 **새 주소**가 나온다

import { useEffect, useState } from 'react';
import type { ThemeTokens } from '@/components/design-tokens/theme';
import {
  cloudApi, CloudError, publishedPreviewUrl, type PublishStatus,
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
   * ★ **퍼블리싱하면 이 탭도 곧바로 읽기 전용이 된다** (2026-09-05).
   *
   * 퍼블리싱한 맵은 편집이 끝난 완성본이라 서버가 저장을 막는다. 화면이 그것을
   * 모르면 사용자는 계속 고치다가 **자동저장이 403 을 만날 때에야** 안다 —
   * 그때는 이미 그 편집이 갈 곳이 없다. 그래서 퍼블리싱한 순간 화면도 같은
   * 사실을 갖게 한다(다시 열 때와 같은 상태다).
   */
  const lockThisTab = (locked: boolean) => {
    const c = useCloudStore.getState();
    if (locked) {
      const meta = { title: c.cloudTitle ?? mapTitle, kind: c.cloudKind };
      c.unlink();
      useCloudStore.getState().setReadOnlyInfo({
        mapId, title: meta.title,
        reason: '퍼블리싱 중인 맵입니다 — 고치려면 퍼블리싱을 중단하세요',
        viewer: false, kind: meta.kind,
      });
    } else {
      const ro = c.readOnlyInfo;
      useCloudStore.getState().link(mapId, c.lastSavedAt ?? new Date().toISOString(), {
        title: ro?.title ?? c.cloudTitle ?? mapTitle, kind: ro?.kind ?? c.cloudKind,
      });
    }
  };

  const doPublish = () => run(async () => {
    const s = await cloudApi.publishMap(mapId);
    setStatus(s);
    flash('🔗 퍼블리싱 링크를 만들었습니다 — 이제 이 맵은 읽기 전용입니다.');
    lockThisTab(true);
    setPreviewBusy(true);
    const ok = await uploadPreview();
    setPreviewBusy(false);
    if (!ok) flash('링크는 만들었습니다 — 미리보기 이미지만 실패했습니다. [다시 만들기]를 눌러 주세요.');
  });

  const doRemakePreview = () => run(async () => {
    setPreviewBusy(true);
    const ok = await uploadPreview();
    setPreviewBusy(false);
    flash(ok ? '미리보기를 다시 만들었습니다.' : '⚠ 미리보기를 만들지 못했습니다.');
  });

  const doUnpublish = () => run(async () => {
    await cloudApi.unpublishMap(mapId);
    setStatus({ available: true, publishId: null, publishedAt: null, publishable: true });
    setCopied(false);
    lockThisTab(false); // 다시 고칠 수 있다
    flash('퍼블리싱을 중단했습니다 — 그 주소는 영구히 죽습니다. 다시 퍼블리싱하면 새 주소가 나옵니다. 이제 다시 편집할 수 있습니다.');
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
              퍼블리싱하면 <b>링크를 가진 사람은 로그인 없이</b> 이 맵을 읽을 수 있습니다.
              <br />★ 퍼블리싱한 맵은 <b>편집이 끝난 완성본</b>입니다 — 퍼블리싱하는 동안 이 맵은
              <b> 읽기 전용</b>이 되고, 협업자를 초대할 수도 없습니다.
              <br />고치려면 <b>퍼블리싱을 중단</b>하면 됩니다. 그때 다시 편집할 수 있습니다.<br />★ 중단하면 그 주소는 <b>영구히 죽습니다</b> — 다시 퍼블리싱하면 <b>새 주소</b>가 나옵니다.
            </div>
            <button
              data-testid="publish-create"
              disabled={busy}
              onClick={() => void doPublish()}
              style={{ ...btn, width: '100%', background: t.primary, color: '#fff' }}
            >{busy ? '만드는 중…' : '퍼블리싱하기'}</button>
          </>
        )}

        {status?.available && status.publishId && (
          <>
            <div style={{ fontSize: 12.5, color: t.textMuted, marginBottom: 6 }}>
              퍼블리싱 중 · {status.publishedAt ? new Date(status.publishedAt).toLocaleString() : ''}
            </div>

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
            >{busy ? '처리 중…' : '퍼블리싱 중단'}</button>
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
