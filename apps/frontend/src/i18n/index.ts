// i18n — 화면 문자열 다국어 (B10, 2026-10-05 · docs/04-extensions/i18n.md).
//
// 지원 언어: 한국어(ko) · English(en) · 简体中文(zh) · 日本語(ja).
//
// ★ 이름이 `t` 가 아니라 `tr` 인 이유 — 컴포넌트 대부분이 이미 `t` 를
//   테마 토큰(`ThemeTokens`) 이름으로 쓴다. 겹치지 않게 번역은 `tr` 이다.
//
//   컴포넌트 안      const tr = useTr();   …   {tr('toolbar.export')}
//   컴포넌트 밖      import { tr } from '@/i18n';  tr('cloud.saved')   (부르는 순간의 언어)
//   값 끼워 넣기     tr('cloud.savedCount', { n: 3 })   ← 사전: '{n}개 저장했습니다'
//
// ★ 모듈 최상위 상수에서 tr() 을 부르지 않는다 — 그 순간의 언어로 굳어
//   언어를 바꿔도 따라오지 않는다. 함수 안(렌더·이벤트)에서 부른다.
//
// 언어를 정하는 순서 (i18n.md §1):
//   1. 사용자가 고른 값 (localStorage `emm.lang`)
//   2. 브라우저 언어 (`navigator.languages`) — ko/zh/ja 면 그 언어
//   3. 그 밖은 영어

import { useCallback } from 'react';
import { create } from 'zustand';
import { DICTS } from './dict';

export const LANGS = ['ko', 'en', 'zh', 'ja'] as const;
export type Lang = (typeof LANGS)[number];

/** 언어 고르기 목록 — 각 언어를 **그 언어로** 적는다 (못 읽는 사람도 자기 말은 찾는다) */
export const LANG_LABELS: Record<Lang, string> = {
  ko: '한국어',
  en: 'English',
  zh: '简体中文',
  ja: '日本語',
};

/** Intl 에 넘기는 지역 — 날짜·숫자 표기 */
export const LANG_LOCALE: Record<Lang, string> = {
  ko: 'ko-KR',
  en: 'en-US',
  zh: 'zh-CN',
  ja: 'ja-JP',
};

const KEY = 'emm.lang';

function isLang(v: unknown): v is Lang {
  return typeof v === 'string' && (LANGS as readonly string[]).includes(v);
}

/** 브라우저 언어 → 지원 언어 (없으면 영어) */
export function detectLang(langs: readonly string[] | undefined): Lang {
  for (const raw of langs ?? []) {
    const l = raw.toLowerCase();
    if (l.startsWith('ko')) return 'ko';
    if (l.startsWith('ja')) return 'ja';
    if (l.startsWith('zh')) return 'zh';
    if (l.startsWith('en')) return 'en';
  }
  return 'en';
}

function initialLang(): Lang {
  try {
    const saved = window.localStorage.getItem(KEY);
    if (isLang(saved)) return saved;
  } catch { /* 저장소를 못 쓰는 브라우저 — 감지로 간다 */ }
  if (typeof navigator === 'undefined') return 'ko';
  return detectLang(navigator.languages?.length ? navigator.languages : [navigator.language]);
}

interface LangState {
  lang: Lang;
  setLang: (l: Lang) => void;
}

function applyDocumentLang(l: Lang) {
  if (typeof document !== 'undefined') document.documentElement.lang = l;
}

export const useLangStore = create<LangState>((set) => ({
  lang: initialLang(),
  setLang: (lang) => {
    set({ lang });
    applyDocumentLang(lang);
    try { window.localStorage.setItem(KEY, lang); } catch { /* 무시 */ }
  },
}));
applyDocumentLang(useLangStore.getState().lang);

export type TrVars = Record<string, string | number>;

/** 사전 조회 — 그 언어 → 영어 → 한국어 → 키 그대로 */
export function translate(lang: Lang, key: string, vars?: TrVars): string {
  const s = DICTS[lang][key] ?? DICTS.en[key] ?? DICTS.ko[key] ?? key;
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m));
}

/**
 * 바깥 모듈의 사전을 더한다 — 유료 UI(`@pro`)처럼 코어 밖에서 빌드에
 * 얹히는 화면이 자기 영역(`pro.*`)을 가져온다. 코어 키를 덮어쓰지 않는다.
 */
export function registerDict(set: Record<Lang, Record<string, string>>): void {
  for (const l of LANGS) {
    for (const [k, v] of Object.entries(set[l] ?? {})) {
      if (!(k in DICTS[l])) DICTS[l][k] = v;
    }
  }
}

/** 컴포넌트 밖에서 — 부르는 순간의 언어로 */
export function tr(key: string, vars?: TrVars): string {
  return translate(useLangStore.getState().lang, key, vars);
}

/** 지금 언어 (컴포넌트 밖) */
export function currentLang(): Lang {
  return useLangStore.getState().lang;
}

/** 지금 언어의 Intl 지역 (컴포넌트 밖) — `toLocaleString(currentLocale())` */
export function currentLocale(): string {
  return LANG_LOCALE[useLangStore.getState().lang];
}

/** 컴포넌트 안 — 언어가 바뀌면 다시 그린다 */
export function useTr(): (key: string, vars?: TrVars) => string {
  const lang = useLangStore((s) => s.lang);
  return useCallback((key: string, vars?: TrVars) => translate(lang, key, vars), [lang]);
}

/** 컴포넌트 안 — 지금 언어 */
export function useLang(): Lang {
  return useLangStore((s) => s.lang);
}
