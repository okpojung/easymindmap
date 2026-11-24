import { useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { ThemeTokens } from '@/components/design-tokens/theme';
import { DialogFrame, DialogCloseButton } from '@/components/ui/DialogFrame';
import { useTr } from '@/i18n';

export function MinimapHelp({ t, onClose }: { t: ThemeTokens; onClose: () => void }) {
  const tr = useTr(), root = useRef<HTMLDivElement>(null), close = useRef(onClose);
  close.current = onClose;
  useLayoutEffect(() => {
    const previous = document.activeElement;
    const dialog = root.current!.querySelector<HTMLElement>('[role="dialog"]')!;
    dialog.setAttribute('aria-labelledby', 'minimap-help-heading'); dialog.tabIndex = -1; dialog.focus();
    const key = (e: KeyboardEvent) => {
      e.stopImmediatePropagation(); // Do not run canvas shortcuts behind this modal.
      if (e.key === 'Escape') { e.preventDefault(); close.current(); }
      if (e.key !== 'Tab') return;
      const controls = Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled)'));
      const first = controls[0], last = controls[controls.length - 1];
      if (!controls.includes(document.activeElement as HTMLElement) || (e.shiftKey ? document.activeElement === first : document.activeElement === last)) {
        e.preventDefault(); (e.shiftKey ? last : first)?.focus();
      }
    };
    window.addEventListener('keydown', key, true);
    return () => { window.removeEventListener('keydown', key, true); if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); };
  }, []);
  const rows = ['bar', 'move', 'pin', 'navigate', 'wheel', 'shortcut'] as const;
  return createPortal(<div ref={root} onPointerDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()} onWheel={e => e.stopPropagation()}>
    <DialogFrame t={t} testId="minimap-help-dialog" title={<span id="minimap-help-heading">{tr('editor.minimap.help')}</span>} onClose={onClose}
      footer={<DialogCloseButton t={t} testId="minimap-help-close" onClick={onClose} />}>
      <p style={{ fontSize: 13, lineHeight: 1.7, marginTop: 4 }}>{tr('editor.minimap.help.intro')}</p>
      <dl style={{ margin: 0, fontSize: 12.5, lineHeight: 1.7 }}>
        {rows.map(row => <div key={row} style={{ padding: '9px 0', borderTop: `1px solid ${t.border}` }}>
          <dt style={{ fontWeight: 700 }}>{tr(`editor.minimap.help.${row}.title`)}</dt>
          <dd style={{ margin: '3px 0 0', color: t.textMuted }}>{tr(`editor.minimap.help.${row}.body`)}</dd>
        </div>)}
      </dl>
    </DialogFrame>
  </div>, document.body);
}
