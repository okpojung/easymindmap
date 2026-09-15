import { APP_URL } from '../config';
import { Link } from '../App';

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
        <p className="eyebrow">AI 연동 — 커넥터(MCP)</p>
        <h1>AI 가 <b>내 맵의 맥락</b>으로 일합니다</h1>
        <p className="lead">
          일반 챗봇은 내가 무엇을 정리해 두었는지 모릅니다. EasyMindMap 을
          커넥터로 붙이면 AI 가 <b>내 문서함의 맵을 읽고</b>, 대화한 내용을
          <b> 그대로 맵으로 남기고</b>, 원하는 노드 아래에 가지를 붙입니다.
        </p>
      </section>

      <section className="wrap band">
        <h2 className="sec">우리가 정한 것 넷</h2>
        <div className="two">
          <article>
            <h3>① 맵은 대화의 부산물이 아니라 결과물이다</h3>
            <p>
              대화는 스크롤과 함께 사라집니다. 그래서 AI 의 답을 <b>지금 열려 있는
              맵의, 지금 고른 노드 아래</b>에 남길 수 있게 했습니다. 다음 대화에서
              AI 는 그 맵을 다시 읽고 이어 갑니다.
            </p>
          </article>
          <article>
            <h3>② AI 가 다루는 것은 표준 텍스트다</h3>
            <p>
              AI 에게 전용 포맷을 가르치지 않습니다. 주고받는 것은 <b>EMM
              Markdown</b> — 견출로 계층을 만드는 보통의 GFM 입니다. 선언이 없어도
              유효하므로, LLM 이 <b>평범한 Markdown 만 내놓아도</b> 맵이 됩니다.
            </p>
          </article>
          <article>
            <h3>③ 되돌릴 수 없는 것은 AI 에게 주지 않는다</h3>
            <p>
              맵·계정을 <b>지우는 도구는 없습니다.</b> 있는 글을 고치거나 빼는
              도구도 두지 않았습니다. AI 가 바꿀 수 있는 것은 <b>덧붙이기</b>와
              <b> 체크박스 한 글자</b>뿐이고, 둘 다 버전으로 남아 앱에서 되돌립니다.
            </p>
          </article>
          <article>
            <h3>④ 새 규칙을 두 벌로 만들지 않는다</h3>
            <p>
              커넥터의 도구는 앱이 쓰는 API 를 <b>얇게 감싼 것</b>입니다. 쿼터·권한·
              편집 잠금이 그대로 적용됩니다 — 남의 맵은 AI 에게도 보이지 않고,
              사람이 편집 중인 맵에는 AI 도 끼어들지 못합니다.
            </p>
          </article>
        </div>
      </section>

      <section className="wrap">
        <h2 className="sec">AI 에게 열어 준 도구 여섯</h2>
        <div className="tablewrap">
          <table className="cmp">
            <thead>
              <tr><th>도구</th><th>대화에서 이렇게 말하면</th><th>하는 일</th></tr>
            </thead>
            <tbody>
              <tr><td>create_map</td><td>“지금 내용 맵으로 저장해 줘”</td><td>대화 내용을 <b>새 맵</b>으로 문서함에 저장</td></tr>
              <tr><td>append_to_map</td><td>“‘다음 회의 &gt; 안건’ 아래에 붙여 줘”</td><td>그 노드 아래에 <b>가지를 덧붙임</b></td></tr>
              <tr><td>get_map</td><td>“지난주 회의 맵 읽어 줘”</td><td>맵 한 개를 EMM Markdown 으로 읽음 (편집 잠금 안 만듦)</td></tr>
              <tr><td>list_maps</td><td>“기획 폴더에 뭐 있어?”</td><td>내 맵·공유받은 맵 목록 (이름·폴더·수정일·노드 수)</td></tr>
              <tr><td>get_open_map</td><td>“지금 열려 있는 맵에”</td><td>앱에서 보고 있는 맵과 고른 노드의 자리를 알려 줌</td></tr>
              <tr><td>check_items</td><td>“끝난 항목 체크해 줘”</td><td>체크박스만 체크/해제 (<code>[ ]</code> ↔ <code>[x]</code>)</td></tr>
            </tbody>
          </table>
        </div>
        <p className="foot-note">
          맵 모양은 말로 정합니다 — “칸반으로”, “시간 순서로” 처럼 템플릿을 지정하면
          그대로 그립니다. 클라이언트는 붙을 때마다 도구 목록을 다시 읽으므로,
          도구가 늘어도 <b>커넥터를 다시 등록할 필요가 없습니다.</b>
        </p>
      </section>

      <section className="wrap band">
        <h2 className="sec">어떻게 붙이나 — 두 갈래</h2>
        <p className="lead">
          <b>“둘 중에 고른다” 는 말이 오해를 낳습니다.</b> 고르는 것은 사용자가
          아니라 <b>클라이언트</b>입니다. claude.ai 채팅창에는 토큰을 넣을 칸이
          아예 없고, Claude Code 에는 로그인 버튼이 없습니다. 쓰는 자리에 맞는
          쪽으로 붙이면 되고, <b>둘 다 켜 두어도 서로 방해하지 않습니다.</b>
        </p>
        <div className="tablewrap">
          <table className="cmp">
            <thead>
              <tr>
                <th>항목</th>
                <th>claude.ai 채팅창 <span className="small">(커스텀 커넥터)</span></th>
                <th>Claude Code <span className="small">(터미널 · 웹)</span></th>
              </tr>
            </thead>
            <tbody>
              <tr><td>인증 방식</td><td className="ok">OAuth — 로그인 버튼</td><td>PAT — <code>emm_…</code> 토큰 원문</td></tr>
              <tr><td>내가 붙여넣는 것</td><td className="ok">주소 한 줄</td><td>주소 + 토큰</td></tr>
              <tr><td>열쇠 수명</td><td className="ok">짧고 자동 갱신</td><td><b>무기한</b> — 만료가 없다</td></tr>
              <tr><td>토큰이 새면</td><td className="ok">곧 만료된다</td><td>앱에서 <b>[폐기]</b> 해야 멈춘다</td></tr>
              <tr><td>끊는 곳</td><td>claude.ai 커넥터 화면</td><td>앱 ▸ 🔌 AI 커넥터(MCP)</td></tr>
              <tr><td>어울리는 자리</td><td>평소 대화하며 정리할 때</td><td>코드·문서 작업과 함께 쓸 때</td></tr>
            </tbody>
          </table>
        </div>
        <p className="foot-note">
          <b>보안에서 실제로 다른 것은 하나</b>입니다 — 토큰(PAT)에는 만료가
          없습니다. 새어 나간 토큰은 사람이 폐기를 누르기 전까지 계속 유효하므로,
          공용 PC 에서 썼다면 쓰고 나서 앱에서 폐기하세요. OAuth 쪽에는 그 위험이
          구조적으로 없습니다.
        </p>
      </section>

      <section className="wrap">
        <h2 className="sec">커넥터 없이도 — 앱 안의 AI</h2>
        <div className="two">
          <article>
            <h3>AI 생성</h3>
            <p>
              앱에서 주제나 문서를 주면 가지를 펼쳐 줍니다. 커넥터를 붙이지 않아도
              되고, 결과는 <b>보통의 맵</b>이라 그대로 고쳐 쓰면 됩니다.
            </p>
          </article>
          <article>
            <h3>Markdown 붙여넣기</h3>
            <p>
              어떤 AI 가 내놓은 Markdown 이든 불러오면 맵이 됩니다 — 견출·표·코드·
              체크리스트째로. <b>연동을 지원하지 않는 AI 에도 길이 있습니다.</b>
            </p>
          </article>
        </div>
      </section>

      <section className="wrap cta">
        <h2>대화 한 번으로 맵 하나</h2>
        <p>앱에서 토큰을 발급하거나, 커넥터 주소를 등록하는 것으로 시작합니다.</p>
        <div className="row" style={{ justifyContent: 'center' }}>
          <a className="btn" href={APP_URL}>앱에서 커넥터 열기</a>
          <Link className="btn ghost" to="/function">전체 기능 보기</Link>
        </div>
      </section>
    </>
  );
}
