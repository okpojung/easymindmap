// 노트·태그 탭 > 프로젝트 태그 — 일정·담당자·진척율 고정 입력란 (2026-10-23 사용자 결정).
//
//   ☑ 📅 일정    [시작일] ~ [끝일]
//   ☑ @ 담당자   [이름 자동완성]
//   ☑ % 진척율   [ 50 ] %  0 25 50 75 100
//
// 체크하면 노드 아래 태그 줄 맨 앞에 태그로 보이고, 끄면 태그만 빠진다(값은 남는다).
// 값을 처음 넣으면 체크도 함께 켠다. 담당자 자동완성은 EasyMindMap 주소록(유료 모듈의
// searchAssignees) — 공개판에서는 직접 입력만 된다. Redmine 구성원은 연계 단계에서 더한다.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ThemeTokens } from '@/components/design-tokens/theme';
import type { ProjectTags } from '@/editor/__samples__/types';
import { useDocumentStore } from '@/stores/documentStore';
import { normalizeProgress, type ProjectChipKind } from '@/editor/node-renderer/projectTags';
import { searchAssignees, type AssigneeCandidate } from '@pro';
import { InspectorSection } from './InspectorSection';
import { useTr } from '@/i18n';

const QUICK = [0, 25, 50, 75, 100];

export function ProjectTagsSection({ t, nodeId, project }: { t: ThemeTokens; nodeId: string | null; project: ProjectTags | undefined }) {
  const tr = useTr();
  const update = useDocumentStore((s) => s.updateNodeProject);
  const p = project ?? {};
  const [progDraft, setProgDraft] = useState<string>(p.progress != null ? String(p.progress) : '');
  const [nameDraft, setNameDraft] = useState<string>(p.assignee?.name ?? '');
  const [openList, setOpenList] = useState(false);
  const [people, setPeople] = useState<AssigneeCandidate[] | null>(null);
  const refs = { date: useRef<HTMLInputElement>(null), assignee: useRef<HTMLInputElement>(null), progress: useRef<HTMLInputElement>(null) };

  // 다른 노드를 고르면 입력 초안도 그 노드 값으로
  useEffect(() => { setProgDraft(p.progress != null ? String(p.progress) : ''); setNameDraft(p.assignee?.name ?? ''); setOpenList(false); }, [nodeId, p.progress, p.assignee?.name]);
  // 노드의 프로젝트 태그를 누르면 그 입력란으로
  useEffect(() => {
    const on = (e: Event) => { const k = (e as CustomEvent<ProjectChipKind>).detail; refs[k]?.current?.focus(); };
    window.addEventListener('emm:project-focus', on);
    return () => window.removeEventListener('emm:project-focus', on);
  }, []);

  const loadPeople = () => { if (people === null) searchAssignees().then(setPeople).catch(() => setPeople([])); };
  const matches = useMemo(() => {
    const q = nameDraft.trim().toLowerCase();
    return (people ?? []).filter((c) => !q || c.name.toLowerCase().includes(q) || (c.email ?? '').toLowerCase().includes(q)).slice(0, 8);
  }, [people, nameDraft]);

  const setDate = (k: 'start' | 'end', v: string) => update(nodeId, { [k]: v || null, ...(v && !p.dateOn ? { dateOn: true } : {}) });
  const pickPerson = (c: { name: string; email?: string }) => {
    setNameDraft(c.name); setOpenList(false);
    update(nodeId, { assignee: { name: c.name, ...(c.email ? { email: c.email } : {}) }, ...(p.assigneeOn ? {} : { assigneeOn: true }) });
  };
  const commitName = () => {
    const v = nameDraft.trim();
    if (v === (p.assignee?.name ?? '')) return;
    if (!v) { update(nodeId, { assignee: null }); return; }
    const known = (people ?? []).find((c) => c.name === v);
    pickPerson(known ?? { name: v });
  };
  const progValid = progDraft.trim() === '' || normalizeProgress(progDraft) !== null;
  const commitProgress = (raw: string) => {
    setProgDraft(raw);
    if (raw.trim() === '') { update(nodeId, { progress: null }); return; }
    const v = normalizeProgress(raw);
    if (v === null) return;
    update(nodeId, { progress: v, ...(p.progressOn ? {} : { progressOn: true }) });
  };

  const input: React.CSSProperties = {
    fontSize: 11, padding: '4px 6px', borderRadius: 4, border: `1px solid ${t.border}`,
    background: t.surface, color: t.text, outline: 'none', minWidth: 0,
  };
  const row: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 7 };
  const head = (kind: ProjectChipKind, icon: string, label: string, on: boolean | undefined) => (
    <label style={{ display: 'flex', alignItems: 'center', gap: 4, width: 74, flexShrink: 0, fontSize: 11.5, color: t.text, cursor: 'pointer' }}>
      <input
        type="checkbox"
        data-testid={`project-${kind}-on`}
        checked={!!on}
        onChange={(e) => update(nodeId, kind === 'date' ? { dateOn: e.target.checked } : kind === 'assignee' ? { assigneeOn: e.target.checked } : { progressOn: e.target.checked })}
      />
      <span aria-hidden="true" style={{ width: 14, textAlign: 'center', fontWeight: 700 }}>{icon}</span>
      {label}
    </label>
  );

  return (
    <InspectorSection t={t} title={tr('inspector.project.title')}>
      <div style={{ fontSize: 10.5, color: t.textMuted, lineHeight: 1.5, marginBottom: 8 }}>{tr('inspector.project.help')}</div>

      <div style={row}>
        {head('date', '📅', tr('inspector.project.date'), p.dateOn)}
        <input ref={refs.date} type="date" data-testid="project-start" value={p.start ?? ''} onChange={(e) => setDate('start', e.target.value)} style={{ ...input, flex: 1 }} aria-label={tr('inspector.project.start')} />
        <span style={{ color: t.textMuted, fontSize: 11 }}>~</span>
        <input type="date" data-testid="project-end" value={p.end ?? ''} min={p.start} onChange={(e) => setDate('end', e.target.value)} style={{ ...input, flex: 1 }} aria-label={tr('inspector.project.end')} />
      </div>

      <div style={{ ...row, position: 'relative' }}>
        {head('assignee', '@', tr('inspector.project.assignee'), p.assigneeOn)}
        <input
          ref={refs.assignee}
          data-testid="project-assignee"
          value={nameDraft}
          placeholder={tr('inspector.project.assigneePlaceholder')}
          onFocus={() => { loadPeople(); setOpenList(true); }}
          onChange={(e) => { setNameDraft(e.target.value); setOpenList(true); }}
          onKeyDown={(e) => { if (e.key === 'Enter') { (matches.length && nameDraft.trim() && matches[0].name.toLowerCase().startsWith(nameDraft.trim().toLowerCase()) ? pickPerson(matches[0]) : commitName()); } if (e.key === 'Escape') setOpenList(false); }}
          onBlur={() => setTimeout(() => { setOpenList(false); commitName(); }, 150)}
          style={{ ...input, flex: 1 }}
        />
        {openList && matches.length > 0 && (
          <div role="listbox" style={{
            position: 'absolute', zIndex: 30, top: '100%', left: 80, right: 0, marginTop: 2,
            background: t.surface, border: `1px solid ${t.border}`, borderRadius: 6,
            boxShadow: '0 8px 20px rgba(0,0,0,0.12)', maxHeight: 220, overflow: 'auto',
          }}>
            {matches.map((c) => (
              <div key={(c.email ?? '') + c.name} role="option" aria-selected={false}
                onMouseDown={(e) => { e.preventDefault(); pickPerson(c); }}
                style={{ padding: '5px 8px', fontSize: 11.5, cursor: 'pointer', display: 'flex', gap: 6, alignItems: 'baseline' }}>
                <span style={{ fontWeight: 600, color: t.text }}>{c.name}</span>
                {c.email && <span style={{ color: t.textMuted, fontSize: 10.5 }}>{c.email}</span>}
                <span style={{ marginLeft: 'auto', fontSize: 9.5, color: t.textSubtle }}>{c.source === 'redmine' ? 'Redmine' : tr('inspector.project.fromContacts')}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ ...row, flexWrap: 'wrap' }}>
        {head('progress', '%', tr('inspector.project.progress'), p.progressOn)}
        <input
          ref={refs.progress}
          data-testid="project-progress"
          inputMode="numeric"
          value={progDraft}
          placeholder="0~100"
          onChange={(e) => commitProgress(e.target.value)}
          style={{ ...input, width: 54, borderColor: progValid ? t.border : '#DC2626' }}
          aria-invalid={!progValid}
        />
        <span style={{ fontSize: 11, color: t.textMuted }}>%</span>
        <div style={{ display: 'flex', gap: 3 }}>
          {QUICK.map((q) => (
            <button key={q} type="button" onClick={() => commitProgress(String(q))} style={{
              fontSize: 10, padding: '2px 5px', borderRadius: 4, cursor: 'pointer',
              border: `1px solid ${p.progress === q ? t.primaryBorder : t.border}`,
              background: p.progress === q ? t.primarySoft : t.surfaceAlt, color: p.progress === q ? t.primary : t.textMuted,
            }}>{q}</button>
          ))}
        </div>
        {!progValid && <div style={{ flexBasis: '100%', paddingLeft: 80, fontSize: 10.5, color: '#DC2626' }}>{tr('inspector.project.progressInvalid')}</div>}
      </div>
    </InspectorSection>
  );
}
