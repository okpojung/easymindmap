// BottomStatusBar — **이 맵이 얼마나 무거운가** + 확대/축소.
//
// 2026-08-07 정리 (사용자 보고: "정보가 반영되지 않음"):
//   · `20 노드 · depth 2` 와 `x: 742, y: 358` 은 **하드코딩된 가짜 값**이었다.
//     화면이 바뀌어도 그대로라 사용자에게는 고장으로 보였다.
//   · 노드 수·레이아웃은 **상단 맵 정보 줄에 이미 있다** — 중복이라 뺐다.
//   · 좌표는 지금 쓰는 기능이 없어 뺐다. 필요해지면(자유 배치 수동 좌표
//     확인 등) **실제 값**으로 되살린다 — 가짜 숫자를 다시 넣지는 않는다.
//   · `Supabase 동기화됨` 도 뺐다. 저장 상태는 **상단 저장 배지**가
//     사실대로 말한다("저장됨 · N분 전" / "미저장 편집 N개").
//
// 대신 **이 맵의 무게**를 보여 준다 (사용자 요청):
//   문서 46.1KB · 첨부 3개 · 26.7MB
// 요금제 쿼터가 문서+첨부 합산이라(§8), 어느 맵이 용량을 먹는지 여기서
// 바로 보인다.

import { useMemo, useState } from 'react';
import type { ThemeTokens } from '@/components/design-tokens/theme';
import type { Collaborator } from '@/editor/__samples__/types';
import { I } from '@/components/icons';
import { COLLAB_PRESENCE_UI } from '@/config/featureFlags';
import { useDocumentStore } from '@/stores/documentStore';

interface Props {
  t: ThemeTokens;
  collabs: Collaborator[];
  zoom: number;
  onZoomChange: (v: number) => void;
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)}MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)}GB`;
}

interface AttachNode {
  children?: AttachNode[];
  attachments?: { url?: string; size?: number }[];
}

/**
 * 지금 문서의 무게 — **서버가 저장할 때 세는 방식과 같은 규칙**이다
 * (maps.service.ts `saveDocument`). 그래야 여기 숫자와 문서함 목록의
 * 숫자가 어긋나지 않는다.
 *
 * · 문서 크기 = 스냅샷 JSON 의 **UTF-8 바이트**
 * · 첨부 개수 = 문서 안 `attachments` 항목 전부
 * · 첨부 용량 = 내장(data URL)은 base64 를 원본 크기로 환산하고, 서버
 *   저장소 첨부는 붙일 때 적어 둔 `size` 를 쓴다(2026-08-07).
 *   **`size` 가 없는 옛 첨부**는 셀 수 없으므로 `unknown` 으로 세어
 *   "일부는 셀 수 없다"고 화면에 밝힌다 — 0 으로 뭉개지 않는다.
 */
function measureDocument(map: unknown): {
  docBytes: number; attachCount: number; attachBytes: number; unknown: number;
} {
  const json = JSON.stringify(map ?? {});
  const docBytes = new TextEncoder().encode(json).length;

  let attachCount = 0;
  let attachBytes = 0;
  let unknown = 0;
  const walk = (n: AttachNode) => {
    for (const a of n.attachments ?? []) {
      attachCount += 1;
      if (a.url?.startsWith('data:')) {
        const comma = a.url.indexOf(',');
        attachBytes += Math.floor(((a.url.length - comma - 1) * 3) / 4);
      } else if (typeof a.size === 'number') {
        attachBytes += a.size;
      } else {
        unknown += 1;   // 크기를 적어 두기 전(2026-08-07 이전)에 붙은 첨부
      }
    }
    for (const c of n.children ?? []) walk(c);
  };
  const m = map as { root?: AttachNode; branches?: AttachNode[] } | undefined;
  if (m?.root) walk(m.root);
  for (const b of m?.branches ?? []) walk(b);

  return { docBytes, attachCount, attachBytes, unknown };
}

export function BottomStatusBar({ t, collabs, zoom, onZoomChange }: Props) {
  const activeCount = collabs.filter((c) => c.active).length;
  const map = useDocumentStore((s) => s.map);
  const m = useMemo(() => measureDocument(map), [map]);

  return (
    <div style={{
      height: 30, flexShrink: 0,
      background: t.surfaceAlt,
      borderTop: `1px solid ${t.border}`,
      display: 'flex', alignItems: 'center',
      padding: '0 12px', gap: 14,
      fontSize: 11, color: t.textMuted, fontWeight: 500,
    }}>
      <span
        data-testid="status-map-weight"
        title={
          '이 맵이 저장 용량에서 차지하는 무게입니다 (요금제 한도 = 문서 + 첨부 합산).\n'
          + '문서 = 지금 화면의 스냅샷 크기 (편집하면 바로 바뀝니다)\n'
          + '첨부 = 맵 내장분 + 서버 저장소분'
          + (m.unknown
            ? `\n※ ${m.unknown}개는 크기를 적어 두기 전에 붙은 첨부라 합계에서 빠져 있습니다.`
            : '')
        }
        style={{ display: 'flex', alignItems: 'center', gap: 5 }}
      >
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: t.primary }} />
        문서 {fmtBytes(m.docBytes)}
        {' · '}첨부 {m.attachCount}개
        {m.attachCount > 0 && ` · ${fmtBytes(m.attachBytes)}${m.unknown ? '+' : ''}`}
      </span>

      <div style={{ flex: 1 }} />

      {/* [협업 UI 숨김 — MVP] "협업자 N명 · 실시간 연결됨" 안내.
          협업 기능(V2) 개발 시 featureFlags.ts의 COLLAB_PRESENCE_UI를 true로
          바꾸면 다시 표시된다. 코드는 삭제하지 않고 보존. */}
      {COLLAB_PRESENCE_UI && (
        <>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <I.Users size={12} />
            협업자 {activeCount}명 ·{' '}
            <span style={{ color: t.success, fontWeight: 600 }}>● 실시간 연결됨</span>
          </span>

          <span style={{ width: 1, height: 14, background: t.divider }} />
        </>
      )}

      <ZoomControl t={t} zoom={zoom} onZoomChange={onZoomChange} />
    </div>
  );
}

function ZoomControl({ t, zoom, onZoomChange }: { t: ThemeTokens; zoom: number; onZoomChange: (v: number) => void }) {
  // % 클릭 = 배율 직접 입력 (2~400, Enter 적용 / Esc 취소)
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState('');

  const commit = (apply: boolean) => {
    setEditing(false);
    if (!apply) return;
    const v = parseInt(val, 10);
    if (!Number.isNaN(v)) onZoomChange(Math.min(400, Math.max(2, v)));
  };

  const stepBtn = (children: React.ReactNode, onClick?: () => void, title?: string) => (
    <button onClick={onClick} title={title} style={{
      width: 22, height: 20, background: 'transparent', border: 'none',
      color: t.text, cursor: 'pointer', borderRadius: 3,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>{children}</button>
  );

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
      {stepBtn(<I.Minus size={12} />, () => onZoomChange(Math.max(2, zoom - 5)), '축소 (5% 단위)')}
      {editing ? (
        <input
          autoFocus
          value={val}
          onChange={(e) => setVal(e.target.value.replace(/[^0-9]/g, ''))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit(true);
            else if (e.key === 'Escape') commit(false);
          }}
          onBlur={() => commit(true)}
          title="배율 입력 후 Enter (2~400)"
          style={{
            width: 44, padding: '2px 4px', textAlign: 'center',
            background: t.surface, border: `1px solid ${t.primary}`,
            borderRadius: 4, color: t.text, fontSize: 11, fontWeight: 700,
            fontFamily: 'ui-monospace, monospace', outline: 'none',
          }} />
      ) : (
        <button
          onClick={() => { setVal(String(Math.round(zoom))); setEditing(true); }}
          title="클릭해서 배율 직접 입력 (2~400)"
          style={{
            padding: '2px 10px', background: t.surface,
            border: `1px solid ${t.border}`, borderRadius: 4,
            color: t.text, cursor: 'pointer', fontSize: 11, fontWeight: 600,
            fontFamily: 'ui-monospace, monospace', minWidth: 44,
          }}>{Math.round(zoom)}%</button>
      )}
      {stepBtn(<I.Plus size={12} />, () => onZoomChange(Math.min(400, zoom + 5)), '확대 (5% 단위)')}
      <span style={{ marginLeft: 3 }}>{stepBtn(<I.Zoom100 size={13} />, () => onZoomChange(100), '100%로 보기')}</span>
    </div>
  );
}
