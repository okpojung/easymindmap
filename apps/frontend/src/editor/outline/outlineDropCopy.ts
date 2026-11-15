const words = {
  ko: { handle:'끌어서 이동 (삽입선 바로 위 행의 하위로 이동)', prefix:'하위로 이동', failed:'이 위치로 옮길 수 없습니다 (깊이 제한 등)' },
  en: { handle:'Drag to move (child of the row above the insertion line)', prefix:'Move under', failed:'Cannot move here (depth limit, etc.)' },
  zh: { handle:'拖动以移动（成为插入线上一行的子节点）', prefix:'移至此节点下', failed:'无法移至此处（深度限制等）' },
  ja: { handle:'ドラッグで移動（挿入線の直上の行の子に移動）', prefix:'このノードの下へ移動', failed:'この位置には移動できません（深さ制限など）' },
};
export function outlineDropCopyFor(lang: string) {
  const copy = words[lang as keyof typeof words] ?? words.en;
  return { ...copy, target:(name:string) => `${copy.prefix}: “${name}”` };
}
