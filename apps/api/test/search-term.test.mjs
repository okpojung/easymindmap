// 검색어 다듬기 단위 테스트 (2026-09-17, `common/search-term.ts`).
//
//   npm run build && npm run test:search-term
//
// 왜 시험하나: 문서함 검색과 지식창고 검색이 **같은 한 벌**을 쓴다. 한쪽만
// 고쳐지는 일을 막으려고 규칙을 여기 모았고, 여기가 깨지면 두 검색이 함께
// 깨진다. 특히 제어문자 — **NUL 한 글자로 500 이 났다**(2026-09-17 실측,
// PostgreSQL 22021). 지식창고 검색은 비인증이라 누구나 보낼 수 있었다.
//
// 설계: docs/04-extensions/publish/27a-paid-publish.md §0.4 ⑵

import { searchTerm, likePattern, SEARCH_TERM_MAX } from '../dist/common/search-term.js';

let failed = 0;
function check(name, ok, detail = '') {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      ${detail}`}`);
}

const NUL = String.fromCharCode(0);

// ── ① 제어문자를 지운다 (500 의 원인) ────────────────────────
check('① NUL 이 사라진다', searchTerm(`a${NUL}b`) === 'ab', JSON.stringify(searchTerm(`a${NUL}b`)));
check('① NUL 뿐이면 빈 말', searchTerm(NUL) === '');
check('① 줄바꿈·탭도 지운다', searchTerm('회\n의\t록') === '회의록', searchTerm('회\n의\t록'));
check('① DEL(0x7F) 도 지운다', searchTerm(`a${String.fromCharCode(127)}b`) === 'ab');
check('① 보통 글자는 그대로', searchTerm('회의 록 Deploy 3') === '회의 록 Deploy 3');

// ── ② 앞뒤 공백 · 빈 말 ──────────────────────────────────────
check('② 앞뒤 공백을 턴다', searchTerm('  회의  ') === '회의');
check('② 공백뿐이면 빈 말', searchTerm('   ') === '');
check('② 문자열이 아니면 빈 말',
  searchTerm(undefined) === '' && searchTerm(null) === '' && searchTerm(42) === ''
  && searchTerm({}) === '' && searchTerm(['회의']) === '');

// ── ③ 길이를 자른다 ─────────────────────────────────────────
check('③ 기본 상한은 100자', SEARCH_TERM_MAX === 100);
check('③ 300자를 넣으면 100자', searchTerm('가'.repeat(300)).length === 100);
check('③ 상한을 낮춰 부를 수 있다', searchTerm('abcdef', 3) === 'abc');
check('③ 자르기는 공백을 턴 **뒤**에 한다',
  searchTerm(`   ${'가'.repeat(120)}   `).length === 100);

// ── ④ ILIKE 패턴 문자를 막는다 ──────────────────────────────
check('④ 밑줄이 이스케이프된다', likePattern('a_b') === '%a\\_b%', likePattern('a_b'));
check('④ 퍼센트가 이스케이프된다', likePattern('50%') === '%50\\%%', likePattern('50%'));
check('④ 역슬래시 자신도 이스케이프된다', likePattern('a\\b') === '%a\\\\b%', likePattern('a\\b'));
check('④ 보통 말은 양쪽에 % 만 붙는다', likePattern('회의') === '%회의%');
check('④ 빈 말은 전체 패턴이 된다 — 부르는 쪽이 검색 안 함으로 걸러야 한다',
  likePattern('') === '%%');

// ── ⑤ 둘을 이어 쓰는 실제 흐름 ──────────────────────────────
{
  const raw = `  회의%${NUL}_록  `;
  const t = searchTerm(raw);
  check('⑤ 다듬은 뒤', t === '회의%_록', JSON.stringify(t));
  check('⑤ 패턴으로', likePattern(t) === '%회의\\%\\_록%', likePattern(t));
}

console.log(failed === 0 ? '\n전부 PASS' : `\n실패 ${failed}건`);
process.exit(failed ? 1 : 0);
