// 여러 중심주제(centers) 단위 테스트 (2026-09-15, mmd 표준 세션 결정).
//
// 표준 트리의 뿌리는 보이지 않는 노드다 — `# 제목` 이 둘이면 뿌리 아래
// 형제가 둘이고, 화면은 중심주제가 둘인 한 장의 맵이다. 이 테스트가
// 지키는 것은 ① 두 번째 `#` 가 새 중심이 된다 ② 왕복해도 중심 수·가지 수가
// 그대로다 ③ 중심이 하나인 문서는 예전과 똑같다 — 세 가지다.

import { parseEmm } from '../src/parse';
import { buildEmmBody } from '../src/serialize';
import { countMapNodes } from '../src/meta';
import { mapCenters } from '../src/model';

let failed = 0;
function check(name: string, got: unknown, want: unknown): void {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) { console.log(`  ok  ${name}`); return; }
  failed++;
  console.log(`  FAIL ${name}\n       got  ${g}\n       want ${w}`);
}

const md = [
  '# 중심주제1',
  '',
  '> 첫 머리말',
  '',
  '## 하위노드1',
  '## 하위노드2',
  '## 하위노드3',
  '',
  '# 중심주제2',
  '',
  '두 번째 머리말 문단',
  '',
  '## 하위노드4',
  '### 손자',
  '## 하위노드5',
  '## 하위노드6',
  '',
].join('\n');

console.log('centers: 두 번째 # = 새 중심');
{
  const map = parseEmm(md, 'fallback')!;
  check('첫 중심 제목', map.root.text, '중심주제1');
  check('첫 중심 가지', map.branches.map((b) => b.text), ['하위노드1', '하위노드2', '하위노드3']);
  check('첫 중심 머리말 → 루트 노트', map.root.notes?.map((n) => n.text), ['첫 머리말']);
  check('centers 수', map.centers?.length, 1);
  const c = map.centers![0];
  check('둘째 중심 제목', c.root.text, '중심주제2');
  check('둘째 중심 id 는 root 가 아니다', c.root.id !== 'root', true);
  check('둘째 중심 colorKey', c.root.colorKey, 'root');
  check('둘째 중심 가지', c.branches.map((b) => b.text), ['하위노드4', '하위노드5', '하위노드6']);
  check('둘째 중심 손자', c.branches[0].children?.map((n) => n.text), ['손자']);
  check('둘째 중심 머리말 → 그 루트의 노트', c.root.notes?.map((n) => n.text), ['두 번째 머리말 문단']);
  check('좌/우 배분은 중심마다', c.branches.map((b) => b.side), ['right', 'right', 'left']);
  check('mapCenters 는 첫 중심 포함', mapCenters(map).length, 2);
  check('노드 수 = 중심 2 + 가지 6 + 손자 1', countMapNodes(map), 9);
}

console.log('centers: 본문 왕복');
{
  const map = parseEmm(md, 'fallback')!;
  const body = buildEmmBody(map, []);
  check('# 줄이 둘', body.split('\n').filter((l) => /^# /.test(l)).length, 2);
  const again = parseEmm(body, 'fallback')!;
  check('왕복 후 중심 수', again.centers?.length, 1);
  check('왕복 후 노드 수', countMapNodes(again), countMapNodes(map));
  check('왕복 후 둘째 중심 가지', again.centers![0].branches.map((b) => b.text), ['하위노드4', '하위노드5', '하위노드6']);
  check('왕복 후 둘째 중심 노트', again.centers![0].root.notes?.map((n) => n.text), ['두 번째 머리말 문단']);
}

console.log('centers: 이름 없는 중심(빈 #)');
{
  const map = parseEmm('# A\n\n## a1\n\n#\n\n## b1\n', 'f')!;
  check('빈 # 도 새 중심', map.centers?.length, 1);
  check('빈 이름', map.centers![0].root.text, '');
  check('빈 중심의 가지', map.centers![0].branches.map((b) => b.text), ['b1']);
  const body = buildEmmBody(map, []);
  check('빈 중심은 `#` 만 쓴다 (맵 이름을 넣지 않는다)', body.includes('\n#\n'), true);
  const again = parseEmm(body, 'f')!;
  check('왕복 후에도 빈 이름', again.centers![0].root.text, '');
}

console.log('centers: ## 로 시작한 문서 뒤의 #');
{
  const map = parseEmm('## 먼저\n\n# 나중\n\n## 나중의 가지\n', 'file-name')!;
  check('첫 ## 이 첫 중심 (A-1 ② — 파일 이름 중심을 지어내지 않는다)', map.root.text, '먼저');
  check('맵 이름은 파일 이름', map.title, 'file-name');
  check('# 나중 은 새 중심', map.centers?.[0].root.text, '나중');
  check('그 가지', map.centers?.[0].branches.map((b) => b.text), ['나중의 가지']);
}

console.log('centers: `#` 없는 문서의 최상위 항목은 각각 중심 (A-1 ②, 2026-09-16)');
{
  const map = parseEmm('## A\n\n### a1\n\n#### a1x\n\n### a2\n\n## B\n\n- b1\n', 'file-name')!;
  check('## 만 있는 문서 — 첫 ## 이 첫 중심', map.root.text, 'A');
  check('맵 이름은 파일 이름 그대로', map.title, 'file-name');
  check('첫 중심의 가지 = ### (한 단계 위로)', map.branches.map((b) => b.text), ['a1', 'a2']);
  check('#### 는 가지의 자식', map.branches[0].children?.map((n) => n.text), ['a1x']);
  check('둘째 ## 은 새 중심', map.centers?.map((c) => c.root.text), ['B']);
  check('그 아래 리스트는 가지', map.centers![0].branches.map((b) => b.text), ['b1']);
  check('centers 루트에 mdForm 없음', 'mdForm' in map.centers![0].root, false);
  const back = parseEmm(buildEmmBody(map, []), 'file-name')!;
  check('왕복 — 중심 수·노드 수 보존', [mapCenters(back).length, countMapNodes(back)], [2, countMapNodes(map)]);
}
{
  const map = parseEmm('- 가\n  - 가1\n- 나\n- 다\n', 'list')!;
  check('목록만 있는 문서 — 항목마다 중심', [map.root.text, ...(map.centers ?? []).map((c) => c.root.text)], ['가', '나', '다']);
  check('들여쓴 항목은 그 중심의 가지', map.branches.map((b) => b.text), ['가1']);
  check('첫 중심 루트에 mdForm 없음', 'mdForm' in map.root, false);
}
{
  const map = parseEmm('1. 첫 절\n\n첫 절의 문단\n\n2. 둘째 절\n\n- 항목\n', 'num')!;
  check('순번 절도 중심', [map.root.text, map.centers?.[0].root.text], ['1. 첫 절', '2. 둘째 절']);
  check('견출 없는 문서의 문단은 그 중심의 머리말 노트 (기존 규칙)', map.root.notes?.map((n) => n.text), ['첫 절의 문단']);
  check('둘째 절의 항목은 가지', map.centers![0].branches.map((b) => b.text), ['항목']);
}
{
  const map = parseEmm('- 가\n\n# T\n\n## t1\n', 'mix')!;
  check('항목 뒤의 # 는 첫 중심을 덮지 않고 새 중심', [map.root.text, map.centers?.[0].root.text], ['가', 'T']);
  check('# 아래 ## 은 그 중심의 가지', map.centers![0].branches.map((b) => b.text), ['t1']);
}
{
  const map = parseEmm('머리말 문단\n\n## A\n\n## B\n', 'pre')!;
  check('첫 ## 앞 머리말은 첫 중심의 노트', map.root.notes?.map((n) => n.text), ['머리말 문단']);
  check('중심 둘', mapCenters(map).length, 2);
}

console.log('centers: 항목 줄 인라인 사진 + 머리말 사진 문단이 첫 중심 루트에서 합쳐진다 (#495 Codex)');
{
  const md = '- 가 ![](https://x.test/a.png)\n\n![b](https://x.test/b.png)\n\n## 가지\n';
  const map = parseEmm(md, 'img')!;
  check('첫 중심은 항목 줄', map.root.text, '가');
  check('루트 사진 둘 다 남는다', map.root.images?.map((im) => im.src),
    ['https://x.test/a.png', 'https://x.test/b.png']);
  const dup = parseEmm('- 가 ![](https://x.test/a.png)\n\n![a](https://x.test/a.png)\n', 'img2')!;
  check('같은 사진은 한 번만', dup.root.images?.map((im) => im.src), ['https://x.test/a.png']);
}

console.log('centers: 중심 하나인 문서는 예전 그대로');
{
  const map = parseEmm('# 하나\n\n## a\n\n### b\n', 'f')!;
  check('centers 없음', map.centers, undefined);
  check('가지', map.branches.map((b) => b.text), ['a']);
  check('노드 수', countMapNodes(map), 3);
}

if (failed) { console.log(`\n${failed} failed`); process.exit(1); }
console.log('\nall passed');
