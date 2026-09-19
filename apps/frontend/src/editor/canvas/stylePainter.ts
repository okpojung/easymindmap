// 스타일 복사(붓) — 한 노드의 **겉모습만** 다른 노드에 옮기는 순수 함수
// (2026-09-19 사용자 요청). 캔버스 우상단 툴바의 붓 버튼 → 커서 옆 붓
// 아이콘 → 노드 클릭/러버밴드로 칠한다. 사양: docs/03-editor-core/node/
// 05-node-style.md §20.
//
// 무엇을 옮기나 — 사용자가 말한 "도형·배경색·글자맞춤·글자색 등, 내용을
// 뺀 스타일":
//   · `style`      도형·채움/테두리/글자색·테두리 굵기/선·굵게/기울임/취소선/
//                  밑줄/형광펜. **통째로 바꾼다**(합치지 않는다) — 원본에 없는
//                  항목은 대상에서도 지워져 원본과 같은 겉모습이 된다.
//                  단 `fontSize` 는 옮기지 않는다: 스타일 탭에 크기 조절이
//                  없고 레벨 기본값(`inheritStyle`)으로만 정해지므로, 다른
//                  레벨로 옮기면 그 레벨답지 않은 크기가 된다.
//   · `textAlign`  글자맞춤 (원본에 없으면 대상에서도 지운다 = 레벨 기본).
//   · `colorKey`   가지 색 계열 — 명시 색이 없는 노드의 채움/테두리/글자색은
//                  여기서 나온다(`resolveNodeColors`). 원본이 중심주제
//                  (`'root'`)면 옮기지 않고, 대상이 중심주제면 덮지 않는다.
//                  ★ 원본에 colorKey 가 **없으면 레벨 기본 계열을 채워 넣는다**
//                  (1레벨 `l1A`, 2레벨 이하 `l2` = 흰 바탕) — 그래야 "흰
//                  노드"를 떠서 색 가지에 칠했을 때 정말 흰색이 된다
//                  (2026-09-19 사용자 보고: "배경색이 흰색은 적용이 안 된다").
//                  기본 흰색은 명시 색이 아니라 colorKey 부재 + 깊이에서 나오는
//                  값이라, 그대로 두면 대상의 가지 색이 남았다.
// 옮기지 않는 것 — 글(`text`)·노트·링크·첨부·사진·태그·아이콘·체크·크기
// (`sizeW/H`)·배치(`layoutType`)·접힘·잠금. 아이콘은 "내용"에 가깝고,
// 크기는 글 길이에 딸린 것이라 뺐다.

import type { MindNode, NodeColorKey, NodeStyle, SampleRoot, TextAlign } from '@emm/model';

export interface StyleSnapshot {
  style?: NodeStyle;
  textAlign?: TextAlign;
  colorKey?: NodeColorKey;
}

type Styled = Pick<MindNode, 'style' | 'textAlign' | 'colorKey'> | Pick<SampleRoot, 'style' | 'textAlign' | 'colorKey'>;

/**
 * 원본 노드에서 옮길 겉모습만 떠 둔다 (버튼을 누른 순간의 값 — 그 뒤 원본이
 * 바뀌어도 붓은 그대로). `depth` 는 원본의 깊이(0 = 중심주제, 1 = 가지, …):
 * colorKey 가 없는 노드의 **보이는** 색 계열을 채우는 데 쓴다.
 */
export function snapshotNodeStyle(n: Styled, depth?: number): StyleSnapshot {
  const snap: StyleSnapshot = {};
  if (n.style) {
    const { fontSize: _fontSize, ...rest } = n.style;
    const keys = Object.keys(rest).filter((k) => rest[k as keyof typeof rest] !== undefined);
    if (keys.length) snap.style = { ...rest };
  }
  if (n.textAlign) snap.textAlign = n.textAlign;
  if (n.colorKey && n.colorKey !== 'root') snap.colorKey = n.colorKey;
  else if (!n.colorKey && depth !== undefined && depth >= 1) snap.colorKey = depth === 1 ? 'l1A' : 'l2';
  return snap;
}

/** 떠 둔 겉모습을 한 노드에 입힌다. 새 객체를 돌려주고 원본은 건드리지 않는다. */
export function applyStyleSnapshot<T extends Styled>(n: T, snap: StyleSnapshot): T {
  const out: T = { ...n };
  // fontSize 는 대상 것을 지킨다 (레벨 기본값)
  const keepSize = n.style?.fontSize;
  const nextStyle: NodeStyle | undefined = snap.style
    ? { ...snap.style, ...(keepSize !== undefined ? { fontSize: keepSize } : {}) }
    : (keepSize !== undefined ? { fontSize: keepSize } : undefined);
  if (nextStyle) out.style = nextStyle; else delete out.style;
  if (snap.textAlign) out.textAlign = snap.textAlign; else delete out.textAlign;
  if (snap.colorKey && n.colorKey !== 'root') out.colorKey = snap.colorKey;
  return out;
}

/** 붓에 든 것이 하나도 없으면(원본이 기본 모습) — 그래도 칠하면 대상이 기본 모습으로 돌아간다. 안내용. */
export function snapshotIsEmpty(snap: StyleSnapshot): boolean {
  return !snap.style && !snap.textAlign && !snap.colorKey;
}
