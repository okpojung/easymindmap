/**
 * 하위 페이지 문구 — 한국어(원문·기준). 구조와 쓰는 법은 pages.ts 머리말을 본다.
 * ★ 화면 모양은 2026-10-29 이전(문구가 페이지 안에 있던 때)과 글자 하나까지 같아야 한다.
 */
import type { PageText } from './pages';

const ko: PageText = {
  common: {
    loading: '불러오는 중…',
    more: '더 보기',
    retry: '다시 시도',
    clearSearch: '검색어 지우기',
    listLoadFailed: '목록을 불러오지 못했습니다.',
    dateOptions: { year: 'numeric', month: 'numeric', day: 'numeric' },
  },

  api: {
    listedFailed: (status) => `목록을 불러오지 못했습니다 (HTTP ${status})`,
    network: '서버에 연결하지 못했습니다. 잠시 뒤 다시 시도해 주세요.',
    requestFailed: (status) => `요청을 처리하지 못했습니다 (HTTP ${status}).`,
  },

  functions: {
    eyebrow: '기능',
    title: '무엇을 할 수 있나',
    lead: (
      <>
        맵을 만들고, 여러 모습으로 보고, 노드에 문서를 담고, 표준 Markdown 으로
        꺼내고, 링크로 나눕니다. <b>사용자 가이드에 장이 있는 기능만</b> 적었습니다.
      </>
    ),
    guidePrefix: '가이드',
    groups: {
      ai: {
        title: 'AI 로 만들기',
        lead: '주제만 주면 뼈대를 펼치고, 대화한 내용을 그대로 맵으로 남깁니다.',
        items: [
          'AI 생성 — 주제·문서를 주면 가지를 펼쳐 준다',
          'Claude 커넥터(MCP) — 대화에서 바로 맵 만들기 · 문서함의 맵 읽기',
          '원하는 노드 아래에 AI 답을 가지로 붙이기',
          '체크박스 자동 체크 — "끝난 항목 체크해 줘"',
        ],
        more: 'AI 연동 자세히 보기',
        guide: '07. AI 생성 · 12. AI 커넥터(MCP)',
      },
      edit: {
        title: '맵 만들기와 편집',
        lead: '노드를 더하고 옮기고 꾸미는, 매일 쓰는 것들.',
        items: [
          '템플릿에서 시작 · 내 템플릿 등록',
          '노드 추가·삭제·복사·드래그 이동·크기 조절',
          '여러 노드 한 번에 추가 (들여쓰기로 계층까지)',
          '다중 선택 — 함께 옮기고 함께 크기 맞추기',
          '굵게·기울임·취소선·밑줄·형광펜 부분 강조',
          '도형·색·글꼴 — 레벨 정책 + 노드별 덮어쓰기',
        ],
        guide: '02. 맵 만들기 · 03. 노드 편집',
      },
      view: {
        title: '보기와 레이아웃',
        lead: '같은 내용을 여러 모습으로 봅니다.',
        items: [
          '레이아웃 7종 — 방사형·트리·계층형·진행트리·칸반·시간배치 등',
          '레벨별·서브트리별로 다른 레이아웃 섞기',
          '접기/펼치기 · 선택 노드 아래 모두 펼치기',
          '줌 · 화면 맞추기 · 중앙 보기',
          '아웃라인 분할 보기 · 아웃라인 ↔ 맵 전환',
          '다크 모드',
        ],
        guide: '04. 레이아웃과 보기',
      },
      attach: {
        title: '노드에 담는 것들',
        lead: '마인드맵이 문서를 대신할 수 있게 하는 부분입니다.',
        items: [
          '노트 — 문단 · 코드(언어 라벨·복사) · 표 격자 · 체크리스트',
          '하이퍼링크',
          '첨부파일 · 사진 (글 중간 위치까지 보존)',
          '태그',
          '노드 검색 — 제목과 맵 안 내용까지',
        ],
        guide: '05. 노트·링크·첨부·태그 · 06. 검색',
      },
      io: {
        title: '들어오고 나가기',
        lead: '갇히지 않습니다. 파일은 언제나 표준 Markdown 입니다.',
        items: [
          'Markdown 불러오기 — 견출·표·코드·체크리스트째',
          'Markdown 내보내기 (mmd) — 구조·내용·레이아웃 정책 왕복',
          'HTML 내보내기 — 인터넷 없이 열리는 뷰어 (접기·줌·검색 됨)',
          '클라우드 문서함 — 로그인하면 어디서나 이어서',
          '버전 기록과 되돌리기 · 오래 보관(별표)',
        ],
        guide: '08. 내보내기·불러오기 · 11. 버전 기록',
      },
      share: {
        title: '나누기',
        lead: '완성한 맵을 밖으로 보냅니다.',
        items: [
          '퍼블리싱 — 로그인 없이 열리는 링크',
          '비공개(보관) ↔ 무료공개 전환, 주소는 그대로',
          '링크 카드 — 카카오톡·슬랙에 붙이면 제목·소개·미리보기',
          '지식창고에 올리기 — 둘러보는 사람에게도 보인다',
        ],
        guide: '27-publish-share.md · 홈페이지 지식창고',
      },
    },
    ctaTitle: '직접 눌러 보는 편이 빠릅니다',
    ctaBody: '오른쪽 위 ‘EMM 로그인’을 누르면 로그인 화면이 열립니다. 회원은 로그인하고, 처음이라면 그 화면의 ‘Guest로 체험하기’로 가입 없이 바로 써 볼 수 있습니다.',
    ctaAi: 'AI 연동 보기',
  },

  ai: {
    eyebrow: 'AI 연동 — 커넥터(MCP)',
    title: <>AI 가 <b>내 맵의 맥락</b>으로 일합니다</>,
    lead: (
      <>
        일반 챗봇은 내가 무엇을 정리해 두었는지 모릅니다. EasyMindMap 을
        커넥터로 붙이면 AI 가 <b>내 문서함의 맵을 읽고</b>, 대화한 내용을
        <b> 그대로 맵으로 남기고</b>, 원하는 노드 아래에 가지를 붙입니다.
      </>
    ),
    principlesTitle: '우리가 정한 것 넷',
    principles: [
      {
        title: '① 맵은 대화의 부산물이 아니라 결과물이다',
        body: (
          <>
            대화는 스크롤과 함께 사라집니다. 그래서 AI 의 답을 <b>지금 열려 있는
            맵의, 지금 고른 노드 아래</b>에 남길 수 있게 했습니다. 다음 대화에서
            AI 는 그 맵을 다시 읽고 이어 갑니다.
          </>
        ),
      },
      {
        title: '② AI 가 다루는 것은 표준 텍스트다',
        body: (
          <>
            AI 에게 전용 포맷을 가르치지 않습니다. 주고받는 것은 <b>mmd
            (Mindmap Markdown)</b> — 견출로 계층을 만드는 보통의 GFM 입니다. 선언이 없어도
            유효하므로, LLM 이 <b>평범한 Markdown 만 내놓아도</b> 맵이 됩니다.
          </>
        ),
      },
      {
        title: '③ 되돌릴 수 없는 것은 AI 에게 주지 않는다',
        body: (
          <>
            맵·계정을 <b>지우는 도구는 없습니다.</b> 있는 글을 고치거나 빼는
            도구도 두지 않았습니다. AI 가 바꿀 수 있는 것은 <b>덧붙이기</b>와
            <b> 체크박스 한 글자</b>뿐이고, 둘 다 버전으로 남아 앱에서 되돌립니다.
          </>
        ),
      },
      {
        title: '④ 새 규칙을 두 벌로 만들지 않는다',
        body: (
          <>
            커넥터의 도구는 앱이 쓰는 API 를 <b>얇게 감싼 것</b>입니다. 쿼터·권한·
            편집 잠금이 그대로 적용됩니다 — 남의 맵은 AI 에게도 보이지 않고,
            사람이 편집 중인 맵에는 AI 도 끼어들지 못합니다.
          </>
        ),
      },
    ],
    toolsTitle: 'AI 에게 열어 준 도구 여섯',
    toolsHead: { tool: '도구', say: '대화에서 이렇게 말하면', does: '하는 일' },
    tools: {
      create_map: { say: '“지금 내용 맵으로 저장해 줘”', does: <>대화 내용을 <b>새 맵</b>으로 문서함에 저장</> },
      append_to_map: { say: '“‘다음 회의 > 안건’ 아래에 붙여 줘”', does: <>그 노드 아래에 <b>가지를 덧붙임</b></> },
      get_map: { say: '“지난주 회의 맵 읽어 줘”', does: '맵 한 개를 mmd 로 읽음 (편집 잠금 안 만듦)' },
      list_maps: { say: '“기획 폴더에 뭐 있어?”', does: '내 맵·공유받은 맵 목록 (이름·폴더·수정일·노드 수)' },
      get_open_map: { say: '“지금 열려 있는 맵에”', does: '앱에서 보고 있는 맵과 고른 노드의 자리를 알려 줌' },
      check_items: { say: '“끝난 항목 체크해 줘”', does: <>체크박스만 체크/해제 (<code>[ ]</code> ↔ <code>[x]</code>)</> },
    },
    toolsNote: (
      <>
        맵 모양은 말로 정합니다 — “칸반으로”, “시간 순서로” 처럼 템플릿을 지정하면
        그대로 그립니다. 클라이언트는 붙을 때마다 도구 목록을 다시 읽으므로,
        도구가 늘어도 <b>커넥터를 다시 등록할 필요가 없습니다.</b>
      </>
    ),
    connectTitle: '어떻게 붙이나 — 두 갈래',
    connectLead: (
      <>
        <b>“둘 중에 고른다” 는 말이 오해를 낳습니다.</b> 고르는 것은 사용자가
        아니라 <b>클라이언트</b>입니다. claude.ai 채팅창에는 토큰을 넣을 칸이
        아예 없고, Claude Code 에는 로그인 버튼이 없습니다. 쓰는 자리에 맞는
        쪽으로 붙이면 되고, <b>둘 다 켜 두어도 서로 방해하지 않습니다.</b>
      </>
    ),
    connectHead: { item: '항목', chat: 'claude.ai 채팅창', chatSub: '(커스텀 커넥터)', code: 'Claude Code', codeSub: '(터미널 · 웹)' },
    connectRows: [
      { label: '인증 방식', chat: 'OAuth — 로그인 버튼', code: <>PAT — <code>emm_…</code> 토큰 원문</> },
      { label: '내가 붙여넣는 것', chat: '주소 한 줄', code: '주소 + 토큰' },
      { label: '열쇠 수명', chat: '짧고 자동 갱신', code: <><b>무기한</b> — 만료가 없다</> },
      { label: '토큰이 새면', chat: '곧 만료된다', code: <>앱에서 <b>[폐기]</b> 해야 멈춘다</> },
      { label: '끊는 곳', chat: 'claude.ai 커넥터 화면', code: '앱 ▸ 🔌 AI 커넥터(MCP)' },
      { label: '어울리는 자리', chat: '평소 대화하며 정리할 때', code: '코드·문서 작업과 함께 쓸 때' },
    ],
    connectNote: (
      <>
        <b>보안에서 실제로 다른 것은 하나</b>입니다 — 토큰(PAT)에는 만료가
        없습니다. 새어 나간 토큰은 사람이 폐기를 누르기 전까지 계속 유효하므로,
        공용 PC 에서 썼다면 쓰고 나서 앱에서 폐기하세요. OAuth 쪽에는 그 위험이
        구조적으로 없습니다.
      </>
    ),
    inAppTitle: '커넥터 없이도 — 앱 안의 AI',
    inApp: [
      {
        title: 'AI 생성',
        body: (
          <>
            앱에서 주제나 문서를 주면 가지를 펼쳐 줍니다. 커넥터를 붙이지 않아도
            되고, 결과는 <b>보통의 맵</b>이라 그대로 고쳐 쓰면 됩니다.
          </>
        ),
      },
      {
        title: 'Markdown 붙여넣기',
        body: (
          <>
            어떤 AI 가 내놓은 Markdown 이든 불러오면 맵이 됩니다 — 견출·표·코드·
            체크리스트째로. <b>연동을 지원하지 않는 AI 에도 길이 있습니다.</b>
          </>
        ),
      },
    ],
    ctaTitle: '대화 한 번으로 맵 하나',
    ctaBody: '앱에서 토큰을 발급하거나, 커넥터 주소를 등록하는 것으로 시작합니다.',
    ctaApp: '앱에서 커넥터 열기',
    ctaFunctions: '전체 기능 보기',
  },

  mmd: {
    siteUrl: 'https://www.mindmapmarkdown.org/ko/',
    badge: 'MMD Spec · Draft · 공개적으로 다듬는 중',
    heroTitle: <>인간과 AI가 같은 지식을<br />각자의 표현으로.</>,
    heroLead: (
      <>
        Mindmap Markdown은 인간과 AI가 같은 지식을 각자의 표현으로 다루기 위한
        <b> 왕복 안정(round-trip stable) 마크다운 프로파일</b>입니다.
        EasyMindMap은 이 표준을 따라 Markdown 글을 맵으로 펼치고, 다시 글로 되돌립니다.
      </>
    ),
    readSpec: '사양 읽기 →',
    vizAria: 'Markdown 글이 lift로 트리가 되고, projection으로 다시 글이 되는 그림',
    depth: {
      aria: '문서 계층이 깊어질수록 평문으로 볼 때 사람이 구조를 읽어내는 정도가 떨어지고, 트리로 볼 때는 유지된다는 개념도',
      x: '문서 계층 깊이 →',
      y: '구조를 읽어내는 정도 →',
      machine: '기계 · AI',
      tree: '사람 · 트리로 볼 때',
      plain: '사람 · 평문으로 볼 때',
      gap: 'Mindmap Markdown이 메우는 간극',
    },
    propsTitle: '문서 형식이 사람과 기계를 모두 감당하려면 네 가지가 필요합니다',
    propsSub: '마크다운은 앞의 셋을 만족합니다. 남은 하나는 문서가 얕을 때만 유지됩니다.',
    props: {
      open: { title: '공개 표준', desc: '누구나 쓰고 구현' },
      machine: { title: '기계 판독', desc: '파서가 정확히 해석' },
      ai: { title: 'AI 가독', desc: 'LLM이 그대로 읽음' },
    },
    human: { title: '사람 가독', desc: '문서가 얕을 때만', depth: ['● 깊이 1–2', '● 3–4', '● 5+'] },
    chartTitle: '계층이 깊어질수록 사람만 구조를 잃습니다',
    chartNote: '개념도 · 측정값 아님',
    roundTitle: <>트리로 그리는 것은 쉽습니다.<br />손실 없이 되돌리는 것이 어렵습니다.</>,
    roundBody: '계층이 깊어지면 사람은 평문에서 구조를 볼 수 없습니다. 같은 구조를 트리로 그리면 즉시 읽히는데도 말입니다. 그런데 LLM이 문서를 재작성하는 순간 아래 정보가 조용히 사라지며, 이를 문제로 다루는 표준은 아직 없습니다.',
    lostAria: 'LLM이 다시 쓸 때 사라지는 정보',
    lost: ['노드 정체성', '사람이 단 주석', '레이아웃', '검토 이력'],
    viewsTitle: '설치 없는 단일 HTML, 두 개의 뷰',
    viewsBody: 'Mindmap Markdown 문서는 아무것도 설치할 필요 없는 단일 HTML 파일로 렌더링되며, 그 뷰어는 마인드맵과 아웃라인 두 뷰를 함께 제공합니다. 어떤 단일 뷰도 모든 규모에서 작동하지 않기 때문입니다.',
    mindmap: { title: '마인드맵', desc: <>한눈에 보는 형태<br />깊이가 깊을 때 강함</> },
    outline: { title: '아웃라인', desc: <>탐색 가능한 순서<br />노드 수가 많을 때 강함</> },
    levelsTitle: '적합성 수준',
    levelsSub: '수준은 누적됩니다. 구현은 자신이 주장하는 가장 높은 수준을 밝힙니다.',
    levels: {
      L0: { desc: '적합한 문서는 평범한 마크다운입니다. 기존 모든 마크다운 도구에서 계층이 유지됩니다.', status: '모든 마크다운 도구' },
      L1: { desc: '문서 → 트리(lift), 트리 → 문서(canonical projection)가 하나씩 정해지며 서로 역함수입니다.', status: 'mindmapmd에서 구현' },
      L2: { desc: '트리 간 구조적 diff·merge, 문서 전체 없이 하위 트리 단위로 다루기.', status: '규칙 작성 전' },
    },
    source: (site, spec) => (
      <>
        출처: {site} 메인 페이지(2026-10-26 기준). 사양은 Draft 단계이므로 내용이 바뀔 수 있습니다.
        {' '}· {spec('사양 읽기 →')}
      </>
    ),
    principlesTitle: '설계 원칙',
    principles: [
      { title: '여전히 마크다운', desc: 'GitHub, Obsidian 등 지금 쓰는 편집기에서 그대로 열립니다. 도입 비용은 0에서 시작합니다.' },
      { title: '의미는 문서에, 표현은 옆에', desc: '레이아웃과 스타일은 sidecar에 두고, 모델에 보내는 텍스트에는 넣지 않습니다.' },
      { title: '검증 가능한 적합성', desc: '확인할 수 없는 사양은 제안일 뿐입니다. 사양과 테스트는 같은 소스에서 생성됩니다.' },
      { title: '경쟁보다 상호운용', desc: 'OPML, JSON Canvas, markmap 등 기존 형식용 어댑터를 먼저 만듭니다.' },
    ],
    reposTitle: '저장소',
    repos: {
      spec: { desc: '사양과 규범 예제', pill: '공개' },
      mindmapmd: { desc: '참조 구현: lift · canonical projection', pill: 'L1' },
      conformance: { desc: '테스트 스위트, 러너, 구현 레지스트리', pill: '예정' },
      adapters: { desc: 'OPML · JSON Canvas · markmap 상호운용', pill: '예정' },
    },
    ctaTitle: '지금이 반대 의견을 내기 가장 좋은 때입니다',
    ctaBody: '사양은 가장 초기이자 가장 바뀌기 쉬운 단계에 있습니다.',
    ctaDraft: '초안 읽기',
    ctaDiscuss: '질문 · 제안하기',
    ctaImplement: '독립 구현하기',
    footNote: (library, github) => (
      <>
        EasyMindMap에서 Markdown으로 내보낸 맵을 보고 싶다면 {library('지식창고 둘러보기')} ·
        {' '}표준 저장소 모음은 {github}
      </>
    ),
  },

  library: {
    title: '지식창고',
    intro: '저자가 공개한 맵을 둘러보세요. 로그인 없이 바로 열립니다.',
    searchPlaceholder: '맵 이름과 맵 안의 내용에서 찾기',
    searchAria: '지식창고에서 찾기',
    searchHint: <>이름뿐 아니라 <b>맵 안의 노드·노트·태그</b>까지 찾습니다.</>,
    emptyTitle: '아직 진열된 맵이 없습니다.',
    emptyBody: <>맵을 퍼블리싱한 뒤 <b>[지식창고에 올린다]</b> 를 켜면 여기에 나타납니다.</>,
    noResults: (q) => `“${q}” 로 찾은 맵이 없습니다.`,
    noResultsBody: '맵 이름과 맵 안의 내용을 모두 찾아본 결과입니다. 다른 말로 찾아보세요.',
    showAll: '전체 보기',
    openAria: (title) => `${title} — 새 탭에서 열기`,
    noPreview: '미리보기 없음',
    priceTitle: '유료 맵 — 미리보기는 2단계까지 보입니다',
    price: (amount) => `${amount}원`,
    nodes: (n) => `${n}노드`,
    likeAria: (n) => `좋아요 ${n}`,
    commentAria: (n) => `댓글 ${n}`,
    hitsTitle: (n) => `이 맵의 내용(노드·노트·태그)에서 ${n}건 찾았습니다`,
    hits: (n) => `내용 ${n}건`,
  },

  board: {
    docTitle: (board) => `게시판 · ${board} | EasyMindMap`,
    title: '게시판',
    intro: '사용 소감과 의견, 버그를 나눠 주세요. 읽기는 누구나, 글쓰기와 댓글은 회원만 할 수 있습니다.',
    names: { review: '사용 소감', free: '자유 의견', bug: '버그 리포트', notice: '공지사항' },
    noticesAria: '최근 공지사항',
    noticesLabel: '공지',
    pinned: '고정',
    tabsAria: '게시판 종류',
    searchPlaceholder: '제목과 내용에서 찾기',
    searchAria: (board) => `${board}에서 찾기`,
    write: '글쓰기 ↗',
    writeHint: '글쓰기와 댓글은 앱에 로그인한 회원만 할 수 있습니다. 버튼을 누르면 앱으로 이동합니다.',
    bugHint: (issues) => <>개발자라면 {issues}에도 남길 수 있습니다. 스크린샷에 개인정보가 보이지 않는지 확인해 주세요.</>,
    noResults: (q) => `“${q}” 로 찾은 글이 없습니다.`,
    empty: (board) => `아직 ${board} 글이 없습니다.`,
    firstPost: '첫 글을 남겨 주세요.',
    commentCountAria: (n) => `댓글 ${n}개`,
    hasPhotoAria: '사진 있음',
    postLoadFailed: '글을 불러오지 못했습니다.',
    notFound: '글을 찾을 수 없습니다. 삭제되었거나 숨겨진 글일 수 있습니다.',
    edited: ' (수정됨)',
    backToList: (board) => `← ${board} 목록`,
    photoAlt: '첨부 사진',
    externalPhoto: '외부 사진 보기',
    commentsAria: '댓글',
    commentsTitle: (n) => `댓글 ${n}`,
    writeComment: '댓글 쓰기 ↗',
    noComments: '아직 댓글이 없습니다.',
    moreComments: '댓글 더 보기',
    commentHint: '댓글은 앱에 로그인한 회원만 쓸 수 있습니다.',
    askText: '원하는 답을 찾지 못했나요? 개인적인 문의나 제휴 제안은 따로 보내 주세요.',
    askButton: '✉ 문의하기',
  },

  contact: {
    docTitle: '문의하기 | EasyMindMap',
    title: '문의하기',
    intro: '사용 방법, 오류, 요금, 제휴 등 궁금한 점을 남겨 주세요. 담당자가 확인한 뒤 입력하신 이메일로 답변드립니다.',
    doneTitle: '문의가 접수되었습니다.',
    doneBody: '확인한 뒤 입력하신 이메일로 답변드리겠습니다.',
    another: '다른 문의 쓰기',
    viewBoard: '게시판 보기',
    boardHint: (board) => <>사용 소감이나 버그는 {board('게시판')}에 남기시면 다른 사용자와 함께 볼 수 있습니다.</>,
    name: '이름',
    email: '회신받을 이메일',
    category: '문의 종류',
    choose: '골라 주세요',
    categories: { usage: '사용 방법', bug: '오류·버그', billing: '요금·결제', partnership: '제휴·협업', other: '기타' },
    body: '문의 내용',
    bodyHelp: (len, max, min, links) => `${len}/${max}자 · ${min}자 이상, 링크는 ${links}개까지`,
    honeypot: '웹사이트(비워 두세요)',
    consentLegend: '개인정보 수집·이용 동의 (필수)',
    consentItems: [
      '수집 항목: 이름, 이메일, 문의 내용',
      '이용 목적: 문의 답변',
      '보관 기간: 처리 완료 후 1년',
      '동의하지 않으면 문의를 보낼 수 없습니다.',
    ],
    consentAgree: '위 내용에 동의합니다.',
    errors: {
      nameRequired: '이름을 입력해 주세요.',
      nameTooLong: (max) => `이름은 ${max}자까지 쓸 수 있습니다.`,
      emailInvalid: '회신받을 이메일 주소를 정확히 입력해 주세요.',
      categoryRequired: '문의 종류를 골라 주세요.',
      bodyTooShort: (min) => `문의 내용을 ${min}자 이상 적어 주세요.`,
      bodyTooLong: (max) => `문의 내용은 ${max}자까지 쓸 수 있습니다.`,
      tooManyLinks: (max) => `링크는 ${max}개까지 넣을 수 있습니다.`,
      consentRequired: '개인정보 수집·이용에 동의해 주세요.',
    },
    captchaFirst: '아래 스팸 방지 확인을 마친 뒤 보내 주세요.',
    captchaTitle: '스팸 방지 확인을 먼저 마쳐 주세요',
    tooMany: (minutes) => `문의가 너무 잦습니다. ${minutes ? `${minutes}분 ` : '잠시 '}뒤에 다시 보내 주세요.`,
    sendFailed: '문의를 보내지 못했습니다.',
    sending: '보내는 중…',
    send: '문의 보내기',
    turnstileFailed: '스팸 방지 확인 도구를 불러오지 못했습니다. 광고 차단 프로그램을 끄거나 잠시 뒤 새로고침해 주세요.',
    turnstileLanguage: 'ko',
  },
};

export default ko;
