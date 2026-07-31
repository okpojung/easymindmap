import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import type { ThemeTokens } from '@/components/design-tokens/theme';
import { setHistoryPaused } from '@/stores/documentStore';

interface SectionProps {
  t: ThemeTokens;
  title: string;
  action?: ReactNode;
  children: ReactNode;
  pad?: boolean;
}

export function InspectorSection({ t, title, action, children, pad = true }: SectionProps) {
  return (
    <div style={{
      padding: pad ? '14px 14px 2px' : 0,
      borderBottom: `1px solid ${t.divider}`,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 10,
      }}>
        <div style={{
          fontSize: 10.5, fontWeight: 700, color: t.textSubtle,
          textTransform: 'uppercase', letterSpacing: 0.5,
        }}>{title}</div>
        {action}
      </div>
      {children}
      <div style={{ height: 14 }} />
    </div>
  );
}

interface RowProps {
  t: ThemeTokens;
  label: string;
  children: ReactNode;
}

export function InspectorRow({ t, label, children }: RowProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
      <div style={{ width: 58, fontSize: 11.5, color: t.textMuted, flexShrink: 0 }}>{label}</div>
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  );
}

interface ToggleProps {
  t: ThemeTokens;
  on: boolean;
  onChange?: (v: boolean) => void;
}

export function Toggle({ t, on, onChange }: ToggleProps) {
  return (
    <div
      onClick={() => onChange?.(!on)}
      style={{
        width: 32, height: 18, borderRadius: 9,
        background: on ? t.primary : t.borderStrong,
        position: 'relative', cursor: 'pointer',
        transition: 'background 120ms',
      }}>
      <div style={{
        width: 14, height: 14, borderRadius: '50%',
        background: '#fff',
        position: 'absolute', top: 2, left: on ? 16 : 2,
        transition: 'left 120ms',
        boxShadow: '0 1px 2px rgba(0,0,0,0.3)',
      }} />
    </div>
  );
}

interface ColorSwatchProps {
  t: ThemeTokens;
  value: string;
  onChange?: (v: string) => void;
}

export function ColorSwatchInput({ t, value, onChange }: ColorSwatchProps) {
  // 네이티브 색상 피커의 슬라이더 드래그는 input 이벤트를 초당 수십 번
  // 발사한다 — 매 이벤트마다 전체 맵 재배치 + undo 스냅샷이 쌓여 슬라이더가
  // 심하게 버벅였다 (2026-07-31). 두 가지로 해결:
  //   ① 첫 변경만 undo에 기록하고 드래그 중에는 히스토리를 잠근다
  //      (크기 핸들 드래그와 동일 — 1회 드래그 = 1개 undo 단계)
  //   ② 반영은 100ms 스로틀 (마지막 값은 반드시 커밋 — 미리보기는
  //      초당 ~10회면 충분하고 재배치 비용이 크게 줄어든다)
  // 드래그 끝 판정: 피커의 change 이벤트 또는 600ms 무입력.
  const dragRef = useRef<{
    active: boolean;
    pending: string | null;
    throttle: number | null;
    idle: number | null;
  }>({ active: false, pending: null, throttle: null, idle: null });
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const inputRef = useRef<HTMLInputElement | null>(null);

  const finish = () => {
    const d = dragRef.current;
    if (d.throttle != null) { window.clearTimeout(d.throttle); d.throttle = null; }
    if (d.pending != null) { onChangeRef.current?.(d.pending); d.pending = null; }
    if (d.idle != null) { window.clearTimeout(d.idle); d.idle = null; }
    if (d.active) { d.active = false; setHistoryPaused(false); }
  };

  const handleInput = (v: string) => {
    const d = dragRef.current;
    if (!d.active) {
      // 첫 변경 — undo에 기록되게 즉시 커밋한 뒤 히스토리 잠금
      d.active = true;
      onChangeRef.current?.(v);
      setHistoryPaused(true);
    } else {
      d.pending = v;
      if (d.throttle == null) {
        d.throttle = window.setTimeout(() => {
          d.throttle = null;
          if (d.pending != null) { onChangeRef.current?.(d.pending); d.pending = null; }
        }, 100);
      }
    }
    if (d.idle != null) window.clearTimeout(d.idle);
    d.idle = window.setTimeout(finish, 600);
  };

  useEffect(() => {
    // 피커를 닫으면(확인) 네이티브 change — 즉시 마무리(잠금 해제)
    const el = inputRef.current;
    if (!el) return;
    el.addEventListener('change', finish);
    return () => {
      el.removeEventListener('change', finish);
      finish(); // 언마운트 시 잠금이 남지 않게
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <label style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '4px 6px', borderRadius: 6,
      border: `1px solid ${t.border}`, background: t.surface,
      cursor: onChange ? 'pointer' : 'default',
    }}>
      <span style={{
        width: 18, height: 18, borderRadius: 4,
        background: value, border: `1px solid ${t.border}`,
      }} />
      <span style={{
        fontSize: 11, fontFamily: 'ui-monospace, monospace',
        color: t.textMuted,
      }}>{value}</span>
      <span style={{ marginLeft: 'auto', color: t.textMuted, fontSize: 10 }}>▾</span>
      {onChange && (
        <input
          ref={inputRef}
          type="color"
          value={value}
          onChange={(e) => handleInput(e.target.value)}
          style={{ width: 0, height: 0, opacity: 0, position: 'absolute', pointerEvents: 'none' }}
        />
      )}
    </label>
  );
}
