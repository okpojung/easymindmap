import { APP_URL } from '../config';
import { go } from '../App';

export default function Home() {
  return (
    <>
      <section className="wrap hero">
        <h1>생각을 한 장으로.<br />그리고 링크 하나로 나눕니다.</h1>
        <p>
          AI 와 함께 마인드맵을 만들고, 완성한 맵을 주소 하나로 공개합니다.
          진열대에 올리면 찾아보는 사람에게도 보입니다.
        </p>
        <div className="row">
          <a className="btn" href={APP_URL}>맵 만들러 가기</a>
          <a
            className="btn ghost" href="/maps"
            onClick={(e) => { if (e.metaKey || e.ctrlKey) return; e.preventDefault(); go('/maps'); }}
          >퍼블리싱맵 둘러보기</a>
        </div>
      </section>

      <section className="wrap feat">
        <article>
          <h3>AI 가 뼈대를 잡습니다</h3>
          <p>주제만 주면 가지를 펼쳐 줍니다. 대화에서 바로 맵으로 저장할 수도 있습니다.</p>
        </article>
        <article>
          <h3>완성본은 주소가 됩니다</h3>
          <p>퍼블리싱하면 로그인 없이 열리는 링크가 생깁니다. 잠시 내려도 주소는 그대로입니다.</p>
        </article>
        <article>
          <h3>공개와 진열은 다릅니다</h3>
          <p>링크로만 나눌지, 진열대에 올릴지 저자가 고릅니다. 켜지 않으면 목록에 뜨지 않습니다.</p>
        </article>
      </section>
    </>
  );
}
