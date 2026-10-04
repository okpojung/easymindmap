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

import { Fragment, useEffect, useState, type ReactNode } from 'react';
import type { ThemeTokens } from '@/components/design-tokens/theme';
import {
  cloudApi, CloudError,
  type PublishStatus, type PublishVisibility,
} from '@/services/cloud/apiClient';
import { buildSilhouette } from '@/export/silhouette';
import type { LayoutType, SampleMap } from '@/editor/__samples__/types';
import { useDocumentStore } from '@/stores/documentStore';
import { useEditorUiStore } from '@/stores/editorUiStore';
import { useCloudStore } from '@/stores/cloudStore';
import { DialogXButton } from '@/components/ui/DialogFrame';
import { useProFeature } from '@/pro/contract';
import { ProSalesGate } from '@pro';
import { LANG_LOCALE, tr as trNow, useLang, useTr } from '@/i18n';
import { rich } from '@/i18n/rich';
// 폰 대화상자 규칙(data-mm-*) — 불러오기만 하면 CSS 가 한 번 들어간다
import '@/components/ui/mobileCss';
export { rich };


/** 퍼블리싱 주소 — 브라우저 주소는 `/p/{publishId}` 다 (API 경로와 다르다) */
export function publicMapUrl(publishId: string): string {
  return `${window.location.origin}/p/${publishId}`;
}

interface PreviewSource {
  map: SampleMap;
  layoutType?: LayoutType;
  spacing: { x: number; y: number };
}

/**
 * 실루엣을 그릴 **그 맵**을 가져온다 (2026-09-21).
 *
 * ★ 편집기에 열려 있는 맵과 **퍼블리싱하는 맵이 다를 수 있다.** 문서함
 *   행의 🌐 에서 이 창을 열면 `mapId` 는 **그 행의 맵**인데, 문서 스토어에는
 *   지금 편집 중인 맵(또는 방금 만든 빈 맵)이 들어 있다. 그대로 그리면
 *   **엉뚱한 맵의 그림**이 올라간다.
 *
 *   사용자 보고(2026-09-21): 111노드짜리 맵의 미리보기에 **중심 하나만**
 *   나왔다 — 편집기에 빈 맵이 있었기 때문이다. 카드에는 서버가 센 `111노드`
 *   가 함께 적히므로 그림과 숫자가 대놓고 어긋났다.
 *
 * 그래서 **편집기에 열린 맵일 때만** 스토어를 쓴다(저장 안 한 마지막 손질까지
 * 반영된다). 아니면 서버에서 그 맵의 문서를 받아 온다 — 배치·간격도 그
 * 문서에 저장된 값을 쓴다(`PublicMapPage` 가 뷰어를 그릴 때와 같은 재료다).
 */
async function previewSource(mapId: string): Promise<PreviewSource> {
  if (useCloudStore.getState().cloudMapId === mapId) {
    const st = useDocumentStore.getState();
    const ui = useEditorUiStore.getState();
    return { map: st.map, layoutType: ui.layoutType, spacing: { x: ui.spacingX, y: ui.spacingY } };
  }
  // ★ `editSession` 을 주지 않는다 — 주면 **편집 잠금을 집어** 남이 그 맵을
  //   못 고치게 된다. 여기서는 읽기만 한다.
  const d = await cloudApi.getDocument(mapId);
  const snap = d.doc as {
    map?: SampleMap;
    editor?: { layoutType?: LayoutType; spacingX?: number; spacingY?: number };
  } | null;
  if (!snap?.map) throw new Error(trNow('publish.err.readMap'));
  return {
    map: snap.map,
    layoutType: snap.editor?.layoutType,
    spacing: { x: snap.editor?.spacingX ?? 1, y: snap.editor?.spacingY ?? 1 },
  };
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
  const tr = useTr();
  const lang = useLang();
  const [status, setStatus] = useState<PublishStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  // 미리보기를 다시 받아오게 하는 값 — 같은 주소의 내용이 바뀌므로
  // 이것이 없으면 브라우저가 낡은 그림을 계속 보여 준다
  const [previewV, setPreviewV] = useState(() => Date.now());
  const [previewBusy, setPreviewBusy] = useState(false);
  /** 미리보기가 **왜** 안 만들어졌나 — 화면에도 남긴다(안내는 사라진다) */
  const [previewError, setPreviewError] = useState<string | null>(null);
  /**
   * ★ **지식창고는 체크만으로 반영하지 않는다** (2026-09-21 사용자 결정).
   *
   * 전에는 체크하는 순간 서버로 갔다. 그런데 이 대화상자의 다른 것들은
   * *누르면 곧 일어나는 단추*(비공개/링크 공개)인데 체크만 **예약처럼**
   * 보여, 사용자가 *"저 상태에서 닫기를 하면 올라가는 건가?"* 를 물어야
   * 했다. 규칙이 둘이면 어느 쪽도 못 믿는다.
   *
   * 더 중요한 이유가 있다 — **미리보기를 보고 나서 올리고 싶다.** 진열은
   * 남들에게 그림이 함께 나가는 일이라, 그림이 맞는지 확인한 뒤 누르는
   * 단추가 있어야 한다(2026-09-21 에 엉뚱한 그림이 올라간 일도 있었다).
   *
   * `null` 이면 서버 상태 그대로, 아니면 **아직 반영 안 된 내 뜻**이다.
   */
  const [listedWant, setListedWant] = useState<boolean | null>(null);
  /**
   * ★ 미리보기는 **주인 경로로 받아 blob 으로 그린다** (2026-09-05).
   *
   * 비인증 주소(`/v1/published/{slug}/preview.png`)는 **무료공개일 때만**
   * 열린다. 그 주소를 `<img src>` 에 그대로 쓰면 **보관 중에는 깨진 그림**이
   * 뜬다 — 공개하기 전에 확인하는 것이 보관 상태의 쓸모인데, 정작 그때
   * 안 보이는 셈이다(실측 2026-09-05).
   */
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    cloudApi.publishStatus(mapId)
      .then((s) => { if (alive) setStatus(s); })
      .catch((err) => {
        if (alive) setError(err instanceof CloudError ? err.message : trNow('publish.err.status'));
      });
    return () => { alive = false; };
  }, [mapId]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof CloudError ? err.message : tr('publish.err.request'));
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
  const uploadPreview = async (): Promise<string | null> => {
    try {
      const src = await previewSource(mapId);
      const { blob } = await buildSilhouette(src.map, src.layoutType, src.spacing);
      const s = await cloudApi.putPublishPreview(mapId, blob);
      setStatus(s);
      setPreviewV(Date.now());
      return null;
    } catch (err) {
      // ★ **왜 안 됐는지를 삼키지 않는다** (2026-09-21).
      //
      //   전에는 `catch {}` 로 이유를 버리고 화면에 "만들지 못했습니다" 만
      //   적었다. 그러면 안 되는 이유가 **문서를 못 읽어서**인지, 캔버스가
      //   막혀서인지, 업로드가 거절당해서인지 아무도 모른다 — 사용자도,
      //   보고를 받는 우리도. 실제로 "여전히 안 된다" 는 보고를 받고도
      //   원인을 좁힐 근거가 화면에 하나도 없었다.
      //
      //   퍼블리싱 자체는 그대로 살린다(27a §2.2) — 바뀐 것은 **말해 주는
      //   것뿐**이다.
      return err instanceof CloudError ? err.message
        : err instanceof Error && err.message ? err.message
          : tr('publish.err.unknown');
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
    // ★ 대시보드맵은 **퍼블리싱과 상관없이** 잠겨 있다 (2026-09-30) — 비공개로
    //   돌렸다고 여기서 풀면 대시보드맵이 편집 가능한 맵으로 다시 이어진다.
    if (c.readOnlyInfo?.mapId === mapId && c.readOnlyInfo.dashboard) return;
    if (locked) {
      if (c.readOnlyInfo?.mapId === mapId) return; // 이미 잠겨 있다
      const meta = { title: c.cloudTitle ?? mapTitle, kind: c.cloudKind };
      c.unlink();
      useCloudStore.getState().setReadOnlyInfo({
        mapId, title: meta.title,
        reason: tr('publish.lockReason'),
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
      flash(tr('publish.flash.published'));
      lockThisTab(true);
    } else {
      flash(tr('publish.flash.registeredPrivate'));
    }
    setPreviewBusy(true);
    const why = await uploadPreview();
    setPreviewBusy(false);
    setPreviewError(why);
    if (why !== null) {
      flash(tr('publish.flash.previewFailedAfterPublish', { why }));
    }
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
      ? tr('publish.flash.madePublic')
      : tr('publish.flash.madePrivate'));
  });

  /**
   * **지식창고에 올린다 / 내린다** (2026-09-18).
   *
   * 켤 때 등록·공개가 아직이면 **서버가 함께 처리한다**(setListed) — 여기
   * 화면에서 순서를 안내하지 않는 이유다. 켜면 공개 상태가 되므로
   * `lockThisTab(true)` 로 편집 잠금도 따라간다.
   */
  const doSetListed = (on: boolean) => run(async () => {
    const s = await cloudApi.setMapListed(mapId, on);
    setStatus(s);
    setListedWant(null);          // 반영됐으니 "아직 안 된 뜻" 은 없다
    if (on) lockThisTab(true);
    flash(on
      ? tr('publish.flash.listed')
      : tr('publish.flash.unlisted'));
  });

  /**
   * 값 매기기 · 값 내리기 (2026-09-21, 27b §4.1).
   *
   * 값과 상태가 **함께** 움직인다 — 서버의 `setPrice` 한 문이 둘 다 한다.
   * 화면에서 "유료로 바꾸고" "값을 넣는" 두 단계로 두면 그 사이에 창을
   * 닫은 맵이 **값 없는 유료 맵**으로 남는다.
   */
  const doSetPrice = (priceKrw: number | null) => run(async () => {
    const st = await cloudApi.setMapPrice(mapId, priceKrw);
    setStatus(st);
    flash(priceKrw === null
      ? tr('publish.flash.priceCleared')
      : tr('publish.flash.priceSet', { price: priceKrw.toLocaleString(LANG_LOCALE[lang]) }));
  });

  const doRemakePreview = () => run(async () => {
    setPreviewBusy(true);
    const why = await uploadPreview();
    setPreviewBusy(false);
    setPreviewError(why);
    flash(why === null
      ? tr('publish.flash.previewRemade')
      : tr('publish.flash.previewFailed', { why }));
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
      publishable: true, canSetVisibility: status?.canSetVisibility, dashboard: status?.dashboard,
    });
    setCopied(false);
    lockThisTab(false); // 다시 고칠 수 있다
    flash(tr('publish.flash.unpublished'));
  });

  // 미리보기 받아 오기 — 상태가 바뀌거나 다시 만들 때마다.
  useEffect(() => {
    if (!status?.hasPreview) { setPreviewSrc(null); return; }
    let alive = true;
    let made: string | null = null;
    cloudApi.getPublishPreview(mapId)
      .then((b) => {
        if (!alive) return;
        made = URL.createObjectURL(b);
        setPreviewSrc(made);
      })
      .catch(() => { if (alive) setPreviewSrc(null); });
    return () => {
      alive = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [mapId, status?.hasPreview, previewV]);

  const url = status?.publishId ? publicMapUrl(status.publishId) : '';

  const doCopy = () => {
    if (!url) return;
    // 클립보드가 막힌 환경(비 HTTPS·권한 거부)에서도 **주소는 화면에 있다**.
    // 복사가 안 됐는데 됐다고 말하지 않는다.
    const ok = () => { setCopied(true); flash(tr('publish.flash.linkCopied')); };
    const fail = () => flash(tr('publish.flash.copyFailed'));
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
      data-mm-dialog-overlay=""
      style={{
        position: 'fixed', inset: 0, zIndex: 220, background: 'rgba(0,0,0,0.35)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        data-testid="publish-panel"
        data-mm-dialog=""
        data-mm-touch=""
        style={{
          position: 'relative',
          width: 'min(500px, 94vw)', background: t.surface, color: t.text,
          border: `1px solid ${t.border}`, borderRadius: 12, padding: 20,
          boxShadow: '0 16px 48px rgba(0,0,0,0.3)',
          // ★ **화면 안에 가둔다** (2026-09-21 사용자 지적: "퍼블리싱 팝업창
          //   오른쪽에 X 가 없다").
          //
          //   X 는 처음부터 있었다 — **보이지 않았을 뿐이다.** 이 창은
          //   미리보기 그림까지 담아 974px 이나 되는데, 바깥이 세로 가운데
          //   정렬(`alignItems: center`)이라 창이 화면보다 길면 **위아래로
          //   똑같이 넘친다.** 넘친 위쪽에 제목과 X 가 있고, 바깥이
          //   `position: fixed` 라 **스크롤해서 닿을 수도 없다.**
          //   실측: 화면 900px 에서 패널 top 이 **-37px** (X 는 -26px).
          //
          //   그래서 높이를 화면 안으로 묶고 **본문만 구른다.** X 는 패널에
          //   `absolute` 로 붙어 있으므로 굴러도 제자리에 남는다.
          //   ★ `boxSizing` 이 없으면 **패딩 40px 과 테두리가 그 위에 더해져**
          //     화면을 5px 넘긴다(실측 — 화면 900 에 패널 910). maxHeight 는
          //     content-box 에 걸리기 때문이다.
          maxHeight: 'calc(100dvh - 32px)', boxSizing: 'border-box',
          display: 'flex', flexDirection: 'column',
        }}
      >
        <DialogXButton t={t} testId="publish-panel-x" onClose={onClose} />
        <div style={{
          fontSize: 15.5, fontWeight: 800, marginBottom: 4, paddingRight: 34, flexShrink: 0,
        }}>
          {tr('publish.title')}
        </div>
        <div style={{ fontSize: 12, color: t.textSubtle, marginBottom: 14, flexShrink: 0 }}>
          {mapTitle}
        </div>

        {/* 구르는 칸 — `minHeight: 0` 이 없으면 flex 자식이 **줄지 않아**
            maxHeight 가 무시된다(flexbox 의 오래된 함정). */}
        <div data-testid="publish-scroll" style={{ overflowY: 'auto', minHeight: 0 }}>

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
          <div style={{ fontSize: 12.5, color: t.textMuted }}>{tr('publish.checking')}</div>
        )}

        {/* 서버에 퍼블리싱 표가 없는 배포 — 버튼을 주고 실패시키지 않는다 */}
        {status?.available === false && (
          <div
            data-testid="publish-unavailable"
            style={{ fontSize: 12.5, color: t.textMuted, lineHeight: 1.7 }}
          >
            {tr('publish.unavailable')}
            <br />{rich(tr('publish.unavailableHint'))}
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
            <br />{rich(tr('publish.blockedHint'))}
          </div>
        )}

        {/* ★ **대시보드맵은 한 단계로 링크를 만든다** (2026-10-02 사용자 요청: 비공개/링크 공개 단추가
            필요 없다) — 보관 상태를 거치지 않고 바로 링크 공개. 지식창고·판매는 서버가 막는다 */}
        {status?.available && status.publishable !== false && !status.publishId && status.dashboard && (
          <>
            <div style={{ fontSize: 12.5, color: t.textMuted, lineHeight: 1.8, marginBottom: 16 }}>
              {rich(tr('publish.dashboard.intro'))}
            </div>
            <button
              data-testid="publish-create"
              disabled={busy}
              onClick={() => void doPublish('public')}
              style={{ ...btn, width: '100%', background: t.primary, color: '#fff' }}
            >{busy ? tr('publish.creating') : tr('publish.dashboard.create')}</button>
          </>
        )}

        {status?.available && status.publishable !== false && !status.publishId && !status.dashboard && (
          <>
            <div style={{ fontSize: 12.5, color: t.textMuted, lineHeight: 1.8, marginBottom: 16 }}>
              {rich(tr('publish.intro'))}
            </div>
            <button
              data-testid="publish-create"
              disabled={busy}
              onClick={() => void doPublish(status.canSetVisibility ? 'private' : 'public')}
              style={{ ...btn, width: '100%', background: t.primary, color: '#fff' }}
            >{busy ? tr('publish.creating')
              : status.canSetVisibility ? tr('publish.createPrivate') : tr('publish.createPublic')}</button>
            {!status.canSetVisibility && (
              <div style={{ fontSize: 11.5, color: t.textSubtle, lineHeight: 1.6, marginTop: 8 }}>
                {rich(tr('publish.noPrivateHint'))}
              </div>
            )}
          </>
        )}

        {status?.available && status.publishId && (
          <>
            <div style={{ fontSize: 12.5, color: t.textMuted, marginBottom: 8 }}>
              {tr('publish.registeredAt', {
                at: status.publishedAt ? new Date(status.publishedAt).toLocaleString(LANG_LOCALE[lang]) : '',
              })}
            </div>

            {/* ★ **상태 전환** (2026-09-05 사용자 결정) — 주소는 그대로다.
                등록(주소를 만든다)과 노출(남에게 보인다)을 나눈 자리다.
                칸이 없는 서버(델타 미적용)에서는 아예 그리지 않는다 —
                눌러 보고 나서야 실패를 만나지 않게. */}
            {/* ★ 대시보드맵은 상태 전환 단추를 두지 않는다 (2026-10-02 사용자 요청) — 링크 공개가
                대시보드의 쓰임새 전부다. 예전에 보관으로 돌려 둔 맵만 [링크 다시 열기] 하나를 보인다
                (그것마저 없으면 붙여 둔 자리를 되살릴 길이 없다) */}
            {status.dashboard && (status.visibility ?? 'public') === 'private' && (
              <div data-testid="publish-dashboard-reopen" style={{ marginBottom: 10 }}>
                <button
                  data-testid="publish-vis-public"
                  disabled={busy}
                  onClick={() => void doSetVisibility('public')}
                  style={{ ...btn, width: '100%', height: 32, fontSize: 12.5, background: t.primary, color: '#fff' }}
                >{tr('publish.dashboard.reopen')}</button>
                <div style={{ fontSize: 11.5, color: t.textSubtle, lineHeight: 1.6, marginTop: 6 }}>
                  {rich(tr('publish.dashboard.reopenHint'))}
                </div>
              </div>
            )}
            {status.dashboard && (status.visibility ?? 'public') !== 'private' && (
              <div style={{ fontSize: 11.5, color: t.textSubtle, lineHeight: 1.6, marginBottom: 10 }}>
                {tr('publish.dashboard.liveHint')}
                <br />{rich(tr('publish.notListedLine'))}
              </div>
            )}
            {status.canSetVisibility && !status.dashboard && (
              <div data-testid="publish-visibility" style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', gap: 6 }}>
                  {([
                    ['private', tr('publish.vis.private')],
                    ['public', tr('publish.vis.public')],
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
                    ? tr('publish.vis.privateHint')
                    : tr('publish.vis.publicHint')}
                  <br />{rich(tr('publish.notListedLine'))}
                  {' '}{rich(tr('publish.vis.listedTip'))}
                </div>
              </div>
            )}

            {/* ★ **지식창고** — 퍼블리싱과 **목적이 다른 기능**이다
                (2026-09-18 사용자 정리). 퍼블리싱은 *"블로그에 붙이거나
                특정인에게 보낼 주소를 만드는"* 것이고, 지식창고는
                *"불특정 다수에게 공개하는"* 것이다. 주소를 따로 만들지는
                않는다 — 같은 `/p/{id}` 를 쓴다.
                칸이 없는 서버(델타 미적용)에서는 그리지 않는다. */}
            {/* ★ **대시보드맵 — 사내 시스템에 붙이기** (2026-09-30, 22-dashboard.md §4.7).
                지식창고·값 줄 대신 이것을 보여 준다(서버도 진열·판매를 막는다).
                `?embed=1` 은 머리말 없이 맵만 — 사내 페이지 안 iframe 에 맞다. */}
            {status.dashboard && <DashboardEmbed t={t} url={url} flash={flash} />}

            {status.canSetListed && !status.dashboard && (() => {
              const on = !!status.listed;                 // 서버가 아는 상태
              const want = listedWant ?? on;              // 내가 고른 상태
              const pending = want !== on;                // 아직 반영 안 됐다
              return (
              <div data-testid="publish-listed" style={{
                marginBottom: 10, padding: '10px 12px', borderRadius: 8,
                border: `1px solid ${pending ? t.warning : on ? t.primary : t.border}`,
                background: on ? t.primarySoft ?? t.surfaceAlt : t.surfaceAlt,
              }}>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer' }}>
                  <input
                    data-testid="publish-listed-check"
                    type="checkbox"
                    checked={want}
                    disabled={busy}
                    onChange={(e) => setListedWant(e.target.checked)}
                    style={{ marginTop: 2 }}
                  />
                  {/* ★ 켜져 있을 때는 **지시문이 아니라 상태**로 적는다
                      (2026-09-21 사용자 물음: "저 상태에서 닫기를 하면
                      지식창고에 올라가는 건가?"). "올린다" 라고만 적혀
                      있으면 지금 어떤 상태인지 읽어 낼 수가 없다. */}
                  <span>
                    <b style={{ fontSize: 12.5 }}>
                      {on ? tr('publish.listed.on') : tr('publish.listed.off')}
                    </b>
                    <div style={{ fontSize: 11.5, color: t.textSubtle, lineHeight: 1.6, marginTop: 2 }}>
                      {on
                        ? tr('publish.listed.onHint')
                        : tr('publish.listed.offHint')}
                    </div>
                  </span>
                </label>

                {/* ★ **체크는 뜻이고, 반영은 이 단추다** (2026-09-21 사용자 결정:
                    "체크하고 미리보기가 다 만들어진 것을 확인하고 지식창고
                    저장하기 버튼을 별도로"). 진열은 그림이 함께 나가는 일이라,
                    아래 미리보기를 **보고 나서** 누를 자리가 있어야 한다. */}
                <div style={{ marginTop: 8 }}>
                  <button
                    data-testid="publish-listed-apply"
                    disabled={!pending || busy}
                    onClick={() => void doSetListed(want)}
                    style={{
                      ...btn, width: '100%', height: 32, fontSize: 12.5, fontWeight: 700,
                      border: `1px solid ${pending ? t.primary : t.border}`,
                      background: pending ? t.primary : t.surfaceAlt,
                      color: pending ? '#fff' : t.textSubtle,
                      cursor: pending && !busy ? 'pointer' : 'default',
                    }}
                  >
                    {pending
                      ? (want ? tr('publish.listed.applyOn') : tr('publish.listed.applyOff'))
                      : (on ? tr('publish.listed.isOn') : tr('publish.listed.idle'))}
                  </button>
                  <div
                    data-testid="publish-listed-hint"
                    style={{ fontSize: 11.5, lineHeight: 1.6, marginTop: 6,
                      color: pending ? t.warning : t.textSubtle }}
                  >
                    {pending
                      ? (want
                        ? rich(tr('publish.listed.pendingOn'))
                        : rich(tr('publish.listed.pendingOff')))
                      : rich(tr('publish.listed.idleHint'))}
                  </div>
                </div>
              </div>
              );
            })()}

            {/* ★ **유료공개의 값** (2026-09-21, 27b §8.1).
                칸이 없는 서버에서는 그리지 않고(`canSetPrice`), **판매가
                켜지지 않은 서버에서도** 값 칸 대신 이유를 적는다 — 값만
                매겨 두면 **저자는 팔린다고 믿는데 살 길이 없는** 상태가
                된다(27a §3 이 경고한 바로 그 자리). */}
            {status.canSetPrice && !status.dashboard && (
              <PriceRow
                t={t}
                status={status}
                busy={busy}
                onApply={(v) => void doSetPrice(v)}
              />
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
              {status.hasPreview && previewSrc ? (
                <img
                  data-testid="publish-preview-img"
                  src={previewSrc}
                  alt={tr('publish.preview.alt')}
                  style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
                />
              ) : (
                <span style={{ fontSize: 12, color: t.textSubtle }}>
                  {previewBusy ? tr('publish.preview.making') : tr('publish.preview.none')}
                </span>
              )}
            </div>
            {previewError && (
              <div
                data-testid="publish-preview-error"
                style={{
                  fontSize: 11.5, lineHeight: 1.6, marginBottom: 8, padding: '8px 10px',
                  borderRadius: 7, border: `1px solid ${t.danger}`, color: t.danger,
                }}
              >
                {tr('publish.flash.previewFailed', { why: previewError })}
                <br />{tr('publish.preview.errorKeep')}
              </div>
            )}
            <div style={{ fontSize: 11.5, color: t.textSubtle, lineHeight: 1.6, marginBottom: 10 }}>
              {tr('publish.preview.note')}
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
            >{previewBusy ? tr('publish.creating') : tr('publish.preview.remake')}</button>
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
              >{copied ? tr('common.copied') : tr('publish.copyLink')}</button>
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
              >{tr('publish.openNewTab')}</a>
            </div>
            {/* ★ **공개 중에는 취소할 수 없다 — 먼저 비공개로** (2026-09-05
                사용자 결정). 취소는 주소를 영구히 죽이는 일이고 되돌릴 수
                없다. 서버도 같은 판정을 하지만(409), 화면이 **누르기 전에**
                말해 준다 — 눌러 보고 나서야 거절당하지 않게. */}
            {/* 대시보드맵은 [퍼블리싱 취소] 를 두지 않는다 (2026-10-02 사용자 요청) */}
            {!status.dashboard && (() => {
              const locked = !!status.canSetVisibility
                && (status.visibility ?? 'public') !== 'private';
              return (
                <>
                  <button
                    data-testid="publish-stop"
                    disabled={busy || locked}
                    title={locked ? tr('publish.stop.lockedTitle') : undefined}
                    onClick={() => void doUnpublish()}
                    style={{
                      ...btn, width: '100%', marginTop: 10, height: 34,
                      border: `1px solid ${t.border}`, background: t.surface,
                      color: locked ? t.textSubtle : '#B91C1C',
                      cursor: locked ? 'not-allowed' : (busy ? 'default' : 'pointer'),
                      fontWeight: 600, fontSize: 12.5,
                    }}
                  >{busy ? tr('publish.processing') : tr('publish.stop')}</button>
                  {locked && (
                    <div
                      data-testid="publish-stop-locked"
                      style={{ fontSize: 11.5, color: t.textSubtle, lineHeight: 1.6, marginTop: 6 }}
                    >
                      {rich(tr('publish.stop.lockedHint'))}
                    </div>
                  )}
                </>
              );
            })()}
          </>
        )}

        </div>{/* 구르는 칸 끝 */}

        <button
          data-testid="publish-close"
          onClick={onClose}
          style={{
            ...btn, width: '100%', marginTop: 12, height: 32, flexShrink: 0,
            background: 'transparent', color: t.textSubtle, fontWeight: 600, fontSize: 12.5,
          }}
        >{tr('common.close')}</button>
      </div>
    </div>
  );
}

/**
 * ★ **유료공개의 값** (2026-09-21, 27b §8.1).
 *
 * ★ **값을 매길 수 있는 것과 팔 수 있는 것은 다르다.** 자르기(미리보기
 *   경계·검색 경계)는 코어가 하지만, 결제·정산은 유료 모듈(pro)의 일이다.
 *   그 모듈이 없는 서버에서 값 칸만 열어 두면, 저자는 **팔린다고 믿는데
 *   손님에게는 살 길이 없는** 맵이 생긴다 — 27a §3 이 경고한 자리다.
 *   그래서 `GET /v1/features` 의 `map-sales` 가 켜져 있을 때만 값 칸을
 *   그리고, 아니면 **왜 아직인지**를 적는다.
 *
 * ★ **수수료·원천징수는 코어가 적지 않는다.** 요율은 유료 모듈의 설정값
 *   (`sale_settings`)이라 코어가 모른다. 아는 척 10% 를 적어 두면 실제와
 *   다를 때 저자가 "10%라며 왜 13%를 뗐냐" 고 묻게 되고, 그 물음은
 *   정당하다 (27a §6.4). 모르는 숫자는 적지 않는다 — 그 자리는
 *   **`ProSalesGate` 자리**로 열어 두고, 요율을 아는 쪽이 채운다.
 *
 * ★ **값 칸은 기본이 잠김이다** (2026-09-22, 27b §8.1). 유료 모듈이
 *   "이 저자는 받을 준비가 됐다" 고 말해야 풀린다 — 모드 A 에서는 정산
 *   계좌가 확인됐다는 뜻이다. 반대로 두면(기본 열림, 아니면 잠근다)
 *   **확인이 늦게 오는 동안 값이 매겨진다.**
 *
 *   ★ 다만 **[값을 내리고 무료공개로]** 는 잠기지 않는다. 계좌가 나중에
 *     반려돼 잠긴 저자도 자기 맵의 값은 내릴 수 있어야 한다 — 잠그면
 *     팔리지도 내려지지도 않는 맵이 남는다.
 */
function PriceRow({ t, status, busy, onApply }: {
  t: ThemeTokens;
  status: PublishStatus;
  busy: boolean;
  onApply: (priceKrw: number | null) => void;
}) {
  const tr = useTr();
  const locale = LANG_LOCALE[useLang()];
  const sales = useProFeature('map-sales');
  const cur = status.priceKrw ?? null;
  const [draft, setDraft] = useState<string>(cur === null ? '' : String(cur));
  /** 유료 모듈의 답 — `null` 은 "아직 모른다"(잠긴 채로 둔다) */
  const [gateReady, setGateReady] = useState<boolean | null>(null);

  // 서버가 준 값이 바뀌면(다른 곳에서 고쳤다) 칸도 따라간다
  useEffect(() => { setDraft(cur === null ? '' : String(cur)); }, [cur]);

  const box = {
    marginBottom: 10, padding: '10px 12px', borderRadius: 8,
    border: `1px solid ${t.border}`, background: t.surfaceAlt,
  } as const;

  if (sales.status !== 'on') {
    return (
      <div data-testid="publish-price-off" style={box}>
        <b style={{ fontSize: 12.5 }}>{tr('publish.price.title')}</b>
        {/* ★ 서버가 준 `reason` 을 그대로 보이지 않는다 — 그 문장은 운영자
            를 위한 것이라("모듈이 코어보다 오래된 판") 저자에게는 뜻이 없다.
            저자가 알아야 할 것은 **지금 팔 수 있나 없나**와 **왜**다. */}
        <div style={{ fontSize: 11.5, color: t.textSubtle, lineHeight: 1.6, marginTop: 2 }}>
          {tr('publish.price.offHint')}
        </div>
      </div>
    );
  }

  const n = Number.parseInt(draft.replace(/[^0-9]/g, ''), 10);
  const valid = Number.isInteger(n) && n > 0;
  const changed = (valid ? n : null) !== cur;
  // null = 아직 답을 못 받았다. **모르는 동안은 잠근 채로 둔다.**
  const ready = gateReady === true;

  return (
    <div data-testid="publish-price" style={{ ...box, border: `1px solid ${cur === null ? t.border : t.primary}` }}>
      <b style={{ fontSize: 12.5 }}>
        {cur === null ? tr('publish.price.unset') : tr('publish.price.on', { price: cur.toLocaleString(locale) })}
      </b>
      <div style={{ fontSize: 11.5, color: t.textSubtle, lineHeight: 1.6, margin: '2px 0 8px' }}>
        {rich(tr('publish.price.hint'))}
      </div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <input
          data-testid="publish-price-input"
          type="text"
          inputMode="numeric"
          value={draft}
          disabled={busy || !ready}
          placeholder="4900"
          onChange={(e) => setDraft(e.target.value)}
          style={{
            flex: 1, minWidth: 0, height: 30, padding: '0 8px', fontSize: 12.5,
            border: `1px solid ${t.border}`, borderRadius: 6,
            background: t.surface, color: t.text, fontFamily: 'inherit',
          }}
        />
        <span style={{ fontSize: 12.5, color: t.textSubtle }}>{tr('publish.price.unit')}</span>
        <button
          data-testid="publish-price-apply"
          disabled={busy || !changed || !valid || !ready}
          onClick={() => onApply(n)}
          style={{
            height: 30, padding: '0 12px', fontSize: 12, fontWeight: 700, borderRadius: 6,
            border: `1px solid ${changed && valid && ready ? t.primary : t.border}`,
            background: changed && valid && ready ? t.primary : t.surfaceAlt,
            color: changed && valid && ready ? '#fff' : t.textSubtle,
            cursor: changed && valid && ready && !busy ? 'pointer' : 'default',
            fontFamily: 'inherit', whiteSpace: 'nowrap',
          }}
        >{tr('publish.price.apply')}</button>
      </div>

      {/* ★ **유료 모듈의 자리** — 받을 준비가 됐는지 묻고, 됐으면 이 값에서
          수수료·원천징수를 갈라 보여 준다. 코어는 답만 받아 칸을 잠그고
          푼다 (`@pro` 가 없는 빌드의 자리는 `src/pro/stub.tsx`). */}
      <ProSalesGate t={t} priceKrw={valid ? n : null} onReady={setGateReady} />
      {cur !== null && (
        <button
          data-testid="publish-price-clear"
          disabled={busy}
          onClick={() => onApply(null)}
          style={{
            marginTop: 6, width: '100%', height: 28, fontSize: 11.5, borderRadius: 6,
            border: `1px solid ${t.border}`, background: t.surface, color: t.textSubtle,
            cursor: busy ? 'default' : 'pointer', fontFamily: 'inherit',
          }}
        >{tr('publish.price.clear')}</button>
      )}
    </div>
  );
}

/**
 * **대시보드맵을 사내 시스템에 붙이는 코드** (2026-09-30, 22-dashboard.md §4.7).
 *
 * 링크 하나로 두 가지를 한다 — ⑴ 게시판·메일에 **첨부**(그냥 주소) ⑵ 사내 페이지의
 * **하위 화면**으로 끼우기(`<iframe src="…?embed=1">`). 붙여 둔 화면은 10초마다
 * 바뀐 것만 물어 스스로 갱신한다(로그인 없이 — 링크를 아는 사람만 본다).
 */
function DashboardEmbed({ t, url, flash }: { t: ThemeTokens; url: string; flash: (m: string) => void }) {
  const tr = useTr();
  const embedUrl = url ? `${url}?embed=1` : '';
  const code = embedUrl
    ? `<iframe src="${embedUrl}" width="100%" height="600" style="border:0" title="${tr('publish.embed.iframeTitle')}"></iframe>`
    : '';
  /** `doneKey` — 복사됐을 때 띄울 문장의 사전 키 */
  const copy = (text: string, doneKey: string) => {
    const fail = () => flash(tr('publish.embed.copyFailed'));
    if (!navigator.clipboard?.writeText) { fail(); return; }
    navigator.clipboard.writeText(text).then(() => flash(tr(doneKey)), fail);
  };
  const box = {
    width: '100%', boxSizing: 'border-box' as const, padding: '7px 9px', borderRadius: 7,
    border: `1px solid ${t.border}`, background: t.surfaceAlt, color: t.text,
    fontSize: 11.5, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    resize: 'none' as const,
  };
  const small = {
    height: 26, padding: '0 10px', borderRadius: 6, fontSize: 11.5, fontWeight: 700,
    border: `1px solid ${t.border}`, background: t.surface, color: t.text, cursor: 'pointer',
  };
  return (
    <div data-testid="publish-dashboard-embed" style={{
      marginBottom: 10, padding: '10px 12px', borderRadius: 8,
      border: `1px solid ${t.primary}`, background: t.surfaceAlt,
    }}>
      <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 4 }}>{tr('publish.embed.title')}</div>
      <div style={{ fontSize: 11.5, color: t.textMuted, lineHeight: 1.6, marginBottom: 8 }}>
        {rich(tr('publish.embed.intro'))}
      </div>
      <div style={{ fontSize: 11.5, fontWeight: 700, margin: '6px 0 3px' }}>{tr('publish.embed.iframeLabel')}</div>
      <textarea data-testid="publish-embed-code" readOnly rows={3} value={code} style={box}
        onFocus={(e) => e.currentTarget.select()} />
      <div style={{ display: 'flex', gap: 6, marginTop: 5 }}>
        <button data-testid="publish-embed-copy" style={small} disabled={!code}
          onClick={() => copy(code, 'publish.embed.copiedCode')}>{tr('publish.embed.copyCode')}</button>
        <button data-testid="publish-embed-url-copy" style={small} disabled={!embedUrl}
          onClick={() => copy(embedUrl, 'publish.embed.copiedUrl')}>{tr('publish.embed.copyUrl')}</button>
      </div>
      <div style={{ fontSize: 11, color: t.textSubtle, lineHeight: 1.6, marginTop: 6 }}>
        {rich(tr('publish.embed.attachHint'))}
      </div>
    </div>
  );
}
