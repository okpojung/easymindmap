// mergeServerAppends 단위 테스트 (2026-09-05).
//
// 지키는 것: ① 서버에만 있는 노드는 **같은 부모 아래 맨 뒤**에, 서브트리째
// ② 로컬에만 있는 노드(내 편집)는 그대로 ③ 새 노드 아래의 새 노드도 서브트리째
// ④ 새 노드가 없으면 null(텍스트 수정 등은 이 함수의 몫이 아니다)
// ⑤ 최상위 가지도 붙는다 ⑥ 원본은 손대지 않는다.
//
//   npx tsx src/utils/mergeAppends.test.ts

import { mergeServerAppends } from './mergeAppends';
import type { MindNode, SampleMap } from '@/editor/__samples__/types';

let failed = 0;
function check(name: string, got: unknown, want: unknown): void {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  const ok = g === w;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      받음 ${g}\n      기대 ${w}`}`);
}
const n = (id: string, text: string, children: MindNode[] = []): MindNode => ({ id, text, children });
const map = (branches: MindNode[]): SampleMap => ({
  title: 'T', root: { id: 'root', text: 'T' } as SampleMap['root'], branches: branches as SampleMap['branches'],
});
const names = (nodes: MindNode[] | undefined): string[] => (nodes ?? []).map((x) => x.text);

// 로컬: 내가 '참고' 아래 '새 노드' 를 만들었다(저장 전). 서버: AI 가 '할 일' 아래 둘 붙였다.
const local = map([n('b1', '할 일', [n('c1', '문서 정리')]), n('b2', '참고', [n('c2', '링크'), n('local-1', '새 노드')])]);
const server = map([n('b1', '할 일', [n('c1', '문서 정리'), n('mcp-1', 'AI 가 붙임', [n('mcp-2', '하위')])]), n('b2', '참고', [n('c2', '링크')])]);

{
  const r = mergeServerAppends(local, server);
  check('① 같은 부모 아래 맨 뒤에, 서브트리째', names(r?.map.branches[0].children), ['문서 정리', 'AI 가 붙임']);
  check('① 하위까지', names(r?.map.branches[0].children[1].children), ['하위']);
  check('① 붙인 수(하위 포함)', r?.added, 2);
  check('② 내 편집(새 노드)은 그대로', names(r?.map.branches[1].children), ['링크', '새 노드']);
  check('⑥ 원본 로컬은 그대로', names(local.branches[0].children), ['문서 정리']);
}
{
  // ③ 부모가 로컬에 없는 새 노드 — 서버가 '참고' 를 지우고 새 가지 아래에 붙였다면 합치지 않는다
  const s2 = map([n('b1', '할 일'), n('b9', '새 가지', [n('mcp-3', 'x')])]);
  check('⑤ 최상위 새 가지는 붙는다', names(mergeServerAppends(local, s2)?.map.branches), ['할 일', '참고', '새 가지']);
  const s3 = map([n('b1', '할 일'), n('b2', '참고', [n('c2', '링크', [n('c3', '깊이', [n('mcp-4', 'y')])])])]);
  const r3 = mergeServerAppends(local, s3);
  check('③ 새 노드 아래의 새 노드는 서브트리째(아는 부모 c2 아래)', [names(r3?.map.branches[1].children[0].children), r3?.added], [['깊이'], 2]);
}
{
  // ④ 새 노드가 없으면 null — 이름만 바뀐 서버
  const s4 = map([n('b1', '할 일 (바뀜)', [n('c1', '문서 정리')]), n('b2', '참고', [n('c2', '링크')])]);
  check('④ 덧붙인 것이 없으면 null', mergeServerAppends(local, s4), null);
}
{
  // 루트 아래 + 깊은 곳 동시에
  const s5 = map([n('b1', '할 일', [n('c1', '문서 정리', [n('mcp-5', '깊이 붙임')])]), n('b2', '참고', [n('c2', '링크')]), n('mcp-6', '새 최상위')]);
  const r = mergeServerAppends(local, s5);
  check('여러 자리에 동시에', [names(r?.map.branches), names(r?.map.branches[0].children[0].children), r?.added],
    [['할 일', '참고', '새 최상위'], ['깊이 붙임'], 2]);
}

console.log(failed === 0 ? '\n모두 통과' : `\n실패 ${failed}건`);
process.exit(failed === 0 ? 0 : 1);
