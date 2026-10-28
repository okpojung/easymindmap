import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { API_URL } from '../config';
import { boardAttachmentId, safeLinkHref } from '../community-rules';
import type { Attachment } from '../community-api';
import { pageText } from '../i18n/pages';

const T = pageText().board;

/**
 * 게시판 글 본문(Markdown, 계약 v0.4 §2).
 * - HTML 원문은 그리지 않는다(skipHtml). React 요소로만 만들므로 innerHTML 이 없다.
 * - 링크는 http(s)·mailto 만, 새 창 + noopener noreferrer nofollow.
 * - 사진은 같은 API 의 게시판 첨부 주소만 <img>. 다른 주소의 사진은 링크로만 보인다.
 */
export function BoardMarkdown({ body, attachments }: { body: string; attachments: Attachment[] }) {
  const sizes = new Map(attachments.map(a => [a.id, a]));
  return (
    <div className="cm-md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
          a: ({ href, children }) => {
            const safe = safeLinkHref(href);
            return safe
              ? <a href={safe} target="_blank" rel="noopener noreferrer nofollow">{children}</a>
              : <span>{children}</span>;
          },
          img: ({ src, alt }) => {
            const id = boardAttachmentId(src, API_URL);
            if (id) {
              const meta = sizes.get(id);
              return <img src={src} alt={alt ?? ''} loading="lazy" width={meta?.width} height={meta?.height} />;
            }
            const safe = safeLinkHref(src);
            return safe
              ? <a href={safe} target="_blank" rel="noopener noreferrer nofollow">{alt || T.externalPhoto} ↗</a>
              : <span>{alt}</span>;
          },
          input: ({ type, checked }) => (type === 'checkbox' ? <input type="checkbox" checked={!!checked} disabled readOnly /> : null),
        }}
      >{body}</ReactMarkdown>
    </div>
  );
}

/** 본문에서 쓰지 않은 첨부 id — 본문에 넣지 않은 사진이 있으면 아래에 따로 보여 준다 */
export function unusedAttachments(body: string, attachments: Attachment[]) {
  return attachments.filter(a => !body.includes(a.id));
}
