// 코드블럭 언어 목록 (2026-10-28) — 관리자 > 코드블럭 언어관리 에서 정한 목록과 순서.
// 서버(GET /v1/code-languages, 로그인 없이)에서 한 번 받아 기억한다. 서버에 닿지 못하면
// 아래 기본 목록(서버 apps/api/src/admin/code-languages.ts 와 같다)을 쓴다.
import { useEffect, useState } from 'react';

export interface CodeLanguage { name: string; code: string }

export const DEFAULT_CODE_LANGUAGES: CodeLanguage[] = [
  { name: 'Bash', code: 'bash' },
  { name: 'Batch', code: 'bat' },
  { name: 'C', code: 'c' },
  { name: 'C#', code: 'csharp' },
  { name: 'C++', code: 'cpp' },
  { name: 'Clojure', code: 'clojure' },
  { name: 'CMake', code: 'cmake' },
  { name: 'CSS', code: 'css' },
  { name: 'CSV', code: 'csv' },
  { name: 'Dart', code: 'dart' },
  { name: 'Diff', code: 'diff' },
  { name: 'Dockerfile', code: 'dockerfile' },
  { name: 'Elixir', code: 'elixir' },
  { name: 'Erlang', code: 'erlang' },
  { name: 'F#', code: 'fsharp' },
  { name: 'Fortran', code: 'fortran' },
  { name: 'Go', code: 'go' },
  { name: 'GraphQL', code: 'graphql' },
  { name: 'Groovy', code: 'groovy' },
  { name: 'Haskell', code: 'haskell' },
  { name: 'HCL (Terraform)', code: 'hcl' },
  { name: 'HTML', code: 'html' },
  { name: 'HTTP', code: 'http' },
  { name: 'INI', code: 'ini' },
  { name: 'Java', code: 'java' },
  { name: 'JavaScript', code: 'javascript' },
  { name: 'JSON', code: 'json' },
  { name: 'JSX', code: 'jsx' },
  { name: 'Julia', code: 'julia' },
  { name: 'Kotlin', code: 'kotlin' },
  { name: 'LaTeX', code: 'latex' },
  { name: 'Less', code: 'less' },
  { name: 'Lua', code: 'lua' },
  { name: 'Makefile', code: 'makefile' },
  { name: 'Markdown', code: 'markdown' },
  { name: 'MATLAB', code: 'matlab' },
  { name: 'Mermaid', code: 'mermaid' },
  { name: 'Nginx', code: 'nginx' },
  { name: 'Objective-C', code: 'objectivec' },
  { name: 'OCaml', code: 'ocaml' },
  { name: 'Perl', code: 'perl' },
  { name: 'PHP', code: 'php' },
  { name: 'Plain text', code: 'text' },
  { name: 'PlantUML', code: 'plantuml' },
  { name: 'PowerShell', code: 'powershell' },
  { name: 'Protocol Buffers', code: 'protobuf' },
  { name: 'Python', code: 'python' },
  { name: 'R', code: 'r' },
  { name: 'Ruby', code: 'ruby' },
  { name: 'Rust', code: 'rust' },
  { name: 'Sass', code: 'sass' },
  { name: 'Scala', code: 'scala' },
  { name: 'SCSS', code: 'scss' },
  { name: 'Shell', code: 'shell' },
  { name: 'Solidity', code: 'solidity' },
  { name: 'SQL', code: 'sql' },
  { name: 'Svelte', code: 'svelte' },
  { name: 'Swift', code: 'swift' },
  { name: 'TOML', code: 'toml' },
  { name: 'TSX', code: 'tsx' },
  { name: 'TypeScript', code: 'typescript' },
  { name: 'VB.NET', code: 'vbnet' },
  { name: 'Verilog', code: 'verilog' },
  { name: 'Vue', code: 'vue' },
  { name: 'XML', code: 'xml' },
  { name: 'YAML', code: 'yaml' },
  { name: 'Zig', code: 'zig' },
];

let cached: CodeLanguage[] | null = null;
let loading: Promise<CodeLanguage[]> | null = null;

export function loadCodeLanguages(force = false): Promise<CodeLanguage[]> {
  if (cached && !force) return Promise.resolve(cached);
  if (loading && !force) return loading;
  // 서버 모듈은 필요할 때만 불러온다 — 편집 창을 쓰는 순수 함수 시험(node)이 브라우저 설정을 끌고 오지 않게
  loading = import('./apiClient').then(({ cloudApi }) => cloudApi.codeLanguages())
    .then((r) => (Array.isArray(r.items) && r.items.length ? r.items : DEFAULT_CODE_LANGUAGES))
    .catch(() => DEFAULT_CODE_LANGUAGES)
    .then((items) => { cached = items; loading = null; return items; });
  return loading;
}

/** 관리자가 목록을 바꾼 뒤 — 다음에 다시 받는다 */
export function forgetCodeLanguages(): void { cached = null; }

export function useCodeLanguages(): CodeLanguage[] {
  const [items, setItems] = useState<CodeLanguage[]>(cached ?? DEFAULT_CODE_LANGUAGES);
  useEffect(() => { let alive = true; void loadCodeLanguages().then((x) => { if (alive) setItems(x); }); return () => { alive = false; }; }, []);
  return items;
}

/**
 * 입력한 글자로 고르기 — 이름이나 표기가 **그 글자로 시작**하는 것을 먼저(목록 순서대로),
 * 그다음(두 글자부터) 중간에 든 것. 비어 있으면 전체. (예: "j" → Java, JavaScript, JSON, JSX, Julia)
 */
export function filterCodeLanguages(list: CodeLanguage[], q: string): CodeLanguage[] {
  const s = q.trim().toLowerCase();
  if (!s) return list;
  const head = list.filter((x) => x.name.toLowerCase().startsWith(s) || x.code.startsWith(s));
  // 한 글자일 때는 중간에 든 것까지 보이면 너무 많다 (j → Clojure·Objective-C) — 두 글자부터
  if (s.length < 2) return head;
  const mid = list.filter((x) => !head.includes(x) && (x.name.toLowerCase().includes(s) || x.code.includes(s)));
  return [...head, ...mid];
}
