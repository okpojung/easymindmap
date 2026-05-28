import type { ThemeTokens } from '@/components/design-tokens/theme';

const TEMPLATES = [
  { name: '제품 로드맵',   desc: 'Q1~Q4 분기별 마일스톤', colors: ['#D97706','#0284C7','#15803D','#9333EA'] },
  { name: '브레인스토밍', desc: '자유 확장 방사형 맵',    colors: ['#F59E0B','#FBBF24'] },
  { name: 'WBS 프로젝트', desc: '계층형 작업 분해 구조',  colors: ['#0284C7','#38BDF8','#7DD3FC'] },
  { name: 'Kanban 보드',  desc: '백로그 → 완료 흐름',     colors: ['#958A78','#D97706','#0284C7','#15803D'] },
  { name: '회의록',       desc: '안건 · 결정 · 액션',     colors: ['#DC2626','#F59E0B','#15803D'] },
];

export function TemplatePanel({ t }: { t: ThemeTokens }) {
  return (
    <div style={{ padding: 12 }}>
      <div style={{
        fontSize: 11, color: t.textSubtle, marginBottom: 8,
        textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: 600,
      }}>템플릿 라이브러리</div>
      {TEMPLATES.map((tpl, i) => (
        <div key={i} style={{
          padding: 10, borderRadius: 8,
          background: t.surface, border: `1px solid ${t.border}`,
          marginBottom: 6, cursor: 'pointer',
        }}>
          <div style={{ display: 'flex', gap: 3, marginBottom: 6 }}>
            {tpl.colors.map((c, j) => (
              <span key={j} style={{ width: 18, height: 6, borderRadius: 3, background: c }} />
            ))}
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: t.text, marginBottom: 2 }}>
            {tpl.name}
          </div>
          <div style={{ fontSize: 11, color: t.textMuted }}>{tpl.desc}</div>
        </div>
      ))}
    </div>
  );
}
