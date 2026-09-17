import { APP_URL } from '../config';
import { Link } from '../App';

/**
 * mmd(Mindmap Markdown) 표준 소개 — 출처는 `docs/04-extensions/emm-spec.md` §1·§2.1 이다.
 * 비교표의 값도 그 문서의 표를 그대로 옮겼다(§1.1 시장 공백). 용어: mmd = 형식, emm = EasyMindMap.
 */
export default function Mmd() {
  return (
    <>
      <section className="wrap head">
        <p className="eyebrow">mmd — Mindmap Markdown</p>
        <h1>마인드맵을 담는 <b>표준 텍스트 형식</b></h1>
        <p className="lead">
          마인드맵을 표현하는 텍스트 포맷의 사실상 표준은 아직 없습니다.
          mmd 는 <b>본문은 순수 GFM</b>, 맵의 모양은 제목 아래 <b>선언 블록 하나</b>로
          말하는 2계층 구조로 그 빈자리를 채웁니다.
        </p>
      </section>

      <section className="wrap band">
        <h2 className="sec">왜 2계층인가</h2>
        <div className="two">
          <article>
            <h3>본문 — 사람이 읽는 층</h3>
            <p>
              새 문법을 발명하지 않습니다. 견출이 <b>글자 크기가 아니라 노드
              레벨</b>이라는 약속 하나뿐입니다. 그래서 mmd 파일은 GitHub·
              Obsidian·Notion·VS Code 에서 <b>그냥 정상적인 문서</b>로 보입니다.
            </p>
          </article>
          <article>
            <h3>선언 — 도구가 읽는 층</h3>
            <p>
              레이아웃·도형·글자 크기처럼 <b>그림에만 필요한 것</b>은 제목 아래
              <code>emm</code> 코드블록 한 곳에 둡니다. 표준 Markdown 코드블록이라
              다른 도구에서는 그냥 코드로 보이고, 선언이 없어도 문서는 그대로
              유효합니다. 노드별 색·아이콘까지 그대로 옮기려면 HTML 로 내보냅니다.
            </p>
          </article>
        </div>
      </section>

      <section className="wrap">
        <h2 className="sec">다른 형식과 무엇이 다른가</h2>
        <div className="tablewrap">
          <table className="cmp">
            <thead>
              <tr><th>항목</th><th>Mermaid</th><th>Markmap</th><th>FreeMind</th><th>mmd</th></tr>
            </thead>
            <tbody>
              <tr><td>기반</td><td>MD 코드블록</td><td>MD 헤딩</td><td>XML</td><td><b>GFM 본문 + 선언 블록</b></td></tr>
              <tr><td>노드 안 표·코드·노트</td><td>제한</td><td>없음</td><td>있음</td><td className="ok">✅</td></tr>
              <tr><td>레이아웃</td><td>✗</td><td>✗</td><td>제한</td><td className="ok">✅ 방사형·트리·계층·타임라인</td></tr>
              <tr><td>스타일(도형·색)</td><td>제한</td><td>✗</td><td>있음</td><td className="ok">✅ 레벨 정책 + 노드 오버라이드</td></tr>
              <tr><td>사진·첨부</td><td>✗</td><td>✗</td><td>제한</td><td className="ok">✅ 본문의 링크로</td></tr>
              <tr><td>일반 MD 뷰어에서 가독</td><td>코드블록으로 보임</td><td>✅</td><td>✗</td><td className="ok">✅ 본문이 순수 GFM</td></tr>
              <tr><td>왕복 보존</td><td>✗</td><td>✗</td><td>자체 포맷 내</td><td className="ok">✅ 구조·내용·레이아웃 정책 (스타일까지는 HTML)</td></tr>
              <tr><td>AI 생성 친화</td><td>중간</td><td>높음</td><td>낮음</td><td className="ok">높음</td></tr>
            </tbody>
          </table>
        </div>
        <p className="foot-note">
          출처: mmd 스펙 §1.1 — 이 표는 스펙 문서의 비교표를 그대로 옮긴 것입니다.
        </p>
      </section>

      <section className="wrap band">
        <h2 className="sec">이렇게 생겼습니다</h2>
        <div className="two">
          <div>
            <h3>본문 — 어디서나 읽히는 Markdown</h3>
            <pre className="code">{`# 배포 절차

## 준비
- [x] 서버 접속 확인
- [ ] 백업 받기

## 실행
\`\`\`bash
npm ci && npm run build
\`\`\`

| 대상 | 위치 |
|---|---|
| 설정 | config/ |
`}</pre>
          </div>
          <div>
            <h3>선언 — 맵 모양을 한 줄로</h3>
            <pre className="code">{`\`\`\`emm
template: PT
\`\`\`
`}</pre>
            <p className="small">
              선언은 <b>선택</b>입니다. 없으면 기본 모양으로 그립니다 — LLM 이
              일반 Markdown 만 내놓아도 유효한 mmd 문서입니다.
            </p>
          </div>
        </div>
      </section>

      <section className="wrap">
        <h2 className="sec">mmd 가 지키려는 것 여섯</h2>
        <ol className="goals">
          <li><b>사람이 읽을 수 있어야 한다</b> — 어떤 Markdown 뷰어에서도 정상 문서로 보인다.</li>
          <li><b>GFM 과 충돌하지 않는다</b> — 본문에 새 문법을 발명하지 않는다.</li>
          <li><b>구조와 스타일을 분리한다</b> — 견출은 글자 크기가 아니라 노드 레벨이다.</li>
          <li><b>왕복 보존</b> — 맵 → MD → 맵을 반복해도 구조·노트·링크·사진·레이아웃 정책이 남는다.</li>
          <li><b>AI 입출력 친화</b> — 선언은 선택 사항이다.</li>
          <li><b>도구에 매이지 않는다</b> — 스펙만으로 제3자 파서·렌더러를 만들 수 있다.</li>
        </ol>
        <p className="foot-note">
          v1.0 이 다루지 않는 것: 픽셀 단위 시각 재현, 협업 상태·권한의 파일 내 표현,
          본문 안 커스텀 지시자 문법.
        </p>
      </section>

      <section className="wrap cta">
        <h2>직접 열어 보세요</h2>
        <p>맵을 만들어 Markdown 으로 내보내면, 그 파일이 곧 mmd 입니다.</p>
        <div className="row" style={{ justifyContent: 'center' }}>
          <a className="btn" href={APP_URL}>앱에서 만들어 보기</a>
          <Link className="btn ghost" to="/library">지식창고 둘러보기</Link>
        </div>
      </section>
    </>
  );
}
