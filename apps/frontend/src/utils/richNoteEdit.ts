// richNoteEdit — 리치 노트 문단(사진+서식 붙여넣기)의 **글을 고친 뒤** 처리.
//
// ★ 왜 있나 (2026-09-11 실사용 보고)
//   기사를 노트 문단에 붙여넣으면 `html`(사진+서식)과 `text`(평문)가 같이
//   저장된다. 그 뒤 입력창에서 글자 하나만 쳐도 — Enter 한 번이라도 —
//   `html` 을 통째로 버렸다. 사용자에게는 "사진도 안 들어가고 한 줄로
//   길게 붙는다"로 보였다(뷰어는 `html` 이 없으면 평문을 그대로 그린다).
//
//   글을 고쳤다고 사진까지 버릴 이유는 없다. 글은 새 글로, 사진은 **원래
//   자리(앞에 있던 줄 수)에 다시** 끼운다. 굵게·링크·표 같은 글자 서식은
//   새 글과 맞출 수 없으니 그때는 놓는다 — 사진은 되찾을 수 없지만
//   서식은 다시 붙여넣으면 된다.

import { collectNoteHtmlImageSrcs, rewriteNoteHtmlImages } from '@emm/note-images';
import { richHtmlToText } from './sanitizeRichHtml';

const esc = (s: string) => s
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * 고친 글(`newText`)로 문단을 다시 짜고, 옛 `html` 의 사진을 같은 자리에
 * 끼운다.
 *
 * - 글이 실질적으로 같으면(공백·줄 끝 차이만) 옛 `html` 을 **그대로** —
 *   Enter 한 번에 서식이 날아가지 않는다.
 * - 사진이 없으면 `undefined` — 평문 편집으로 돌아간다 (전과 같다).
 * - 브라우저 밖(DOMParser 없음)에서는 `undefined`.
 */
export function rebuildRichHtml(oldHtml: string, newText: string): string | undefined {
  if (!oldHtml || typeof DOMParser === 'undefined') return undefined;
  const doc = new DOMParser().parseFromString(oldHtml, 'text/html');
  const imgs: { html: string; anchor: number }[] = [];
  const oldText = richHtmlToText(doc.body, (img, anchor) => {
    imgs.push({ html: img.outerHTML, anchor });
  });
  const text = newText.replace(/\r\n?/g, '\n');
  if (text.trim() === oldText.trim()) return oldHtml;
  if (!imgs.length) return undefined;

  const lines = text.split('\n');
  let out = '';
  let k = 0;
  const flush = (upTo: number) => {
    while (k < imgs.length && imgs[k].anchor <= upTo) { out += imgs[k].html; k += 1; }
  };
  for (let i = 0; i < lines.length; i += 1) {
    flush(i);
    if (lines[i].trim()) out += `<p>${esc(lines[i])}</p>`;
  }
  flush(Number.POSITIVE_INFINITY);
  return out;
}

/**
 * `before`→`after` 에서 바뀐 사진 주소를 `target` 에도 적용한다.
 *
 * 사진 내장(서버 보관)은 붙여넣기 뒤 비동기로 끝난다. 그 사이 사용자가
 * 글을 고쳐 `html` 이 달라졌어도, 사진 주소만은 옮겨 준다 — 안 옮기면
 * 기사 원본 주소가 남아 기사가 지워질 때 사진도 사라진다.
 * 사진 수가 다르면(짝을 못 맞추면) `target` 을 그대로 돌려준다.
 */
export function remapImgSrcs(target: string, before: string, after: string): string {
  const a = collectNoteHtmlImageSrcs(before);
  const b = collectNoteHtmlImageSrcs(after);
  if (!a.length || a.length !== b.length) return target;
  const map = new Map<string, string>();
  a.forEach((src, i) => { if (src !== b[i]) map.set(src, b[i]); });
  if (!map.size) return target;
  return rewriteNoteHtmlImages(target, (src) => map.get(src)) ?? target;
}
