/**
 * 유료 맵의 **미리보기 자르기** — 서버가 자른다 (27b §5.1, 2026-09-21).
 *
 * 27a §3 이 설계에서 가장 중요하다고 한 자리다. 유료 맵의 전문은 **결제한
 * 사람에게만** 간다. 화면에서 가리는 것으로는 안 된다 — 개발자 도구를 열면
 * 그만이다. 그래서 **서버가 잘라서 내보낸다.**
 *
 * ★ **지울 것을 세지 않고, 남길 것만 센다** (allowlist).
 *
 *   27b §5.1 이 짚은 대로 이 함수에서 가장 틀리기 쉬운 자리는 깊이가 아니라
 *   **노트**다. 2레벨 노드의 노트 안에 본문이 통째로 들어 있는 맵이 흔해서,
 *   깊이만 보고 자르면 *잘라 낸 줄 알고 전문을 내보낸다.*
 *
 *   더 무서운 것은 **나중에 늘어나는 칸**이다. 노드에 새 내용 칸이 하나
 *   붙는 날, 지울 목록(blocklist)에 그것을 더하는 것을 잊으면 아무도
 *   모르는 채 샌다. 남길 목록으로 두면 **모르는 칸은 기본이 '안 내보낸다'**
 *   가 된다 — 틀렸을 때 손해가 작은 쪽으로 기울여 둔다.
 *
 * 남긴다   노드 글자 · 색 · 모양 · 레이아웃 · 형제 순서
 * 지운다   depth 아래 전부 · 모든 노트 · 첨부 · 링크 · 사진
 * 숫자만   전체 노드 수 · 최대 깊이 · 첨부/노트/사진 개수 (여기서 센다)
 */

/** 미리보기에 함께 내보내는 **숫자** — 27b §8.2 의 "166 노드 · 최대 7단계" */
export interface PreviewStats {
  /** 자르기 **전**의 전체 노드 수 (중심 포함) */
  nodeCount: number;
  /** 중심을 1 로 센 최대 깊이 */
  maxDepth: number;
  /** 첨부 개수 (전체) */
  attachmentCount: number;
  /** 노트 블록 개수 (전체) */
  noteCount: number;
  /** 사진 개수 (노드 사진 + 인라인 사진, 전체) */
  imageCount: number;
  /** 잘라 내 보이지 않는 노드 수 = nodeCount − (미리보기에 남은 수) */
  hiddenCount: number;
}

export interface TrimResult {
  /** 잘라 낸 문서 — 원본을 건드리지 않은 **새 객체** */
  doc: unknown;
  stats: PreviewStats;
}

/**
 * 노드에서 **남기는** 칸. 여기에 없는 칸은 전부 떨어진다.
 *
 * `children` 은 따로 다시 세운다(여기 넣지 않는다 — 넣으면 통째로 복사돼
 * 자르기가 무의미해진다).
 */
const KEEP_NODE_KEYS = [
  'id', 'text',
  'textAlign', 'layoutType', 'edgeType',
  'colorKey', 'side',
  'icon', 'iconSide',
  'tag', 'tags',
  'mdForm',
  'style',
  'sizeW', 'sizeH',
] as const;

/**
 * 맵에서 남기는 칸. `settings` 는 글꼴·레벨 레이아웃이라 **겉모습**이다.
 * `root`·`branches`·`centers` 는 따로 세운다.
 */
const KEEP_MAP_KEYS = ['title', 'settings'] as const;

type Dict = Record<string, unknown>;

const isDict = (v: unknown): v is Dict =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const childrenOf = (n: Dict): Dict[] =>
  Array.isArray(n.children) ? n.children.filter(isDict) : [];

/** 센다 — **자르기 전** 원본에서. 미리보기에 적을 숫자다 */
function measure(nodes: Dict[], depth: number, acc: PreviewStats): void {
  for (const n of nodes) {
    acc.nodeCount += 1;
    if (depth > acc.maxDepth) acc.maxDepth = depth;
    if (Array.isArray(n.attachments)) acc.attachmentCount += n.attachments.length;
    if (Array.isArray(n.notes)) acc.noteCount += n.notes.length;
    if (isDict(n.image)) acc.imageCount += 1;
    if (Array.isArray(n.images)) acc.imageCount += n.images.length;
    measure(childrenOf(n), depth + 1, acc);
  }
}

/** 남길 칸만 옮긴다. `depth` 가 한계면 자식을 아예 달지 않는다 */
function keepNode(n: Dict, depth: number, limit: number): Dict {
  const out: Dict = {};
  for (const k of KEEP_NODE_KEYS) {
    if (n[k] !== undefined) out[k] = n[k];
  }
  if (depth < limit) {
    const kids = childrenOf(n).map((c) => keepNode(c, depth + 1, limit));
    if (kids.length) out.children = kids;
  }
  return out;
}

/** 이 미리보기에 실제로 남은 노드 수 */
function countKept(nodes: Dict[]): number {
  return nodes.reduce((s, n) => s + 1 + countKept(childrenOf(n)), 0);
}

function trimCenter(center: Dict, limit: number): Dict {
  const out: Dict = {};
  // 깊이 d 의 노드는 `d <= limit` 일 때만 남는다 — 중심이 1, 가지가 2 다.
  // (`keepNode` 는 **남기기로 정한** 노드만 받는다)
  if (limit >= 1 && isDict(center.root)) out.root = keepNode(center.root, 1, limit);
  if (Array.isArray(center.branches)) {
    out.branches = limit >= 2
      ? center.branches.filter(isDict).map((b) => keepNode(b, 2, limit))
      : [];
  }
  // 중심의 자리(dx·dy)는 배치라 남긴다 — 내용이 아니다
  if (isDict(center.pos)) out.pos = center.pos;
  return out;
}

/**
 * @param doc    저장된 문서 — `{ map, editor }` 또는 맵 그 자체
 * @param limit  남길 깊이. **중심이 1**, 1레벨 가지가 2, 그 자식이 3 이다.
 *               기본 2 = "중심 + 1레벨 가지" (27b §8.2 의 '목차 2레벨까지')
 *
 * 문서 모양이 아니면(깨진 문서·null) **빈 미리보기**를 돌려준다 — 던지지
 * 않는다. 여기서 던지면 유료 맵의 공개 페이지가 500 이 되고, 그것은
 * "못 자른 채 열리는 것" 다음으로 나쁜 결과다.
 */
export function trimForPreview(doc: unknown, limit = 2): TrimResult {
  const stats: PreviewStats = {
    nodeCount: 0, maxDepth: 0, attachmentCount: 0,
    noteCount: 0, imageCount: 0, hiddenCount: 0,
  };
  if (!isDict(doc)) return { doc: null, stats };

  // `{ map, editor }` 래퍼인가, 맵 그 자체인가
  const wrapped = isDict(doc.map);
  const map = wrapped ? (doc.map as Dict) : doc;

  // ── 센다 (자르기 전 원본) ────────────────────────────────
  const allCenters: Dict[] = [];
  if (isDict(map.root) || Array.isArray(map.branches)) allCenters.push(map);
  if (Array.isArray(map.centers)) allCenters.push(...map.centers.filter(isDict));
  for (const c of allCenters) {
    if (isDict(c.root)) measure([c.root], 1, stats);
    // 가지는 중심의 자식이므로 깊이 2 부터다 (중심이 1)
    if (Array.isArray(c.branches)) measure(c.branches.filter(isDict), 2, stats);
  }

  // ── 자른다 ───────────────────────────────────────────────
  const outMap: Dict = {};
  for (const k of KEEP_MAP_KEYS) {
    if (map[k] !== undefined) outMap[k] = map[k];
  }
  const first = trimCenter(map, limit);
  if (first.root !== undefined) outMap.root = first.root;
  outMap.branches = (first.branches as Dict[] | undefined) ?? [];
  if (Array.isArray(map.centers) && map.centers.length) {
    outMap.centers = map.centers.filter(isDict).map((c) => trimCenter(c, limit));
  }

  // 남은 수 = 각 중심의 root 1 + 그 아래
  let kept = 0;
  const countCenter = (c: Dict) => {
    if (isDict(c.root)) kept += 1 + countKept(childrenOf(c.root));
    if (Array.isArray(c.branches)) kept += countKept(c.branches.filter(isDict));
  };
  countCenter(outMap);
  if (Array.isArray(outMap.centers)) outMap.centers.filter(isDict).forEach(countCenter);
  stats.hiddenCount = Math.max(0, stats.nodeCount - kept);

  // `editor`(레이아웃·간격)는 **겉모습**이라 그대로 간다 — 내용이 없다.
  // 다만 문서 래퍼의 다른 칸은 옮기지 않는다 (남길 목록과 같은 이유).
  const outDoc: Dict = wrapped
    ? { map: outMap, ...(isDict(doc.editor) ? { editor: doc.editor } : {}) }
    : outMap;

  return { doc: outDoc, stats };
}
