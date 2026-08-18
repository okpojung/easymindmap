# @easymindmap/emm-parser

**EasyMindMap Markdown(EMM)** 레퍼런스 파서/직렬화기.

EMM은 마인드맵을 위한 Markdown 포맷이다 — 본문은 100% CommonMark/GFM
(어떤 MD 뷰어에서도 정상 문서로 보임), 파일 끝의 메타데이터 주석 1줄
(`<!-- easymindmap:v1:BASE64 -->`)이 스타일·레이아웃·사진까지 무손실
왕복을 보장한다.

- 포맷 스펙: [`docs/04-extensions/emm-spec.md`](../../docs/04-extensions/emm-spec.md)
- 변환 규칙 상세: [`docs/04-extensions/markdown-export.md`](../../docs/04-extensions/markdown-export.md)
- 브라우저/Node.js 공용 — DOM·앱 의존 없음, 런타임 의존성 0

접두어가 `easymindmap:`인 것은 의도된 것이며 바꾸지 않는다 — 그 페이로드
형식은 EMM이 정한 것이고 Mindmap Markdown 사양이 정의한 적이 없어서,
사양 이름을 쓰면 다른 도구에게 지킬 수 없는 약속을 하게 된다. 근거와
바꾸는 조건은 [`emm-spec.md` §4.1](../../docs/04-extensions/emm-spec.md)에
적어두었다.

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

`conformance/cases/`의 코퍼스 12종에 대해 ▸파싱 스냅숏 ▸메타데이터 무손실
왕복 ▸본문 왕복 노드 수를 검증한다. 표·코드 펜스가 섞인 보고서형, 대화
내보내기형, 견출 없는 순번 절, 깊은 견출, 머리말만 있는 문서, README형,
회의록형, AI 프롬프트 등 파서가 실제로 만나는 구조를 덮는다.

**코퍼스는 전량 합성본이다.** 실사용 문서는 저장소에 넣지 않는다 — 검증에
필요한 것은 문서의 *구조*이지 내용이 아니며, 실문서는 커밋되는 순간
되돌리기 어렵게 공개된다.

```bash
npm test           # 전체 케이스 검증
npm run test:update  # 스냅숏 재생성 (규칙 변경 시)
```

**제3자 구현체는 이 코퍼스를 통과하면 EMM 호환을 선언할 수 있다.**

## 라이선스

Apache-2.0 (예정 — 공개 리포 분리 시 확정. `docs/00-project-overview/emm-strategy.md` 참조)

## 설치해서 쓰기 (2026-08-18)

이 패키지는 **소스와 산출물을 함께** 담는다. `npm install` 하면
CommonJS·ESM·타입이 모두 따라온다 — 예전에는 `main` 이 `src/index.ts`
였고, 그래서 **이 저장소 안(번들러)에서만** 쓸 수 있었다.

```bash
npm install @easymindmap/emm-parser     # (아직 레지스트리 미공개 — 경로/타르볼 설치)
npm run build                           # dist/{esm,cjs,types} 생성
```

```js
// CommonJS (NestJS 서버 등)
const { parseEmm, serializeEmm, wouldCreateCycle } = require('@easymindmap/emm-parser');

// ESM / 번들러
import { parseEmm } from '@easymindmap/emm-parser';
import { findOrphans } from '@easymindmap/emm-parser/tree-rules';   // 하위 경로도 된다
```

> 이 저장소의 프런트엔드는 여전히 **소스를 직접** 본다(`@emm` vite 별칭) —
> 고치는 즉시 반영돼야 하기 때문이다. `dist` 는 **밖에서 쓰는 사람**을 위한 것이다.
