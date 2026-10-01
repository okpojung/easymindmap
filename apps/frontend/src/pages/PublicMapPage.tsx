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

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { LayoutType, SampleMap } from '@/editor/__samples__/types';
import { buildStandaloneHtml } from '@/export/exportHtml';
import { withInlinedImages, withInlinedAttachments } from '@/export/mapMeta';
import {
  cloudApi, CloudError, publishedAttachmentUrl, serverAttachmentId,
  type PreviewStats, type PublishedMap,
} from '@/services/cloud/apiClient';
import { useProFeature } from '@/pro/contract';
import { ProBuyPanel } from '@pro';
import { isFreshTab, libraryBackHref } from '@/utils/viewerChrome';

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

/**
 * 대시보드맵을 붙여 둔 화면이 "바뀌었나" 묻는 간격 — 에디터의 대시보드 도구줄과 **같은
 * 선택지·같은 기본(10초)·같은 저장 칸** (2026-10-01 사용자 요청: "대시보드맵을 열었을 때와
 * 똑같이 상단에, 리프레시 간격 설정도 같이"). 0 = 끔(⟳ 를 누를 때만 확인).
 */
const DASH_INTERVALS = [0, 10, 30, 60, 300];
const DASH_INTERVAL_KEY = 'emm.dash.interval';
function loadDashInterval(): number {
  try {
    const raw = localStorage.getItem(DASH_INTERVAL_KEY);
    const v = Number(raw);
    return raw !== null && DASH_INTERVALS.includes(v) ? v : 10;
  } catch { return 10; }
}
const intervalLabel = (s: number) => (s === 0 ? '끔' : s < 60 ? `${s}초` : `${s / 60}분`);
/** 위쪽 대시보드 막대 높이 — iframe 이 이만큼 내려간다 */
const DASH_H = 34;

/** `?embed=1` — 사내 페이지 안 iframe 으로 붙일 때. 돌아갈 막대를 그리지 않는다 */
function isEmbed(): boolean {
  try { return new URLSearchParams(window.location.search).get('embed') === '1'; } catch { return false; }
}

/**
 * 다음 **시계 눈금**까지 남은 ms — :00·:10·:20… (2026-09-30 사용자 요청, 에디터의 대시보드
 * 자동 갱신과 같은 규칙). 눈금이 2초 안이면 그다음 눈금으로 넘긴다.
 */
function msToNextTick(intervalMs: number, now = Date.now(), minGap = 2000): number {
  let d = intervalMs - (now % intervalMs);
  if (d < minGap) d += intervalMs;
  return d;
}

const hhmmss = (d: Date) => [d.getHours(), d.getMinutes(), d.getSeconds()]
  .map((n) => String(n).padStart(2, '0')).join(':');

export function PublicMapPage({ publishId }: { publishId: string }) {
  const [data, setData] = useState<PublishedMap | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [embed] = useState(isEmbed);
  /** 대시보드맵 — 마지막으로 **서버에 확인한** 시각(눈금 시각). 바뀐 시각은 `changedAt` */
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);
  const [changedAt, setChangedAt] = useState<Date | null>(null);
  const [stale, setStale] = useState(false);
  const [checking, setChecking] = useState(false);
  const [intervalSec, setIntervalSec] = useState(loadDashInterval);
  const pickInterval = (v: number) => {
    setIntervalSec(v);
    try { localStorage.setItem(DASH_INTERVAL_KEY, String(v)); } catch { /* 이 브라우저만의 편의 */ }
  };
  /** ⟳ — 표식과 상관없이 지금 다시 받는다 (아래 효과가 채운다) */
  const checkNowRef = useRef<() => void>(() => undefined);
  const stampRef = useRef<string | undefined>(undefined);
  // ★ **지금 시각을 매초** 보인다 (2026-09-30 사용자 요청 — 마지막 확인 시각이 아니라 현재 시각).
  //   시계는 멈추지 않으므로 **확인이 멈춘 것**은 따로 가린다(아래 `stalled` → ⚠️).
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!data?.dashboard) return undefined;
    let timer: number | undefined;
    const arm = () => {
      timer = window.setTimeout(() => { setNow(new Date()); arm(); }, 1000 - (Date.now() % 1000) + 5);
    };
    arm();
    return () => window.clearTimeout(timer);
  }, [data?.dashboard]);
  useEffect(() => { stampRef.current = data?.stamp; }, [data?.stamp]);

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

  // ★ **대시보드맵은 스스로 갱신한다** (2026-09-30, 22-dashboard.md §4.7).
  //   사내 시스템에 붙여 둔 화면이라 아무도 새로고침을 누르지 않는다. 10초마다
  //   **표식만** 묻고(`/stamp` — 문서를 받지 않는다), 달라졌을 때만 문서를 다시
  //   받는다. 탭이 안 보이면 멈추고, 돌아오면 바로 한 번 묻는다. 일반 퍼블리싱
  //   맵은 편집이 잠긴 완성본이라 묻지 않는다.
  //   ★ 다시 그리면 뷰어의 확대·위치가 처음으로 돌아간다 — 대시보드는 "한눈에
  //   보는" 화면이라 받아들인다(22 §4.7).
  const isDashboard = !!data?.dashboard;
  useEffect(() => {
    if (!isDashboard) return undefined;
    setRefreshedAt((v) => v ?? new Date());
    let alive = true;
    let busy = false;
    const tick = async (at: Date, force = false) => {
      if (busy || (document.hidden && !force)) return;
      busy = true;
      setChecking(true);
      try {
        const s = await cloudApi.getPublishedStamp(publishId);
        if (!alive) return;
        setStale(false);
        if (force || s.stamp !== stampRef.current) {
          const d = await cloudApi.getPublished(publishId);
          if (!alive) return;
          setData(d);
          setChangedAt(new Date());
        }
        setRefreshedAt(at);
      } catch (err) {
        // 링크가 닫혔으면(비공개·취소) 그 사실을 보인다 — 옛 숫자를 계속 띄우지 않는다
        if (alive && err instanceof CloudError && err.status === 404) {
          setError('이 대시보드의 링크가 닫혔습니다 — 맵 주인이 비공개로 돌렸거나 퍼블리싱을 취소했습니다.');
        } else if (alive) {
          setStale(true);
        }
      } finally {
        busy = false;
        if (alive) setChecking(false);
      }
    };
    checkNowRef.current = () => { void tick(new Date(), true); };
    // 시계 눈금마다(:00·:10·:20…) — setInterval 은 밀리므로 매번 다음 눈금을 다시 잰다.
    // 간격 0(끔)이면 스스로 묻지 않는다 — ⟳ 를 누를 때만
    let timer: number | undefined;
    const arm = () => {
      window.clearTimeout(timer);
      if (document.hidden || intervalSec <= 0) return;
      timer = window.setTimeout(() => {
        void tick(new Date(Math.round(Date.now() / 1000) * 1000));
        arm();
      }, msToNextTick(intervalSec * 1000));
    };
    const onVis = () => {
      if (!document.hidden && intervalSec > 0) void tick(new Date());
      arm();
    };
    arm();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      alive = false;
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVis);
      checkNowRef.current = () => undefined;
    };
  }, [isDashboard, publishId, intervalSec]);

  // 위쪽 대시보드 막대만큼 iframe 을 내린다 (ViewerBar 의 `--viewer-bar` 와 같은 방법)
  useEffect(() => {
    if (!isDashboard) return undefined;
    document.documentElement.style.setProperty('--viewer-dash', `${DASH_H}px`);
    return () => { document.documentElement.style.removeProperty('--viewer-dash'); };
  }, [isDashboard]);

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
    <>
      {!embed && <ViewerBar title={data.title} />}
      {isDashboard && refreshedAt && (
        <DashboardBar
          now={now}
          refreshedAt={refreshedAt}
          changedAt={changedAt}
          stale={stale}
          checking={checking}
          intervalSec={intervalSec}
          onInterval={pickInterval}
          onRefresh={() => checkNowRef.current()}
        />
      )}
      {data.locked && (
        <PaidBanner
          publishId={publishId}
          title={data.title}
          priceKrw={data.priceKrw ?? null}
          stats={data.stats}
        />
      )}
      <iframe
        data-testid="public-map-frame"
        title={data.title}
        srcDoc={html}
        // allow-same-origin 은 주지 않는다 — 이 한 줄이 격리의 전부다.
        // 스크립트는 뷰어(확대·접기)에 필요하고, 팝업은 노드 링크가 쓴다.
        sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
        style={{
          position: 'fixed', left: 0, right: 0, bottom: 0,
          // 막대가 있을 때만 그만큼 내린다 — 없으면 예전 그대로 화면 전체다
          // 막대 + (유료면) 잠김 띠만큼 내려간다
          top: 'calc(var(--viewer-bar, 0px) + var(--viewer-paid, 0px) + var(--viewer-dash, 0px))', width: '100%',
          height: 'calc(100% - var(--viewer-bar, 0px) - var(--viewer-paid, 0px) - var(--viewer-dash, 0px))',
          border: 'none',
        }}
      />
    </>
  );
}

/**
 * 대시보드맵 공개 화면의 **위쪽 막대** (2026-10-01 사용자 요청: "링크로 열었을 때 시간이랑
 * 연결 상태가 좌측 하단에 표시되는데, 대시보드맵을 열었을 때와 똑같이 상단에 — 리프레시 시간
 * 간격 설정도 같이"). 에디터 도구줄의 대시보드 알약과 같은 순서·같은 기호다:
 * `🟢 HH:MM:SS  ⟳  [10초▾]` — 🟢 정상 · ⏳ 확인 중 · ⚠️ 서버에 닿지 못함/확인이 멈춤.
 * 색은 뷰어 머리말(`#FFFDF8` / `#E4D9C3`)과 같아 바로 아래 머리말과 한 덩어리로 읽힌다.
 * 간격은 에디터와 같은 칸(`emm.dash.interval`)에 이 브라우저만 기억한다.
 */
function DashboardBar({
  now, refreshedAt, changedAt, stale, checking, intervalSec, onInterval, onRefresh,
}: {
  now: Date; refreshedAt: Date; changedAt: Date | null; stale: boolean; checking: boolean;
  intervalSec: number; onInterval: (v: number) => void; onRefresh: () => void;
}) {
  // 확인 간격의 2배 + 5초 넘게 확인이 없으면 멈춘 것으로 본다 (끔이면 보지 않는다)
  const stalled = intervalSec > 0 && now.getTime() - refreshedAt.getTime() > intervalSec * 2000 + 5000;
  const warn = stale || stalled;
  const small: CSSProperties = {
    height: 22, padding: '0 7px', borderRadius: 5, fontSize: 11, fontWeight: 700,
    border: '1px solid #D8CBB2', background: '#fff', color: '#4A3F30',
    cursor: 'pointer', fontFamily: 'inherit',
  };
  return (
    <div
      data-testid="public-dashboard-bar"
      style={{
        position: 'fixed', left: 0, right: 0, zIndex: 9,
        top: 'calc(var(--viewer-bar, 0px) + var(--viewer-paid, 0px))', height: DASH_H,
        boxSizing: 'border-box', display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px',
        background: '#FFFDF8', borderBottom: '1px solid #E4D9C3', color: '#6B5E4A',
        fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif', fontSize: 11.5,
      }}
    >
      <span style={{ fontWeight: 700 }}>📊 대시보드</span>
      <span style={{ flex: 1 }} />
      <span
        data-testid="public-dashboard-live"
        title={(warn
          ? '서버에 확인하지 못하고 있습니다 — 마지막으로 받은 값을 보여 주고 있습니다\n'
          : intervalSec > 0
            ? `대시보드맵 — ${intervalLabel(intervalSec)}마다 시계 눈금에 맞춰 바뀐 것을 확인해 스스로 갱신합니다\n`
            : '자동 갱신이 꺼져 있습니다 — ⟳ 를 누를 때만 확인합니다\n')
          + `보이는 시각 = 지금 시각 · 마지막 확인 ${hhmmss(refreshedAt)} · 마지막 변경 ${changedAt ? hhmmss(changedAt) : '—'}`}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, height: 26, padding: '0 8px',
          borderRadius: 7, fontWeight: 600, whiteSpace: 'nowrap',
          background: '#F7F1E6', border: '1px solid #E4D9C3', color: '#4A3F30',
        }}
      >
        <span data-testid="public-dashboard-health" aria-hidden>{warn ? '⚠️' : checking ? '⏳' : '🟢'}</span>
        <span data-testid="public-dashboard-clock" style={{ fontVariantNumeric: 'tabular-nums' }}>{hhmmss(now)}</span>
        <button data-testid="public-dashboard-refresh" style={small} title="지금 다시 받기" onClick={onRefresh}>⟳</button>
        <select
          data-testid="public-dashboard-interval"
          value={intervalSec}
          onChange={(e) => onInterval(Number(e.target.value))}
          title="자동 갱신 간격 (이 브라우저에만 기억)"
          style={{ ...small, padding: '0 2px' }}
        >
          {DASH_INTERVALS.map((v) => <option key={v} value={v}>{intervalLabel(v)}</option>)}
        </select>
      </span>
    </div>
  );
}

/** 막대 높이 — iframe 이 이만큼 내려간다 */
const BAR_H = 38;
/** 유료 띠까지 있을 때의 높이 */
const PAID_H = 86;

/**
 * 뷰어 위의 **돌아갈 자리** (2026-09-19 사용자 지적).
 *
 * ★ **뒤로 갈 곳이 없는 탭에만 그린다** (`viewerChrome.ts`). 지식창고는
 *   맵을 새 탭으로 열므로 브라우저 뒤로가기 버튼이 회색이다 — 그 사람에게는
 *   길이 필요하다. 반대로 남의 블로그에서 같은 탭으로 따라온 사람에게는
 *   브라우저가 이미 길을 주고 있으니 **아무것도 얹지 않는다**(화면이
 *   예전 그대로 전체가 된다).
 *
 * ★ 색은 뷰어 머리말(`exportHtml` 의 `<header>`)과 같은 `#FFFDF8` /
 *   `#E4D9C3` 다 — 두 줄이 **한 덩어리**로 읽히게.
 */
function ViewerBar({ title }: { title: string }) {
  const [back] = useState(() => libraryBackHref(document.referrer, window.location.origin));
  const [fresh] = useState(() => isFreshTab(window.history.length));

  // 막대가 있을 때만 iframe 을 내린다 — CSS 변수 하나로 전한다
  useEffect(() => {
    if (!fresh) return undefined;
    document.documentElement.style.setProperty('--viewer-bar', `${BAR_H}px`);
    return () => { document.documentElement.style.removeProperty('--viewer-bar'); };
  }, [fresh]);

  if (!fresh) return null;

  /**
   * 이 탭을 닫는다.
   *
   * ★ `window.close()` 는 **거부될 수 있다** — 브라우저는 "스크립트가 연
   *   창" 이나 "기록이 한 장뿐인 탭" 만 닫게 해 준다. 규칙상 여기는 닫히는
   *   자리지만(새 탭이라 기록이 한 장이다), 거부되면 **아무 일도 일어나지
   *   않은 것처럼 보인다** — 누른 사람은 버튼이 고장 났다고 여긴다.
   *   그래서 닫히지 않으면 지식창고로 **데려다준다**.
   */
  const closeTab = () => {
    window.close();
    window.setTimeout(() => {
      if (window.closed) return;
      window.location.href = back ?? '/';
    }, 200);
  };

  return (
    <div
      data-testid="viewer-bar"
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, height: BAR_H, zIndex: 10,
        display: 'flex', alignItems: 'center', gap: 10, padding: '0 10px',
        background: '#FFFDF8', borderBottom: '1px solid #E4D9C3',
        fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
        boxSizing: 'border-box',
      }}
    >
      {back && (
        <a data-testid="viewer-back" href={back} style={barBtn}>← 지식창고</a>
      )}
      <span
        style={{
          flex: 1, minWidth: 0, fontSize: 12, color: '#8B7D68',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}
      >{title}</span>
      <button data-testid="viewer-close" type="button" onClick={closeTab} style={barBtn}>
        ✕ 닫기
      </button>
    </div>
  );
}

/**
 * ★ **유료 맵의 잠김 띠** (2026-09-21, 27b §8.2).
 *
 * 아래 뷰어에 그려진 것은 **2레벨까지 잘린 미리보기**다 — 서버가 자른
 * 것이라(`trimForPreview`) 여기서 무엇을 더 가릴 일은 없다. 이 띠가 하는
 * 일은 **그것이 전부가 아니라는 사실을 말해 주는 것**이다. 말해 주지
 * 않으면 손님은 "내용이 빈약한 맵" 으로 읽고 떠난다.
 *
 * ★ **[구매하기] 는 살 수 있을 때만 그린다.** 판매는 유료 모듈(pro)의
 *   일이라, 이 서버에 그것이 없으면 단추 대신 **왜 없는지**를 적는다
 *   (`GET /v1/features` 의 `map-sales`). 누르고 나서야 실패를 만나는 것이
 *   가장 나쁘다 — `canSetVisibility` 를 다루는 방식과 같다.
 */
function PaidBanner(
  { publishId, title, priceKrw, stats }: {
    publishId: string; title: string; priceKrw: number | null; stats?: PreviewStats;
  },
) {
  const sales = useProFeature('map-sales');

  useEffect(() => {
    document.documentElement.style.setProperty('--viewer-paid', `${PAID_H}px`);
    return () => { document.documentElement.style.removeProperty('--viewer-paid'); };
  }, []);

  const num = (n: number) => n.toLocaleString('ko-KR');
  const facts = stats ? [
    `${num(stats.nodeCount)}개 노드`,
    `최대 ${stats.maxDepth}단계`,
    ...(stats.attachmentCount ? [`첨부 ${num(stats.attachmentCount)}개`] : []),
    ...(stats.noteCount ? [`노트 ${num(stats.noteCount)}개`] : []),
  ].join(' · ') : null;

  return (
    <div
      data-testid="paid-banner"
      style={{
        position: 'fixed', left: 0, right: 0, zIndex: 9,
        top: 'var(--viewer-bar, 0px)', height: PAID_H, boxSizing: 'border-box',
        display: 'flex', alignItems: 'center', gap: 14, padding: '0 14px',
        background: '#FFF7E6', borderBottom: '1px solid #F0D9A8',
        fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: '#7A5A12' }}>
          🔒 유료 맵의 미리보기입니다 — 2단계까지만 보입니다
        </div>
        <div style={{ fontSize: 11.5, color: '#8B7346', marginTop: 3, lineHeight: 1.6 }}>
          {facts ? `전체 ${facts}` : '전체 내용은 구매하면 볼 수 있습니다'}
          {stats && stats.hiddenCount > 0 && ` · 가려진 노드 ${num(stats.hiddenCount)}개`}
        </div>
        <div style={{ fontSize: 11, color: '#A08B5E', marginTop: 2 }}>
          노트 · 첨부 · 링크는 미리보기에 들어 있지 않습니다.
        </div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        {priceKrw !== null && (
          <div
            data-testid="paid-price"
            style={{ fontSize: 17, fontWeight: 800, color: '#7A5A12' }}
          >{num(priceKrw)}원</div>
        )}
        {sales.status === 'on' ? (
          // 판매가 켜진 서버에서는 유료 모듈이 자기 화면을 얹는다.
          // 코어에는 결제 단추의 **자리**만 있다 (open-core-boundary §3.1 ③).
          //
          // ★ 결제·환불·전문 서빙은 전부 유료 모듈의 일이다. 코어는 이
          //   자리에 **무엇을 파는지**(주소·제목·값)만 넘긴다 — 손님이
          //   결제 뒤 `?sale=` 을 달고 돌아오는 것도 그쪽이 읽는다.
          <div data-testid="paid-buy-slot" style={{ marginTop: 4 }}>
            <ProBuyPanel publishId={publishId} title={title} priceKrw={priceKrw} />
          </div>
        ) : (
          // ★ **서버가 준 `reason` 을 손님에게 그대로 보이지 않는다.**
          //   그 문장은 운영자를 위한 것이다("모듈이 코어보다 오래된 판일
          //   수 있습니다") — 맵을 사러 온 사람에게는 뜻도 없고, 우리
          //   서버의 속사정을 밖으로 흘리는 일이기도 하다. 손님에게는
          //   **지금 살 수 있나 없나**만 있으면 된다.
          <div
            data-testid="paid-unavailable"
            style={{ fontSize: 11, color: '#A08B5E', marginTop: 4, maxWidth: 260 }}
          >
            아직 구매할 수 없습니다 — 판매 준비가 끝나면 열립니다.
          </div>
        )}
      </div>
    </div>
  );
}

const barBtn: CSSProperties = {
  padding: '5px 11px', border: '1px solid #D8CBB2', borderRadius: 6,
  background: '#FFF', color: '#3F3428', fontSize: 11.5, fontWeight: 600,
  cursor: 'pointer', textDecoration: 'none', lineHeight: 1.4, whiteSpace: 'nowrap',
  fontFamily: 'inherit',
};

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
