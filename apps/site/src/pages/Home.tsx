import { APP_URL } from '../config';
import { Link } from '../App';

/**
 * 홈 — **문서에 있는 사실만 쓴다.**
 *
 * 문구의 출처: `docs/01-product/product-highlights.md`(5가지 약속)와
 * `docs/04-extensions/emm-spec.md`(§1 배경과 목표). 없는 기능을 적으면
 * 손님이 와서 찾다가 없다는 것을 알게 된다 — 그게 가장 비싼 거짓말이다.
 */
export default function Home() {
  return (
    <>
      <section className="wrap hero">
        <p className="eyebrow">마인드맵 · 아웃라인 · 칸반 — 같은 내용, 세 가지 모습</p>
        <h1>생각을 적는 속도 그대로,<br />정리는 알아서.</h1>
        <p className="lead">
          글로 쓰든, 그림으로 그리든, 보드로 옮기든 <b>같은 내용이 함께 움직입니다.</b>
          쓰던 Markdown 문서를 끌어다 놓으면 표·코드·체크리스트까지 그대로 맵이 됩니다.
        </p>
        <div className="row">
          <a className="btn" href={APP_URL}>무료로 시작하기</a>
          <Link className="btn ghost" to="/library">지식창고 둘러보기</Link>
        </div>
      </section>

      <section className="wrap band">
        <h2 className="sec">EasyMindMap 이 다른 점</h2>
        <div className="feat">
          <article>
            <span className="ico" aria-hidden="true">📄</span>
            <h3>쓰던 문서가 그대로 맵이 됩니다</h3>
            <p>
              메모장·Obsidian·ChatGPT 에서 쓰던 Markdown 을 끌어다 놓으면
              견출·목록·표·코드·체크리스트까지 통째로 마인드맵이 됩니다.
              되돌려 내보내도 <b>스타일·사진·노트까지 복원</b>됩니다.
            </p>
          </article>
          <article>
            <span className="ico" aria-hidden="true">{'{ }'}</span>
            <h3>개발자의 콘텐츠를 제대로 그립니다</h3>
            <p>
              노드 안에 <b>코드 블록</b>(언어 라벨·복사 버튼), <b>표 격자</b>,
              <b> 눌러서 켜고 끄는 체크박스</b>가 들어갑니다. 다른 마인드맵처럼
              마커 문자가 그대로 드러나지 않습니다.
            </p>
          </article>
          <article>
            <span className="ico" aria-hidden="true">🧭</span>
            <h3>보던 자리가 이어집니다</h3>
            <p>
              맵을 보다가 아웃라인으로 바꾸면 <b>문서 처음이 아니라 방금 보던
              위치</b>부터 열립니다. 맵으로 돌아올 때도 떠나기 전의 줌·위치 그대로입니다.
            </p>
          </article>
          <article>
            <span className="ico" aria-hidden="true">🤖</span>
            <h3>AI 가 내 맵의 맥락으로 일합니다</h3>
            <p>
              Claude 커넥터(MCP)를 붙이면 대화에서 바로 맵을 만들고, 문서함의
              맵을 읽어 답하고, 원하는 노드 아래에 가지를 붙입니다.
            </p>
          </article>
          <article>
            <span className="ico" aria-hidden="true">🔗</span>
            <h3>완성본은 주소가 됩니다</h3>
            <p>
              퍼블리싱하면 로그인 없이 열리는 링크가 생깁니다. 잠시 내려도
              <b> 주소는 그대로</b>라 걸어 둔 링크가 죽지 않습니다.
            </p>
          </article>
          <article>
            <span className="ico" aria-hidden="true">📦</span>
            <h3>파일은 서버 없이 열립니다</h3>
            <p>
              HTML 로 내보낸 맵은 인터넷 없이 브라우저만으로 열리고, 접기·줌·
              검색까지 그대로 됩니다. 서비스가 사라져도 내 맵은 남습니다.
            </p>
          </article>
        </div>
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
        <a className="btn" href={APP_URL}>무료로 시작하기</a>
      </section>
    </>
  );
}
