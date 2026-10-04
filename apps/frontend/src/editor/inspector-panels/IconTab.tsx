// IconTab — node icon / symbol picker (NS-05), separate from links/attachments.
// Provides categorized symbols, the current icon, removal, and left/right
// placement of the icon inside the node. Applies to a node at ANY depth.

import type { ThemeTokens } from '@/components/design-tokens/theme';
import { useDocumentStore, findNodeInMap } from '@/stores/documentStore';
import { InspectorSection } from './InspectorSection';
import { useTr } from '@/i18n';

// 손가락 기기의 입력칸 16px·누를 자리 40px (data-mm-touch) — 불러오기만 하면 CSS 가 들어간다
import '@/components/ui/mobileCss';
import { useCoarse } from '@/hooks/useViewport';
// [서버 연결 예정] Supabase 연동 시 이 하드코딩 카탈로그는 icon_catalog
// 테이블(분류·glyph·명칭)로 이관되어 시스템 관리자 설정 메뉴에서
// 추가·수정·삭제한다 (docs/02-domain/db-schema.md §향후 관리 테이블,
// docs/04-extensions/settings/32-settings.md §4.3.1 참조).
// label 은 사전 키 — 렌더할 때 번역한다
const CATEGORIES: { label: string; icons: string[] }[] = [
  { label: 'inspector.icon.cat.flags', icons: ['🚩', '⛳', '📌', '📍', '🏁', '🔖', '🏷️'] },
  { label: 'inspector.icon.cat.stars', icons: ['⭐', '🌟', '✨', '💫', '🏆', '🥇'] },
  { label: 'inspector.icon.cat.status', icons: ['✅', '✔️', '❌', '⚠️', '❗', '❓', '⛔', '🔴', '🟠', '🟡', '🟢', '🔵'] },
  { label: 'inspector.icon.cat.arrows', icons: ['➡️', '⬅️', '⬆️', '⬇️', '↗️', '↘️', '🔁', '🔄'] },
  { label: 'inspector.icon.cat.numbers', icons: ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'] },
  { label: 'inspector.icon.cat.emotions', icons: ['😀', '🙂', '😐', '😟', '😡', '😎', '👍', '👎'] },
  { label: 'inspector.icon.cat.objects', icons: ['💡', '🚀', '🔥', '🎯', '📊', '🧱', '🔒', '💬', '🌐', '⏱️', '🗂️', '📎', '📁', '📅', '💰', '🔔'] },
];

export function IconTab({ t, selectedId }: { t: ThemeTokens; selectedId: string | null }) {
  const tr = useTr();
  const coarse = useCoarse();
  const map = useDocumentStore((s) => s.map);
  const setNodeIcon = useDocumentStore((s) => s.setNodeIcon);
  const setNodeIconSide = useDocumentStore((s) => s.setNodeIconSide);

  const node = findNodeInMap(map, selectedId);
  const disabled = !selectedId || !node;
  const iconSide = (node?.iconSide ?? 'left') as 'left' | 'right';

  return (
    <div data-mm-touch-compact="" style={disabled ? { opacity: 0.5, pointerEvents: 'none' } : undefined}>
      <InspectorSection t={t} title={tr('inspector.icon.currentTitle')}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '6px 8px', background: t.surfaceAlt,
          border: `1px solid ${t.border}`, borderRadius: 6,
        }}>
          <span style={{ fontSize: 20 }}>{node?.icon ?? '∅'}</span>
          <span style={{ fontSize: 11, color: t.textMuted, flex: 1 }}>
            {node?.icon ? tr('inspector.icon.current') : tr('inspector.icon.none')}
          </span>
          {node?.icon && (
            <button onClick={() => selectedId && setNodeIcon(selectedId, undefined)} style={{
              fontSize: coarse ? 12 : 10, padding: coarse ? '8px 12px' : '2px 8px', borderRadius: 4,
              background: 'transparent', border: `1px solid ${t.border}`,
              color: t.textMuted, cursor: 'pointer',
            }}>{tr('inspector.icon.remove')}</button>
          )}
        </div>

        {/* Icon position within the node */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
          <span style={{ fontSize: 11.5, color: t.textMuted, width: 60 }}>{tr('inspector.icon.position')}</span>
          {(['left', 'right'] as const).map((side) => {
            const active = iconSide === side;
            return (
              <button key={side}
                onClick={() => selectedId && setNodeIconSide(selectedId, side)}
                style={{
                  flex: 1, padding: coarse ? '11px 0' : '5px 0', borderRadius: 5, fontSize: coarse ? 13 : 11.5,
                  background: active ? t.primarySoft : t.surfaceAlt,
                  color: active ? t.primary : t.textMuted,
                  border: `1px solid ${active ? t.primaryBorder : t.border}`,
                  cursor: 'pointer',
                }}>
                {side === 'left' ? tr('inspector.icon.left') : tr('inspector.icon.right')}
              </button>
            );
          })}
        </div>
      </InspectorSection>

      {CATEGORIES.map((cat) => (
        <InspectorSection key={cat.label} t={t} title={tr(cat.label)}>
          {/* 손가락 기기 — 8칸(27px)은 이웃 아이콘을 잘못 누르기 쉽다. 6칸 · 정사각 */}
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${coarse ? 6 : 8}, 1fr)`, gap: coarse ? 4 : 3 }}>
            {cat.icons.map((em) => (
              <button key={em} title={em}
                onClick={() => selectedId && setNodeIcon(selectedId, em)}
                style={{
                  padding: 4, borderRadius: 5, fontSize: coarse ? 20 : 17, lineHeight: 1,
                  minHeight: coarse ? 40 : undefined,
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
