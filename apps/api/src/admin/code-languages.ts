// 코드블럭 언어 목록 (2026-10-28 사용자 요청) — 관리자 > 코드블럭 언어관리.
//
// 저장: `public.site_settings` 의 키 `editor.code_languages` — 값은 [{ name, code }] 배열(보이는 순서).
// 저장한 적이 없거나 표가 없으면 아래 기본 목록(알파벳 순)을 쓴다. 기본 목록은 GitHub Linguist ·
// highlight.js 에서 흔히 쓰는 이름과 펜스 표기(```lang)를 골랐다.
//   name — 목록에 보이는 이름 (예: JavaScript)
//   code — 코드블럭 첫 줄 ``` 뒤에 들어가는 표기 (예: javascript)
// 프런트엔드 기본 목록(services/cloud/codeLanguages.ts)과 같다 — 서버에 닿지 못할 때만 그쪽을 쓴다.

export const CODE_LANGUAGES_KEY = 'editor.code_languages';
export const CODE_LANGUAGES_MAX = 300;

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

const NAME_MAX = 40;
const CODE_RE = /^[a-z0-9][a-z0-9+#._-]{0,29}$/;

/** 관리자가 보낸 목록 — 다듬고 검사한다. 틀리면 이유 문장을 던진다 */
export function parseCodeLanguages(input: unknown): { ok: true; items: CodeLanguage[] } | { ok: false; message: string } {
  if (!Array.isArray(input)) return { ok: false, message: '목록 형식이 올바르지 않습니다.' };
  if (input.length > CODE_LANGUAGES_MAX) return { ok: false, message: `언어는 ${CODE_LANGUAGES_MAX}개까지 등록할 수 있습니다.` };
  const out: CodeLanguage[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < input.length; i++) {
    const x = input[i] as { name?: unknown; code?: unknown } | null;
    const name = String(x?.name ?? '').replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim();
    const code = String(x?.code ?? '').trim().toLowerCase();
    if (!name || name.length > NAME_MAX) return { ok: false, message: `${i + 1}번째 언어 이름은 1~${NAME_MAX}자여야 합니다.` };
    if (!CODE_RE.test(code)) {
      return { ok: false, message: `${i + 1}번째 언어(${name})의 표기는 영문 소문자·숫자와 + # . _ - 만, 30자까지 쓸 수 있습니다.` };
    }
    if (seen.has(code)) return { ok: false, message: `표기 '${code}' 가 두 번 들어 있습니다.` };
    seen.add(code);
    out.push({ name, code });
  }
  return { ok: true, items: out };
}

/** 저장된 값 — 깨져 있으면 null (기본 목록을 쓴다) */
export function storedCodeLanguages(value: unknown): CodeLanguage[] | null {
  const p = parseCodeLanguages(value);
  return p.ok ? p.items : null;
}
