import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { appBoardUrl, boardPath, normalizeBoard, validateInquiry, inquiryPayload, countLinks, BOARDS, safeLinkHref, boardAttachmentId } from '../src/community-rules.js';

const ok = { name: '홍길동', email: 'a@example.com', category: 'usage', body: '사용 방법을 알고 싶습니다. 맵을 공유하려면 어떻게 하나요?', privacyConsent: true, website: '' };

test('게시판 종류 4개와 알 수 없는 값 처리', () => {
  assert.deepEqual(BOARDS.map(b => b.id), ['review', 'free', 'bug', 'notice']);
  assert.equal(normalizeBoard('x'), 'review');
  assert.equal(normalizeBoard('bug'), 'bug');
});

test('앱 링크는 계약 §1 형식이고 from=www 를 붙이지 않음', () => {
  assert.equal(appBoardUrl('free', { write: true }), 'https://web.easymindmap.org/?board=free&write=1');
  assert.equal(appBoardUrl('review', { post: 'abc' }), 'https://web.easymindmap.org/?board=review&post=abc#comments');
  assert.equal(appBoardUrl('notice', { write: true }), 'https://web.easymindmap.org/?board=notice');
  assert.doesNotMatch(appBoardUrl('bug', { write: true }), /from=www/);
});

test('www 게시판 주소', () => {
  assert.equal(boardPath('bug', { post: 'p1' }), '/board?b=bug&post=p1');
  assert.equal(boardPath('free', { q: '회의' }), '/board?b=free&q=%ED%9A%8C%EC%9D%98');
});

test('문의 입력 검사', () => {
  assert.equal(validateInquiry(ok), null);
  assert.equal(validateInquiry({ ...ok, name: ' ' }).field, 'name');
  assert.equal(validateInquiry({ ...ok, email: 'x@' }).field, 'email');
  assert.equal(validateInquiry({ ...ok, category: '' }).field, 'category');
  assert.equal(validateInquiry({ ...ok, body: '짧음' }).field, 'body');
  assert.equal(validateInquiry({ ...ok, body: ok.body + ' https://a.com https://b.com www.c.com' }).field, 'body');
  assert.equal(validateInquiry({ ...ok, privacyConsent: false }).field, 'privacyConsent');
  assert.equal(countLinks('http://a https://b www.c'), 3);
});

test('문의 요청 본문은 계약 §3 필드 그대로', () => {
  const p = inquiryPayload({ ...ok, name: ' 홍길동 ' }, 123);
  assert.deepEqual(Object.keys(p).sort(), ['body', 'category', 'email', 'formOpenedAt', 'name', 'privacyConsent', 'website']);
  assert.equal(p.name, '홍길동');
  assert.equal(p.website, '');
  assert.equal(p.formOpenedAt, 123);
  assert.equal(p.privacyConsent, true);
});

test('www 는 인증 정보를 보내지 않고, 헤더에 게시판, 하단에 문의하기 버튼', () => {
  const api = readFileSync(new URL('../src/community-api.ts', import.meta.url), 'utf8');
  assert.match(api, /credentials: 'omit'/);
  assert.doesNotMatch(api, /Authorization|x-admin-token/i);
  const tpl = readFileSync(new URL('../src/redesign/template.html', import.meta.url), 'utf8');
  assert.match(tpl, /<a href="\/board">게시판<\/a>/);
  const nav = tpl.slice(tpl.indexOf('<nav class="nav"'), tpl.indexOf('</nav>', tpl.indexOf('<nav class="nav"')));
  assert.doesNotMatch(nav, /\/contact/);
  assert.match(tpl, /<a class="footer-contact" href="\/contact">/);
  const contact = readFileSync(new URL('../src/pages/Contact.tsx', import.meta.url), 'utf8');
  assert.match(contact, /className="cm-hp" aria-hidden="true"/);
  assert.match(contact, /tabIndex=\{-1\}/);
  const board = readFileSync(new URL('../src/pages/Board.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(board, /dangerouslySetInnerHTML/);
  const md = readFileSync(new URL('../src/pages/BoardMarkdown.tsx', import.meta.url), 'utf8');
  assert.match(md, /skipHtml/); assert.doesNotMatch(md, /rehype-raw|dangerouslySetInnerHTML/);
  assert.match(md, /noopener noreferrer nofollow/);
});

test('본문 링크는 http(s)·mailto 만', () => {
  assert.equal(safeLinkHref('https://www.easymindmap.org'), 'https://www.easymindmap.org/');
  assert.equal(safeLinkHref('mailto:a@b.c'), 'mailto:a@b.c');
  assert.equal(safeLinkHref('javascript:alert(1)'), null);
  assert.equal(safeLinkHref('data:text/html,x'), null);
  assert.equal(safeLinkHref('/relative'), null);
});

test('사진은 같은 API 의 게시판 첨부 주소만', () => {
  const api = 'https://api-dev.mindmap.ai.kr';
  assert.equal(boardAttachmentId(api + '/v1/board/attachments/587a500d-038e', api), '587a500d-038e');
  assert.equal(boardAttachmentId('https://evil.example/v1/board/attachments/x', api), null);
  assert.equal(boardAttachmentId(api + '/v1/board/attachments/x?track=1', api), null);
  assert.equal(boardAttachmentId(api + '/v1/maps/x', api), null);
});
