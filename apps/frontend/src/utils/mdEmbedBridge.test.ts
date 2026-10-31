// 맵 내장 마크다운 첨부 ↔ 웹 편집기 다리 (2026-10-31, e2e — test-catalog 「내장 MD 편집기」).
//   npx tsx src/utils/mdEmbedBridge.test.ts
import {
  createMdEmbedHandler, dataUrlText, embeddedAttachmentKey, embeddedMdEditorUrl,
  embedLimitError, EMBED_FILE_LIMIT, EMBED_MAP_LIMIT, markdownDataUrl,
} from './mdEmbedBridge';

let failed = 0;
const check = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : ` — 받음 ${JSON.stringify(got)}`}`);
};

// ① 주소 — 내장 md 는 src=opener, 토큰·att·api 없음
const key = embeddedAttachmentKey('node-1730-a1b2c3', 'att-1730-x9');
const u = new URL(embeddedMdEditorUrl(key, '회의록 #1 & 정리.md'), 'https://pro-dev.mindmap.ai.kr');
check('① 경로', u.pathname, '/md-editor/');
check('① src=opener', u.searchParams.get('src'), 'opener');
check('① key = 노드id~첨부id', u.searchParams.get('key'), 'node-1730-a1b2c3~att-1730-x9');
check('① name (#·& 가 쿼리를 깨지 않는다)', u.searchParams.get('name'), '회의록 #1 & 정리.md');
check('① 쿼리 키는 셋뿐 (att·api 없음)', [...u.searchParams.keys()], ['src', 'key', 'name']);
check('① 해시 없음 (토큰을 건네지 않는다)', u.hash, '');

// ② data URL ↔ 문자열 (UTF-8 · 한글 · 이모지 · BOM)
const text = '# 제목\n\n- 항목 ✅\n- emoji 🚀\n';
const enc = markdownDataUrl(text);
check('② MIME 기본 text/markdown', enc.url.startsWith('data:text/markdown;base64,'), true);
check('② size = UTF-8 바이트', enc.size, new TextEncoder().encode(text).length);
check('② 왕복', dataUrlText(enc.url), text);
check('② 원래 MIME 유지', markdownDataUrl('x', 'data:text/plain;base64,eA==').url.startsWith('data:text/plain;base64,'), true);
check('② 퍼센트 인코딩 data URL', dataUrlText('data:text/markdown,%23%20hi%20%ED%95%9C'), '# hi 한');
check('② BOM 제거', dataUrlText(markdownDataUrl('﻿# a').url), '# a');
check('② 깨진 data URL 은 null', dataUrlText('data:text/plain;base64,@@@'), null);
const big = 'a'.repeat(200_000) + '한';
check('② 큰 본문 왕복 (청크 btoa)', dataUrlText(markdownDataUrl(big).url) === big, true);

// ③ 한도 — 개당 2MB · 맵 합계 10MB (옛 내용 빼고 셈)
check('③ 한도 안', embedLimitError(1000, 500, 5_000_000), null);
check('③ 개당 초과', embedLimitError(EMBED_FILE_LIMIT + 1, 0, 0)?.includes('2MB'), true);
check('③ 합계 초과', embedLimitError(1_000_000, 0, EMBED_MAP_LIMIT - 500_000)?.includes('10MB'), true);
check('③ 옛 내용을 빼고 센다 (줄이면 통과)', embedLimitError(800_000, 900_000, EMBED_MAP_LIMIT - 100), null);

// ④ 메시지 처리 — hello → load, save → saved
const ORIGIN = 'https://pro-dev.mindmap.ai.kr';
let stored = '# 원본';
let ro = false;
const sent: { msg: Record<string, unknown>; to: string }[] = [];
const source = { postMessage: (msg: unknown, to: string) => { sent.push({ msg: msg as Record<string, unknown>, to }); } };
const h = createMdEmbedHandler({
  key, origin: ORIGIN,
  read: () => stored,
  readOnly: () => ro,
  write: (md) => {
    const err = embedLimitError(new TextEncoder().encode(md).length, 0, 0);
    if (err) return { ok: false, error: err };
    stored = md; return { ok: true };
  },
});
const ev = (data: unknown, origin = ORIGIN) => ({ origin, data, source });

h(ev({ type: 'mde:hello', key }));
check('④ hello → load', sent.at(-1)?.msg, { key, type: 'mde:load', markdown: '# 원본', readOnly: false });
check('④ targetOrigin = 앱 origin (* 아님)', sent.at(-1)?.to, ORIGIN);

h(ev({ type: 'mde:save', key, markdown: '# 고침', reqId: 7 }));
check('④ save → 맵에 반영', stored, '# 고침');
check('④ save → saved ok', sent.at(-1)?.msg, { key, type: 'mde:saved', reqId: 7, ok: true });

const n0 = sent.length;
h(ev({ type: 'mde:hello', key }, 'https://evil.example'));
h(ev({ type: 'mde:save', key, markdown: 'x', reqId: 1 }, 'https://evil.example'));
check('④ 다른 origin 은 무시 (답 없음·저장 없음)', [sent.length - n0, stored], [0, '# 고침']);
h(ev({ type: 'mde:hello', key: 'other~key' }));
check('④ 다른 키는 무시', sent.length - n0, 0);
h(ev(null)); h(ev('mde:hello'));
check('④ 모양이 틀린 메시지 무시', sent.length - n0, 0);

ro = true;
h(ev({ type: 'mde:hello', key }));
check('④ 읽기 전용 → load.readOnly', sent.at(-1)?.msg.readOnly, true);
h(ev({ type: 'mde:save', key, markdown: '# 몰래', reqId: 8 }));
check('④ 읽기 전용 save → ok:false · 맵 그대로', [sent.at(-1)?.msg.ok, stored, typeof sent.at(-1)?.msg.error], [false, '# 고침', 'string']);
ro = false;

h(ev({ type: 'mde:save', key, markdown: 'a'.repeat(EMBED_FILE_LIMIT + 1), reqId: 9 }));
const over = sent.at(-1)?.msg;
check('⑤ 한도 초과 save → ok:false + 한국어 이유', [over?.type, over?.reqId, over?.ok, String(over?.error).includes('2MB')], ['mde:saved', 9, false, true]);
check('⑤ 한도 초과면 맵 그대로', stored, '# 고침');

h(ev({ type: 'mde:save', key, reqId: 10 }));
check('⑤ markdown 없는 save → ok:false', sent.at(-1)?.msg.ok, false);

stored = null as unknown as string;
const n1 = sent.length;
const h2 = createMdEmbedHandler({ key, origin: ORIGIN, read: () => null, readOnly: () => false, write: () => ({ ok: true }) });
h2(ev({ type: 'mde:hello', key }));
check('⑥ 첨부가 사라졌으면 load 를 보내지 않는다', sent.length - n1, 0);

console.log(failed ? `\n${failed} FAIL` : '\n모두 통과');
if (failed) process.exit(1);
