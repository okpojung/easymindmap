/**
 * EMM 마크다운 → **문서 스냅샷**(맵 저장 형식).
 *
 * 프런트엔드가 `PUT /v1/maps/:id/document` 로 보내는 것과 **같은 모양**을
 * 만든다 (`mapSession.ts` 의 `buildSnapshot()`):
 *
 *     { v: 2, map: <EMM 맵 JSON>, editor: { layoutType, spacingX, spacingY } }
 *
 * 이 파일이 하는 일은 그 껍데기를 씌우는 것뿐이다. **마크다운을 읽는
 * 것은 EMM 레퍼런스 파서**(`src/emm/parse.ts` — packages/emm-parser 의
 * 복사본, sync-emm-parser.mjs 참조)이고, 그것이 이 포맷의 단일 원본이다.
 * 여기서 마크다운을 다시 해석하지 않는다 — 두 벌이 되면 어긋난다.
 */
import { parseMarkdownToMap } from '../emm/parse';
import type { SampleMap } from '../emm/model';

/** 프런트엔드 `SNAPSHOT_VERSION` 과 **같아야 한다** (mapSession.ts) */
export const SNAPSHOT_VERSION = 2;

// 스냅샷의 editor 기본값 — **앱의 초기값과 같아야 한다**
// (`editorUiStore.ts`: layoutType 'radial-bidirectional', spacing 1·1).
// spacing 은 픽셀이 아니라 **배율**이다(0.9~2 로 잘린다) — 픽셀로 착각해
// 260 같은 값을 넣으면 앱이 2 로 잘라 간격이 최대가 된 맵이 열린다.
const DEFAULT_EDITOR = {
  layoutType: 'radial-bidirectional',
  spacingX: 1,
  spacingY: 1,
} as const;

export interface EmmSnapshot {
  v: number;
  map: SampleMap;
  editor: { layoutType: string; spacingX: number; spacingY: number };
}

export class EmmParseError extends Error {}

/**
 * `markdown` 을 맵 문서 스냅샷으로 바꾼다.
 *
 * `blockPlacement` 는 앱의 '불러오기' 대화상자와 **같은 선택지**다
 * (rich-node-content.md §2.2):
 *   · 'node'(기본) — 인용문·표·코드·체크리스트를 **노드 본문**에 넣는다
 *   · 'note'       — 노트로 넣는다 (파서 기본값)
 *
 * 파서가 `null` 을 돌려주면 **견출(헤딩)이 하나도 없는 글**이다. 그때는
 * 맵을 만들 수 없으므로 그대로 알린다 — 빈 맵을 만들어 두면 사용자는
 * "맵이 생겼는데 비어 있다"로 겪는다.
 */
export function emmToSnapshot(
  markdown: string,
  title: string,
  blockPlacement: 'node' | 'note' = 'node',
): EmmSnapshot {
  const map = parseMarkdownToMap(markdown, title, { blockPlacement });
  if (!map) {
    throw new EmmParseError(
      '마크다운에서 맵을 만들지 못했습니다 — 견출(`# 제목`, `## 소제목`)이 하나도 없습니다. ' +
      '맨 앞에 `# 중심 주제`, 그 아래 `## 가지` 형태로 적어 주세요.',
    );
  }
  if (map.branches.length === 0) {
    throw new EmmParseError(
      '중심 주제만 있고 가지가 없습니다 — `## 가지 이름` 을 하나 이상 적어 주세요.',
    );
  }
  return { v: SNAPSHOT_VERSION, map, editor: { ...DEFAULT_EDITOR } };
}

/**
 * 맵 이름 — 사용자가 주면 그것, 아니면 **문서의 첫 H1**.
 * 파서가 제목을 찾지 못하면 fallbackTitle 을 그대로 쓰므로, 여기서도
 * 같은 규칙을 한 번 더 쓰지 않고 파서가 정한 `map.title` 을 믿는다.
 */
export function titleFromSnapshot(snap: EmmSnapshot, fallback: string): string {
  const t = (snap.map.title ?? '').trim();
  return (t || fallback).slice(0, 255);
}
