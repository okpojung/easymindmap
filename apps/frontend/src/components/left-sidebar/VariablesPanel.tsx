// 왼쪽 레일 '변수' (2026-10-29 사용자 요청) — 이 맵의 변수 목록 · 등록 · 수정 · 삭제 · 복사,
// 그리고 맨 아래 [변수로 보기 | 값으로 보기].
//
//   · 변수명·타입·서식(엑셀 셀 서식)·값(수식은 수식 글자)
//   · 복사 ⧉ → [&변수명] 이 클립보드에 — 노드 글자에서 Ctrl+V 로 붙인다
//   · 쓰는 곳(노드 글자·다른 변수의 수식)이 있으면 **삭제 불가**, **이름 바꾸기 불가** —
//     대신 [쓰는 곳 모두 함께 바꾸기] 로 이름과 쓰는 곳을 한 번에 바꾼다(되돌리기 한 번)
//   · 값·타입·서식은 쓰는 곳이 있어도 바꿀 수 있다(그게 변수의 쓸모다)
import { useMemo, useState, type CSSProperties } from 'react';
import type { ThemeTokens } from '@/components/design-tokens/theme';
import { useDocumentStore } from '@/stores/documentStore';
import { useEditorUiStore } from '@/stores/editorUiStore';
import { useCloudStore } from '@/stores/cloudStore';
import { useTr } from '@/i18n';
import {
  DEFAULT_FORMAT, FORMAT_PRESETS, VARIABLE_TYPES, evaluateVariables, previewDisplay, valueProblem, variableUsage,
  type MapVariable, type VariableType,
} from '@/utils/variables/mapVariables';
import { nameProblem } from '@/utils/variables/varSyntax';
import { FUNCTION_NAMES } from '@/utils/variables/formula';

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
  const vars = useMemo(() => map.settings?.variables ?? [], [map.settings?.variables]);
  const results = useMemo(() => evaluateVariables(vars), [vars]);
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
  const startEdit = (v: MapVariable) => { setMsg(null); setDraft({ orig: v.name, name: v.name, type: v.type, format: v.format ?? DEFAULT_FORMAT[v.type], value: v.value ?? '' }); };
  const remove = (v: MapVariable) => {
    if (isUsed(v.name)) return;
    if (!window.confirm(tr('editor.var.confirmDelete', { name: v.name }))) return;
    setVariables(vars.filter((x) => x.name !== v.name));
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
  const preview = draft && !nameErr ? previewDisplay(asDef(draft), vars) : '';
  const save = (withRename: boolean) => {
    if (!draft || nameErr) return;
    const def = asDef(draft);
    if (draft.orig && withRename && renamed) {
      renameVariable(draft.orig, def.name, def); // 이름·쓰는 곳·정의를 한 번에 (되돌리기 한 번)
    } else {
      const base = useDocumentStore.getState().map.settings?.variables ?? [];
      setVariables(draft.orig ? base.map((x) => (x.name === draft.orig ? def : x)) : [...base, def]);
    }
    setDraft(null);
    setMsg(tr(draft.orig ? 'editor.var.saved' : 'editor.var.added', { name: def.name }));
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
        {msg && !draft && <div role="status" style={{ fontSize: 12, color: '#15803D', marginBottom: 8 }}>{msg}</div>}

        {draft && (
          <div data-testid="var-editor" style={{ ...box, padding: 10, marginBottom: 12, borderColor: t.primaryBorder }}>
            <b style={{ fontSize: 13 }}>{draft.orig ? tr('editor.var.editTitle', { name: draft.orig }) : tr('editor.var.newTitle')}</b>
            <label style={label}>{tr('editor.var.name')}</label>
            <input data-testid="var-name" value={draft.name} maxLength={40} autoFocus onChange={(e) => setDraft({ ...draft, name: e.target.value })} style={{ ...input, fontFamily: MONO }} />
            {draft.name && nameErr && <div style={{ fontSize: 11.5, color: '#B91C1C', marginTop: 3 }}>{tr('editor.' + nameErr)}</div>}
            {renameBlocked && <div data-testid="var-rename-blocked" style={{ fontSize: 11.5, color: '#B45309', marginTop: 3, lineHeight: 1.5 }}>{tr('editor.var.renameBlocked', { where: usedText(draft.orig!) })}</div>}
            <label style={label}>{tr('editor.var.type')}</label>
            <select data-testid="var-type" value={draft.type}
              onChange={(e) => { const ty = e.target.value as VariableType; setDraft({ ...draft, type: ty, format: DEFAULT_FORMAT[ty] }); }} style={input}>
              {VARIABLE_TYPES.map((ty) => <option key={ty} value={ty}>{tr('editor.var.type.' + ty)}</option>)}
            </select>
            <label style={label}>{tr('editor.var.format')}</label>
            <input data-testid="var-format" list="var-format-presets" value={draft.format} onChange={(e) => setDraft({ ...draft, format: e.target.value })}
              placeholder={draft.type === 'phone' ? tr('editor.var.phoneAuto') : ''} style={{ ...input, fontFamily: MONO }} />
            <datalist id="var-format-presets">{FORMAT_PRESETS[draft.type].map((f) => <option key={f} value={f} />)}</datalist>
            <label style={label}>{draft.type === 'formula' ? tr('editor.var.formula') : tr('editor.var.value')}</label>
            {draft.type === 'formula' ? (
              <textarea data-testid="var-value" value={draft.value} rows={3} onChange={(e) => setDraft({ ...draft, value: e.target.value })}
                placeholder={tr('editor.var.ph.formula')} style={{ ...input, height: 'auto', padding: 8, fontFamily: MONO, resize: 'vertical' }} />
            ) : (
              <input data-testid="var-value" value={draft.value} onChange={(e) => setDraft({ ...draft, value: e.target.value })}
                placeholder={tr('editor.var.ph.' + draft.type)} style={input} />
            )}
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
            <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
              {renameBlocked ? (
                <button type="button" data-testid="var-rename-all" disabled={!!nameErr} onClick={() => save(true)}
                  style={{ flex: 1, height: 30, borderRadius: 7, border: 'none', background: t.primary, color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer', opacity: nameErr ? 0.5 : 1 }}>
                  {tr('editor.var.renameAll')}
                </button>
              ) : (
                <button type="button" data-testid="var-save" disabled={!!nameErr} onClick={() => save(true)}
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
                {!readOnly && <button type="button" data-testid="var-edit" title={tr('editor.var.edit')} onClick={() => startEdit(v)} style={iconBtn()}>✎</button>}
                {!readOnly && (
                  <button type="button" data-testid="var-delete" title={used ? tr('editor.var.deleteBlocked', { where: usedText(v.name) }) : tr('editor.var.delete')}
                    disabled={used} onClick={() => remove(v)} style={iconBtn(true, used)}>🗑</button>
                )}
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'baseline', marginTop: 4, fontSize: 11.5, color: t.textMuted, flexWrap: 'wrap' }}>
                <span style={{ padding: '0 6px', borderRadius: 8, background: t.surfaceAlt ?? t.surface, border: '1px solid ' + t.border }}>{tr('editor.var.type.' + v.type)}</span>
                <span style={{ fontFamily: MONO }}>{v.format ?? DEFAULT_FORMAT[v.type]}</span>
              </div>
              <div style={{ marginTop: 4, fontSize: 12.5, display: 'flex', gap: 6, alignItems: 'baseline' }}>
                <b data-testid="var-display" style={{ color: r?.display?.startsWith('#') ? '#B91C1C' : t.text, wordBreak: 'break-all' }}>{r?.display ?? tr('editor.var.noValue')}</b>
                {v.type === 'formula' && <span style={{ fontFamily: MONO, fontSize: 11, color: t.textSubtle, wordBreak: 'break-all' }}>= {v.value}</span>}
              </div>
              {used && <div style={{ marginTop: 3, fontSize: 11, color: t.textSubtle }}>{usedText(v.name)}</div>}
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
