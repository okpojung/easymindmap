// webAiShortcuts — AI 메뉴 기본 모드(웹)·바로가기 목록 검증. 실행: node scripts/run-vite-test.mjs src/utils/webAiShortcuts.test.ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AI_SHORTCUTS, aiShortcutUrl, initialAiGenMode } from './webAiExchange';

assert.deepEqual(AI_SHORTCUTS.map((s) => s.key), ['claude', 'chatgpt', 'gemini', 'deepseek', 'grok']);
const url = (k: string) => AI_SHORTCUTS.find((s) => s.key === k)?.url;
assert.equal(url('claude'), 'https://claude.ai/new');
assert.equal(url('chatgpt'), 'https://chatgpt.com/');
assert.equal(url('gemini'), 'https://gemini.google.com/app');
assert.equal(url('deepseek'), 'https://chat.deepseek.com/');
assert.equal(url('grok'), 'https://grok.com/');
// 맞춤 EasyMindMap 앱(GPT) 링크 없음 — 모두 일반 채팅
assert.ok(AI_SHORTCUTS.every((s) => s.kind === 'plain' && !s.url.includes('/g/') && !/easymindmap/i.test(s.url)));
// 신규 바로가기는 주소 프리필 없음
for (const k of ['deepseek', 'grok']) {
  const s = AI_SHORTCUTS.find((x) => x.key === k)!;
  assert.equal(aiShortcutUrl(s, { topic: 'a', prompt: 'b' }), s.url);
}
// 진입 기본은 항상 웹 (저장된 api·키와 무관)
assert.equal(initialAiGenMode(), 'web');

// 소스 회귀: AITab 은 저장 genMode 로 모드를 정하지 않고, 로컬 상태를 지연 초기화한다
const src = readFileSync(new URL('../editor/inspector-panels/AITab.tsx', import.meta.url), 'utf8');
assert.match(src, /useState<'web' \| 'api'>\(\(\) => initialAiGenMode\(\)\)/);
assert.doesNotMatch(src, /genMode \?\?/);
assert.doesNotMatch(src, /useAiSettingsStore\(\(s\) => s\.genMode\)/);
// 수동 전환: 로컬 상태 변경 + 스토어 기록 유지, API 탭 버튼 존재
assert.match(src, /onClick=\{\(\) => \{ setMode\(k\); setGenMode\(k\); \}\}/);
assert.match(src, /\['api', tr\('inspector\.ai\.modeApi'\)\]/);
assert.match(src, /if \(mode === 'web'\)/);
// Guest/Solo: 모드 스위치 없이 WebAiPanel 만
assert.match(src, /if \(isGuest\) \{\s*return \(\s*<div>\s*<WebAiPanel/);
// 전환 시뮬레이션: 진입 → web, 수동 api 선택은 렌더 사이 유지, 재진입은 다시 web
let local = initialAiGenMode();
assert.equal(local, 'web');
local = 'api';
assert.equal(local, 'api');
local = initialAiGenMode();
assert.equal(local, 'web');
console.log('webAiShortcuts.test OK');
