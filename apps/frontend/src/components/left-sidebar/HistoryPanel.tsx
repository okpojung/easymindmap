import type { ThemeTokens } from '@/components/design-tokens/theme';

const REVISIONS = [
  { when: '지금',        who: '김지연',    what: '노드 편집: "에디터 코어 — 노드 CRUD"', current: true  },
  { when: '2분 전',      who: '박민호',    what: '노드 추가 · 3개' },
  { when: '8분 전',      who: '박민호',    what: '레이아웃 변경 → 방사형' },
  { when: '오늘 14:02', who: '김지연',    what: 'AI 생성 수락 (12 노드)' },
  { when: '오늘 10:18', who: '김지연',    what: '맵 생성' },
  { when: '어제',        who: 'Jane Park', what: '템플릿 "제품 로드맵" 불러오기' },
];

export function HistoryPanel({ t }: { t: ThemeTokens }) {
  return (
    <div style={{ padding: '12px 12px 16px' }}>
      <div style={{
        fontSize: 11, color: t.textSubtle, marginBottom: 8,
        textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: 600,
      }}>변경 이력</div>
      <div style={{ position: 'relative', paddingLeft: 14 }}>
        <div style={{
          position: 'absolute', left: 5, top: 6, bottom: 6,
          width: 2, background: t.divider,
        }} />
        {REVISIONS.map((r, i) => (
          <div key={i} style={{ position: 'relative', paddingBottom: 12 }}>
            <span style={{
              position: 'absolute', left: -13, top: 5,
              width: 10, height: 10, borderRadius: '50%',
              background: r.current ? t.primary : t.surface,
              border: `2px solid ${r.current ? t.primary : t.borderStrong}`,
              boxShadow: r.current ? `0 0 0 3px ${t.primary}33` : 'none',
            }} />
            <div style={{
              fontSize: 11,
              color: r.current ? t.primary : t.textMuted,
              fontWeight: r.current ? 600 : 500, marginBottom: 2,
            }}>
              {r.when} · {r.who}
            </div>
            <div style={{ fontSize: 12.5, color: t.text, lineHeight: 1.4 }}>{r.what}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
