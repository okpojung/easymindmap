// 영역별 사전을 언어별 한 표로 합친다.
import type { DictTable } from '../define';
import common from './common';
import auth from './auth';
import cloud from './cloud';
import shell from './shell';
import editor from './editor';
import inspector from './inspector';
import io from './io';
import publish from './publish';
import panel from './panel';

const ALL = [common, auth, cloud, publish, shell, panel, editor, inspector, io];

function merge(lang: 'ko' | 'en' | 'zh' | 'ja'): DictTable {
  return Object.assign({}, ...ALL.map((d) => d[lang] as DictTable));
}

export const DICTS = {
  ko: merge('ko'),
  en: merge('en'),
  zh: merge('zh'),
  ja: merge('ja'),
};

/** 검사용 — 영역별 원본 (i18n.test.ts) */
export const DICT_SETS = { common, auth, cloud, publish, shell, panel, editor, inspector, io };
