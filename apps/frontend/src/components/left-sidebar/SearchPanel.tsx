import { useMemo, useState } from 'react';
import type { ThemeTokens } from '@/components/design-tokens/theme';
import type { MindNode } from '@/editor/__samples__/types';
import { I } from '@/components/icons';
import { resolveTagColor } from '@/editor/node-renderer/resolveTagColor';
import { Toggle } from '@/editor/inspector-panels/InspectorSection';
import { useEditorUiStore } from '@/stores/editorUiStore';
import { useDocumentStore } from '@/stores/documentStore';
import { useInteractionStore } from '@/stores/interactionStore';
import { useViewportStore } from '@/stores/viewportStore';

// 실시간 검색 — 노드 텍스트·태그·노트 본문·링크(라벨/URL)를 대상으로
// 대소문자 무시 부분 일치. 결과 클릭 = 캔버스 노드 선택.
interface SearchHit {
  id: string;
  title: string;
  path: string; // 상위 노드 경로
  where: string; // 일치한 위치 (노드/태그/노트/링크)
}

function searchMap(
  nodes: MindNode[],
  q: string,
  path: string[],
  out: SearchHit[],
): void {
  for (const n of nodes) {
    const hay = q.toLowerCase();
    const inText = (n.text || '').toLowerCase().includes(hay);
    const inTags = [...(n.tags ?? []), ...(n.tag ? [n.tag] : [])]
      .some((tg) => tg.toLowerCase().includes(hay));
    const inNotes = (n.notes ?? []).some((b) => (b.text || '').toLowerCase().includes(hay));
    const inLinks = (n.links ?? []).some(
      (l) => (l.label ?? '').toLowerCase().includes(hay) || l.url.toLowerCase().includes(hay),
    );
    if (inText || inTags || inNotes || inLinks) {
      const where = [
        inText ? '노드' : '',
        inTags ? '태그' : '',
        inNotes ? '노트' : '',
        inLinks ? '링크' : '',
      ].filter(Boolean).join(' · ');
      out.push({ id: n.id, title: n.text, path: path.join(' › '), where });
    }
    searchMap(n.children ?? [], q, [...path, n.text], out);
  }
}

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
  const expandAncestors = useDocumentStore((s) => s.expandAncestors);
  const setSelectedId = useInteractionStore((s) => s.setSelectedId);
  const setSearchHitId = useInteractionStore((s) => s.setSearchHitId);
  const requestCenterNode = useViewportStore((s) => s.requestCenterNode);

  const [query, setQuery] = useState('');
  const results = useMemo<SearchHit[]>(() => {
    const q = query.trim();
    if (!q) return [];
    const out: SearchHit[] = [];
    // 루트 포함
    if ((map.root.text || '').toLowerCase().includes(q.toLowerCase())) {
      out.push({ id: 'root', title: map.root.text, path: '', where: '노드' });
    }
    searchMap(map.branches, q, [map.root.text], out);
    return out.slice(0, 50);
  }, [map, query]);

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
          value={query}
          onChange={(e) => setQuery(e.target.value)}
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

      {query.trim() !== '' && (
        <div style={{
          fontSize: 11, color: t.textSubtle, marginBottom: 6,
          textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: 600,
        }}>결과 {results.length}건</div>
      )}

      {results.map((r) => (
        <div key={r.id}
          data-search-hit={r.id}
          onClick={() => {
            setSelectedId(r.id);
            // 캔버스에서 노란 채움 + 붉은 테두리로 또렷하게 표시
            setSearchHitId(r.id);
            // 접힌 조상은 펼치고, 해당 노드를 화면 중앙 + 100% 보기
            // (HTML 뷰어 검색과 동일 동작)
            expandAncestors(r.id);
            requestCenterNode(r.id, 100);
          }}
          title="클릭하면 노란 강조 + 화면 중앙 100% 보기로 이동합니다"
          style={{
            padding: '8px 10px', borderRadius: 7, marginBottom: 4,
            background: 'transparent',
            border: '1px solid transparent',
            cursor: 'pointer',
          }}>
          <div style={{
            fontSize: 13, fontWeight: 500, color: t.text, marginBottom: 2,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {highlight(r.title, query, t.primary)}
          </div>
          <div style={{ fontSize: 11, color: t.textSubtle }}>
            {r.path || '루트'} · <b>{r.where}</b>
          </div>
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


// 일치 구간을 <mark> 스타일로 강조 (innerHTML 없이 안전하게 분할 렌더)
function highlight(text: string, q: string, color: string) {
  const idx = text.toLowerCase().indexOf(q.trim().toLowerCase());
  if (idx < 0 || !q.trim()) return text;
  const end = idx + q.trim().length;
  return (
    <>
      {text.slice(0, idx)}
      <mark style={{ background: `${color}44`, borderRadius: 2, padding: '0 2px', color: 'inherit' }}>
        {text.slice(idx, end)}
      </mark>
      {text.slice(end)}
    </>
  );
}
