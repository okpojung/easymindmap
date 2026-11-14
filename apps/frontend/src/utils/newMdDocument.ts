/** Shared by sidebar and floating menu: node label -> unique editable Markdown document. */
export function mdNameFromNodeText(text: string, max = 10): string {
  const clean = text.replace(/[\\/:*?"<>|#\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().replace(/^\.+/, '');
  return Array.from(clean).slice(0, max).join('').trim();
}

export function newMdDocument(nodeText: string, names: readonly string[], untitled: string) {
  const first = nodeText.split('\n').map((s) => s.trim()).find(Boolean) ?? '';
  const base = mdNameFromNodeText(first) || untitled;
  const taken = new Set(names.map((s) => s.toLowerCase()));
  let name = base + '.md';
  for (let i = 2; taken.has(name.toLowerCase()); i++) name = base + ' (' + i + ').md';
  return { name, markdown: '# ' + (first || base) + '\n\n' };
}
