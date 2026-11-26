// HTML 뷰어용 아이콘 — 앱의 아이콘(@/components/icons)을 **그대로** SVG 문자열로 굽는다
// (2026-11-27 "뷰어 아이콘·배치를 앱과 같게"). 뷰어는 React 없이 도는 단독 파일이라
// 컴포넌트를 부를 수 없다 — 내보낼 때 아이콘 요소 트리를 문자열로 옮겨 싣는다.
import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { I } from '@/components/icons';

const ATTR: Record<string, string> = {
  className: 'class', strokeWidth: 'stroke-width', strokeLinecap: 'stroke-linecap',
  strokeLinejoin: 'stroke-linejoin', fillRule: 'fill-rule', clipRule: 'clip-rule',
  strokeDasharray: 'stroke-dasharray', fillOpacity: 'fill-opacity', strokeOpacity: 'stroke-opacity',
  textAnchor: 'text-anchor', fontSize: 'font-size', fontWeight: 'font-weight', viewBox: 'viewBox',
};
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** React 요소(아이콘)를 정적 SVG/XML 문자열로. 함수 컴포넌트는 불러서 펼친다. */
export function elementToSvg(node: ReactNode): string {
  if (node == null || node === false || node === true) return '';
  if (typeof node === 'string' || typeof node === 'number') return esc(String(node));
  if (Array.isArray(node)) return node.map(elementToSvg).join('');
  if (!isValidElement(node)) return '';
  const el = node as ReactElement<Record<string, unknown>>;
  if (typeof el.type === 'function') {
    return elementToSvg((el.type as (p: unknown) => ReactNode)(el.props));
  }
  if (typeof el.type !== 'string') return elementToSvg(el.props.children as ReactNode);
  let attrs = '';
  for (const [k, v] of Object.entries(el.props)) {
    if (k === 'children' || k === 'style' || k === 'key' || k === 'ref' || v == null || v === false) continue;
    if (typeof v === 'function' || typeof v === 'object') continue;
    attrs += ` ${ATTR[k] ?? k}="${esc(String(v))}"`;
  }
  if (el.type === 'svg') attrs += ' aria-hidden="true" focusable="false"';
  return `<${el.type}${attrs}>${elementToSvg(el.props.children as ReactNode)}</${el.type}>`;
}

type IconFn = (p?: { size?: number; strokeWidth?: number }) => ReactNode;
const icon = (fn: IconFn, size: number, strokeWidth?: number) =>
  elementToSvg(fn(strokeWidth == null ? { size } : { size, strokeWidth }));

/** 분할 보기 — 앱 TopToolbar 의 인라인 그림과 같다 */
const SPLIT_SVG = '<svg width="22" height="22" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true" focusable="false"><rect x="2" y="3" width="16" height="14" rx="2"/><path d="M9 3v14M4.5 7h2M4.5 10h2M4.5 13h2M12 8h3M12 12h3"/></svg>';
/** 미니맵 핀 — 앱 Minimap 의 인라인 그림과 같다 */
const PIN_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true" focusable="false"><path d="M8 3h8l-1 6 4 4v2H5v-2l4-4-1-6ZM12 15v7"/></svg>';

/** 뷰어가 쓰는 아이콘 전부 — 크기·굵기는 앱의 같은 자리 단추와 같다 */
export function viewerIcons(): Record<string, string> {
  const X = I as unknown as Record<string, IconFn>;
  return {
    // 상단 — 보기 묶음 (앱 TopToolbar: 22px)
    outline: icon(X.Outline, 22), mindmap: icon(X.MindMap, 22), split: SPLIT_SVG,
    moon: icon(X.Moon, 22), sun: icon(X.Sun, 22),
    // 상단 — 목록 묶음 (앱 왼쪽 레일: 21px, MD 는 글자)
    link: icon(X.Link, 21), attach: icon(X.Paperclip, 21), note: icon(X.Note, 21),
    // 상단 — 펼치기/접기
    expandAll: icon(X.BranchExpand, 21), collapseAll: icon(X.BranchCollapse, 21),
    search: icon(X.Search, 20, 2),
    // 하단 — 확대/축소·미니맵 (앱 BottomStatusBar: 21px, 2.2)
    minus: icon(X.Minus, 21, 2.2), plus: icon(X.Plus, 21, 2.2), minimap: icon(X.Minimap, 21, 2),
    // 하단 — 화면 단추 (앱 CanvasViewButtons)
    hand: icon(X.Hand, 21, 2), focus: icon(X.Focus, 20, 2), focusOff: icon(X.FocusOff, 20, 2),
    fit: icon(X.FitMap, 20, 2), fsEnter: icon(X.Expand, 20, 2), fsExit: icon(X.Shrink, 20, 2),
    pin: PIN_SVG,
  };
}
