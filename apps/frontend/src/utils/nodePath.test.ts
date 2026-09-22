// nodePath 단위 테스트 (2026-09-22) — 연결선 선언의 from/to 경로 ↔ 노드 id.
//   npx tsx src/utils/nodePath.test.ts
import { findNodeIdByPath, nodePathOf, pathSegment } from './nodePath';
import type { SampleMap } from '@/editor/__samples__/types';

let failed = 0;
function check(name: string, got: unknown, want: unknown): void {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  const ok = g === w;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      받음 ${g}\n      기대 ${w}`}`);
}

const map: SampleMap = {
  title: '테스트',
  root: { id: 'root', text: '2026\n테스트\n\n| a | b |\n| - | - |' },
  branches: [
    { id: 'b1', text: 'Topic 1', children: [{ id: 'b1-1', text: 'Sub  Topic\n둘째 줄' }, { id: 'b1-2', text: 'A > B' }] },
    { id: 'b2', text: 'Topic 2', children: [{ id: 'b2-1', text: 'Sub Topic' }] },
    { id: 'b3', text: 'Topic 2' },
  ],
  centers: [{ root: { id: 'c2', text: '둘째 중심' }, branches: [{ id: 'c2-b1', text: '가지' }] }],
} as unknown as SampleMap;

check('① pathSegment — 첫 줄 · 공백 정리 · > 치환', pathSegment('  A >  B\n둘째'), 'A ＞ B');
check('② 루트 경로 — 여러 줄을 한 줄로, 표 블록은 뺀다 (mmd `# 제목` 과 같다)', nodePathOf(map, 'root'), '2026 테스트');
check('② 가지는 첫 비지 않은 줄만', pathSegment('\n\n첫 줄\n둘째 줄'), '첫 줄');
check('② 코드 블록 앞까지만', pathSegment('```js\nx\n```', true), '');
check('② 하위 경로 (첫 줄만, 공백 하나로)', nodePathOf(map, 'b1-1'), '2026 테스트 > Topic 1 > Sub Topic');
check('② 둘째 중심의 가지', nodePathOf(map, 'c2-b1'), '둘째 중심 > 가지');
check('② 없는 id 는 null', nodePathOf(map, 'nope'), null);
check('③ 경로 → id', findNodeIdByPath(map, '2026 테스트 > Topic 1 > Sub Topic'), 'b1-1');
check('③ 여유 공백을 견딘다', findNodeIdByPath(map, ' 2026 테스트 >Topic 2> Sub Topic '), 'b2-1');
check('③ 같은 글이 둘이면 첫 번째', findNodeIdByPath(map, '2026 테스트 > Topic 2'), 'b2');
check('③ > 가 든 글은 ＞ 로', findNodeIdByPath(map, '2026 테스트 > Topic 1 > A ＞ B'), 'b1-2');
check('③ 둘째 중심', findNodeIdByPath(map, '둘째 중심 > 가지'), 'c2-b1');
check('③ 없는 경로는 null', findNodeIdByPath(map, '2026 테스트 > 없음'), null);
check('④ 왕복 — 모든 노드', ['root', 'b1', 'b1-1', 'b1-2', 'b2', 'b2-1', 'c2', 'c2-b1'].every((id) => findNodeIdByPath(map, nodePathOf(map, id)!) === id), true);

console.log(failed ? `\n${failed}건 실패` : '\n전부 통과');
process.exit(failed ? 1 : 0);
