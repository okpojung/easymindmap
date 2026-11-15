// 아웃라인 드래그 — 문구 (i18n 파일은 이 작업 범위 밖이라 여기서 ko/en 만 둔다)
const ko = typeof document !== 'undefined' && (document.documentElement.lang || '').startsWith('ko');
export const outlineDropCopy = {
  handle: ko ? '끌어서 이동 (바로 위 행의 하위로 들어갑니다)' : 'Drag to move (becomes a child of the row above the line)',
  target: (name: string) => (ko ? `→ “${name}”의 하위` : `→ child of “${name}”`),
  failed: ko ? '여기로는 옮길 수 없습니다 (깊이 제한 등)' : 'Cannot move here (depth limit, etc.)',
};
