/**
 * `/function` — **기능 소개**. 특장점(왜 좋은가)과 달리 **무엇이 있는가**를
 * 훑어보는 자리다 (2026-09-15 사용자 요청).
 *
 * ★ 출처는 **사용자 가이드**다. 가이드에 장이 있는 기능만 적는다 —
 *   "있으면 좋을 것" 을 적어 두면 손님이 찾다가 없다는 것을 알게 된다.
 *   묶음마다 `guide` 로 어느 장에서 왔는지 남긴다.
 *
 * ★ 늘리기 쉬우라고 데이터로 뺐다. 묶음을 더할 때 손대는 곳은 이 배열
 *   하나뿐이고, 화면은 개수를 세지 않는다.
 */
import { pageText, type FunctionGroupId } from '../i18n/pages';

export interface FunctionGroup {
  icon: string;
  title: string;
  /** 한 줄 요약 */
  lead: string;
  items: string[];
  /** 더 볼 곳 — 이 묶음이 따로 다룰 만큼 길 때 (예: AI) */
  more?: { label: string; to: string };
  /** 근거 가이드 장 (화면에 작게 표시한다) */
  guide: string;
}

/**
 * 묶음의 차례와 화면 쪽 값(아이콘·더 볼 곳). 글자는 `i18n/pages.*.tsx` 의
 * `functions.groups.<id>` 에 언어별로 있다 (2026-10-29 다국어).
 */
const GROUPS: { id: FunctionGroupId; icon: string; moreTo?: string }[] = [
  // ★ AI 묶음은 **무엇이 되는지**만 짧게 적는다. 어떻게 붙이는지와
  //   왜 그렇게 만들었는지는 `/ai` 가 따로 다룬다 (2026-09-15 사용자 결정).
  { id: 'ai', icon: '🤖', moreTo: '/ai' },
  { id: 'edit', icon: '✏️' },
  { id: 'view', icon: '🗺️' },
  { id: 'attach', icon: '📎' },
  { id: 'io', icon: '🔄' },
  { id: 'share', icon: '🌐' },
];

export const FUNCTIONS: FunctionGroup[] = GROUPS.map(({ id, icon, moreTo }) => {
  const g = pageText().functions.groups[id];
  return {
    icon,
    title: g.title,
    lead: g.lead,
    items: g.items,
    more: moreTo && g.more ? { label: g.more, to: moreTo } : undefined,
    guide: g.guide,
  };
});