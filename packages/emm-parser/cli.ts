// emm CLI — EMM(Markdown) ↔ 맵 JSON 변환·검증 도구.
//
//   npx tsx cli.ts convert <input.md>  [-o out.json]   MD → 맵 JSON
//   npx tsx cli.ts convert <input.json> [-o out.md]    맵 JSON → MD (본문만)
//   npx tsx cli.ts validate <input.md>                 EMM 유효성·요약 출력
//
// input.json 은 맵 JSON({title, root, branches}) 또는 HTML 내보내기의 메타
// (MapFileMeta — {format:'easymindmap-map', map:{…}}) 둘 다 받는다.
// MD 의 파일 끝 메타데이터 주석은 2026-09-15 폐기 — 쓰지도 읽지도 않는다.

import { readFileSync, writeFileSync } from 'node:fs';
import {
  parseEmm,
  buildEmmBody,
  countMapNodes,
  readDeclaration,
  type EmmImageFile,
  type EmmMap,
  type MapFileMeta,
} from './src/index';

function usage(): never {
  console.error(
    'usage:\n' +
    '  tsx cli.ts convert <input.md|input.json> [-o output]\n' +
    '  tsx cli.ts validate <input.md>',
  );
  process.exit(2);
}

const [, , cmd, input, ...rest] = process.argv;
if (!cmd || !input) usage();
const outIdx = rest.indexOf('-o');
const outPath = outIdx >= 0 ? rest[outIdx + 1] : undefined;

function loadMapFromJson(text: string): EmmMap {
  const data = JSON.parse(text) as EmmMap | MapFileMeta;
  if ((data as MapFileMeta).format === 'easymindmap-map') {
    return (data as MapFileMeta).map;
  }
  return data as EmmMap;
}

if (cmd === 'convert') {
  const text = readFileSync(input, 'utf-8');
  if (/\.json$/i.test(input)) {
    const map = loadMapFromJson(text);
    const images: EmmImageFile[] = [];
    const body = buildEmmBody(map, images);
    const out = outPath ?? input.replace(/\.json$/i, '.md');
    writeFileSync(out, body);
    console.log(`${out} — ${countMapNodes(map)} nodes` +
      (images.length ? ` (사진 ${images.length}개는 files/ 경로로 참조 — 바이트는 ZIP 패키징 몫)` : ''));
  } else {
    const map = parseEmm(text, input.replace(/.*\//, '').replace(/\.md$/i, ''));
    if (!map) { console.error('인식할 마인드맵 구조가 없습니다'); process.exit(1); }
    const out = outPath ?? input.replace(/\.md$/i, '.json');
    writeFileSync(out, JSON.stringify(map, null, 2) + '\n');
    console.log(`${out} — ${countMapNodes(map)} nodes`);
  }
} else if (cmd === 'validate') {
  const text = readFileSync(input, 'utf-8');
  const map = parseEmm(text, 'validate');
  if (!map) { console.error('INVALID — 인식할 마인드맵 구조가 없습니다'); process.exit(1); }
  const decl = readDeclaration(text);
  console.log('VALID (EMM-Basic) — 구조 파싱 성공');
  console.log(`  중심 주제: ${map.root.text}`);
  console.log(`  노드 수(본문): ${countMapNodes(map)}`);
  if (decl.map || decl.template || decl.levels) {
    console.log('INFO — ```emm 선언 있음' +
      (decl.map ? ` · map: ${decl.map}` : '') +
      (decl.template ? ` · template: ${decl.template}` : '') +
      (decl.levels ? ` · levels: ${Object.keys(decl.levels).join(',')}` : ''));
  } else {
    console.log('INFO — ```emm 선언 없음 (앱 기본 레이아웃으로 불러온다)');
  }
} else {
  usage();
}
