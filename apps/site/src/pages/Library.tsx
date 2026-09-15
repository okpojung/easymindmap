import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchListed, mapUrl, previewUrl, type ListedMap } from '../api';

const fmt = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`;
};

export default function Library() {
  const [items, setItems] = useState<ListedMap[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // 첫 판이 끝났는가 — "아직 없습니다" 를 **불러오기 전에** 보여 주면 안 된다
  const [ready, setReady] = useState(false);
  // StrictMode 는 효과를 두 번 돌린다. 첫 판이 두 번 나가면 같은 줄이 두 번 쌓인다
  const started = useRef(false);

  const load = useCallback(async (after: string | null) => {
    setLoading(true);
    setError(null);
    try {
      const page = await fetchListed(after);
      setItems((prev) => (after ? [...prev, ...page.items] : page.items));
      setCursor(page.nextCursor);
    } catch (e) {
      setError(e instanceof Error ? e.message : '목록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
      setReady(true);
    }
  }, []);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void load(null);
  }, [load]);

  return (
    <>
      <section className="wrap head">
        <h1>지식창고</h1>
        <p>저자가 공개한 맵을 둘러보세요. 로그인 없이 바로 열립니다.</p>
      </section>

      <section className="wrap">
        {error && (
          <div className="note err">
            <b>{error}</b>
            <div style={{ marginTop: 12 }}>
              <button className="btn ghost" onClick={() => void load(cursor)}>다시 시도</button>
            </div>
          </div>
        )}

        {/* ★ 비어 있는 것은 **결함이 아니라 사실**이다 — 아직 아무도 진열하지
            않았을 뿐이다. 그 말을 제대로 그려 준다 */}
        {!error && ready && items.length === 0 && (
          <div className="note">
            <b>아직 진열된 맵이 없습니다.</b>
            <div style={{ marginTop: 6 }}>
              맵을 퍼블리싱한 뒤 <b>[지식창고에 올린다]</b> 를 켜면 여기에 나타납니다.
            </div>
          </div>
        )}

        {items.length > 0 && (
          <div className="grid">
            {items.map((m) => (
              <a className="card" key={m.publishId} href={mapUrl(m.publishId)}>
                {m.hasPreview
                  ? (
                    <span className="thumb">
                      <img src={previewUrl(m.publishId)} alt="" loading="lazy" width={1200} height={630} />
                    </span>
                  )
                  : <span className="thumb empty">미리보기 없음</span>}
                <span className="body">
                  <h2>{m.title}</h2>
                  <span className="meta">
                    {m.nodeCount != null ? `${m.nodeCount}노드 · ` : ''}{fmt(m.publishedAt)}
                  </span>
                </span>
              </a>
            ))}
          </div>
        )}

        {cursor && !error && (
          <div className="more">
            <button className="btn ghost" disabled={loading} onClick={() => void load(cursor)}>
              {loading ? '불러오는 중…' : '더 보기'}
            </button>
          </div>
        )}
      </section>
    </>
  );
}
