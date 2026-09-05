// PublicMapPage — 퍼블리싱 링크(`/p/{publishId}`)로 열리는 **읽기 전용** 화면.
// 설계: docs/04-extensions/publish/27-publish-share.md (PUBL-03)
//
// ★ 왜 에디터를 재사용하지 않고 **내보내기 뷰어**를 쓰나
//   이 화면에 필요한 것은 "에디터에서 보던 그대로, 고칠 수는 없이"다.
//   그런 물건이 이미 있다 — Standalone HTML 내보내기의 뷰어
//   (`buildStandaloneHtml`). 확대·이동·접기/펴기·노트 보기까지 되고,
//   **편집 경로가 아예 없다**.
//
//   `Canvas` 를 읽기 전용 모드로 쓰는 길도 있었지만 그러지 않았다.
//   Canvas 는 문서 스토어와 깊게 얽혀 있어 "읽기 전용"이 **플래그 하나로
//   지켜지는 성질**이 아니다. 저장·자동저장·잠금 같은 경로가 하나라도
//   남아 있으면, 남의 맵을 보던 사람이 그 맵을 고칠 수 있게 된다.
//   여기서는 **애초에 그 코드가 실려 있지 않은 것**이 안전하다.
//
// ★ 왜 iframe 인가 — sandbox
//   뷰어 HTML 에는 남이 쓴 글이 데이터로 박힌다. `sandbox` 로 격리하면
//   설령 그 글에서 무언가 새어 나가더라도 **우리 오리진에 닿지 못한다**
//   (allow-same-origin 을 주지 않는다 — 이 한 줄이 격리의 전부다).

import { useEffect, useMemo, useState } from 'react';
import type { LayoutType, SampleMap } from '@/editor/__samples__/types';
import { buildStandaloneHtml } from '@/export/exportHtml';
import { withInlinedImages, withInlinedAttachments } from '@/export/mapMeta';
import {
  cloudApi, CloudError, publishedAttachmentUrl, serverAttachmentId,
  type PublishedMap,
} from '@/services/cloud/apiClient';

/** 주소가 퍼블리싱 링크인가 — 맞으면 publishId */
export function publishIdFromPath(pathname: string): string | null {
  const m = /^\/p\/([a-z0-9]{6,20})\/?$/.exec(pathname);
  return m ? m[1] : null;
}

interface Snapshot {
  map?: SampleMap;
  editor?: { layoutType?: LayoutType; spacingX?: number; spacingY?: number };
}

/**
 * 서버 저장소를 가리키는 사진·첨부 주소를 **퍼블리싱 주소로 바꾼다.**
 *
 * 이 한 단계가 없으면 퍼블리싱된 맵은 사진 자리마다 깨진 채로 열린다 —
 * 원래 주소(`/v1/attachments/{id}`)는 로그인을 요구하기 때문이다.
 * 바꾸는 규칙은 `withInlinedImages`·`withInlinedAttachments` 가 이미
 * 알고 있다(노트 HTML 속 `<img>` 까지 포함) — 순회를 새로 쓰지 않는다.
 */
function withPublicAttachments(map: SampleMap, publishId: string): SampleMap {
  const byImageSrc = (src: string) => {
    const id = serverAttachmentId(src);
    return id ? publishedAttachmentUrl(publishId, id) : undefined;
  };
  return withInlinedAttachments(
    withInlinedImages(map, byImageSrc),
    (attachmentId) => publishedAttachmentUrl(publishId, attachmentId),
  );
}

export function PublicMapPage({ publishId }: { publishId: string }) {
  const [data, setData] = useState<PublishedMap | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    cloudApi.getPublished(publishId)
      .then((d) => { if (alive) setData(d); })
      .catch((err) => {
        if (!alive) return;
        setError(err instanceof CloudError
          ? err.message
          : '페이지를 여는 중 오류가 발생했습니다.');
      });
    return () => { alive = false; };
  }, [publishId]);

  // 뷰어 HTML 은 문서가 바뀔 때만 다시 만든다 — 큰 맵에서는 무거운 작업이다
  const html = useMemo(() => {
    if (!data) return null;
    const snap = data.doc as Snapshot | null;
    const map = snap?.map;
    if (!map) return null;
    try {
      const spacing = {
        x: snap?.editor?.spacingX ?? 1,
        y: snap?.editor?.spacingY ?? 1,
      };
      return buildStandaloneHtml(
        withPublicAttachments(map, publishId),
        snap?.editor?.layoutType,
        undefined,
        spacing,
      );
    } catch {
      return null;
    }
  }, [data, publishId]);

  useEffect(() => {
    if (data?.title) document.title = `${data.title} — EasyMindMap`;
  }, [data?.title]);

  if (error) {
    return (
      <Message
        title="페이지를 찾을 수 없습니다"
        body={error}
        testId="public-map-error"
      />
    );
  }
  if (!data) {
    return <Message title="여는 중…" body="퍼블리싱된 맵을 불러오고 있습니다." testId="public-map-loading" />;
  }
  if (!html) {
    return (
      <Message
        title="맵을 표시할 수 없습니다"
        body="이 맵의 저장 형식을 인식하지 못했습니다. 맵 주인에게 다시 저장한 뒤 공유해 달라고 알려 주세요."
        testId="public-map-broken"
      />
    );
  }

  return (
    <iframe
      data-testid="public-map-frame"
      title={data.title}
      srcDoc={html}
      // allow-same-origin 은 주지 않는다 — 이 한 줄이 격리의 전부다.
      // 스크립트는 뷰어(확대·접기)에 필요하고, 팝업은 노드 링크가 쓴다.
      sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
      style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', border: 'none' }}
    />
  );
}

function Message({ title, body, testId }: { title: string; body: string; testId: string }) {
  return (
    <div
      data-testid={testId}
      style={{
        position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 8,
        background: '#F8FAFC', color: '#0F172A', textAlign: 'center', padding: 24,
        fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
      }}
    >
      <div style={{ fontSize: 18, fontWeight: 800 }}>{title}</div>
      <div style={{ fontSize: 13.5, color: '#475569', lineHeight: 1.7, maxWidth: 460 }}>{body}</div>
      <a
        href="/"
        style={{ marginTop: 10, fontSize: 13, color: '#2563EB', textDecoration: 'none' }}
      >EasyMindMap 열기</a>
    </div>
  );
}
