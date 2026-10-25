import { Link } from '../App';
import { MMD_GITHUB_URL } from '../config';

const MMD_SITE_URL = 'https://www.mindmapmarkdown.org/ko/';
const MMD_SPEC_URL = 'https://github.com/mindmapmarkdown/spec/blob/main/spec.md';

/**
 * Mindmap Markdown(MMD) 표준 소개 — 2026-10-26 www.mindmapmarkdown.org/ko/ 메인 페이지 내용을 따른다.
 * 표준은 Draft 단계다. 적합성 수준·저장소 상태는 그 페이지에 적힌 그대로 옮기고, 여기서 새로 주장하지 않는다.
 */
export default function Mmd() {
  return (
    <>
      <section className="wrap head">
        <p className="eyebrow">MMD Spec · Mindmap Markdown · Draft · 공개적으로 다듬는 중</p>
        <h1>같은 지식을, <b>사람과 AI가 함께</b></h1>
        <p className="lead">
          Mindmap Markdown은 인간과 AI가 같은 지식을 각자의 표현으로 다루기 위한
          <b> 왕복 안정(round-trip stable) 마크다운 프로파일</b>입니다.
          EasyMindMap은 이 표준을 따라 Markdown 글을 맵으로 펼치고, 다시 글로 되돌립니다.
        </p>
        <div className="row">
          <a className="btn" href={MMD_SPEC_URL} target="_blank" rel="noopener noreferrer">사양 읽기 ↗</a>
          <a className="btn ghost" href={MMD_SITE_URL} target="_blank" rel="noopener noreferrer">mindmapmarkdown.org ↗</a>
        </div>
      </section>

      <section className="wrap band">
        <h2 className="sec">문서 형식이 사람과 기계를 모두 감당하려면 네 가지가 필요합니다</h2>
        <p className="lead">마크다운은 앞의 셋을 만족합니다. 남은 하나는 문서가 얕을 때만 유지됩니다.</p>
        <div className="tablewrap">
          <table className="cmp">
            <thead>
              <tr><th>조건</th><th>뜻</th><th>Markdown</th></tr>
            </thead>
            <tbody>
              <tr><td>공개 표준</td><td>누구나 쓰고 구현</td><td className="ok">✓</td></tr>
              <tr><td>기계 판독</td><td>파서가 정확히 해석</td><td className="ok">✓</td></tr>
              <tr><td>AI 가독</td><td>LLM이 그대로 읽음</td><td className="ok">✓</td></tr>
              <tr><td>사람 가독</td><td>문서가 얕을 때만 (깊이 1–2는 쉽고, 3–4부터 어려워지며, 5 이상이면 구조가 보이지 않음)</td><td>△</td></tr>
            </tbody>
          </table>
        </div>
        <p className="foot-note"><b>계층이 깊어질수록 사람만 구조를 잃습니다.</b> 깊이 구분은 이해를 돕는 개념도이며 측정값이 아닙니다.</p>
      </section>

      <section className="wrap">
        <h2 className="sec">트리로 그리는 것은 쉽습니다. 손실 없이 되돌리는 것이 어렵습니다.</h2>
        <div className="two">
          <article>
            <h3>사람에게는 그림이 필요합니다</h3>
            <p>
              계층이 깊어지면 사람은 평문에서 구조를 볼 수 없습니다. 같은 구조를
              트리로 그리면 즉시 읽히는데도 말입니다.
            </p>
          </article>
          <article>
            <h3>AI가 고쳐 쓰면 조용히 사라지는 것들</h3>
            <p>
              LLM이 문서를 재작성하는 순간 <b>노드 정체성 · 사람이 단 주석 · 레이아웃 · 검토 이력</b>이
              조용히 사라지며, 이를 문제로 다루는 표준은 아직 없습니다.
            </p>
          </article>
        </div>
      </section>

      <section className="wrap band">
        <h2 className="sec">설치 없는 단일 HTML, 두 개의 뷰</h2>
        <p className="lead">
          Mindmap Markdown 문서는 아무것도 설치할 필요 없는 <b>단일 HTML 파일</b>로 렌더링되며,
          그 뷰어는 마인드맵과 아웃라인 두 뷰를 함께 제공합니다. 어떤 단일 뷰도 모든 규모에서
          작동하지 않기 때문입니다.
        </p>
        <div className="two">
          <article>
            <h3>마인드맵</h3>
            <p>한눈에 보는 형태 — <b>깊이가 깊을 때</b> 강합니다.</p>
          </article>
          <article>
            <h3>아웃라인</h3>
            <p>탐색 가능한 순서 — <b>노드 수가 많을 때</b> 강합니다.</p>
          </article>
        </div>
      </section>

      <section className="wrap">
        <h2 className="sec">적합성 수준</h2>
        <p className="lead">수준은 누적됩니다. 구현은 자신이 주장하는 가장 높은 수준을 밝힙니다.</p>
        <div className="tablewrap">
          <table className="cmp">
            <thead>
              <tr><th>수준</th><th>내용</th><th>현재 상태</th></tr>
            </thead>
            <tbody>
              <tr><td>L0 · Read</td><td>적합한 문서는 평범한 마크다운입니다. 기존 모든 마크다운 도구에서 계층이 유지됩니다.</td><td className="ok">모든 마크다운 도구</td></tr>
              <tr><td>L1 · Structure</td><td>문서 → 트리(lift), 트리 → 문서(canonical projection)가 하나씩 정해지며 서로 역함수입니다.</td><td className="ok">mindmapmd에서 구현</td></tr>
              <tr><td>L2 · Round-trip</td><td>트리 간 구조적 diff·merge, 문서 전체 없이 하위 트리 단위로 다루기.</td><td>규칙 작성 전</td></tr>
            </tbody>
          </table>
        </div>
        <p className="foot-note">
          출처: <a href={MMD_SITE_URL} target="_blank" rel="noopener noreferrer">mindmapmarkdown.org</a> 메인 페이지(2026-10-26 기준).
          사양은 Draft 단계이므로 내용이 바뀔 수 있습니다.
        </p>
      </section>

      <section className="wrap band">
        <h2 className="sec">설계 원칙</h2>
        <ol className="goals">
          <li><b>여전히 마크다운</b> — GitHub, Obsidian 등 지금 쓰는 편집기에서 그대로 열립니다. 도입 비용은 0에서 시작합니다.</li>
          <li><b>의미는 문서에, 표현은 옆에</b> — 레이아웃과 스타일은 sidecar에 두고, 모델에 보내는 텍스트에는 넣지 않습니다.</li>
          <li><b>검증 가능한 적합성</b> — 확인할 수 없는 사양은 제안일 뿐입니다. 사양과 테스트는 같은 소스에서 생성됩니다.</li>
          <li><b>경쟁보다 상호운용</b> — OPML, JSON Canvas, markmap 등 기존 형식용 어댑터를 먼저 만듭니다.</li>
        </ol>
      </section>

      <section className="wrap">
        <h2 className="sec">저장소</h2>
        <div className="tablewrap">
          <table className="cmp">
            <thead>
              <tr><th>저장소</th><th>내용</th><th>상태</th></tr>
            </thead>
            <tbody>
              <tr><td><a href="https://github.com/mindmapmarkdown/spec" target="_blank" rel="noopener noreferrer">spec ↗</a></td><td>사양과 규범 예제</td><td className="ok">공개</td></tr>
              <tr><td><a href="https://github.com/mindmapmarkdown/mindmapmd" target="_blank" rel="noopener noreferrer">mindmapmd ↗</a></td><td>참조 구현: lift · canonical projection</td><td className="ok">L1</td></tr>
              <tr><td>conformance</td><td>테스트 스위트, 러너, 구현 레지스트리</td><td>예정</td></tr>
              <tr><td>adapters</td><td>OPML · JSON Canvas · markmap 상호운용</td><td>예정</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="wrap cta">
        <h2>지금이 반대 의견을 내기 가장 좋은 때입니다</h2>
        <p>사양은 가장 초기이자 가장 바뀌기 쉬운 단계에 있습니다. 의견은 GitHub에서 받습니다.</p>
        <div className="row" style={{ justifyContent: 'center' }}>
          <a className="btn" href={MMD_GITHUB_URL} target="_blank" rel="noopener noreferrer">GitHub에서 의견 남기기 ↗</a>
          <Link className="btn ghost" to="/library">지식창고 둘러보기</Link>
        </div>
      </section>
    </>
  );
}
