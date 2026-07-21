// importMarkdown — MD → 맵 변환은 EMM 레퍼런스 파서(@easymindmap/
// emm-parser)가 단일 원본이다. 앱은 여기서 재수출해 사용한다.
// 변환 규칙: docs/04-extensions/markdown-export.md · 스펙: emm-spec.md

export { parseMarkdownToMap, parseEmm } from '@emm/parse';
