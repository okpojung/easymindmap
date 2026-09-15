import { APP_URL } from '../config';
import { Link } from '../App';
import { FEATURES } from '../content/features';
import { emphasize } from '../content/emphasize';

/**
 * 홈 — **문서에 있는 사실만 쓴다.**
 *
 * 특장점 카드는 `content/features.ts` 에 데이터로 있다. 늘릴 때 이 파일은
 * 손대지 않는다 — 격자가 개수를 세지 않고 3열·2열·1열로 알아서 접힌다.
 */
export default function Home() {
  return (
    <>
      <section className="wrap hero">
        <p className="eyebrow">AI 마인드맵 — 마인드맵 · 아웃라인 · 칸반</p>
        <h1>AI 와 나눈 생각이,<br />그대로 한 장의 지도가 됩니다.</h1>
        <p className="lead">
          Claude 에게 말하면 <b>대화가 그대로 맵이 되고</b>, 만들어 둔 맵을
          <b> AI 가 읽어 답합니다.</b> 쓰던 Markdown 문서를 끌어다 놓으면
          표·코드·체크리스트까지 그대로 맵이 됩니다 — 글로 쓰든 그림으로 그리든
          <b> 같은 내용이 함께 움직입니다.</b>
        </p>
        <div className="row">
          <a className="btn" href={APP_URL}>무료로 시작하기</a>
          <Link className="btn ghost" to="/function">기능 살펴보기</Link>
        </div>
      </section>

      <section className="wrap band">
        <h2 className="sec">EasyMindMap 이 다른 점</h2>
        <div className="feat">
          {FEATURES.map((f) => (
            <article key={f.title}>
              <span className="ico" aria-hidden="true">{f.icon}</span>
              <h3>{f.title}</h3>
              <p>{emphasize(f.body, f.strong)}</p>
            </article>
          ))}
        </div>
        <p className="foot-note" style={{ marginBottom: 56 }}>
          <Link to="/function">기능을 항목별로 보기 →</Link>
          {'  ·  '}
          <Link to="/ai">AI 연동 자세히 보기 →</Link>
        </p>
      </section>

      <section className="wrap">
        <div className="promo">
          <div>
            <h2 className="sec">마인드맵에도 <b>표준 텍스트 형식</b>이 필요합니다</h2>
            <p>
              마인드맵을 담는 텍스트 포맷의 사실상 표준은 아직 없습니다.
              <b> EMM</b>(EasyMindMap Markdown)은 본문을 <b>순수 GFM</b> 으로 두고,
              레이아웃·스타일·사진 위치 같은 충실도 정보만 본문 밖 메타데이터에
              둡니다. 그래서 같은 파일이 GitHub·Obsidian·VS Code 에서 <b>그냥 문서로</b>
              읽히고, 우리 앱에서는 <b>무손실로</b> 맵이 됩니다.
            </p>
            <p>
              <b>AI 에게도 좋습니다</b> — LLM 이 일반 Markdown 만 내놓아도
              유효한 EMM 문서입니다. 메타데이터는 선택 사항이니까요.
            </p>
            <Link className="btn ghost" to="/emm">EMM 표준 보기</Link>
          </div>
          <pre className="code" aria-label="EMM 예시">{`# 배포 절차

## 준비
- [x] 서버 접속 확인
- [ ] 백업

## 실행
\`\`\`bash
npm run build
\`\`\`
`}</pre>
        </div>
      </section>

      <section className="wrap cta">
        <h2>지금 맵 하나를 만들어 보세요</h2>
        <p>가입 없이 둘러볼 수 있고, 만든 맵은 링크 하나로 나눌 수 있습니다.</p>
        <div className="row" style={{ justifyContent: 'center' }}>
          <a className="btn" href={APP_URL}>무료로 시작하기</a>
          <Link className="btn ghost" to="/library">지식창고 둘러보기</Link>
        </div>
      </section>
    </>
  );
}
