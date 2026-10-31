# md-editor — 마크다운 첨부 웹 편집기 (외부 사본)

이 폴더의 `index.html` 은 **외부 저장소의 파일을 그대로 복사한 것**이다.
**여기서 고치지 않는다** — 고칠 것은 원본 저장소에서 고치고 아래 방법으로
다시 가져온다(두 벌이 갈라지면 어느 쪽이 진짜인지 알 수 없게 된다).

| 항목 | 값 |
|---|---|
| 출처 저장소 | <https://github.com/okpojung/markdown-editor> |
| 파일 | `index.html` (단일 파일 편집기) |
| 커밋 | `38d2f32750fd117ffd283ee21ef7689a8d6be0b8` |
| sha256 | `c56da07a02609e51bcc2301f510f750c95ef4b7517f05f5ec6cffcc898dc834f` |
| 라이선스 | MIT — 아래 고지 |

## 어떻게 서빙되나

Vite 는 `public/` 을 빌드 결과(`dist/`) 루트로 그대로 복사한다. 그래서
`dist/md-editor/index.html` 이 되고, nginx 의 `try_files $uri $uri/ …` 가
`https://<프런트>/md-editor/` 요청에 이 파일을 내보낸다. 앱과 **같은 origin** 이다.

앱은 서버 첨부(`/v1/attachments/{id}`) 중 `.md`/`.markdown` 을 이렇게 연다
(`src/utils/openAttachment.ts` · `src/utils/mdEditorUrl.ts`).

```
/md-editor/?att=<첨부 id>&api=<API 베이스>&name=<파일 이름>#t=<액세스 토큰>
```

- 토큰은 **해시(`#t=`)에만** 붙는다 — 쿼리는 접근 로그·Referer 로 새어 나간다.
- 편집기는 같은 origin 의 localStorage `emm.auth` 에서 토큰을 먼저 읽고, 없을
  때만 `#t=` 를 쓴다(앱이 갱신해 둔 최신 토큰을 쓰려는 것이다).
- 읽기 `GET /v1/attachments/:id`(Bearer), 저장 `PUT /v1/attachments/:id/content`
  (Bearer · 원문 바디 · `If-Match: "sha256:<hex>"` — 409 면 덮어쓸지 묻는다).
- 저장하면 opener 로 `postMessage({type:"mde:attachment-saved", att, sizeBytes}, origin)`
  를 보내고, 앱은 그 첨부의 `size` 를 고친다(상태바 첨부 용량).

편집 부품(Toast UI Editor·CodeMirror·Mermaid)은 **jsDelivr CDN** 에서 받는다.
CDN 을 못 쓰는 환경에서는 편집기가 원문 텍스트 상자로 물러난다(편집기 자체 동작).

## 갱신 방법

```bash
SHA=<가져올 커밋 40자리>
curl -fsSL -o apps/frontend/public/md-editor/index.html \
  "https://raw.githubusercontent.com/okpojung/markdown-editor/$SHA/index.html"
sha256sum apps/frontend/public/md-editor/index.html
```

`raw.githubusercontent.com` 이 막힌 환경이면 git 으로 같은 커밋을 받는다.

```bash
git init -q /tmp/mde && git -C /tmp/mde fetch -q --depth 1 https://github.com/okpojung/markdown-editor "$SHA" \
  && git -C /tmp/mde show FETCH_HEAD:index.html > apps/frontend/public/md-editor/index.html
```

그다음 위 표의 **커밋·sha256** 을 고치고, 편집기의 계약(쿼리 이름·저장 경로·
메시지 이름)이 바뀌었으면 `src/utils/mdEditorUrl.ts` 와
`docs/04-extensions/attachment-storage.md` §7.4 도 함께 고친다.

## MIT 라이선스 고지

```
MIT License

Copyright (c) 2026 okpojung

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
