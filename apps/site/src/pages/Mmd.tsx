import { Link } from '../App';
import { MMD_GITHUB_URL } from '../config';
import { pageText } from '../i18n/pages';
import '../mmd.css';

const T = pageText().mmd;
/** 그 언어의 mindmapmarkdown.org 첫 화면 (한국어는 /ko/) */
const MMD_SITE_URL = T.siteUrl;
const MMD_SPEC_URL = 'https://github.com/mindmapmarkdown/spec/blob/main/spec.md';
const MMD_DISCUSS_URL = 'https://github.com/mindmapmarkdown/spec/discussions';
const MMD_IMPL_URL = 'https://github.com/mindmapmarkdown/mindmapmd';
const ext = { target: '_blank', rel: 'noopener noreferrer' } as const;

/**
 * Mindmap Markdown(MMD) 표준 소개 — 2026-10-26 www.mindmapmarkdown.org/ko/ 메인 페이지의
 * 내용과 도식(글↔트리 변환, 네 가지 조건, 깊이 그래프, 두 뷰, 적합성 수준)을 따른다.
 * 표준은 Draft 단계다. 적합성 수준·저장소 상태는 그 페이지에 적힌 그대로 옮기고, 여기서 새로 주장하지 않는다.
 */

/** 글(md) → 트리 그림. 중심 → 2갈래 → 4잎 */
function TreeSvg({ width = '100%', height = '100%' }: { width?: string | number; height?: string | number }) {
  return (
    <svg viewBox="0 0 360 260" width={width} height={height} aria-hidden="true">
      <g fill="none" stroke="#E8603C" strokeWidth="3">
        <path d="M110 130 C150 130 150 70 190 70" /><path d="M110 130 C150 130 150 190 190 190" />
        <path d="M260 70 C285 70 285 40 300 40" /><path d="M260 70 C285 70 285 100 300 100" />
        <path d="M260 190 C285 190 285 160 300 160" /><path d="M260 190 C285 190 285 220 300 220" />
      </g>
      <g fontFamily="Inter,Segoe UI,sans-serif" fontSize="13" fill="#0F2A3F">
        <rect x="14" y="112" width="100" height="36" rx="18" fill="#0F2A3F" />
        <text x="64" y="135" textAnchor="middle" fill="#fff" fontWeight="700">Mindmap MD</text>
        <rect x="186" y="54" width="78" height="32" rx="8" fill="#FFF5F1" stroke="#E8603C" /><text x="225" y="75" textAnchor="middle">Problem</text>
        <rect x="186" y="174" width="78" height="32" rx="8" fill="#FFF5F1" stroke="#E8603C" /><text x="225" y="195" textAnchor="middle">Contract</text>
        <circle cx="306" cy="40" r="6" fill="#2DD4BF" /><circle cx="306" cy="100" r="6" fill="#14B8A6" />
        <circle cx="306" cy="160" r="6" fill="#0D9488" /><circle cx="306" cy="220" r="6" fill="#0F766E" />
        <text x="318" y="44">Shallow</text><text x="318" y="104">Deep</text><text x="318" y="164">Lift</text><text x="318" y="224">Project</text>
      </g>
    </svg>
  );
}

/** 문서 깊이에 따라 구조를 읽어내는 정도 — 개념도(측정값 아님) */
function DepthChart() {
  const xs = [70, 154, 238, 322, 406, 490];
  const plain = [58, 74, 118, 178, 222, 246];
  const tree = [60, 64, 68, 72, 77, 82];
  const line = (ys: number[]) => xs.map((x, i) => `${i ? 'L' : 'M'}${x} ${ys[i]}`).join(' ');
  const gap = `${line(tree)} ${xs.slice().reverse().map((x, i) => `L${x} ${plain[plain.length - 1 - i]}`).join(' ')} Z`;
  return (
    <svg viewBox="0 0 560 320" role="img" aria-label={T.depth.aria}>
      <rect width="560" height="320" rx="16" fill="#fff" />
      <path d={gap} fill="#FDE8E1" opacity="0.9" />
      <g stroke="#E2E8F0">{[52, 112, 172, 232, 272].map((y) => <line key={y} x1="60" x2="510" y1={y} y2={y} />)}</g>
      <line x1="60" y1="280" x2="510" y2="280" stroke="#94A3B8" strokeWidth="1.5" />
      <line x1="60" y1="30" x2="60" y2="280" stroke="#94A3B8" strokeWidth="1.5" />
      {xs.map((x, i) => <text key={x} x={x} y="298" textAnchor="middle" fontSize="12" fill="#64748B">{i + 1}</text>)}
      <text x="285" y="315" textAnchor="middle" fontSize="12" fill="#475569">{T.depth.x}</text>
      <text x="22" y="160" fontSize="12" fill="#475569" transform="rotate(-90 22 160)" textAnchor="middle">{T.depth.y}</text>
      <path d={line(xs.map(() => 52))} fill="none" stroke="#0F2A3F" strokeWidth="4" strokeLinecap="round" />
      <path d={line(tree)} fill="none" stroke="#0D9488" strokeWidth="4" strokeDasharray="2 9" strokeLinecap="round" />
      <path d={line(plain)} fill="none" stroke="#E8603C" strokeWidth="4" strokeLinecap="round" />
      {xs.map((x, i) => <circle key={x} cx={x} cy={plain[i]} r="5" fill="#E8603C" />)}
      <text x="508" y="42" textAnchor="end" fontSize="13" fontWeight="700" fill="#0F2A3F">{T.depth.machine}</text>
      <text x="508" y="100" textAnchor="end" fontSize="13" fontWeight="700" fill="#0D9488">{T.depth.tree}</text>
      <text x="500" y="268" textAnchor="end" fontSize="13" fontWeight="700" fill="#C2410C">{T.depth.plain}</text>
      <text x="420" y="145" textAnchor="middle" fontSize="13" fontWeight="700" fill="#9A3412">{T.depth.gap}</text>
    </svg>
  );
}

const ICONS = {
  open: <svg viewBox="0 0 48 48" width="40" height="40" fill="none" stroke="#0F2A3F" strokeWidth="3" aria-hidden="true"><circle cx="24" cy="24" r="17" /><ellipse cx="24" cy="24" rx="7.5" ry="17" /><path d="M7 24h34M10 15h28M10 33h28" /></svg>,
  machine: <svg viewBox="0 0 48 48" width="40" height="40" aria-hidden="true"><text x="24" y="33" textAnchor="middle" fontFamily="Consolas,monospace" fontWeight="700" fontSize="26" fill="#0F2A3F">{'{ }'}</text></svg>,
  ai: <svg viewBox="0 0 48 48" width="40" height="40" fill="#0F2A3F" aria-hidden="true"><path d="M22 6 C23 17 27 21 38 22 C27 23 23 27 22 38 C21 27 17 23 6 22 C17 21 21 17 22 6Z" /><path d="M37 30 C37.5 34 39 35.5 43 36 C39 36.5 37.5 38 37 42 C36.5 38 35 36.5 31 36 C35 35.5 36.5 34 37 30Z" /></svg>,
  human: <svg viewBox="0 0 48 48" width="40" height="40" fill="none" stroke="#C2410C" strokeWidth="3" aria-hidden="true"><path d="M4 24 C11 13 18 10 24 10 C30 10 37 13 44 24 C37 35 30 38 24 38 C18 38 11 35 4 24Z" /><circle cx="24" cy="24" r="7" fill="#C2410C" /></svg>,
};

const PROPS = [
  { icon: ICONS.open, ...T.props.open },
  { icon: ICONS.machine, ...T.props.machine },
  { icon: ICONS.ai, ...T.props.ai },
];

const LEVELS = [
  { id: 'L0', name: 'Read', ...T.levels.L0, done: true },
  { id: 'L1', name: 'Structure', ...T.levels.L1, done: true },
  { id: 'L2', name: 'Round-trip', ...T.levels.L2, done: false },
] as const;

const PRINCIPLES = T.principles;

const REPOS = [
  { name: 'spec', ...T.repos.spec, on: true, href: 'https://github.com/mindmapmarkdown/spec' },
  { name: 'mindmapmd', ...T.repos.mindmapmd, on: true, href: MMD_IMPL_URL },
  { name: 'conformance', ...T.repos.conformance, on: false },
  { name: 'adapters', ...T.repos.adapters, on: false },
] as { name: string; desc: string; pill: string; on: boolean; href?: string }[];
export default function Mmd() {
  return (
    <div className="mmd">
      <section className="wrap mmd-hero">
        <div>
          <span className="mmd-badge">{T.badge}</span>
          <h1>{T.heroTitle}</h1>
          <p className="mmd-lead">{T.heroLead}</p>

          <div className="mmd-actions">
            <a className="mmd-btn" href={MMD_SPEC_URL} {...ext}>{T.readSpec}</a>
            <a className="mmd-btn ghost" href={MMD_SITE_URL} {...ext}>mindmapmarkdown.org ↗</a>
          </div>
        </div>
        <div className="mmd-viz" aria-label={T.vizAria} role="img">
          <pre aria-hidden="true"><span className="h"># Mindmap MD</span>{'\n'}<span className="h">## Problem</span>{'\n'}- Shallow{'\n'}- Deep{'\n'}<span className="h">## Contract</span>{'\n'}- Lift{'\n'}- Project</pre>
          <div className="mmd-arr" aria-hidden="true"><div>→</div>Lift<div>←</div>Projection</div>
          <div className="mmd-tree"><TreeSvg /></div>
        </div>
      </section>

      <section className="wrap mmd-sec">
        <h2>{T.propsTitle}</h2>
        <p className="mmd-sub">{T.propsSub}</p>
        <div className="mmd-props">
          <div className="mmd-pgrid">
            {PROPS.map((p) => (
              <article key={p.title} className="mmd-card">
                {p.icon}<h3>{p.title}</h3><p>{p.desc}</p><span className="mmd-ok">✓ Markdown</span>
              </article>
            ))}
            <article className="mmd-card warn">
              {ICONS.human}<h3>{T.human.title}</h3><p>{T.human.desc}</p>
              <span className="mmd-depth"><i className="d1">{T.human.depth[0]}</i><i className="d2">{T.human.depth[1]}</i><i className="d3">{T.human.depth[2]}</i></span>
            </article>
          </div>
          <figure className="mmd-chart">
            <figcaption><b>{T.chartTitle}</b><span>{T.chartNote}</span></figcaption>
            <DepthChart />
          </figure>
        </div>
      </section>

      <section className="mmd-band">
        <div className="wrap mmd-sec">
          <h2>{T.roundTitle}</h2>
          <p className="mmd-sub">{T.roundBody}</p>
          <ul className="mmd-lost" aria-label={T.lostAria}>
            {T.lost.map((x) => <li key={x}>{x}</li>)}
          </ul>
        </div>
      </section>

      <section className="wrap mmd-sec">
        <h2>{T.viewsTitle}</h2>
        <p className="mmd-sub">{T.viewsBody}</p>

        <div className="mmd-views">
          <article className="mmd-card row">
            <div className="mmd-thumb"><TreeSvg width={140} height={90} /></div>
            <div><h3>{T.mindmap.title}</h3><p>{T.mindmap.desc}</p></div>
          </article>
          <article className="mmd-card row">
            <div className="mmd-thumb">
              <svg width="120" height="80" viewBox="0 0 120 80" aria-hidden="true"><g stroke="#0F2A3F" strokeWidth="5" strokeLinecap="round"><path d="M10 12h70" /><path d="M24 28h60" /><path d="M24 44h50" /><path d="M10 60h80" /><path d="M24 74h40" /></g></svg>
            </div>
            <div><h3>{T.outline.title}</h3><p>{T.outline.desc}</p></div>
          </article>
        </div>
      </section>

      <section className="mmd-band">
        <div className="wrap mmd-sec">
          <h2>{T.levelsTitle}</h2>
          <p className="mmd-sub">{T.levelsSub}</p>
          <ol className="mmd-levels">
            {LEVELS.map((l, i) => (
              <li key={l.id} className="mmd-card">
                <h3><span className={`mmd-lv lv${i}`}>{l.id}</span>{l.name}</h3>
                <p>{l.desc}</p>
                <span className={l.done ? 'mmd-status' : 'mmd-status todo'}>● {l.status}</span>
              </li>
            ))}
          </ol>
          <p className="mmd-note">
            {T.source(
              <a href={MMD_SITE_URL} {...ext}>mindmapmarkdown.org</a>,
              (text) => <a href={MMD_SPEC_URL} {...ext}>{text}</a>,
            )}
          </p>
        </div>
      </section>

      <section className="wrap mmd-sec">
        <h2>{T.principlesTitle}</h2>
        <div className="mmd-four">
          {PRINCIPLES.map((p) => <article key={p.title} className="mmd-card"><h3>{p.title}</h3><p>{p.desc}</p></article>)}
        </div>
      </section>

      <section className="mmd-band">
        <div className="wrap mmd-sec">
          <h2>{T.reposTitle}</h2>
          <div className="mmd-four">
            {REPOS.map((r) => {
              const body = <><h3><code>{r.name}</code><span className={r.on ? 'mmd-pill on' : 'mmd-pill'}>{r.pill}</span></h3><p>{r.desc}</p></>;
              return r.href
                ? <a key={r.name} className="mmd-card mmd-repo" href={r.href} {...ext}>{body}</a>
                : <article key={r.name} className="mmd-card mmd-repo">{body}</article>;
            })}
          </div>
        </div>
      </section>

      <section className="wrap mmd-sec">
        <div className="mmd-cta">
          <div>
            <h2>{T.ctaTitle}</h2>
            <p>{T.ctaBody}</p>
          </div>
          <div className="mmd-actions">
            <a className="mmd-btn coral" href={MMD_SPEC_URL} {...ext}>{T.ctaDraft}</a>
            <a className="mmd-btn line" href={MMD_DISCUSS_URL} {...ext}>{T.ctaDiscuss}</a>
            <a className="mmd-btn line" href={MMD_IMPL_URL} {...ext}>{T.ctaImplement}</a>
          </div>
        </div>
        <p className="mmd-note center">
          {T.footNote(
            (text) => <Link to="/library">{text}</Link>,
            <a href={MMD_GITHUB_URL} {...ext}>GitHub</a>,
          )}
        </p>
      </section>
    </div>
  );
}
