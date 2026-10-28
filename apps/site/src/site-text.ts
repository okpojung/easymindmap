/**
 * 홈페이지 공통 문구(템플릿 밖 — 컨트롤러·React 머리말·꼬리말·체험 편집기).
 * 언어별 HTML 템플릿에 들어 있는 문구는 여기에 두지 않는다.
 * 빠진 언어·키는 영어 → 한국어 순으로 대신 쓴다.
 */
import type { Lang } from './i18n';
import { CURRENT_LANG } from './i18n';
import ko from './redesign/template.html?raw';
import en from './redesign/template.en.html?raw';
import type { Guide } from './redesign/content';

/** 안내 글(질문하는 힘·브랜드 스토리 등) 번역 — 없는 글은 한국어 원문을 보여 준다 (3단계에서 채운다) */
export const GUIDES_BY_LANG: Partial<Record<Lang, Record<string, Guide>>> = {};

export const TEMPLATES: Partial<Record<Lang, string>> = { ko, en };
export function templateFor(lang: Lang): string { return TEMPLATES[lang] ?? TEMPLATES.en ?? ko; }

export interface SiteText {
  menuOpen: string; menuClose: string; homeTitle: string; homeDescription: string; backHome: string;
  loading: string; footerCore: string; footerStandard: string; footerContact: string; titleSuffix: string;
}

const TEXT: Partial<Record<Lang, SiteText>> = {
  ko: {
    menuOpen: '메뉴 열기', menuClose: '메뉴 닫기',
    homeTitle: 'EasyMindMap | AI가 답하는 시대, 질문이 나의 힘.',
    homeDescription: '질문을 펼치고 연결하며 다음 질문을 찾아가는 작업 공간. Markdown과 마인드맵을 EasyMindMap에서 만나 보세요.',
    backHome: '첫 화면으로', loading: '불러오는 중…',
    footerCore: 'GitHub · EasyMindMap 오픈소스 코어 ↗', footerStandard: 'Mindmap Markdown 표준 ↗', footerContact: '✉ 문의하기',
    titleSuffix: ' | EasyMindMap',
  },
  en: {
    menuOpen: 'Open menu', menuClose: 'Close menu',
    homeTitle: 'EasyMindMap | AI answers. Questions are your power.',
    homeDescription: 'A workspace for expanding and connecting your questions to find the next one. Meet Markdown and mind maps in EasyMindMap.',
    backHome: 'Back to home', loading: 'Loading…',
    footerCore: 'GitHub · EasyMindMap open-source core ↗', footerStandard: 'Mindmap Markdown standard ↗', footerContact: '✉ Contact us',
    titleSuffix: ' | EasyMindMap',
  },
};

export function siteText(lang: Lang = CURRENT_LANG): SiteText {
  return TEXT[lang] ?? TEXT.en ?? (TEXT.ko as SiteText);
}

/** 체험 편집기 문구 (outline-demo.js 의 DEMO_TEXT 키) — 한국어는 그 파일의 기본값 */
export const DEMO_TEXT_BY_LANG: Partial<Record<Lang, Record<string, string | ((n: number) => string)>>> = {
  en: {
    rootDefault: 'My thought map', newThought: 'New thought', placeholder: 'Type here',
    maxNodes: (n: number) => 'The simple demo allows up to ' + n + ' nodes.', maxLevels: (n: number) => 'The simple demo allows up to ' + n + ' levels.',
    selectFirst: 'Please select a node first.', rootSibling: 'The central node cannot have a node at the same level.',
    totalLimit: 'You have reached the total input limit. Shorten some text before adding more.', editMissing: 'Could not find the node to edit.',
    textLimit: 'Input limit exceeded (10,000 characters per node, 60,000 in total). Your previous text was kept without cutting it.', deleteMissing: 'Could not find the node to delete.',
    notSaved: 'Changes are not saved or sent anywhere.', nodeCount: (n: number) => n + (n === 1 ? ' node' : ' nodes'),
    emptyOutline: 'Add a first node, or press Reset to load the default example.', firstAdd: 'Add first node', firstAddTitle: 'Add the first central node',
    rootLabel: 'Central node text', nodeLabel: 'Node text', childBtn: 'Child +', childTitle: 'Add a child node to this node', siblingBtn: 'Same +',
    siblingTitle: 'Add a node at the same level after this one', deleteBtn: 'Delete', deleteTitle: 'Delete this node and its children', emptyMap: 'Add a first node in the outline.',
    mapLabel: 'Thought map linked live to the outline', emptyNode: 'Empty node', addChildLabel: 'Add child node: ', addSiblingLabel: 'Add same-level node: ',
    loaded: 'Example loaded. Edits in the outline appear on the map right away.', resetDone: 'Reset done. Start again from the default example.',
    deleted: 'Deleted the selected node and its children.', added: 'Node added. Type its text.', edited: 'Your edit is shown on the map right away.',
  },
};

/** 체험 예시 맵 — 한국어는 demo.ts 의 PRESETS */
export const PRESETS_BY_LANG: Partial<Record<Lang, Record<string, string>>> = {
  en: {
    questions: '# Does our team need AI?\n## What are we trying to solve?\n- What is most inconvenient right now?\n- What result do we want to change?\n## What is the evidence?\n- What facts have we actually checked?\n- What have we not verified yet?\n## Is there another view?\n- What work does not need AI?\n- What are the costs and risks?',
    meeting: '# Team meeting next week\n## To discuss\n- Direction of the new homepage\n- User feedback\n## To decide\n- What to do first\n- Who is responsible\n## To record\n- Decisions made\n- Next meeting date',
    study: '# The book I read today\n## Key ideas\n- The author’s argument\n- Examples to remember\n## My questions\n- Why would that be?\n- Is there another view?\n## To apply\n- A small action for today\n- Parts to reread',
    travel: '# Weekend trip\n## To pack\n- Charger\n- Comfortable shoes\n## To do\n- Walk on the beach\n- Try local restaurants\n## Places to go\n- A seaside town\n- A mountain trail',
  },
};
