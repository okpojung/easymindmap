// vault-plan 단위 테스트 (2026-08-21, vault 미러 슬라이스 3).
//
//   npm run build && npm run test:vault
//
// 슬라이스 1 이 "이름 하나" 였다면 여기는 **"전체가 어느 자리에 놓이는가"** 다.
// 두 맵이 같은 자리로 계산되면 **하나가 다른 하나를 덮어쓴다.**
//
// 설계: docs/04-extensions/vault-mirror.md §3

import {
  assignFolderNames, folderPathOf, buildVaultPlan,
} from '../dist/vault/vault-plan.js';

let failed = 0;
function check(name, got, want) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  const ok = g === w;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      받음 ${g}\n      기대 ${w}`}`);
}
const T = (n) => `2026-01-${String(n).padStart(2, '0')}T00:00:00Z`;
const F = (id, parentId, name, day) => ({ id, parentId, name, createdAt: T(day) });
const M = (mapId, folderId, title, day) => ({ mapId, folderId, title, createdAt: T(day) });
const paths = (plan) => plan.map((p) => p.relPath).sort();

// ── ① 기본 — 폴더 트리 그대로 ─────────────────────────────────────
{
  const folders = [F('f1', null, '연구', 1), F('f2', 'f1', '2026', 2)];
  const maps = [M('m1', 'f2', 'RAG 증분 인덱싱', 3), M('m2', null, '회의록', 4)];
  check('① 하위 폴더까지 경로가 된다',
    paths(buildVaultPlan(folders, maps)), ['RAG 증분 인덱싱.md', '연구/2026/RAG 증분 인덱싱.md'].sort()
      .filter((x) => x !== 'RAG 증분 인덱싱.md').concat(['회의록.md']).sort());
  const plan = buildVaultPlan(folders, maps);
  check('① 깊은 폴더', plan.find((p) => p.mapId === 'm1').relPath, '연구/2026/RAG 증분 인덱싱.md');
  check('① 홈은 루트', plan.find((p) => p.mapId === 'm2').relPath, '회의록.md');
}

// ── ② 폴더 이름도 겹친다 (map_folders 에 unique 가 없다) ──────────
{
  const folders = [F('fa', null, '연구', 1), F('fb', null, '연구', 2)];
  const names = assignFolderNames(folders);
  check('② 먼저 만든 폴더가 원래 이름을 지킨다', names.get('fa'), '연구');
  check('② 나중 것이 id 를 단다', names.get('fb'), '연구-fb');
  check('② ★ 입력 순서를 바꿔도 답이 같다',
    [...assignFolderNames([...folders].reverse())].sort(), [...names].sort());

  const plan = buildVaultPlan(folders, [M('m1', 'fa', '같은 제목', 3), M('m2', 'fb', '같은 제목', 4)]);
  check('② ★ 두 폴더의 맵이 섞이지 않는다',
    paths(plan), ['연구-fb/같은 제목.md', '연구/같은 제목.md'].sort());
}
{
  // 부모가 다르면 같은 이름이어도 안 겹친다
  const folders = [F('p1', null, '가', 1), F('p2', null, '나', 2),
                   F('c1', 'p1', '공통', 3), F('c2', 'p2', '공통', 4)];
  const names = assignFolderNames(folders);
  check('② 부모가 다르면 같은 이름 그대로', [names.get('c1'), names.get('c2')], ['공통', '공통']);
}
{
  // 대소문자만 다른 폴더 — macOS·Windows 에서는 같은 디렉터리다
  const folders = [F('fa', null, 'Research', 1), F('fb', null, 'research', 2)];
  const names = assignFolderNames(folders);
  check('② ★ 대소문자만 달라도 가른다', [names.get('fa'), names.get('fb')],
    ['Research', 'research-fb']);
}

// ── ③ 부모가 없어졌을 때 — 아무것도 버리지 않는다 ─────────────────
{
  const folders = [F('c', 'ghost', '떠도는 폴더', 1)];   // 부모가 목록에 없다
  const names = assignFolderNames(folders);
  check('③ 부모가 없으면 홈 바로 밑으로',
    folderPathOf('c', new Map(folders.map((f) => [f.id, f])), names), ['떠도는 폴더']);
  const plan = buildVaultPlan(folders, [M('m1', 'c', '문서', 2)]);
  check('③ 맵도 따라온다 (지워지지 않는다)', plan[0].relPath, '떠도는 폴더/문서.md');
}
{
  // 폴더가 고리를 이뤄도 멈춘다 (무한 반복 금지)
  const folders = [F('a', 'b', 'A', 1), F('b', 'a', 'B', 2)];
  const p = folderPathOf('a', new Map(folders.map((f) => [f.id, f])), assignFolderNames(folders));
  check('③ 고리가 있어도 멈춘다', p.length <= 2, true);
  check('③ 그래도 경로가 나온다', p.length > 0, true);
}
{
  // 폴더 자체가 없는 id 를 가리키는 맵
  const plan = buildVaultPlan([], [M('m1', 'nope', '문서', 1)]);
  check('③ 없는 폴더를 가리키면 홈으로', plan[0].relPath, '문서.md');
}

// ── ④ 같은 디렉터리 안의 맵 이름 (§3.1) ───────────────────────────
{
  const plan = buildVaultPlan([], [M('ma', null, '연구', 1), M('mb', null, '연구', 2)]);
  check('④ 먼저 만든 맵이 원래 이름을 지킨다',
    plan.find((p) => p.mapId === 'ma').relPath, '연구.md');
  check('④ 나중 것이 id 를 단다',
    plan.find((p) => p.mapId === 'mb').relPath, '연구-mb.md');
}
{
  // ★ 부모가 사라져 **둘 다 홈으로 올라온** 경우 — 폴더 가르기로는 못 막는다.
  //   마지막 판정을 디렉터리 경로로 해야 여기서 안 겹친다.
  const plan = buildVaultPlan([], [M('ma', 'ghost1', '문서', 1), M('mb', 'ghost2', '문서', 2)]);
  check('④ ★ 서로 다른 유령 폴더에서 올라와도 안 겹친다',
    paths(plan), ['문서-mb.md', '문서.md'].sort());
}
{
  // 이름이 정규화 끝에 같아지는 제목들
  const plan = buildVaultPlan([], [M('ma', null, '회의/록', 1), M('mb', null, '회의:록', 2)]);
  check('④ 정규화 끝에 같아져도 가른다', paths(plan), ['회의-록-mb.md', '회의-록.md'].sort());
}

// ── ⑤ 결정적인가 — 같은 입력이면 항상 같은 답 ────────────────────
{
  const folders = [F('f1', null, '연구', 1), F('f2', 'f1', '2026', 2), F('f3', null, '연구', 3)];
  const maps = [M('m1', 'f2', 'A', 4), M('m2', 'f3', 'A', 5), M('m3', null, 'A', 6)];
  const a = JSON.stringify(buildVaultPlan(folders, maps));
  const b = JSON.stringify(buildVaultPlan([...folders].reverse(), [...maps].reverse()));
  check('⑤ ★ 입력 순서가 달라도 같은 답', a === b, true);
  check('⑤ 자리가 셋 다 다르다', new Set(JSON.parse(a).map((p) => p.relPath)).size, 3);
}

// ── ⑥ 빈 입력 ─────────────────────────────────────────────────────
check('⑥ 맵이 없으면 빈 계획', buildVaultPlan([], []), []);
check('⑥ 폴더만 있어도 빈 계획', buildVaultPlan([F('f1', null, '빈 폴더', 1)], []), []);

console.log(failed ? `\n${failed}건 실패` : '\n전부 통과');
process.exit(failed ? 1 : 0);
