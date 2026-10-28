import { Link } from '../App';
import { FUNCTIONS } from '../content/functions';
import { pageText } from '../i18n/pages';

const T = pageText().functions;

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
        <p className="eyebrow">{T.eyebrow}</p>
        <h1>{T.title}</h1>
        <p className="lead">{T.lead}</p>
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
              <p className="guide">{T.guidePrefix} {g.guide}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="wrap cta">
        <h2>{T.ctaTitle}</h2>
        <p>{T.ctaBody}</p>
        <div className="row" style={{ justifyContent: 'center' }}>
          <Link className="btn ghost" to="/ai">{T.ctaAi}</Link>
        </div>
      </section>
    </>
  );
}
