/**
 * 홈페이지 공통 문구(템플릿 밖 — 컨트롤러·React 머리말·꼬리말·체험 편집기).
 * 언어별 HTML 템플릿에 들어 있는 문구는 여기에 두지 않는다.
 * 빠진 언어·키는 영어 → 한국어 순으로 대신 쓴다.
 */
import type { Lang } from './i18n';
import type { HeroVideoText } from './redesign/hero-video';
import { CURRENT_LANG } from './i18n';
import ko from './redesign/template.html?raw';
import en from './redesign/template.en.html?raw';
import ja from './redesign/template.ja.html?raw';
import zh from './redesign/template.zh.html?raw';
import questionVideoCoverUrl from './redesign/question-video-cover.jpg';
import koFlagUrl from './redesign/flags/kr.svg';
import enFlagUrl from './redesign/flags/us.svg';
import jaFlagUrl from './redesign/flags/jp.svg';
import zhFlagUrl from './redesign/flags/cn.svg';
import jaStrings from './i18n/strings.ja.json';
import zhStrings from './i18n/strings.zh.json';
import type { Guide } from './redesign/content';
import { GUIDES_EN } from './redesign/guides.en';
import { GUIDES_JA } from './redesign/guides.ja';
import { GUIDES_ZH } from './redesign/guides.zh';

/** 안내 글(질문하는 힘·브랜드 스토리 등) 번역 — 없는 글은 한국어 원문을 보여 준다 (3단계에서 채운다) */
export const GUIDES_BY_LANG: Partial<Record<Lang, Record<string, Guide>>> = { en: GUIDES_EN, ja: GUIDES_JA, zh: GUIDES_ZH };

/** Header flags are local SVG assets, not platform-dependent flag emoji or a runtime CDN. */
const withTemplateAssets = (html: string): string => html
  .replace('__QUESTION_VIDEO_COVER__', questionVideoCoverUrl)
  .split('__HERO_VIDEO_SRC__').join(import.meta.env.BASE_URL + 'hero-media/v3/emm-hero-v3-ko.mp4')
  .split('__HERO_VIDEO_POSTER__').join(import.meta.env.BASE_URL + 'hero-media/v3/poster.jpg')
  .replace(/__HERO_CAPTIONS_(KO|EN|JA|ZH)__/g, (_, lang: string) => import.meta.env.BASE_URL + 'hero-media/v3/captions.' + lang.toLowerCase() + '.vtt')
  .split('__LANG_FLAG_KO__').join(koFlagUrl)
  .split('__LANG_FLAG_EN__').join(enFlagUrl)
  .split('__LANG_FLAG_JA__').join(jaFlagUrl)
  .split('__LANG_FLAG_ZH__').join(zhFlagUrl);
export const TEMPLATES: Partial<Record<Lang, string>> = {
  ko: withTemplateAssets(ko), en: withTemplateAssets(en), ja: withTemplateAssets(ja), zh: withTemplateAssets(zh),
};

/** 번역 JSON 의 `{n}` 자리표시 문구를 함수로 바꾼다 (maxNodes·maxLevels·nodeCount) */
type DemoStrings = Record<string, string | ((n: number) => string)>;
function demoFromJson(raw: Record<string, string>): DemoStrings {
  const out: DemoStrings = {};
  for (const [k, v] of Object.entries(raw)) out[k] = v.includes('{n}') ? (n: number) => v.split('{n}').join(String(n)) : v;
  return out;
}
export function templateFor(lang: Lang): string { return TEMPLATES[lang] ?? TEMPLATES.en ?? ko; }

export interface SiteText {
  menuOpen: string; menuClose: string; homeTitle: string; homeDescription: string; backHome: string;
  loading: string; footerCore: string; footerStandard: string; footerContact: string; titleSuffix: string;
}

const TEXT: Partial<Record<Lang, SiteText>> = {
  ja: jaStrings.site,
  zh: zhStrings.site,
  ko: {
    menuOpen: '메뉴 열기', menuClose: '메뉴 닫기',
    homeTitle: 'EasyMindMap | AI가 답하는 시대, 질문이 나의 힘.',
    homeDescription: '질문을 펼치고 연결하며 다음 질문을 찾아가는 작업 공간. Markdown과 마인드맵을 EasyMindMap에서 만나 보세요.',
    backHome: '첫 화면으로', loading: '불러오는 중…',
    footerCore: 'EasyMindMap GitHub', footerStandard: 'MindMap Markdown GitHub', footerContact: '✉ 문의하기',
    titleSuffix: ' | EasyMindMap',
  },
  en: {
    menuOpen: 'Open menu', menuClose: 'Close menu',
    homeTitle: 'EasyMindMap | AI answers. Questions are your power.',
    homeDescription: 'A workspace for expanding and connecting your questions to find the next one. Meet Markdown and mind maps in EasyMindMap.',
    backHome: 'Back to home', loading: 'Loading…',
    footerCore: 'EasyMindMap GitHub', footerStandard: 'MindMap Markdown GitHub', footerContact: '✉ Contact us',
    titleSuffix: ' | EasyMindMap',
  },
};

export function siteText(lang: Lang = CURRENT_LANG): SiteText {
  return TEXT[lang] ?? TEXT.en ?? (TEXT.ko as SiteText);
}

/** 체험 편집기 문구 (outline-demo.js 의 DEMO_TEXT 키) — 한국어는 그 파일의 기본값 */
export const DEMO_TEXT_BY_LANG: Partial<Record<Lang, Record<string, string | ((n: number) => string)>>> = {
  ja: demoFromJson(jaStrings.demo),
  zh: demoFromJson(zhStrings.demo),
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
  ja: jaStrings.presets,
  zh: zhStrings.presets,
  en: {
    questions: '# Does our team need AI?\n## What are we trying to solve?\n- What is most inconvenient right now?\n- What result do we want to change?\n## What is the evidence?\n- What facts have we actually checked?\n- What have we not verified yet?\n## Is there another view?\n- What work does not need AI?\n- What are the costs and risks?',
    meeting: '# Team meeting next week\n## To discuss\n- Direction of the new homepage\n- User feedback\n## To decide\n- What to do first\n- Who is responsible\n## To record\n- Decisions made\n- Next meeting date',
    study: '# The book I read today\n## Key ideas\n- The author’s argument\n- Examples to remember\n## My questions\n- Why would that be?\n- Is there another view?\n## To apply\n- A small action for today\n- Parts to reread',
    travel: '# Weekend trip\n## To pack\n- Charger\n- Comfortable shoes\n## To do\n- Walk on the beach\n- Try local restaurants\n## Places to go\n- A seaside town\n- A mountain trail',
  },
};

/** The audio is Korean in every locale. Only the captions are translated. */
const HERO_VIDEO_TEXT: Record<Lang, HeroVideoText> = {
 ko: { play: '재생', pause: '일시정지', enableSound: '소리 켜기', mute: '음소거', captions: '자막', ready: '소리 없이 자동 재생됩니다.', playing: '영상 재생 중', paused: '영상이 일시정지되었습니다. 재생 버튼으로 계속할 수 있습니다.', restricted: '동작 줄이기 또는 데이터 절약 설정에 따라 미리보기만 표시합니다. 재생을 누르면 영상을 불러옵니다.', blocked: '자동 재생이 차단되었습니다. 재생 버튼을 눌러 시작하세요.', failed: '영상을 재생할 수 없어 미리보기를 표시합니다. 재생 버튼으로 다시 시도하세요.', captionFailed: '자막을 불러오지 못했습니다. 자막 버튼으로 다시 시도할 수 있습니다.' },
 en: { play: 'Play', pause: 'Pause', enableSound: 'Enable sound', mute: 'Mute', captions: 'Captions', ready: 'Plays automatically without sound.', playing: 'Video playing', paused: 'Video paused. Press Play to continue.', restricted: 'Preview only because reduced motion or data saving is enabled. Press Play to load the video.', blocked: 'Autoplay was blocked. Press Play to start.', failed: 'The video could not play. The preview is shown. Press Play to retry.', captionFailed: 'Captions could not load. Use the Captions button to retry.' },
 ja: { play: '再生', pause: '一時停止', enableSound: '音声をオン', mute: 'ミュート', captions: '字幕', ready: '音声なしで自動再生します。', playing: '動画を再生中', paused: '一時停止中です。再生ボタンで続けられます。', restricted: '動きを減らす設定またはデータ節約設定のため、プレビューのみ表示しています。再生を押すと動画を読み込みます。', blocked: '自動再生がブロックされました。再生ボタンを押してください。', failed: '動画を再生できないため、プレビューを表示しています。再生ボタンで再試行できます。', captionFailed: '字幕を読み込めませんでした。字幕ボタンで再試行できます。' },
 zh: { play: '播放', pause: '暂停', enableSound: '开启声音', mute: '静音', captions: '字幕', ready: '默认静音自动播放。', playing: '视频播放中', paused: '视频已暂停。按播放继续。', restricted: '已启用减少动态效果或节省流量，仅显示预览。按播放加载视频。', blocked: '自动播放被阻止。请按播放开始。', failed: '无法播放视频，现显示预览。按播放重试。', captionFailed: '字幕加载失败。可使用字幕按钮重试。' },
};
export function heroVideoText(lang: Lang = CURRENT_LANG): HeroVideoText { return HERO_VIDEO_TEXT[lang]; }
