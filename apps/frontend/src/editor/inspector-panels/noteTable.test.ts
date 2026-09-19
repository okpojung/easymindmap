// 노트 표 블록 ↔ 표 팝업 변환 (2026-09-19).   npx tsx src/editor/inspector-panels/noteTable.test.ts

import { noteTableCells, noteTableFromMd, noteTableToMd } from './noteTable';
import { buildMdTable } from '@/editor/node-renderer/TableDialog';

let failed = 0;
function check(name: string, got: unknown, want: unknown): void {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      받음 ${JSON.stringify(got)}\n      기대 ${JSON.stringify(want)}`}`);
}

// ① 팝업 GFM → 노트 원문: 바깥 파이프 없음 · 장식 구분선 제거 · 첫 행 머리글
const md = buildMdTable(['항목', '값', '비고'], [['메모리', '32', 'DDR5'], ['디스크', '1', 'NVMe']]);
check('① 팝업 표 → 노트 원문 (줄=행 · " | "=열 · 구분선 없음)', noteTableFromMd(md),
  '항목 | 값 | 비고\n메모리 | 32 | DDR5\n디스크 | 1 | NVMe');

// ② 정렬 콜론이 있는 구분선은 남긴다 (내보내기가 정렬로 다시 쓴다)
const mdA = buildMdTable(['a', 'b', 'c'], [['1', '2', '3']], ['left', 'center', 'right']);
check('② 정렬 구분선은 남는다', noteTableFromMd(mdA), 'a | b | c\n:--- | :---: | ---:\n1 | 2 | 3');
check('② 정렬이 없으면 구분선이 없다', noteTableFromMd(buildMdTable(['a', 'b'], [['1', '2']], [null, null])), 'a | b\n1 | 2');

// ③ 셀 안의 | 는 \| 그대로 (노트 뷰어·뷰어·내보내기가 존중)
const mdP = buildMdTable(['식', '뜻'], [['a|b', '또는']]);
check('③ \\| 이스케이프 보존', noteTableFromMd(mdP), '식 | 뜻\na\\|b | 또는');
check('③ 그려 보일 셀은 | 로 풀린다', noteTableCells('식 | 뜻\na\\|b | 또는')?.rows, [['a|b', '또는']]);

// ④ 노트 원문 → 팝업 GFM (수정 모드) — 왕복이 같다
const note = '항목 | 값\n:--- | ---:\n메모리 | 32';
const back = noteTableToMd(note)!;
check('④ 노트 원문 → GFM 표 (정렬 포함)', back, '| 항목 | 값 |\n|:---|---:|\n| 메모리 | 32 |');
check('④ 왕복: GFM → 노트 원문이 원래와 같다', noteTableFromMd(back), note);
check('④ 옛 데이터(장식 구분선 |---|) 도 읽힌다', noteTableCells('a | b\n--- | ---\n1 | 2')?.rows, [['1', '2']]);

// ⑤ 표가 아닌 원문 — 빈 블록·한 줄 — 는 undefined (팝업은 빈 표로)
check('⑤ 빈 원문 → undefined', noteTableToMd(''), undefined);
check('⑤ 한 줄 → undefined', noteTableToMd('a | b'), undefined);
check('⑤ 셀 보기도 null', noteTableCells('그냥 글'), null);

// ⑥ 열 수가 들쭉날쭉한 옛 원문 — 머리글 열 수에 맞춘다
check('⑥ 모자란 셀은 빈 칸', noteTableCells('a | b | c\n1 | 2')?.rows, [['1', '2', '']]);

console.log(failed ? `\n${failed}개 실패` : '\n모두 통과');
if (failed) process.exit(1);
