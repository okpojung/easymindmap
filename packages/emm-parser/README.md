# @easymindmap/emm-parser

**EasyMindMap Markdown(EMM)** 레퍼런스 파서/직렬화기.

EMM은 마인드맵을 위한 Markdown 포맷이다 — 본문은 100% CommonMark/GFM
(어떤 MD 뷰어에서도 정상 문서로 보임), 파일 끝의 메타데이터 주석 1줄
(`<!-- easymindmap:v1:BASE64 -->`)이 스타일·레이아웃·사진까지 무손실
왕복을 보장한다.

- 포맷 스펙: [`docs/04-extensions/emm-spec.md`](../../docs/04-extensions/emm-spec.md)
- 변환 규칙 상세: [`docs/04-extensions/markdown-export.md`](../../docs/04-extensions/markdown-export.md)
- 브라우저/Node.js 공용 — DOM·앱 의존 없음, 런타임 의존성 0

## API

```ts
import { parseEmm, serializeEmm, countMapNodes } from '@easymindmap/emm-parser';

const map = parseEmm(markdownText);          // MD → 맵 JSON (EmmMap | null)
const out = serializeEmm(map);               // 맵 JSON → MD (+메타데이터)
out.markdown;                                 // EMM 문서 문자열
out.images;                                   // files/… 로 참조된 사진 바이트
```

저수준 API: `parseMarkdownToMap`, `buildEmmBody`, `buildMetaComment`,
`buildMapMeta`, `encodeMetaBase64` / `decodeMetaBase64`, `MD_META_RE`,
`MD_META_BLOCK_RE`, 모델 타입(`EmmMap`, `MindNode`, `NoteBlock` …).

## CLI

```bash
npx tsx cli.ts convert doc.md            # MD → 맵 JSON
npx tsx cli.ts convert map.json -o a.md  # 맵 JSON → EMM 문서
npx tsx cli.ts validate doc.md           # EMM-Basic/Full 유효성·요약
```

## 적합성 코퍼스 (conformance)

`conformance/cases/`의 실문서 코퍼스(전자영수증 보고서 176노드, ChatGPT
대화 299노드, 견출 없는 순번 절 96노드, README·회의록·AI 프롬프트 예시
등 11종)에 대해 ▸파싱 스냅숏 ▸메타데이터 무손실 왕복 ▸본문 왕복 노드
수를 검증한다.

```bash
npm test           # 전체 케이스 검증
npm run test:update  # 스냅숏 재생성 (규칙 변경 시)
```

**제3자 구현체는 이 코퍼스를 통과하면 EMM 호환을 선언할 수 있다.**

## 라이선스

Apache-2.0 (예정 — 공개 리포 분리 시 확정. `docs/00-project-overview/emm-strategy.md` 참조)
