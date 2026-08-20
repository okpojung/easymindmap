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
  countMapNodes,
  splitNodeBody,
  nodeHeadingText,
  type EmmImageFile,
  type NodeBodyBlock,
  type SerializeEmmOptions,
  type SerializedEmm,
} from './serialize';
