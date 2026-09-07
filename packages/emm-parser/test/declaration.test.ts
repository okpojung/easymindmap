// readDeclaration 단위 테스트 — 문서의 `emm` 코드블록.
//
// conformance/ 는 **EMM 파싱 코퍼스**다 — 여기 끼워 넣지 않는다.
// 이 테스트가 지키는 것:
//   ① `emm` 코드블록에서 선언을 읽는다
//   ② 우리 것이 아닌 펜스는 건드리지 않는다
//   ③ 본문에서 블록을 **걷어내지 않는다** — 그 노드의 코드 노트가 되어야 한다

import { TEMPLATE_IDS, expandTemplateId, readDeclaration } from '../src/declaration';
import { parseEmm, parseMarkdownToMap } from '../src/parse';

let failed = 0;
function check(name: string, got: unknown, want: unknown): void {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  const ok = g === w;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      받음 ${g}\n      기대 ${w}`}`);
}

const md = (...lines: string[]) => lines.join('\n');
const F = '```';

// ── ① 선언 읽기 ───────────────────────────────────────────────────────
{
  const r = readDeclaration(md('# 제목', '', F + 'emm', 'template: tree-progtree', F));
  check('① template 을 읽는다', r.template, 'tree-progtree');
}
{
  const r = readDeclaration(md(F + 'emm', 'map: 7f3a9c', 'template: kanban', F));
  check('① map 은 블록 안쪽에 적는다', r.map, '7f3a9c');
  check('① template 도 함께', r.template, 'kanban');
}
{
  const r = readDeclaration(md(F + 'emm', 'template: "kanban"', F));
  check('① 따옴표를 벗긴다', r.template, 'kanban');
}
{
  const r = readDeclaration(md(F + 'emm', 'colour: red', F));
  check('① 모르는 키는 무시한다 (전방 호환)', r, {});
}
{
  const src = md('# 제목', '', '본문뿐이다');
  check('① 블록이 없으면 빈 선언', readDeclaration(src), {});
}

// ── ② 레벨 선언 ──────────────────────────────────────────────────────
{
  const r = readDeclaration(
    md(
      F + 'emm',
      'template: tree-progtree',
      'levels:',
      '  1:',
      '    layout: tree-right',
      '    shape: rounded',
      '    font: 18',
      '  2:',
      '    layout: process-tree-right',
      F,
    ),
  );
  check('② template 과 levels 를 함께 읽는다', r.template, 'tree-progtree');
  check('② 1레벨', r.levels?.[1], { layout: 'tree-right', shape: 'rounded', font: '18' });
  check('② 2레벨', r.levels?.[2], { layout: 'process-tree-right' });
  check('② 선언하지 않은 레벨은 없다 (상속은 쓰는 쪽 몫)', r.levels?.[3], undefined);
}
{
  const r = readDeclaration(md(F + 'emm', 'levels:', '  0:', '    layout: x', '  7:', '    layout: y', F));
  check('② 1~6 밖의 레벨 번호는 버린다', r.levels, undefined);
}
{
  const r = readDeclaration(md(F + 'emm', 'levels:', '  2:', '    shape: star', F));
  check('② 중간 레벨만 선언해도 된다', r.levels, { 2: { shape: 'star' } });
}

// ── ③ 남의 펜스는 건드리지 않는다 ─────────────────────────────────────
{
  const r = readDeclaration(md(F + 'bash', 'npm run build', F));
  check('③ 다른 언어의 펜스는 우리 것이 아니다', r, {});
}
{
  // 예시로 emm 블록을 **보여주는** 문서. 바깥 펜스가 더 길다.
  const r = readDeclaration(
    md('# 설명서', '', '````markdown', F + 'emm', 'template: kanban', F, '````'),
  );
  check('③ 남의 펜스 안의 emm 은 선언이 아니다', r, {});
}
{
  const r = readDeclaration(
    md(F + 'json', '{"emm": 1}', F, '', F + 'emm', 'template: timeline', F),
  );
  check('③ 앞선 펜스를 건너뛰고 진짜 선언을 찾는다', r.template, 'timeline');
}
{
  const r = readDeclaration(md('- 항목', '', '  ' + F + 'emm', '  template: kanban', '  ' + F));
  check('③ 들여쓴 펜스도 읽는다', r.template, 'kanban');
}

// ── ④ 본문에 그대로 남는다 — 중심 노드의 코드 노트가 된다 ─────────────
{
  const src = md('# 배포 절차', '', F + 'emm', 'template: tree-progtree', F, '', '## 준비');
  const map = parseEmm(src);
  const centre = map?.root;
  check('④ 중심 노드는 첫 헤딩이다', centre?.text, '배포 절차');
  check('④ 선언은 중심 노드의 코드 노트로 남는다', centre?.notes?.[0]?.type, 'code_block');
  check('④ 노트의 언어는 emm', centre?.notes?.[0]?.lang, 'emm');
  check('④ 선언이 노드를 만들지는 않는다', map?.branches?.[0]?.text, '준비');
  check('④ 가지는 하나뿐이다', map?.branches?.length, 1);
}

// ── ④ 템플릿·레이아웃 ID (2026-09-06) — 어휘 표만, 해석은 앱 몫 ─────────
{
  check('④ TP → tree-progtree', expandTemplateId('TP'), 'tree-progtree');
  check('④ pt (소문자) → progtree-tree', expandTemplateId('pt'), 'progtree-tree');
  check('④ 공백 허용', expandTemplateId('  hr '), 'hierarchy-right');
  check('④ 긴 이름은 그대로', expandTemplateId('kanban'), 'kanban');
  check('④ 모르는 값도 그대로 (판정은 앱)', expandTemplateId('zz'), 'zz');
  check('④ undefined 는 undefined', expandTemplateId(undefined), undefined);
  check('④ ID 는 전부 두 글자 대문자', Object.keys(TEMPLATE_IDS).every((k) => /^[A-Z]{2}$/.test(k)), true);
  check('④ 값은 서로 다르다', new Set(Object.values(TEMPLATE_IDS)).size, Object.keys(TEMPLATE_IDS).length);
  const r = readDeclaration(md('# 제목', '', F + 'emm', 'template: PT', F));
  check('④ 파서는 ID 를 해석하지 않고 문자열 그대로', r.template, 'PT');
}

// ── ⑤ 닫지 않은 ```emm 펜스 — 첫 견출 앞에서 닫힌 것으로 (2026-09-07, 사용자 보고) ──
{
  // 보고 A: 펜스가 먼저 오고 # 제목까지 펜스 안에 (닫는 ``` 없음)
  const a = md(F + 'emm', 'template: PT', '# 시험', '## 가지 하나', '### 손자 A', '### 손자 B', '## 가지 둘', '### 손자 C');
  check('⑤A 선언은 읽힌다', readDeclaration(a).template, 'PT');
  const ma = parseMarkdownToMap(a, '파일')!;
  check('⑤A 맵이 만들어진다 — 루트 = # 시험', ma?.root.text, '시험');
  check('⑤A 가지 둘·손자 셋', ma?.branches.map((b) => `${b.text}(${(b.children ?? []).length})`), ['가지 하나(2)', '가지 둘(1)']);
  check('⑤A 선언은 루트의 코드 노트로 남는다', ma?.root.notes?.map((n) => (n as { text?: string }).text), ['template: PT']);
  // 보고 B: # 제목 뒤에 펜스, 닫지 않음 → 예전엔 루트 하나 + 나머지 전부 코드 노트
  const b = md('# 시험', '', F + 'emm', 'template: PT', '', '## 가지 하나', '### 손자 A', '## 가지 둘');
  const mb = parseMarkdownToMap(b, '파일')!;
  check('⑤B 가지가 살아난다', mb?.branches.map((x) => x.text), ['가지 하나', '가지 둘']);
  check('⑤B 코드 노트에는 선언만', mb?.root.notes?.map((n) => (n as { text?: string }).text), ['template: PT']);
  // CRLF 파일도 같다 (윈도우 메모장)
  const mc = parseMarkdownToMap(a.replace(/\n/g, '\r\n'), '파일')!;
  check('⑤C CRLF 도 같다', mc?.branches.map((x) => x.text), ['가지 하나', '가지 둘']);
  // 다른 언어의 펜스는 그대로 — 코드 안 `# 주석` 은 견출이 아니다
  const d = md('# T', '', F + 'bash', '# 주석', 'echo hi', F, '', '## 가지');
  const mdd = parseMarkdownToMap(d, '파일')!;
  check('⑤D bash 펜스 안 # 은 견출 아님 — 루트의 코드 노트', mdd?.root.notes?.map((n) => (n as { text?: string }).text), ['# 주석\necho hi']);
  check('⑤D 가지는 펜스 뒤 견출 하나', mdd?.branches.map((x) => x.text), ['가지']);
  // 닫지 않은 bash 펜스는 예전대로 문서 끝까지 (CommonMark) — 견출도 코드 안
  const e = md('# T', '', F + 'bash', 'echo hi', '## 가지');
  const me = parseMarkdownToMap(e, '파일')!;
  check('⑤E 닫지 않은 bash 펜스는 끝까지 코드 — 가지 없음', me?.branches.map((x) => x.text), []);
  check('⑤E 견출이 코드 노트 안에', (me?.root.notes?.[0] as { text?: string } | undefined)?.text, 'echo hi\n## 가지');
}

console.log(failed ? `\n${failed}건 실패` : '\n전부 통과');
process.exit(failed ? 1 : 0);
