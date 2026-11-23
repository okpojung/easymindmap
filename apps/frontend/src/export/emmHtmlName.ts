// EMM 지도 HTML 내보내기 파일명 — `<이름>.emm.html` (MD 에디터의 `.md.html` 과 대응).
// 이미 `.html`/`.htm`/`.emm.html`(대소문자 무관)로 끝나는 이름은 한 번만 벗겨 `x.emm.emm.html` 을 막는다.
export const EMM_HTML_SUFFIX = '.emm.html';

export function emmHtmlFileName(stem: string, fallback = 'mindmap'): string {
  let base = String(stem ?? '').trim().replace(/\.emm\.html?$/i, '').replace(/\.html?$/i, '').replace(/\.emm$/i, '').trim();
  if (!base) base = fallback;
  return base + EMM_HTML_SUFFIX;
}
