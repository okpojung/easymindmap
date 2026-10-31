// 마크다운 첨부를 여는 웹 편집기 주소 (2026-10-31).
//
// 편집기는 `public/md-editor/index.html`(okpojung/markdown-editor 사본) —
// 앱과 **같은 origin** 의 `/md-editor/` 로 서빙된다. 편집기는 쿼리로
// 어느 첨부(`att`)를 어느 API(`api`)에서 읽을지 받고, 저장은
// `PUT /v1/attachments/:id/content` 로 한다 (public/md-editor/README.md).
//
// ★ **토큰은 쿼리에 넣지 않는다 — 해시(`#t=`)에만.** 쿼리는 서버 접근
//   로그·Referer 로 새어 나가지만 해시는 브라우저 밖으로 나가지 않는다.
//   편집기는 같은 origin 이라 localStorage `emm.auth` 를 먼저 읽고, 없을
//   때만 `#t=` 를 쓴다.
//
// 이 파일은 env 를 읽지 않는 순수 함수만 둔다 — tsx 로 바로 시험한다
// (mdEditorUrl.test.ts).

const MD_EXT = /\.(md|markdown)$/i;

/** .md / .markdown 첨부인가 (아이콘·열기 분기 공통) */
export function isMarkdownName(name: string | undefined): boolean {
  return MD_EXT.test((name ?? '').trim());
}

export const MD_EDITOR_PATH = '/md-editor/';

/** 편집기가 저장한 뒤 opener 로 보내는 메시지 */
export const MD_SAVED_MESSAGE = 'mde:attachment-saved';

export function mdEditorUrl(opts: {
  /** 서버 첨부 id (`/v1/attachments/{id}`) */
  att: string;
  /** apiClient 가 쓰는 API 베이스 (예: https://api-dev.mindmap.ai.kr) */
  api: string;
  /** 파일 이름 — 편집기 제목·내려받기 이름 */
  name: string;
  /** 액세스 토큰 — 해시에만 붙는다. 없으면(dev 인증) 해시도 없다 */
  token?: string | null;
}): string {
  const q = `att=${encodeURIComponent(opts.att)}`
    + `&api=${encodeURIComponent(opts.api.replace(/\/+$/, ''))}`
    + `&name=${encodeURIComponent(opts.name)}`;
  const hash = opts.token ? `#t=${encodeURIComponent(opts.token)}` : '';
  return `${MD_EDITOR_PATH}?${q}${hash}`;
}
