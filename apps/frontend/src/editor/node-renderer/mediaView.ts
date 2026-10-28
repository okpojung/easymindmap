// 그림만 담은 노드의 **화면용 사본** (2026-10-28) — 문서는 바꾸지 않는다.
//
//   · 펼친 상태: 자동 태그 Image·Mermaid·HTML 를 태그 **뒤에** 붙인다(사용자 태그 순서는 그대로)
//   · 접은 상태(`contentFolded`): 글은 "Image, Mermaid" 처럼 종류 이름만, 사진·태그·프로젝트 태그는 숨긴다
//   · 두 경우 모두 `_media`(종류) 를 달아 둔다 — 밑줄 없이 가운데로 잇기·접기 단추가 본다
// 배치(computeLayout)에 넣기 전에 한 번 거친다. 바뀐 노드만 새로 만든다.

import { mediaKindsOf, mediaLabel } from './mediaContent';

interface ViewNode {
  text?: string;
  image?: unknown;
  images?: unknown[];
  tags?: string[];
  project?: unknown;
  contentFolded?: boolean;
  sizeW?: number;
  sizeH?: number;
  children?: ViewNode[];
}
interface ViewMap {
  root: ViewNode;
  branches: ViewNode[];
  centers?: { root: ViewNode; branches: ViewNode[] }[];
}

function viewNode<N extends ViewNode>(n: N, fold: boolean): N {
  let kids = n.children;
  if (kids && kids.length) {
    const next = kids.map((c) => viewNode(c, fold));
    if (next.some((c, i) => c !== kids![i])) kids = next;
  }
  const kinds = mediaKindsOf(n);
  if (!kinds) return kids === n.children ? n : { ...n, children: kids };
  if (fold && n.contentFolded) {
    return {
      ...n, children: kids, text: mediaLabel(kinds),
      image: undefined, images: undefined, tags: undefined, project: undefined,
      // 손으로 키운 크기도 접힌 동안은 쓰지 않는다 — 접어도 박스가 그대로면 접은 뜻이 없다 (2026-10-28)
      sizeW: undefined, sizeH: undefined,
      _media: kinds, _mediaFolded: true,
    };
  }
  const own = n.tags ?? [];
  const auto = kinds.filter((k) => !own.some((t) => t.toLowerCase() === k.toLowerCase()));
  return { ...n, children: kids, tags: auto.length ? [...own, ...auto] : n.tags, _media: kinds, _autoTags: auto.length ? auto : undefined };
}

/** fold=false — 접기를 무시한다(HTML 뷰어: 읽는 사람이 펼 수 없으니 늘 펼친다) */
export function applyMediaView<M>(input: M, opts: { fold?: boolean } = {}): M {
  const map = input as unknown as ViewMap;
  const fold = opts.fold !== false;
  const root = viewNode(map.root, fold);
  const branches = map.branches.map((b) => viewNode(b, fold));
  const centers = map.centers?.map((c) => {
    const r = viewNode(c.root, fold);
    const bs = c.branches.map((b) => viewNode(b, fold));
    return r === c.root && bs.every((b, i) => b === c.branches[i]) ? c : { ...c, root: r, branches: bs };
  });
  const same = root === map.root && branches.every((b, i) => b === map.branches[i])
    && (!centers || centers.every((c, i) => c === map.centers![i]));
  return (same ? map : { ...map, root, branches, centers }) as unknown as M;
}
