// 왼쪽 레일 '변수' (2026-10-29 사용자 요청) — 이 맵의 변수 목록 · 등록 · 수정 · 삭제 · 복사,
// 그리고 맨 아래 [변수로 보기 | 값으로 보기].
//
//   · 변수명·타입·서식(엑셀 셀 서식)·값(수식은 수식 글자)
//   · 복사 ⧉ → [&변수명] 이 클립보드에 — 노드 글자에서 Ctrl+V 로 붙인다
//   · 쓰는 곳(노드 글자·다른 변수의 수식)이 있으면 **삭제 불가**, **이름 바꾸기 불가** —
//     대신 [쓰는 곳 모두 함께 바꾸기] 로 이름과 쓰는 곳을 한 번에 바꾼다(되돌리기 한 번)
//   · 값·타입·서식은 쓰는 곳이 있어도 바꿀 수 있다(그게 변수의 쓸모다)
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import type { ThemeTokens } from '@/components/design-tokens/theme';
import { useDocumentStore } from '@/stores/documentStore';
import { useEditorUiStore } from '@/stores/editorUiStore';
import { useCloudStore } from '@/stores/cloudStore';
import { useTr } from '@/i18n';
import {
  COMPUTED_TYPES, DEFAULT_FORMAT, FORMAT_PRESETS, VARIABLE_TYPES, countSpecString, evaluateVariables, nodeContext, normFill, parseCountSpec, valueProblem, variableResults, variableUsage, withDbValues,
  type CountKind, type MapVariable, type VariableType,
} from '@/utils/variables/mapVariables';
import { SHAPE_OPTIONS } from '@/editor/inspector-panels/StyleTab';
import { ColorSwatchInput } from '@/editor/inspector-panels/InspectorSection';
import { useVarDbStore } from '@/stores/varDbStore';
import { useInteractionStore } from '@/stores/interactionStore';
import { useViewportStore } from '@/stores/viewportStore';
import { findNodeInMap } from '@/stores/documentStore';
import { flattenNodeText } from '@/editor/node-renderer/RichTextHtml';
import { ProVariableApi } from '@pro';
import { nameProblem } from '@/utils/variables/varSyntax';
import { FUNCTION_NAMES } from '@/utils/variables/formula';

/** DB 값을 쓰는 타입 — 수식·노드 참조는 앱이 계산한다 */
const dbType = (ty: VariableType) => !COMPUTED_TYPES.includes(ty);
/** 노드로 가기 — 고르고, 접힌 조상은 펴고, 지금 배율 그대로 가운데로 */
function goToNode(id: string) {
  useInteractionStore.getState().setSelectedId(id);
  useDocumentStore.getState().expandAncestors(id);
  const vp = useViewportStore.getState();
  vp.requestCenterNode(id, vp.zoom);
}

const MONO = "ui-monospace, 'Cascadia Mono', 'Consolas', 'D2Coding', monospace";
type Draft = { orig: string | null; name: string; type: VariableType; format: string; value: string };

export function VariablesPanel({ t }: { t: ThemeTokens }) {
  const tr = useTr();
  const map = useDocumentStore((s) => s.map);
  const setVariables = useDocumentStore((s) => s.setVariables);
  const renameVariable = useDocumentStore((s) => s.renameVariable);
  const valueView = useEditorUiStore((s) => s.varValueView);
  const setValueView = useEditorUiStore((s) => s.setVarValueView);
  const readOnlyInfo = useCloudStore((s) => s.readOnlyInfo);
  const readOnly = !!readOnlyInfo;
  // 대시보드맵(주인)은 문서는 못 고쳐도 **DB 값**은 고친다 — 값만 여는 편집 칸 (2026-10-30)
  const dbOnly = !!readOnlyInfo?.dashboard && !readOnlyInfo?.viewer;
  const mapId = useCloudStore((s) => s.cloudMapId ?? s.readOnlyInfo?.mapId ?? null);
  const dbStatus = useVarDbStore((s) => s.status);
  const dbMapId = useVarDbStore((s) => s.mapId);
  const dbRowsAll = useVarDbStore((s) => s.rows);
  const dbError = useVarDbStore((s) => s.error);
  const dbOn = dbStatus === 'ok' && !!mapId && dbMapId === mapId;
  const dbRows = dbOn ? dbRowsAll : {};
  useEffect(() => { if (mapId) void useVarDbStore.getState().load(mapId, true); }, [mapId]);
  const db = useMemo(() => (dbOn ? Object.fromEntries(Object.values(dbRowsAll).map((r) => [r.name, r.value])) : undefined), [dbOn, dbRowsAll]);
  const vars = useMemo(() => map.settings?.variables ?? [], [map.settings?.variables]);
  const results = useMemo(() => variableResults(map, db), [map, db]);
  const selectedNodeId = useInteractionStore((st) => st.selectedId);
  const nodeTitle = (id?: string) => { const n = id ? findNodeInMap(map, id) : null; return n ? (flattenNodeText(n.text) || '—') : null; };
  /** 이 맵에서 노드가 직접 고른 배경색들 (노드 수 변수의 배경색 조건 고르기) — 많이 쓴 순 */
  const usedFills = useMemo(() => {
    const cnt = new Map<string, number>();
    const walk = (n: { style?: { fillColor?: string }; children?: unknown[] }) => {
      const f = n.style?.fillColor; if (f) { const k = normFill(f); cnt.set(k, (cnt.get(k) ?? 0) + 1); }
      (n.children as typeof n[] | undefined)?.forEach(walk);
    };
    walk(map.root as never); map.branches.forEach((b) => walk(b as never));
    for (const c of map.centers ?? []) { walk(c.root as never); c.branches.forEach((b) => walk(b as never)); }
    return [...cnt.entries()].sort((a, b) => b[1] - a[1]);
  }, [map]);
  const shapeLabel = (k: string) => { const o = SHAPE_OPTIONS.find((x) => x.key === k); return o ? tr(o.label) : k; };
  const fillLabel = (c: string) => (c === 'transparent' ? tr('inspector.color.none') : c.toUpperCase());
  /** 노드 수 설명 — '맵 전체 · 도형: 둥근' */
  const countDesc = (raw?: string) => {
    const sp = parseCountSpec(raw);
    const scope = sp.target ? tr('editor.var.count.scopeOf', { name: nodeTitle(sp.target) ?? tr('editor.var.node.missing') }) : tr('editor.var.count.scopeMap');
    const cond = sp.kind === 'shape' ? tr('editor.var.count.condShape', { v: shapeLabel(sp.val) })
      : sp.kind === 'fill' ? tr('editor.var.count.condFill', { v: fillLabel(normFill(sp.val)) }) : tr('editor.var.count.condAll');
    return scope + ' · ' + cond;
  };
  /** 노드 참조 새 이름 — nd_1, nd_2 … 비어 있는 첫 번호 */
  const nextNodeName = () => { let i = 1; while (vars.some((v) => v.name === 'nd_' + i)) i++; return 'nd_' + i; };
  const [apiOpen, setApiOpen] = useState<string | null>(null);
  const [dbBusy, setDbBusy] = useState(false);
  const usage = useMemo(() => variableUsage(map), [map]);
  const unregistered = useMemo(() => [...usage.keys()].filter((n) => !vars.some((v) => v.name === n) && (usage.get(n)?.nodes ?? 0) > 0), [usage, vars]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const usedText = (name: string) => {
    const u = usage.get(name);
    if (!u || (!u.nodes && !u.formulas.length)) return '';
    return [u.nodes ? tr('editor.var.usedNodes', { n: u.nodes }) : '', u.formulas.length ? tr('editor.var.usedFormulas', { list: u.formulas.join(', ') }) : ''].filter(Boolean).join(' · ');
  };
  const isUsed = (name: string) => { const u = usage.get(name); return !!u && (u.nodes > 0 || u.formulas.length > 0); };

  const copy = (name: string) => {
    const txt = '[&' + name + ']';
    const done = () => { setCopied(name); window.setTimeout(() => setCopied((c) => (c === name ? null : c)), 1500); };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(txt).then(done, done); else done();
  };
  const startNew = (name = '') => { setMsg(null); setDraft({ orig: null, name, type: 'number', format: DEFAULT_FORMAT.number, value: '' }); };
  // 고칠 때 값 칸은 **DB 에 저장된 값**을 먼저 보여 준다 (없으면 맵 안의 값) — 2026-10-30
  const startEdit = (v: MapVariable) => {
    setMsg(null); useVarDbStore.getState().clearError();
    const dbv = dbType(v.type) ? dbRows[v.name]?.value : undefined;
    setDraft({ orig: v.name, name: v.name, type: v.type, format: v.format ?? DEFAULT_FORMAT[v.type], value: dbv ?? v.value ?? '' });
  };
  const remove = (v: MapVariable) => {
    if (isUsed(v.name)) return;
    const inDb = !!dbRows[v.name];
    if (!window.confirm(tr(inDb ? 'editor.var.confirmDeleteDb' : 'editor.var.confirmDelete', { name: v.name }))) return;
    setVariables(vars.filter((x) => x.name !== v.name));
    if (inDb && mapId) void useVarDbStore.getState().remove(mapId, v.name);
  };

  // ── 편집 칸 검사 ──
  const others = draft ? vars.filter((v) => v.name !== draft.orig).map((v) => v.name) : [];
  const nameErr = draft ? nameProblem(draft.name.trim(), others) : null;
  const renamed = !!draft?.orig && draft.name.trim() !== draft.orig;
  const renameBlocked = renamed && isUsed(draft!.orig!);
  const valErr = draft ? valueProblem(draft.type, draft.value) : null;
  const asDef = (d: Draft): MapVariable => {
    const fmt = d.format.trim();
    return { name: d.name.trim(), type: d.type, ...(fmt && fmt !== DEFAULT_FORMAT[d.type] ? { format: fmt } : {}), ...(d.value !== '' ? { value: d.value } : {}) };
  };
  const preview = draft && !nameErr
    ? evaluateVariables([...withDbValues(vars.filter((x) => x.name !== draft.orig), db), asDef(draft)], nodeContext(map)).get(asDef(draft).name)?.display ?? ''
    : '';
  const save = async (withRename: boolean, toDb = false) => {
    if (!draft || nameErr) return;
    const def = asDef(draft);
    const oldName = draft.orig;
    if (!dbOnly) {
      if (oldName && withRename && renamed) {
        renameVariable(oldName, def.name, def); // 이름·쓰는 곳·정의를 한 번에 (되돌리기 한 번)
      } else {
        const base = useDocumentStore.getState().map.settings?.variables ?? [];
        setVariables(oldName ? base.map((x) => (x.name === oldName ? def : x)) : [...base, def]);
      }
    }
    // DB 값 — [DB 저장] 이면 넣고, 이름을 바꿨으면 DB 의 옛 이름 값도 새 이름으로 옮긴다
    if (mapId && dbOn) {
      const st = useVarDbStore.getState();
      setDbBusy(true);
      try {
        if (oldName && renamed && dbRows[oldName]) {
          const moved = toDb ? draft.value : dbRows[oldName].value;
          if (await st.save(mapId, { [def.name]: moved })) await st.remove(mapId, oldName);
        } else if (toDb) {
          if (!(await st.save(mapId, { [def.name]: draft.value }))) return; // 실패 — 칸을 열어 둔 채 문장을 보인다
        }
      } finally { setDbBusy(false); }
    }
    setDraft(null);
    setMsg(tr(toDb ? 'editor.var.dbSaved' : oldName ? 'editor.var.saved' : 'editor.var.added', { name: def.name }));
  };

  const box: CSSProperties = { border: '1px solid ' + t.border, borderRadius: 8, background: t.surface };
  const input: CSSProperties = { width: '100%', boxSizing: 'border-box', height: 30, padding: '0 8px', borderRadius: 6, border: '1px solid ' + t.border, background: t.surface, color: t.text, fontSize: 12.5 };
  const iconBtn = (danger = false, disabled = false): CSSProperties => ({
    width: 26, height: 26, borderRadius: 6, border: '1px solid ' + t.border, background: t.surfaceAlt ?? t.surface,
    color: disabled ? t.textSubtle : danger ? '#B91C1C' : t.text, cursor: disabled ? 'not-allowed' : 'pointer', fontSize: 12.5, opacity: disabled ? 0.5 : 1,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  });
  const label: CSSProperties = { fontSize: 11.5, fontWeight: 700, color: t.textMuted, margin: '8px 0 3px', display: 'block' };

  return (
    <div data-testid="variables-panel" style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      <div style={{ padding: '10px 12px', flex: 1 }}>
        <p style={{ margin: '0 0 10px', fontSize: 12, color: t.textMuted, lineHeight: 1.6 }}>{tr('editor.var.help')}</p>
        {!readOnly && !draft && (
          <button type="button" data-testid="var-add" onClick={() => startNew()}
            style={{ width: '100%', height: 32, borderRadius: 7, border: '1px dashed ' + t.primaryBorder, background: t.primarySoft, color: t.primary, fontWeight: 700, fontSize: 12.5, cursor: 'pointer', marginBottom: 10 }}>
            {tr('editor.var.add')}
          </button>
          )}
          {!readOnly && !draft && (
          <button type="button" data-testid="var-add-node" disabled={!selectedNodeId}
            title={selectedNodeId ? '' : tr('editor.var.node.pickHint')}
            onClick={() => { if (!selectedNodeId) return; setMsg(null); setDraft({ orig: null, name: nextNodeName(), type: 'node', format: 'first', value: selectedNodeId }); }}
            style={{ width: '100%', height: 30, borderRadius: 7, border: '1px dashed ' + t.border, background: t.surfaceAlt ?? t.surface, color: selectedNodeId ? t.text : t.textSubtle, fontWeight: 600, fontSize: 12, cursor: selectedNodeId ? 'pointer' : 'not-allowed', marginBottom: 10 }}>
            {tr('editor.var.node.addFromSel')}
          </button>
        )}
        {msg && !draft && <div role="status" style={{ fontSize: 12, color: '#15803D', marginBottom: 8 }}>{msg}</div>}

        {draft && (
          <div data-testid="var-editor" style={{ ...box, padding: 10, marginBottom: 12, borderColor: t.primaryBorder }}>
            <b style={{ fontSize: 13 }}>{draft.orig ? tr('editor.var.editTitle', { name: draft.orig }) : tr('editor.var.newTitle')}</b>
            <label style={label}>{tr('editor.var.name')}</label>
            <input data-testid="var-name" value={draft.name} maxLength={40} autoFocus={!dbOnly} disabled={dbOnly} onChange={(e) => setDraft({ ...draft, name: e.target.value })} style={{ ...input, fontFamily: MONO }} />
            {draft.name && nameErr && <div style={{ fontSize: 11.5, color: '#B91C1C', marginTop: 3 }}>{tr('editor.' + nameErr)}</div>}
            {renameBlocked && <div data-testid="var-rename-blocked" style={{ fontSize: 11.5, color: '#B45309', marginTop: 3, lineHeight: 1.5 }}>{tr('editor.var.renameBlocked', { where: usedText(draft.orig!) })}</div>}
            <label style={label}>{tr('editor.var.type')}</label>
            <select data-testid="var-type" value={draft.type} disabled={dbOnly}
              onChange={(e) => {
                const ty = e.target.value as VariableType;
                if (ty === 'node') setDraft({ ...draft, type: ty, format: 'first', value: draft.type === 'node' ? draft.value : (selectedNodeId ?? ''), name: draft.name.trim() ? draft.name : nextNodeName() });
                else if (ty === 'count') setDraft({ ...draft, type: ty, format: DEFAULT_FORMAT.count, value: draft.type === 'count' ? draft.value : '' });
                else setDraft({ ...draft, type: ty, format: DEFAULT_FORMAT[ty], value: draft.type === 'node' || draft.type === 'count' ? '' : draft.value });
              }} style={input}>
              {VARIABLE_TYPES.map((ty) => <option key={ty} value={ty}>{tr('editor.var.type.' + ty)}</option>)}
            </select>
            <label style={label}>{tr('editor.var.format')}</label>
            {draft.type === 'node' ? (
              <select data-testid="var-format" value={draft.format === 'all' ? 'all' : 'first'} disabled={dbOnly}
                onChange={(e) => setDraft({ ...draft, format: e.target.value })} style={input}>
                <option value="first">{tr('editor.var.node.first')}</option>
                <option value="all">{tr('editor.var.node.all')}</option>
              </select>
            ) : <>
            <input data-testid="var-format" list="var-format-presets" value={draft.format} disabled={dbOnly} onChange={(e) => setDraft({ ...draft, format: e.target.value })}
              placeholder={draft.type === 'phone' ? tr('editor.var.phoneAuto') : ''} style={{ ...input, fontFamily: MONO }} />
            <datalist id="var-format-presets">{FORMAT_PRESETS[draft.type].map((f) => <option key={f} value={f} />)}</datalist>
            </>}
            <label style={label}>{draft.type === 'formula' ? tr('editor.var.formula') : draft.type === 'node' ? tr('editor.var.node.target') : draft.type === 'count' ? tr('editor.var.count.scope') : tr('editor.var.value')}</label>
            {draft.type === 'count' ? (() => {
              const sp = parseCountSpec(draft.value);
              const upd = (p: Partial<{ target: string; kind: CountKind; val: string }>) => setDraft({ ...draft, value: countSpecString({ ...sp, ...p }) });
              const chip = (on: boolean) => ({ flex: 1, height: 28, borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                border: '1px solid ' + (on ? t.primaryBorder : t.border), background: on ? t.primarySoft : t.surface, color: on ? t.primary : t.text }) as CSSProperties;
              return (
                <div data-testid="var-count" style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button type="button" data-testid="var-count-scope-map" onClick={() => upd({ target: '' })} style={chip(!sp.target)}>{tr('editor.var.count.scopeMap')}</button>
                    <button type="button" data-testid="var-count-scope-node" disabled={!selectedNodeId && !sp.target}
                      title={selectedNodeId ? '' : tr('editor.var.node.pickHint')}
                      onClick={() => upd({ target: sp.target || selectedNodeId || '' })} style={chip(!!sp.target)}>{tr('editor.var.count.scopeNode')}</button>
                  </div>
                  {sp.target && (
                    <>
                      <div style={{ fontSize: 12, padding: '5px 8px', borderRadius: 6, border: '1px solid ' + t.border, background: t.surfaceAlt ?? t.surface,
                        color: nodeTitle(sp.target) !== null ? t.text : '#B45309', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {nodeTitle(sp.target) ?? tr('editor.var.node.missing')}
                      </div>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button type="button" data-testid="var-count-pick" disabled={!selectedNodeId}
                          title={selectedNodeId ? '' : tr('editor.var.node.pickHint')}
                          onClick={() => selectedNodeId && upd({ target: selectedNodeId })}
                          style={{ flex: 1, height: 28, borderRadius: 6, border: '1px solid ' + t.primaryBorder, background: t.primarySoft, color: t.primary, fontWeight: 700, fontSize: 12, cursor: selectedNodeId ? 'pointer' : 'not-allowed', opacity: selectedNodeId ? 1 : 0.5 }}>
                          {tr('editor.var.node.pick')}
                        </button>
                        {nodeTitle(sp.target) !== null && (
                          <button type="button" onClick={() => goToNode(sp.target)} title={tr('editor.var.node.go')}
                            style={{ height: 28, padding: '0 10px', borderRadius: 6, border: '1px solid ' + t.border, background: t.surface, color: t.text, fontSize: 12, cursor: 'pointer' }}>↗</button>
                        )}
                      </div>
                    </>
                  )}
                  <label style={label}>{tr('editor.var.count.cond')}</label>
                  <select data-testid="var-count-kind" value={sp.kind}
                    onChange={(e) => { const k = e.target.value as CountKind; upd({ kind: k, val: k === 'shape' ? (sp.kind === 'shape' ? sp.val : 'rounded') : k === 'fill' ? (sp.kind === 'fill' ? sp.val : (usedFills[0]?.[0] ?? '')) : '' }); }}
                    style={input}>
                    <option value="">{tr('editor.var.count.condAll')}</option>
                    <option value="shape">{tr('editor.var.count.byShape')}</option>
                    <option value="fill">{tr('editor.var.count.byFill')}</option>
                  </select>
                  {sp.kind === 'shape' && (
                    <select data-testid="var-count-shape" value={sp.val} onChange={(e) => upd({ val: e.target.value })} style={input}>
                      {SHAPE_OPTIONS.map((o) => <option key={o.key} value={o.key}>{tr(o.label)}</option>)}
                    </select>
                  )}
                  {sp.kind === 'fill' && (
                    <>
                      <ColorSwatchInput t={t} value={sp.val || '#FEF3C7'} label={tr('editor.var.count.byFill')}
                        onNone={() => upd({ val: 'transparent' })} onChange={(v) => upd({ val: normFill(v) })} />
                      {usedFills.length > 0 && (
                        <div data-testid="var-count-fills" style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          <span style={{ width: '100%', fontSize: 11, color: t.textSubtle }}>{tr('editor.var.count.usedFills')}</span>
                          {usedFills.slice(0, 16).map(([c, n]) => (
                            <button key={c} type="button" title={fillLabel(c) + ' · ' + n} onClick={() => upd({ val: c })}
                              style={{ display: 'flex', alignItems: 'center', gap: 4, height: 24, padding: '0 6px', borderRadius: 6, cursor: 'pointer', fontSize: 11,
                                border: '1px solid ' + (normFill(sp.val) === c ? t.primary : t.border), background: t.surface, color: t.text }}>
                              <span style={{ width: 12, height: 12, borderRadius: 3, border: '1px solid ' + t.border,
                                background: c === 'transparent' ? 'repeating-conic-gradient(#d4d4d4 0% 25%, #fff 0% 50%) 50% / 6px 6px' : c }} />{n}
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                  <div style={{ fontSize: 11, color: t.textSubtle, lineHeight: 1.5 }}>{tr('editor.var.count.help')}</div>
                </div>
              );
            })() : draft.type === 'node' ? (
              <div data-testid="var-node" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ fontSize: 12, padding: '5px 8px', borderRadius: 6, border: '1px solid ' + t.border, background: t.surfaceAlt ?? t.surface,
                  color: draft.value && nodeTitle(draft.value) !== null ? t.text : '#B45309', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {draft.value ? (nodeTitle(draft.value) ?? tr('editor.var.node.missing')) : tr('editor.var.node.none')}
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button type="button" data-testid="var-node-pick" disabled={!selectedNodeId || dbOnly}
                    title={selectedNodeId ? '' : tr('editor.var.node.pickHint')}
                    onClick={() => selectedNodeId && setDraft({ ...draft, value: selectedNodeId })}
                    style={{ flex: 1, height: 28, borderRadius: 6, border: '1px solid ' + t.primaryBorder, background: t.primarySoft, color: t.primary, fontWeight: 700, fontSize: 12, cursor: selectedNodeId ? 'pointer' : 'not-allowed', opacity: selectedNodeId ? 1 : 0.5 }}>
                    {tr('editor.var.node.pick')}
                  </button>
                  {draft.value && nodeTitle(draft.value) !== null && (
                    <button type="button" onClick={() => goToNode(draft.value)} title={tr('editor.var.node.go')}
                      style={{ height: 28, padding: '0 10px', borderRadius: 6, border: '1px solid ' + t.border, background: t.surface, color: t.text, fontSize: 12, cursor: 'pointer' }}>↗</button>
                  )}
                </div>
                <div style={{ fontSize: 11, color: t.textSubtle, lineHeight: 1.5 }}>{tr('editor.var.node.help')}</div>
              </div>
            ) : draft.type === 'formula' ? (
              <textarea data-testid="var-value" value={draft.value} rows={3} onChange={(e) => setDraft({ ...draft, value: e.target.value })}
                placeholder={tr('editor.var.ph.formula')} style={{ ...input, height: 'auto', padding: 8, fontFamily: MONO, resize: 'vertical' }} />
            ) : (
              <input data-testid="var-value" value={draft.value} autoFocus={dbOnly} onChange={(e) => setDraft({ ...draft, value: e.target.value })}
                placeholder={tr('editor.var.ph.' + draft.type)} style={input} />
            )}
            {/* DB 값 (유료 모듈) — 저장된 값 · 시각, 없으면 [DB 저장] 으로 넣으라고 (2026-10-30) */}
            {dbOn && dbType(draft.type) && (() => {
              const row = draft.orig ? dbRows[draft.orig] : dbRows[draft.name.trim()];
              return (
                <div data-testid="var-db-state" style={{ fontSize: 11, marginTop: 3, lineHeight: 1.5, color: row ? '#15803D' : '#B45309' }}>
                  {row
                    ? tr('editor.var.dbHas', { value: row.value, at: row.updatedAt ? new Date(row.updatedAt).toLocaleString() : '—' })
                    : tr('editor.var.dbNone')}
                </div>
              );
            })()}
            {draft.type === 'formula' && (
              <div style={{ fontSize: 11, color: t.textSubtle, marginTop: 3, lineHeight: 1.5 }}>
                {tr('editor.var.formulaHelp', { names: vars.filter((v) => v.name !== draft.orig).map((v) => v.name).slice(0, 8).join(', ') || '—', fns: FUNCTION_NAMES.slice(0, 12).join(', ') })}
              </div>
            )}
            {valErr && <div style={{ fontSize: 11.5, color: '#B91C1C', marginTop: 3 }}>{tr('editor.' + valErr)}</div>}
            <div data-testid="var-preview" style={{ marginTop: 8, padding: '6px 8px', borderRadius: 6, background: t.surfaceAlt ?? t.surface, fontSize: 12.5 }}>
              <span style={{ color: t.textMuted }}>{tr('editor.var.preview')} </span>
              <b style={{ color: preview.startsWith('#') ? '#B91C1C' : t.text }}>{preview || tr('editor.var.noValue')}</b>
            </div>
            {dbError && <div data-testid="var-db-error" style={{ fontSize: 11.5, color: '#B91C1C', marginTop: 6, lineHeight: 1.5 }}>{dbError}</div>}
            <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
              {/* [DB 저장] — 값을 DB(dashboard_vars)에 넣는다. 정의(이름·타입·서식)도 함께 저장한다 */}
              {dbOn && dbType(draft.type) && (
                <button type="button" data-testid="var-save-db" disabled={!!nameErr || !!valErr || !draft.value.trim() || dbBusy}
                  title={tr(renameBlocked ? 'editor.var.saveDbRenameTip' : 'editor.var.saveDbTip')}
                  onClick={() => void save(true, true)}
                  style={{ flex: 1, height: 30, borderRadius: 7, border: '1px solid #15803D', background: '#DCFCE7', color: '#166534', fontWeight: 700, fontSize: 12.5, cursor: 'pointer', opacity: nameErr || valErr || !draft.value.trim() ? 0.5 : 1 }}>
                  {dbBusy ? '…' : tr('editor.var.saveDb')}
                </button>
              )}
              {dbOnly ? null : renameBlocked ? (
                <button type="button" data-testid="var-rename-all" disabled={!!nameErr} onClick={() => void save(true)}
                  style={{ flex: 1, height: 30, borderRadius: 7, border: 'none', background: t.primary, color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer', opacity: nameErr ? 0.5 : 1 }}>
                  {tr('editor.var.renameAll')}
                </button>
              ) : (
                <button type="button" data-testid="var-save" disabled={!!nameErr} onClick={() => void save(true)}
                  style={{ flex: 1, height: 30, borderRadius: 7, border: 'none', background: t.primary, color: '#fff', fontWeight: 700, fontSize: 12.5, cursor: 'pointer', opacity: nameErr ? 0.5 : 1 }}>
                  {tr('editor.var.save')}
                </button>
              )}
              <button type="button" onClick={() => setDraft(null)} style={{ height: 30, padding: '0 12px', borderRadius: 7, border: '1px solid ' + t.border, background: 'transparent', color: t.textMuted, fontSize: 12.5, cursor: 'pointer' }}>{tr('editor.var.cancel')}</button>
            </div>
          </div>
        )}

        {vars.length === 0 && !draft && <div style={{ fontSize: 12.5, color: t.textMuted, padding: '8px 2px' }}>{tr('editor.var.empty')}</div>}
        {vars.map((v) => {
          const r = results.get(v.name);
          const used = isUsed(v.name);
          return (
            <div key={v.name} data-testid="var-row" style={{ ...box, padding: '8px 10px', marginBottom: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <code style={{ flex: 1, minWidth: 0, fontFamily: MONO, fontSize: 12.5, fontWeight: 700, color: '#1D4ED8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>[&amp;{v.name}]</code>
                <button type="button" data-testid="var-copy" title={tr('editor.var.copyTip', { name: v.name })} onClick={() => copy(v.name)}
                  style={{ ...iconBtn(), color: copied === v.name ? '#15803D' : t.text }}>{copied === v.name ? '✓' : '⧉'}</button>
                {mapId && dbOn && dbType(v.type) && (
                  <button type="button" data-testid="var-api" title={tr('editor.var.apiTip', { name: v.name })} aria-pressed={apiOpen === v.name}
                    onClick={() => setApiOpen((o) => (o === v.name ? null : v.name))}
                    style={{ ...iconBtn(), width: 'auto', padding: '0 6px', fontSize: 10.5, fontWeight: 700, color: apiOpen === v.name ? t.primary : t.text }}>API</button>
                )}
                {(!readOnly || (dbOnly && dbOn && dbType(v.type))) && <button type="button" data-testid="var-edit" title={tr(dbOnly ? 'editor.var.editDb' : 'editor.var.edit')} onClick={() => startEdit(v)} style={iconBtn()}>✎</button>}
                {!readOnly && (
                  <button type="button" data-testid="var-delete" title={used ? tr('editor.var.deleteBlocked', { where: usedText(v.name) }) : tr('editor.var.delete')}
                    disabled={used} onClick={() => remove(v)} style={iconBtn(true, used)}>🗑</button>
                )}
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'baseline', marginTop: 4, fontSize: 11.5, color: t.textMuted, flexWrap: 'wrap' }}>
                <span style={{ padding: '0 6px', borderRadius: 8, background: t.surfaceAlt ?? t.surface, border: '1px solid ' + t.border }}>{tr('editor.var.type.' + v.type)}</span>
                <span style={{ fontFamily: MONO }}>{v.type === 'node' ? tr(v.format === 'all' ? 'editor.var.node.all' : 'editor.var.node.first') : (v.format ?? DEFAULT_FORMAT[v.type])}</span>
              </div>
              {v.type === 'count' && <div data-testid="var-count-row" style={{ marginTop: 3, fontSize: 11, color: t.textMuted }}>{countDesc(v.value)}</div>}
              <div style={{ marginTop: 4, fontSize: 12.5, display: 'flex', gap: 6, alignItems: 'baseline' }}>
                <b data-testid="var-display" style={{ color: r?.display?.startsWith('#') ? '#B91C1C' : t.text, wordBreak: 'break-all' }}>{r?.display ?? tr('editor.var.noValue')}</b>
                {v.type === 'formula' && <span style={{ fontFamily: MONO, fontSize: 11, color: t.textSubtle, wordBreak: 'break-all' }}>= {v.value}</span>}
              </div>
              {v.type === 'node' && (() => {
                const title = nodeTitle(v.value);
                return (
                  <div data-testid="var-node-row" style={{ marginTop: 3, fontSize: 11, display: 'flex', gap: 6, alignItems: 'center', color: title === null ? '#B91C1C' : t.textMuted }}>
                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {title === null ? tr('editor.var.node.missing') : tr('editor.var.node.points', { name: title })}
                    </span>
                    {title !== null && v.value && (
                      <button type="button" data-testid="var-node-go" onClick={() => goToNode(v.value!)} title={tr('editor.var.node.go')}
                        style={{ ...iconBtn(), width: 22, height: 22, fontSize: 11 }}>↗</button>
                    )}
                  </div>
                );
              })()}
              {dbOn && dbType(v.type) && (
                <div data-testid="var-db" style={{ marginTop: 3, fontSize: 11, color: dbRows[v.name] ? '#15803D' : '#B45309' }}>
                  {dbRows[v.name]
                    ? tr('editor.var.dbRow', { at: dbRows[v.name].updatedAt ? new Date(dbRows[v.name].updatedAt!).toLocaleString() : '—' })
                    : tr('editor.var.dbRowNone')}
                </div>
              )}
              {used && <div style={{ marginTop: 3, fontSize: 11, color: t.textSubtle }}>{usedText(v.name)}</div>}
              {apiOpen === v.name && mapId && (
                <ProVariableApi t={t} mapId={mapId} name={v.name} value={dbRows[v.name]?.value ?? v.value ?? ''} />
              )}
            </div>
          );
        })}

        {unregistered.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: '#B45309', marginBottom: 4 }}>{tr('editor.var.unregistered')}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {unregistered.map((n) => (
                <button key={n} type="button" data-testid="var-register" disabled={readOnly} onClick={() => startNew(n)} title={tr('editor.var.registerTip')}
                  style={{ fontFamily: MONO, fontSize: 11.5, padding: '2px 8px', borderRadius: 10, border: '1px solid #FDBA74', background: '#FFF7ED', color: '#C2410C', cursor: readOnly ? 'default' : 'pointer' }}>
                  [&amp;{n}] ＋
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 변수관리 밑의 보기 전환 — 값으로 보기 = 대시보드맵을 퍼블리싱한 것처럼 값이 들어간 맵 */}
      <div style={{ position: 'sticky', bottom: 0, padding: '8px 12px', borderTop: '1px solid ' + t.divider, background: t.surface }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {([false, true] as const).map((on) => {
            const active = (valueView || !!readOnlyInfo?.dashboard) === on;
            return (
              <button key={String(on)} type="button" data-testid={on ? 'var-view-value' : 'var-view-var'} aria-pressed={active}
                disabled={!!readOnlyInfo?.dashboard} onClick={() => setValueView(on)}
                style={{
                  flex: 1, height: 30, borderRadius: 7, fontSize: 12.5, fontWeight: 700, cursor: readOnlyInfo?.dashboard ? 'default' : 'pointer',
                  border: '1px solid ' + (active ? t.primaryBorder : t.border), background: active ? t.primarySoft : t.surfaceAlt ?? t.surface, color: active ? t.primary : t.text,
                }}>
                {on ? tr('editor.var.viewValue') : tr('editor.var.viewVar')}
              </button>
            );
          })}
        </div>
        {readOnlyInfo?.dashboard && <div style={{ fontSize: 11, color: t.textSubtle, marginTop: 4 }}>{tr('editor.var.dashboardAlways')}</div>}
      </div>
    </div>
  );
}
