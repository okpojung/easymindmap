import { APP_URL } from '../config';
import { Link } from '../App';
import { pageText, type AiToolName } from '../i18n/pages';

const T = pageText().ai;
const TOOLS: AiToolName[] = ['create_map', 'append_to_map', 'get_map', 'list_maps', 'get_open_map', 'check_items'];
/** 비교표에서 claude.ai 쪽이 나은 줄(초록) — connectRows 순서와 같다 */
const CHAT_OK = [true, true, true, true, false, false];

/**
 * `/ai` — **AI 연동**을 따로 떼어 낸 자리 (2026-09-15 사용자 결정).
 *
 * `/function` 은 "AI 로 무엇이 되나" 만 짧게 말하고, 여기서는 **왜 그렇게
 * 만들었나(사상)** 와 **어떻게 붙이나(C·D 차이)** 를 다룬다.
 *
 * ★ 출처는 `docs/04-extensions/ai/mcp-connector.md` 다 —
 *   사상은 §2-3(넣지 않을 것)·§2-1, 붙이는 법 표는 §9.2 ②,
 *   C·D 비교는 §9.2.1 을 그대로 옮겼다. 숫자(도구 6개)는 `mcp-tools.ts`
 *   의 배열 길이가 근거다. **여기서 새로 지어내지 않는다.**
 */
export default function Ai() {
  return (
    <>
      <section className="wrap head">
        <p className="eyebrow">{T.eyebrow}</p>
        <h1>{T.title}</h1>
        <p className="lead">{T.lead}</p>
      </section>

      <section className="wrap band">
        <h2 className="sec">{T.principlesTitle}</h2>
        <div className="two">
          {T.principles.map((p) => (
            <article key={p.title}>
              <h3>{p.title}</h3>
              <p>{p.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="wrap">
        <h2 className="sec">{T.toolsTitle}</h2>
        <div className="tablewrap">
          <table className="cmp">
            <thead>
              <tr><th>{T.toolsHead.tool}</th><th>{T.toolsHead.say}</th><th>{T.toolsHead.does}</th></tr>
            </thead>
            <tbody>
              {TOOLS.map((name) => <tr key={name}><td>{name}</td><td>{T.tools[name].say}</td><td>{T.tools[name].does}</td></tr>)}
            </tbody>
          </table>
        </div>
        <p className="foot-note">{T.toolsNote}</p>
      </section>

      <section className="wrap band">
        <h2 className="sec">{T.connectTitle}</h2>
        <p className="lead">{T.connectLead}</p>
        <div className="tablewrap">
          <table className="cmp">
            <thead>
              <tr>
                <th>{T.connectHead.item}</th>
                <th>{T.connectHead.chat} <span className="small">{T.connectHead.chatSub}</span></th>
                <th>{T.connectHead.code} <span className="small">{T.connectHead.codeSub}</span></th>
              </tr>
            </thead>
            <tbody>
              {T.connectRows.map((r, i) => (
                <tr key={r.label}><td>{r.label}</td><td className={CHAT_OK[i] ? 'ok' : undefined}>{r.chat}</td><td>{r.code}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="foot-note">{T.connectNote}</p>
      </section>

      <section className="wrap">
        <h2 className="sec">{T.inAppTitle}</h2>
        <div className="two">
          {T.inApp.map((a) => (
            <article key={a.title}>
              <h3>{a.title}</h3>
              <p>{a.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="wrap cta">
        <h2>{T.ctaTitle}</h2>
        <p>{T.ctaBody}</p>
        <div className="row" style={{ justifyContent: 'center' }}>
          <a className="btn" href={APP_URL}>{T.ctaApp}</a>
          <Link className="btn ghost" to="/function">{T.ctaFunctions}</Link>
        </div>
      </section>
    </>
  );
}