import { Link } from '../App';
import { MMD_GITHUB_URL } from '../config';
import '../mmd.css';

const MMD_SITE_URL = 'https://www.mindmapmarkdown.org/ko/';
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
    <svg viewBox="0 0 560 320" role="img" aria-label="문서 계층이 깊어질수록 평문으로 볼 때 사람이 구조를 읽어내는 정도가 떨어지고, 트리로 볼 때는 유지된다는 개념도">
      <rect width="560" height="320" rx="16" fill="#fff" />
      <path d={gap} fill="#FDE8E1" opacity="0.9" />
      <g stroke="#E2E8F0">{[52, 112, 172, 232, 272].map((y) => <line key={y} x1="60" x2="510" y1={y} y2={y} />)}</g>
      <line x1="60" y1="280" x2="510" y2="280" stroke="#94A3B8" strokeWidth="1.5" />
      <line x1="60" y1="30" x2="60" y2="280" stroke="#94A3B8" strokeWidth="1.5" />
      {xs.map((x, i) => <text key={x} x={x} y="298" textAnchor="middle" fontSize="12" fill="#64748B">{i + 1}</text>)}
      <text x="285" y="315" textAnchor="middle" fontSize="12" fill="#475569">문서 계층 깊이 →</text>
      <text x="22" y="160" fontSize="12" fill="#475569" transform="rotate(-90 22 160)" textAnchor="middle">구조를 읽어내는 정도 →</text>
      <path d={line(xs.map(() => 52))} fill="none" stroke="#0F2A3F" strokeWidth="4" strokeLinecap="round" />
      <path d={line(tree)} fill="none" stroke="#0D9488" strokeWidth="4" strokeDasharray="2 9" strokeLinecap="round" />
      <path d={line(plain)} fill="none" stroke="#E8603C" strokeWidth="4" strokeLinecap="round" />
      {xs.map((x, i) => <circle key={x} cx={x} cy={plain[i]} r="5" fill="#E8603C" />)}
      <text x="508" y="42" textAnchor="end" fontSize="13" fontWeight="700" fill="#0F2A3F">기계 · AI</text>
      <text x="508" y="100" textAnchor="end" fontSize="13" fontWeight="700" fill="#0D9488">사람 · 트리로 볼 때</text>
      <text x="500" y="268" textAnchor="end" fontSize="13" fontWeight="700" fill="#C2410C">사람 · 평문으로 볼 때</text>
      <text x="420" y="145" textAnchor="middle" fontSize="13" fontWeight="700" fill="#9A3412">Mindmap Markdown이 메우는 간극</text>
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
  { icon: ICONS.open, title: '공개 표준', desc: '누구나 쓰고 구현' },
  { icon: ICONS.machine, title: '기계 판독', desc: '파서가 정확히 해석' },
  { icon: ICONS.ai, title: 'AI 가독', desc: 'LLM이 그대로 읽음' },
];

const LEVELS = [
  { id: 'L0', name: 'Read', desc: '적합한 문서는 평범한 마크다운입니다. 기존 모든 마크다운 도구에서 계층이 유지됩니다.', status: '모든 마크다운 도구', done: true },
  { id: 'L1', name: 'Structure', desc: '문서 → 트리(lift), 트리 → 문서(canonical projection)가 하나씩 정해지며 서로 역함수입니다.', status: 'mindmapmd에서 구현', done: true },
  { id: 'L2', name: 'Round-trip', desc: '트리 간 구조적 diff·merge, 문서 전체 없이 하위 트리 단위로 다루기.', status: '규칙 작성 전', done: false },
];

const PRINCIPLES = [
  { title: '여전히 마크다운', desc: 'GitHub, Obsidian 등 지금 쓰는 편집기에서 그대로 열립니다. 도입 비용은 0에서 시작합니다.' },
  { title: '의미는 문서에, 표현은 옆에', desc: '레이아웃과 스타일은 sidecar에 두고, 모델에 보내는 텍스트에는 넣지 않습니다.' },
  { title: '검증 가능한 적합성', desc: '확인할 수 없는 사양은 제안일 뿐입니다. 사양과 테스트는 같은 소스에서 생성됩니다.' },
  { title: '경쟁보다 상호운용', desc: 'OPML, JSON Canvas, markmap 등 기존 형식용 어댑터를 먼저 만듭니다.' },
];

const REPOS = [
  { name: 'spec', desc: '사양과 규범 예제', pill: '공개', on: true, href: 'https://github.com/mindmapmarkdown/spec' },
  { name: 'mindmapmd', desc: '참조 구현: lift · canonical projection', pill: 'L1', on: true, href: MMD_IMPL_URL },
  { name: 'conformance', desc: '테스트 스위트, 러너, 구현 레지스트리', pill: '예정', on: false },
  { name: 'adapters', desc: 'OPML · JSON Canvas · markmap 상호운용', pill: '예정', on: false },
];

export default function Mmd() {
  return (
    <div className="mmd">
      <section className="wrap mmd-hero">
        <div>
          <span className="mmd-badge">MMD Spec · Draft · 공개적으로 다듬는 중</span>
          <h1>인간과 AI가 같은 지식을<br />각자의 표현으로.</h1>
          <p className="mmd-lead">
            Mindmap Markdown은 인간과 AI가 같은 지식을 각자의 표현으로 다루기 위한
            <b> 왕복 안정(round-trip stable) 마크다운 프로파일</b>입니다.
            EasyMindMap은 이 표준을 따라 Markdown 글을 맵으로 펼치고, 다시 글로 되돌립니다.
          </p>
          <div className="mmd-actions">
            <a className="mmd-btn" href={MMD_SPEC_URL} {...ext}>사양 읽기 →</a>
            <a className="mmd-btn ghost" href={MMD_SITE_URL} {...ext}>mindmapmarkdown.org ↗</a>
          </div>
        </div>
        <div className="mmd-viz" aria-label="Markdown 글이 lift로 트리가 되고, projection으로 다시 글이 되는 그림" role="img">
          <pre aria-hidden="true"><span className="h"># Mindmap MD</span>{'\n'}<span className="h">## Problem</span>{'\n'}- Shallow{'\n'}- Deep{'\n'}<span className="h">## Contract</span>{'\n'}- Lift{'\n'}- Project</pre>
          <div className="mmd-arr" aria-hidden="true"><div>→</div>Lift<div>←</div>Projection</div>
          <div className="mmd-tree"><TreeSvg /></div>
        </div>
      </section>

      <section className="wrap mmd-sec">
        <h2>문서 형식이 사람과 기계를 모두 감당하려면 네 가지가 필요합니다</h2>
        <p className="mmd-sub">마크다운은 앞의 셋을 만족합니다. 남은 하나는 문서가 얕을 때만 유지됩니다.</p>
        <div className="mmd-props">
          <div className="mmd-pgrid">
            {PROPS.map((p) => (
              <article key={p.title} className="mmd-card">
                {p.icon}<h3>{p.title}</h3><p>{p.desc}</p><span className="mmd-ok">✓ Markdown</span>
              </article>
            ))}
            <article className="mmd-card warn">
              {ICONS.human}<h3>사람 가독</h3><p>문서가 얕을 때만</p>
              <span className="mmd-depth"><i className="d1">● 깊이 1–2</i><i className="d2">● 3–4</i><i className="d3">● 5+</i></span>
            </article>
          </div>
          <figure className="mmd-chart">
            <figcaption><b>계층이 깊어질수록 사람만 구조를 잃습니다</b><span>개념도 · 측정값 아님</span></figcaption>
            <DepthChart />
          </figure>
        </div>
      </section>

      <section className="mmd-band">
        <div className="wrap mmd-sec">
          <h2>트리로 그리는 것은 쉽습니다.<br />손실 없이 되돌리는 것이 어렵습니다.</h2>
          <p className="mmd-sub">
            계층이 깊어지면 사람은 평문에서 구조를 볼 수 없습니다. 같은 구조를 트리로 그리면 즉시 읽히는데도 말입니다.
            그런데 LLM이 문서를 재작성하는 순간 아래 정보가 조용히 사라지며, 이를 문제로 다루는 표준은 아직 없습니다.
          </p>
          <ul className="mmd-lost" aria-label="LLM이 다시 쓸 때 사라지는 정보">
            <li>노드 정체성</li><li>사람이 단 주석</li><li>레이아웃</li><li>검토 이력</li>
          </ul>
        </div>
      </section>

      <section className="wrap mmd-sec">
        <h2>설치 없는 단일 HTML, 두 개의 뷰</h2>
        <p className="mmd-sub">
          Mindmap Markdown 문서는 아무것도 설치할 필요 없는 단일 HTML 파일로 렌더링되며, 그 뷰어는 마인드맵과
          아웃라인 두 뷰를 함께 제공합니다. 어떤 단일 뷰도 모든 규모에서 작동하지 않기 때문입니다.
        </p>
        <div className="mmd-views">
          <article className="mmd-card row">
            <div className="mmd-thumb"><TreeSvg width={140} height={90} /></div>
            <div><h3>마인드맵</h3><p>한눈에 보는 형태<br />깊이가 깊을 때 강함</p></div>
          </article>
          <article className="mmd-card row">
            <div className="mmd-thumb">
              <svg width="120" height="80" viewBox="0 0 120 80" aria-hidden="true"><g stroke="#0F2A3F" strokeWidth="5" strokeLinecap="round"><path d="M10 12h70" /><path d="M24 28h60" /><path d="M24 44h50" /><path d="M10 60h80" /><path d="M24 74h40" /></g></svg>
            </div>
            <div><h3>아웃라인</h3><p>탐색 가능한 순서<br />노드 수가 많을 때 강함</p></div>
          </article>
        </div>
      </section>

      <section className="mmd-band">
        <div className="wrap mmd-sec">
          <h2>적합성 수준</h2>
          <p className="mmd-sub">수준은 누적됩니다. 구현은 자신이 주장하는 가장 높은 수준을 밝힙니다.</p>
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
            출처: <a href={MMD_SITE_URL} {...ext}>mindmapmarkdown.org</a> 메인 페이지(2026-10-26 기준). 사양은 Draft 단계이므로 내용이 바뀔 수 있습니다.
            · <a href={MMD_SPEC_URL} {...ext}>사양 읽기 →</a>
          </p>
        </div>
      </section>

      <section className="wrap mmd-sec">
        <h2>설계 원칙</h2>
        <div className="mmd-four">
          {PRINCIPLES.map((p) => <article key={p.title} className="mmd-card"><h3>{p.title}</h3><p>{p.desc}</p></article>)}
        </div>
      </section>

      <section className="mmd-band">
        <div className="wrap mmd-sec">
          <h2>저장소</h2>
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
            <h2>지금이 반대 의견을 내기 가장 좋은 때입니다</h2>
            <p>사양은 가장 초기이자 가장 바뀌기 쉬운 단계에 있습니다.</p>
          </div>
          <div className="mmd-actions">
            <a className="mmd-btn coral" href={MMD_SPEC_URL} {...ext}>초안 읽기</a>
            <a className="mmd-btn line" href={MMD_DISCUSS_URL} {...ext}>질문 · 제안하기</a>
            <a className="mmd-btn line" href={MMD_IMPL_URL} {...ext}>독립 구현하기</a>
          </div>
        </div>
        <p className="mmd-note center">
          EasyMindMap에서 Markdown으로 내보낸 맵을 보고 싶다면 <Link to="/library">지식창고 둘러보기</Link> ·
          {' '}표준 저장소 모음은 <a href={MMD_GITHUB_URL} {...ext}>GitHub</a>
        </p>
      </section>
    </div>
  );
}
