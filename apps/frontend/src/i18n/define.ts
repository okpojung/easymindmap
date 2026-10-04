// 사전 한 묶음 = 한 영역(namespace)의 네 언어.
//
// 한국어(ko)가 기준이다 — 키 목록은 ko 에서 정해지고, 나머지 언어는
// **같은 키를 전부** 가져야 타입 검사를 통과한다(`NoInfer`). 그래서
// "한국어에는 있는데 영어에는 없는 키" 가 빌드에서 막힌다 (i18n.md §3).

export type DictTable = Record<string, string>;

export interface DictSet<K extends string> {
  ko: Record<K, string>;
  en: Record<NoInfer<K>, string>;
  zh: Record<NoInfer<K>, string>;
  ja: Record<NoInfer<K>, string>;
}

export function defineDict<K extends string>(d: DictSet<K>): DictSet<K> {
  return d;
}
