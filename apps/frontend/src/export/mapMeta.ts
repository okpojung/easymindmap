// mapMeta — HTML 내보내기의 맵 메타데이터(#easymindmap-map JSON)는 EMM
// 레퍼런스 파서(@easymindmap/emm-parser meta.ts)가 단일 원본이다. 앱은
// 재수출해 사용한다. MD 의 메타데이터 주석은 2026-09-15 폐기 — MD 는
// 본문 + ```emm 선언뿐이다. 스키마: docs/04-extensions/import-export/22-map-file-meta.md

export * from '@emm/meta';
