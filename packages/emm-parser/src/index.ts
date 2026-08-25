// @easymindmap/emm-parser — EasyMindMap Markdown(EMM) 레퍼런스 파서.
//
// EMM = 본문 100% CommonMark/GFM + 파일 끝 메타데이터 주석 1줄
//       (<!-- easymindmap:v1:BASE64(JSON) -->)
// 스펙: docs/04-extensions/emm-spec.md · 변환 규칙: docs/04-extensions/
// markdown-export.md · 적합성 코퍼스: packages/emm-parser/conformance/

export * from './model';
// 트리 모양 규칙 — 정규화·협업·화면이 **같은 판정**을 쓰게 한다
export * from './tree-rules';
// 평평한 노드 목록 → 중첩 트리. 유료 물질화가 부른다 (28-sync-prework-plan §2.3 A-5)
export * from './build-tree';
export * from './meta';
// 리치 노트 HTML 속 <img> 의 주소를 읽고 바꾼다 — 노드 사진(`image`·`images`)과
// **같은 자리에서** 다루기 위한 것 (28-sync-prework-plan §3.5 셋째 줄)
export * from './note-images';
// 문서 맨 앞 `---` 블록 — 불러오기 힌트(템플릿·레벨 선언). 걷어내지 않으면
// 표준 파서가 수평선 + setext 헤딩으로 읽어 가짜 노드를 만든다
export {
  readFrontMatter,
  type EmmFrontMatter,
  type EmmLevelSpec,
  type FrontMatterResult,
} from './frontMatter';
export {
  parseMarkdownToMap,
  parseEmm,
  NODE_A4_CHARS,
  NODE_IMAGE_CHARS,
  REMOTE_IMAGE_PLACEHOLDER_W,
  REMOTE_IMAGE_PLACEHOLDER_H,
  type ParseEmmOptions,
} from './parse';
export {
  buildEmmBody,
  buildMetaComment,
  serializeEmm,
  safeFileName,
  dataUrlToBytes,
  withPackagedImagePaths,
  countMapNodes,
  splitNodeBody,
  nodeHeadingText,
  type EmmImageFile,
  type NodeBodyBlock,
  type SerializeEmmOptions,
  type SerializedEmm,
} from './serialize';
