/**
 * 홈페이지 React 하위 페이지(/function · /ai · /mmd · /library · /board · /contact) 문구 사전.
 *
 * ── 언어를 더하는 법 (예: 일본어) ─────────────────────────────────────────
 *   1. `pages.en.tsx` 를 복사해 `pages.ja.tsx` 를 만들고 `const ja: PageText = { … }` 로 이름을 바꾼다.
 *      (전부 채우기 어려우면 `PagePartial` 로 선언해 일부만 넣어도 된다 — 빠진 키는 영어 → 한국어로 채워진다.)
 *   2. 문자열 값만 번역한다. 키 이름·함수 인자·JSX 태그(<b>, <code>, <br />)·링크 함수 호출은 그대로 둔다.
 *      - `(n) => …` 처럼 함수인 값은 숫자·이름을 끼워 넣는 문장이다. 인자를 문장 안 알맞은 자리에 둔다.
 *      - `(link) => <>…{link('글자')}…</>` 는 링크가 든 문장이다. 링크 글자('글자')만 번역하고 호출은 남긴다.
 *   3. 아래 `DICTS` 에 `ja` 를 등록한다.
 *   4. `common.dateOptions` 는 그 언어에서 자연스러운 날짜 모양을 고른다(Intl.DateTimeFormat 옵션).
 *      `contact.turnstileLanguage` 는 Cloudflare Turnstile 언어 코드다(ja → 'ja', zh → 'zh-cn').
 * ───────────────────────────────────────────────────────────────────────────
 * 고르는 순서: 그 언어 → 영어 → 한국어, **키 하나씩** 합친다(배열·함수·JSX 는 통째로 바꾼다).
 * 언어는 페이지를 읽을 때 정해지므로(i18n.ts) 모듈 수준에서 한 번 읽어 두어도 된다.
 */
import type { ReactNode } from 'react';
import type { Lang } from '../i18n';
import { CURRENT_LANG, LANG_LOCALE } from '../i18n';
import type { BoardId, InquiryCategory } from '../community-rules';
import ko from './pages.ko';
import en from './pages.en';
import ja from './pages.ja';
import zh from './pages.zh';

/** 링크가 든 문장 — 화면 쪽이 링크(주소·새 창 여부)를 만들고, 사전은 링크 글자만 정한다 */
export type LinkFn = (text: string) => ReactNode;

export type FunctionGroupId = 'ai' | 'edit' | 'view' | 'attach' | 'io' | 'share';
export type AiToolName = 'create_map' | 'append_to_map' | 'get_map' | 'list_maps' | 'get_open_map' | 'check_items';
export type MmdLevelId = 'L0' | 'L1' | 'L2';
export type MmdRepoName = 'spec' | 'mindmapmd' | 'conformance' | 'adapters';

export interface PageText {
  /** 여러 페이지가 함께 쓰는 말 */
  common: {
    loading: string;
    more: string;
    retry: string;
    clearSearch: string;
    listLoadFailed: string;
    /** 게시판·지식창고 날짜 모양 (Intl.DateTimeFormat, 로캘은 LANG_LOCALE) */
    dateOptions: Intl.DateTimeFormatOptions;
  };
  /** api.ts · community-api.ts 가 던지는 오류 문장 (서버가 보낸 message 는 그대로 보인다) */
  api: {
    listedFailed: (status: number) => string;
    network: string;
    requestFailed: (status: number) => string;
  };
  /** /function */
  functions: {
    eyebrow: string;
    title: string;
    lead: ReactNode;
    /** 카드 아래 근거 장 앞에 붙는 말 ("가이드 07. …") */
    guidePrefix: string;
    groups: Record<FunctionGroupId, { title: string; lead: string; items: string[]; more?: string; guide: string }>;
    ctaTitle: string;
    ctaBody: string;
    ctaAi: string;
  };
  /** /ai */
  ai: {
    eyebrow: string;
    title: ReactNode;
    lead: ReactNode;
    principlesTitle: string;
    principles: { title: string; body: ReactNode }[];
    toolsTitle: string;
    toolsHead: { tool: string; say: string; does: string };
    tools: Record<AiToolName, { say: string; does: ReactNode }>;
    toolsNote: ReactNode;
    connectTitle: string;
    connectLead: ReactNode;
    connectHead: { item: string; chat: string; chatSub: string; code: string; codeSub: string };
    /** 표의 줄 — 순서: 인증 방식, 붙여넣는 것, 열쇠 수명, 토큰이 새면, 끊는 곳, 어울리는 자리 */
    connectRows: { label: string; chat: ReactNode; code: ReactNode }[];
    connectNote: ReactNode;
    inAppTitle: string;
    inApp: { title: string; body: ReactNode }[];
    ctaTitle: string;
    ctaBody: string;
    ctaApp: string;
    ctaFunctions: string;
  };
  /** /mmd */
  mmd: {
    /** mindmapmarkdown.org 의 그 언어 첫 화면 (없으면 영어 첫 화면) */
    siteUrl: string;
    badge: string;
    heroTitle: ReactNode;
    heroLead: ReactNode;
    readSpec: string;
    vizAria: string;
    depth: { aria: string; x: string; y: string; machine: string; tree: string; plain: string; gap: string };
    propsTitle: string;
    propsSub: string;
    props: Record<'open' | 'machine' | 'ai', { title: string; desc: string }>;
    human: { title: string; desc: string; depth: [string, string, string] };
    chartTitle: string;
    chartNote: string;
    roundTitle: ReactNode;
    roundBody: string;
    lostAria: string;
    lost: string[];
    viewsTitle: string;
    viewsBody: string;
    mindmap: { title: string; desc: ReactNode };
    outline: { title: string; desc: ReactNode };
    levelsTitle: string;
    levelsSub: string;
    levels: Record<MmdLevelId, { desc: string; status: string }>;
    /** 출처 줄 — site: mindmapmarkdown.org 링크(글자 고정), spec: 사양 링크 */
    source: (site: ReactNode, spec: LinkFn) => ReactNode;
    principlesTitle: string;
    principles: { title: string; desc: string }[];
    reposTitle: string;
    repos: Record<MmdRepoName, { desc: string; pill: string }>;
    ctaTitle: string;
    ctaBody: string;
    ctaDraft: string;
    ctaDiscuss: string;
    ctaImplement: string;
    /** 맨 아래 한 줄 — library: 지식창고 링크, github: GitHub 링크(글자 고정) */
    footNote: (library: LinkFn, github: ReactNode) => ReactNode;
  };
  /** /library */
  library: {
    title: string;
    intro: string;
    searchPlaceholder: string;
    searchAria: string;
    searchHint: ReactNode;
    emptyTitle: string;
    emptyBody: ReactNode;
    noResults: (q: string) => string;
    noResultsBody: string;
    showAll: string;
    openAria: (title: string) => string;
    noPreview: string;
    priceTitle: string;
    /** amount 는 이미 그 언어 숫자 모양으로 적힌 원화 금액 */
    price: (amount: string) => string;
    nodes: (n: number) => string;
    likeAria: (n: number) => string;
    commentAria: (n: number) => string;
    hitsTitle: (n: number) => string;
    hits: (n: number) => string;
  };
  /** /board */
  board: {
    docTitle: (board: string) => string;
    title: string;
    intro: string;
    /** 게시판 이름 — community-rules.js 의 BOARDS id 와 짝 */
    names: Record<BoardId, string>;
    noticesAria: string;
    noticesLabel: string;
    pinned: string;
    tabsAria: string;
    searchPlaceholder: string;
    searchAria: (board: string) => string;
    write: string;
    writeHint: string;
    /** issues: GitHub Issues 링크(글자 고정) */
    bugHint: (issues: ReactNode) => ReactNode;
    noResults: (q: string) => string;
    empty: (board: string) => string;
    firstPost: string;
    commentCountAria: (n: number) => string;
    hasPhotoAria: string;
    postLoadFailed: string;
    notFound: string;
    edited: string;
    backToList: (board: string) => string;
    photoAlt: string;
    externalPhoto: string;
    commentsAria: string;
    commentsTitle: (n: number) => string;
    writeComment: string;
    noComments: string;
    moreComments: string;
    commentHint: string;
    askText: string;
    askButton: string;
  };
  /** /contact (+ Turnstile) */
  contact: {
    docTitle: string;
    title: string;
    intro: string;
    doneTitle: string;
    doneBody: string;
    another: string;
    viewBoard: string;
    boardHint: (board: LinkFn) => ReactNode;
    name: string;
    email: string;
    category: string;
    choose: string;
    /** 문의 종류 — community-rules.js 의 INQUIRY_CATEGORIES id 와 짝 */
    categories: Record<InquiryCategory, string>;
    body: string;
    bodyHelp: (len: number, max: number, min: number, links: number) => string;
    honeypot: string;
    consentLegend: string;
    consentItems: string[];
    consentAgree: string;
    /** 입력 검사 문장 — community-rules.js 의 validateInquiry 와 같은 순서·같은 뜻 */
    errors: {
      nameRequired: string;
      nameTooLong: (max: number) => string;
      emailInvalid: string;
      categoryRequired: string;
      bodyTooShort: (min: number) => string;
      bodyTooLong: (max: number) => string;
      tooManyLinks: (max: number) => string;
      consentRequired: string;
    };
    captchaFirst: string;
    captchaTitle: string;
    tooMany: (minutes: number | null) => string;
    sendFailed: string;
    sending: string;
    send: string;
    turnstileFailed: string;
    turnstileLanguage: string;
  };
}

/** 일부만 번역한 사전 — 빠진 키는 영어 → 한국어로 채운다 */
export type PagePartial = { [K in keyof PageText]?: Partial<PageText[K]> };

const DICTS: Partial<Record<Lang, PageText | PagePartial>> = { ko, en, ja, zh };

const isPlain = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype
  && !('$$typeof' in v);

/** 뒤의 것이 앞의 것을 덮는다 — 평범한 객체만 안으로 들어가 합치고, 배열·함수·JSX 는 통째로 */
function merge<T>(base: T, over: unknown): T {
  if (!isPlain(base) || !isPlain(over)) return (over === undefined ? base : over) as T;
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(over)) out[k] = v === undefined ? out[k] : merge(out[k], v);
  return out as T;
}

const cache = new Map<Lang, PageText>();

export function pageText(lang: Lang = CURRENT_LANG): PageText {
  const hit = cache.get(lang);
  if (hit) return hit;
  let t = ko;
  if (lang !== 'ko') t = merge(t, DICTS.en);
  if (lang !== 'ko' && lang !== 'en') t = merge(t, DICTS[lang]);
  cache.set(lang, t);
  return t;
}

/** 날짜 — 한국어는 "2026. 10. 29." (예전 `${y}. ${m}. ${d}.` 와 같은 모양) */
export function formatDate(iso: string, lang: Lang = CURRENT_LANG): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat(LANG_LOCALE[lang], pageText(lang).common.dateOptions).format(d);
}

/** 숫자 — 한국어는 "12,000" */
export function formatNumber(n: number, lang: Lang = CURRENT_LANG): string {
  return n.toLocaleString(LANG_LOCALE[lang]);
}
