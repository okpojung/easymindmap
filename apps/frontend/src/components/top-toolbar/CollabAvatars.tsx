import type { ThemeTokens } from '@/components/design-tokens/theme';
import type { Collaborator } from '@/editor/__samples__/types';

interface Props {
  t: ThemeTokens;
  collabs: Collaborator[];
}

export function CollabAvatars({ t, collabs }: Props) {
  const active = collabs.filter(c => c.active);
  const shown = active.slice(0, 3);
  const extra = active.length - shown.length;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
      {shown.map((c, i) => (
        <div key={c.id} title={c.name} style={{
          width: 28, height: 28, borderRadius: '50%',
          background: (t as any)[c.colorKey],
          color: '#fff', fontSize: 11, fontWeight: 700,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: `2px solid ${t.surface}`,
          marginLeft: i === 0 ? 0 : -8,
          position: 'relative',
          cursor: 'pointer',
        }}>
          {c.initial}
          {c.editing && (
            <span style={{
              position: 'absolute', bottom: -1, right: -1,
              width: 9, height: 9, borderRadius: '50%',
              background: t.success, border: `2px solid ${t.surface}`,
            }} />
          )}
        </div>
      ))}
      {extra > 0 && (
        <div style={{
          width: 28, height: 28, borderRadius: '50%',
          background: t.surfaceAlt, color: t.textMuted,
          fontSize: 11, fontWeight: 600,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: `2px solid ${t.surface}`, marginLeft: -8,
        }}>+{extra}</div>
      )}
    </div>
  );
}
