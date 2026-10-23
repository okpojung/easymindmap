// 프로젝트 태그 줄 MD 왕복 단위 테스트 (2026-10-23).
//
// 노드에 켜 둔 일정·담당자·진척율이 제목 아래 `📅 … · @담당자 · 35%` 한 줄로 나가고,
// 불러오면 같은 프로젝트 태그로 돌아오는지, 그리고 보통 글은 건드리지 않는지 지킨다.

import { parseEmm } from '../src/parse';
import { buildEmmBody } from '../src/serialize';
import { parseProjectLine, projectLine } from '../src/project-line';
import type { MindNode, SampleMap } from '../src/model';

let failed = 0;
function check(name: string, got: unknown, want: unknown): void {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  const ok = g === w;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      받음 ${g}\n      기대 ${w}`}`);
}
const OPT = { blockPlacement: 'node' as const };

// ① 줄 만들기
check('① 세 가지 모두', projectLine({ dateOn: true, start: '2026-10-01', end: '2026-10-31', assigneeOn: true, assignee: { name: '정미옥', email: 'miok@example.com' }, progressOn: true, progress: 35 }),
  '📅 2026-10-01 ~ 2026-10-31 · @정미옥 <miok@example.com> · 35%');
check('① 하루짜리·마감만', [projectLine({ dateOn: true, start: '2026-10-01', end: '2026-10-01' }), projectLine({ dateOn: true, end: '2026-10-31' })],
  ['📅 2026-10-01', '📅 ~ 2026-10-31']);
check('① 체크를 끈 값은 싣지 않는다', projectLine({ dateOn: false, start: '2026-10-01', assigneeOn: false, assignee: { name: '정미옥' }, progressOn: true, progress: 0 }), '0%');
check('① 보일 게 없으면 null', [projectLine(undefined), projectLine({ dateOn: true }), projectLine({ progressOn: true, progress: 150 })], [null, null, null]);
check('① 이름 속 구분 기호는 공백으로', projectLine({ assigneeOn: true, assignee: { name: '홍 · 길동 <x>' } }), '@홍 길동 x');

// ② 줄 읽기
check('② 세 가지', parseProjectLine('📅 2026-10-01 ~ 2026-10-31 · @정미옥 <miok@example.com> · 35%'),
  { start: '2026-10-01', end: '2026-10-31', dateOn: true, assignee: { name: '정미옥', email: 'miok@example.com' }, assigneeOn: true, progress: 35, progressOn: true });
check('② 앱 태그 모양 %35·담당자만', [parseProjectLine('%35'), parseProjectLine('@Kim Lee')],
  [{ progress: 35, progressOn: true }, { assignee: { name: 'Kim Lee' }, assigneeOn: true }]);
check('② 보통 글은 null', [
  parseProjectLine('회의는 10월에 · 담당 미정'),
  parseProjectLine('📅 2026-13-01'),
  parseProjectLine('📅 2026-10-31 ~ 2026-10-01'),
  parseProjectLine('35% · 📅 2026-10-01'),
  parseProjectLine('200%'),
  parseProjectLine('@'),
  parseProjectLine('📅 2026-10-01 ~'),
  parseProjectLine('📅 다음 주'),
], [null, null, null, null, null, null, null, null]);

// ③ 왕복 — 견출 노드·리스트 노드·루트
const P1 = { dateOn: true, start: '2026-10-01', end: '2026-10-31', assigneeOn: true, assignee: { name: '정미옥', email: 'miok@example.com' }, progressOn: true, progress: 35 };
const P2 = { progressOn: true, progress: 100 };
const P3 = { dateOn: true, end: '2026-12-31' };
const map: SampleMap = {
  title: '프로젝트',
  root: { id: 'root', text: '프로젝트', colorKey: 'root', side: 'center', project: P3 } as SampleMap['root'],
  branches: [
    { id: 'a', text: '설계', project: P1, links: [{ id: 'l', url: 'https://example.com', label: '문서' }],
      children: [{ id: 'a1', text: '화면 설계', mdForm: 'list', project: P2 } as MindNode, { id: 'a2', text: '보통 하위' } as MindNode] } as MindNode,
    { id: 'b', text: '개발' } as MindNode,
  ],
};
const md = buildEmmBody(map, []);
check('③ 줄이 제목 아래에 나간다', md.split('\n').filter((l) => /📅|%$/.test(l)),
  ['📅 ~ 2026-12-31', '📅 2026-10-01 ~ 2026-10-31 · @정미옥 <miok@example.com> · 35%', '100%']);
const back = parseEmm(md, 'mindmap', OPT)!;
const proj = (n: MindNode | undefined) => n?.project ?? null;
check('③ 루트', back.root.project ?? null, { end: '2026-12-31', dateOn: true });
check('③ 견출 노드', proj(back.branches[0] as MindNode), { start: '2026-10-01', end: '2026-10-31', dateOn: true, assignee: { name: '정미옥', email: 'miok@example.com' }, assigneeOn: true, progress: 35, progressOn: true });
check('③ 링크도 그대로', (back.branches[0] as MindNode).links?.map((l) => l.url), ['https://example.com']);
check('③ 구조 그대로(줄이 자식 노드가 되지 않는다)', [back.branches.length, (back.branches[0] as MindNode).children?.map((c) => c.text)], [2, ['화면 설계', '보통 하위']]);
check('③ 리스트 노드', proj((back.branches[0] as MindNode).children?.[0]), { progress: 100, progressOn: true });
check('③ 태그 없는 노드는 그대로', [proj((back.branches[0] as MindNode).children?.[1]), proj(back.branches[1] as MindNode)], [null, null]);
check('③ 두 번 왕복해도 같은 MD', buildEmmBody(back, []), md);

// ④ 남의 문서 — 견출 아래 보통 문단은 예전처럼 자식 노드
const plain = parseEmm('# 루트\n\n## 가지\n\n일정은 다음 주 · 담당 미정\n', 'mindmap', OPT)!;
check('④ 보통 문단은 자식 노드', [proj(plain.branches[0] as MindNode), (plain.branches[0] as MindNode).children?.map((c) => c.text)], [null, ['일정은 다음 주 · 담당 미정']]);

if (failed) { console.log(`\n${failed}개 실패`); process.exit(1); }
console.log('\nproject-line: 모두 통과');
