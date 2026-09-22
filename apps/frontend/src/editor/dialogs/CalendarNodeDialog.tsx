// CalendarNodeDialog — 우상단 [+] ▸ "달력 노드 추가" (2026-09-22 사용자 요청).
// 선택 노드의 글(과 조상)에서 읽은 년도·월을 **미리 채워** 보여 주고, 확인하면
// 월 노드(1월~12월) 또는 주 노드(NN주 → 일~토 범위)를 그 노드 아래에 한 번에 넣는다
// (`addChildOutlineBulk` — undo 한 단계). 글에 정보가 없으면 올해가 기본이다.
// 왜 묻나: 글에서 못 읽으면 막히지 않고, `26/09` 처럼 애매한 표기를 잘못 읽어도
// 창에서 바로 보인다 (사용자와 2026-09-22 합의).

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ThemeTokens } from '@/components/design-tokens/theme';
import { DialogXButton } from '@/components/ui/DialogFrame';
import { useDocumentStore } from '@/stores/documentStore';
import { calendarPreview, monthOutline, weekOutline, type YearMonth } from '@/utils/calendarNodes';

interface Props {
  t: ThemeTokens;
  parentId: string;
  parentLabel: string;
  initial: YearMonth;
  onClose: () => void;
}

export function CalendarNodeDialog({ t, parentId, parentLabel, initial, onClose }: Props) {
  const addChildOutlineBulk = useDocumentStore((s) => s.addChildOutlineBulk);
  const [year, setYear] = useState<string>(String(initial.year ?? new Date().getFullYear()));
  const [month, setMonth] = useState<string>(initial.month ? String(initial.month) : 'all');
  const yearRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => { yearRef.current?.focus(); yearRef.current?.select(); }, []);

  const y = Number(year);
  const yearOk = /^\d{4}$/.test(year) && y >= 1900 && y <= 2199;
  const m = month === 'all' ? undefined : Number(month);
  const preview = useMemo(() => (yearOk ? calendarPreview(y, m) : '년도를 네 자리로 입력하세요 (1900~2199)'), [yearOk, y, m]);

  const submit = () => {
    if (!yearOk) return;
    addChildOutlineBulk(parentId, m ? weekOutline(y, m) : monthOutline());
    onClose();
  };

  const field: React.CSSProperties = {
    height: 30, padding: '0 8px', borderRadius: 6, border: `1px solid ${t.border}`,
    background: t.surfaceAlt, color: t.text, fontSize: 13, outline: 'none',
  };

  return createPortal(
    <div
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === 'Escape') { e.preventDefault(); onClose(); }
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submit(); }
      }}
      style={{
        position: 'fixed', inset: 0, zIndex: 1200,
        background: 'rgba(0,0,0,0.35)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        data-testid="calendar-dialog"
        style={{
          position: 'relative', width: 420, maxWidth: '92vw',
          background: t.surface, color: t.text,
          borderRadius: 12, border: `1px solid ${t.border}`,
          boxShadow: '0 12px 40px rgba(0,0,0,0.3)',
          padding: 18, fontFamily: 'inherit',
        }}
      >
        <DialogXButton t={t} testId="calendar-dialog-x" onClose={onClose} />
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4, paddingRight: 34 }}>달력 노드 추가</div>
        <div style={{ fontSize: 11.5, color: t.textMuted, marginBottom: 12, lineHeight: 1.5 }}>
          <b style={{ color: t.text }}>{parentLabel}</b> 아래에 넣습니다. 노드 글에서 읽은 값을 채워 두었으니
          확인하거나 고치세요. <b style={{ color: t.text }}>월을 "전체"</b>로 두면 1월~12월, 달을 고르면 그 달의
          주(<code>NN주</code>)와 <code>YY/MM/DD(일) ~ YY/MM/DD(토)</code> 범위가 들어갑니다.
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
          <label style={{ fontSize: 12, fontWeight: 600 }}>년도</label>
          <input
            ref={yearRef}
            data-testid="calendar-year"
            value={year}
            inputMode="numeric"
            onChange={(e) => setYear(e.target.value.replace(/\D/g, '').slice(0, 4))}
            style={{ ...field, width: 80, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}
          />
          <label style={{ fontSize: 12, fontWeight: 600, marginLeft: 6 }}>월</label>
          <select
            data-testid="calendar-month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            style={{ ...field, width: 150, cursor: 'pointer' }}
          >
            <option value="all">전체 (1월~12월 노드)</option>
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i + 1} value={String(i + 1)}>{i + 1}월 (주 노드)</option>
            ))}
          </select>
        </div>
        <div
          data-testid="calendar-preview"
          style={{
            fontSize: 12, padding: '8px 10px', borderRadius: 7, marginBottom: 14,
            background: t.surfaceAlt, border: `1px dashed ${t.border}`, color: yearOk ? t.text : t.danger,
          }}
        >
          {preview}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            onClick={onClose}
            style={{ height: 32, padding: '0 14px', borderRadius: 7, border: `1px solid ${t.border}`, background: t.surface, color: t.text, cursor: 'pointer', fontSize: 12.5 }}
          >취소 (Esc)</button>
          <button
            data-testid="calendar-dialog-save"
            onClick={submit}
            disabled={!yearOk}
            style={{
              height: 32, padding: '0 16px', borderRadius: 7, border: 'none',
              background: yearOk ? t.primary : t.border, color: '#fff', cursor: yearOk ? 'pointer' : 'default',
              fontSize: 12.5, fontWeight: 700,
            }}
          >확인 (Ctrl+Enter)</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
