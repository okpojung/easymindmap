// 연결 맵 단추 묶음 (2026-10-14 사용자 요청) — 노드 도구막대의 "연결 맵" 메뉴.
//
//   · 선택한 노드를 새 맵으로 저장(연결)   — 그 노드를 중심주제로 새 단독맵을 만들고
//                                           이 맵에는 연결 노드로 남는다
//   · 저장된 맵 붙이기…                    — 단독맵을 골라 선택한 노드에 / 새 중심주제로
//   · 연결된 맵 열기                       — 연결 노드의 맵을 새 탭에서
//   · 연결 끊기                            — 보이는 내용을 이 맵의 보통 노드로 남긴다
//
// 동작은 services/cloud/linkActions.ts, 원리는 linkedMaps.ts.
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { ThemeTokens } from '@/components/design-tokens/theme';
import { DialogFrame } from '@/components/ui/DialogFrame';
import { I } from '@/components/icons';
import { useTr } from '@/i18n';
import { cloudApi, CloudError, type MapListItem } from '@/services/cloud/apiClient';
import { useCloudStore } from '@/stores/cloudStore';
import { useDocumentStore } from '@/stores/documentStore';
import { useInteractionStore } from '@/stores/interactionStore';
import {
  checkLinkable, extractNodeToMap, insertLinkedMap, linkAvailable, linkIdOf, LinkActionError, unlinkNode,
} from '@/services/cloud/linkActions';
import { openMapInNewTab } from '@/services/cloud/mapSession';

export interface LinkMenuItem {
  key: string;
  icon: ReactNode;
  label: string;
  title?: string;
  testId: string;
  disabled?: boolean;
  onClick: () => void;
}

/** 도구막대가 쓰는 항목 4개 + 맵 고르기 창 — 데스크톱 메뉴·폰 ⋯ 패널이 같은 것을 쓴다 */
export function useLinkedMapMenu(t: ThemeTokens, onBusy?: (busy: boolean) => void): {
  items: LinkMenuItem[]; dialog: ReactNode;
} {
  const tr = useTr();
  const selectedId = useInteractionStore((s) => s.selectedId);
  const setSelectedId = useInteractionStore((s) => s.setSelectedId);
  // 지금 맵이 서버 맵이고 이 탭이 편집권을 쥐었나 — 상태가 바뀌면 다시 그린다
  const cloudMapId = useCloudStore((s) => s.cloudMapId);
  const docOrigin = useDocumentStore((s) => s.docOrigin);
  const linkedId = useDocumentStore(() => linkIdOf(selectedId));
  const available = !!cloudMapId && docOrigin === cloudMapId && linkAvailable();
  const [picking, setPicking] = useState(false);
  const [working, setWorking] = useState(false);

  const run = async (fn: () => Promise<string | void>, ok?: (r: string | void) => string) => {
    setWorking(true); onBusy?.(true);
    try {
      const r = await fn();
      if (ok) useCloudStore.getState().setNotice(ok(r));
    } catch (e) {
      const msg = e instanceof LinkActionError || e instanceof CloudError ? e.message : tr('cloud.linked.failed');
      useCloudStore.getState().setError(msg);
    } finally {
      setWorking(false); onBusy?.(false);
    }
  };

  const need = available ? undefined : tr('cloud.linked.needSaved');
  const items: LinkMenuItem[] = [
    {
      key: 'extract', testId: 'link-extract', icon: <I.MindMap size={15} />,
      label: tr('cloud.linked.extract'), title: need ?? tr('cloud.linked.extractTip'),
      disabled: !available || working || !selectedId || selectedId === 'root' || !!linkedId,
      onClick: () => {
        if (!selectedId) return;
        void run(async () => (await extractNodeToMap(selectedId)).title,
          (title) => tr('cloud.linked.extracted', { title: String(title) }));
      },
    },
    {
      key: 'insert', testId: 'link-insert', icon: <I.Link size={15} />,
      label: tr('cloud.linked.insert'), title: need ?? tr('cloud.linked.insertTip'),
      disabled: !available || working,
      onClick: () => setPicking(true),
    },
    {
      key: 'open', testId: 'link-open', icon: <span style={{ fontSize: 13 }}>↗</span>,
      label: tr('cloud.linked.open'), disabled: !linkedId,
      onClick: () => { if (linkedId) openMapInNewTab(linkedId); },
    },
    {
      key: 'unlink', testId: 'link-unlink', icon: <span style={{ fontSize: 13 }}>⛓</span>,
      label: tr('cloud.linked.unlink'), title: tr('cloud.linked.unlinkTip'),
      disabled: !linkedId || working,
      onClick: () => { if (selectedId) { unlinkNode(selectedId); useCloudStore.getState().setNotice(tr('cloud.linked.unlinked')); } },
    },
  ];

  const dialog = picking ? (
    <LinkMapPickerDialog
      t={t}
      canNode={!!selectedId && selectedId !== 'root'}
      onCancel={() => setPicking(false)}
      onPick={(mapId, mode) => {
        setPicking(false);
        void run(async () => {
          const id = await insertLinkedMap(mapId, mode, selectedId);
          setSelectedId(id);
        }, () => tr('cloud.linked.inserted'));
      }}
    />
  ) : null;
  return { items, dialog };
}

/** 저장된 단독맵 고르기 — 이름 검색 + 붙일 자리(선택한 노드 / 새 중심주제) */
export function LinkMapPickerDialog({
  t, canNode, onPick, onCancel,
}: {
  t: ThemeTokens;
  canNode: boolean;
  onPick: (mapId: string, mode: 'node' | 'center') => void;
  onCancel: () => void;
}) {
  const tr = useTr();
  const self = useCloudStore((s) => s.cloudMapId);
  const [maps, setMaps] = useState<MapListItem[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<string | null>(null);
  const [mode, setMode] = useState<'node' | 'center'>(canNode ? 'node' : 'center');
  const [why, setWhy] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    let alive = true;
    cloudApi.listMaps({ sort: 'updatedAt', order: 'desc', limit: 500 })
      .then((r) => { if (alive) setMaps(r.maps); })
      .catch((e) => { if (alive) setErr(e instanceof CloudError ? e.message : tr('cloud.linked.failed')); });
    return () => { alive = false; };
  }, [tr]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  // 붙일 수 있는 것은 **내 단독맵**뿐 — 협업맵·공유받은 맵·대시보드맵·지금 맵은 뺀다
  const rows = useMemo(() => (maps ?? [])
    .filter((m) => m.kind === 'solo' && !m.shared && m.viewMode !== 'dashboard' && m.mapId !== self && !m.deletedAt)
    .filter((m) => !q.trim() || (m.title || '').toLowerCase().includes(q.trim().toLowerCase())), [maps, q, self]);

  const confirm = async () => {
    if (!picked) return;
    setChecking(true);
    const reason = await checkLinkable(picked);
    setChecking(false);
    if (reason) { setWhy(reason); return; }
    onPick(picked, mode);
  };

  const radio = (value: 'node' | 'center', label: string, disabled?: boolean) => (
    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, opacity: disabled ? 0.5 : 1, cursor: disabled ? 'default' : 'pointer' }}>
      <input type="radio" name="link-mode" data-testid={`link-mode-${value}`} checked={mode === value}
        disabled={disabled} onChange={() => setMode(value)} />
      {label}
    </label>
  );

  return (
    <DialogFrame
      t={t} testId="link-picker" title={tr('cloud.linked.pickTitle')} subtitle={tr('cloud.linked.pickHint')}
      onClose={onCancel} width="min(480px, 94vw)"
      footer={(
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {radio('node', tr('cloud.linked.modeNode'), !canNode)}
            {radio('center', tr('cloud.linked.modeCenter'))}
          </div>
          {why && <div data-testid="link-picker-why" style={{ fontSize: 12, color: '#c0392b' }}>⚠ {why}</div>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button data-testid="link-picker-ok" disabled={!picked || checking} onClick={() => void confirm()}
              style={{
                flex: 1, height: 36, borderRadius: 7, border: 'none', fontSize: 13.5, fontWeight: 700,
                cursor: picked ? 'pointer' : 'default',
                background: picked ? t.primary : t.surfaceAlt, color: picked ? '#fff' : t.textSubtle,
              }}>{checking ? tr('common.loading') : tr('cloud.linked.pickOk')}</button>
            <button data-testid="link-picker-cancel" onClick={onCancel}
              style={{
                flex: 1, height: 36, borderRadius: 7, cursor: 'pointer', fontSize: 13.5, fontWeight: 600,
                border: `1px solid ${t.border}`, background: t.surfaceAlt, color: t.text,
              }}>{tr('common.cancel')}</button>
          </div>
        </div>
      )}
    >
      <input data-testid="link-picker-search" value={q} onChange={(e) => setQ(e.target.value)}
        placeholder={tr('cloud.linked.searchPh')} autoFocus
        style={{
          width: '100%', boxSizing: 'border-box', height: 34, padding: '0 10px', marginBottom: 8,
          borderRadius: 7, border: `1px solid ${t.border}`, background: t.surface, color: t.text, fontSize: 13,
        }} />
      <div style={{ border: `1px solid ${t.border}`, borderRadius: 8, maxHeight: '46vh', overflowY: 'auto' }}>
        {err ? <div style={{ padding: 14, fontSize: 13, color: '#c0392b' }}>⚠ {err}</div>
          : maps === null ? <div style={{ padding: 14, fontSize: 13, color: t.textSubtle }}>{tr('common.loading')}</div>
          : rows.length === 0 ? <div style={{ padding: 14, fontSize: 13, color: t.textSubtle }}>{tr('cloud.linked.none')}</div>
          : rows.map((m) => (
            <button key={m.mapId} data-testid="link-picker-item" data-map-id={m.mapId}
              onClick={() => { setPicked(m.mapId); setWhy(null); }}
              onDoubleClick={() => { setPicked(m.mapId); void confirm(); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
                padding: '8px 12px', border: 'none', borderBottom: `1px solid ${t.divider}`, cursor: 'pointer',
                background: picked === m.mapId ? t.primarySoft : 'transparent',
                color: picked === m.mapId ? t.primary : t.text, fontSize: 13, fontWeight: picked === m.mapId ? 700 : 500,
              }}>
              <span style={{ display: 'flex', color: t.primary }}><I.MindMap size={15} /></span>
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {m.title || tr('cloud.untitled')}
              </span>
              {m.nodeCount != null && (
                <span style={{ fontSize: 11, color: t.textMuted }}>{tr('cloud.linked.nodes', { n: m.nodeCount })}</span>
              )}
            </button>
          ))}
      </div>
    </DialogFrame>
  );
}
