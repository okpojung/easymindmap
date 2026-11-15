// 문서함 전용 도움말 본문 — HelpDrawer(mode="docs") 가 같은 모달 껍데기 안에 그린다.
import copy from './docsHelpCopy.json';
import type { Lang } from '@/i18n';

export interface DocsHelpSection { t: string; p?: string[]; o?: string[] }
export interface DocsHelpCopy {
  eyebrow: string; title: string; close: string; intro: string; toc: string; back: string; closeLabel: string;
  sections: DocsHelpSection[];
}

export const DOCS_HELP_COPY = copy as Record<Lang, DocsHelpCopy>;
export const docsHelpCopy = (lang: Lang): DocsHelpCopy => DOCS_HELP_COPY[lang] ?? DOCS_HELP_COPY.ko;

export function DocsHelpBody({ c, id }: { c: DocsHelpCopy; id: string }) {
  const sid = (i: number) => id + '-d' + i;
  return (
    <>
      <p id={id + '-intro'} className="emm-help__intro">{c.intro}</p>
      <nav className="emm-help__toc" aria-label={c.toc}>{c.sections.map((s, i) => (
        <a key={i} href={'#' + sid(i)} onClick={(e) => {
          e.preventDefault(); const el = document.getElementById(sid(i)); el?.scrollIntoView({ block: 'start' }); el?.focus({ preventScroll: true });
        }}><span>{String(i + 1).padStart(2, '0')}</span>{s.t}</a>
      ))}</nav>
      {c.sections.map((s, i) => (
        <section key={i} className="emm-help__section" id={sid(i)} tabIndex={-1} aria-labelledby={sid(i) + '-t'}>
          <h3 id={sid(i) + '-t'}>{String(i + 1).padStart(2, '0')} · {s.t}</h3>
          {s.p?.map((x, j) => <p key={j}>{x}</p>)}
          {s.o && <ol>{s.o.map((x, j) => <li key={j}>{x}</li>)}</ol>}
        </section>
      ))}
    </>
  );
}
