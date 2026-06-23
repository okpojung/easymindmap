// IconTab — node icon / symbol picker (NS-05), separate from links/attachments.
// Provides categorized symbols, the current icon, removal, and left/right
// placement of the icon inside the node. Applies to a node at ANY depth.

import type { ThemeTokens } from '@/components/design-tokens/theme';
import { useDocumentStore, findNodeInMap } from '@/stores/documentStore';
import { InspectorSection } from './InspectorSection';

const CATEGORIES: { label: string; icons: string[] }[] = [
  { label: '깃발 · 표시', icons: ['🚩', '⛳', '📌', '📍', '🏁', '🔖', '🏷️'] },
  { label: '별 · 평점', icons: ['⭐', '🌟', '✨', '💫', '🏆', '🥇'] },
  { label: '상태', icons: ['✅', '✔️', '❌', '⚠️', '❗', '❓', '⛔', '🔴', '🟠', '🟡', '🟢', '🔵'] },
  { label: '화살표', icons: ['➡️', '⬅️', '⬆️', '⬇️', '↗️', '↘️', '🔁', '🔄'] },
  { label: '숫자', icons: ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'] },
  { label: '감정', icons: ['😀', '🙂', '😐', '😟', '😡', '😎', '👍', '👎'] },
  { label: '사물 · 일반', icons: ['💡', '🚀', '🔥', '🎯', '📊', '🧱', '🔒', '💬', '🌐', '⏱️', '🗂️', '📎', '📁', '📅', '💰', '🔔'] },
];

export function IconTab({ t, selectedId }: { t: ThemeTokens; selectedId: string | null }) {
  const map = useDocumentStore((s) => s.map);
  const setNodeIcon = useDocumentStore((s) => s.setNodeIcon);
  const setNodeIconSide = useDocumentStore((s) => s.setNodeIconSide);

  const node = findNodeInMap(map, selectedId);
  const disabled = !selectedId || !node;
  const iconSide = (node?.iconSide ?? 'left') as 'left' | 'right';

  return (
    <div style={disabled ? { opacity: 0.5, pointerEvents: 'none' } : undefined}>
      <InspectorSection t={t} title="현재 아이콘 (NS-05 · 모든 레벨)">
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '6px 8px', background: t.surfaceAlt,
          border: `1px solid ${t.border}`, borderRadius: 6,
        }}>
          <span style={{ fontSize: 20 }}>{node?.icon ?? '∅'}</span>
          <span style={{ fontSize: 11, color: t.textMuted, flex: 1 }}>
            {node?.icon ? '현재 아이콘' : '아이콘 없음'}
          </span>
          {node?.icon && (
            <button onClick={() => selectedId && setNodeIcon(selectedId, undefined)} style={{
              fontSize: 10, padding: '2px 8px', borderRadius: 4,
              background: 'transparent', border: `1px solid ${t.border}`,
              color: t.textMuted, cursor: 'pointer',
            }}>제거</button>
          )}
        </div>

        {/* Icon position within the node */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
          <span style={{ fontSize: 11.5, color: t.textMuted, width: 60 }}>위치</span>
          {(['left', 'right'] as const).map((side) => {
            const active = iconSide === side;
            return (
              <button key={side}
                onClick={() => selectedId && setNodeIconSide(selectedId, side)}
                style={{
                  flex: 1, padding: '5px 0', borderRadius: 5, fontSize: 11.5,
                  background: active ? t.primarySoft : t.surfaceAlt,
                  color: active ? t.primary : t.textMuted,
                  border: `1px solid ${active ? t.primaryBorder : t.border}`,
                  cursor: 'pointer',
                }}>
                {side === 'left' ? '◧ 왼쪽' : '오른쪽 ◨'}
              </button>
            );
          })}
        </div>
      </InspectorSection>

      {CATEGORIES.map((cat) => (
        <InspectorSection key={cat.label} t={t} title={cat.label}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 3 }}>
            {cat.icons.map((em) => (
              <button key={em} title={em}
                onClick={() => selectedId && setNodeIcon(selectedId, em)}
                style={{
                  padding: 4, borderRadius: 5, fontSize: 17, lineHeight: 1,
                  background: node?.icon === em ? t.primarySoft : 'transparent',
                  border: `1px solid ${node?.icon === em ? t.primaryBorder : 'transparent'}`,
                  cursor: 'pointer',
                }}>
                {em}
              </button>
            ))}
          </div>
        </InspectorSection>
      ))}
    </div>
  );
}
