import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchListed, mapUrl, previewUrl, type ListedMap } from '../api';

const fmt = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`;
};

/**
 * 이름 안의 검색어를 **글자 단위로 강조** — 문서함과 같은 규칙이다
 * (`MapBrowser.tsx`). 이름이 맞은 것은 어디가 맞았는지 이름에서 바로
 * 보이면 되고, 맵 **내용**이 맞은 것만 건수(`내용 12건`)로 알린다.
 * 여러 노드·노트가 걸렸을 때 무엇을 보여줄지 고민할 필요가 없어진다.
 */
function highlight(text: string, term: string) {
  const t = term.trim().toLowerCase();
  if (!t) return text;
  const low = text.toLowerCase();
  const out: React.ReactNode[] = [];
  let i = 0;
  let key = 0;
  for (;;) {
    const at = low.indexOf(t, i);
    if (at < 0) { out.push(text.slice(i)); break; }
    if (at > i) out.push(text.slice(i, at));
    out.push(<mark key={key += 1}>{text.slice(at, at + t.length)}</mark>);
    i = at + t.length;
  }
  return out;
}

/** 첫 화면에 검색어를 실어 올 수 있게 — `/library?q=회의` 를 그대로 연다 */
const termFromUrl = () => new URLSearchParams(window.location.search).get('q') ?? '';

export default function Library() {
  const [items, setItems] = useState<ListedMap[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // 첫 판이 끝났는가 — "아직 없습니다" 를 **불러오기 전에** 보여 주면 안 된다
  const [ready, setReady] = useState(false);
  /** 입력칸의 글자 — 타자마다 바뀐다 */
  const [term, setTerm] = useState(termFromUrl);
  /** 실제로 서버에 보낸 말 — 멈칫한 뒤에 따라온다 */
  const [applied, setApplied] = useState(termFromUrl);
  /**
   * 지금 몇 번째 요청인가 — **늦게 온 옛 답이 새 결과를 덮지 않게** 한다.
   * "회" 의 답이 "회의" 의 답보다 늦게 오는 일은 실제로 일어난다.
   */
  const gen = useRef(0);

  const load = useCallback(async (after: string | null, q: string) => {
    const mine = gen.current += 1;
    setLoading(true);
    setError(null);
    try {
      const page = await fetchListed(after, 24, q || undefined);
      if (gen.current !== mine) return;
      setItems((prev) => (after ? [...prev, ...page.items] : page.items));
      setCursor(page.nextCursor);
    } catch (e) {
      if (gen.current !== mine) return;
      setError(e instanceof Error ? e.message : '목록을 불러오지 못했습니다.');
    } finally {
      if (gen.current === mine) { setLoading(false); setReady(true); }
    }
  }, []);

  // 타자마다 서버를 두드리지 않는다 — 멈칫한 뒤에 한 번 (문서함과 같은 250ms).
  // 글자가 그대로면 `setApplied` 는 아무 일도 하지 않으므로, 첫 판에
  // 이 효과가 돌아도 아래 효과를 한 번 더 부르지 않는다.
  useEffect(() => {
    const t = window.setTimeout(() => setApplied(term.trim()), 250);
    return () => window.clearTimeout(t);
  }, [term]);

  // 첫 판과 "검색어가 바뀌었을 때" 가 같은 일이다 — **첫 쪽부터 다시**.
  // (StrictMode 가 이 효과를 두 번 돌려도 `after` 가 null 이라 목록을
  //  덧붙이지 않고 갈아 끼운다. 같은 줄이 두 번 쌓이지 않는다.)
  useEffect(() => {
    setCursor(null);
    void load(null, applied);
    // 주소에도 남긴다 — 검색 결과를 그대로 나눠 줄 수 있게. `replaceState`
    // 라 뒤로가기 기록이 타자 수만큼 쌓이지 않는다.
    const url = applied ? `/library?q=${encodeURIComponent(applied)}` : '/library';
    window.history.replaceState({}, '', url);
  }, [applied, load]);

  const searching = applied.length > 0;
  const empty = useMemo(() => !error && ready && items.length === 0, [error, ready, items.length]);

  return (
    <>
      <section className="wrap head">
        <h1>지식창고</h1>
        <p>저자가 공개한 맵을 둘러보세요. 로그인 없이 바로 열립니다.</p>

        {/* ★ 찾는 자리를 **목록 위**에 둔다 — 문서함과 같다. 맵이 몇 개
            없을 때도 자리가 비어 보이지 않게 설명 한 줄을 붙였다 */}
        <div className="search">
          <label className="searchbox">
            <span className="ico" aria-hidden="true">🔍</span>
            <input
              type="search"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="맵 이름과 맵 안의 내용에서 찾기"
              aria-label="지식창고에서 찾기"
            />
            {term && (
              <button
                type="button"
                className="clear"
                onClick={() => { setTerm(''); setApplied(''); }}
                aria-label="검색어 지우기"
              >✕</button>
            )}
          </label>
          <p className="small">
            이름뿐 아니라 <b>맵 안의 노드·노트·태그</b>까지 찾습니다.
          </p>
        </div>
      </section>

      <section className="wrap">
        {error && (
          <div className="note err">
            <b>{error}</b>
            <div style={{ marginTop: 12 }}>
              <button className="btn ghost" onClick={() => void load(cursor, applied)}>다시 시도</button>
            </div>
          </div>
        )}

        {/* ★ 비어 있는 것은 **결함이 아니라 사실**이다. 다만 "아직 아무도
            진열하지 않았다" 와 "찾는 말이 없다" 는 **다른 사실**이라
            다르게 적는다 — 같은 문장을 쓰면 손님이 검색을 지워 볼
            생각을 못 한다 */}
        {empty && !searching && (
          <div className="note">
            <b>아직 진열된 맵이 없습니다.</b>
            <div style={{ marginTop: 6 }}>
              맵을 퍼블리싱한 뒤 <b>[지식창고에 올린다]</b> 를 켜면 여기에 나타납니다.
            </div>
          </div>
        )}
        {empty && searching && (
          <div className="note">
            <b>“{applied}” 로 찾은 맵이 없습니다.</b>
            <div style={{ marginTop: 6 }}>
              맵 이름과 맵 안의 내용을 모두 찾아본 결과입니다. 다른 말로 찾아보세요.
            </div>
            <div style={{ marginTop: 12 }}>
              <button className="btn ghost" onClick={() => { setTerm(''); setApplied(''); }}>
                전체 보기
              </button>
            </div>
          </div>
        )}

        {items.length > 0 && (
          <div className="grid">
            {items.map((m) => (
              <a
                className="card"
                key={m.publishId}
                href={mapUrl(m.publishId)}
                /* ★ **새 탭**으로 연다 (2026-09-19 사용자 요청). 둘러보는
                   자리라 한 맵을 보고 목록으로 돌아오는 일이 잦다 — 같은
                   탭에서 열면 찾던 말(`?q=`)과 '더 보기' 로 불러 둔 줄이
                   모두 사라지고, 뒤로가기로 되살아나는지는 브라우저 마음이다.
                   새 탭은 목록을 **그대로 남겨 둔다**. 맵 쪽에는 그 탭을
                   닫는 자리가 선다(`PublicMapPage` 의 `viewer-bar`). */
                target="_blank"
                /* opener 는 끊고(남의 맵 안의 스크립트가 이 창을 못 만지게)
                   referrer 는 남긴다 — 맵 화면이 "지식창고에서 왔다" 를
                   그것으로 안다. `noreferrer` 를 쓰면 돌아갈 자리가 사라진다. */
                rel="noopener"
                aria-label={`${m.title} — 새 탭에서 열기`}
              >
                {m.hasPreview
                  ? (
                    <span className="thumb">
                      <img src={previewUrl(m.publishId)} alt="" loading="lazy" width={1200} height={630} />
                    </span>
                  )
                  : <span className="thumb empty">미리보기 없음</span>}
                <span className="body">
                  <h2>{highlight(m.title, applied)}</h2>
                  {/* ★ 값은 **카드에서 바로** 보인다 (2026-09-21, 27b §2.1) —
                      가격은 비밀이 아니라 손님에게 보여 줘야 하는 숫자라
                      코어가 목록에 실어 준다. 값이 없으면 아무것도 그리지
                      않는다(무료 맵에 "무료" 를 붙이면 유료가 기본처럼
                      읽힌다). */}
                  {m.priceKrw != null && (
                    <span className="price" title="유료 맵 — 미리보기는 2단계까지 보입니다">
                      {m.priceKrw.toLocaleString('ko-KR')}원
                    </span>
                  )}
                  <span className="meta">
                    {m.nodeCount != null ? `${m.nodeCount}노드 · ` : ''}{fmt(m.publishedAt)}
                    {(m.matchCount ?? 0) > 0 && (
                      <span
                        className="hits"
                        title={`이 맵의 내용(노드·노트·태그)에서 ${m.matchCount}건 찾았습니다`}
                      >내용 {m.matchCount}건</span>
                    )}
                  </span>
                </span>
              </a>
            ))}
          </div>
        )}

        {cursor && !error && (
          <div className="more">
            <button className="btn ghost" disabled={loading} onClick={() => void load(cursor, applied)}>
              {loading ? '불러오는 중…' : '더 보기'}
            </button>
          </div>
        )}
      </section>
    </>
  );
}
