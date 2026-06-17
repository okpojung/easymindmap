import type { ThemeTokens } from '@/components/design-tokens/theme';
import type { MindNode } from '@/editor/__samples__/types';
import { I } from '@/components/icons';
import { resolveTagColor } from '@/editor/node-renderer/resolveTagColor';
import { Toggle } from '@/editor/inspector-panels/InspectorSection';
import { useEditorUiStore } from '@/stores/editorUiStore';
import { useDocumentStore } from '@/stores/documentStore';

const RESULTS = [
  { title: '에디터 코어 — 노드 CRUD', path: 'Q1 기반 구축', match: '에디터' },
  { title: '에디터 마크다운 파이프라인', path: 'Q2 AI 통합', match: '에디터' },
  { title: '에디터 단축키 정책', path: '리스크 & 완화', match: '에디터' },
];

// Collect every distinct tag defined anywhere in the map.
function collectTags(nodes: MindNode[], acc: Set<string>) {
  for (const n of nodes) {
    if (n.tag) acc.add(n.tag);
    (n.tags ?? []).forEach((tg) => acc.add(tg));
    if (n.children) collectTags(n.children, acc);
  }
}

export function SearchPanel({ t }: { t: ThemeTokens }) {
  const showTags = useEditorUiStore((s) => s.showTags);
  const setShowTags = useEditorUiStore((s) => s.setShowTags);
  const hiddenTags = useEditorUiStore((s) => s.hiddenTags);
  const toggleTagHidden = useEditorUiStore((s) => s.toggleTagHidden);
  const map = useDocumentStore((s) => s.map);

  const tagSet = new Set<string>();
  if (map.root.tag) tagSet.add(map.root.tag);
  (map.root.tags ?? []).forEach((tg) => tagSet.add(tg));
  collectTags(map.branches, tagSet);
  const mapTags = Array.from(tagSet);

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
        marginTop: 14, marginBottom: 6,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span style={{
          fontSize: 11, color: t.textSubtle,
          textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: 600,
        }}>태그 필터</span>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
          <span style={{ fontSize: 11, color: t.textMuted }}>Tag 표시</span>
          <Toggle t={t} on={showTags} onChange={setShowTags} />
        </label>
      </div>

      {/* Per-tag visibility filter — when "Tag 표시" is on, only checked tags
          are shown on the canvas. */}
      <div style={{ fontSize: 10.5, color: t.textSubtle, marginBottom: 6, lineHeight: 1.4 }}>
        선택한 태그만 노드에 표시됩니다.
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {mapTags.length === 0 && (
          <div style={{ fontSize: 11.5, color: t.textSubtle }}>맵에 정의된 태그가 없습니다.</div>
        )}
        {mapTags.map((tag) => {
          const tc = resolveTagColor(tag, t);
          const checked = !hiddenTags.includes(tag);
          return (
            <label
              key={tag}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                cursor: showTags ? 'pointer' : 'default',
                opacity: showTags ? 1 : 0.5,
                padding: '3px 2px',
              }}
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={!showTags}
                onChange={() => toggleTagHidden(tag)}
                style={{ accentColor: t.primary, cursor: 'inherit' }}
              />
              <span style={{
                fontSize: 11, padding: '3px 7px', borderRadius: 3,
                background: tc.bg, border: `1px solid ${tc.border}`,
                color: tc.text, fontWeight: 600, letterSpacing: 0.2,
              }}>#{tag}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
