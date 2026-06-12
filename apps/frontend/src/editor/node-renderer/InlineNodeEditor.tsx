import { useEffect, useRef } from 'react';

interface Props {
  value: string;
  onSave: (text: string) => void;
  onCancel: () => void;
}

export function InlineNodeEditor({
  value,
  onSave,
  onCancel,
}: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  return (
    <textarea
      ref={ref}
      defaultValue={value}
      rows={3}
      style={{
        width: '100%',
        height: '100%',
        border: 'none',
        outline: 'none',
        resize: 'none',
        background: 'transparent',
        fontSize: '14px',
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();

          onSave(
            (e.target as HTMLTextAreaElement).value,
          );
        }

        if (e.key === 'Escape') {
          onCancel();
        }
      }}
      onBlur={(e) => {
        onSave(e.target.value);
      }}
    />
  );
}