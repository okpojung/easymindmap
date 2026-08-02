// apply-schema — schema.sql 을 DATABASE_URL 의 DB 에 적용한다.
//
// 배포가 "코드는 자동(Coolify) · 스키마는 수동" 구조라 스키마 변경이
// 누락되기 쉽다(2026-08-02 B8 배포에서 제기). schema.sql 을 **단일
// 기준**으로 두고 이 스크립트로 재적용하면 드리프트가 생기지 않는다.
//
//   npm run db:apply                    # DATABASE_URL 사용
//   DATABASE_URL=postgres://... npm run db:apply
//
// 모든 DDL 이 IF NOT EXISTS / DROP-CREATE 라 **몇 번 실행해도 안전**하다.
// 이미 있는 객체로 인한 오류(42P07 중복 테이블, 42710 중복 객체,
// publication 중복 등)는 정상으로 보고 넘어가며, 그 외 오류만 실패로
// 취급한다.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const HERE = dirname(fileURLToPath(import.meta.url));
const files = [
  join(HERE, '..', 'database', 'schema.sql'),
  join(HERE, '..', 'database', 'functions', 'move_node_subtree.sql'),
];

// "이미 있음" 계열 — 재적용 시 정상
const BENIGN = new Set(['42P07', '42710', '42P06', '42723', '42P16']);
const BENIGN_MSG = /already exists|already a member|already member/i;

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL 이 필요합니다. 예: DATABASE_URL=postgres://user:pw@host:5432/db npm run db:apply');
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });
await client.connect();

let applied = 0;
let skipped = 0;
for (const file of files) {
  let sql;
  try {
    sql = readFileSync(file, 'utf-8');
  } catch {
    console.log(`(건너뜀 — 파일 없음) ${file}`);
    continue;
  }
  // 파일 전체를 한 번에 보내면 앞부분 오류로 뒤가 통째로 죽는다.
  // 세미콜론 기준으로 문장을 나눠 하나씩 적용하고, "이미 있음"만 넘긴다.
  // (달러 인용 $$…$$ 함수 본문은 분할하지 않도록 보호)
  const statements = splitStatements(sql);
  for (const stmt of statements) {
    if (!stmt.trim()) continue;
    try {
      await client.query(stmt);
      applied++;
    } catch (err) {
      if (BENIGN.has(err.code) || BENIGN_MSG.test(err.message ?? '')) {
        skipped++;
        continue;
      }
      console.error(`\n✗ 실패한 문장:\n${stmt.slice(0, 200)}…\n  → [${err.code}] ${err.message}`);
      await client.end();
      process.exit(1);
    }
  }
  console.log(`✓ ${file.split('/').slice(-2).join('/')}`);
}

await client.end();
console.log(`\n스키마 적용 완료 — 실행 ${applied}건 · 이미 있음 ${skipped}건`);

/** 세미콜론으로 문장 분리 (달러 인용 블록·문자열·주석 보호) */
function splitStatements(sql) {
  const out = [];
  let buf = '';
  let i = 0;
  let dollarTag = null;
  let inLineComment = false;
  let inString = false;
  while (i < sql.length) {
    const ch = sql[i];
    const rest = sql.slice(i);
    if (inLineComment) {
      buf += ch;
      if (ch === '\n') inLineComment = false;
      i++;
      continue;
    }
    if (dollarTag) {
      if (rest.startsWith(dollarTag)) {
        buf += dollarTag;
        i += dollarTag.length;
        dollarTag = null;
        continue;
      }
      buf += ch; i++; continue;
    }
    if (inString) {
      buf += ch;
      if (ch === "'" && sql[i - 1] !== '\\') inString = false;
      i++;
      continue;
    }
    if (rest.startsWith('--')) { inLineComment = true; buf += ch; i++; continue; }
    if (ch === "'") { inString = true; buf += ch; i++; continue; }
    const dm = rest.match(/^\$[A-Za-z_]*\$/);
    if (dm) { dollarTag = dm[0]; buf += dollarTag; i += dollarTag.length; continue; }
    if (ch === ';') { out.push(buf); buf = ''; i++; continue; }
    buf += ch; i++;
  }
  if (buf.trim()) out.push(buf);
  return out;
}
