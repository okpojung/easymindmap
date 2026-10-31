// 첨부 내용 덮어쓰기 `PUT /v1/attachments/:id/content` (2026-10-31).
//
//   npm run build && npm run test:attachment-content
//
// 진짜 Nest HTTP 서버를 띄워 **원래 바이트 본문**이 전역 json 파서(25mb)와
// 부딪치지 않는지, CORS preflight 가 PUT + Content-Type + If-Match 를
// 통과하는지까지 본다. DB·저장소는 메모리 가짜다 — 판정 SQL 의 결과
// (`can_write`)를 가짜 DB 가 흉내 내므로 **SQL 자체**는 여기서 시험하지
// 않는다(CI 스모크가 진짜 DB 로 돈다).
//
// 확인: 200 · 403 · 404 · 409 · 413(쿼터 · 크기) · 415(첨부 형식 · 요청 형식) · 400(If-Match 형식)

import 'reflect-metadata';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AttachmentsController } from '../dist/attachments/attachments.controller.js';
import { AttachmentsService } from '../dist/attachments/attachments.service.js';
import { ChunkUploadService } from '../dist/attachments/chunk-upload.service.js';
import { StorageService } from '../dist/storage/storage.service.js';
import { DatabaseService } from '../dist/database/database.service.js';
import { corsOptions } from '../dist/common/cors.js';
import { isEditableText, isTextContentType, parseIfMatch, editedMime } from '../dist/attachments/content-edit.js';

let failed = 0;
function check(name, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  const ok = g === w; if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      받음 ${g}\n      기대 ${w}`}`);
}
const sha = (s) => createHash('sha256').update(s).digest('hex');

// ── 순수 판정 ───────────────────────────────────────────────────────
check('편집 대상: .md / .markdown / .txt / text/* mime',
  [isEditableText('a.md', 'application/octet-stream'), isEditableText('a.MARKDOWN', ''),
   isEditableText('a.txt', null), isEditableText('noext', 'text/csv'), isEditableText('a.pdf', 'application/pdf')],
  [true, true, true, true, false]);
check('요청 형식: text/* 만',
  [isTextContentType('text/markdown; charset=utf-8'), isTextContentType('text/plain'),
   isTextContentType('application/json'), isTextContentType(undefined), isTextContentType('textx/plain')],
  [true, true, false, false, false]);
const H = sha('x');
check('If-Match 해석', [parseIfMatch(undefined), parseIfMatch('*'), parseIfMatch(`"sha256:${H}"`),
  parseIfMatch(`W/"sha256:${H.toUpperCase()}"`), parseIfMatch('"abc"')], [null, null, H, H, 'invalid']);
check('mime 보정: .md → text/markdown, .txt 는 원래 text/* 유지',
  [editedMime('a.md', 'application/octet-stream'), editedMime('a.txt', 'text/plain'), editedMime('a.txt', '')],
  ['text/markdown', 'text/plain', 'text/plain']);

// ── 가짜 DB · 저장소 ────────────────────────────────────────────────
const OWNER = '11111111-1111-1111-1111-111111111111';
const EDITOR = '22222222-2222-2222-2222-222222222222';
const VIEWER = '33333333-3333-3333-3333-333333333333';
const STRANGER = '44444444-4444-4444-4444-444444444444';
const MD = 'aaaaaaaa-0000-4000-8000-000000000001';
const PDF = 'aaaaaaaa-0000-4000-8000-000000000002';
const MISSING = 'aaaaaaaa-0000-4000-8000-00000000ffff';

const files = new Map();
const rows = new Map();
let quotaBytes = 10 * 1024 * 1024;
function reset() {
  files.clear(); rows.clear(); quotaBytes = 10 * 1024 * 1024;
  files.set('u/o/md', Buffer.from('# 원본\n'));
  files.set('u/o/pdf', Buffer.from('%PDF-1.4'));
  rows.set(MD, { name: '메모.md', mime: 'application/octet-stream', size_bytes: String(files.get('u/o/md').length), storage_key: 'u/o/md', owner_id: OWNER });
  rows.set(PDF, { name: 'a.pdf', mime: 'application/pdf', size_bytes: '8', storage_key: 'u/o/pdf', owner_id: OWNER });
}
// 협업맵: OWNER 가 주인, EDITOR 편집, VIEWER 열람
const ROLE = { [OWNER]: 'owner', [EDITOR]: 'editor', [VIEWER]: 'viewer' };

const fakeDb = {
  async query(sql, params = []) {
    if (sql.includes('to_regclass')) return { rows: [{ ok: true }] };
    if (sql.includes('AS can_write')) {
      const [id, user] = params;
      const r = rows.get(id);
      if (!r || !ROLE[user]) return { rows: [] };
      return { rows: [{ ...r, can_write: ROLE[user] !== 'viewer' }] };
    }
    if (sql.includes('quota_bytes')) {
      let fileBytes = 0; for (const r of rows.values()) fileBytes += Number(r.size_bytes);
      return { rows: [{ db_bytes: '0', file_bytes: String(fileBytes), quota_bytes: String(quotaBytes), plan: 'free' }] };
    }
    if (sql.startsWith('UPDATE public.attachments')) {
      const [id, size, mime] = params;
      Object.assign(rows.get(id), { size_bytes: String(size), mime });
      return { rows: [] };
    }
    throw new Error(`예상 밖 SQL: ${sql.slice(0, 60)}`);
  },
};
const fakeStorage = {
  async put(key, data) { files.set(key, Buffer.from(data)); },
  async stream(key) { return Readable.from([files.get(key)]); },
  async delete(key) { files.delete(key); },
};
const env = { AUTH_MODE: 'dev', DEV_USER_ID: OWNER, ATTACHMENT_MAX_MB: 1 };
const fakeConfig = { get: (k) => env[k] };

class TestModule {}
Module({
  controllers: [AttachmentsController],
  providers: [
    AttachmentsService,
    { provide: ChunkUploadService, useValue: {} },
    { provide: StorageService, useValue: fakeStorage },
    { provide: DatabaseService, useValue: fakeDb },
    { provide: ConfigService, useValue: fakeConfig },
  ],
})(TestModule);

const ORIGIN = 'http://localhost:5173';
const app = await NestFactory.create(TestModule, { logger: false });
app.useBodyParser('json', { limit: '25mb' });       // main.ts 와 같게 — 충돌이 없어야 한다
app.setGlobalPrefix('v1');
app.enableCors(corsOptions(`${ORIGIN},https://pro-dev.example.com`));
await app.listen(0, '127.0.0.1');
const BASE = `http://127.0.0.1:${app.getHttpServer().address().port}/v1`;

async function put(id, body, { user = OWNER, type = 'text/markdown; charset=utf-8', ifMatch } = {}) {
  const res = await fetch(`${BASE}/attachments/${id}/content`, {
    method: 'PUT',
    headers: { 'x-user-id': user, ...(type ? { 'Content-Type': type } : {}), ...(ifMatch ? { 'If-Match': ifMatch } : {}) },
    body,
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

try {
  // ── 200 ──
  reset();
  const v1 = '# 고친 내용\n한글 ✓\n';
  let r = await put(MD, v1, { ifMatch: `"sha256:${sha('# 원본\n')}"` });
  check('200: 주인 · If-Match 일치 → 응답 모양', r,
    { status: 200, body: { id: MD, name: '메모.md', mime: 'text/markdown', sizeBytes: Buffer.byteLength(v1), sha256: sha(v1) } });
  check('200: 같은 storage_key 에 바이트가 그대로 저장', files.get('u/o/md').toString('utf8'), v1);
  check('200: size_bytes·mime 갱신', [rows.get(MD).size_bytes, rows.get(MD).mime], [String(Buffer.byteLength(v1)), 'text/markdown']);

  r = await put(MD, 'editor 가 씀', { user: EDITOR, type: 'text/plain' });
  check('200: 편집 참가자 · If-Match 없음 → 그대로 덮어씀', [r.status, files.get('u/o/md').toString()], [200, 'editor 가 씀']);

  // ── 409 ──
  r = await put(MD, '늦게 온 저장', { ifMatch: `"sha256:${sha(v1)}"` });
  check('409: 원본이 이미 바뀜 → { error, currentSha256 }',
    [r.status, r.body?.error, r.body?.currentSha256], [409, 'conflict', sha('editor 가 씀')]);
  check('409: 덮어쓰지 않았다', files.get('u/o/md').toString(), 'editor 가 씀');

  r = await put(MD, 'x', { ifMatch: '"not-a-sha"' });
  check('400: If-Match 형식이 틀림', r.status, 400);

  // ── 403 / 404 ──
  r = await put(MD, '열람자', { user: VIEWER });
  check('403: 읽기만 참가자', [r.status, files.get('u/o/md').toString()], [403, 'editor 가 씀']);
  r = await put(MD, '남', { user: STRANGER });
  check('404: 볼 수 없는 사람', r.status, 404);
  r = await put(MISSING, '없음');
  check('404: 없는 첨부', r.status, 404);

  // ── 415 ──
  r = await put(PDF, 'pdf 에 텍스트');
  check('415: 텍스트가 아닌 첨부(.pdf)', [r.status, files.get('u/o/pdf').toString()], [415, '%PDF-1.4']);
  r = await put(MD, JSON.stringify({ a: 1 }), { type: 'application/json' });
  check('415: 본문 형식이 text/* 가 아님(json 파서가 삼키기 전에 거절)', r.status, 415);
  r = await put(MD, 'raw', { type: 'application/octet-stream' });
  check('415: application/octet-stream', r.status, 415);

  // ── 413 ──
  reset();
  quotaBytes = Number(rows.get(MD).size_bytes) + 8 + 5;   // 지금 쓰는 양 + 5바이트 여유
  r = await put(MD, '# 원본\n' + 'x'.repeat(6));           // 6바이트 늘어남 → 초과
  check('413: 늘어난 만큼이 쿼터를 넘음', [r.status, files.get('u/o/md').toString()], [413, '# 원본\n']);
  r = await put(MD, '# 원본\n' + 'x'.repeat(5));           // 딱 맞음
  check('200: 늘어난 만큼이 쿼터 안', r.status, 200);
  r = await put(MD, '줄임');                                // 줄어들면 검사하지 않는다
  check('200: 줄어드는 저장은 쿼터를 보지 않는다', r.status, 200);

  reset();
  r = await put(MD, 'y'.repeat(1024 * 1024 + 1));
  check('413: ATTACHMENT_MAX_MB(1MB) 초과', [r.status, files.get('u/o/md').toString()], [413, '# 원본\n']);
  r = await put(MD, 'y'.repeat(1024 * 1024));
  check('200: 정확히 1MB 는 통과', r.status, 200);

  // ── CORS preflight ──
  const pre = await fetch(`${BASE}/attachments/${MD}/content`, {
    method: 'OPTIONS',
    headers: {
      Origin: ORIGIN,
      'Access-Control-Request-Method': 'PUT',
      'Access-Control-Request-Headers': 'authorization,content-type,if-match',
    },
  });
  const allowHeaders = (pre.headers.get('access-control-allow-headers') || '').toLowerCase();
  check('CORS preflight: 204 · 출처 · PUT · content-type/if-match/authorization 허용',
    [pre.status, pre.headers.get('access-control-allow-origin'),
     (pre.headers.get('access-control-allow-methods') || '').includes('PUT'),
     ['authorization', 'content-type', 'if-match'].every((h) => allowHeaders.includes(h)),
     pre.headers.get('access-control-allow-credentials')],
    [204, ORIGIN, true, true, 'true']);
} finally {
  await app.close();
}

console.log(failed ? `\n${failed}건 실패` : '\n전부 통과');
process.exit(failed ? 1 : 0);
