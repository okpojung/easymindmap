import { APP_URL } from '../config';
import { Link } from '../App';
import { FUNCTIONS } from '../content/functions';

/**
 * `/function` — **무엇이 있는가**를 훑는 자리 (2026-09-15 사용자 요청).
 *
 * 홈의 특장점이 "왜 좋은가" 라면 여기는 목록이다. 내용은
 * `content/functions.ts` 한 곳에 있고 이 화면은 **개수를 세지 않는다** —
 * 묶음이 7개가 되어도 격자가 그대로 접힌다.
 */
export default function FunctionPage() {
  return (
    <>
      <section className="wrap head">
        <p className="eyebrow">기능</p>
        <h1>무엇을 할 수 있나</h1>
        <p className="lead">
          맵을 만들고, 여러 모습으로 보고, 노드에 문서를 담고, 표준 Markdown 으로
          꺼내고, 링크로 나눕니다. <b>사용자 가이드에 장이 있는 기능만</b> 적었습니다.
        </p>
      </section>

      <section className="wrap">
        <div className="func">
          {FUNCTIONS.map((g) => (
            <article key={g.title}>
              <span className="ico" aria-hidden="true">{g.icon}</span>
              <h3>{g.title}</h3>
              <p>{g.lead}</p>
              <ul>
                {g.items.map((it) => <li key={it}>{it}</li>)}
              </ul>
              {g.more && <Link className="morelink" to={g.more.to}>{g.more.label} →</Link>}
              <p className="guide">가이드 {g.guide}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="wrap cta">
        <h2>직접 눌러 보는 편이 빠릅니다</h2>
        <p>가입 없이도 맵 하나는 만들어 볼 수 있습니다.</p>
        <div className="row" style={{ justifyContent: 'center' }}>
          <a className="btn" href={APP_URL}>앱 열기</a>
          <Link className="btn ghost" to="/ai">AI 연동 보기</Link>
        </div>
      </section>
    </>
  );
}
