// emm CLI — EMM(Markdown) ↔ 맵 JSON 변환·검증 도구.
//
//   npx tsx cli.ts convert <input.md>  [-o out.json]   MD → 맵 JSON
//   npx tsx cli.ts convert <input.json> [-o out.md]    맵 JSON → MD (메타 포함)
//   npx tsx cli.ts validate <input.md>                 EMM 유효성·요약 출력
//
// input.json 은 맵 JSON({title, root, branches}) 또는 내보낸 메타
// (MapFileMeta — {format:'easymindmap-map', map:{…}}) 둘 다 받는다.

import { readFileSync, writeFileSync } from 'node:fs';
import {
  parseEmm,
  serializeEmm,
  countMapNodes,
  decodeMetaBase64,
  MD_META_RE,
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
    const ser = serializeEmm(map);
    const out = outPath ?? input.replace(/\.json$/i, '.md');
    writeFileSync(out, ser.markdown);
    console.log(`${out} — ${countMapNodes(map)} nodes` +
      (ser.images.length ? ` (사진 ${ser.images.length}개는 data URL 원본이 메타에 보존됨)` : ''));
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
  const m = text.match(MD_META_RE);
  const meta = m ? decodeMetaBase64(m[2].replace(/[\r\n ]+/g, '')) : null;
  console.log('VALID (EMM-Basic) — 구조 파싱 성공');
  console.log(`  중심 주제: ${map.root.text}`);
  console.log(`  노드 수(본문): ${countMapNodes(map)}`);
  if (m && meta) {
    console.log('VALID (EMM-Full) — 메타데이터로 무손실 복원 가능');
    console.log(`  메타 노드 수: ${meta.nodeCount} · 내보낸 시각: ${meta.exportedAt}`);
  } else if (m) {
    console.log('WARN — 메타데이터 주석이 있으나 디코드 실패 (본문 폴백)');
  } else {
    console.log('INFO — 메타데이터 없음 (EMM-Basic 문서)');
  }
} else {
  usage();
}
