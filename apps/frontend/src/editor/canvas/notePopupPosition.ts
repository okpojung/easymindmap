export interface Box { left: number; top: number; width: number; height: number }
export function placeNotePopup(node: Box | null, bounds: Box, preferred = { width: 640, height: 480 }): Box {
  const gap = 18, pad = 12;
  const x = bounds.left + pad, y = bounds.top + pad;
  const w = Math.max(120, bounds.width - pad * 2), h = Math.max(100, bounds.height - pad * 2);
  if (node) {
    const regions = [
      { left: Math.max(x, node.left + node.width + gap), top: y, width: x + w - (node.left + node.width + gap), height: h },
      { left: x, top: y, width: node.left - gap - x, height: h },
      { left: x, top: Math.max(y, node.top + node.height + gap), width: w, height: y + h - (node.top + node.height + gap) },
      { left: x, top: y, width: w, height: node.top - gap - y },
    ].filter((r) => r.width >= Math.min(260, w) && r.height >= Math.min(180, h));
    regions.sort((a, b) => Math.min(b.width, preferred.width) * Math.min(b.height, preferred.height) - Math.min(a.width, preferred.width) * Math.min(a.height, preferred.height));
    if (regions[0]) {
      const r = regions[0], width = Math.min(r.width, preferred.width), height = Math.min(r.height, preferred.height);
      return { left: Math.min(Math.max(node.left + node.width + gap, r.left), r.left + r.width - width), top: Math.min(Math.max(node.top, r.top), r.top + r.height - height), width, height };
    }
  }
  // Very small screens may have no space that can avoid the node. Keep all controls accessible.
  const width = Math.min(w, preferred.width), height = Math.min(h, preferred.height);
  return { left: x + (w - width) / 2, top: y + (h - height) / 2, width, height };
}
