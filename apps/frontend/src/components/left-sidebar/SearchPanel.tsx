import type { ThemeTokens } from '@/components/design-tokens/theme';
import { I } from '@/components/icons';
import { resolveTagColor } from '@/editor/node-renderer/resolveTagColor';

const RESULTS = [
  { title: '에디터 코어 — 노드 CRUD', path: 'Q1 기반 구축', match: '에디터' },
  { title: '에디터 마크다운 파이프라인', path: 'Q2 AI 통합', match: '에디터' },
  { title: '에디터 단축키 정책', path: '리스크 & 완화', match: '에디터' },
];

const TAG_FILTERS = ['MVP', 'AI', 'V1', 'Export', 'DB'];

export function SearchPanel({ t }: { t: ThemeTokens }) {
  return (
    <div style={{ padding: 12 }}>
      <div style={{ position: 'relative', marginBottom: 12 }}>
        <div style={{
          position: 'absolute', left: 10, top: '50%',
          transform: 'translateY(-50%)',
          color: t.textMuted, display: 'flex',
        }}>
          <I.Search size={14} />
        </div>
        <input
          placeholder="노드 · 태그 · 노트 검색"
          defaultValue="에디터"
          style={{
            width: '100%', boxSizing: 'border-box',
            padding: '8px 10px 8px 30px',
            borderRadius: 7,
            border: `1px solid ${t.border}`,
            background: t.surface, color: t.text,
            fontSize: 13, outline: 'none',
            fontFamily: 'inherit',
          }} />
      </div>

      <div style={{
        fontSize: 11, color: t.textSubtle, marginBottom: 6,
        textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: 600,
      }}>결과 {RESULTS.length}건</div>

      {RESULTS.map((r, i) => (
        <div key={i} style={{
          padding: '8px 10px', borderRadius: 7, marginBottom: 4,
          background: i === 0 ? t.primarySoft : 'transparent',
          border: `1px solid ${i === 0 ? t.primaryBorder + '40' : 'transparent'}`,
          cursor: 'pointer',
        }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: t.text, marginBottom: 2 }}
               dangerouslySetInnerHTML={{
                 __html: r.title.replace(
                   r.match,
                   `<mark style="background:${t.primary}44; color:${t.text}; border-radius:2px; padding:0 2px;">${r.match}</mark>`,
                 ),
               }} />
          <div style={{ fontSize: 11, color: t.textSubtle }}>{r.path}</div>
        </div>
      ))}

      <div style={{
        marginTop: 14, fontSize: 11, color: t.textSubtle, marginBottom: 6,
        textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: 600,
      }}>태그 필터</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {TAG_FILTERS.map(tag => {
          const tc = resolveTagColor(tag, t);
          return (
            <span key={tag} style={{
              fontSize: 11, padding: '3px 7px', borderRadius: 3,
              background: tc.bg, border: `1px solid ${tc.border}`,
              color: tc.text, cursor: 'pointer', fontWeight: 600,
              letterSpacing: 0.2,
            }}>#{tag}</span>
          );
        })}
      </div>
    </div>
  );
}
