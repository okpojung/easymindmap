// AITab — node-scoped AI generation (expand the selected node) + recent history.

import type { ThemeTokens } from '@/components/design-tokens/theme';
import { I } from '@/components/icons';
import { InspectorSection } from './InspectorSection';

const HISTORY = [
  { prompt: '마인드맵 MVP 설계',         when: '오늘 14:02', nodes: 12 },
  { prompt: 'Q3 협업 런칭 세부 플랜',     when: '어제',       nodes: 18 },
];

export function AITab({ t }: { t: ThemeTokens }) {
  return (
    <div>
      <InspectorSection t={t} title="AI 마인드맵 생성">
        <textarea
          placeholder="어떤 주제로 확장할까요?"
          defaultValue="이 노드를 확장해서 MVP 구현 작업을 상세히 분해해줘"
          style={{
            width: '100%', boxSizing: 'border-box', padding: 10,
            fontSize: 12.5, borderRadius: 7, resize: 'vertical',
            minHeight: 72, outline: 'none',
            background: t.surfaceAlt, color: t.text,
            border: `1px solid ${t.border}`,
            fontFamily: 'inherit',
          }} />
        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10.5, color: t.textSubtle, marginBottom: 3 }}>최대 깊이</div>
            <select defaultValue="3" style={selectStyle(t)}>
              <option>2</option><option>3</option><option>4</option>
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10.5, color: t.textSubtle, marginBottom: 3 }}>자식 수</div>
            <select defaultValue="5" style={selectStyle(t)}>
              <option>3</option><option>5</option><option>7</option>
            </select>
          </div>
        </div>
        <button style={{
          width: '100%', marginTop: 8, padding: 9,
          background: `linear-gradient(135deg, ${t.primary}, ${t.primaryHover})`,
          color: '#fff', border: 'none', borderRadius: 7,
          fontSize: 13, fontWeight: 600, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        }}>
          <I.Sparkles size={14} /> 이 노드 아래로 확장
        </button>
      </InspectorSection>

      <InspectorSection t={t} title="최근 생성 기록">
        {HISTORY.map((h, i) => (
          <div key={i} style={{
            padding: '8px 10px', borderRadius: 6,
            background: t.surfaceAlt, border: `1px solid ${t.border}`,
            marginBottom: 5, cursor: 'pointer',
          }}>
            <div style={{
              fontSize: 12, color: t.text, fontWeight: 500, marginBottom: 3,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{h.prompt}</div>
            <div style={{ fontSize: 10.5, color: t.textSubtle, display: 'flex', gap: 8 }}>
              <span>{h.when}</span>
              <span>·</span>
              <span>{h.nodes} 노드</span>
            </div>
          </div>
        ))}
      </InspectorSection>
    </div>
  );
}

function selectStyle(t: ThemeTokens) {
  return {
    width: '100%', padding: '5px 8px', borderRadius: 5,
    border: `1px solid ${t.border}`,
    background: t.surface, color: t.text,
    fontSize: 12, fontFamily: 'inherit' as const,
  };
}
