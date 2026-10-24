import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { ThemeTokens } from '@/components/design-tokens/theme';
import { setHistoryPaused } from '@/stores/documentStore';
import { useCoarse } from '@/hooks/useViewport';
import { useTr } from '@/i18n';
import { I } from '@/components/icons';
import { contrastRatio, normalizeHex, pushRecentColor, readRecentColors, COLOR_PALETTE } from './colorUtils';

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
      {/* 제목과 동작 단추가 한 줄에 안 들어가면(폰 서랍 266px) 단추를 다음 줄로 —
          전에는 노트의 [+문단][+코드][+표][+체크] 가 패널 밖으로 삐져나갔다 */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', rowGap: 6, columnGap: 8,
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
  // 손가락 기기 — 32×18 은 누르기 어렵다. 겉 크기만 키우고(44×26) 모양은 같다
  const coarse = useCoarse();
  const k = coarse ? 1.4 : 1;
  return (
    <div
      role="switch"
      aria-checked={!!on}
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); onChange?.(!on); } }}
      onClick={() => onChange?.(!on)}
      style={{
        width: 32 * k, height: 18 * k, borderRadius: 9 * k, flexShrink: 0,
        background: on ? t.primary : t.borderStrong,
        position: 'relative', cursor: 'pointer',
        transition: 'background 120ms',
      }}>
      <div style={{
        width: 14 * k, height: 14 * k, borderRadius: '50%',
        background: '#fff',
        position: 'absolute', top: 2 * k, left: on ? 16 * k : 2 * k,
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
  /** 이 색과 짝이 되는 색(채움↔글자) — 주면 창 아래에 글자 대비를 보여 준다 */
  contrastWith?: string;
  /** '기본값으로' — 노드별 색을 지워 레벨·가지 기본 색으로 돌린다 */
  onReset?: () => void;
  /** 창 제목 (예: 채움색) */
  label?: string;
}

/**
 * 색 칸 + 자체 색 창 (2026-10-24 UI/UX 검토 ②③).
 *
 * 전에는 칸을 누르면 브라우저 기본 색 창이 바로 열렸고, Windows Chrome·Whale
 * 에서는 그 창이 R·G·B 칸을 먼저 보여 줘 HEX 를 넣기 어려웠다. 이제는
 *   · HEX 입력칸 (#RGB · #RRGGBB, 붙여넣기 · Enter)
 *   · 맵 팔레트 16색 · 최근 쓴 색 8개 (이 브라우저에만)
 *   · 스포이드 (EyeDropper 를 지원하는 브라우저만)
 *   · 기본값으로 · 더 많은 색…(예전의 기본 색 창 — RGB·HSL 을 원하는 사람용)
 *   · 글자 대비 (WCAG, 4.5:1 이상이면 읽기 좋음)
 * 을 한 창에 둔다. 팔레트·HEX·스포이드는 한 번 = undo 한 단계다.
 * 기본 색 창의 슬라이더 끌기는 예전처럼 스로틀 + 히스토리 잠금으로 한 단계에 묶는다.
 */
export function ColorSwatchInput({ t, value, onChange, contrastWith, onReset, label }: ColorSwatchProps) {
  const tr = useTr();
  const coarse = useCoarse();
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
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const [hex, setHex] = useState(value.toUpperCase());
  const [hexBad, setHexBad] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);

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
    const onNativeChange = () => {
      finish();
      setRecent(pushRecentColor(el.value));
    };
    el.addEventListener('change', onNativeChange);
    return () => {
      el.removeEventListener('change', onNativeChange);
      finish(); // 언마운트 시 잠금이 남지 않게
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 칸 값이 바뀌면(다른 노드 선택·되돌리기) 입력칸도 따라간다
  useEffect(() => { setHex(value.toUpperCase()); setHexBad(false); }, [value]);

  // 창 밖을 누르거나 Esc · 스크롤 · 창 크기 변경이면 닫는다
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const tgt = e.target as Node;
      if (popRef.current?.contains(tgt) || btnRef.current?.contains(tgt)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } };
    const onScroll = (e: Event) => {
      if (popRef.current && e.target instanceof Node && popRef.current.contains(e.target)) return;
      setOpen(false);
    };
    const onResize = () => setOpen(false);
    document.addEventListener('mousedown', onDown, true);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('mousedown', onDown, true);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [open]);

  const POP_W = 236;
  const toggle = () => {
    if (!onChange) return;
    if (open) { setOpen(false); return; }
    const r = btnRef.current?.getBoundingClientRect();
    if (r) {
      // 창 높이 어림 — 최근 색 줄·대비 줄이 있으면 더 길다 (아래가 모자라면 위로 연다)
      const estH = 250 + (readRecentColors().length ? 44 : 0) + (contrastWith ? 40 : 0);
      const below = r.bottom + 6;
      const top = below + estH > window.innerHeight - 8 ? Math.max(8, r.top - 6 - estH) : below;
      const left = Math.max(8, Math.min(r.left, window.innerWidth - POP_W - 8));
      setPos({ left, top });
    }
    setRecent(readRecentColors());
    setHex(value.toUpperCase());
    setHexBad(false);
    setOpen(true);
  };

  /** 팔레트·최근 색·HEX·스포이드 — 한 번 = undo 한 단계 */
  const apply = (raw: string) => {
    const n = normalizeHex(raw);
    if (!n) { setHexBad(true); return false; }
    setHexBad(false);
    setHex(n);
    onChangeRef.current?.(n.toLowerCase());
    setRecent(pushRecentColor(n));
    return true;
  };

  const eyeDropperCtor = typeof window !== 'undefined'
    ? (window as unknown as { EyeDropper?: new () => { open: () => Promise<{ sRGBHex: string }> } }).EyeDropper
    : undefined;
  const pickFromScreen = async () => {
    if (!eyeDropperCtor) return;
    try {
      const res = await new eyeDropperCtor().open();
      apply(res.sRGBHex);
    } catch { /* 사용자가 Esc 로 취소 */ }
  };
  const openNative = () => {
    const el = inputRef.current;
    if (!el) return;
    setOpen(false);
    try {
      (el as HTMLInputElement & { showPicker?: () => void }).showPicker?.();
      if (!(el as HTMLInputElement & { showPicker?: () => void }).showPicker) el.click();
    } catch { el.click(); }
  };

  const ratio = contrastWith ? contrastRatio(value, contrastWith) : null;
  const level = ratio == null ? null : ratio >= 4.5 ? 'good' : ratio >= 3 ? 'large' : 'bad';
  const levelColor = level === 'good' ? '#15803D' : level === 'large' ? '#B45309' : '#B91C1C';
  const levelBg = level === 'good' ? '#DCFCE7' : level === 'large' ? '#FEF3C7' : '#FEE2E2';

  const sw = (c: string, key: string) => {
    const active = normalizeHex(value) === c;
    return (
      <button key={key} type="button" title={c} aria-label={c}
        data-testid="color-swatch"
        onClick={() => apply(c)}
        style={{
          width: 22, height: 22, padding: 0, borderRadius: 5, cursor: 'pointer',
          background: c, flexShrink: 0,
          border: active ? `2px solid ${t.primary}` : `1px solid ${t.border}`,
          boxShadow: active ? `0 0 0 1px ${t.surface} inset` : undefined,
        }} />
    );
  };
  const smallBtn = (content: ReactNode, onClick: () => void, title: string, testId: string) => (
    <button type="button" title={title} aria-label={title} data-testid={testId} onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
        height: 26, padding: '0 8px', borderRadius: 6, cursor: 'pointer',
        fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap',
        background: t.surfaceAlt, color: t.text, border: `1px solid ${t.border}`,
      }}>{content}</button>
  );

  return (
    <div style={{ position: 'relative' }}>
      <button
        ref={btnRef}
        type="button"
        data-testid="color-field"
        aria-haspopup="dialog"
        aria-expanded={open}
        title={tr('inspector.color.open')}
        onClick={toggle}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, width: '100%',
          padding: '4px 6px', borderRadius: 6, minHeight: coarse ? 40 : undefined, boxSizing: 'border-box',
          border: `1px solid ${open ? t.primary : t.border}`, background: t.surface,
          cursor: onChange ? 'pointer' : 'default', textAlign: 'left',
        }}>
        <span style={{
          width: 18, height: 18, borderRadius: 4, flexShrink: 0,
          background: value, border: `1px solid ${t.border}`,
        }} />
        <span style={{
          fontSize: 11, fontFamily: 'ui-monospace, monospace',
          color: t.textMuted,
        }}>{value.toUpperCase()}</span>
        <span style={{ marginLeft: 'auto', color: t.textMuted, fontSize: 10 }}>▾</span>
      </button>
      {onChange && (
        <input
          ref={inputRef}
          type="color"
          tabIndex={-1}
          aria-hidden
          value={normalizeHex(value)?.toLowerCase() ?? '#000000'}
          onChange={(e) => handleInput(e.target.value)}
          style={{ width: 0, height: 0, opacity: 0, position: 'absolute', left: 0, bottom: 0, pointerEvents: 'none', border: 0, padding: 0 }}
        />
      )}
      {open && pos && (
        <div
          ref={popRef}
          role="dialog"
          aria-label={label ?? tr('inspector.color.open')}
          data-testid="color-popover"
          style={{
            position: 'fixed', left: pos.left, top: pos.top, zIndex: 1000, width: POP_W,
            maxHeight: `calc(100vh - ${Math.round(pos.top) + 8}px)`, overflowY: 'auto',
            boxSizing: 'border-box', padding: 10, borderRadius: 10,
            background: t.surface, border: `1px solid ${t.border}`,
            boxShadow: '0 12px 32px rgba(40,30,10,0.22)',
            display: 'flex', flexDirection: 'column', gap: 8,
          }}>
          {label && <div style={{ fontSize: 12, fontWeight: 700, color: t.text }}>{label}</div>}
          <div style={{ fontSize: 10, fontWeight: 700, color: t.textSubtle }}>{tr('inspector.color.palette')}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 22px)', gap: 5 }}>
            {COLOR_PALETTE.map((c) => sw(c, 'p' + c))}
          </div>
          {recent.length > 0 && (
            <>
              <div style={{ fontSize: 10, fontWeight: 700, color: t.textSubtle }}>{tr('inspector.color.recent')}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 22px)', gap: 5 }}>
                {recent.map((c) => sw(c, 'r' + c))}
              </div>
            </>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{
              width: 26, height: 26, borderRadius: 6, flexShrink: 0,
              background: normalizeHex(hex) ?? value, border: `1px solid ${t.border}`,
            }} />
            <input
              data-testid="color-hex"
              aria-label={tr('inspector.color.hex')}
              aria-invalid={hexBad}
              value={hex}
              spellCheck={false}
              maxLength={7}
              onChange={(e) => { setHex(e.target.value.toUpperCase()); setHexBad(false); }}
              onKeyDown={(e) => {
                e.stopPropagation(); // 캔버스 단축키(Delete 등)로 새지 않게
                if (e.key === 'Enter') { e.preventDefault(); apply(hex); }
              }}
              onBlur={() => { if (normalizeHex(hex) && normalizeHex(hex) !== normalizeHex(value)) apply(hex); }}
              onPaste={(e) => {
                const txt = e.clipboardData.getData('text');
                if (normalizeHex(txt)) { e.preventDefault(); apply(txt); }
              }}
              style={{
                flex: 1, minWidth: 0, height: 26, boxSizing: 'border-box', padding: '0 8px',
                borderRadius: 6, fontSize: 12.5, fontWeight: 700,
                fontFamily: 'ui-monospace, monospace', letterSpacing: 0.3,
                background: t.surface, color: t.text, outline: 'none',
                border: `1.5px solid ${hexBad ? '#DC2626' : t.primary}`,
              }} />
            {eyeDropperCtor && smallBtn(<I.Pipette size={14} />, () => void pickFromScreen(), tr('inspector.color.eyedropper'), 'color-eyedropper')}
          </div>
          {hexBad && (
            <div style={{ fontSize: 10.5, color: '#B91C1C', marginTop: -4 }}>{tr('inspector.color.hexInvalid')}</div>
          )}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {onReset && smallBtn(tr('inspector.color.reset'), () => { onReset(); setOpen(false); }, tr('inspector.color.reset'), 'color-reset')}
            {smallBtn(tr('inspector.color.more'), openNative, tr('inspector.color.moreTitle'), 'color-more')}
          </div>
          {ratio != null && level && (
            <div data-testid="color-contrast" style={{
              fontSize: 11, fontWeight: 700, borderRadius: 6, padding: '5px 8px',
              color: levelColor, background: levelBg,
            }}>
              {tr(level === 'good' ? 'inspector.color.contrastGood'
                : level === 'large' ? 'inspector.color.contrastLarge'
                : 'inspector.color.contrastBad', { ratio: ratio.toFixed(1) })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
